/**
 * FluxDown Popup Script
 *
 * 功能：
 * - 连接状态显示
 * - 下载拦截开关
 * - 今日拦截统计
 * - 快捷设置（最小文件大小、通知）
 * - 文件扩展名管理（Tag 增删）
 * - 排除域名管理（快捷添加当前站点）
 * - 主题切换
 * - 多语言支持（中/英）
 */

import { initI18n, applyI18nToDOM, t, getLocale, saveLocale } from '@/utils/i18n';
import { checkFluxDownAvailable } from '@/utils/download-dispatch';
import { loadSettings, saveSettings } from '@/utils/settings';
import { remotePing } from '@/utils/remote-server';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ===== DOM 元素 =====
const statusBadge = $('#statusBadge')!;
const statusText = statusBadge.querySelector('.status-text')!;
const enableToggle = $<HTMLInputElement>('#enableToggle');
const enableHint = $('#enableHint')!;
const dotVisibleToggle = $<HTMLInputElement>('#dotVisibleToggle');
const interceptModeSelect = $<HTMLSelectElement>('#interceptModeSelect');
const modeHint = $('#modeHint')!;
const minSizeSelect = $<HTMLSelectElement>('#minSizeSelect');

// 远程下载源
const remoteModeSelect = $<HTMLSelectElement>('#remoteModeSelect');
const remoteModeHint = $('#remoteModeHint')!;
const remoteUrlInput = $<HTMLInputElement>('#remoteUrlInput');
const remoteTokenInput = $<HTMLInputElement>('#remoteTokenInput');
const remoteTestBtn = $<HTMLButtonElement>('#remoteTestBtn');
const remoteTestResult = $('#remoteTestResult')!;
const themeBtn = $<HTMLButtonElement>('#themeBtn');
const langBtn = $<HTMLButtonElement>('#langBtn');
const langLabel = langBtn.querySelector('.lang-label')!;

// 版本号
const versionLabel = $('#versionLabel')!;

// 统计
const statSent = $('#statSent')!;
const statFailed = $('#statFailed')!;
const resetStatsBtn = $<HTMLButtonElement>('#resetStatsBtn');

// 域名管理
const addDomainManualBtn = $<HTMLButtonElement>('#addDomainManualBtn');
const addCurrentDomainBtn = $<HTMLButtonElement>('#addCurrentDomainBtn');
const domainInputRow = $('#domainInputRow')!;
const domainInput = $<HTMLInputElement>('#domainInput');
const domainConfirmBtn = $<HTMLButtonElement>('#domainConfirmBtn');
const domainCancelBtn = $<HTMLButtonElement>('#domainCancelBtn');
const domainList = $('#domainList')!;
const domainEmptyHint = $('#domainEmptyHint')!;

// ===== 主题管理 =====
type ThemeMode = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

async function initTheme() {
  const result = await browser.storage.local.get('theme') ?? {};
  const saved: ThemeMode = result.theme || 'system';
  applyTheme(saved);
}

async function toggleTheme() {
  const root = document.documentElement;
  const currentAttr = root.getAttribute('data-theme');
  let next: 'light' | 'dark';
  if (!currentAttr) {
    next = getSystemTheme() === 'dark' ? 'light' : 'dark';
  } else {
    next = currentAttr === 'dark' ? 'light' : 'dark';
  }
  applyTheme(next);
  await browser.storage.local.set({ theme: next });
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', async () => {
  const result = await browser.storage.local.get('theme') ?? {};
  if (!result.theme || result.theme === 'system') {
    applyTheme('system');
  }
});

// ===== Toast =====
function showToast(message: string, type: 'success' | 'error' = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast!.classList.remove('show'), 2000);
}

