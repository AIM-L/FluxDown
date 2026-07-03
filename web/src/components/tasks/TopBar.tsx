// 顶部工具栏：搜索、批量管理开关、全局暂停/恢复、限速快览、新建下载、设置入口。
// 对齐 design/web/index.html .topbar 结构；批量选择状态见 ManageBar。

import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Gauge, ListChecks, Pause, Play, Plus, Search, Settings } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { openNewDownload } from '../../lib/dialogs'
import { fmtSpeed } from '../../lib/format'
import { useConfigQuery } from '../settings/useConfig'
import { useTasksUi } from './context'
import { useViewTasks } from './useViewTasks'

export function TopBar() {
  const navigate = useNavigate()
  const { search, setSearch, manageMode, setManageMode } = useTasksUi()
  const tasks = useViewTasks()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const hasActive = tasks.some((t) => t.status === 0 || t.status === 1 || t.status === 5)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] })
  const pauseAll = useMutation({ mutationFn: api.pauseAll, onSuccess: invalidate })
  const continueAll = useMutation({ mutationFn: api.continueAll, onSuccess: invalidate })

  return (
    <header className="topbar">
      <div className="search">
        <Search size={14} />
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索任务名称…（Ctrl+F）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearch('')
              e.currentTarget.blur()
            }
          }}
        />
      </div>
      <div className="topbar-actions">
        <button type="button" className={cn('icon-btn', manageMode && 'active')} title="批量管理" onClick={() => setManageMode((v) => !v)}>
          <ListChecks size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="全部暂停 / 恢复"
          onClick={() => (hasActive ? pauseAll.mutate() : continueAll.mutate())}
        >
          {hasActive ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <LimitButton />
        <span className="vsep" />
        <button type="button" className="btn primary" onClick={openNewDownload}>
          <Plus size={15} />
          新建下载
        </button>
        <button type="button" className="icon-btn" title="设置" onClick={() => navigate({ to: '/settings' })}>
          <Settings size={17} />
        </button>
      </div>
    </header>
  )
}

/** 全局限速快览；点击跳转设置页调整（单一数据源，避免与设置页的编辑控件重复）。 */
function LimitButton() {
  const navigate = useNavigate()
  const { data: config } = useConfigQuery()
  const bytes = Number(config?.speed_limit_bytes ?? 0)
  const label = bytes > 0 ? `全局限速：${fmtSpeed(bytes)}` : '全局限速：未开启'
  return (
    <button type="button" className="icon-btn" title={`${label}（前往设置调整）`} onClick={() => navigate({ to: '/settings' })}>
      <Gauge size={17} />
    </button>
  )
}
