// Supabase Auth（GoTrue）轻封装：邮箱+密码 注册/登录/会话保持/自动刷新。
// 会话存 localStorage，应用进入与否由真实会话驱动；同步请求携带用户 JWT 以通过收紧后的 RLS。

import { BUILD_SUPABASE_KEY, BUILD_SUPABASE_URL } from '@/lib/config';
import { markBackendOffline, markBackendOnline, isTransientBackendFailure, offlineHint } from '@/lib/connectivity';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  /** Unix 秒 */
  expires_at: number;
  email: string;
  user_id: string;
}

const SESSION_KEY = 'xqAuthSession';
/** 剩余寿命低于该秒数时提前刷新，避免请求途中过期 */
const REFRESH_AHEAD_SEC = 300;

function authUrl(path: string): string {
  return `${BUILD_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1${path}`;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: BUILD_SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function persistSession(raw: Record<string, unknown>): AuthSession {
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const session: AuthSession = {
    access_token: String(raw.access_token ?? ''),
    refresh_token: String(raw.refresh_token ?? ''),
    expires_at: Number(raw.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
    email: String(user.email ?? ''),
    user_id: String(user.id ?? ''),
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notifySession(true);
  } catch (e) {
    console.warn('[auth] 会话写入失败，刷新后需重新登录', e);
  }
  return session;
}

export function getCachedSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (!s.access_token || !s.refresh_token) return null;
    return s;
  } catch {
    return null;
  }
}

// 会话变更订阅：clearSession 由"服务端明确拒绝凭证"触发时，
// 必须让界面立刻回到登录页 —— 否则 UI 仍以为已登录，继续用 anon key 重试并持续报错。
type SessionListener = (hasSession: boolean) => void;
const sessionListeners = new Set<SessionListener>();

export function subscribeSession(fn: SessionListener): () => void {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}

function notifySession(hasSession: boolean) {
  sessionListeners.forEach(fn => fn(hasSession));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  notifySession(false);
}

/** 同步读取当前访问令牌（不刷新；请求前请先 ensureFreshToken） */
export function getAccessToken(): string | null {
  return getCachedSession()?.access_token ?? null;
}

export function getSessionEmail(): string | null {
  return getCachedSession()?.email ?? null;
}

async function callGoTrue(path: string, init: RequestInit): Promise<Response> {
  return fetch(authUrl(path), init);
}

/** 登录；返回错误时 message 为可读中文提示 */
export async function signIn(email: string, password: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await callGoTrue('/token?grant_type=password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = String((data as Record<string, unknown>).error_description ?? (data as Record<string, unknown>).msg ?? res.status);
      if (code.includes('Invalid login credentials')) return { ok: false, message: '邮箱或密码不正确' };
      if (code.includes('Email not confirmed')) return { ok: false, message: '邮箱尚未验证，请先到邮箱点确认链接（或让管理员在 Supabase 关闭邮箱验证）' };
      // 5xx/429（含项目被暂停的情形）→ 标记离线，给可读提示而不是抛 HTTP 码
      if (isTransientBackendFailure(res.status)) {
        markBackendOffline(`登录请求失败（HTTP ${res.status}）`);
        return { ok: false, message: `云端暂时不可达（HTTP ${res.status}）：${offlineHint()}。若持续如此，可能是云端项目被暂停，需在后台恢复。` };
      }
      return { ok: false, message: `登录失败：${code}` };
    }
    markBackendOnline();
    persistSession(data as Record<string, unknown>);
    return { ok: true, message: '登录成功' };
  } catch (e) {
    markBackendOffline(e instanceof Error ? e.message : String(e));
    return { ok: false, message: `云端暂时不可达：${offlineHint()}。请稍后重试或检查网络。` };
  }
}

/** 注册（是否需要邮箱验证取决于 Supabase Auth 设置；autoconfirm 开启时直接返回会话） */
export async function signUp(email: string, password: string): Promise<{ ok: boolean; message: string }> {
  if (password.length < 6) return { ok: false, message: '密码至少 6 位' };
  try {
    const res = await callGoTrue('/signup', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = String((data as Record<string, unknown>).error_description ?? (data as Record<string, unknown>).msg ?? res.status);
      if (code.includes('already registered') || code.includes('already been registered')) return { ok: false, message: '该邮箱已注册，请直接登录' };
      if (code.includes('Password should be at least')) return { ok: false, message: '密码至少 6 位' };
      return { ok: false, message: `注册失败：${code}` };
    }
    const raw = data as Record<string, unknown>;
    if (raw.access_token) {
      markBackendOnline();
      persistSession(raw);
      return { ok: true, message: '注册成功，已登录' };
    }
    return { ok: false, message: '注册成功，请先到邮箱点确认链接后再登录' };
  } catch (e) {
    markBackendOffline(e instanceof Error ? e.message : String(e));
    return { ok: false, message: `云端暂时不可达：${offlineHint()}。请稍后重试或检查网络。` };
  }
}

/** 会话临近过期时用 refresh_token 换新令牌 */
// 并发刷新去重（single-flight）：
// 多个请求（同步对账 / 成员刷新）会几乎同时读到"同一份临近过期的会话"，
// 若各自发一次 refresh，Supabase 的 refresh token rotation 会让后到者拿到 invalid_grant，
// 被判定为"凭证失效"→ 清会话 → 用户莫名其妙被登出。
// 因此同一时刻只允许一个刷新在途，其余调用复用同一个 promise。
let refreshInFlight: Promise<string | null> | null = null;

export async function ensureFreshToken(): Promise<string | null> {
  const s = getCachedSession();
  if (!s) return null;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at - now > REFRESH_AHEAD_SEC) return s.access_token;
  if (refreshInFlight) return refreshInFlight;   // 复用进行中的刷新
  refreshInFlight = doRefresh(s).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function doRefresh(s: AuthSession): Promise<string | null> {
  try {
    const res = await callGoTrue('/token?grant_type=refresh_token', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 只有服务端**明确拒绝凭证**才清会话；5xx/429/网关错误属"暂时不可达"，
      // 一律保留本地会话（离线宽限），否则 Supabase 暂停或网络抖动会把用户锁在站外
      const credentialRejected =
        !isTransientBackendFailure(res.status)
        && /invalid_grant|invalid refresh token|refresh_token_not_found|token has been revoked|user_not_found|user_banned/i.test(body);
      if (credentialRejected) {
        clearSession();
        return null;
      }
      markBackendOffline(`登录态续期失败（HTTP ${res.status}）`);
      return s.access_token;
    }
    markBackendOnline();
    const fresh = persistSession(await res.json());
    return fresh.access_token;
  } catch (e) {
    // 网络层异常（DNS/断网/被拦）：同样保留会话
    markBackendOffline(e instanceof Error ? e.message : String(e));
    return getAccessToken();
  }
}

/** 退出登录（尽力通知服务端吊销） */
export async function signOut(): Promise<void> {
  const token = getAccessToken();
  clearSession();
  if (!token) return;
  try {
    await callGoTrue('/logout', { method: 'POST', headers: authHeaders({ Authorization: `Bearer ${token}` }) });
  } catch { /* 本地已清除，忽略 */ }
}
