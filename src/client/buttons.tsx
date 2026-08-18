/**
 * dsh-task-control 两个按钮组件（JSX），按钮文案从可自定义设置读取。
 *
 * 检测按钮（composer.dock）：读 running / lastAgentError 判断任务状态，
 *   结果显示在独立弹窗（不再用 window.alert，避免页面动画卡顿）。
 * 追加条件按钮（input.right）：
 *   点击 → 若任务未运行：仅提示"没有正在运行的任务"（不取消、不弹输入窗，
 *     避免把"继续"发给空闲的 AI 让它分析"继续是什么意思"）；
 *   若任务运行中 → 立即暂停（session.cancel()）→ 打开不阻塞弹窗
 *   → 输入后带补充条件隐形恢复；关闭/留空则隐形恢复原任务
 *   （恢复文本经宿主通道以插件来源消息注入，聊天只显示低调上下文行）。
 *
 * 追加条件的三个文本（傻瓜提示 / 追加模板 / 继续模板）已定稿为硬编码，
 * 设置里只保留按钮与检测文案的自定义。
 *
 * 两个弹窗共用 ModalShell：居中 + 圆角，配色用 DSH 主题 token
 * （--dsw-alias-bg-layer-1 / --dsw-alias-label-primary / --dsw-alias-border-l2），
 * 自动适配深色/浅色模式。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  loadSettings, renderTemplate, subscribeSettings, type TaskControlSettings,
} from './settings.ts'

/** 订阅设置变化的 React 钩子。 */
function useSettings(): TaskControlSettings {
  const [s, setS] = useState<TaskControlSettings>(loadSettings)
  useEffect(() => subscribeSettings(() => setS(loadSettings())), [])
  return s
}

/** 共享弹窗外壳：全屏遮罩 + 居中圆角卡片（主题 token 自适应深/浅色）。 */
interface ModalShellProps {
  onClose: () => void
  children: React.ReactNode
}
function ModalShell({ onClose, children }: ModalShellProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-primary)',
          padding: '18px 20px', borderRadius: 12, minWidth: 320, maxWidth: 480,
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** 检测结果弹窗：只读文本 + 确定。 */
interface CheckModalProps {
  result: string
  onClose: () => void
}
function CheckModal({ result, onClose }: CheckModalProps) {
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
        {result}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose}>确定</button>
      </div>
    </ModalShell>
  )
}

/** 检测按钮（input.right，与追加条件并排）。 */
type CheckButtonProps = PropsRuntime<'conversation.input.right'>
export function CheckButton({ useSession }: CheckButtonProps) {
  const s = useSettings()
  const running = useSession(s => s.running)
  const lastError = useSession(s => s.lastAgentError)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState('')
  const onClick = (): void => {
    let text = s.healthyText
    if (lastError) text = renderTemplate(s.errorText, { error: lastError })
    else if (running) text = s.runningText
    setResult(text)
    setOpen(true)
  }
  return (
    <>
      <TaskButton label={s.checkLabel} onClick={onClick} />
      {open && createPortal(
        <CheckModal result={result} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  )
}

/** 追加条件相关的三个文本（定稿硬编码，不进设置）。 */
const PAUSE_HINT = '打开此窗口时程序会暂停'
const APPEND_TEMPLATE = '补充条件：{条件}，请据此重新执行刚才的任务'
const RESUME_TEXT = '继续'
/** 任务未运行时点击追加条件的提示。 */
const NO_TASK_NOTICE = '当前没有正在运行的任务'

/**
 * 主操作按钮：与发送按钮同风格——info-fill 蓝色底、静态白字、胶囊圆角，
 * hover 用 info-hover（与 InputBar 的 primary send 配方一致，深浅色自动适配）。
 */
function TaskButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 'none',
        borderRadius: 999,
        padding: '4px 14px',
        background: hover ? 'var(--dsw-alias-button-info-hover)' : 'var(--dsw-alias-button-info-fill)',
        color: '#fff',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
      }}
    >
      {label}
    </button>
  )
}

/** 追加条件弹窗：不阻塞（程序可继续处理暂停指令）。 */
interface AppendModalProps {
  hint: string
  onSubmit: (condition: string) => void
  onCancel: () => void
}
function AppendModal({ hint, onSubmit, onCancel }: AppendModalProps) {
  const [value, setValue] = useState('')
  const commit = (): void => onSubmit(value.trim())
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') onCancel()
  }
  return (
    <ModalShell onClose={onCancel}>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>{hint}</div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="补充条件（留空或按 Esc = 继续原任务）"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          color: 'var(--dsw-alias-label-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}>取消（继续原任务）</button>
        <button type="button" onClick={commit}>确定</button>
      </div>
    </ModalShell>
  )
}

/** 追加条件按钮的注入面：宿主注入的中止与"隐形恢复"能力。 */
export interface AppendInjected {
  cancelSession: () => void
  resumeTask: (text: string) => void
}

/** 追加条件按钮（input.right）。 */
type AppendButtonProps = PropsRuntime<'conversation.input.right'> & AppendInjected
export function AppendButton({ resumeTask, cancelSession, useSession }: AppendButtonProps) {
  const s = useSettings()
  const running = useSession(snapshot => snapshot.running)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const onOpen = (): void => {
    if (!running) {
      // 任务未运行：不取消、不弹输入窗——否则关闭时发出的"继续"
      // 会被空闲的 AI 当成一个问题来"分析继续是什么意思"。
      setNotice(true)
      return
    }
    // 点击立即暂停（真正的 stop：session.cancel），不等输入
    cancelSession()
    setResetKey((k) => k + 1)
    setOpen(true)
  }
  const onSubmit = (condition: string): void => {
    setOpen(false)
    const text = condition !== ''
      ? renderTemplate(APPEND_TEMPLATE, { 条件: condition })
      : RESUME_TEXT
    // 方案 B：走宿主通道，以插件来源消息隐形恢复（聊天只出现低调上下文行）
    setTimeout(() => resumeTask(text), 400)
  }
  const onCancel = (): void => {
    setOpen(false)
    setTimeout(() => resumeTask(RESUME_TEXT), 400)
  }
  return (
    <>
      <TaskButton label={s.appendLabel} onClick={onOpen} />
      {open && createPortal(
        <AppendModal key={resetKey} hint={PAUSE_HINT} onSubmit={onSubmit} onCancel={onCancel} />,
        document.body,
      )}
      {notice && createPortal(
        <ModalShell onClose={() => setNotice(false)}>
          <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>{NO_TASK_NOTICE}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setNotice(false)}>确定</button>
          </div>
        </ModalShell>,
        document.body,
      )}
    </>
  )
}
