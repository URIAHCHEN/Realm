// 找回密码客户端（仅 CloudBase 站）：管理员生成短码 → 用户凭码改密。
// Supabase 站沿用其自带邮件找回，不调用这里。

import { BUILD_SCOPE, BUILD_SUPABASE_URL } from '@/lib/config';
import { getAccessToken } from '@/lib/auth';

export interface ResetResult { ok: boolean; message: string; code?: string; expiresIn?: number }

function base(): string {
  return `${BUILD_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
}

/** 管理员为自己的团队成员生成 8 位重置码（20 分钟内有效） */
export async function issueResetCode(email: string, scope = BUILD_SCOPE): Promise<ResetResult> {
  const token = getAccessToken();
  if (!token) return { ok: false, message: '请先登录管理员账号' };
  if (!email.trim()) return { ok: false, message: '请填写成员邮箱' };
  try {
    const res = await fetch(`${base()}/reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: email.trim().toLowerCase(), scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: String((data as { error_description?: string }).error_description || `HTTP ${res.status}`) };
    return { ok: true, message: '已生成重置码', code: String((data as { code?: string }).code || ''), expiresIn: Number((data as { expires_in?: number }).expires_in || 1200) };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}

/** 用邮箱 + 重置码设置新密码 */
export async function resetPassword(email: string, code: string, password: string): Promise<ResetResult> {
  if (!email.trim()) return { ok: false, message: '请填写邮箱' };
  if (!code.trim()) return { ok: false, message: '请填写重置码' };
  if (password.length < 6) return { ok: false, message: '密码至少 6 位' };
  try {
    const res = await fetch(`${base()}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim().toUpperCase(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: String((data as { error_description?: string }).error_description || `HTTP ${res.status}`) };
    return { ok: true, message: '密码已重置，请用新密码登录' };
  } catch (e) {
    return { ok: false, message: '网络异常：' + (e instanceof Error ? e.message : String(e)) };
  }
}
