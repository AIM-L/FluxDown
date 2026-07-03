// BitTorrent：librqbit 引擎参数（服务器 config 表）。
import type { ConfigMap } from '../../lib/types'
import { NumberInput, SetRow, SetSwitch, TextAreaFieldRow } from './controls'

export function BitTorrentSettings({
  config,
  mutate,
}: {
  config: ConfigMap
  mutate: (entries: ConfigMap) => void
}) {
  const dht = (config.bt_enable_dht ?? 'true') === 'true'
  const upnp = (config.bt_enable_upnp ?? 'true') === 'true'
  const portStart = Number(config.bt_port_start ?? '6881')
  const portEnd = Number(config.bt_port_end ?? '6889')
  const trackers = config.bt_custom_trackers ?? ''

  return (
    <>
      <h2 className="set-title">BitTorrent</h2>
      <p className="set-desc">librqbit 引擎参数（服务器端）</p>
      <div className="set-group">
        <SetRow title="启用 DHT" desc="无 Tracker 时通过分布式哈希表发现节点">
          <SetSwitch checked={dht} onCheckedChange={(v) => mutate({ bt_enable_dht: String(v) })} />
        </SetRow>
        <SetRow title="启用 UPnP" desc="自动映射路由器端口">
          <SetSwitch checked={upnp} onCheckedChange={(v) => mutate({ bt_enable_upnp: String(v) })} />
        </SetRow>
        <SetRow title="监听端口范围" desc="DHT / 出站连接监听端口区间">
          <div className="flex items-center gap-2">
            <NumberInput value={portStart} min={1} className="short" onCommit={(n) => mutate({ bt_port_start: String(n) })} />
            <span className="text-text3">–</span>
            <NumberInput value={portEnd} min={1} className="short" onCommit={(n) => mutate({ bt_port_end: String(n) })} />
          </div>
        </SetRow>
      </div>
      <div className="set-group">
        <TextAreaFieldRow
          title="自定义 Tracker"
          desc="每行一个 Tracker 地址"
          value={trackers}
          placeholder={'udp://tracker.opentrackr.org:1337/announce'}
          onCommit={(v) => mutate({ bt_custom_trackers: v })}
        />
      </div>
    </>
  )
}
