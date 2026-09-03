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

## 安全提醒（重要）
- 当前 Supabase 的 `app_state` RLS 是「允许所有读写」，anon key 本就是公开 key，所以任何拿到站点的人理论上都能读写这张表。内部小范围用没问题；一旦对外，建议：
  - 给 `app_state` 加按 `id`(scope) 的行级策略，或
  - 接入 Supabase Auth 真实登录后按用户授权。
- 一定别把 `.env.production` 提交进仓库（已在 `.gitignore` 里排除）。

## 本地预览
```bash
cp .env.example .env.production   # 本地填三个值
npm install
npm run build && npm run preview   # 或 npm run dev
```
