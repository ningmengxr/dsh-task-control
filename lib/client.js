window.__ModuleLoader__.load({ id: "dsh-task-control", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/buttons.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");

// src/client/settings.ts
var SETTINGS_DEFAULTS = {
  emergencyLabel: "\u6025\u505C",
  checkLabel: "\u62CD\u4E00\u4E0Bdeepseek",
  appendLabel: "\u8F6F\u6682\u505C/\u8FFD\u52A0",
  healthyText: "\u4EFB\u52A1\u6B63\u5E38\uFF0C\u65E0\u5F02\u5E38",
  errorText: "\u4EFB\u52A1\u51FA\u9519\uFF1A{error}",
  runningText: "\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u6682\u672A\u51FA\u9519"
};
var SETTING_KEYS = new Set(Object.keys(SETTINGS_DEFAULTS));
var KEY = "dsh-task-control:settings";
var listeners = /* @__PURE__ */ new Set();
function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    const parsed = JSON.parse(raw);
    const clean = { ...SETTINGS_DEFAULTS };
    for (const key of SETTING_KEYS) {
      const value = parsed[key];
      if (typeof value === "string") clean[key] = value;
    }
    return clean;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}
function saveSettings(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const fn of listeners) fn();
}
function subscribeSettings(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// src/client/buttons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function useSettings() {
  const [s, setS] = (0, import_react.useState)(loadSettings);
  (0, import_react.useEffect)(() => subscribeSettings(() => setS(loadSettings())), []);
  return s;
}
function ModalShell({ onClose, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 2147483e3,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      onClick: onClose,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          style: {
            background: "var(--dsw-alias-bg-layer-1)",
            color: "var(--dsw-alias-label-primary)",
            padding: "18px 20px",
            borderRadius: 12,
            minWidth: 320,
            maxWidth: 480,
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)"
          },
          onClick: (e) => e.stopPropagation(),
          children
        }
      )
    }
  );
}
function CheckModal({ result, onClose, stuckMarker, killing, killMessage, onForceKill }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 14 }, children: [
      result,
      killMessage !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 8, color: "var(--dsw-alias-state-warn-primary)" }, children: killMessage })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
      stuckMarker !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: onForceKill,
          disabled: killing,
          style: {
            border: "1px solid var(--dsw-alias-state-error-primary)",
            borderRadius: 999,
            padding: "4px 14px",
            background: "transparent",
            color: "var(--dsw-alias-state-error-primary)",
            cursor: killing ? "wait" : "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: "20px"
          },
          children: killing ? "\u6B63\u5728\u5F3A\u5236\u7EC8\u6B62\u2026" : "\u5F3A\u5236\u7EC8\u6B62\u5361\u4F4F\u7684\u4EFB\u52A1"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onClose, children: "\u786E\u5B9A" })
    ] })
  ] });
}
function CheckButton({ useSession, sessionId, cancelSession }) {
  const s = useSettings();
  const running = useSession((s2) => s2.running);
  const lastError = useSession((s2) => s2.lastAgentError);
  const runningCalls = useSession(
    (s2) => s2.runningCalls,
    // 内容级比较：避免每次快照（新数组引用）都触发重渲染
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  );
  const [open, setOpen] = (0, import_react.useState)(false);
  const [result, setResult] = (0, import_react.useState)("");
  const [stuckMarker, setStuckMarker] = (0, import_react.useState)(null);
  const [killing, setKilling] = (0, import_react.useState)(false);
  const [killMessage, setKillMessage] = (0, import_react.useState)("");
  const onClick = () => {
    let text = s.healthyText;
    let marker = null;
    setKillMessage("");
    if (lastError) {
      text = renderTemplate(s.errorText, { error: lastError });
    } else if (running) {
      const downloadCall = runningCalls.find((call) => isDownloadCall(call.argsRaw));
      const stuck = runningCalls.find((call) => Date.now() - call.time > STUCK_THRESHOLD_MS && !isDownloadCall(call.argsRaw));
      if (downloadCall !== void 0) {
        void checkDownload(downloadCall.name, downloadCall.argsRaw, downloadCall.time);
        text = "\u6B63\u5728\u68C0\u67E5\u4E0B\u8F7D\u72B6\u6001\u2026";
        marker = null;
      } else if (stuck !== void 0) {
        text = `\u7591\u4F3C\u5361\u6B7B\uFF1A\u5DE5\u5177\u201C${stuck.name}\u201D\u5DF2\u8FD0\u884C ${formatDuration(Date.now() - stuck.time)} \u672A\u8FD4\u56DE\uFF0C\u8BF7\u8003\u8651\u4E2D\u65AD\u4EFB\u52A1\u6216\u68C0\u67E5\u7F51\u7EDC`;
        marker = extractMarker(stuck.argsRaw);
      } else if (runningCalls.length > 0) {
        text = `${s.runningText}\uFF08\u6B63\u5728\u6267\u884C\uFF1A${runningCalls.map((call) => call.name).join("\u3001")}\uFF09`;
      } else {
        text = s.runningText;
      }
    }
    setStuckMarker(marker);
    setResult(text);
    setOpen(true);
  };
  const checkDownload = async (toolName, argsRaw, startTime) => {
    const marker = extractMarker(argsRaw);
    const outPath = extractOutPath(argsRaw);
    const fileName = outPath !== null ? outPath.split(/[\\/]/).pop() : marker ?? "\u6587\u4EF6";
    const status = await fetchDownloadStatus(marker ?? "", outPath);
    if (status === null) {
      setResult(`\u6B63\u5728\u6267\u884C ${toolName}\uFF08\u4E0B\u8F7D/\u5B89\u88C5\u7C7B\u547D\u4EE4\uFF0C\u5DF2\u8FD0\u884C ${formatDuration(Date.now() - startTime)}\uFF09\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u4E0B\u8F7D\u8FDB\u5EA6\uFF0C\u4EFB\u52A1\u4ECD\u5728\u8FDB\u884C\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85`);
      setStuckMarker(null);
      return;
    }
    if (status.active) {
      if (outPath === null) {
        setResult(`\u6B63\u5728\u6267\u884C ${toolName}\uFF08\u4E0B\u8F7D/\u5B89\u88C5\u7C7B\u547D\u4EE4\uFF0C\u65E0\u8F93\u51FA\u6587\u4EF6\u53EF\u8BFB\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u8FDB\u5EA6\uFF09\uFF0C\u4EFB\u52A1\u4ECD\u5728\u8FDB\u884C\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85`);
      } else {
        const pct = formatPercent(status.fileSizeBytes, status.totalBytes);
        setResult(pct !== null ? `\u6B63\u5728\u4E0B\u8F7D ${fileName}\uFF0C\u8FDB\u5EA6 ${pct}\uFF0C\u4E0B\u8F7D\u4ECD\u5728\u7EE7\u7EED\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85` : `\u6B63\u5728\u4E0B\u8F7D ${fileName}\uFF0C\u5DF2\u4E0B\u8F7D ${formatSize(status.fileSizeBytes)}\uFF0C\u4E0B\u8F7D\u4ECD\u5728\u7EE7\u7EED\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85`);
      }
      setStuckMarker(null);
    } else {
      if (outPath === null) {
        setResult(`\u4E0B\u8F7D/\u5B89\u88C5\u547D\u4EE4\uFF08${toolName}\uFF09\u5DF2\u9000\u51FA\uFF0C\u53EF\u80FD\u5F02\u5E38\u4E2D\u65AD\uFF0C\u4EFB\u52A1\u53EF\u80FD\u8FD8\u5361\u5728\u7B49\u5F85\u8FD4\u56DE\u503C\uFF0C\u53EF\u5F3A\u5236\u7EC8\u6B62`);
      } else {
        const pct = formatPercent(status.fileSizeBytes, status.totalBytes);
        setResult(pct !== null ? `\u4E0B\u8F7D\u51FA\u73B0\u5F02\u5E38\u4E2D\u65AD\uFF1A${fileName} \u7684\u4E0B\u8F7D\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF08\u8FDB\u5EA6\u505C\u7559\u5728 ${pct}\uFF09\uFF0C\u4EFB\u52A1\u53EF\u80FD\u8FD8\u5361\u5728\u7B49\u5F85\u8FD4\u56DE\u503C\uFF0C\u53EF\u5F3A\u5236\u7EC8\u6B62` : `\u4E0B\u8F7D\u51FA\u73B0\u5F02\u5E38\u4E2D\u65AD\uFF1A${fileName} \u7684\u4E0B\u8F7D\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF08\u6587\u4EF6\u505C\u7559\u5728 ${formatSize(status.fileSizeBytes)}\uFF09\uFF0C\u4EFB\u52A1\u53EF\u80FD\u8FD8\u5361\u5728\u7B49\u5F85\u8FD4\u56DE\u503C\uFF0C\u53EF\u5F3A\u5236\u7EC8\u6B62`);
      }
      setStuckMarker(marker);
    }
  };
  const onForceKill = async () => {
    if (stuckMarker === null) return;
    setKilling(true);
    setKillMessage("");
    try {
      const response = await fetch("/dsh-task-control/kill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marker: stuckMarker })
      });
      const data = await response.json().catch(() => null);
      cancelSession();
      const killed = typeof data?.killed === "number" ? data.killed : 0;
      setKillMessage(killed > 0 ? `\u5DF2\u5F3A\u5236\u7EC8\u6B62 ${killed} \u4E2A\u5361\u4F4F\u7684\u8FDB\u7A0B\uFF0C\u4EFB\u52A1\u6B63\u5728\u505C\u6B62\u2026` : "\u672A\u627E\u5230\u5339\u914D\u7684\u5361\u4F4F\u8FDB\u7A0B\uFF08\u53EF\u80FD\u5DF2\u81EA\u884C\u7ED3\u675F\uFF09\uFF0C\u5DF2\u53D1\u9001\u505C\u6B62\u6307\u4EE4");
    } catch (error) {
      console.warn("[dsh-task-control] \u5F3A\u5236\u7EC8\u6B62\u5931\u8D25:", error);
      setKillMessage("\u5F3A\u5236\u7EC8\u6B62\u5931\u8D25\uFF1A\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF0C\u5DF2\u53D1\u9001\u505C\u6B62\u6307\u4EE4");
    } finally {
      setKilling(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskButton, { label: s.checkLabel, onClick }),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        CheckModal,
        {
          result,
          onClose: () => setOpen(false),
          stuckMarker,
          killing,
          killMessage,
          onForceKill: () => {
            void onForceKill();
          }
        }
      ),
      document.body
    )
  ] });
}
var PAUSE_HINT = "\u9009\u62E9\u64CD\u4F5C\uFF1A\u4EC5\u6682\u505C\u4EFB\u52A1\uFF0C\u6216\u8F93\u5165\u6761\u4EF6\u540E\u5E26\u6761\u4EF6\u91CD\u8DD1";
var APPEND_TEMPLATE = "\u8865\u5145\u6761\u4EF6\uFF1A{\u6761\u4EF6}\uFF0C\u8BF7\u636E\u6B64\u91CD\u65B0\u6267\u884C\u521A\u624D\u7684\u4EFB\u52A1";
var RESUME_TEXT = "\u4EFB\u52A1\u5DF2\u6062\u590D\uFF0C\u8BF7\u7EE7\u7EED\u6267\u884C\u539F\u4EFB\u52A1\uFF0C\u4E0D\u8981\u91CD\u65B0\u5F00\u59CB";
var NO_TASK_NOTICE = "\u5F53\u524D\u6CA1\u6709\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1";
function EmergencyConfirmModal({ onCancel, onConfirm, busy }) {
  const [checked, setChecked] = (0, import_react.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose: onCancel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, lineHeight: 1.5, marginBottom: 10 }, children: "\u5982\u679C\u73B0\u5728\u6025\u505C\u4F1A\u5BFC\u81F4\u4E0B\u8F7D\u4EFB\u52A1\u4E22\u5931\uFF0C\u91CD\u65B0\u542F\u52A8\u540E\u9700\u8981\u5168\u90E8\u91CD\u65B0\u4E0B\u8F7D" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16, cursor: "pointer" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked, onChange: (e) => setChecked(e.target.checked) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6211\u4E86\u89E3\u6025\u505C\u4F1A\u5BFC\u81F4\u4E0B\u8F7D\u8FDB\u5EA6\u4E22\u5931\uFF0C\u4ECD\u8981\u6025\u505C" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onCancel, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: onConfirm,
          disabled: !checked || busy,
          style: {
            border: "none",
            borderRadius: 999,
            padding: "4px 14px",
            background: "var(--dsw-alias-state-error-primary)",
            color: "#fff",
            cursor: !checked || busy ? "default" : "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: "20px",
            opacity: !checked || busy ? 0.4 : 1
          },
          children: busy ? "\u6B63\u5728\u6025\u505C\u2026" : "\u786E\u8BA4\u6025\u505C"
        }
      )
    ] })
  ] });
}
function EmergencyResultModal({ phase, result, interrupted, onClose, onDecide }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 14 }, children: result }),
    phase === "decision" && interrupted.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, opacity: 0.75 }, children: "\u6062\u590D\u524D\u8BF7\u5148\u51B3\u5B9A\u5982\u4F55\u5904\u7406\u88AB\u4E2D\u65AD\u7684\u5DE5\u5177\uFF1A" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => onDecide("verify"), style: { textAlign: "left" }, children: "\u2460 \u9A8C\u8BC1\u5916\u90E8\u72B6\u6001\uFF08\u68C0\u67E5\u6587\u4EF6/\u8FDB\u7A0B/\u65E5\u5FD7\uFF0C\u786E\u8BA4\u662F\u5426\u6709\u526F\u4F5C\u7528\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => onDecide("rerun"), style: { textAlign: "left" }, children: "\u2461 \u91CD\u65B0\u6267\u884C\u8BE5\u5DE5\u5177" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => onDecide("skip"), style: { textAlign: "left" }, children: "\u2462 \u8DF3\u8FC7\uFF0C\u4ECE\u5F53\u524D\u72B6\u6001\u7EE7\u7EED" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
      phase === "stopping" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onClose, children: "\u540E\u53F0\u7B49\u5F85" }),
      phase !== "stopping" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onClose, children: "\u786E\u5B9A" })
    ] })
  ] });
}
function EmergencyButton({ useSession, cancelSession, resumeTask }) {
  const s = useSettings();
  const running = useSession((snapshot) => snapshot.running);
  const runningCalls = useSession(
    (snapshot) => snapshot.runningCalls,
    // 内容级比较：runningCalls 每次快照都是新数组引用，但内容未变时不触发重渲染
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  );
  const nodes = useSession((snapshot) => snapshot.nodes, () => true);
  const [confirmOpen, setConfirmOpen] = (0, import_react.useState)(false);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [phase, setPhase] = (0, import_react.useState)("done");
  const [result, setResult] = (0, import_react.useState)("");
  const [interrupted, setInterrupted] = (0, import_react.useState)([]);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const onTap = () => {
    if (!running) {
      setResult(NO_TASK_NOTICE);
      setPhase("done");
      setOpen(true);
      return;
    }
    setConfirmOpen(true);
  };
  (0, import_react.useEffect)(() => {
    if (phase !== "stopping") return;
    if (running) return;
    const unknown = interrupted.filter((t) => {
      const settled = nodes.some((n) => n.kind === "tool-result" && n.callId === t.callId && n.isError === false);
      return !settled;
    });
    if (unknown.length > 0) {
      setInterrupted(unknown);
      setPhase("decision");
      setResult(`\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u4F46\u88AB\u4E2D\u65AD\u7684\u5DE5\u5177\uFF08${unknown.map((t) => t.name).join("\u3001")}\uFF09\u7ED3\u679C\u672A\u77E5\u2014\u2014\u53EF\u80FD\u672A\u5B8C\u6210\u6216\u4EA7\u751F\u4E86\u526F\u4F5C\u7528\uFF08TOOL_OUTCOME_UNKNOWN\uFF09`);
    } else {
      setPhase("done");
      setResult("\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u88AB\u4E2D\u65AD\u7684\u5DE5\u5177\u5DF2\u786E\u8BA4\u5B8C\u6210\uFF0C\u53EF\u76F4\u63A5\u7EE7\u7EED");
    }
  }, [running, phase]);
  const doEmergency = async () => {
    if (busy) return;
    setConfirmOpen(false);
    setBusy(true);
    try {
      const inter = runningCalls.map((call) => ({ callId: call.callId, name: call.name }));
      setInterrupted(inter);
      const markers = [...new Set(
        runningCalls.map((call) => extractMarker(call.argsRaw)).filter((m) => m !== null)
      )].slice(0, 3);
      let killed = 0;
      for (const marker of markers) {
        try {
          const response = await fetch("/dsh-task-control/kill", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ marker })
          });
          const data = await response.json().catch(() => null);
          killed += typeof data?.killed === "number" ? data.killed : 0;
        } catch {
        }
      }
      cancelSession();
      setResult(killed > 0 ? "\u5DF2\u53D1\u9001\u505C\u6B62\u6307\u4EE4\uFF0C\u6B63\u5728\u7B49\u5F85\u5DE5\u5177\u534F\u4F5C\u9000\u51FA\u2026\uFF08accepted \u2192 stopping\uFF09" : markers.length > 0 ? "\u5DF2\u53D1\u9001\u505C\u6B62\u6307\u4EE4\uFF0C\u6B63\u5728\u7B49\u5F85\u5DE5\u5177\u534F\u4F5C\u9000\u51FA\u2026\uFF08\u672A\u5339\u914D\u5230\u53EF\u7EC8\u6B62\u7684\u8FDB\u7A0B\uFF09" : "\u5DF2\u53D1\u9001\u505C\u6B62\u6307\u4EE4\uFF0C\u6B63\u5728\u7B49\u5F85\u4EFB\u52A1\u505C\u6B62\u2026");
      setPhase(inter.length > 0 || killed > 0 ? "stopping" : "done");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  const decideResume = (choice) => {
    setOpen(false);
    const names = interrupted.map((t) => t.name).join("\u3001");
    let text;
    if (choice === "verify") {
      text = `\u88AB\u6025\u505C\u4E2D\u65AD\u7684\u5DE5\u5177\uFF08${names}\uFF09\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5148\u9A8C\u8BC1\u5916\u90E8\u72B6\u6001\uFF08\u68C0\u67E5\u6587\u4EF6/\u8FDB\u7A0B/\u65E5\u5FD7\u786E\u8BA4\u662F\u5426\u6709\u526F\u4F5C\u7528\uFF09\uFF0C\u786E\u8BA4\u540E\u518D\u51B3\u5B9A\u7EE7\u7EED\u6216\u4FEE\u590D\uFF0C\u4E0D\u8981\u76F2\u76EE\u91CD\u8BD5`;
    } else if (choice === "rerun") {
      text = `\u8BF7\u91CD\u65B0\u6267\u884C\u88AB\u6025\u505C\u4E2D\u65AD\u7684\u5DE5\u5177\uFF08${names}\uFF0C\u4E0A\u6B21\u7ED3\u679C\u672A\u77E5\uFF09`;
    } else {
      text = `\u8BF7\u8DF3\u8FC7\u88AB\u6025\u505C\u4E2D\u65AD\u7684\u5DE5\u5177\uFF08${names}\uFF09\uFF0C\u4ECE\u5F53\u524D\u72B6\u6001\u7EE7\u7EED\u539F\u4EFB\u52A1`;
    }
    setTimeout(() => resumeTask(text), 400);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskButton, { label: s.emergencyLabel, variant: "danger", onClick: onTap }),
    confirmOpen && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        EmergencyConfirmModal,
        {
          onCancel: () => setConfirmOpen(false),
          onConfirm: () => {
            void doEmergency();
          },
          busy
        }
      ),
      document.body
    ),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        EmergencyResultModal,
        {
          phase,
          result,
          interrupted,
          onClose: () => setOpen(false),
          onDecide: decideResume
        }
      ),
      document.body
    )
  ] });
}
var STUCK_THRESHOLD_MS = 10 * 60 * 1e3;
function formatDuration(ms) {
  const minutes = Math.floor(ms / 6e4);
  const seconds = Math.floor(ms % 6e4 / 1e3);
  return minutes > 0 ? `${minutes}\u5206${seconds}\u79D2` : `${seconds}\u79D2`;
}
function extractMarker(argsRaw) {
  const url = argsRaw.match(/https?:\/\/[^\s"'）)]+/);
  if (url) return url[0].slice(0, 160);
  const file = argsRaw.match(/[\w.-]+\.(?:zip|exe|msi|whl|tar|gz|7z|py|ps1|bat|sh|json)\b/i);
  if (file) return file[0];
  const quoted = argsRaw.match(/['"]([^'"]{4,160})['"]/);
  if (quoted) return quoted[1];
  return null;
}
function isDownloadCall(argsRaw) {
  return /pip install|curl|wget|Invoke-WebRequest|\biwr\b|-o\s|--output|OutFile/i.test(argsRaw);
}
function extractOutPath(argsRaw) {
  const m = argsRaw.match(/(?:-o|--output|-OutFile)\s+['"]?([^'"\s]+\.\w+)/i);
  return m ? m[1] : null;
}
async function fetchDownloadStatus(marker, outPath) {
  try {
    const response = await fetch("/dsh-task-control/download-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marker, outPath })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.active === "boolean" ? data : null;
  } catch {
    return null;
  }
}
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "\u672A\u77E5";
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function formatPercent(fileSizeBytes, totalBytes) {
  if (totalBytes > 0 && fileSizeBytes >= 0) {
    const pct = Math.min(100, Math.round(fileSizeBytes / totalBytes * 100));
    return `${pct}%`;
  }
  return null;
}
function TaskButton({ label, onClick, variant }) {
  const [hover, setHover] = (0, import_react.useState)(false);
  const danger = variant === "danger";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      onClick,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        border: "none",
        borderRadius: 999,
        padding: "4px 14px",
        background: danger ? "var(--dsw-alias-state-error-primary)" : hover ? "var(--dsw-alias-button-info-hover)" : "var(--dsw-alias-button-info-fill)",
        color: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        lineHeight: "20px",
        filter: danger && hover ? "brightness(0.9)" : "none",
        transition: "filter 100ms ease"
      },
      children: label
    }
  );
}
function AppendModal({ hint, onSubmit, onCancel, onKeepPaused }) {
  const [value, setValue] = (0, import_react.useState)("");
  const commit = () => onSubmit(value.trim());
  const handleKey = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") onCancel();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose: onCancel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, opacity: 0.85, marginBottom: 6 }, children: hint }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, marginBottom: 10, color: "var(--dsw-alias-state-warn-primary)" }, children: "\u7A0B\u5E8F\u5DF2\u6682\u505C" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        autoFocus: true,
        value,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: handleKey,
        placeholder: "\u8865\u5145\u6761\u4EF6\uFF08\u7559\u7A7A = \u6062\u590D\u539F\u4EFB\u52A1\uFF09",
        style: {
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid var(--dsw-alias-border-l2)",
          background: "var(--dsw-alias-bg-layer-2)",
          color: "var(--dsw-alias-label-primary)"
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 12, justifyContent: "space-between", alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: onKeepPaused,
          style: {
            border: "1px solid var(--dsw-alias-state-warn-primary)",
            borderRadius: 999,
            padding: "4px 12px",
            background: "transparent",
            color: "var(--dsw-alias-state-warn-primary)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: "20px"
          },
          children: "\u4FDD\u6301\u6682\u505C"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onCancel, children: "\u7EE7\u7EED" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: commit, children: "\u786E\u5B9A" })
      ] })
    ] })
  ] });
}
function AppendButton({ resumeTask, cancelSession, useSession }) {
  const s = useSettings();
  const running = useSession((snapshot) => snapshot.running);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(false);
  const [resetKey, setResetKey] = (0, import_react.useState)(0);
  const onOpen = () => {
    if (!running) {
      setNotice(true);
      return;
    }
    cancelSession();
    setResetKey((k) => k + 1);
    setOpen(true);
  };
  const onKeepPaused = () => {
    setOpen(false);
  };
  const onSubmit = (condition) => {
    setOpen(false);
    const text = condition !== "" ? renderTemplate(APPEND_TEMPLATE, { \u6761\u4EF6: condition }) : RESUME_TEXT;
    setTimeout(() => resumeTask(text), 400);
  };
  const onCancel = () => {
    setOpen(false);
    setTimeout(() => resumeTask(RESUME_TEXT), 400);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskButton, { label: s.appendLabel, onClick: onOpen }),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        AppendModal,
        {
          hint: PAUSE_HINT,
          onSubmit,
          onCancel,
          onKeepPaused
        },
        resetKey
      ),
      document.body
    ),
    notice && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose: () => setNotice(false), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, lineHeight: 1.5, marginBottom: 14 }, children: NO_TASK_NOTICE }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setNotice(false), children: "\u786E\u5B9A" }) })
      ] }),
      document.body
    )
  ] });
}

