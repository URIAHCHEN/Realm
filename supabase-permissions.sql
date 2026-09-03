-- 学情系统 · 真权限（白名单可写 + 首个账号自举管理员）
-- 在 Supabase SQL Editor 执行一次。执行前请先部署带客户端的新版（见交付说明顺序）。

-- 1) 成员名册表：scope(团队码, 与 app_state.id 一致) + 用户 + 是否管理员
create table if not exists app_members (
  scope      text    not null,
  user_id    uuid    not null,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (scope, user_id)
);

-- 2) 安全定义函数（security definer 绕过 RLS，避免策略自引用递归）
create or replace function public.team_has_members(p_scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_members m where m.scope = p_scope);
$$;

create or replace function public.is_team_member(p_scope text, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_members m where m.scope = p_scope and m.user_id = p_uid);
$$;

create or replace function public.is_team_admin(p_scope text, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_members m where m.scope = p_scope and m.user_id = p_uid and m.is_admin);
$$;

-- 3) app_state：读=任意登录用户；写=仅名册内成员（服务端权威）
alter table app_state enable row level security;

drop policy if exists "Allow read"   on app_state;
drop policy if exists "Allow insert" on app_state;
drop policy if exists "Allow update" on app_state;
drop policy if exists "auth read"    on app_state;
drop policy if exists "auth insert"  on app_state;
drop policy if exists "auth update"  on app_state;

create policy "state_read" on app_state
  for select using (auth.role() = 'authenticated');

create policy "state_write" on app_state
  for insert with check (auth.role() = 'authenticated' and is_team_member(id, auth.uid()));

create policy "state_update" on app_state
  for update using (auth.role() = 'authenticated' and is_team_member(id, auth.uid()))
             with check (auth.role() = 'authenticated' and is_team_member(id, auth.uid()));

-- 4) app_members 自身策略
alter table app_members enable row level security;

drop policy if exists "members_select" on app_members;
drop policy if exists "members_insert" on app_members;
drop policy if exists "members_update" on app_members;
drop policy if exists "members_delete" on app_members;

-- 读：登录用户可读名册（客户端据此判断自己是否成员/管理员）
create policy "members_select" on app_members
  for select using (auth.role() = 'authenticated');

-- 插入：三种合法情形
--   (a) 首个账号自举：该 scope 还没有任何成员时，把自己插为 admin
--   (b) 管理员添加他人：请求者是已存在的该 scope 管理员
create policy "members_insert" on app_members
  for insert with check (
    auth.role() = 'authenticated' and (
      ( user_id = auth.uid() and is_admin and not team_has_members(scope) )
      or is_team_admin(scope, auth.uid())
    )
  );

-- 更新（提升/降级）：仅该 scope 管理员
create policy "members_update" on app_members
  for update using (is_team_admin(scope, auth.uid()))
             with check (is_team_admin(scope, auth.uid()));

-- 删除（移除成员）：仅该 scope 管理员
create policy "members_delete" on app_members
  for delete using (is_team_admin(scope, auth.uid()));

-- 完成。之后：任何登录用户可只读；第一个注册账号自动成为管理员，
-- 由管理员在“同步中心 → 成员管理”里按用户ID添加可写成员。
