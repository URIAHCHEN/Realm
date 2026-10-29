// 云端同步模块：基于 Supabase REST API（fetch 直连，无需 SDK）
// 数据表结构见 CloudSyncPanel 中的建表 SQL，单表按「作用域」存多行快照

import { BUILD_BACKEND, BUILD_ENV_TAG, BUILD_SCOPE, BUILD_SUPABASE_KEY, BUILD_SUPABASE_URL, hasBundledBackend } from '@/lib/config';
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
  /** 待审核版本（协作审核流）：非管理员提交的整版修订，批准前不写入线上数据 */
  pendingVersions?: import('@/lib/pendingReview').PendingVersion[];
  /**
   * 伴学萌宠快照（增量模块）：独立于学情主数据的可选字段。
   * 旧版本客户端不认识该字段，推送时会丢失——读取侧因此只在“云端确实带该字段”时才覆盖本地。
   */
  pet?: import('@/types/pet').PetSnapshot;
}

export interface CloudSyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
  autoSync: boolean;
  /** 作用域 / 团队码：同一张表内以不同主键行隔离，支持多老师共用后端 */
  scope?: string;
  /** 该配置所属的后端环境（BUILD_ENV_TAG），换后端后自动失效 */
  backend?: string;
}

export interface CloudSyncMeta {
  lastPushedAt: number;
  /** 云端实际存储的内容哈希；仅用作云端变更检测 / CAS 基线。 */
  lastPushedHash: string;
  /** 导入迁移后本地快照的基线；旧元数据回退到 lastPushedHash。 */
  lastLocalHash?: string;
  /** 写入时所属的后端环境（BUILD_ENV_TAG）；换后端后旧基线自动作废 */
  backend?: string;
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
    //    但同一浏览器换过后端时（例：ixdf.com 从 Supabase 站切到 CloudBase 站），
    //    旧地址与旧团队码必须丢弃，否则会拿旧 scope 去写新库的行。
    if (raw) {
      const cfg = JSON.parse(raw);
      const sameEnv = cfg.backend ? cfg.backend === BUILD_ENV_TAG :
        BUILD_BACKEND !== 'cloudbase' || normalizeUrl(cfg.supabaseUrl || '') === normalizeUrl(BUILD_SUPABASE_URL);
      if (cfg.supabaseUrl && cfg.supabaseKey && sameEnv) {
        const merged: CloudSyncConfig = { autoSync: true, scope: BUILD_SCOPE, backend: BUILD_ENV_TAG, ...cfg };
        // CloudBase 侧团队码由构建决定：函数的成员名册固定写 scope='main'，
        // 数据行必须同名，否则「谁是管理员」与「写哪一行」对不上，权限形同虚设。
        if (BUILD_BACKEND === 'cloudbase') merged.scope = BUILD_SCOPE;
        return merged;
      }
      if (!sameEnv) console.info('[sync] 检测到后端环境变化，已忽略上一套同步配置');
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
    if (raw) {
      const meta = JSON.parse(raw) as CloudSyncMeta;
      // 换后端后，旧库的基线在新库里毫无意义：带着它去条件更新一张空表，
      // 受影响 0 行会被误判成「云端有他人改动」，数据永远传不上去。
      if (meta.backend && meta.backend !== BUILD_ENV_TAG) {
        console.info('[sync] 后端环境已变化，旧同步基线作废，本次按首次上传处理');
        return { lastPushedAt: 0, lastPushedHash: '', backend: BUILD_ENV_TAG };
      }
      if (!meta.backend) {
        // 未标记的旧基线无法证明属于新后端，CloudBase 迁移时按首次同步处理。
        if (BUILD_BACKEND === 'cloudbase') return { lastPushedAt: 0, lastPushedHash: '', backend: BUILD_ENV_TAG };
        return { ...meta, backend: BUILD_ENV_TAG };
      }
      return meta;
    }
  } catch { /* ignore */ }
  return { lastPushedAt: 0, lastPushedHash: '', backend: BUILD_ENV_TAG };
}

export function saveSyncMeta(meta: CloudSyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...meta, backend: BUILD_ENV_TAG }));
  } catch (e) {
    console.warn('[sync] 同步元信息写入失败', e);
  }
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

// ============ 哈希：判断本地/云端数据是否一致 ============

