import { ensureFreshToken } from '@/lib/auth';
import { BUILD_BACKEND, BUILD_SUPABASE_URL } from '@/lib/config';

const endpoint = new URL(`${BUILD_SUPABASE_URL}/essay/review`, window.location.href);
const sameOrigin = BUILD_BACKEND === 'cloudbase' && endpoint.origin === window.location.origin;

export async function isEssayModelAvailable(signal: AbortSignal) {
  if (!sameOrigin) return false;
  const token = await ensureFreshToken();
  if (!token) return false;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  return response.ok && (await response.json()).enabled === true;
}

export async function requestEssayReview(prompt: string, images: string[], signal: AbortSignal): Promise<string> {
  const token = sameOrigin ? await ensureFreshToken() : null;
  if (!token) throw new Error('请重新登录后再试');
  const body = JSON.stringify({ prompt, images });
  if (new Blob([body]).size > 4 * 1024 * 1024) throw new Error('图片总大小过大，请减少图片数量或缩小后再试');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.result !== 'string') {
    throw new Error(data?.message || '在线批改暂不可用，请稍后重试或粘贴批改结果');
  }
  return data.result;
}
