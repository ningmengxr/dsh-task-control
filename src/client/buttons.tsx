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

/** 检测结果弹窗：只读文本 + 确定（卡死时额外提供"强制终止"）。 */
interface CheckModalProps {
  result: string
  onClose: () => void
  stuckMarker: string | null
  killing: boolean
  killMessage: string
  onForceKill: () => void
}
function CheckModal({ result, onClose, stuckMarker, killing, killMessage, onForceKill }: CheckModalProps) {
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
        {result}
        {killMessage !== '' && (
          <div style={{ marginTop: 8, color: 'var(--dsw-alias-state-warn-primary)' }}>{killMessage}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {stuckMarker !== null && (
          <button
            type="button"
            onClick={onForceKill}
            disabled={killing}
            style={{
              border: '1px solid var(--dsw-alias-state-error-primary)',
              borderRadius: 999,
              padding: '4px 14px',
              background: 'transparent',
              color: 'var(--dsw-alias-state-error-primary)',
              cursor: killing ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: '20px',
            }}
          >
            {killing ? '正在强制终止…' : '强制终止卡住的任务'}
          </button>
        )}
        <button type="button" onClick={onClose}>确定</button>
      </div>
    </ModalShell>
  )
}

/** 检测按钮的注入面：宿主注入的中止能力（强制终止时会用到）。 */
export interface CheckInjected {
  cancelSession: () => void
}

/**
 * 检测按钮（input.right，与追加条件并排）。
 * 状态判定优先级：出错 > 疑似卡死（工具调用超时未返回）> 运行中（含正在执行的工具）> 健康。
 * 疑似卡死时提供"强制终止"：按命令特征杀进程（session.cancel 会被排在工具返回值后面，杀进程才能立即恢复）。
 */
type CheckButtonProps = PropsRuntime<'conversation.input.right'> & CheckInjected
export function CheckButton({ useSession, sessionId, cancelSession }: CheckButtonProps) {
  const s = useSettings()
  const running = useSession(s => s.running)
  const lastError = useSession(s => s.lastAgentError)
  const runningCalls = useSession(
    s => s.runningCalls,
    // 内容级比较：避免每次快照（新数组引用）都触发重渲染
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  )
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState('')
  const [stuckMarker, setStuckMarker] = useState<string | null>(null)
  const [killing, setKilling] = useState(false)
  const [killMessage, setKillMessage] = useState('')
  const onClick = (): void => {
    let text = s.healthyText
    let marker: string | null = null
    setKillMessage('')
    if (lastError) {
      text = renderTemplate(s.errorText, { error: lastError })
    } else if (running) {
      // 下载类调用（不论是否超时）→ 查宿主状态，区分"仍在下载（显示百分比）"与"下载异常中断（可打断）"
      const downloadCall = runningCalls.find(call => isDownloadCall(call.argsRaw))
      // 非下载类的超时调用 → 疑似卡死
      const stuck = runningCalls.find(call => Date.now() - call.time > STUCK_THRESHOLD_MS && !isDownloadCall(call.argsRaw))
      if (downloadCall !== undefined) {
        void checkDownload(downloadCall.name, downloadCall.argsRaw, downloadCall.time)
        text = '正在检查下载状态…'
        marker = null
      } else if (stuck !== undefined) {
        text = `疑似卡死：工具“${stuck.name}”已运行 ${formatDuration(Date.now() - stuck.time)} 未返回，请考虑中断任务或检查网络`
        marker = extractMarker(stuck.argsRaw)
      } else if (runningCalls.length > 0) {
        text = `${s.runningText}（正在执行：${runningCalls.map(call => call.name).join('、')}）`
      } else {
        text = s.runningText
      }
    }
    setStuckMarker(marker)
    setResult(text)
    setOpen(true)
  }
  /** 下载类任务：查宿主状态并按结果分支展示（百分比优先，拿不到总大小退 MB）。 */
  const checkDownload = async (toolName: string, argsRaw: string, startTime: number): Promise<void> => {
    const marker = extractMarker(argsRaw)
    const outPath = extractOutPath(argsRaw)
    const fileName = outPath !== null ? outPath.split(/[\\/]/).pop() : (marker ?? '文件')
    const status = await fetchDownloadStatus(marker ?? '', outPath)
    if (status === null) {
      // 宿主状态查询不可用：用当前会话上下文（runningCalls 里有该调用 + 已运行时长）
      // 输出"仍在运行、无法计算进度"，不判定卡死
      setResult(`正在执行 ${toolName}（下载/安装类命令，已运行 ${formatDuration(Date.now() - startTime)}），无法计算下载进度，任务仍在进行，请耐心等待`)
      setStuckMarker(null)
      return
    }
    if (status.active) {
      if (outPath === null) {
        // 无输出文件的下载/安装类命令（如 pip install）：进程活跃 = 仍在下载，但读不到进度
        setResult(`正在执行 ${toolName}（下载/安装类命令，无输出文件可读，无法计算进度），任务仍在进行，请耐心等待`)
      } else {
        const pct = formatPercent(status.fileSizeBytes, status.totalBytes)
        setResult(pct !== null
          ? `正在下载 ${fileName}，进度 ${pct}，下载仍在继续，请耐心等待`
          : `正在下载 ${fileName}，已下载 ${formatSize(status.fileSizeBytes)}，下载仍在继续，请耐心等待`)
      }
      setStuckMarker(null)
    } else {
      // 下载进程已退出 → 异常中断，提供强制终止
      if (outPath === null) {
        setResult(`下载/安装命令（${toolName}）已退出，可能异常中断，任务可能还卡在等待返回值，可强制终止`)
      } else {
        const pct = formatPercent(status.fileSizeBytes, status.totalBytes)
        setResult(pct !== null
          ? `下载出现异常中断：${fileName} 的下载进程已退出（进度停留在 ${pct}），任务可能还卡在等待返回值，可强制终止`
          : `下载出现异常中断：${fileName} 的下载进程已退出（文件停留在 ${formatSize(status.fileSizeBytes)}），任务可能还卡在等待返回值，可强制终止`)
      }
      setStuckMarker(marker)
    }
  }
  const onForceKill = async (): Promise<void> => {
    if (stuckMarker === null) return
    setKilling(true)
    setKillMessage('')
    try {
      const response = await fetch('/dsh-task-control/kill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marker: stuckMarker }),
      })
      const data = await response.json().catch(() => null)
      // 杀掉卡住的进程后再 cancel，任务才能立即停止（而非排到工具返回值后面）
      cancelSession()
      const killed = typeof data?.killed === 'number' ? data.killed : 0
      setKillMessage(killed > 0
        ? `已强制终止 ${killed} 个卡住的进程，任务正在停止…`
        : '未找到匹配的卡住进程（可能已自行结束），已发送停止指令')
    } catch (error) {
      console.warn('[dsh-task-control] 强制终止失败:', error)
      setKillMessage('强制终止失败：宿主通道不可用，已发送停止指令')
    } finally {
      setKilling(false)
    }
  }
  return (
    <>
      <TaskButton label={s.checkLabel} onClick={onClick} />
      {open && createPortal(
        <CheckModal
          result={result}
          onClose={() => setOpen(false)}
          stuckMarker={stuckMarker}
          killing={killing}
          killMessage={killMessage}
          onForceKill={() => { void onForceKill() }}
        />,
        document.body,
      )}
    </>
  )
}

