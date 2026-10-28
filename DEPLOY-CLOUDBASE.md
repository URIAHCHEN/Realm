# CloudBase 部署记录（腾讯云 · 国内站）

> 2026-10-28 上线。架构已从「GitHub Pages 静态站 + Supabase」整体迁到 CloudBase：
> 前端由云函数承载、数据落在 CloudBase PostgreSQL、对外域名 `lynn.xdf.cn`。

## 一、环境与入口

| 项 | 值 |
|---|---|
| 环境 ID | `cb-env-chenhongl-221-d0a08260a99`（ap-shanghai，默认套餐按量计费） |
| 对外域名 | **https://lynn.xdf.cn/**（自定义域名，证书 `V1aFoo4V`，网关 `/` → `WEB_SCF:realm-api`） |
| 承载方式 | HTTP 云函数 `realm-api`（Nodejs20.19，`scf_bootstrap` 监听 9000） |
| 数据库 | CloudBase PostgreSQL 实例 `postgres-fb38hz52`（SHARED，SDK/网关访问） |
| 静态托管 | 已停用为交付入口（`*.webapps.tcloudbase.com`、`*.tcloudbaseapp.com` 两条 `/` 路由已 disable，可回滚启用） |

## 二、请求链路

```
浏览器 ──HTTPS──> lynn.xdf.cn（网关，证书 V1aFoo4V）
                    ├─ / 与 /assets/*   → 函数内 dist/ 静态资源（带指纹长缓存）
                    ├─ /api/auth/v1/*   → 函数内鉴权（邮箱+口令，scrypt，自签 JWT）
                    └─ /api/rest/v1/*   → 校验登录态 + 成员/管理员权限
                                          → 转发 https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest
                                            （service_role API Key 只存于函数环境变量）
```

关键设计：

- **浏览器零密钥**：数据库 API Key 只存在于函数环境变量 `TCB_API_KEY`，前端不再内置任何 Supabase key。
- **函数不直连数据库**：不建 TCP 连接、不用 pg 驱动，全部走官方网关 PostgREST（与 Supabase 语义一致，`snapshot_hash` 条件更新等 CAS 逻辑原样保留）。
- **权限两层**：登录态（JWT）+ 名册（`app_members`）。名册为空时首个账号自举为管理员，与迁移前的 RLS 语义一致。

## 三、数据库结构（migration `20261028031000_realm_core`）

| 表 | 用途 |
|---|---|
| `app_users` | 账号：`id` / `email`（唯一）/ `password_hash`（`scrypt$salt$hash`） |
| `app_sessions` | 刷新令牌：`refresh_token` 主键 + `expires_at`（30 天，刷新即轮换） |
| `app_state` | 全量学情快照：`id`（团队码，当前 `main`）+ `data` jsonb + `snapshot_hash` + `updated_at` |
| `app_members` | 名册：`scope` + `user_id` + `is_admin`，主键 `(scope,user_id)` |

回滚 SQL（建表反向）：

```sql
drop table if exists app_members; drop table if exists app_state;
drop table if exists app_sessions; drop table if exists app_users;
```

## 四、发版流程

```bash
cd /Users/uriah/WorkBuddy/projects/realm-repo
npm run build                                        # tsc + vite
rm -rf cloudfunctions/realm-api/dist && cp -R dist cloudfunctions/realm-api/dist
# 通过 CloudBase 连接器部署：
#   manageFunctions(action="updateFunctionCode", functionName="realm-api",
#                   functionRootPath="<repo>/cloudfunctions")
```

改动仅前端时也必须重跑上面三步——函数内 `dist/` 就是线上前端。

## 五、验收记录（2026-10-28）

- 函数 `/api/health`：`dist / env / key / secret` 全部 configured
- 端到端（Playwright + Chromium，`--host-resolver-rules` 指向网关 IP）：
  注册 → 自动登录 → 自举管理员 → 快照写入 PG，`failedApi=[]`、`pageerror=[]`
- 鉴权边界：无令牌读 `app_state` → 401；错误口令 → 400 `Invalid login credentials`；
  重复主键插入 → 409（前端 CAS 依赖此语义）；刷新令牌轮换后旧令牌 → `invalid_grant`
- 页面：登录页完整渲染（`#root` 13335 字符），无「风险提醒」拦截页（自定义域名不触发）

## 六、待办 / 外部依赖

1. **DNS（当前唯一阻塞项）**：`lynn.xdf.cn` 需一条 CNAME 指向
   `lynn.xdf.cn.tcbaccess.tencentcloudbase.com`。
   解析由企业域名管理员维护，需 IT 添加；加完网关侧 `DNSStatus` 会从 `EMPTY` 变 `OK`，公网即可访问。
2. **历史数据迁移**：旧站数据在 Supabase（团队码 `main`）。迁移不需要任何密钥——
   在旧站（GitHub Pages，保持登录）用顶栏「导出备份（.json）」导出，再到 `lynn.xdf.cn` 导入备份。
   注意：新站首个注册账号会自动成为管理员，建议用你常用邮箱先注册再导入。
3. Supabase 项目在数据确认搬完前不要删（作为回滚源）。

## 七、回滚预案

| 场景 | 操作 |
|---|---|
| 新前端有问题 | 用上一版 `dist` 重新 `updateFunctionCode` 部署 `realm-api` |
| 回到静态托管老入口 | `manageGateway(enableRoute, domain=<webapps 域>, path="/")`，同时 `disableRoute` 掉 `lynn.xdf.cn` 的 `/` |
| 完全回到 Supabase | 回退本批提交里的 `src/lib/config.ts`，走 GitHub Pages；Supabase 数据未改动 |
| 数据写坏 | 用导出的 `.json` 备份 + `app_state` 单行覆盖（CAS 关闭时可直接 PATCH） |

## 八、与 GitHub Pages 的关系

GitHub Pages（uriahchen.github.io/Realm）仍是旧架构（Supabase）。本次把接口基址改为同源 `/api`，
**该站点上已不可用**——它现在的定位是「导出历史备份的入口」。
因此这批改动只在本地提交、**未推送**到 GitHub，避免触发 Pages 构建把线上旧站覆盖成打不开的版本。
