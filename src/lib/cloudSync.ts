// 云端同步模块：基于 Supabase REST API（fetch 直连，无需 SDK）
// 数据表结构见 CloudSyncPanel 中的建表 SQL，单表按「作用域」存多行快照

import { BUILD_SCOPE, BUILD_SUPABASE_KEY, BUILD_SUPABASE_URL, hasBundledBackend } from '@/lib/config';
import { ensureFreshToken, getAccessToken, getCachedSession } from '@/lib/auth';
import { markBackendOffline, markBackendOnline, isTransientBackendFailure } from '@/lib/connectivity';
import type { AppConfig, Class, SchoolScore } from '@/types';
import type { TemplateStore } from '@/lib/templateStore';

// 同步快照：与导出备份格式一致，方便离线/云端互换
export interface SyncSnapshot {
  appConfig: AppConfig;
  classes: { [key: string]: Class };
  nicknames: { [classId: string]: { [studentName: string]: string } };
  schoolScores: { [studentName: string]: SchoolScore[] };
  /** 模板登记表：模板按槽位带时间戳同步，避免整包覆盖导致"部署后模板丢失" */
  templates?: TemplateStore;
}

export interface CloudSyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
  autoSync: boolean;
  /** 作用域 / 团队码：同一张表内以不同主键行隔离，支持多老师共用后端 */
  scope?: string;
}

export interface CloudSyncMeta {
  lastPushedAt: number;
  lastPushedHash: string;
}

export type CloudSyncStatus =
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'readonly'
  | 'error'
  | 'conflict';

const CONFIG_KEY = 'cloudSyncConfig';
const META_KEY = 'cloudSyncMeta';

// ============ 配置读写 ============

export function loadSyncConfig(): CloudSyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    // 1) 用户手动配置优先（便于本地调试 / 切换环境）
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.supabaseUrl && cfg.supabaseKey) {
        return { autoSync: true, scope: BUILD_SCOPE, ...cfg };
      }
    }
    // 2) 站点内置了共享后端：打开即同步，无需用户手填
    if (hasBundledBackend()) {
      return {
        supabaseUrl: BUILD_SUPABASE_URL,
        supabaseKey: BUILD_SUPABASE_KEY,
        autoSync: true,
        scope: BUILD_SCOPE,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** 当前作用域对应的 app_state 主键；默认 main（兼容历史单行数据）。 */
export function getStateId(config: CloudSyncConfig | null): string {
  const raw = (config?.scope ?? BUILD_SCOPE ?? 'main').trim();
  return raw || 'main';
}

export function saveSyncConfig(config: CloudSyncConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[sync] 同步配置写入失败', e);
  }
}

export function clearSyncConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(META_KEY);
}

export function loadSyncMeta(): CloudSyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lastPushedAt: 0, lastPushedHash: '' };
}

export function saveSyncMeta(meta: CloudSyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn('[sync] 同步元信息写入失败', e);
  }
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

// ============ 哈希：判断本地/云端数据是否一致 ============

