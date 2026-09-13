# LynnsRealm · 学情管理系统

面向教学一线的班级学情记录与家长反馈工具：录分 → 自动统计 → 一键生成私发反馈/群发话术/表扬榜/公示图 → 多设备云同步。纯前端静态站，后端用 Supabase（Auth 登录 + REST 直连），无需自建服务器。

- 线上：https://uriahchen.github.io/Realm/
- 部署与安全模型：见 [`DEPLOY.md`](./DEPLOY.md)、[`README-PAGES.md`](./README-PAGES.md)

## 功能一览（8 个主 Tab）

| Tab | 能力 |
|---|---|
| 学情记录 | 班级/课次管理、学员增删与转班（含撤销）、考勤/课堂表现/作业/课后任务、多题型分数录入（支持小数）、总分·正确率·排名自动计算、学习轨迹、自定义列、表头排序、班级统计行吸底 |
| 反馈生成 | 私发反馈工作台（逐生生成/复制/进度跟踪）、「四个一」模板、群发预览（排除请假缺勤）、模板实时预览编辑 |
| 反馈素材 | 按课次预存文本/链接素材，生成时自动引用 |
| 表扬榜 | 前十名 / 状元 / 进步之星 / 课后任务 / 作业等榜单，文本·CSV·JSON·图片导出 |
| 校内成绩 | 手动录入 + Excel 导入（未匹配学生提示）、多视图对比、趋势图 |
| 学情报告 | 班级/个人报告、薄弱项 Top3、学习轨迹图表、图片/CSV 导出 |
| 同步中心 | Supabase 连接配置、线上文档对环（剪贴板 TSV/Markdown 粘贴与回导）、同步状态与冲突处理、成员/权限管理 |
| 系统配置 | 数据可视化规则、表格字段显隐与自定义标题、公示样式、全局默认选项 |

## 技术栈

- **前端**：React 19 + TypeScript + Vite 7 + Tailwind 3 + shadcn/ui（图标 lucide-react）
- **图表/导出**：recharts（懒加载）、xlsx（按需动态加载）、html2canvas（按需动态加载）
- **后端**：Supabase（Auth 登录 + `app_state` 快照表 + `app_members` 成员名册，全部受 RLS 保护）
- **本地存储**：localStorage（离线可用，写入 400ms 防抖 + 关页前强制落盘）

## 目录结构

```
src/
├── App.tsx                 # 主壳：登录门 + 顶栏 + 8 个 Tab 组织
├── components/             # 业务组件（StudentTable / FeedbackGenerator / Leaderboard / StudentReport ...）
│   └── ui/                 # shadcn 基础组件（仅保留实际使用的一套）
├── hooks/
│   ├── useClassData.ts     # 数据核心：班级/记录/课次配置 CRUD、统计口径、持久化
│   ├── useCloudSync.ts     # 云端同步状态机（推送/拉取/冲突/只读）
│   └── useDisplaySettings.ts
├── lib/                    # 纯逻辑：统计口径、模板、导出、同步解析
│   ├── lessonFullScore.ts  # 满分（正确率分母）唯一取值来源
│   ├── attendance.ts       # 考勤口径（请假/缺勤判定）
│   ├── auth.ts / members.ts / cloudSync.ts
│   ├── docSync.ts / excelExport.ts / publicityExport.ts
│   └── feedbackTemplates.ts / reportFeedback.ts / weakPoints.ts
└── types/index.ts          # 领域模型
```

## 本地开发

```bash
npm install
cp .env.example .env.production   # 填 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SYNC_SCOPE
npm run dev            # 开发服务器
npm run build          # 产出 dist/
npm run preview        # 预览构建产物
npm run lint           # ESLint
```

## 关键口径（改代码前必读）

1. **满分与正确率**：分母一律取 `getLessonFullScore(lessonConfig)` = Σ题型满分 + Σ「计入总分」的分数型自定义列满分，**不得硬编码**；正确率为 0 或缺失时显示 0，不抛异常。
2. **考勤口径**：`attendanceKind()` 判定 `请假/缺勤` → 该记录总分与正确率记 0、不计入班均与榜单；改回出勤会自动重新计入。判断用「包含匹配」以兼容自定义考勤项。
3. **排名**：所有写路径统一调用 `rerankLesson()`（不可变 + Map 定位），保证删除/恢复/批量操作后名次一致。
4. **持久化**：`classes` 等大对象写入 localStorage 走 400ms 防抖并在 `pagehide` 落盘；读取用 `safeParse` 容错，坏数据回退默认值而非白屏。
5. **满分同步**：从在线表格导入时，按列数据最大值回填题型真实满分并重算该课次正确率（`syncQuestionFullScores`）。

## 发布流程（务必遵守）

1. 改动先在 `xueqing-web` 工作副本完成，`npm run build` 通过（含 `tsc` 类型检查）。
2. 同步到 GitHub 基线仓库 `realm-repo`，提交并 push 到 `main`。
3. GitHub Actions 自动构建并发布到 GitHub Pages；确认最新 run 成功、线上资源指纹已更新。
4. 若涉及后端（表结构 / RLS / 团队码），再到 Supabase 执行对应 SQL 并核验。

> ⚠️ 未经明确指示，不要发布到 WorkBuddy 应用链接；上线一律走上面的 GitHub → Supabase 流程。
