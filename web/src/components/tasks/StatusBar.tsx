// 底部状态栏：全局速度、活跃/总任务数、限速状态、磁盘剩余、服务器版本。
// 对齐 design/web/index.html .statusbar；限速复用设置页的 useConfigQuery（单一数据源）。

import { useQuery } from '@tanstack/react-query'
import { Download, FlaskConical, HardDrive } from 'lucide-react'
import { api } from '../../lib/api'
import { fmtBytes, fmtSpeed } from '../../lib/format'
import { useGlobalSpeed } from '../../lib/ws'
import { useConfigQuery } from '../settings/useConfig'
import { useViewTasks } from './useViewTasks'

export function StatusBar() {
  const tasks = useViewTasks()
  const speed = useGlobalSpeed()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 30_000 })
  const { data: config } = useConfigQuery()
  const active = tasks.filter((t) => t.status === 0 || t.status === 1 || t.status === 5).length
  const limitBytes = Number(config?.speed_limit_bytes ?? 0)

  return (
    <footer className="statusbar">
      <span className="sb-item accent">
        <Download size={13} />
        <b>{fmtSpeed(speed)}</b>
      </span>
      <span className="sb-item">
        {active} 个活跃 · {tasks.length} 个任务
      </span>
      <span className="sb-item">
        限速：<b>{limitBytes > 0 ? fmtSpeed(limitBytes) : '关闭'}</b>
      </span>
      {stats?.demoMode && (
        <span className="sb-item accent" title={`演示模式：仅允许下载 ${stats.demoUrl}`}>
          <FlaskConical size={13} />
          演示模式
        </span>
      )}
      <span className="flex1" />
      <span className="sb-item" title="服务器磁盘剩余空间">
        <HardDrive size={13} />
        {stats ? `${stats.saveDir} · 剩余 ${stats.diskFreeBytes != null ? fmtBytes(stats.diskFreeBytes) : '未知'}` : '—'}
      </span>
      <span className="sb-item">FluxDown Server {stats?.serverVersion ?? '—'}</span>
    </footer>
  )
}