export function hashSnapshot(snapshot: SyncSnapshot): string {
  const json = JSON.stringify(snapshot, (key, value) => {
    // 哈希域统一：pendingVersions 只存在于"推送体/云端 data"，本地与 meta 哈希不含它。
    // 若不剔除，submit/approve 推送后 cloud.hash 恒 ≠ 本地哈希 → cloudChanged 恒真 →
    // 每 60s 无休止 doPull 覆盖本地正在录入的内容（P0）。
    if (key === 'pendingVersions') return undefined;
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
    // 加超时（2026-10-17）：弱网下请求悬挂会让 pushInFlight 永不复位 →
    // 后续所有推送被静默吞掉，表现为「改动一直不上云」。
    const signal = init.signal ?? (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(15_000)
      : undefined);
    const res = await fetch(url, { ...init, signal });
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

// 浅校验 / 归一化云端快照（2026-10-17）：
// 云端数据可能来自旧版本或被手工改坏，缺 scores / seasons 等字段会在各 .map/.filter 处崩。
// 这里只做类型兜底，不改已有值；异常结构直接视为「无快照」。
function sanitizeSnapshot(raw: unknown): SyncSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const asObj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const classes = asObj(r.classes) as Record<string, unknown>;
  Object.values(classes).forEach(c => {
    const cls = c as Record<string, unknown> | null;
    if (!cls || typeof cls !== 'object') return;
    if (Array.isArray(cls.records)) {
      cls.records = (cls.records as unknown[]).map(rec => {
        const rr = (rec && typeof rec === 'object' ? rec : {}) as Record<string, unknown>;
        return {
          ...rr,
          scores: rr.scores && typeof rr.scores === 'object' ? rr.scores : {},
          seasons: Array.isArray(rr.seasons) ? rr.seasons : [],
        };
      });
    } else {
      cls.records = [];
    }
    if (typeof cls.students === 'undefined' || !Array.isArray(cls.students)) cls.students = [];
    if (!cls.lessonConfigs || typeof cls.lessonConfigs !== 'object') cls.lessonConfigs = {};
  });
  return {
    appConfig: asObj(r.appConfig) as SyncSnapshot['appConfig'],
    classes: classes as SyncSnapshot['classes'],
    nicknames: asObj(r.nicknames) as SyncSnapshot['nicknames'],
    schoolScores: asObj(r.schoolScores) as SyncSnapshot['schoolScores'],
    templates: asObj(r.templates) as SyncSnapshot['templates'],
    pendingVersions: Array.isArray(r.pendingVersions)
      ? r.pendingVersions.filter((item): item is import('@/lib/pendingReview').PendingVersion => {
        if (!item || typeof item !== 'object') return false;
        const pending = item as Record<string, unknown>;
        const snapshot = pending.snapshot as Record<string, unknown> | null;
        return typeof pending.id === 'string' && typeof pending.by === 'string'
          && typeof pending.at === 'number' && Number.isFinite(pending.at)
          && !!snapshot && typeof snapshot === 'object'
          && !!snapshot.classes && typeof snapshot.classes === 'object' && !Array.isArray(snapshot.classes);
      })
      : [],
    // 伴学萌宠：可选增量字段；旧快照没有该字段时保持 undefined
    pet: r.pet && typeof r.pet === 'object' ? (r.pet as SyncSnapshot['pet']) : undefined,
  };
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
    snapshot: sanitizeSnapshot(rows[0].data),
    hash: rows[0].snapshot_hash || '',
    updatedAt: rows[0].updated_at || '',
  };
}

// 推送本地快照到云端（无条件 upsert）
// @deprecated 多端场景请用 pushSnapshotConditional —— 这里的 upsert 不带条件，会覆盖他端改动。
// 目前保留仅供脚本/排障使用，业务代码不再调用（2026-10-17）。
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

// ============ 条件推送（真正的 CAS，2026-10-17） ============
//
// 原实现是「先 fetch 比对 hash → 再 upsert」的 check-then-act：
// 两个设备在 fetch 与 push 之间的几毫秒里同时写入，后到者会静默覆盖先到者。
// 现在改为在**写请求本身**带条件（PostgREST filter），由数据库保证原子性：
//   · 云端已有行 + 已知基线 hash → PATCH ?id=eq.<id>&snapshot_hash=eq.<base>
//     受影响 0 行 = 云端已被他端改过 → 冲突，不写
//   · 首次上传（无基线）→ POST 插入；命中主键冲突（409）→ 视为冲突
// 全部走 PostgREST 内置能力，**不需要改表结构或加数据库函数**。
export type PushOutcome =
  | { ok: true }
  | { ok: false; reason: 'conflict' | 'missing' | 'auth' };

export async function pushSnapshotConditional(
  config: CloudSyncConfig,
  snapshot: SyncSnapshot,
  baseHash: string | null,
  baseUpdatedAt?: string,
): Promise<PushOutcome> {
  await ensureFreshToken();
  const hash = hashSnapshot(snapshot);
  const payload = {
    data: snapshot,
    snapshot_hash: hash,
    // 队列不进入内容 hash，因此以 updated_at 作为整行 CAS 的第二个条件。
    // 保证每次写入都推进版本，包含同一毫秒内完成的两次提交。
    updated_at: new Date(Math.max(Date.now(), (Date.parse(baseUpdatedAt || '') || 0) + 1)).toISOString(),
  };

  if (baseHash !== null) {
    // 条件更新：只有云端 hash 仍等于我上次推送的基线时才允许写
    const res = await backendFetch(
      restUrl(config, `?id=eq.${encodeURIComponent(getStateId(config))}&snapshot_hash=eq.${encodeURIComponent(baseHash)}${baseUpdatedAt ? `&updated_at=eq.${encodeURIComponent(baseUpdatedAt)}` : ''}`),
      {
        method: 'PATCH',
        headers: apiHeaders(config, { Prefer: 'return=representation' }),
        body: JSON.stringify(payload),
      }
    );
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (text.includes('does not exist')) return { ok: false, reason: 'missing' };
      throw new Error(`HTTP_${res.status}`);
    }
    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) return { ok: true };

    // 0 行受影响有两种完全不同的原因，而 PostgREST 对它们返回同一个 `200 + []`：
    //   (a) 行在，但 snapshot_hash 已变   → 真冲突，他端推进过，必须让用户选
    //   (b) 行根本不在（新库首次上传 / 行被删）→ 不是冲突，应该插入
    // 早期把 (b) 也当成冲突，结果换后端到空库后数据永远传不上去（表现为
    // 「云端存在他人的新改动，本次上传已暂停」，而云端其实一行都没有）。
    // 这里补一次存在性探测，把 (b) 自动纠正为首次插入。
    const probe = await backendFetch(
      restUrl(config, `?id=eq.${encodeURIComponent(getStateId(config))}&select=id`),
      { headers: apiHeaders(config) }
    );
    if (probe.ok) {
      const exist = await probe.json().catch(() => []);
      if (Array.isArray(exist) && exist.length === 0) {
        return insertSnapshot(config, payload);
      }
    }
    return { ok: false, reason: 'conflict' };
  }

  return insertSnapshot(config, payload);
}

