const name = "dsh-task-control";
const inject = ["agents", "webServer"];
const MAX_BODY_BYTES = 64 * 1024;
function isLoopbackHost(host) {
  if (host === void 0) return false;
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
function buildPluginMessage(text) {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: "dsh-task-control" }
  };
}
function apply(ctx) {
  const webServer = ctx.get("webServer");
  const agents = ctx.get("agents");
  if (webServer === void 0 || agents === void 0) {
    ctx.logger?.warn?.("dsh-task-control: webServer/agents \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u5BBF\u4E3B\u901A\u9053\u672A\u6302\u8F7D\uFF08\u6062\u590D\u5C06\u9000\u56DE\u53EF\u89C1\u6D88\u606F\uFF09");
    return void 0;
  }
  const disposers = [];
  disposers.push(webServer.register({
    kind: "exact",
    path: "/dsh-task-control/resume",
    handler: async (req, res) => {
      const respond = (status, payload) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      try {
        if (req.method !== "POST") return respond(405, { ok: false, error: "method not allowed" });
        if (!isLoopbackHost(req.headers?.host)) return respond(403, { ok: false, error: "forbidden" });
        const raw = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return respond(400, { ok: false, error: "invalid json" });
        }
        const sessionId = typeof parsed?.sessionId === "string" ? parsed.sessionId : "";
        const text = typeof parsed?.text === "string" ? parsed.text.trim() : "";
        if (sessionId === "" || text === "") {
          return respond(400, { ok: false, error: "sessionId \u4E0E text \u5FC5\u586B" });
        }
        const agent = agents.get(sessionId);
        if (agent === void 0) {
          return respond(404, { ok: false, error: "session not found" });
        }
        agent.followup(buildPluginMessage(text));
        respond(200, { ok: true });
      } catch (error) {
        ctx.logger?.warn?.("dsh-task-control: resume \u8BF7\u6C42\u5904\u7406\u5931\u8D25: %s", String(error));
        if (!res.headersSent) respond(500, { ok: false, error: "internal error" });
      }
    }
  }));
  return () => {
    for (const dispose of disposers) dispose();
  };
}
export {
  apply,
  inject,
  name
};
