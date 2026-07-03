// 下载：默认保存目录 / 全局限速 / 全局 User-Agent（服务器 config 表）。
import type { ConfigMap } from '../../lib/types'
import { NumberFieldRow, SetRow, SetSelect, TextFieldRow } from './controls'

const MB = 1024 * 1024

const UA_PRESETS = [
  { label: '默认（不设置）', value: '' },
  {
    label: 'Chrome',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  {
    label: 'Firefox',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  },
  {
    label: 'Edge',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  },
  {
    label: 'Safari',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  },
]

export function DownloadSettings({
  config,
  mutate,
}: {
  config: ConfigMap
  mutate: (entries: ConfigMap) => void
}) {
  const saveDir = config.default_save_dir ?? ''
  const speedBytes = Number(config.speed_limit_bytes ?? '0')
  const speedMB = speedBytes > 0 ? speedBytes / MB : 0
  const ua = config.global_user_agent ?? ''
  const uaOptions = ua && !UA_PRESETS.some((p) => p.value === ua) ? [{ label: '自定义', value: ua }, ...UA_PRESETS] : UA_PRESETS

  return (
    <>
      <h2 className="set-title">下载</h2>
      <p className="set-desc">保存在服务器 config 表，作用于下载引擎</p>
      <div className="set-group">
        <TextFieldRow
          title="默认保存目录"
          desc="服务器文件系统路径"
          value={saveDir}
          onCommit={(v) => mutate({ default_save_dir: v })}
        />
        <NumberFieldRow
          title="全局限速"
          desc="单位 MB/s，Token Bucket，0 = 不限速"
          value={speedMB}
          min={0}
          onCommit={(n) => mutate({ speed_limit_bytes: String(Math.max(0, Math.round(n * MB))) })}
        />
        <SetRow title="全局 User-Agent" desc="预设：Chrome / Firefox / Edge / Safari">
          <SetSelect value={ua} onValueChange={(v) => mutate({ global_user_agent: v })} options={uaOptions} />
        </SetRow>
      </div>
    </>
  )
}
