# GitHub Pages 上线步骤（学情管理系统）

前提：`base:'./'` 已配置好，GitHub Pages 项目站（`https://<账号>.github.io/<仓库>/`）用相对路径直接可跑，无需改构建。

## 一次性配置（3 步）

### 1. 配置密钥与变量
仓库 **Settings → Secrets and variables → Actions**：

- **Secrets** 里新增：
  - `VITE_SUPABASE_URL` = `https://katproevfecefydjztca.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = 你的 anon key
- **Variables** 里新增：
  - `VITE_SYNC_SCOPE` = `huacheng`（团队码，换组用别的值即可各自独立同步）

### 2. 开启 Pages 发布来源
仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**
（不用新建 `gh-pages` 分支，Workflow 会自动部署）。

### 3. 推代码触发部署
把本项目源码推到 `main` 分支即可，Actions 会自动 build + 发布。
`.github/workflows/deploy-pages.yml` 已备好；也可在 **Actions** 页手动 **Run workflow**。

## 安全模型（现状 · 重要）
- **已接入 Supabase Auth 真实登录**：未登录只能看到登录页；数据访问一律要求登录态。
- `app_state` / `app_members` 的 RLS 均为 **`to authenticated`**：匿名请求被拒绝（401/403），anon key 泄露也无法读写数据。
- 团队隔离靠 **团队码**（`VITE_SYNC_SCOPE` = `app_state.id`），不同团队各占一行互不覆盖。
- 成员角色由 `app_members` 名册控制：管理员可增删成员，成员可读写，未加入者只读；**首个登录账号自动成为管理员**。
- ⚠️ **若线上库是最早那版建表 SQL**（`using (true)` 的 "Allow read/insert/update"），请重新执行 `DEPLOY.md` 第 2 步的 SQL —— 含 `drop policy`，会自动收紧为仅登录可读写。
- 建议在 Supabase → Authentication 关闭「Allow new users to sign up」，账号由管理员后台开通。
- 一定别把 `.env.production` 提交进仓库（已在 `.gitignore` 里排除），**更不要**把 `service_role` key 放进前端。

## 本地预览
```bash
cp .env.example .env.production   # 本地填三个值
npm install
npm run build && npm run preview   # 或 npm run dev
```
