/**
 * dsh-task-control 宿主半（Node 端）。
 *
 * 通道：
 *   - /dsh-task-control/resume  恢复/追加条件：客户端 fetch POST，宿主把文本以
 *     插件来源消息（source: { kind: 'plugin' }）注入目标会话（agent.followup）——
 *     模型照常执行，但聊天界面只渲染成低调的 ContextInjectionRow，而非用户气泡。
 *   - /dsh-task-control/kill    强制终止：agent 卡死在未返回的工具调用（如网络卡死的
 *     大下载）时，session.cancel 会被排在工具返回值后面无法立即生效；本路由按客户端
 *     提供的命令特征（URL/文件名）找到并杀掉卡住的工具子进程——工具调用随即返回，
 *     turn 结束，任务真正停止。
 *
 * 不 import 任何 @deepseek-ai 包：外部插件包位于 ~/.dsh/profiles/node_modules，
 * 模块解析找不到仓库内的 workspace 依赖（与 a4phone dsh-hook 的约定一致），
 * 用户消息对象按 dsh-llm 的 createUserMessage 形状手工构造；
 * node: 内置模块（child_process 等）可用。
 */
import { spawnSync } from 'node:child_process'

export const name = 'dsh-task-control'
export const inject = ['agents', 'webServer']

const MAX_BODY_BYTES = 64 * 1024

/** 轻量 loopback 校验：路由挂在 web 进程上，仅接受本机来源。 */
function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return false
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
}

/** 读取请求体并限制大小（拒超大请求，防内存滥用）。 */
function readBody(req: {
  on(event: 'data', cb: (chunk: Buffer) => void): unknown
  on(event: 'end', cb: () => void): unknown
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

/** 构造插件来源的用户消息（形状对齐 dsh-llm 的 createUserMessage）。 */
function buildPluginMessage(text: string) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-task-control' },
  }
}

/** 绝对路径规避 PATH 不含 System32 的环境。 */
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

/** 跑一条 PowerShell 脚本并返回 stdout（失败时返回 undefined，错误透出便于排查）。 */
function runPowerShell(script: string): { stdout: string; error?: string } | undefined {
  let result
  try {
    result = spawnSync(
      POWERSHELL,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 20_000, windowsHide: true },
    )
  } catch (error) {
    return { stdout: '', error: `spawn failed: ${String(error)}` }
  }
  if (result.error !== undefined) return { stdout: '', error: `spawn error: ${String(result.error)}` }
  if (result.status !== 0) {
    return { stdout: '', error: `exit ${String(result.status)}: ${String(result.stderr ?? '').slice(0, 200)}` }
  }
  return { stdout: (result.stdout ?? '').trim() }
}

/**
 * 按命令特征杀掉卡住的工具进程。
 * @param marker - 客户端从卡住的 tool/call 参数里提取的特征（URL/文件名）。
 * @returns 杀掉的进程数（error 字段携带失败原因，便于排查）。
 */
