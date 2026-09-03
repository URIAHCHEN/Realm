# 上线部署 · 自建 Supabase 共享后端（照做三步）

目标：让封装后的学情网站一打开就连接同一个共享后端，实现多设备 / 多位老师自动同步。
架构：纯静态站（Vite 构建）+ 直连 Supabase REST（无需自建服务器）。

## 第 1 步：建 Supabase 项目（免费）
1. 打开 https://supabase.com ，用邮箱免费注册。
2. New Project，起个名字（如 `xueqing`），设一个数据库密码，区域选就近的（新加坡/东京），创建。

## 第 2 步：建表（执行一次）
进入项目左侧 **SQL Editor**，粘贴并 Run 下面这段（就是应用内置的同一段建表 SQL）：

```sql
-- 学情管理云同步：只需执行一次
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
  for update using (true) with check (true);
```

## 第 3 步：拿到两个值，填入 .env.production
在 **Project Settings → API** 里复制：
- Project URL  → 填 `VITE_SUPABASE_URL`
- anon public key → 填 `VITE_SUPABASE_ANON_KEY`（这个 key 是设计为可公开的，受上面 RLS 约束）

把 `VITE_SYNC_SCOPE` 设成你们团队码（如 `huacheng`），不同团队用不同码即可在同一后端里互不覆盖。

然后重新构建：
```bash
cp .env.example .env.production   # 填入上面三个值
npm run build                     # 产物在 dist/
```
把 `dist/` 任意静态托管（QW Pages / Vercel / Netlify / 对象存储 / 学校服务器 nginx）即可上线。

## 安全说明
- 内置的是 anon key（公开），真正约束来自 RLS；如需更严格，可后续给 app_state 加按 scope 的策略或接入 Supabase Auth 做真实登录（下一阶段）。
- 站点默认登录仍是本地密码门；共享后端只负责"数据同步"，账号体系留到后续增强。
