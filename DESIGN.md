# 进程存活监测（任务控制）插件设计

> DeepSeek Harness 插件：在输入框区域提供「检测」与「追加条件」两个按钮，用于监控运行中的任务并在出错/遗漏条件时干预。

## 按钮布局（定稿：方案 A'，2026-08-18 调整）

```
┌─────────────────────────────────────────────────────┐
│ [附件/模式] [input.left] [检测] [追加条件] [模型] [发送] │  ← 输入卡片工具行
└─────────────────────────────────────────────────────┘
```

| 按钮 | 位置 | 默认文案 | 动作 |
|---|---|---|---|
| **检测** | `conversation.input.right`（order 90，**追加条件左侧**） | **"拍一下deepseek"** | 一键检查：出错 → 提示错误；运行中 → 提示运行中；健康 → 输出"无异常" |
| **追加条件** | `conversation.input.right`（order 100，发送按钮左侧） | "追加条件" | 未运行 → 提示；运行中 → 中止当前任务 → 弹窗输入 → 带条件隐形恢复 |

> 样式与发送按钮一致：`--dsw-alias-button-info-fill` 蓝底、`#fff` 白字、胶囊圆角（borderRadius 999），hover 用 `--dsw-alias-button-info-hover`，深浅色自动适配。原方案 A 的 `conversation.composer.dock`（输入卡下方独立行）已弃用。

## 个性化（可自定义文案）✅ 需求已确认

**所有面向用户的文案都可自定义**（通过设置页），默认值如下：

| 设置项 | 默认值 |
|---|---|
| 检测按钮文案 | `拍一下deepseek` |
| 追加条件按钮文案 | `追加条件` |
| 检测健康输出 | `任务正常，无异常` |
| 检测出错输出 | `任务可能出错，已中止` |
| 追加条件模板 | `补充条件：{条件}，请据此重新执行刚才的任务` |

设置入口：设置 → 插件 → 本插件卡片（settings.plugin.item 风格，持久化到 settings.yaml / localStorage）。

## 设计要点（v2，含用户修正）

1. **"追加条件"不是排队注入，而是"中止 + 带条件重发"**
   - DSH 中消息注入（官方输入框 / `agent.followup`）都会进入 inbox 队列，agent 只在"下一步/下一轮"边界读取；
   - 若 agent 正在执行长工具（如安装命令），排队消息在工具完成前不会被读取 → 装完才看到补充 → 白忙活；
   - 正确流程：**先中止当前任务**（在工具完成前停掉），再注入"补充条件 + 重新执行"。

2. **检测按钮的"成就感"设计**
   - 一键检查，结果即时反馈（出错 → 中止+提示；健康 → 输出自定义文案）；
   - 文案可自定义（出错提示 / 无异常提示），可配置。

3. **中止语义边界（待开发时确认）**
   - 中止 agent 轮次的确切 API（`agent.abort()` 或会话 loop 级中止）开发时确认；
   - 中止不会自动回滚已写入的中间产物，需在文档中提醒用户。

## 技术架构（路线 A：Go 留待会话索引项目）

本插件使用纯 JS/TS 薄壳（无需 Go）：
- **宿主端**（Node 进程）：监听 session 事件跟踪任务状态；提供 RPC 服务（check / abort / append-condition）；调用 agent 中止与 followup 注入。
- **客户端**（浏览器）：两个按钮 + 追加条件输入框；通过 RPC 调用宿主端。

## 技术调研结论（已确认）

### ✅ 中止能力（两个层面都有）
- **宿主端**：`agent.cancel(cause)`（`packages/core/agent-loop/src/agent.ts` L134）——清空 inbox + abort 当前轮次 → `turn/end kind:'aborted'`。`AgentCancelCause` 含 `kind` 字段（如 `disposed`/用户取消）。
- **客户端**：`inputActions.stop()`（ui-conversation apply.ts L343 / slots.ts L511）——输入栏自带 Send/Stop 切换，客户端可直接调用停止。

### ✅ 按钮插槽（composer 工具行内）
- `conversation.input.left` — 工具行左端（resident chrome 之后）
- `conversation.input.right` — 工具行右端，**发送按钮左侧**（model 选择在它和发送按钮之间）
- `conversation.composer.dock` — 输入卡片下方一条独立行
- **⚠️ 没有"发送按钮右侧"的原生插槽**——发送按钮是行内最右元素（ConversationRoot.tsx L152-153 只渲染 left/right 两个插槽位）

### ⚠️ 追加条件的发送机制（待实现时验证）
- `inputActions.submit()` 在 `machineBusy` 时被禁用（InputBar.tsx L554）——运行中不能直接 submit
- 方案：**先 `inputActions.stop()` 中止 → 等待轮次结束 → 再 submit("补充条件...请重新执行")**，符合"中止+重发"设计

## 架构简化机会（待定）

若客户端能直接从 `ConversationSnapshot`/`InputState` 读到"最后一轮状态（error/aborted/completed）"，则**检测功能可纯客户端实现**（无需宿主端 + RPC）：
- 检测 = 读会话快照的轮次状态
- 中止 = `inputActions.stop()`
- 追加条件 = stop() → submit(补充条件)
- 若快照不含轮次错误原因，才需要宿主端 + api-remotes RPC（复杂度上升）

## ✅ 已确认：纯客户端架构可行（重大简化）

`ConversationSnapshot`（`packages/client/runtime/src/client/sessions/conversation.ts`）包含：

```ts
running: boolean                    // 任务是否正在运行
lastAgentError: string | null       // 最近一次 agent 错误信息（无错误为 null）
composerPhase: ComposerPhase        // 输入栏状态（send/stop 切换）
```

