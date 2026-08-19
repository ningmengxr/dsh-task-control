import { spawnSync } from "node:child_process";
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
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
function runPowerShell(script) {
  let result;
  try {
    result = spawnSync(
      POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 2e4, windowsHide: true }
    );
  } catch (error) {
    return { stdout: "", error: `spawn failed: ${String(error)}` };
  }
  if (result.error !== void 0) return { stdout: "", error: `spawn error: ${String(result.error)}` };
  if (result.status !== 0) {
    return { stdout: "", error: `exit ${String(result.status)}: ${String(result.stderr ?? "").slice(0, 200)}` };
  }
  return { stdout: (result.stdout ?? "").trim() };
}
function killStuckProcesses(marker) {
  const clean = marker.replace(/['"`]/g, "").slice(0, 200);
  if (clean === "") return { killed: 0, error: "empty marker" };
  const script = `$m = [regex]::Escape('${clean}'); $t = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.ProcessId -ne $PID -and $_.CommandLine -match $m }); $t | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; $t.Count`;
  const result = runPowerShell(script);
  if (result === void 0 || result.error !== void 0) return { killed: 0, error: result?.error };
  const count = Number.parseInt(result.stdout, 10);
  return { killed: Number.isFinite(count) ? count : 0 };
}
function queryDownloadStatus(marker, outPath) {
  const m = marker.replace(/['"`]/g, "").slice(0, 200);
  const p = outPath.replace(/['"`]/g, "").slice(0, 300);
  if (m === "" && p === "") return { active: false, procCount: 0, fileSizeBytes: -1, totalBytes: -1, error: "empty marker" };
  const url = /^https?:\/\//i.test(m) ? m.slice(0, 300) : "";
  const script = `$m = [regex]::Escape('${m}'); $procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.ProcessId -ne $PID -and $_.CommandLine -match $m }); $size = -1; ` + (p === "" ? "" : `if (Test-Path -LiteralPath '${p}') { $size = (Get-Item -LiteralPath '${p}').Length } `) + (url === "" ? "$total = -1; " : `$total = -1; try { $h = Invoke-WebRequest -Uri '${url}' -Method Head -TimeoutSec 10 -UseBasicParsing; $total = [int64]$h.Headers['Content-Length'] } catch {} `) + `Write-Output ("$($procs.Count)|$size|$total")`;
  const result = runPowerShell(script);
  if (result === void 0 || result.error !== void 0) {
    return { active: false, procCount: 0, fileSizeBytes: -1, totalBytes: -1, error: result?.error };
  }
  const [countStr, sizeStr, totalStr] = result.stdout.split("|");
  const procCount = Number.parseInt(countStr ?? "", 10);
  const fileSizeBytes = Number.parseInt(sizeStr ?? "", 10);
  const totalBytes = Number.parseInt(totalStr ?? "", 10);
  return {
    active: Number.isFinite(procCount) && procCount > 0,
    procCount: Number.isFinite(procCount) ? procCount : 0,
    fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : -1,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : -1
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
  disposers.push(webServer.register({
    kind: "exact",
    path: "/dsh-task-control/download-status",
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
        const marker = typeof parsed?.marker === "string" ? parsed.marker : "";
        const outPath = typeof parsed?.outPath === "string" ? parsed.outPath : "";
        const status = queryDownloadStatus(marker, outPath);
        respond(200, {
          ok: true,
          active: status.active,
          procCount: status.procCount,
          fileSizeBytes: status.fileSizeBytes,
          totalBytes: status.totalBytes,
          ...status.error === void 0 ? {} : { error: status.error }
        });
      } catch (error) {
        ctx.logger?.warn?.("dsh-task-control: download-status \u8BF7\u6C42\u5904\u7406\u5931\u8D25: %s", String(error));
        if (!res.headersSent) respond(500, { ok: false, error: "internal error" });
      }
    }
  }));
  disposers.push(webServer.register({
    kind: "exact",
    path: "/dsh-task-control/kill",
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
        const marker = typeof parsed?.marker === "string" ? parsed.marker.trim() : "";
        if (marker === "") {
          return respond(400, { ok: false, error: "marker \u5FC5\u586B\uFF08\u5361\u4F4F\u5DE5\u5177\u7684\u547D\u4EE4\u7279\u5F81\uFF0C\u5982 URL/\u6587\u4EF6\u540D\uFF09" });
        }
        const outcome = killStuckProcesses(marker);
        respond(200, { ok: true, killed: outcome.killed, ...outcome.error === void 0 ? {} : { error: outcome.error } });
      } catch (error) {
        ctx.logger?.warn?.("dsh-task-control: kill \u8BF7\u6C42\u5904\u7406\u5931\u8D25: %s", String(error));
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
