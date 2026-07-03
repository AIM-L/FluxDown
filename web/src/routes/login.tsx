// #screen-login —— 服务器地址 + 令牌登录卡片，对齐 design/web/index.html。
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { saveCredentials } from '../lib/auth'

export function LoginScreen() {
  const navigate = useNavigate()
  const [base, setBase] = useState(() => window.location.origin)
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      const trimmed = base.trim()
      const effectiveBase = trimmed === window.location.origin ? '' : trimmed
      await api.probe(effectiveBase, token)
      saveCredentials(effectiveBase, token, remember)
      navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '无法连接到服务器，请检查地址')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="wscreen active" id="screen-login">
      <div className="login-bg" />
      <div className="login-card">
        <span className="login-logo">
          <svg viewBox="30 30 452 452" role="img" xmlns="http://www.w3.org/2000/svg">
            <rect x="56" y="56" width="400" height="400" rx="88" fill="#3B82F6" />
            <path
              d="M 226 131 Q 226 119 238 119 L 274 119 Q 286 119 286 131 L 286 296 L 331 251 Q 340 242 349 251 L 363 265 Q 372 274 363 283 L 265 381 Q 256 390 247 381 L 149 283 Q 140 274 149 265 L 163 251 Q 172 242 181 251 L 226 296 Z"
              fill="#F2F4F8"
            />
          </svg>
        </span>
        <h2>连接到 FluxDown 服务器</h2>
        <p className="login-sub">Downloads, Supercharged. — 远程管理你的下载引擎</p>
        <form className="contents" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="login-base">
            服务器地址
          </label>
          <input
            id="login-base"
            className="text-input"
            type="text"
            spellCheck={false}
            required
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
          <label className="field-label" htmlFor="login-token">
            访问令牌
          </label>
          <input
            id="login-token"
            className="text-input"
            type="password"
            spellCheck={false}
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <i />
            记住此设备
          </label>
          {error ? <p className="mt-[-6px] mb-3 text-[12px] text-danger">{error}</p> : null}
          <button className="btn primary block" type="submit" disabled={pending}>
            {pending ? '连接中…' : '连 接'}
          </button>
        </form>
        <p className="login-hint">令牌在服务器「设置 → 安全与访问」中生成；连接仅限局域网或经反向代理的 HTTPS。</p>
      </div>
      <div className="login-feats">
        <span>
          <b>Rust 引擎</b>HTTP · FTP · BT · HLS · DASH
        </span>
        <span>
          <b>实时推送</b>WebSocket 进度 / 分段拆分
        </span>
        <span>
          <b>零追踪</b>无账号 · 数据全在你的服务器
        </span>
      </div>
    </section>
  )
}