结合客户端已有的 `inputActions`（`stop()` 停止 / `submit()` 发送），**三个功能全部可纯客户端实现，无需宿主插件、无需 RPC**：

| 功能 | 客户端实现 |
|---|---|
| 检测 | 读 `running` + `lastAgentError`：出错→提示；运行中→"运行中"；健康→"无异常"（文案可自定义） |
| 中止 | `inputActions.stop()` |
| 追加条件 | `inputActions.stop()` 中止 → 等待轮次结束 → `inputActions.submit("补充条件：{内容}，请据此重新执行")` |

## 待确认

- [x] stop() 后何时可重新 submit（machineBusy → idle 的过渡）—— 改用 `session.cancel()` + 400ms 延迟已解决
- [x] 客户端 bundle 独立构建方案（tsdown/CLIENT_EXTERNALS）—— 方法二 esbuild 已定案
- [x] 检测按钮放置：无"发送右侧"插槽，已定方案 A（composer.dock）

## 方案 B：隐形恢复通道（2026-08-18 定案）

**需求**：追加条件/继续任务时，聊天里不再出现"继续"/"补充条件…"用户气泡（高级感，而非"他只是给我按了个暂停"）。

**核心机制**：
- 消息的 `source.kind !== 'user'` 时，聊天界面只渲染成低调的 ContextInjectionRow（ui-conversation message.ts），不渲染用户气泡；
- 但模型照常把它当作本轮用户指令执行（agent-loop 中 `followup(plugin-source message)` 是 next-turn wakeup）。

**客户端→宿主通道选型**（逐项排除后只剩 HTTP）：
| 通道 | 结论 |
|---|---|
| `session.prompt` | 永远是用户消息（可见）→ 排除 |
| `ctx.commands.register` 命令 | 聊天渲染命令节点（可见）→ 排除 |
| `api-remotes` @Remote | 需 Typert/Host 构建，独立插件不现实 → 排除 |
| `settings.update` RPC | 宿主 apiproxy `exposedNamespaces()` 白名单硬编码，插件 ns 报 `settings-not-exposed` → 排除 |
| **`ctx.webServer.register` + fetch** | ✅ **定案**：宿主插件注册 `/dsh-task-control/resume` 路由；客户端 fetch POST（同源 loopback，无 CORS）；宿主 `agent.followup` 注入插件来源消息 |

**宿主插件约束**：不得 import 任何 `@deepseek-ai/*`（外部插件包在 `~/.dsh/profiles/node_modules`，解析不到 workspace 依赖）→ 用户消息对象按 createUserMessage 形状手工构造（a4phone dsh-hook 同款）。路由需 loopback Host 校验。

**客户端兜底**：fetch 失败（宿主半未装）→ console.warn + 退回 `session.prompt`（可见消息），任务仍能恢复。

**流程（最终）**：
0. 点「追加条件」时先判断 `running`：任务**未运行** → 只提示"当前没有正在运行的任务"，不取消、不弹输入窗、不发"继续"（防止空闲 AI 把"继续"当问题来分析）
1. 任务运行中 → `session.cancel()` 立即暂停 → 弹窗（提示"打开此窗口时程序会暂停"）
2. 提交条件 → `resumeTask("补充条件：{条件}，请据此重新执行刚才的任务")` → 宿主注入插件来源消息 → 模型按新条件重跑，聊天只见低调上下文行
3. 关闭/留空 → `resumeTask("继续")` → 同上，隐形恢复原任务

**文案定稿（2026-08-18）**：傻瓜提示（"打开此窗口时程序会暂停"）/ 追加模板（"补充条件：{条件}，请据此重新执行刚才的任务"）/ 继续模板（"继续"）**硬编码**，从设置卡移除——设置只保留检测按钮文案、追加条件按钮文案、检测·无异常/出错/运行中输出 5 项。

**卡死识别 + 强制终止（2026-08-18）**：
- **识别**：检测按钮读 `ConversationSnapshot.runningCalls`（所有"已发起未返回"的工具调用，含 `name` + `time` 发起时间戳）；任一调用超 10 分钟未返回 → 提示"疑似卡死：工具X已运行N分N秒"。
- **终止难题**：agent 卡在未返回的工具调用时，`session.cancel`（原生停止 / 追加条件暂停）会被排在工具返回值后面，无法立即生效。
- **解法**：检测弹窗在卡死时显示【强制终止】按钮 → 客户端从 `runningCalls.argsRaw` 提取命令特征（URL / 文件名 / 引号内路径）→ POST `/dsh-task-control/kill` → 宿主用 PowerShell `Get-CimInstance` 按命令行匹配进程并 `Stop-Process -Force` → 工具调用立即返回（tool/result ok=false）→ turn 结束 → 任务真正停止。
- 宿主 kill 细节：绝对路径 powershell.exe（PATH 可能不含 System32）；marker 清洗 `'"\`` 防注入；`$PID` 排除自身。

**下载中检测（2026-08-18）**：下载/安装类调用（curl/wget/iwr/-o/OutFile/pip install）**无论是否超时**都查宿主 `/dsh-task-control/download-status`（进程活跃 + 输出文件大小 + URL HEAD Content-Length 算百分比）：活跃 → "正在下载 xxx，进度 xx%"（无输出文件/查询失败 → "无法计算进度但仍在下载"）；已退出 → "下载出现异常中断" + 强制终止。

**急停按钮（2026-08-18）**：红色底白字胶囊（`--dsw-alias-state-error-primary` + `#fff`），位于拍一下左侧（order 80）；一键收集所有未返回工具调用的 marker → 逐个 kill → cancelSession，让用户在下载/安装进行中（不报错不超时）也能随时停掉任务更换方案；文案可自定义（设置卡 6 项）。