// ===== 域名管理 =====
function renderDomainList(domains: string[]) {
  // 清除非 empty-hint 的元素
  domainList.querySelectorAll('.domain-item').forEach((el) => el.remove());

  if (domains.length === 0) {
    domainEmptyHint.style.display = '';
    return;
  }

  domainEmptyHint.style.display = 'none';

  for (const domain of domains) {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `
      <span class="domain-text">${domain}</span>
      <button class="domain-remove" data-domain="${domain}">&times;</button>
    `;
    domainList.appendChild(item);
  }

  // 绑定删除事件
  domainList.querySelectorAll<HTMLButtonElement>('.domain-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain!;
      await removeDomain(domain);
    });
  });
}

async function removeDomain(domain: string) {
  const current = await loadSettings();
  const domains = current.excludeDomains.filter((d) => d !== domain);
  if (domains.length !== current.excludeDomains.length) {
    await saveSettings({ excludeDomains: domains });
    renderDomainList(domains);
    showToast(t('domain.removed', { domain }));
  }
}

async function addDomain(domain: string) {
  domain = domain.trim().toLowerCase();
  if (!domain) return;

  const current = await loadSettings();
  const domains = [...current.excludeDomains];

  if (domains.includes(domain)) {
    showToast(t('domain.exists', { domain }), 'error');
    return;
  }

  domains.push(domain);
  await saveSettings({ excludeDomains: domains });
  renderDomainList(domains);
  showToast(t('domain.excluded', { domain }));
}

// ===== 统计 =====
async function loadStats() {
  const result = await browser.storage.local.get('stats') ?? {};
  const stats = result.stats || { sent: 0, failed: 0, date: '' };

  // 检查是否是今天的统计
  const today = new Date().toDateString();
  if (stats.date !== today) {
    // 新的一天，重置
    const resetStats = { sent: 0, failed: 0, date: today };
    await browser.storage.local.set({ stats: resetStats });
    statSent.textContent = '0';
    statFailed.textContent = '0';
    return;
  }

  statSent.textContent = String(stats.sent || 0);
  statFailed.textContent = String(stats.failed || 0);
}

// ===== 连接状态 =====
// 并发守卫：设置变更可能连续触发刷新，只让最后一次的结果落到 UI。
let _statusEpoch = 0;

/**
 * 按当前 remoteMode 刷新头部连接徽标（off=NMH / always=远程 / fallback=任一）。
 * 探活逻辑复用 download-dispatch，与实际下载路由判定保持一致。
 */
async function refreshConnectionStatus(): Promise<void> {
  const epoch = ++_statusEpoch;
  statusBadge.className = 'status-badge';
  statusText.textContent = t('header.checking');

  const available = await checkFluxDownAvailable().catch(() => false);
  if (epoch !== _statusEpoch) return; // 已有更新的刷新在途，丢弃本次结果

  if (available) {
    statusBadge.className = 'status-badge connected';
    statusText.textContent = t('header.connected');
    // 探活成功 → 通知 background 解除可用性熔断，让接管状态与这里显示的
    // "已连接"保持一致，避免熔断期内 popup 显示已连接但下载仍被旁路到
    // 浏览器（review 发现 #1/#4/#6）。fire-and-forget：不依赖返回值，
    // 规避 Firefox MV2 下 sendMessage 收到 undefined 的问题。
    browser.runtime
      .sendMessage({ action: 'appConfirmedUp' })
      .catch(() => {});
  } else {
    statusBadge.className = 'status-badge disconnected';
    statusText.textContent = t('header.disconnected');
  }
}

