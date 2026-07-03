// 设置页共享的 config 读写：GET/PUT /api/v1/config。
// staleTime: Infinity —— 仅在本地成功提交后失效重取，避免后台自动刷新打断正在编辑的字段。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ConfigMap } from '../../lib/types'

export function useConfigQuery() {
  return useQuery({ queryKey: ['config'], queryFn: api.getConfig, staleTime: Infinity })
}

export function useConfigMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: ConfigMap) => api.putConfig(entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}