export function hashSnapshot(snapshot: SyncSnapshot): string {
  const json = JSON.stringify(snapshot, (_key, value) => {
    // 对象键排序，保证哈希稳定
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((acc: Record<string, unknown>, k) => {
          acc[k] = (value as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return value;
  });
  // FNV-1a 32位哈希
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + '-' + json.length.toString(36);
}

// ============ Supabase REST 调用 ============

interface CloudRow {
  id: string;
  data: SyncSnapshot;
  snapshot_hash: string;
  updated_at: string;
}

/**
 * 统一的后端请求入口：网络异常 / 5xx / 429 视为「云端暂时不可达」→ 标记离线；
 * 其余情况（含 401/403 这类"服务可达但无权限"）视为在线。
 */
async function backendFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    // 注意：这里必须用原生 fetch，不能调自身（否则递归）
    const res = await fetch(url, init);
    if (isTransientBackendFailure(res.status)) {
      markBackendOffline(`云端返回 ${res.status}`);
    } else {
      markBackendOnline();
    }
    return res;
  } catch (e) {
    markBackendOffline(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

function apiHeaders(config: CloudSyncConfig, extra: Record<string, string> = {}) {
  // 优先携带登录用户的 JWT（RLS 收紧后 anon 将无法读写），未登录回退 anon key
  const bearer = getAccessToken() ?? config.supabaseKey.trim();
  return {
    apikey: config.supabaseKey.trim(),
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function restUrl(config: CloudSyncConfig, query: string): string {
  return `${normalizeUrl(config.supabaseUrl)}/rest/v1/app_state${query}`;
}

export interface CloudState {
  snapshot: SyncSnapshot | null;
  hash: string;
  updatedAt: string;
}

// 读取云端状态（无数据返回 null）
export async function fetchCloudState(config: CloudSyncConfig): Promise<CloudState> {
  await ensureFreshToken();
  const res = await backendFetch(restUrl(config, `?id=eq.${encodeURIComponent(getStateId(config))}&select=data,snapshot_hash,updated_at`), {
    headers: apiHeaders(config),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('does not exist') || res.status === 404) {
      throw new Error('TABLE_MISSING');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_FAILED');
    }
    throw new Error(`HTTP_${res.status}`);
  }
  const rows: CloudRow[] = await res.json();
  if (!rows || rows.length === 0) {
    return { snapshot: null, hash: '', updatedAt: '' };
  }
  return {
    snapshot: rows[0].data ?? null,
    hash: rows[0].snapshot_hash || '',
    updatedAt: rows[0].updated_at || '',
  };
}

// 推送本地快照到云端（upsert）
export async function pushSnapshot(config: CloudSyncConfig, snapshot: SyncSnapshot): Promise<CloudState> {
  await ensureFreshToken();
  const hash = hashSnapshot(snapshot);
  const res = await backendFetch(restUrl(config, '?on_conflict=id'), {
    method: 'POST',
    headers: apiHeaders(config, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      id: getStateId(config),
      data: snapshot,
      snapshot_hash: hash,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error('AUTH_FAILED');
    if (text.includes('does not exist')) throw new Error('TABLE_MISSING');
    throw new Error(`HTTP_${res.status}`);
  }
  const rows: CloudRow[] = await res.json();
  return {
    snapshot,
    hash,
    updatedAt: rows?.[0]?.updated_at || new Date().toISOString(),
  };
}

// 测试连接：检查网络、密钥、登录态与建表情况
export async function testConnection(config: CloudSyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    new URL(normalizeUrl(config.supabaseUrl));
  } catch {
    return { ok: false, message: 'Project URL 格式不正确，应为 https://xxxx.supabase.co' };
  }
  // 先确保 access token 新鲜：RLS 已收紧为「仅登录可读写」，
  // 用过期 token 探测会被拒，从而误报为密钥错误
  await ensureFreshToken().catch(() => null);
  const signedIn = !!getCachedSession()?.access_token;
  try {
    const res = await backendFetch(restUrl(config, '?select=id&limit=1'), {
      headers: apiHeaders(config),
    });
    if (res.ok) {
      return { ok: true, message: signedIn ? '连接成功，数据表就绪 ✅' : '连接成功（当前未登录，仅能读取公开数据）' };
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      if (!signedIn) {
        return { ok: false, message: '需要登录后才能读写云端：当前权限策略为「仅登录用户可读写」，请先登录再测试' };
      }
      if (text.includes('row-level security') || text.includes('permission')) {
        return { ok: false, message: '已登录但无权访问该云端：请确认 RLS 策略已执行到最新版（to authenticated），且你的账号已在成员名单中' };
      }
      return { ok: false, message: '登录态已失效，请重新登录后再测试连接' };
    }
    if (text.includes('does not exist')) {
      return { ok: false, message: '连接成功，但数据表还未创建，请先在 Supabase SQL Editor 执行建表 SQL' };
    }
    return { ok: false, message: `连接失败（HTTP ${res.status}）` };
  } catch (e) {
    return { ok: false, message: '网络请求失败，请检查 URL 和网络：' + (e instanceof Error ? e.message : String(e)) };
  }
}

// 建表 SQL（供用户复制到 Supabase SQL Editor 执行一次）
// 安全模型：登录（Supabase Auth）后才可读写，匿名请求一律拒绝。
// 幂等：可重复执行；已用过旧「Allow read/insert/update using(true)」版本的库，
// 重跑一次即可自动收紧（会先 drop 旧策略），无需手工删表。
export const SETUP_SQL = `-- 学情管理云同步 · 安全版（幂等，可重复执行）
-- 1) 数据表
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  snapshot_hash text not null default '',
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

-- 收紧：删除历史开放策略，仅登录用户可读写
drop policy if exists "Allow read" on app_state;
drop policy if exists "Allow insert" on app_state;
drop policy if exists "Allow update" on app_state;
drop policy if exists "auth read" on app_state;
drop policy if exists "auth insert" on app_state;
drop policy if exists "auth update" on app_state;

create policy "auth read" on app_state
  for select to authenticated using (true);
create policy "auth insert" on app_state
  for insert to authenticated with check (true);
create policy "auth update" on app_state
  for update to authenticated using (true) with check (true);

-- 2) 成员名册（管理员/成员白名单）
create table if not exists app_members (
  scope text not null,
  user_id uuid not null,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (scope, user_id)
);

alter table app_members enable row level security;

-- 判权辅助函数（SECURITY DEFINER 规避自引用策略递归）
create or replace function public.is_admin_member(p_scope text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from app_members
                 where scope = p_scope and user_id = auth.uid() and is_admin);
$$;

create or replace function public.has_members(p_scope text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from app_members where scope = p_scope);
$$;

drop policy if exists "members read" on app_members;
drop policy if exists "members insert" on app_members;
drop policy if exists "members update" on app_members;
drop policy if exists "members delete" on app_members;

create policy "members read" on app_members
  for select to authenticated using (true);
-- 名册为空时首个账号自举为管理员；此后仅管理员可增删改
create policy "members insert" on app_members
  for insert to authenticated
  with check (not public.has_members(scope) or public.is_admin_member(scope));
create policy "members update" on app_members
  for update to authenticated
  using (public.is_admin_member(scope)) with check (public.is_admin_member(scope));
create policy "members delete" on app_members
  for delete to authenticated using (public.is_admin_member(scope));

-- 3) 建议：账号由团队内部开通，关闭匿名注册
--    项目设置 → Authentication → 关闭 "Allow new users to sign up"（或加邮箱白名单）`;