// ===== 初始化 =====
async function init() {
  // 初始化 i18n（必须先于 UI 渲染）
  await initI18n();
  applyI18nToDOM();
  updateLangButton();

  await initTheme();

  // 从 manifest 动态读取版本号（CI 构建时由 git tag 写入）
  versionLabel.textContent = `v${browser.runtime.getManifest().version}`;

  // 直接查询连接状态和加载设置，不经过 background sendMessage。
  // 原因：Firefox MV2 中 WXT 框架会注册自己的 onMessage 监听器（用于 HMR），
  // 它先于我们的监听器返回 undefined，导致 popup 的 sendMessage 始终收到 undefined。
  // 探活走 download-dispatch：按 remoteMode 适配桌面（NMH）/ 远程 / 两者任一。
  const [, settings] = await Promise.all([
    refreshConnectionStatus(),
    loadSettings(),
  ]);

  // 更新设置 UI
  enableToggle.checked = settings.enabled;
  updateEnableHint(settings.enabled);
  interceptModeSelect.value = settings.interceptMode || 'smart';
  updateModeHint(settings.interceptMode || 'smart');
  minSizeSelect.value = String(settings.minFileSize);
  renderDomainList(settings.excludeDomains || []);

  // 远程下载源设置
  remoteModeSelect.value = settings.remoteMode || 'off';
  updateRemoteModeHint(settings.remoteMode || 'off');
  remoteUrlInput.value = settings.remoteUrl || '';
  remoteTokenInput.value = settings.remoteToken || '';

  // 悬浮球可见状态（未设置时默认显示）
  const dotVisResult = await browser.storage.local.get('fluxdown_dot_visible') ?? {};
  dotVisibleToggle.checked = dotVisResult['fluxdown_dot_visible'] !== false;

  // 加载统计
  await loadStats();
}

function updateEnableHint(enabled: boolean) {
  enableHint.textContent = enabled ? t('switch.enabled') : t('switch.disabled');
}

type ModeKey = 'settings.hintSmart' | 'settings.hintAll';

const MODE_HINT_KEYS: Record<string, ModeKey> = {
  smart: 'settings.hintSmart',
  all: 'settings.hintAll',
};

function updateModeHint(mode: string) {
  const key = MODE_HINT_KEYS[mode];
  modeHint.textContent = key ? t(key) : '';
}

type RemoteModeHintKey =
  | 'remote.modeHintOff'
  | 'remote.modeHintFallback'
  | 'remote.modeHintAlways';

const REMOTE_MODE_HINT_KEYS: Record<string, RemoteModeHintKey> = {
  off: 'remote.modeHintOff',
  fallback: 'remote.modeHintFallback',
  always: 'remote.modeHintAlways',
};

function updateRemoteModeHint(mode: string) {
  const key = REMOTE_MODE_HINT_KEYS[mode];
  remoteModeHint.textContent = key ? t(key) : '';
}

/** 把 remote-server.ts 返回的稳定 message 前缀映射为本地化的测试连接错误文案 */
function remoteTestErrorMessage(message?: string): string {
  if (message === 'remote_auth_failed') return t('remote.testAuthFailed');
  if (message === 'remote_not_configured') return t('remote.testNotConfigured');
  if (message && message.startsWith('remote_unreachable')) return t('remote.testUnreachable');
  return t('remote.testFailed', { message: message || 'unknown' });
}

// ===== 语言切换 =====
function isZh(): boolean {
  return getLocale().startsWith('zh');
}

function updateLangButton() {
  langLabel.textContent = isZh() ? '中' : 'EN';
  langBtn.title = isZh() ? 'Switch to English' : '切换到中文';
}

async function toggleLang() {
  const next = isZh() ? 'en' : 'zh-CN';
  await saveLocale(next);
  applyI18nToDOM();
  updateLangButton();
  // 刷新动态文本
  updateEnableHint(enableToggle.checked);
  updateModeHint(interceptModeSelect.value);
}

// ===== 事件绑定 =====

// 语言切换
langBtn.addEventListener('click', toggleLang);

// 主题切换
themeBtn.addEventListener('click', toggleTheme);

// 悬浮球显示/隐藏
dotVisibleToggle.addEventListener('change', async () => {
  await browser.storage.local.set({ fluxdown_dot_visible: dotVisibleToggle.checked });
});

// 启用/禁用开关
enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;
  updateEnableHint(enabled);
  await saveSettings({ enabled });
});

// 拦截模式
interceptModeSelect.addEventListener('change', async () => {
  const mode = interceptModeSelect.value;
  updateModeHint(mode);
  await saveSettings({ interceptMode: mode as any });
});

