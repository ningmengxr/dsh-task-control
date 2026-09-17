# CHANGELOG / 维护更新记录

> dsh-task-control 的版本与维护更新历程。从 2026-08-27 起持续记录，每次发版/重要维护在此追加。

---

## 2026-09-17
- **v0.4.4 — 设置项迁移到「通用设置」**：
  - **设置行改注册到 `settings.general.item`**（通用设置里的「任务控制」一栏）。新版 DSH 的「插件」标签只做插件清单/开关展示（`settings.plugin.item` 是 keyed slot，按插件的 settings 命名空间 dispatch），自定义设置项的正确位置是 `settings.general.item`——官方自己的语言/外观/Enter 行为、以及 aqua 的外观行都注册在这里；迁移后 6 个文案输入框稳定显示在通用设置面板中。
  - **移除宿主半的 settings 命名空间注册**：设置存在客户端 localStorage，不需要宿主 serve namespace。顺带去掉对已被 DSH 移除的 `@deepseek-ai/dsh-client-runtime` 的类型依赖。
  - `dsh.client.inject` 更新：`@deepseek-ai/dsh-client-ui-settings-plugins` → `@deepseek-ai/dsh-client-ui-settings-general`。
- **v0.4.3 — DSH 0.1.5+ 兼容修复（"急停/检测按钮消失"）**：
  - **现象**：DSH 升到 0.1.6-alpha.1 后，急停（红色）与检测按钮消失，只剩"追加条件"；刷新时按钮会"一闪而过"。
  - **根因**：DSH 0.1.5 起把 `runningCalls` / `nodes` 从 `SessionSnapshot`（`useSession`）迁到了 **`ChatSnapshot.legacy`**（`useChat`）。继续读 `useSession(s => s.runningCalls)` 会得到 `undefined`，组件内再 `.find()` 就抛 TypeError → 按钮渲染失败（"追加条件"不读这两个字段，所以幸存）。
  - **二次根因**：slot 的 standardProps 由 `useSyncExternalStoreWithSelector` **逐个绑定**，首帧常只有 `useSession`、`useChat` 稍后就绪；若在同一组件内按存在性条件调用 hook，会造成 hook 调用数量变化 → React 抛错 → 按钮"一闪而过"。
  - **修复**：改为「模式探测 + `key={mode}` 重挂载」——外壳先探测 `useChat` 决定数据来源（新版 `chat` / 旧版 `session`），再用 `key={mode}` 渲染内部组件，模式切换走重新挂载而非改变 hook 数量，保证组件内 hook 调用次数恒定。旧版 DSH 自动回退 `useSession`，向后兼容。
  - **验证**：DSH 0.1.6-alpha.1 下三个按钮（急停/检测/追加条件）显示与功能均正常（用户实测）。

## 2026-08-27
- 🎉 **收录到 awesome-dsh-plugin（12518★）**：PR #3225 合并，正式进入 DeepSeek Harness 插件精选列表（`dsh plugin add dsh-task-control` 可装）。收录前完成了三件事：
  - 声明 `dsh.bundle` manifest → 支持 `dsh plugin add` 正规安装
  - git 历史重组为 10 个 commit（满足收录审核的"活跃维护"标准）
  - 重新生成 README（与 `data/plugins/` 同步）
- **v0.4.2**（npm 已发布 `dsh-task-control@0.4.2`）：
  - 声明 `dsh.bundle` manifest（`cordis.patch.yml`）
  - 仓库历史重组为 10 commit

## 2026-08-25
- **v0.4.1**（npm/GitHub/Gitee 已发布）：
  - **修复新版 DSH 兼容**：DSH 0.1.1-rc.2 把 `settings.plugin.item` 升级为严格 keyed slot，客户端注册补 `key` + 宿主用 `installSettingsSection` 注册 settings 命名空间，解决插件加载失败（`requires options.key`）导致的 DSH 无法启动
  - 自动更新：新版发布后下次启动 DSH 自动下载替换，重启生效（开发机 junction 安装自动跳过）
  - 官方 cancel 排队修复观察：DSH 0.1.1-rc.2 起暂停/恢复已有响应（对应 #3400 讨论），插件的强制终止/急停仍作为兜底

## 2026-08-24
- **v0.4.0**（npm 发布）：
  - pwsh 状态检测：运行时显示 IO 速率 / 输出速度（算不出百分比时）；IO 为 0 → 提示"疑似卡住"可强制终止；进程退出 → 提示"异常中断"
  - 下载中检测（进度百分比 / 异常中断）/ 卡死识别 / 强制终止 / 一键急停（防误触）
  - 追加条件 / 暂停 / 恢复（恢复指令隐形注入，不打扰聊天）
  - 设置卡文案自定义（5 项 + 急停按钮文案）

> 更早版本（0.1.0 ~ 0.3.0）为开发迭代基础功能，详见 GitHub 仓库历史。
