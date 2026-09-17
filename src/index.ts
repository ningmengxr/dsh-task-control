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
import { readFileSync, writeFileSync, mkdirSync, rmSync, lstatSync, copyFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

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

/**
 * 查询 pwsh 运行状态：进程是否活跃 + 瞬时 IO 速率（判断是否卡住）+ 输出文件大小 + URL 总量（百分比）。
 * 与下载检测同一思路，但针对 pwsh 这类通用工具：不依赖 10 分钟卡死阈值，点击即查。
 * @param marker  - 命令特征（URL/文件名，可空；空时取最新启动的 pwsh 进程兜底）。
 * @param outPath - 输出文件路径（从命令的 -o/-OutFile 提取，可缺省）。
 * @returns active=进程存活；ioBytesPerSec=瞬时 IO 速率（性能计数器，0≈无活动）；fileSizeBytes=-1 未找到文件；totalBytes=-1 总量未知。
 */
function queryPwshStatus(marker: string, outPath: string): {
  active: boolean; procCount: number; ioBytesPerSec: number; fileSizeBytes: number; totalBytes: number; error?: string
} {
  const m = marker.replace(/['"`]/g, '').slice(0, 200)
  const p = outPath.replace(/['"`]/g, '').slice(0, 300)
  if (m === '' && p === '') return { active: false, procCount: 0, ioBytesPerSec: 0, fileSizeBytes: -1, totalBytes: -1, error: 'empty marker' }
  // marker 若本身是 URL，则对 URL 发 HEAD 探测 Content-Length 作为总大小（算百分比用）
  const url = /^https?:\/\//i.test(m) ? m.slice(0, 300) : ''
  const script =
    `$procs = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'pwsh|powershell') -and $_.ProcessId -ne $PID }); `
    + (m === ''
      ? `$procs = @($procs | Sort-Object CreationDate -Descending | Select-Object -First 1); `
      : `$procs = @($procs | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape('${m}') }); `)
    + `if ($procs.Count -eq 0) { Write-Output '0|0|-1|-1'; exit } `
    + `$null = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$($procs[0].ProcessId)"; `
    + `Start-Sleep -Milliseconds 300; `
    + `$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$($procs[0].ProcessId)"; `
    + `$io = 0; if ($perf) { $io = [long]$perf.IODataBytesPersec } `
    + `$size = -1; `
    + (p === '' ? '' : `if (Test-Path -LiteralPath '${p}') { $size = (Get-Item -LiteralPath '${p}').Length } `)
    + (url === ''
      ? '$total = -1; '
      : `$total = -1; try { $h = Invoke-WebRequest -Uri '${url}' -Method Head -TimeoutSec 10 -UseBasicParsing; $total = [int64]$h.Headers['Content-Length'] } catch {} `)
    + `Write-Output ("$($procs.Count)|$io|$size|$total")`
  const result = runPowerShell(script)
  if (result === undefined || result.error !== undefined) {
    return { active: false, procCount: 0, ioBytesPerSec: 0, fileSizeBytes: -1, totalBytes: -1, error: result?.error }
  }
  const [countStr, ioStr, sizeStr, totalStr] = result.stdout.split('|')
  const procCount = Number.parseInt(countStr ?? '', 10)
  const ioBytesPerSec = Number.parseInt(ioStr ?? '', 10)
  const fileSizeBytes = Number.parseInt(sizeStr ?? '', 10)
  const totalBytes = Number.parseInt(totalStr ?? '', 10)
  return {
    active: Number.isFinite(procCount) && procCount > 0,
    procCount: Number.isFinite(procCount) ? procCount : 0,
    ioBytesPerSec: Number.isFinite(ioBytesPerSec) ? ioBytesPerSec : 0,
    fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : -1,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : -1,
  }
}

// ═══════════════════════════ 自动更新 ═══════════════════════════
// 启动时静默检查 npm 最新版本；真实安装（非 junction/软链）且有新版时，
// 自动下载 tarball 并用系统 tar.exe 解压，备份旧版后覆盖本包文件，
// 最后日志提示"重启 DSH 生效"。开发机 junction 安装自动跳过（防止覆盖源码）。
// 任何失败都静默/降级，绝不阻塞插件功能。

const PKG_NAME = 'dsh-task-control'
const NPM_LATEST_URL = 'https://registry.npmjs.org/dsh-task-control/latest'
/** 本包目录：lib/index.js 的上一级（npm 安装时 = node_modules/dsh-task-control）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = join(LIB_DIR, '..')

/** 读取本地 package.json 版本；读取失败返回 null。 */
function readLocalVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/** 查询 npm 最新版本与 tarball 地址；失败返回 null（静默）。 */
async function fetchNpmLatest(): Promise<{ version: string; tarball: string } | null> {
  try {
    const res = await fetch(NPM_LATEST_URL, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data: any = await res.json()
    if (typeof data?.version !== 'string') return null
    const tarball = typeof data?.dist?.tarball === 'string' ? data.dist.tarball : ''
    return { version: data.version, tarball }
  } catch {
    return null
  }
}

/** 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0。 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/** 递归复制目录。 */
function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    const s = join(src, name)
    const d = join(dst, name)
    if (lstatSync(s).isDirectory()) copyDir(s, d)
    else copyFileSync(s, d)
  }
}

/** 自动更新流程（apply 时异步触发，不阻塞插件）。 */
async function autoUpdate(logger: any): Promise<void> {
  try {
    const local = readLocalVersion()
    if (local === null) return
    // 开发机 junction/软链安装 → 跳过（开发者自己走 build.mjs）
    let isLink = false
    try {
      isLink = lstatSync(PKG_DIR).isSymbolicLink()
    } catch {
      return
    }
    if (isLink) {
      logger?.info?.('dsh-task-control: 开发模式安装（软链/junction），跳过自动更新（当前 v%s）', local)
      return
    }
    const latest = await fetchNpmLatest()
    if (latest === null) return // 网络失败：静默
    if (compareVersions(latest.version, local) <= 0) return // 已是最新
    logger?.info?.('dsh-task-control: 发现新版本 v%s（当前 v%s），开始自动更新…', latest.version, local)
    if (latest.tarball === '') {
      logger?.warn?.('dsh-task-control: 新版本 tarball 地址缺失，自动更新中止')
      return
    }
    // 下载 tarball
    const dlRes = await fetch(latest.tarball, { signal: AbortSignal.timeout(30_000) })
    if (!dlRes.ok) {
      logger?.warn?.('dsh-task-control: 下载新版本失败 HTTP %s，自动更新中止', String(dlRes.status))
      return
    }
    const tgz = Buffer.from(await dlRes.arrayBuffer())
    const tmp = join(tmpdir(), `${PKG_NAME}-update-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'pkg.tgz'), tgz)
    // 系统 tar.exe 解压（Windows 10+ 自带，规避 PATH 缺 System32）
    const tarExe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    const tar = spawnSync(tarExe, ['-xzf', join(tmp, 'pkg.tgz'), '-C', tmp], { timeout: 20_000 })
    if (tar.status !== 0) {
      logger?.warn?.('dsh-task-control: 解压新版本失败，自动更新中止')
      rmSync(tmp, { recursive: true, force: true })
      return
    }
    const pkgSrc = join(tmp, 'package')
    if (!existsSync(join(pkgSrc, 'package.json'))) {
      logger?.warn?.('dsh-task-control: 解压内容异常（缺 package.json），自动更新中止')
      rmSync(tmp, { recursive: true, force: true })
      return
    }
    // 备份当前包（排除 node_modules）
    const backupDir = `${PKG_DIR}.bak-${local}`
    rmSync(backupDir, { recursive: true, force: true })
    mkdirSync(backupDir, { recursive: true })
    for (const name of readdirSync(PKG_DIR)) {
      if (name === 'node_modules') continue
      if (lstatSync(join(PKG_DIR, name)).isDirectory()) copyDir(join(PKG_DIR, name), join(backupDir, name))
      else copyFileSync(join(PKG_DIR, name), join(backupDir, name))
    }
    // 覆盖为新版本内容
    for (const name of readdirSync(pkgSrc)) {
      rmSync(join(PKG_DIR, name), { recursive: true, force: true })
      if (lstatSync(join(pkgSrc, name)).isDirectory()) copyDir(join(pkgSrc, name), join(PKG_DIR, name))
      else copyFileSync(join(pkgSrc, name), join(PKG_DIR, name))
    }
    rmSync(tmp, { recursive: true, force: true })
    logger?.info?.('dsh-task-control: 已自动更新 v%s → v%s（旧版备份：%s），请重启 DSH 生效', local, latest.version, backupDir)
  } catch (error) {
    logger?.warn?.('dsh-task-control: 自动更新异常: %s', String(error))
  }
}

/** 宿主插件入口：挂载 /dsh-task-control/resume 与 /dsh-task-control/kill 路由。 */
export function apply(ctx: any): (() => void) | undefined {
  // 自动更新：异步后台检查，不阻塞插件启动
  void autoUpdate(ctx.logger)
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

  // ── safe-wait 暂停：等待工具完成边界后落地 ─────────────────────────
  // sessionId → { mode: 'safe' }：请求 safe 暂停时若工具在跑，先挂起，等 tool/result 再 cancel
  const pendingPauses = new Map<string, { mode: 'safe' }>()
  const onSessionEvent = (session: any, event: any): void => {
    const key = String(session.id)
    if (!pendingPauses.has(key)) return
    if (event.type !== 'tool/result') return
    pendingPauses.delete(key)
    const agent = agents.get(session.id)
    if (agent !== undefined && agent.status === 'running') {
      agent.cancel({ kind: 'user' }, { keepInbox: true })
    }
  }
  ctx.on('session/event', onSessionEvent)

  // ── 暂停路由：force = 立即 cancel（keepInbox）；safe = 等工具完成边界 ──
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-task-control/pause',
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
        const mode = parsed?.mode === 'force' || parsed?.mode === 'safe' ? parsed.mode : 'safe'
        if (sessionId === '') {
          return respond(400, { ok: false, error: 'sessionId 必填' })
        }
        const agent = agents.get(sessionId)
        if (agent === undefined) {
          return respond(404, { ok: false, error: 'session not found' })
        }
        if (agent.status !== 'running') {
          return respond(200, { ok: true, mode, applied: false, message: '任务未在运行，无需暂停' })
        }
        if (mode === 'force') {
          // force：立即中断 turn，保留 inbox（恢复时无需重新输入）
          agent.cancel({ kind: 'user' }, { keepInbox: true })
          return respond(200, { ok: true, mode, applied: true, message: '已强制暂停（cancel + keepInbox）' })
        }
        // safe：若当前有未返回的工具调用，挂起等待 tool/result 边界；否则立即暂停
        let openTools = 0
        for (const ev of agent.session.events) {
          if (ev.type === 'tool/call') openTools += 1
          else if (ev.type === 'tool/result') openTools = Math.max(0, openTools - 1)
        }
        if (openTools > 0) {
          pendingPauses.set(sessionId, { mode: 'safe' })
          return respond(200, { ok: true, mode, applied: true, deferred: true, message: '任务暂停中：等待当前工具完成后落地' })
        }
        agent.cancel({ kind: 'user' }, { keepInbox: true })
        return respond(200, { ok: true, mode, applied: true, message: '已暂停（无运行中工具，立即生效）' })
      } catch (error) {
        ctx.logger?.warn?.('dsh-task-control: pause 请求处理失败: %s', String(error))
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

  // ── pwsh 运行状态查询：活跃度 + IO 速率 + 输出文件（解决"pwsh 卡住/出错检测不出"）──
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-task-control/pwsh-status',
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
        const status = queryPwshStatus(marker, outPath)
        respond(200, {
          ok: true,
          active: status.active,
          procCount: status.procCount,
          ioBytesPerSec: status.ioBytesPerSec,
          fileSizeBytes: status.fileSizeBytes,
          totalBytes: status.totalBytes,
          ...(status.error === undefined ? {} : { error: status.error }),
        })
      } catch (error) {
        ctx.logger?.warn?.('dsh-task-control: pwsh-status 请求处理失败: %s', String(error))
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
