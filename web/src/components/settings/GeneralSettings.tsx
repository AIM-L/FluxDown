// 通用：并发/分段/重试参数（服务器 config 表）。
import type { ConfigMap } from '../../lib/types'
import { NumberFieldRow } from './controls'

export function GeneralSettings({
  config,
  mutate,
}: {
  config: ConfigMap
  mutate: (entries: ConfigMap) => void
}) {
  const maxConcurrent = Number(config.max_concurrent_tasks ?? '5')
  const defaultSegments = Number(config.default_segments ?? '0')
  const maxRetries = Number(config.max_auto_retries ?? '3')
  const retryDelay = Number(config.auto_retry_delay_secs ?? '5')

  return (
    <>
      <h2 className="set-title">通用</h2>
      <p className="set-desc">服务器行为设置，保存在服务器 config 表</p>
      <div className="set-group">
        <NumberFieldRow
          title="最大并发任务"
          desc="同时进行下载的任务数量上限"
          value={maxConcurrent}
          min={1}
          onCommit={(n) => mutate({ max_concurrent_tasks: String(n) })}
        />
        <NumberFieldRow
          title="默认下载线程数"
          desc="0 = 由 segment_advisor 按文件大小动态决定"
          value={defaultSegments}
          min={0}
          onCommit={(n) => mutate({ default_segments: String(n) })}
        />
        <NumberFieldRow
          title="自动重试次数上限"
          desc="下载失败后自动重试的最大次数"
          value={maxRetries}
          min={0}
          onCommit={(n) => mutate({ max_auto_retries: String(n) })}
        />
        <NumberFieldRow
          title="重试间隔"
          desc="失败后到下一次自动重试的等待秒数"
          value={retryDelay}
          min={0}
          onCommit={(n) => mutate({ auto_retry_delay_secs: String(n) })}
        />
      </div>
    </>
  )
}
