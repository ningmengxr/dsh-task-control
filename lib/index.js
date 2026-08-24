import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, lstatSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
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
function queryPwshStatus(marker, outPath) {
  const m = marker.replace(/['"`]/g, "").slice(0, 200);
  const p = outPath.replace(/['"`]/g, "").slice(0, 300);
  if (m === "" && p === "") return { active: false, procCount: 0, ioBytesPerSec: 0, fileSizeBytes: -1, totalBytes: -1, error: "empty marker" };
  const url = /^https?:\/\//i.test(m) ? m.slice(0, 300) : "";
  const script = `$procs = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'pwsh|powershell') -and $_.ProcessId -ne $PID }); ` + (m === "" ? `$procs = @($procs | Sort-Object CreationDate -Descending | Select-Object -First 1); ` : `$procs = @($procs | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape('${m}') }); `) + `if ($procs.Count -eq 0) { Write-Output '0|0|-1|-1'; exit } $null = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$($procs[0].ProcessId)"; Start-Sleep -Milliseconds 300; $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$($procs[0].ProcessId)"; $io = 0; if ($perf) { $io = [long]$perf.IODataBytesPersec } $size = -1; ` + (p === "" ? "" : `if (Test-Path -LiteralPath '${p}') { $size = (Get-Item -LiteralPath '${p}').Length } `) + (url === "" ? "$total = -1; " : `$total = -1; try { $h = Invoke-WebRequest -Uri '${url}' -Method Head -TimeoutSec 10 -UseBasicParsing; $total = [int64]$h.Headers['Content-Length'] } catch {} `) + `Write-Output ("$($procs.Count)|$io|$size|$total")`;
  const result = runPowerShell(script);
  if (result === void 0 || result.error !== void 0) {
    return { active: false, procCount: 0, ioBytesPerSec: 0, fileSizeBytes: -1, totalBytes: -1, error: result?.error };
  }
  const [countStr, ioStr, sizeStr, totalStr] = result.stdout.split("|");
  const procCount = Number.parseInt(countStr ?? "", 10);
  const ioBytesPerSec = Number.parseInt(ioStr ?? "", 10);
  const fileSizeBytes = Number.parseInt(sizeStr ?? "", 10);
  const totalBytes = Number.parseInt(totalStr ?? "", 10);
  return {
    active: Number.isFinite(procCount) && procCount > 0,
    procCount: Number.isFinite(procCount) ? procCount : 0,
    ioBytesPerSec: Number.isFinite(ioBytesPerSec) ? ioBytesPerSec : 0,
    fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : -1,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : -1
  };
}
const PKG_NAME = "dsh-task-control";
const NPM_LATEST_URL = "https://registry.npmjs.org/dsh-task-control/latest";
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(LIB_DIR, "..");
function readLocalVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}
async function fetchNpmLatest() {
  try {
    const res = await fetch(NPM_LATEST_URL, { signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.version !== "string") return null;
    const tarball = typeof data?.dist?.tarball === "string" ? data.dist.tarball : "";
    return { version: data.version, tarball };
  } catch {
    return null;
  }
}
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name2 of readdirSync(src)) {
    const s = join(src, name2);
    const d = join(dst, name2);
    if (lstatSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}
async function autoUpdate(logger) {
  try {
    const local = readLocalVersion();
    if (local === null) return;
    let isLink = false;
    try {
      isLink = lstatSync(PKG_DIR).isSymbolicLink();
    } catch {
      return;
    }
    if (isLink) {
      logger?.info?.("dsh-task-control: \u5F00\u53D1\u6A21\u5F0F\u5B89\u88C5\uFF08\u8F6F\u94FE/junction\uFF09\uFF0C\u8DF3\u8FC7\u81EA\u52A8\u66F4\u65B0\uFF08\u5F53\u524D v%s\uFF09", local);
      return;
    }
    const latest = await fetchNpmLatest();
    if (latest === null) return;
    if (compareVersions(latest.version, local) <= 0) return;
    logger?.info?.("dsh-task-control: \u53D1\u73B0\u65B0\u7248\u672C v%s\uFF08\u5F53\u524D v%s\uFF09\uFF0C\u5F00\u59CB\u81EA\u52A8\u66F4\u65B0\u2026", latest.version, local);
    if (latest.tarball === "") {
      logger?.warn?.("dsh-task-control: \u65B0\u7248\u672C tarball \u5730\u5740\u7F3A\u5931\uFF0C\u81EA\u52A8\u66F4\u65B0\u4E2D\u6B62");
      return;
    }
    const dlRes = await fetch(latest.tarball, { signal: AbortSignal.timeout(3e4) });
    if (!dlRes.ok) {
      logger?.warn?.("dsh-task-control: \u4E0B\u8F7D\u65B0\u7248\u672C\u5931\u8D25 HTTP %s\uFF0C\u81EA\u52A8\u66F4\u65B0\u4E2D\u6B62", String(dlRes.status));
      return;
    }
    const tgz = Buffer.from(await dlRes.arrayBuffer());
    const tmp = join(tmpdir(), `${PKG_NAME}-update-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "pkg.tgz"), tgz);
    const tarExe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    const tar = spawnSync(tarExe, ["-xzf", join(tmp, "pkg.tgz"), "-C", tmp], { timeout: 2e4 });
    if (tar.status !== 0) {
      logger?.warn?.("dsh-task-control: \u89E3\u538B\u65B0\u7248\u672C\u5931\u8D25\uFF0C\u81EA\u52A8\u66F4\u65B0\u4E2D\u6B62");
      rmSync(tmp, { recursive: true, force: true });
      return;
    }
    const pkgSrc = join(tmp, "package");
    if (!existsSync(join(pkgSrc, "package.json"))) {
      logger?.warn?.("dsh-task-control: \u89E3\u538B\u5185\u5BB9\u5F02\u5E38\uFF08\u7F3A package.json\uFF09\uFF0C\u81EA\u52A8\u66F4\u65B0\u4E2D\u6B62");
      rmSync(tmp, { recursive: true, force: true });
      return;
    }
    const backupDir = `${PKG_DIR}.bak-${local}`;
    rmSync(backupDir, { recursive: true, force: true });
    mkdirSync(backupDir, { recursive: true });
    for (const name2 of readdirSync(PKG_DIR)) {
      if (name2 === "node_modules") continue;
      if (lstatSync(join(PKG_DIR, name2)).isDirectory()) copyDir(join(PKG_DIR, name2), join(backupDir, name2));
      else copyFileSync(join(PKG_DIR, name2), join(backupDir, name2));
    }
    for (const name2 of readdirSync(pkgSrc)) {
      rmSync(join(PKG_DIR, name2), { recursive: true, force: true });
      if (lstatSync(join(pkgSrc, name2)).isDirectory()) copyDir(join(pkgSrc, name2), join(PKG_DIR, name2));
      else copyFileSync(join(pkgSrc, name2), join(PKG_DIR, name2));
    }
    rmSync(tmp, { recursive: true, force: true });
    logger?.info?.("dsh-task-control: \u5DF2\u81EA\u52A8\u66F4\u65B0 v%s \u2192 v%s\uFF08\u65E7\u7248\u5907\u4EFD\uFF1A%s\uFF09\uFF0C\u8BF7\u91CD\u542F DSH \u751F\u6548", local, latest.version, backupDir);
  } catch (error) {
    logger?.warn?.("dsh-task-control: \u81EA\u52A8\u66F4\u65B0\u5F02\u5E38: %s", String(error));
  }
}
function apply(ctx) {
  void autoUpdate(ctx.logger);
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
  const pendingPauses = /* @__PURE__ */ new Map();
  const onSessionEvent = (session, event) => {
    const key = String(session.id);
    if (!pendingPauses.has(key)) return;
    if (event.type !== "tool/result") return;
    pendingPauses.delete(key);
    const agent = agents.get(session.id);
    if (agent !== void 0 && agent.status === "running") {
      agent.cancel({ kind: "user" }, { keepInbox: true });
    }
  };
  ctx.on("session/event", onSessionEvent);
  disposers.push(webServer.register({
    kind: "exact",
    path: "/dsh-task-control/pause",
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
        const mode = parsed?.mode === "force" || parsed?.mode === "safe" ? parsed.mode : "safe";
        if (sessionId === "") {
          return respond(400, { ok: false, error: "sessionId \u5FC5\u586B" });
        }
        const agent = agents.get(sessionId);
        if (agent === void 0) {
          return respond(404, { ok: false, error: "session not found" });
        }
        if (agent.status !== "running") {
          return respond(200, { ok: true, mode, applied: false, message: "\u4EFB\u52A1\u672A\u5728\u8FD0\u884C\uFF0C\u65E0\u9700\u6682\u505C" });
        }
        if (mode === "force") {
          agent.cancel({ kind: "user" }, { keepInbox: true });
          return respond(200, { ok: true, mode, applied: true, message: "\u5DF2\u5F3A\u5236\u6682\u505C\uFF08cancel + keepInbox\uFF09" });
        }
        let openTools = 0;
        for (const ev of agent.session.events) {
          if (ev.type === "tool/call") openTools += 1;
          else if (ev.type === "tool/result") openTools = Math.max(0, openTools - 1);
        }
        if (openTools > 0) {
          pendingPauses.set(sessionId, { mode: "safe" });
          return respond(200, { ok: true, mode, applied: true, deferred: true, message: "\u4EFB\u52A1\u6682\u505C\u4E2D\uFF1A\u7B49\u5F85\u5F53\u524D\u5DE5\u5177\u5B8C\u6210\u540E\u843D\u5730" });
        }
        agent.cancel({ kind: "user" }, { keepInbox: true });
        return respond(200, { ok: true, mode, applied: true, message: "\u5DF2\u6682\u505C\uFF08\u65E0\u8FD0\u884C\u4E2D\u5DE5\u5177\uFF0C\u7ACB\u5373\u751F\u6548\uFF09" });
      } catch (error) {
        ctx.logger?.warn?.("dsh-task-control: pause \u8BF7\u6C42\u5904\u7406\u5931\u8D25: %s", String(error));
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
    path: "/dsh-task-control/pwsh-status",
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
        const status = queryPwshStatus(marker, outPath);
        respond(200, {
          ok: true,
          active: status.active,
          procCount: status.procCount,
          ioBytesPerSec: status.ioBytesPerSec,
          fileSizeBytes: status.fileSizeBytes,
          totalBytes: status.totalBytes,
          ...status.error === void 0 ? {} : { error: status.error }
        });
      } catch (error) {
        ctx.logger?.warn?.("dsh-task-control: pwsh-status \u8BF7\u6C42\u5904\u7406\u5931\u8D25: %s", String(error));
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