/** 追加条件相关的文本（定稿硬编码，不进设置）。 */
const PAUSE_HINT = '选择操作：仅暂停任务，或输入条件后带条件重跑'
const APPEND_TEMPLATE = '补充条件：{条件}，请据此重新执行刚才的任务'
/** 结构化恢复指令：明确"恢复原任务"，不让模型自由发挥（对应"恢复决策硬门"方向）。 */
const RESUME_TEXT = '任务已恢复，请继续执行原任务，不要重新开始'
/** 任务未运行时点击追加条件的提示。 */
const NO_TASK_NOTICE = '当前没有正在运行的任务'

/** 急停确认弹窗：警告 + 复选框（勾选后才能点确认，防误触）。 */
interface EmergencyConfirmModalProps {
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}
function EmergencyConfirmModal({ onCancel, onConfirm, busy }: EmergencyConfirmModalProps) {
  const [checked, setChecked] = useState(false)
  return (
    <ModalShell onClose={onCancel}>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
        如果现在急停会导致下载任务丢失，重新启动后需要全部重新下载
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>我了解急停会导致下载进度丢失，仍要急停</span>
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}>取消</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!checked || busy}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '4px 14px',
            background: 'var(--dsw-alias-state-error-primary)',
            color: '#fff',
            cursor: !checked || busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: '20px',
            opacity: !checked || busy ? 0.4 : 1,
          }}
        >
          {busy ? '正在急停…' : '确认急停'}
        </button>
      </div>
    </ModalShell>
  )
}

/**
 * 急停结果弹窗：三态反馈 + 恢复决策点。
 * - stopping：cancel 已送达（accepted），等待工具协作退出；
 * - done：任务真正停止；
 * - decision：被中断工具结果未知（TOOL_OUTCOME_UNKNOWN 插件层等价物）→ 显式选择恢复方式。
 */
