/**
 * dsh-task-control 可自定义文案的存储（localStorage 持久化 + 简单发布订阅）。
 */

/** 所有可自定义的文案（追加条件相关文本已定稿为硬编码，不可自定义）。 */
export interface TaskControlSettings {
  /** 检测按钮文案 */
  checkLabel: string
  /** 追加条件按钮文案 */
  appendLabel: string
  /** 检测·健康输出 */
  healthyText: string
  /** 检测·出错输出（{error} = 错误信息） */
  errorText: string
  /** 检测·运行中输出 */
  runningText: string
}

/** 默认文案。 */
export const SETTINGS_DEFAULTS: TaskControlSettings = {
  checkLabel: '拍一下deepseek',
  appendLabel: '追加条件',
  healthyText: '任务正常，无异常',
  errorText: '任务出错：{error}',
  runningText: '任务正在运行中，暂未出错',
}

/** 可自定义的键集合（用于清洗旧版本 localStorage 中已移除的键）。 */
const SETTING_KEYS = new Set<keyof TaskControlSettings>(Object.keys(SETTINGS_DEFAULTS) as Array<keyof TaskControlSettings>)

const KEY = 'dsh-task-control:settings'
const listeners = new Set<() => void>()

/** 读取设置（localStorage，只取仍有效的键，失败回退默认值）。 */
export function loadSettings(): TaskControlSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<TaskControlSettings>
    const clean: TaskControlSettings = { ...SETTINGS_DEFAULTS }
    for (const key of SETTING_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string') clean[key] = value
    }
    return clean
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

/** 保存设置并通知订阅者。 */
export function saveSettings(next: TaskControlSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next))
  for (const fn of listeners) fn()
}

/** 订阅设置变化；返回取消订阅函数。 */
export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 模板渲染：{占位符} 替换（占位符可为中文，如 {条件}）。 */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}
