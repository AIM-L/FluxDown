// 任务主界面的纯 UI 状态（筛选 / 搜索 / 选中 / 折叠 / 详情面板），与服务端数据（React Query）分离。
// react-compiler 已启用，不手写 useMemo/useCallback。

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { FileType, TimeGroup } from '../../lib/format'
import type { StatusTab } from './filters'

export type DetailTab = 'general' | 'segments' | 'queue' | 'log' | 'advanced'

interface TasksUiState {
  typeFilter: 'all' | FileType
  setTypeFilter: Dispatch<SetStateAction<'all' | FileType>>
  queueFilter: string
  setQueueFilter: Dispatch<SetStateAction<string>>
  statusTab: StatusTab
  setStatusTab: Dispatch<SetStateAction<StatusTab>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  manageMode: boolean
  setManageMode: Dispatch<SetStateAction<boolean>>
  selected: Set<string>
  setSelected: Dispatch<SetStateAction<Set<string>>>
  folded: Set<TimeGroup>
  toggleFold: (g: TimeGroup) => void
  currentTaskId: string | null
  detailOpen: boolean
  detailTab: DetailTab
  setDetailTab: Dispatch<SetStateAction<DetailTab>>
  selectTask: (id: string) => void
  closeDetail: () => void
}

const Ctx = createContext<TasksUiState | null>(null)

export function TasksUiProvider({ children }: { children: ReactNode }) {
  const [typeFilter, setTypeFilter] = useState<'all' | FileType>('all')
  const [queueFilter, setQueueFilter] = useState('all')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [manageMode, setManageModeState] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState<Set<TimeGroup>>(new Set())
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('general')

  function setManageMode(v: SetStateAction<boolean>) {
    setManageModeState(v)
    setSelected(new Set())
  }
  function toggleFold(g: TimeGroup) {
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }
  function selectTask(id: string) {
    setCurrentTaskId(id)
    setDetailOpen(true)
  }
  function closeDetail() {
    setDetailOpen(false)
  }

  return (
    <Ctx.Provider
      value={{
        typeFilter,
        setTypeFilter,
        queueFilter,
        setQueueFilter,
        statusTab,
        setStatusTab,
        search,
        setSearch,
        manageMode,
        setManageMode,
        selected,
        setSelected,
        folded,
        toggleFold,
        currentTaskId,
        detailOpen,
        detailTab,
        setDetailTab,
        selectTask,
        closeDetail,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useTasksUi(): TasksUiState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTasksUi must be used within TasksUiProvider')
  return ctx
}
