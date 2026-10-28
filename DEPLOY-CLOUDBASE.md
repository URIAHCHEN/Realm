# CloudBase 部署记录（腾讯云 · 国内站）

> 2026-10-28 首次部署。与 GitHub Pages（uriahchen.github.io/Realm）并行存在，二者互不影响。

## 环境

| 项 | 值 |
|---|---|
| 环境 ID | `cb-env-chenhongl-221-d0a08260a99` |
| 别名 | `cb-env-chenhongl-221` |
| 地域 | ap-shanghai（国内站） |
| 套餐 | 默认套餐（按量计费 postpaid） |
| 应用名 | `realm`（CloudBase 应用 / 静态托管独立子域名） |
| 访问地址 | https://realm-cb-env-chenhongl-221-d0a08260a99.webapps.tcloudbase.com |
| 版本 | `realm-001`、`realm-002`（两次版本均可回滚） |

## 部署方式

静态站点（Vite 构建产物 `dist/`），本地构建 → 上传 → 远端只做 `tcb hosting deploy . /`，不跑远端 install/build（避免远端注入环境变量失败）。

```bash
cd /Users/uriah/WorkBuddy/projects/realm-repo
set -a && source .env.production && set +a   # 必须：VITE_SUPABASE_* 由构建期注入
npm run build

# 通过 CloudBase MCP 部署（等价动作，含远端参数）
# manageApps(action="deployApp", serviceName="realm", filePath="<项目根>",
#            framework="static", buildPath="dist", installCmd="", buildCmd="")
# 轮询：queryApps(action="getAppVersion", serviceName="realm", buildId="<BuildId>")
```

**为什么本地构建**：`.env.production` 被 `.gitignore` 忽略，只在本地存在；远端构建拿不到变量会把 Supabase 地址打空，表现为「能打开但登录失败」。本地构建最稳。

## 验收结果（2026-10-28）

- 构建状态 `SUCCESS`，HTTP 200
- 首页 CSS 指纹 `index-NDwi-baz.css`，JS `index-DLXv6zoz.js`（与本地 `dist` 一致）
- Playwright 真实浏览器：登录页正常渲染，`#root` innerHTML 13318 字符，无 console error / 无 pageerror
- Supabase 后端存活：`/auth/v1/health` 返回 200（GoTrue v2.197.0）
- 产物已瘦身：清理 `emptyOutDir:false` 累积的 93 个历史 `index-*.js` 后，`dist` 从 78MB / 830 文件降到 2.6MB / 25 文件

## 已知限制与待办

1. **默认测试域名有「风险提醒」拦截页**：浏览器首次访问会出现腾讯云提示页（"是由腾讯云 CloudBase 提供的测试域名…"），需点「确定访问」才进入应用。正式对外必须绑定自定义域名。
   当前环境为共享桶（ExternalStorage），`setWebsiteDocument` 由平台统一管理，MCP 侧无法修改静态网站配置（`HOSTING_SETWEBSITEDOCUMENT_FAILED`）。
2. **自定义域名**需满足：域名已备案（国内站）+ 上传/托管 SSL 证书（`bindDomain` 需 `certId`）。环境内目前只有平台下发的默认域名，无用户自有域名。
3. **数据层仍是 Supabase**（`katproevfecefydjztca.supabase.co`）。仅前端搬到 CloudBase，Supabase Free 计划 7 天不活跃自动暂停的风险依旧存在。本环境已开通 PostgreSQL（`postgres-fb38hz52`，SHARED），可作为后续迁移目标。
4. 静态托管桶内仍残留 v001 上传的历史 hash 资源（约 78MB），`tcb hosting deploy` 只覆盖不清理；不影响访问，需要时可在控制台按前缀批量删除。

## 回滚

- 控制台 → 应用 `realm` → 版本管理 → 回退到 `realm-001` / `realm-002`
- 或删除应用：`manageApps(action="deleteApp", serviceName="realm")`（会同时失效该子域名）

## 标准化双端发布（2026-10-28 起）

已把 CloudBase 同步固化为可重复命令，与 GitHub Pages 使用同一份构建产物：

```bash
set -a && source .env.production && set +a
npm run build:deploy        # 输出 dist-deploy（每次清空，25 文件 / 2.6MB）

~/.workbuddy/binaries/node/cli-connector-packages/bin/tcb hosting deploy ./dist-deploy \
  -e cb-env-chenhongl-221-d0a08260a99 --concurrency 10 --verify --safe
```

- `--verify` 逐文件核对远端与本地一致，`--safe` 校验失败自动回滚。
- 不要传第二个 `cloudPath` 参数（传 `/` 会导致校验全量 missing 并回滚）。
- 判定标准：GitHub Pages 与 CloudBase 两个域名的 `index-*.css` 指纹一致。
- 本机 `dist` 因 `emptyOutDir:false` 会累积历史文件，仅用于预览；发布只用 `dist-deploy`。