// src/client/SettingsCard.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var FIELDS = [
  ["emergencyLabel", "\u6025\u505C\u6309\u94AE\u6587\u6848"],
  ["checkLabel", "\u68C0\u6D4B\u6309\u94AE\u6587\u6848"],
  ["appendLabel", "\u8FFD\u52A0/\u6682\u505C\u6309\u94AE\u6587\u6848"],
  ["healthyText", "\u68C0\u6D4B\xB7\u65E0\u5F02\u5E38\u8F93\u51FA"],
  ["errorText", "\u68C0\u6D4B\xB7\u51FA\u9519\u8F93\u51FA\uFF08{error} \u4E3A\u9519\u8BEF\u4FE1\u606F\uFF09"],
  ["runningText", "\u68C0\u6D4B\xB7\u8FD0\u884C\u4E2D\u8F93\u51FA"]
];
function SettingsCard(_props) {
  const [s, setS] = (0, import_react2.useState)(loadSettings);
  const set = (key, value) => {
    const next = { ...s, [key]: value };
    setS(next);
    saveSettings(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { style: { padding: "8px 0" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "\u4EFB\u52A1\u63A7\u5236\uFF08dsh-task-control\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "12px", opacity: 0.7 }, children: "\u68C0\u6D4B\uFF1A\u4E00\u952E\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001\uFF1B\u8FFD\u52A0/\u6682\u505C\uFF1A\u70B9\u51FB\u7ACB\u5373\u6682\u505C\uFF0C\u53EF\u8F93\u5165\u6761\u4EF6\u5E26\u6761\u4EF6\u91CD\u8DD1\uFF0C\u6216\u4FDD\u6301\u6682\u505C\u3002" }),
    FIELDS.map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { display: "block", margin: "6px 0" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { display: "block", fontSize: "12px" }, children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--dsw-alias-border-l2)",
            // 底色与设置栏同步（设置面板背景即 bg-layer-2）
            background: "var(--dsw-alias-bg-layer-2)",
            color: "var(--dsw-alias-label-primary)"
          },
          value: s[key],
          onChange: (e) => set(key, e.target.value)
        }
      )
    ] }, key))
  ] });
}

