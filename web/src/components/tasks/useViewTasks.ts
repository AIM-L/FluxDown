// 合成视图任务：REST TaskDto（['tasks'] 缓存）叠加 live 值（liveStore），
// live 优先于 REST（status/downloadedBytes/totalBytes/errorMessage），并补上 REST 没有的 speed。

import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { liveStore, useStore } from '../../lib/ws'
import type { TaskDto } from '../../lib/types'

export interface ViewTask extends TaskDto {
  speed: number
}

export function useViewTasks(): ViewTask[] {
  const { data } = useQuery({ queryKey: ['tasks'], queryFn: api.listTasks })
  const live = useStore(liveStore)
  const tasks = data ?? []
  return tasks.map((t): ViewTask => {
    const l = live[t.taskId]
    if (!l) return { ...t, speed: 0 }
    return {
      ...t,
      status: l.status,
      downloadedBytes: l.downloadedBytes,
      totalBytes: l.totalBytes || t.totalBytes,
      errorMessage: l.errorMessage,
      speed: l.speed,
    }
  })
}
