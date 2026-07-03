// 设置页通用行内控件 —— 对齐 design.css 的 .set-row/.set-info/.switch/.select/.text-input。
// Radix Switch/Select 复用原型视觉（轨道/滑块/下拉），文本类控件失焦提交避免逐字符请求。

import * as SelectPrimitive from '@radix-ui/react-select'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function SetRow({
  title,
  desc,
  children,
  align = 'center',
}: {
  title: string
  desc?: string
  children: ReactNode
  align?: 'center' | 'start'
}) {
  return (
    <div className="set-row" style={align === 'start' ? { alignItems: 'flex-start' } : undefined}>
      <div className="set-info">
        <b>{title}</b>
        {desc ? <span>{desc}</span> : null}
      </div>
      {children}
    </div>
  )
}

export function SetSwitch({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full bg-track transition-colors data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-[3px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform duration-150 data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function SetSelect({
  value,
  onValueChange,
  options,
  width = 220,
}: {
  value: string
  onValueChange: (v: string) => void
  options: SelectOption[]
  width?: number
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger className="select" style={{ width, flexShrink: 0 }}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-lg border border-line bg-surface"
          style={{ minWidth: 'var(--radix-select-trigger-width)', boxShadow: 'var(--shadow)' }}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-pointer items-center rounded-md px-2 pr-7 text-[13px] text-text outline-none select-none data-[highlighted]:bg-[var(--hover)]"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check className="h-3.5 w-3.5 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/** 受控文本输入：本地编辑态，失焦时若与已提交值不同才回调提交。 */
export function TextInput({
  value,
  onCommit,
  placeholder,
  password,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  password?: boolean
  className?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      className={cn('text-input', className)}
      type={password ? 'password' : 'text'}
      spellCheck={false}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text)
      }}
    />
  )
}

export function NumberInput({
  value,
  onCommit,
  min,
  className,
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  className?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <input
      className={cn('text-input', className)}
      type="number"
      min={min}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text)
        if (Number.isFinite(n) && n !== value) onCommit(n)
        else setText(String(value))
      }}
    />
  )
}

export function TextAreaInput({
  value,
  onCommit,
  rows = 4,
  placeholder,
  width = 320,
}: {
  value: string
  onCommit: (v: string) => void
  rows?: number
  placeholder?: string
  width?: number
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <textarea
      className="text-input area"
      style={{ width }}
      spellCheck={false}
      rows={rows}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text)
      }}
    />
  )
}

export function TextFieldRow({
  title,
  desc,
  value,
  onCommit,
  placeholder,
  password,
}: {
  title: string
  desc?: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  password?: boolean
}) {
  return (
    <SetRow title={title} desc={desc}>
      <TextInput value={value} onCommit={onCommit} placeholder={placeholder} password={password} />
    </SetRow>
  )
}

export function NumberFieldRow({
  title,
  desc,
  value,
  onCommit,
  min,
  short = true,
}: {
  title: string
  desc?: string
  value: number
  onCommit: (v: number) => void
  min?: number
  short?: boolean
}) {
  return (
    <SetRow title={title} desc={desc}>
      <NumberInput value={value} onCommit={onCommit} min={min} className={short ? 'short' : undefined} />
    </SetRow>
  )
}

export function TextAreaFieldRow({
  title,
  desc,
  value,
  onCommit,
  placeholder,
}: {
  title: string
  desc?: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
}) {
  return (
    <SetRow title={title} desc={desc} align="start">
      <TextAreaInput value={value} onCommit={onCommit} placeholder={placeholder} />
    </SetRow>
  )
}