// src/client/index.ts
var name = "task-control";
var inject = ["slots", "sessions"];
function apply(ctx) {
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "task-emergency",
    order: 80,
    inject: (sessionId) => ({
      cancelSession: () => {
        void ctx.sessions.binding(sessionId)?.session?.cancel();
      },
      resumeTask: async (text) => {
        try {
          const response = await fetch("/dsh-task-control/resume", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, text })
          });
          if (!response.ok) throw new Error(`host channel http ${response.status}`);
        } catch (error) {
          console.warn("[dsh-task-control] \u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF0C\u9000\u56DE\u53EF\u89C1\u6D88\u606F:", error);
          void ctx.sessions.binding(sessionId)?.session?.prompt([{ type: "text", text }], "queue");
        }
      }
    })
  }, EmergencyButton));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "task-check",
    order: 90,
    inject: (sessionId) => ({
      cancelSession: () => {
        void ctx.sessions.binding(sessionId)?.session?.cancel();
      }
    })
  }, CheckButton));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "task-append",
    order: 100,
    inject: (sessionId) => ({
      cancelSession: () => {
        void ctx.sessions.binding(sessionId)?.session?.cancel();
      },
      resumeTask: async (text) => {
        try {
          const response = await fetch("/dsh-task-control/resume", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, text })
          });
          if (!response.ok) throw new Error(`host channel http ${response.status}`);
        } catch (error) {
          console.warn("[dsh-task-control] \u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF0C\u9000\u56DE\u53EF\u89C1\u6D88\u606F:", error);
          void ctx.sessions.binding(sessionId)?.session?.prompt([{ type: "text", text }], "queue");
        }
      }
    })
  }, AppendButton));
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "task-control",
    order: 5
  }, SettingsCard));
}
return module.exports; } });