interface EmergencyResultModalProps {
  phase: 'stopping' | 'done' | 'decision'
  result: string
  interrupted: { callId: string; name: string }[]
  onClose: () => void
  onDecide: (choice: 'verify' | 'rerun' | 'skip') => void
}
function EmergencyResultModal({ phase, result, interrupted, onClose, onDecide }: EmergencyResultModalProps) {
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
        {result}
      </div>
      {phase === 'decision' && interrupted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>恢复前请先决定如何处理被中断的工具：</div>
          <button type="button" onClick={() => onDecide('verify')} style={{ textAlign: 'left' }}>
            ① 验证外部状态（检查文件/进程/日志，确认是否有副作用）
          </button>
          <button type="button" onClick={() => onDecide('rerun')} style={{ textAlign: 'left' }}>
            ② 重新执行该工具
          </button>
          <button type="button" onClick={() => onDecide('skip')} style={{ textAlign: 'left' }}>
            ③ 跳过，从当前状态继续
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {phase === 'stopping' && (
          <button type="button" onClick={onClose}>后台等待</button>
        )}
        {phase !== 'stopping' && (
          <button type="button" onClick={onClose}>确定</button>
        )}
      </div>
    </ModalShell>
  )
}

/**
 * 急停按钮（input.right，拍一下左侧）：一键强制终止当前任务。
 * 场景：下载/安装进行中（不报错、未超时）时，「拍一下」不会弹强制终止，
 * 而 session.cancel（原生停止/追加条件）会被排在未返回的工具调用后面无响应——
 * 急停直接按命令特征杀进程 + cancel，让用户随时能停掉任务更换方案。
 * 防误触：点击先弹警告（勾选"了解丢失进度"后才能点确认）。
 * 三态反馈：accepted（已发送停止指令）→ stopping（等待工具退出）→ idle（真正停止）；
 * 被中断工具结果未知时弹出恢复决策点（验证外部状态 / 重跑 / 跳过），隐形注入恢复。
 */
