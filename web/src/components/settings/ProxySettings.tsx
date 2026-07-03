// 代理：服务器出站代理（config 表）+ 连通性测试（/api/v1/proxy/test）。
import { useState } from 'react'
import { api } from '../../lib/api'
import type { ConfigMap } from '../../lib/types'
import { SetRow, SetSelect, TextFieldRow } from './controls'

const PROXY_MODE_OPTIONS = [
  { value: 'none', label: '不使用代理' },
  { value: 'system', label: '系统代理' },
  { value: 'manual', label: '手动配置' },
]

const PROXY_TYPE_OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks4', label: 'SOCKS4' },
  { value: 'socks5', label: 'SOCKS5' },
]

type TestState = { status: 'idle' | 'pending' | 'ok' | 'err'; detail?: string }

export function ProxySettings({
  config,
  mutate,
}: {
  config: ConfigMap
  mutate: (entries: ConfigMap) => void
}) {
  const mode = config.proxy_mode ?? 'none'
  const type = config.proxy_type ?? 'socks5'
  const host = config.proxy_host ?? ''
  const port = config.proxy_port ?? ''
  const username = config.proxy_username ?? ''
  const password = config.proxy_password ?? ''
  const noList = config.proxy_no_list ?? ''

  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  async function runTest() {
    setTestState({ status: 'pending' })
    try {
      const res = await api.proxyTest({
        proxyType: type,
        host,
        port,
        username: username || undefined,
        password: password || undefined,
      })
      setTestState({ status: 'ok', detail: `连通 · ${res.latencyMs}ms` })
    } catch (err) {
      setTestState({ status: 'err', detail: err instanceof Error ? err.message : '测试失败' })
    }
  }

  return (
    <>
      <h2 className="set-title">代理</h2>
      <p className="set-desc">服务器出站代理</p>
      <p className="set-note">
        <b>Web 版差异</b>：「系统代理」需读取系统注册表，服务器端建议使用「手动配置」。
      </p>
      <div className="set-group">
        <SetRow title="代理模式">
          <SetSelect value={mode} onValueChange={(v) => mutate({ proxy_mode: v })} options={PROXY_MODE_OPTIONS} />
        </SetRow>
        {mode === 'manual' ? (
          <>
            <SetRow title="类型" desc="HTTP / HTTPS / SOCKS4 / SOCKS5">
              <SetSelect value={type} onValueChange={(v) => mutate({ proxy_type: v })} options={PROXY_TYPE_OPTIONS} />
            </SetRow>
            <TextFieldRow title="地址" value={host} placeholder="127.0.0.1" onCommit={(v) => mutate({ proxy_host: v })} />
            <TextFieldRow title="端口" value={port} placeholder="1080" onCommit={(v) => mutate({ proxy_port: v })} />
            <TextFieldRow
              title="用户名"
              desc="可选"
              value={username}
              onCommit={(v) => mutate({ proxy_username: v })}
            />
            <TextFieldRow
              title="密码"
              desc="可选"
              value={password}
              password
              onCommit={(v) => mutate({ proxy_password: v })}
            />
            <TextFieldRow
              title="排除列表"
              desc="不走代理的域名，逗号分隔"
              value={noList}
              placeholder="localhost, *.lan"
              onCommit={(v) => mutate({ proxy_no_list: v })}
            />
            <SetRow title="连通性测试">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={testState.status === 'pending'}
                  onClick={runTest}
                >
                  {testState.status === 'pending' ? '测试中…' : '测试'}
                </button>
                {testState.status === 'ok' ? <span className="text-[12px] text-success">{testState.detail}</span> : null}
                {testState.status === 'err' ? <span className="text-[12px] text-danger">{testState.detail}</span> : null}
              </div>
            </SetRow>
          </>
        ) : null}
      </div>
    </>
  )
}
