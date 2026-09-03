// 成员/权限客户端：基于 Supabase REST + 登录用户 JWT 维护 app_members 名册。
// 真权限由服务端 RLS 保证；此处仅读写与自举。scope 与 app_state.id 一致（团队码）。

import { BUILD_SUPABASE_KEY, BUILD_SUPABASE_URL } from '@/lib/config';
import { ensureFreshToken, getCachedSession, getAccessToken } from '@/lib/auth';

export interface Membership { member: boolean; admin: boolean }
export interface MemberRow { user_id: string; email: string | null; is_admin: boolean; created_at?: string }
export interface RosterResult<T> { ok: boolean; data?: T; message: string }

function bearer(): string {
  return getAccessToken() ?? BUILD_SUPABASE_KEY;
}
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: BUILD_SUPABASE_KEY,
    Authorization: `Bearer ${bearer()}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
function url(q: string): string {
  return `${BUILD_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/app_members${q}`;
}

async function msgFrom(res: Response): Promise<string> {
  const t = await res.text().catch(() => '');
  if (res.status === 401 || res.status === 403) return '无权限（未登录或非管理员）';
  if (t.includes('row-level security')) return '无权限（RLS 拒绝）';
  return t || `HTTP ${res.status}`;
}

/** 确保当前用户与名册的关系：首个账号自举为管理员；否则返回其成员身份 */
export async function ensureSelfMembership(scope: string): Promise<RosterResult<Membership>> {
  await ensureFreshToken();
  const me = getCachedSession();
  if (!me?.user_id) return { ok: false, message: '未登录' };
  try {
    // 1) 我的名册行
    const mine = await fetch(url(`?scope=eq.${encodeURIComponent(scope)}&user_id=eq.${me.user_id}&select=is_admin&limit=1`), { headers: headers() });
    if (!mine.ok) return { ok: false, message: await msgFrom(mine) };
    const rows = await mine.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return { ok: true, data: { member: true, admin: !!rows[0].is_admin }, message: 'ok' };
    }
    // 2) 名册是否为空 → 首个账号自举为管理员
    const any = await fetch(url(`?scope=eq.${encodeURIComponent(scope)}&select=user_id&limit=1`), { headers: headers() });
    const anyRows = any.ok ? await any.json() : [];
    if (Array.isArray(anyRows) && anyRows.length === 0) {
      const ins = await fetch(url(''), {
        method: 'POST',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ scope, user_id: me.user_id, email: me.email, is_admin: true }),
      });
      if (!ins.ok) return { ok: false, message: await msgFrom(ins) };
      return { ok: true, data: { member: true, admin: true }, message: '已将首个账号设为管理员' };
    }
    return { ok: true, data: { member: false, admin: false }, message: '尚未被加入可写名单（只读）' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function listMembers(scope: string): Promise<RosterResult<MemberRow[]>> {
  await ensureFreshToken();
  try {
    const res = await fetch(url(`?scope=eq.${encodeURIComponent(scope)}&select=user_id,email,is_admin,created_at&order=created_at.asc`), { headers: headers() });
    if (!res.ok) return { ok: false, message: await msgFrom(res) };
    return { ok: true, data: await res.json(), message: 'ok' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function addMember(scope: string, user_id: string, email: string, is_admin: boolean): Promise<RosterResult<boolean>> {
  await ensureFreshToken();
  try {
    const res = await fetch(url(''), {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ scope, user_id: user_id.trim(), email: email.trim() || null, is_admin }),
    });
    if (!res.ok) return { ok: false, message: await msgFrom(res) };
    return { ok: true, data: true, message: '已添加' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function setMemberAdmin(scope: string, user_id: string, is_admin: boolean): Promise<RosterResult<boolean>> {
  await ensureFreshToken();
  try {
    const res = await fetch(url(`?scope=eq.${encodeURIComponent(scope)}&user_id=eq.${encodeURIComponent(user_id)}`), {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_admin }),
    });
    if (!res.ok) return { ok: false, message: await msgFrom(res) };
    return { ok: true, data: true, message: '已更新' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function removeMember(scope: string, user_id: string): Promise<RosterResult<boolean>> {
  await ensureFreshToken();
  try {
    const res = await fetch(url(`?scope=eq.${encodeURIComponent(scope)}&user_id=eq.${encodeURIComponent(user_id)}`), {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    });
    if (!res.ok) return { ok: false, message: await msgFrom(res) };
    return { ok: true, data: true, message: '已移除' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

/** 当前登录用户ID（供复制给管理员加白名单） */
export function myUserId(): string {
  return getCachedSession()?.user_id ?? '';
}
