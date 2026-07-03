// 关于：版本信息 + 退出登录。
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../../lib/api'
import { clearCredentials } from '../../lib/auth'
import { disconnectWs } from '../../lib/ws'
import { SetRow } from './controls'

export function AboutSettings() {
  const navigate = useNavigate()
  const { data: info, isLoading } = useQuery({ queryKey: ['info'], queryFn: api.info })

  function logout() {
    clearCredentials()
    disconnectWs()
    navigate({ to: '/login' })
  }

  return (
    <>
      <h2 className="set-title">关于</h2>
      <p className="set-desc">FluxDown Server — Downloads, Supercharged.</p>
      <div className="set-group">
        <SetRow title="服务器版本">
          <span className="set-value">{isLoading ? '加载中…' : info ? `${info.app} ${info.version}` : '—'}</span>
        </SetRow>
      </div>
      <div className="set-group">
        <SetRow title="退出登录" desc="清除本地保存的服务器地址与令牌">
          <button type="button" className="btn danger sm" onClick={logout}>
            退出登录
          </button>
        </SetRow>
      </div>
      <p className="set-desc" style={{ marginTop: 14 }}>
        零广告 · 零追踪 · 无需账号 · 数据全在你的服务器
      </p>
    </>
  )
}
