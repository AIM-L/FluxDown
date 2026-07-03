// 任务事件时间线（模块级环形缓冲，仅本次会话内有效）。
// 订阅 lib/ws.ts 已公开的 liveStore / splitStore 变更并做本地 diff——不修改 lib/ws.ts。
// 只记录离散事件（状态迁移、分段拆分），不记录高频字节级 tick，避免刷屏也不造假数据。

import { liveStore, splitStore, Store } from '../../lib/ws'
import type { TaskStatus } from '../../lib/types'

export interface LogEntry {
  id: number
  at: number
  taskId: string
  message: string
  isError: boolean
}

const MAX_ENTRIES = 300

const STATUS_LABEL: Record<TaskStatus, string> = {
  0: '排队中',
  1: '下载中',
  2: '已暂停',
  3: '已完成',
  4: '错误',
  5: '正在准备',
}

let seq = 0
let entries: LogEntry[] = []
export const eventLogStore = new Store<LogEntry[]>([])
const lastStatus = new Map<string, TaskStatus>()

function push(taskId: string, message: string, isError = false) {
  seq += 1
  const next = [...entries, { id: seq, at: Date.now(), taskId, message, isError }]
  entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
  eventLogStore.set(entries)
}

liveStore.subscribe(() => {
  const live = liveStore.get()
  for (const taskId in live) {
    const status = live[taskId].status
    const prev = lastStatus.get(taskId)
    lastStatus.set(taskId, status)
    // 首次观测到该任务（如刚连接/刷新页面）不记录，避免把历史状态当作"刚发生的变更"刷屏。
    if (prev === undefined || prev === status) continue
    if (status === 4) push(taskId, `出错：${live[taskId].errorMessage || '未知错误'}`, true)
    else push(taskId, `状态变更：${STATUS_LABEL[prev]} → ${STATUS_LABEL[status]}`)
  }
})

splitStore.subscribe(() => {
  const s = splitStore.get()
  if (!s) return
  push(
    s.taskId,
    `分段 #${s.parentIndex + 1} ${s.isProactive ? '主动' : '被动'}拆分 → 新增 #${s.childIndex + 1}（共 ${s.totalSegments} 个分段）`,
  )
})