type EmergencyButtonProps = PropsRuntime<'conversation.input.right'> & AppendInjected
export function EmergencyButton({ useSession, cancelSession, resumeTask }: EmergencyButtonProps) {
  const s = useSettings()
  const running = useSession(snapshot => snapshot.running)
  const runningCalls = useSession(
    snapshot => snapshot.runningCalls,
    // 内容级比较：runningCalls 每次快照都是新数组引用，但内容未变时不触发重渲染
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  )
  // nodes 是大数组且每次快照都是新引用：eq 恒 true 避免每次快照都触发重渲染（卡顿元凶），
  // 组件因 running 变化重渲染时仍会重新求值拿到最新 nodes（useSyncExternalStoreWithSelector 语义）
  const nodes = useSession(snapshot => snapshot.nodes, () => true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'stopping' | 'done' | 'decision'>('done')
  const [result, setResult] = useState('')
  const [interrupted, setInterrupted] = useState<{ callId: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)

  /** 点击急停：空闲直接提示；运行中先弹确认警告。 */
  const onTap = (): void => {
    if (!running) {
      setResult(NO_TASK_NOTICE)
      setPhase('done')
      setOpen(true)
      return
    }
    setConfirmOpen(true)
  }

  /** stopping 态观察：running true→false = 真正停止，检查被中断工具结果。 */
  useEffect(() => {
    if (phase !== 'stopping') return
    if (running) return
    // 任务已停止：查快照中每个被中断工具是否有成功 tool-result
    const unknown = interrupted.filter(t => {
      const settled = nodes.some(n =>
        (n as { kind?: string }).kind === 'tool-result'
        && (n as { callId?: string }).callId === t.callId
        && (n as { isError?: boolean }).isError === false)
      return !settled
    })
    if (unknown.length > 0) {
      setInterrupted(unknown)
      setPhase('decision')
      setResult(`任务已停止，但被中断的工具（${unknown.map(t => t.name).join('、')}）结果未知——可能未完成或产生了副作用（TOOL_OUTCOME_UNKNOWN）`)
    } else {
      setPhase('done')
      setResult('任务已停止，被中断的工具已确认完成，可直接继续')
    }
  }, [running, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 勾选确认后执行急停：收集所有未返回工具调用的命令特征，逐个杀进程 + cancel。 */
  const doEmergency = async (): Promise<void> => {
    if (busy) return
    setConfirmOpen(false)
    setBusy(true)
    try {
      // 记录被中断的工具（callId + 名称），供恢复决策使用
      const inter = runningCalls.map(call => ({ callId: call.callId, name: call.name }))
      setInterrupted(inter)
      const markers = [...new Set(
        runningCalls
          .map(call => extractMarker(call.argsRaw))
          .filter((m): m is string => m !== null),
      )].slice(0, 3)
      let killed = 0
      for (const marker of markers) {
        try {
          const response = await fetch('/dsh-task-control/kill', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ marker }),
          })
          const data = await response.json().catch(() => null)
          killed += typeof data?.killed === 'number' ? data.killed : 0
        } catch {
          // 单个失败继续尝试下一个
        }
      }
      // 杀进程后 cancel，任务立即停止（而非排到工具返回值后面）
      cancelSession()
      // 进入 stopping 态：cancel 已送达（accepted），等待工具真正退出（idle）
      setResult(killed > 0
        ? '已发送停止指令，正在等待工具协作退出…（accepted → stopping）'
        : markers.length > 0
          ? '已发送停止指令，正在等待工具协作退出…（未匹配到可终止的进程）'
          : '已发送停止指令，正在等待任务停止…')
      setPhase(inter.length > 0 || killed > 0 ? 'stopping' : 'done')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  /** 恢复决策：按用户选择隐形注入恢复指令。 */
  const decideResume = (choice: 'verify' | 'rerun' | 'skip'): void => {
    setOpen(false)
    const names = interrupted.map(t => t.name).join('、')
    let text: string
    if (choice === 'verify') {
      text = `被急停中断的工具（${names}）结果未知，请先验证外部状态（检查文件/进程/日志确认是否有副作用），确认后再决定继续或修复，不要盲目重试`
    } else if (choice === 'rerun') {
      text = `请重新执行被急停中断的工具（${names}，上次结果未知）`
    } else {
      text = `请跳过被急停中断的工具（${names}），从当前状态继续原任务`
    }
    setTimeout(() => resumeTask(text), 400)
  }

  return (
    <>
      <TaskButton label={s.emergencyLabel} variant="danger" onClick={onTap} />
      {confirmOpen && createPortal(
        <EmergencyConfirmModal
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { void doEmergency() }}
          busy={busy}
        />,
        document.body,
      )}
      {open && createPortal(
        <EmergencyResultModal
          phase={phase}
          result={result}
          interrupted={interrupted}
          onClose={() => setOpen(false)}
          onDecide={decideResume}
        />,
        document.body,
      )}
    </>
  )
}

/**
 * 判定"疑似卡死"的工具调用时长阈值（毫秒）。
 * 超过该时长仍无结果的工具调用视为卡住（如网络卡死的大下载）。
 */
const STUCK_THRESHOLD_MS = 10 * 60 * 1000

/** 毫秒 → "x分y秒" 人类可读时长。 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
}

/**
 * 从卡住的工具调用参数里提取"命令特征"（URL / 文件名 / 引号内路径），
 * 供宿主按命令行匹配并杀掉对应进程。
 */
function extractMarker(argsRaw: string): string | null {
  const url = argsRaw.match(/https?:\/\/[^\s"'）)]+/)
  if (url) return url[0].slice(0, 160)
  const file = argsRaw.match(/[\w.-]+\.(?:zip|exe|msi|whl|tar|gz|7z|py|ps1|bat|sh|json)\b/i)
  if (file) return file[0]
  const quoted = argsRaw.match(/['"]([^'"]{4,160})['"]/)
  if (quoted) return quoted[1]
  return null
}

/** 判断工具调用是否为下载/安装类（curl/wget/iwr/-o/OutFile/pip install）。 */
function isDownloadCall(argsRaw: string): boolean {
  return /pip install|curl|wget|Invoke-WebRequest|\biwr\b|-o\s|--output|OutFile/i.test(argsRaw)
}

/** 从下载命令里提取输出文件路径（-o / -OutFile 参数）。 */
function extractOutPath(argsRaw: string): string | null {
  const m = argsRaw.match(/(?:-o|--output|-OutFile)\s+['"]?([^'"\s]+\.\w+)/i)
  return m ? m[1] : null
}

/** 宿主查询下载状态：active=是否仍在下载；fileSizeBytes=-1 未找到文件；totalBytes=-1 总大小未知。 */
interface DownloadStatus {
  active: boolean
  procCount: number
  fileSizeBytes: number
  totalBytes: number
}
async function fetchDownloadStatus(marker: string, outPath: string | null): Promise<DownloadStatus | null> {
  try {
    const response = await fetch('/dsh-task-control/download-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marker, outPath }),
    })
    if (!response.ok) return null
    const data = await response.json()
    return typeof data?.active === 'boolean' ? data : null
  } catch {
    return null
  }
}

/** 字节 → "x.x MB" 人类可读大小（负数视为未知）。 */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知'
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** 下载百分比（总大小未知时返回 null，调用方退回 MB 显示）。 */
function formatPercent(fileSizeBytes: number, totalBytes: number): string | null {
  if (totalBytes > 0 && fileSizeBytes >= 0) {
    const pct = Math.min(100, Math.round((fileSizeBytes / totalBytes) * 100))
    return `${pct}%`
  }
  return null
}

/**
 * 主操作按钮：与发送按钮同风格——info-fill 蓝色底、静态白字、胶囊圆角，
 * hover 用 info-hover（与 InputBar 的 primary send 配方一致，深浅色自动适配）。
 * variant='danger' 时用错误状态红（state-error-primary）做底、白字，其余样式完全同步。
 */
function TaskButton({ label, onClick, variant }: { label: string; onClick: () => void; variant?: 'danger' }) {
  const [hover, setHover] = useState(false)
  const danger = variant === 'danger'
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
        background: danger
          ? 'var(--dsw-alias-state-error-primary)'
          : hover ? 'var(--dsw-alias-button-info-hover)' : 'var(--dsw-alias-button-info-fill)',
        color: '#fff',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
        filter: danger && hover ? 'brightness(0.9)' : 'none',
        transition: 'filter 100ms ease',
      }}
    >
      {label}
    </button>
  )
}

/** 追加/暂停弹窗：单视图，固定提示"程序已暂停"。 */
interface AppendModalProps {
  hint: string
  onSubmit: (condition: string) => void
  onCancel: () => void
  onKeepPaused: () => void
}
function AppendModal({ hint, onSubmit, onCancel, onKeepPaused }: AppendModalProps) {
  const [value, setValue] = useState('')
  const commit = (): void => onSubmit(value.trim())
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') onCancel()
  }
  return (
    <ModalShell onClose={onCancel}>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>{hint}</div>
      <div style={{ fontSize: 14, marginBottom: 10, color: 'var(--dsw-alias-state-warn-primary)' }}>
        程序已暂停
      </div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="补充条件（留空 = 恢复原任务）"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          color: 'var(--dsw-alias-label-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onKeepPaused}
          style={{
            border: '1px solid var(--dsw-alias-state-warn-primary)',
            borderRadius: 999,
            padding: '4px 12px',
            background: 'transparent',
            color: 'var(--dsw-alias-state-warn-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: '20px',
          }}
        >
          保持暂停
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel}>继续</button>
          <button type="button" onClick={commit}>确定</button>
        </div>
      </div>
    </ModalShell>
  )
}

