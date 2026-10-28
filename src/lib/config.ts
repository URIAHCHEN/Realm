// 部署级（构建时）配置。
//
// 2026-10-28：同一份代码同时服务两个**数据源互相独立**的站点：
//   - CloudBase 站（ixdf.com / 后续 lynn.xdf.cn）：`npm run build:cloudbase`（--mode cloudbase），
//     前端走同源 `/api`，由云函数 realm-api 承担鉴权与数据转发，CloudBase PG 存数据。
//   - GitHub Pages 站：`npm run build`，继续直连 Supabase，数据仍在原 Supabase 项目。
// 只同步代码，不同步数据；改后端相关逻辑时两端都要能编译。

/** 直接读 import.meta.env，便于构建期常量折叠：未选中的后端默认值不会进另一端的产物 */
const BACKEND_FLAG = import.meta.env.VITE_BACKEND as string | undefined;
const API_BASE_ENV = import.meta.env.VITE_API_BASE as string | undefined;
const SUPA_URL_ENV = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SCOPE_ENV = import.meta.env.VITE_SYNC_SCOPE as string | undefined;

/** 后端形态：cloudbase = 同源 /api；supabase = 直连 Supabase REST/Auth */
export const BUILD_BACKEND: 'cloudbase' | 'supabase' =
  BACKEND_FLAG === 'cloudbase' ? 'cloudbase' : 'supabase';

/**
 * 接口基址：
 * - CloudBase 构建 → `/api`（可用 VITE_API_BASE 覆盖）
 * - Pages 构建 → Supabase 项目 URL（anon key 公开、受 RLS 约束，内置安全）
 */
export const BUILD_SUPABASE_URL = BUILD_BACKEND === 'cloudbase'
  ? ((API_BASE_ENV ?? '').trim() || '/api').replace(/\/+$/, '')
  : ((SUPA_URL_ENV ?? '').trim() || 'https://katproevfecefydjztca.supabase.co').replace(/\/+$/, '');

/** 接口 key：CloudBase 侧只作占位（函数不校验），Supabase 侧为 anon key */
export const BUILD_SUPABASE_KEY = BUILD_BACKEND === 'cloudbase'
  ? 'cloudbase'
  : ((SUPA_KEY_ENV ?? '').trim() ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthdHByb2V2ZmVjZWZ5ZGp6dGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDQwMjQsImV4cCI6MjEwMzk4MDAyNH0.V0CEzofd5myEabRAEeTdC-DVv1LDoXfT7vgUlqJ4Xtk');

/**
 * 作用域 / 团队码：在单张 app_state 表内以不同主键行做隔离。
 * 两端可用同一个团队码，因为库本身是分开的。
 */
export const BUILD_SCOPE = ((SCOPE_ENV ?? '').trim()) || 'huacheng';

/** 站点是否已内置共享后端（决定「打开即同步」是否生效） */
export function hasBundledBackend(): boolean {
  return !!BUILD_SUPABASE_URL;
}
