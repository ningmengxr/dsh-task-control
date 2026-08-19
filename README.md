# dsh-task-control（任务控制插件）

DeepSeek Harness 插件：在输入框区域提供「检测」与「追加条件」两个按钮——一键检查运行中任务的状态（出错 / 运行中 / 健康），以及在任务运行时追加补充条件（先中止、带条件隐形重跑）。

## 功能

| 按钮 | 位置 | 说明 |
|---|---|---|
| **拍一下deepseek**（检测） | 输入栏工具行，追加条件左侧 | 一键检查：任务出错 → 显示错误信息；运行中 → 提示运行中；空闲 → 提示正常 |
| **追加条件** | 输入栏工具行，发送按钮左侧 | 任务运行中点击 → 立即暂停 → 弹窗输入补充条件 → 带条件重新执行；不输入直接关闭则恢复原任务 |

## 亮点：隐形恢复（无用户气泡）

- 「追加条件」的恢复 / 条件消息经宿主通道（HTTP 路由 + `agent.followup`）以**插件来源消息**（`source: { kind: 'plugin' }`）注入会话：
  - 模型照常把它当作本轮用户指令执行；
  - 聊天界面只显示一条低调的上下文提示行（ContextInjectionRow），**不出现用户气泡**——没有"继续"、没有"补充条件…"。
- 任务**未运行**时点「追加条件」→ 只提示"当前没有正在运行的任务"，不暂停、不发消息，不会让空闲的 AI 去"分析继续是什么意思"。
- 宿主通道不可用（宿主半未安装）时自动退回可见消息，保证任务仍能恢复。

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

> 宿主半挂载 `/dsh-task-control/resume` 路由（loopback Host 校验），浏览器端同源 fetch 调用；客户端 bundle 按 `window.__ModuleLoader__` 契约加载。
## 安装

通过 npm 安装：
```bash
npm install dsh-task-control

## 自定义文案

设置 → 插件 → **任务控制** 卡片：

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
│   ├── index.ts              # 宿主半：/dsh-task-control/resume 路由 + 插件来源消息注入
│   └── client/
│       ├── index.ts          # 客户端插件入口（插槽注册）
│       ├── buttons.tsx       # 检测 / 追加条件按钮 + 弹窗
│       ├── SettingsCard.tsx  # 设置卡
│       └── settings.ts       # 文案设置存储（localStorage）
├── lib/                      # 构建产物（index.js / client.js）
├── build.mjs                 # esbuild 构建脚本
├── cordis.patch.yml          # 安装 patch（按包名解析）
├── cordis.dev.patch.yml      # 本地开发覆盖层（直接加载 src/index.ts）
├── DESIGN.md                 # 设计文档
└── 功能验证测试清单.txt        # 打断测试 / 功能验证清单
```

## License

MIT
