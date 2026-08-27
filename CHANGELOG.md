# CHANGELOG / 维护更新记录

> dsh-task-control 的版本与维护更新历程。从 2026-08-27 起持续记录，每次发版/重要维护在此追加。

---

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