/** 追加/暂停按钮的注入面：宿主注入的中止与"隐形恢复"能力。 */
export interface AppendInjected {
  cancelSession: () => void
  resumeTask: (text: string) => void
}

/** 追加/暂停按钮（input.right）。 */
type AppendButtonProps = PropsRuntime<'conversation.input.right'> & AppendInjected
export function AppendButton({ resumeTask, cancelSession, useSession }: AppendButtonProps) {
  const s = useSettings()
  const running = useSession(snapshot => snapshot.running)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const onOpen = (): void => {
    if (!running) {
      // 任务未运行：不弹输入窗（避免把"继续"发给空闲的 AI）
      setNotice(true)
      return
    }
    // 点击立即暂停（客户端 RPC cancel，可靠，不依赖宿主路由）
    cancelSession()
    setResetKey((k) => k + 1)
    setOpen(true)
  }
  const onKeepPaused = (): void => {
    // 保持暂停：关闭弹窗，不恢复（任务保持暂停状态）
    setOpen(false)
  }
  const onSubmit = (condition: string): void => {
    setOpen(false)
    const text = condition !== ''
      ? renderTemplate(APPEND_TEMPLATE, { 条件: condition })
      : RESUME_TEXT
    // 结构化恢复：带条件重跑或恢复原任务
    setTimeout(() => resumeTask(text), 400)
  }
  const onCancel = (): void => {
    // 关闭弹窗 = 恢复原任务
    setOpen(false)
    setTimeout(() => resumeTask(RESUME_TEXT), 400)
  }
  return (
    <>
      <TaskButton label={s.appendLabel} onClick={onOpen} />
      {open && createPortal(
        <AppendModal
          key={resetKey}
          hint={PAUSE_HINT}
          onSubmit={onSubmit}
          onCancel={onCancel}
          onKeepPaused={onKeepPaused}
        />,
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
