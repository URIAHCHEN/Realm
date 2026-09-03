// 部署级（构建时）配置：通过 .env 里的 VITE_* 注入。
// 目标是让「封装后的在线网站」一打开就连接同一个共享后端，
// 无需每位使用者去「同步中心」手填 URL / Key。
// 运行时用户配置仍可通过云同步面板覆盖（便于调试/切换环境）。

const env = import.meta.env as unknown as Record<string, string | undefined>;

/** 内置默认后端（anon key 本就公开、受 RLS 约束，内置进静态站安全）；VITE_* 可覆盖 */
const DEFAULT_SUPABASE_URL = 'https://katproevfecefydjztca.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthdHByb2V2ZmVjZWZ5ZGp6dGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDQwMjQsImV4cCI6MjEwMzk4MDAyNH0.V0CEzofd5myEabRAEeTdC-DVv1LDoXfT7vgUlqJ4Xtk';
const DEFAULT_SCOPE = 'huacheng';

/** 构建进站点的 Supabase 项目 URL */
export const BUILD_SUPABASE_URL = (env.VITE_SUPABASE_URL ?? DEFAULT_SUPABASE_URL).trim();
/** 构建进站点的 Supabase anon key（可公开、受 RLS 约束） */
export const BUILD_SUPABASE_KEY = (env.VITE_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_KEY).trim();
/**
 * 作用域 / 团队码：在单张 app_state 表内以不同主键行做隔离，
 * 让多位老师 / 多个团队共用一套后端却互不覆盖。默认 huacheng。
 */
export const BUILD_SCOPE = ((env.VITE_SYNC_SCOPE ?? '').trim()) || DEFAULT_SCOPE;

/** 站点是否已内置共享后端（决定「打开即同步」是否生效） */
export function hasBundledBackend(): boolean {
  return !!BUILD_SUPABASE_URL && !!BUILD_SUPABASE_KEY;
}
