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
  checkLabel: "\u62CD\u4E00\u4E0Bdeepseek",
  appendLabel: "\u8FFD\u52A0\u6761\u4EF6",
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
function CheckModal({ result, onClose }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 14 }, children: result }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onClose, children: "\u786E\u5B9A" }) })
  ] });
}
function CheckButton({ useSession }) {
  const s = useSettings();
  const running = useSession((s2) => s2.running);
  const lastError = useSession((s2) => s2.lastAgentError);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [result, setResult] = (0, import_react.useState)("");
  const onClick = () => {
    let text = s.healthyText;
    if (lastError) text = renderTemplate(s.errorText, { error: lastError });
    else if (running) text = s.runningText;
    setResult(text);
    setOpen(true);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskButton, { label: s.checkLabel, onClick }),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckModal, { result, onClose: () => setOpen(false) }),
      document.body
    )
  ] });
}
var PAUSE_HINT = "\u6253\u5F00\u6B64\u7A97\u53E3\u65F6\u7A0B\u5E8F\u4F1A\u6682\u505C";
var APPEND_TEMPLATE = "\u8865\u5145\u6761\u4EF6\uFF1A{\u6761\u4EF6}\uFF0C\u8BF7\u636E\u6B64\u91CD\u65B0\u6267\u884C\u521A\u624D\u7684\u4EFB\u52A1";
var RESUME_TEXT = "\u7EE7\u7EED";
var NO_TASK_NOTICE = "\u5F53\u524D\u6CA1\u6709\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1";
function TaskButton({ label, onClick }) {
  const [hover, setHover] = (0, import_react.useState)(false);
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
        background: hover ? "var(--dsw-alias-button-info-hover)" : "var(--dsw-alias-button-info-fill)",
        color: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        lineHeight: "20px"
      },
      children: label
    }
  );
}
function AppendModal({ hint, onSubmit, onCancel }) {
  const [value, setValue] = (0, import_react.useState)("");
  const commit = () => onSubmit(value.trim());
  const handleKey = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") onCancel();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModalShell, { onClose: onCancel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, opacity: 0.85, marginBottom: 10 }, children: hint }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        autoFocus: true,
        value,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: handleKey,
        placeholder: "\u8865\u5145\u6761\u4EF6\uFF08\u7559\u7A7A\u6216\u6309 Esc = \u7EE7\u7EED\u539F\u4EFB\u52A1\uFF09",
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onCancel, children: "\u53D6\u6D88\uFF08\u7EE7\u7EED\u539F\u4EFB\u52A1\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: commit, children: "\u786E\u5B9A" })
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppendModal, { hint: PAUSE_HINT, onSubmit, onCancel }, resetKey),
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
  ["checkLabel", "\u68C0\u6D4B\u6309\u94AE\u6587\u6848"],
  ["appendLabel", "\u8FFD\u52A0\u6761\u4EF6\u6309\u94AE\u6587\u6848"],
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "12px", opacity: 0.7 }, children: "\u68C0\u6D4B\uFF1A\u4E00\u952E\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001\uFF1B\u8FFD\u52A0\u6761\u4EF6\uFF1A\u4E2D\u6B62\u5F53\u524D\u4EFB\u52A1\u5E76\u5E26\u8865\u5145\u6761\u4EF6\u91CD\u65B0\u6267\u884C\u3002" }),
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
    id: "task-check",
    order: 90
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
