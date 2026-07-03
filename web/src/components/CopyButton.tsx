// 图标复制按钮：点击写入剪贴板后切换为绿色对勾 1.5s 作为视觉反馈。
// 外观（尺寸/hover）由父级选择器（.copy-row button / .token-box button）提供。

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ value, title = '复制' }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <button
      type="button"
      className={copied ? 'copied' : undefined}
      title={copied ? '已复制' : title}
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  )
}
