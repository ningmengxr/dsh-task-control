/**
 * dsh-task-control 客户端插件入口（纯 TS，无 JSX）
 *
 * 注册：
 *   - 急停按钮（conversation.input.right，order 80，最左）
 *   - 检测按钮（conversation.input.right，"拍一下deepseek"，order 90）
 *   - 追加条件按钮（conversation.input.right，order 100）
 *   - 设置行（settings.general.item → 通用设置里的"任务控制"一栏，可自定义文案）
 *
 * 停止机制：inputActions 没有 stop，正确通道是
 *   ctx.sessions.binding(sessionId)?.session.cancel()（host RPC）。
 */
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { CheckButton, AppendButton, EmergencyButton, type AppendInjected, type CheckInjected } from './buttons.tsx'
import { SettingsCard } from './SettingsCard.tsx'

export const name = 'task-control'
export const inject = ['slots', 'sessions']

/** 客户端插件入口：注册按钮与设置行。 */
export function apply(ctx: any): void {
  // 急停按钮：最左（order 80），红色，一键杀进程 + 终止任务
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'task-emergency',
    order: 80,
    inject: (sessionId: string): AppendInjected => ({
      cancelSession: () => {
        // 立即中止当前会话的运行轮次（等同内置"停止"按钮）
        void ctx.sessions.binding(sessionId)?.session?.cancel()
      },
      resumeTask: async (text: string) => {
        // 急停恢复：走宿主通道，以插件来源消息隐形恢复（与追加条件同通道）
        try {
          const response = await fetch('/dsh-task-control/resume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, text }),
          })
          if (!response.ok) throw new Error(`host channel http ${response.status}`)
        } catch (error) {
          console.warn('[dsh-task-control] 宿主通道不可用，退回可见消息:', error)
          void ctx.sessions.binding(sessionId)?.session?.prompt([{ type: 'text', text }], 'queue')
        }
      },
    }),
  }, EmergencyButton))

  // 检测按钮：与追加条件并排于工具行右端（order 90 < 100 → 在追加条件左侧）
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'task-check',
    order: 90,
    inject: (sessionId: string): CheckInjected => ({
      cancelSession: () => {
        // 立即中止当前会话的运行轮次（等同内置"停止"按钮）
        void ctx.sessions.binding(sessionId)?.session?.cancel()
      },
    }),
  }, CheckButton))

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'task-append',
    order: 100,
    inject: (sessionId: string): AppendInjected => ({
      cancelSession: () => {
        // 立即中止当前会话的运行轮次（等同内置"停止"按钮）
        void ctx.sessions.binding(sessionId)?.session?.cancel()
      },
      resumeTask: async (text: string) => {
        // 方案 B：走宿主 HTTP 通道（/dsh-task-control/resume），宿主把文本以
        // 插件来源消息注入会话 → 聊天里只渲染低调的 ContextInjectionRow，
        // 不出现用户气泡（"继续"/"补充条件…"）。
        try {
          const response = await fetch('/dsh-task-control/resume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, text }),
          })
          if (!response.ok) throw new Error(`host channel http ${response.status}`)
        } catch (error) {
          // 兜底：宿主半未挂载时退回可见用户消息，保证任务仍能恢复
          console.warn('[dsh-task-control] 宿主通道不可用，退回可见消息:', error)
          void ctx.sessions.binding(sessionId)?.session?.prompt([{ type: 'text', text }], 'queue')
        }
      },
    }),
  }, AppendButton))

  // 设置行：注册进「通用设置」的条目列表（settings.general.item 是 list slot，
  // 由 ui-settings-general 的 General 页面声明）。新版「插件」标签只展示插件清单/
  // 开关，自定义设置项应放这里；owner 不传 props，行自己画标题与写入路径。
  // order 12：排在官方条目（语言 1 / 外观 10 / Enter 行为等）之后，皮肤行（11）附近。
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'task-control',
    order: 12,
  }, SettingsCard))
}