/** 上传主数据时保留最新待审队列；确认保留本地也仍保护读取后出现的并发更新。 */
export async function pushLocalSnapshot(
  config: CloudSyncConfig,
  snapshot: SyncSnapshot,
  baseHash: string | null,
  overwriteConflict = false,
): Promise<PushOutcome> {
  const cloud = await fetchCloudState(config);
  if (cloud.snapshot && !overwriteConflict && cloud.hash !== baseHash) {
    return { ok: false, reason: 'conflict' };
  }
  return pushSnapshotConditional(
    config,
    { ...snapshot, pendingVersions: cloud.snapshot?.pendingVersions || [] },
    cloud.snapshot ? cloud.hash : null,
    cloud.updatedAt,
  );
}

/**
 * 首次写入：插入而不合并——若已存在则由数据库报 409，避免"新设备直接覆盖云端"。
 * 也被上面的「云端无行」自愈路径复用。
 */
async function insertSnapshot(
  config: CloudSyncConfig,
  payload: { data: SyncSnapshot; snapshot_hash: string; updated_at: string },
): Promise<PushOutcome> {
  const res = await backendFetch(restUrl(config, ''), {
    method: 'POST',
    headers: apiHeaders(config, { Prefer: 'return=representation' }),
    body: JSON.stringify({ id: getStateId(config), ...payload }),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
  if (res.status === 409) return { ok: false, reason: 'conflict' };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (text.includes('does not exist')) return { ok: false, reason: 'missing' };
    throw new Error(`HTTP_${res.status}`);
  }
  return { ok: true };
}

// 测试连接：检查网络、密钥、登录态与建表情况
export async function testConnection(config: CloudSyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    // 相对基址（同源 /api）时以当前页面为基准解析，避免误判为格式错误
    new URL(normalizeUrl(config.supabaseUrl), window.location.origin);
  } catch {
    return { ok: false, message: '后端地址格式不正确（应为同源 /api 或完整 URL）' };
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
