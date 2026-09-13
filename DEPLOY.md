# 上线部署 · 自建 Supabase 共享后端（照做三步）

目标：让封装后的学情网站一打开就连接同一个共享后端，实现多设备 / 多位老师自动同步。
架构：纯静态站（Vite 构建）+ 直连 Supabase REST（无需自建服务器）+ **Supabase Auth 登录 + 服务端 RLS 权限**。

## 第 1 步：建 Supabase 项目（免费）
1. 打开 https://supabase.com ，用邮箱免费注册。
2. New Project，起个名字（如 `xueqing`），设一个数据库密码，区域选就近的（新加坡/东京），创建。

## 第 2 步：建表与权限（执行一次）
进入项目左侧 **SQL Editor**，粘贴并 Run 下面这段（**安全版，幂等，可重复执行**；已建过表的库再跑一次即可自动收紧权限）：

```sql
-- 学情管理云同步 · 安全版（幂等，可重复执行）
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
create policy "members insert" on app_members
  for insert to authenticated
  with check (not public.has_members(scope) or public.is_admin_member(scope));
create policy "members update" on app_members
  for update to authenticated
  using (public.is_admin_member(scope)) with check (public.is_admin_member(scope));
create policy "members delete" on app_members
  for delete to authenticated using (public.is_admin_member(scope));
```

> 与应用内「同步中心 → 首次配置三步走」展示的 SQL 完全一致，任选一处复制即可。

**可选加固**：项目设置 → Authentication，关闭「Allow new users to sign up」（账号由管理员在后台开通），避免陌生人自行注册。

## 第 3 步：拿到两个值，填入 .env.production
在 **Project Settings → API** 里复制：
- Project URL  → 填 `VITE_SUPABASE_URL`
- anon public key → 填 `VITE_SUPABASE_ANON_KEY`（这个 key 设计为可公开，真正的权限由上面的 RLS 约束）

把 `VITE_SYNC_SCOPE` 设成你们团队码（如 `huacheng`），不同团队用不同码即可在同一后端里互不覆盖。

然后重新构建：
```bash
cp .env.example .env.production   # 填入上面三个值
npm run build                     # 产物在 dist/
```
把 `dist/` 任意静态托管（GitHub Pages / Vercel / Netlify / 对象存储 / 学校服务器 nginx）即可上线。

## 安全模型（现状）

| 层 | 机制 |
|---|---|
| 身份 | **Supabase Auth 真实登录**（邮箱 + 密码），未登录只能看到登录页 |
| 数据权限 | `app_state` / `app_members` 的 RLS 均为 **`to authenticated`**：匿名请求一律拒绝（401/403） |
| 团队隔离 | 不同团队码（`VITE_SYNC_SCOPE` = `app_state.id`）各占一行，互不覆盖 |
| 角色 | `app_members` 名册三级：管理员（可增删成员）/ 成员（可读写）/ 未加入（只读）；首个登录账号自举为管理员 |
| 密钥 | 仓库内只有 anon key（公开属性）；**切勿**把 `service_role` key 写进任何前端代码或环境变量 |

## 历史版本注意
- 旧版建表 SQL 使用 `using (true)` 的开放策略（"Allow read/insert/update"）。**若线上库仍是最早那版，请重新执行第 2 步的 SQL**——其中包含 `drop policy` 语句，会自动替换为仅登录可读写。
- 旧版本地密码门已被 Supabase Auth 取代；如仍看到旧登录界面，说明浏览器缓存了旧构建，强制刷新即可。

## 本地预览
```bash
cp .env.example .env.production   # 本地填三个值
npm install
npm run build && npm run preview   # 或 npm run dev
```
