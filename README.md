# dsh-task-control —— 下载卡死急停 + 任务健康检测

> **DeepSeek Harness 插件**：pip / GitHub 下载卡到怀疑人生？网络超时停不下来？**一键急停** + 下载进度检测 + 卡死识别 + 隐形追加条件。

在国内网络环境下，从 pip / GitHub 下载大文件（torch、ffmpeg、插件包…）卡顿、超时是家常便饭。DSH 原生的「停止」和任务暂停会被排在卡住的下载命令后面**无法生效**——任务既下不完、也停不掉。这个插件补上了缺口：

| 按钮 | 作用 |
|---|---|
| 🔴 **急停** | **一键强制终止当前任务**（杀进程 + 停止会话），下载/安装卡住时随时可停，**带防误触确认**（勾选"了解丢失进度"才能点确认） |
| **拍一下deepseek**（检测） | 一键检查任务状态：出错 / **疑似卡死**（工具调用超 10 分钟未返回）/ 运行中 / 健康 |
| **追加条件** | 任务运行中追加补充条件（先中止 → 弹窗输入 → 带条件隐形重跑） |

## ✨ 核心亮点

### 1. 下载卡死「急停」—— 为国内网络环境而生
- pip（`pip install torch` 等 2.5GB 大包）、GitHub（大文件下载）、curl 下载卡住/超时时，原生的停止按钮和暂停**都被排在卡住的工具返回值后面，毫无反应**；
- 点「急停」→ 宿主直接**按命令特征找到并杀掉卡住的下载进程** → 任务立即停止，换源重来；
- 防误触：先弹警告"急停会导致下载任务丢失，重新启动后需要全部重新下载"，**勾选后才能点确认**。

### 2. 下载中检测—— 不再"疑似卡死"误报
- 检测到正在执行下载/安装命令时，**无论是否超时**都先查实际状态：
  - **curl 类**（有输出文件）→ 显示真实进度百分比（如 `正在下载 ffmpeg-release-essentials.zip，进度 42%`）；
  - **pip 类**（无输出文件）→ 明确提示"正在下载，无法计算进度，请耐心等待"，**绝不显示误导性的假进度**；
  - 下载进程已退出 → 提示"下载出现异常中断" + 可强制终止。

### 3. 卡死识别 + 强制终止
- 非下载类工具调用超过 10 分钟未返回 → 提示"疑似卡死：工具 X 已运行 N分N秒"；
- 检测弹窗内可直接**强制终止**（杀进程，`session.cancel` 对此无能为力）。

### 4. 隐形追加条件（无用户气泡）
- 「追加条件」的恢复/条件消息经宿主通道以**插件来源消息**注入会话：模型照常执行，但聊天界面只显示一条低调的上下文提示行——**没有"继续"、没有"补充条件…"气泡**，体验干净利落。

## 安装

1. `lib/` 已包含构建产物（`lib/index.js` 宿主半 + `lib/client.js` 客户端 bundle）。将插件包放入 DSH 的 profile node_modules：
   - 直接拷贝到 `~/.dsh/profiles/node_modules/dsh-task-control/`，或
   - 建立 junction 链接到本目录（本地开发常用）。
2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 中插入插件条目：

   ```yaml
   - insert:
       - id: task-control
         name: 'dsh-task-control'
   ```

3. 重启 DSH web，硬刷新（Ctrl+Shift+R）页面。

> 宿主半挂载 `/dsh-task-control/resume`、`/dsh-task-control/kill`、`/dsh-task-control/download-status` 三条路由（loopback Host 校验），浏览器端同源 fetch 调用；客户端 bundle 按 `window.__ModuleLoader__` 契约加载。

## 自定义文案

设置 → 插件 → **任务控制** 卡片（6 项）：

- 急停按钮文案（默认 `急停`）
- 检测按钮文案（默认 `拍一下deepseek`）
- 追加条件按钮文案（默认 `追加条件`）
- 检测·无异常输出（默认 `任务正常，无异常`）
- 检测·出错输出（默认 `任务出错：{error}`，`{error}` 会替换为错误信息）
- 检测·运行中输出（默认 `任务正在运行中，暂未出错`）

## 构建

```bash
node build.mjs
```

生成 `lib/index.js`（宿主半，ESM、零外部依赖）与 `lib/client.js`（客户端 bundle，`__ModuleLoader__` 契约、外部模块走 `require()`）。

## 目录结构

```
├── src/
│   ├── index.ts              # 宿主半：resume / kill（急停杀进程）/ download-status（下载进度）路由
│   └── client/
│       ├── index.ts          # 客户端插件入口（插槽注册）
│       ├── buttons.tsx       # 急停 / 检测 / 追加条件按钮 + 弹窗（含急停防误触确认）
│       ├── SettingsCard.tsx  # 设置卡
│       └── settings.ts       # 文案设置存储（localStorage）
├── lib/                      # 构建产物（index.js / client.js）
├── build.mjs                 # esbuild 构建脚本
├── cordis.patch.yml          # 安装 patch（按包名解析）
├── cordis.dev.patch.yml      # 本地开发覆盖层（直接加载 src/index.ts）
├── DESIGN.md                 # 设计文档
└── 功能验证测试清单.txt        # 打断测试 / 功能验证清单
```

## References / 相关资源

- **官方反馈帖**（问题缘起）：[task stuck in download/install cannot be stopped — session.cancel queued behind tool return value](https://github.com/deepseek-ai/deepseek-harness/discussions/3400)（GitHub Discussions #3400，含官方开发者对 `session.cancel` 语义与跨重启恢复机制的分析）
- **DSH Harness Handbook**（社区资深成员维护）：[Stop a DeepSeek Harness tool that will not cancel](https://sandbaseai.github.io/deepseek-harness-handbook/stuck-tool-cancellation.html) —— 基于上述反馈整理的手册专题：cancel accepted ≠ tool stopped，含证据时间线、实时遏制流程、重启语义与十二个修复门

## License

MIT
