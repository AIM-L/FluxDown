// 外观：主题模式 + 强调色 —— 纯前端，保存在浏览器本地（useTheme）。
import { ACCENT_PRESETS, useTheme } from '../../lib/theme'
import type { ThemeMode } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { SetRow, SetSelect } from './controls'

const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function AppearanceSettings() {
  const { mode, setMode, accent, setAccent } = useTheme()

  return (
    <>
      <h2 className="set-title">外观</h2>
      <p className="set-desc">主题与配色（保存在浏览器本地）</p>
      <div className="set-group">
        <SetRow title="主题模式">
          <SetSelect value={mode} onValueChange={(v) => setMode(v as ThemeMode)} options={MODE_OPTIONS} />
        </SetRow>
        <SetRow title="强调色" desc={ACCENT_PRESETS.map((p) => p.name).join(' / ')}>
          <div className="color-dots">
            {ACCENT_PRESETS.map((p, i) => (
              <button
                key={p.name}
                type="button"
                aria-label={p.name}
                className={cn('color-dot', i === accent && 'active')}
                style={{ background: p.light }}
                onClick={() => setAccent(i)}
              />
            ))}
          </div>
        </SetRow>
      </div>
    </>
  )
}
