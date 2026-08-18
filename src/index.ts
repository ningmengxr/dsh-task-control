/**
 * dsh-task-control 宿主半（Node 端）。
 *
 * 方案 B 的"隐形恢复"通道：
 *   - 浏览器端（客户端 bundle）通过 fetch POST 本进程的 HTTP 路由
 *     /dsh-task-control/resume 请求恢复 / 追加条件；
 *   - 本插件把请求文本以"插件来源"消息（source: { kind: 'plugin' }）注入
 *     目标会话（agent.followup）——模型照常把它当作本轮的用户指令，但聊天
 *     界面只会渲染成一条低调的 ContextInjectionRow，而不是用户对话气泡。
 *
 * 不 import 任何 @deepseek-ai 包：外部插件包位于 ~/.dsh/profiles/node_modules，
 * 模块解析找不到仓库内的 workspace 依赖（与 a4phone dsh-hook 的约定一致），
 * 用户消息对象按 dsh-llm 的 createUserMessage 形状手工构造。
 */

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

/** 宿主插件入口：挂载 /dsh-task-control/resume 路由。 */
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
  return () => { for (const dispose of disposers) dispose() }
}