function killStuckProcesses(marker: string): { killed: number; error?: string } {
  // 清洗特征，防 PowerShell 字符串注入（单引号/引号字符全部去掉）
  const clean = marker.replace(/['"`]/g, '').slice(0, 200)
  if (clean === '') return { killed: 0, error: 'empty marker' }
  const script =
    `$m = [regex]::Escape('${clean}'); `
    + `$t = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.ProcessId -ne $PID -and $_.CommandLine -match $m }); `
    + `$t | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; `
    + `$t.Count`
  const result = runPowerShell(script)
  if (result === undefined || result.error !== undefined) return { killed: 0, error: result?.error }
  const count = Number.parseInt(result.stdout, 10)
  return { killed: Number.isFinite(count) ? count : 0 }
}

/**
 * 查询下载类任务状态：相关进程是否活跃（仍在下载）+ 输出文件当前大小（进度）。
 * @param marker - 命令特征（URL/文件名）。
 * @param outPath - 下载输出文件路径（从命令的 -o/-OutFile 提取，可缺省）。
 * @returns active=是否仍在下载；fileSizeBytes=-1 表示未找到文件。
 */
function queryDownloadStatus(marker: string, outPath: string): {
  active: boolean; procCount: number; fileSizeBytes: number; totalBytes: number; error?: string
} {
  const m = marker.replace(/['"`]/g, '').slice(0, 200)
  const p = outPath.replace(/['"`]/g, '').slice(0, 300)
  if (m === '' && p === '') return { active: false, procCount: 0, fileSizeBytes: -1, totalBytes: -1, error: 'empty marker' }
  // marker 若本身是 URL，则对 URL 发 HEAD 探测 Content-Length 作为总大小（算百分比用）
  const url = /^https?:\/\//i.test(m) ? m.slice(0, 300) : ''
  const script =
    `$m = [regex]::Escape('${m}'); `
    + `$procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.ProcessId -ne $PID -and $_.CommandLine -match $m }); `
    + `$size = -1; `
    + (p === '' ? '' : `if (Test-Path -LiteralPath '${p}') { $size = (Get-Item -LiteralPath '${p}').Length } `)
    + (url === ''
      ? '$total = -1; '
      : `$total = -1; try { $h = Invoke-WebRequest -Uri '${url}' -Method Head -TimeoutSec 10 -UseBasicParsing; $total = [int64]$h.Headers['Content-Length'] } catch {} `)
    + `Write-Output ("$($procs.Count)|$size|$total")`
  const result = runPowerShell(script)
  if (result === undefined || result.error !== undefined) {
    return { active: false, procCount: 0, fileSizeBytes: -1, totalBytes: -1, error: result?.error }
  }
  const [countStr, sizeStr, totalStr] = result.stdout.split('|')
  const procCount = Number.parseInt(countStr ?? '', 10)
  const fileSizeBytes = Number.parseInt(sizeStr ?? '', 10)
  const totalBytes = Number.parseInt(totalStr ?? '', 10)
  return {
    active: Number.isFinite(procCount) && procCount > 0,
    procCount: Number.isFinite(procCount) ? procCount : 0,
    fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : -1,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : -1,
  }
}

/** 宿主插件入口：挂载 /dsh-task-control/resume 与 /dsh-task-control/kill 路由。 */
export function apply(ctx: any): (() => void) | undefined {
  const webServer = ctx.get('webServer')
  const agents = ctx.get('agents')
  if (webServer === undefined || agents === undefined) {
    ctx.logger?.warn?.('dsh-task-control: webServer/agents 服务不可用，宿主通道未挂载（恢复将退回可见消息）')
    return undefined
  }

  const disposers: Array<() => void> = []
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-task-control/resume',
    handler: async (req: any, res: any) => {
      const respond = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      try {
        if (req.method !== 'POST') return respond(405, { ok: false, error: 'method not allowed' })
        if (!isLoopbackHost(req.headers?.host)) return respond(403, { ok: false, error: 'forbidden' })
        const raw = await readBody(req)
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          return respond(400, { ok: false, error: 'invalid json' })
        }
        const sessionId = typeof parsed?.sessionId === 'string' ? parsed.sessionId : ''
        const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
        if (sessionId === '' || text === '') {
          return respond(400, { ok: false, error: 'sessionId 与 text 必填' })
        }
        const agent = agents.get(sessionId)
        if (agent === undefined) {
          return respond(404, { ok: false, error: 'session not found' })
        }
        // 以插件来源消息唤醒下一轮（模型照常执行，界面只显示低调上下文行）
        agent.followup(buildPluginMessage(text))
        respond(200, { ok: true })
      } catch (error) {
        ctx.logger?.warn?.('dsh-task-control: resume 请求处理失败: %s', String(error))
        if (!res.headersSent) respond(500, { ok: false, error: 'internal error' })
      }
    },
  }))

  // ── 下载状态查询：区分"仍在下载"与"下载异常中断" ────────────────
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-task-control/download-status',
    handler: async (req: any, res: any) => {
      const respond = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      try {
        if (req.method !== 'POST') return respond(405, { ok: false, error: 'method not allowed' })
        if (!isLoopbackHost(req.headers?.host)) return respond(403, { ok: false, error: 'forbidden' })
        const raw = await readBody(req)
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          return respond(400, { ok: false, error: 'invalid json' })
        }
        const marker = typeof parsed?.marker === 'string' ? parsed.marker : ''
        const outPath = typeof parsed?.outPath === 'string' ? parsed.outPath : ''
        const status = queryDownloadStatus(marker, outPath)
        respond(200, {
          ok: true,
          active: status.active,
          procCount: status.procCount,
          fileSizeBytes: status.fileSizeBytes,
          totalBytes: status.totalBytes,
          ...(status.error === undefined ? {} : { error: status.error }),
        })
      } catch (error) {
        ctx.logger?.warn?.('dsh-task-control: download-status 请求处理失败: %s', String(error))
        if (!res.headersSent) respond(500, { ok: false, error: 'internal error' })
      }
    },
  }))

  // ── 强制终止：杀掉卡住的工具进程 ──────────────────────────────────
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-task-control/kill',
    handler: async (req: any, res: any) => {
      const respond = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      try {
        if (req.method !== 'POST') return respond(405, { ok: false, error: 'method not allowed' })
        if (!isLoopbackHost(req.headers?.host)) return respond(403, { ok: false, error: 'forbidden' })
        const raw = await readBody(req)
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          return respond(400, { ok: false, error: 'invalid json' })
        }
        const marker = typeof parsed?.marker === 'string' ? parsed.marker.trim() : ''
        if (marker === '') {
          return respond(400, { ok: false, error: 'marker 必填（卡住工具的命令特征，如 URL/文件名）' })
        }
        const outcome = killStuckProcesses(marker)
        respond(200, { ok: true, killed: outcome.killed, ...(outcome.error === undefined ? {} : { error: outcome.error }) })
      } catch (error) {
        ctx.logger?.warn?.('dsh-task-control: kill 请求处理失败: %s', String(error))
        if (!res.headersSent) respond(500, { ok: false, error: 'internal error' })
      }
    },
  }))

  return () => { for (const dispose of disposers) dispose() }
}