// 最小文件大小
minSizeSelect.addEventListener('change', async () => {
  await saveSettings({ minFileSize: parseInt(minSizeSelect.value, 10) });
});

// 远程下载源 - 模式
remoteModeSelect.addEventListener('change', async () => {
  const mode = remoteModeSelect.value as 'off' | 'fallback' | 'always';
  updateRemoteModeHint(mode);
  await saveSettings({ remoteMode: mode });
  await refreshConnectionStatus(); // 模式切换影响探活目标，立即刷新徽标
});

// 远程下载源 - 服务器地址（失焦保存；saveSettings 内部会去除尾部斜杠，
// 保存后读回以保持输入框显示与实际存储值一致）
remoteUrlInput.addEventListener('change', async () => {
  await saveSettings({ remoteUrl: remoteUrlInput.value.trim() });
  const current = await loadSettings();
  remoteUrlInput.value = current.remoteUrl;
  await refreshConnectionStatus();
});

// 远程下载源 - Token
remoteTokenInput.addEventListener('change', async () => {
  await saveSettings({ remoteToken: remoteTokenInput.value });
  await refreshConnectionStatus();
});

// 远程下载源 - 测试连接
remoteTestBtn.addEventListener('click', async () => {
  const remoteUrl = remoteUrlInput.value.trim().replace(/\/+$/, '');
  if (!remoteUrl) {
    remoteTestResult.textContent = t('remote.testNotConfigured');
    showToast(t('remote.testNotConfigured'), 'error');
    return;
  }
  remoteTestBtn.disabled = true;
  remoteTestResult.textContent = t('remote.testing');
  try {
    const result = await remotePing({ remoteUrl, remoteToken: remoteTokenInput.value });
    if (result.success) {
      const msg = t('remote.testSuccess', {
        app: result.app || 'FluxDown',
        version: result.version || '',
      });
      remoteTestResult.textContent = msg;
      showToast(msg, 'success');
    } else {
      const msg = remoteTestErrorMessage(result.message);
      remoteTestResult.textContent = msg;
      showToast(msg, 'error');
    }
  } catch (e) {
    const msg = t('remote.testFailed', { message: String(e) });
    remoteTestResult.textContent = msg;
    showToast(msg, 'error');
  } finally {
    remoteTestBtn.disabled = false;
  }
  await refreshConnectionStatus(); // 测试结果直接反映到头部徽标
});
// 域名 - 显示手动输入框
addDomainManualBtn.addEventListener('click', () => {
  domainInputRow.classList.remove('hidden');
  domainInput.focus();
});

// 域名 - 确认手动添加
domainConfirmBtn.addEventListener('click', async () => {
  const val = domainInput.value.trim();
  if (val) {
    await addDomain(val);
    domainInput.value = '';
  }
  domainInputRow.classList.add('hidden');
});

// 域名 - 取消
domainCancelBtn.addEventListener('click', () => {
  domainInput.value = '';
  domainInputRow.classList.add('hidden');
});

// 域名 - Enter 确认
domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') domainConfirmBtn.click();
  if (e.key === 'Escape') domainCancelBtn.click();
});

// 添加当前域名
addCurrentDomainBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const hostname = new URL(tab.url).hostname;
      if (hostname) {
        await addDomain(hostname);
      } else {
        showToast(t('domain.cannotGetDomain'), 'error');
      }
    }
  } catch {
    showToast(t('domain.cannotGetDomain'), 'error');
  }
});

// 重置统计
resetStatsBtn.addEventListener('click', async () => {
  const today = new Date().toDateString();
  await browser.storage.local.set({ stats: { sent: 0, failed: 0, date: today } });
  statSent.textContent = '0';
  statFailed.textContent = '0';
  showToast(t('stats.resetDone'));
});

// ===== 启动 =====
// R8-3 修复：init 是顶层 async 调用，加 .catch 防止意外异常成为未捕获 rejection
init().catch((e) => {
  console.error('[FluxDown Popup] Init failed:', e);
});
