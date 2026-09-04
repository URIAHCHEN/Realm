-- 学情系统 · 权限收紧补丁（第 2 步，跑在 supabase-permissions.sql 之后）
-- 目的：修复 app_state 读策略过宽（原为任意登录用户可读全部行 → 跨团队/越权读、且暴露全体学员数据）。
-- 行为变化：从此“只有名册成员才能读到本团队快照”；未加入名单的登录用户读到的为空（只读且无数据）。

-- 1) 读：仅该 scope 的名册成员可读（is_team_member 已含管理员，因管理员也是名册行）
drop policy if exists "state_read" on app_state;
create policy "state_read" on app_state
  for select using ( is_team_member(id, auth.uid()) );

-- 2) 删：允许该 scope 成员删除自己的快照行（应用正常只做 upsert，不删；此策略主要为运维/测试清理与将来整表重置，
--      同时修复“探针测试遗留行删不掉”的问题）
drop policy if exists "state_delete" on app_state;
create policy "state_delete" on app_state
  for delete using ( is_team_member(id, auth.uid()) );

-- 验证（可交给助手用命令行做）：非名册的登录账号 GET /rest/v1/app_state 应返回 []；
-- 名册成员仍能正常读到自己团队快照。
