/**
 * dsh-task-control 设置行（`settings.general.item`，通用设置里的"任务控制"一栏）：
 * 编辑所有可自定义文案。
 *
 * 为什么放在通用设置而不是插件页：新版的「插件」标签只做插件清单/开关展示，
 * `settings.plugin.item` 是 keyed slot（按插件的 settings 命名空间 dispatch）；
 * 而自定义设置项的正式位置是 `settings.general.item`（list slot，官方自己的
 * 语言/外观/Enter 行为都注册在这里），owner 不提供任何 props，行自己画标题与写入。
 */
import { useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// SlotMap 合并：settings.general.item
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { loadSettings, saveSettings, type TaskControlSettings } from './settings.ts'

type CardProps = PropsRuntime<'settings.general.item'>

const FIELDS: Array<[keyof TaskControlSettings, string]> = [
  ['emergencyLabel', '急停按钮文案'],
  ['checkLabel', '检测按钮文案'],
  ['appendLabel', '追加/暂停按钮文案'],
  ['healthyText', '检测·无异常输出'],
  ['errorText', '检测·出错输出（{error} 为错误信息）'],
  ['runningText', '检测·运行中输出'],
]

/** 插件设置卡：文案输入，改动即时保存到 localStorage。 */
export function SettingsCard(_props: CardProps) {
  const [s, setS] = useState<TaskControlSettings>(loadSettings)
  const set = (key: keyof TaskControlSettings, value: string): void => {
    const next = { ...s, [key]: value }
    setS(next)
    saveSettings(next)
  }
  return (
    <li style={{ padding: '8px 0' }}>
      <strong>任务控制（dsh-task-control）</strong>
      <div style={{ fontSize: '12px', opacity: 0.7 }}>
        检测：一键检查任务状态；追加/暂停：点击立即暂停，可输入条件带条件重跑，或保持暂停。
      </div>
      {FIELDS.map(([key, label]) => (
        <label key={key} style={{ display: 'block', margin: '6px 0' }}>
          <span style={{ display: 'block', fontSize: '12px' }}>{label}</span>
          <input
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--dsw-alias-border-l2)',
              // 底色与设置栏同步（设置面板背景即 bg-layer-2）
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
            }}
            value={s[key]}
            onChange={(e) => set(key, e.target.value)}
          />
        </label>
      ))}
    </li>
  )
}
