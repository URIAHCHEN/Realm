// 云端同步模块：基于 Supabase REST API（fetch 直连，无需 SDK）
// 数据表结构见 CloudSyncPanel 中的建表 SQL，单表按「作用域」存多行快照

import { BUILD_SCOPE, BUILD_SUPABASE_KEY, BUILD_SUPABASE_URL, hasBundledBackend } from '@/lib/config';
import type { AppConfig, Class, SchoolScore } from '@/types';

// 同步快照：与导出备份格式一致，方便离线/云端互换
export interface SyncSnapshot {
  appConfig: AppConfig;
  classes: { [key: string]: Class };
  nicknames: { [classId: string]: { [studentName: string]: string } };
  schoolScores: { [studentName: string]: SchoolScore[] };
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
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
  localStorage.setItem(META_KEY, JSON.stringify(meta));
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

function apiHeaders(config: CloudSyncConfig, extra: Record<string, string> = {}) {
  return {
    apikey: config.supabaseKey.trim(),
    Authorization: `Bearer ${config.supabaseKey.trim()}`,
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
  const res = await fetch(restUrl(config, `?id=eq.${encodeURIComponent(getStateId(config))}&select=data,snapshot_hash,updated_at`), {
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
  const hash = hashSnapshot(snapshot);
  const res = await fetch(restUrl(config, '?on_conflict=id'), {
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

// 测试连接：检查网络、密钥和建表情况
export async function testConnection(config: CloudSyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    new URL(normalizeUrl(config.supabaseUrl));
  } catch {
    return { ok: false, message: 'Project URL 格式不正确，应为 https://xxxx.supabase.co' };
  }
  try {
    const res = await fetch(restUrl(config, '?select=id&limit=1'), {
      headers: apiHeaders(config),
    });
    if (res.ok) {
      return { ok: true, message: '连接成功，数据表就绪 ✅' };
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: '密钥校验失败，请检查 anon key 是否复制完整' };
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
export const SETUP_SQL = `-- 学情管理云同步：只需执行一次
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  snapshot_hash text not null default '',
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

create policy "Allow read" on app_state
  for select using (true);
create policy "Allow insert" on app_state
  for insert with check (true);
create policy "Allow update" on app_state
  for update using (true) with check (true);`;
