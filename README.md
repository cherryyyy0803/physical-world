# 物理世界 · AI 物理交互学习平台

面向高中生的游戏化物理实验 + 物理学家 AI 伴学。首版只做**平抛运动**一条完整链路，弹簧振子和双缝干涉在注册表里预留位置，标为「后续开放」。

## 快速开始

```bash
pnpm install
cp .env.example .env      # 可选：不填 key 也能跑，走演示模式
pnpm dev                  # 同时起 web(5173) 和 ai-service(8787)
```

> 安装小坑（Windows 上真踩过，别跳过）：
> 1. **`.npmrc` 里的 `node-linker=hoisted` 别改回去。** 默认的隔离式软链在本机会静默失败 —— `pnpm install` 显示成功，但 `node_modules` 里只有 `.bin` 和 `.pnpm`，没有任何包目录，接着 `tsc` 报一堆「找不到模块」。hoisted 用硬链代替软链，Windows / macOS 都稳。
> 2. pnpm 10+ 默认不执行依赖的构建脚本，`pnpm-workspace.yaml` 已放行 esbuild；若仍提示 `Ignored build scripts`，跑一次 `pnpm approve-builds` 选 esbuild，或者直接 `pnpm install --ignore-scripts`（esbuild 靠 `@esbuild/win32-x64` 可选依赖也能正常工作）。
> 3. `pnpm-lock.yaml` 已提交，第一次装完不要重新生成它。

打开 http://localhost:5173 。没有 `.env` 时后端返回预置话术，前端的流式、错误重试、指令执行全部照常工作 —— 这样 A 不必等模型就能把页面联调完。

单独起：

```bash
pnpm dev:ai               # http://localhost:8787
pnpm dev:web              # http://localhost:5173，/api 已代理到 8787
pnpm test                 # 物理计算与判定的单元测试
pnpm typecheck            # 全仓类型检查
```

## 目录

```
packages/contracts       接口契约 + 人物配置 + 主题/实验元数据 + 题目（不含答案）
packages/physics-core    物理计算引擎、参数范围、挑战判定、可解性检查（C 的地盘）
apps/ai-service          Fastify：聊天 SSE、自然语言调参、判题、挑战（B 的地盘）
  src/ai/                模型调用、prompt 拼装、自然语言 → 操作
  src/content-private/   答案与挑战模板，只活在后端，绝不下发前端
  src/routes/            每个能力一个路由模块，app.ts 只负责装配
apps/web                 React + Vite：首页双入口、实验页、任务列表、人物面板（A 的地盘）
content/                 知识库内容（人物设定、知识卡片），B 维护
docs/                    PRD、接口文档、答辩材料
```

**契约只有一份**：`packages/contracts/src/contract.ts`。改字段＝改契约，改之前先在群里说。

**参数范围只有一份**：`packages/physics-core/src/projectile.ts` 的 `PROJECTILE_PARAMS`。前端滑块、后端校验、AI prompt 都读它。

**答案只在服务端**：`apps/ai-service/src/content-private/answers.ts`。前端拿到的题目里没有正确选项（PRD §6）。

## 已经能跑通的链路

| 链路 | 入口 | 状态 |
|---|---|---|
| 双入口（人物 / 知识主题）+ 姓名与实验搜索 | 首页 | ✅ |
| 人物悬停显示关联实验，点开后可选实验或直接聊天 | 首页 | ✅ 触屏用点击展开 |
| 平抛实验：调参、开始、暂停、继续、重置、轨迹与实时数值 | 实验页 | ✅ |
| 任务列表 + 三档进度 + 完成任务选择题 + 判题 | 实验页右栏 | ✅ |
| 右下角人物面板四项菜单 | 实验页 | ✅ |
| 说一句话 → 实际改变实验参数（规则解析，不依赖模型） | 人物面板聊天框 | ✅ |
| 运行中改参会先弹确认 | 同上 | ✅ |
| 模糊指令反问、越界参数拒执行 | 同上 | ✅ |
| 三档回答（通俗 / 正常 / 专业） | 人物面板顶部 | ✅ prompt 已分流，文风需实测微调 |
| 挑战生成 + 提交 + 程序判定 + 不可解模板拦截 | 人物面板 → 挑战任务 | ✅ |
| 知识回顾 | 人物面板 → 知识回顾 | ⚠️ 依赖任务进度，进度目前存在前端内存 |
| 多人讨论室 | 首页右下角 | ❌ 未接，`/api/discuss` 待 B 实现 |

## 两条关于数字的约定

1. **g 默认 9.8**。PRD 5.7 的挑战例子说「高度 20 m、落点 30 m 时 15 m/s 可达到」，那是按 g = 10 算的；g 取 9.8 时精确解是 14.85 m/s。因为判定给了 29.5–30.5 m 的容差，15 m/s 算出来 30.30 m 仍然通过，所以演示不受影响，但别在文档里写「标准答案是 15」。
2. **固定条件要锁两个参数**。挑战模板里 `h` 和 `g` 都写进 `fixed`，否则学生可以靠调小 g 让球飞更远来通关。

## 协作

- 一个 GitHub 仓库，`main` 只放能跑的版本；每人一个功能分支，小 PR 合并。
- 每次合并说明：这次做了什么、接口有没有变、怎么验证过。
- 密钥只放 `.env`（已 gitignore），不进前端、不进仓库。
- 模型失败不影响手动实验：AI 按钮显示失败可重试，指令解析有规则层兜底。
