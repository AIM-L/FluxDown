// #screen-settings —— 左侧分类导航 + 右侧设置正文。
import { useNavigate } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, Download, Globe, Info, Lock, Monitor, Palette, Shield } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import type { ConfigMap } from '../lib/types'
import { AboutSettings } from '../components/settings/AboutSettings'
import { AppearanceSettings } from '../components/settings/AppearanceSettings'
import { BitTorrentSettings } from '../components/settings/BitTorrentSettings'
import { DownloadSettings } from '../components/settings/DownloadSettings'
import { GeneralSettings } from '../components/settings/GeneralSettings'
import { ProxySettings } from '../components/settings/ProxySettings'
import { SecuritySettings } from '../components/settings/SecuritySettings'
import { useConfigMutation, useConfigQuery } from '../components/settings/useConfig'

type Category = 'general' | 'appearance' | 'download' | 'bt' | 'proxy' | 'security' | 'about'

const NAV: { key: Category; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: '通用', icon: Monitor },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'download', label: '下载', icon: Download },
  { key: 'bt', label: 'BitTorrent', icon: Globe },
  { key: 'proxy', label: '代理', icon: Shield },
  { key: 'security', label: '安全与访问', icon: Lock },
  { key: 'about', label: '关于', icon: Info },
]

export function SettingsScreen() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Category>('general')
  const { data: config, isLoading, isError } = useConfigQuery()
  const mutation = useConfigMutation()

  function mutate(entries: ConfigMap) {
    mutation.mutate(entries)
  }

  function renderBody() {
    if (cat === 'appearance') return <AppearanceSettings />
    if (cat === 'about') return <AboutSettings />
    if (isLoading) return <p className="set-desc">加载中…</p>
    if (isError || !config) return <p className="set-desc text-danger">配置加载失败</p>
    switch (cat) {
      case 'general':
        return <GeneralSettings config={config} mutate={mutate} />
      case 'download':
        return <DownloadSettings config={config} mutate={mutate} />
      case 'bt':
        return <BitTorrentSettings config={config} mutate={mutate} />
      case 'proxy':
        return <ProxySettings config={config} mutate={mutate} />
      case 'security':
        return <SecuritySettings config={config} mutate={mutate} />
      default:
        return null
    }
  }

  return (
    <section className="wscreen active" id="screen-settings">
      <aside className="settings-side">
        <button className="settings-back" type="button" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft />
          返回
        </button>
        <p className="side-label">设置</p>
        <nav className="settings-nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={cn(cat === key && 'active')} onClick={() => setCat(key)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="settings-body">{renderBody()}</div>
    </section>
  )
}
