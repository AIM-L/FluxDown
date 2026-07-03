// 状态 Tab：全部 / 下载中 / 已完成 / 已暂停 / 错误 + 计数。
// 对齐 design/web/index.html #statusTabs；计数基于全量任务（不叠加类型/队列/搜索筛选）。

import { cn } from '../../lib/cn'
import { countByStatusTab, type StatusTab } from './filters'
import { useTasksUi } from './context'
import { useViewTasks } from './useViewTasks'

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'downloading', label: '下载中' },
  { id: 'completed', label: '已完成' },
  { id: 'paused', label: '已暂停' },
  { id: 'error', label: '错误' },
]

export function StatusTabs() {
  const { statusTab, setStatusTab } = useTasksUi()
  const tasks = useViewTasks()
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <button key={tab.id} type="button" className={cn('tab', statusTab === tab.id && 'active')} onClick={() => setStatusTab(tab.id)}>
          {tab.label} <em>{countByStatusTab(tasks, tab.id)}</em>
        </button>
      ))}
    </div>
  )
}
