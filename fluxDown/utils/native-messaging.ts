/**
 * HTTP 通信模块
 * 负责与 FluxDown 桌面应用通过本地 HTTP 服务器通信
 *
 * FluxDown 桌面应用在 localhost:19527 启动 HTTP 服务器，同时绑定
 * 127.0.0.1（IPv4）和 ::1（IPv6），因此使用 localhost 主机名可兼容
 * Chrome（Happy Eyeballs 优先 IPv4）和 Firefox（可能优先 ::1 IPv6）。
 *
 * 当应用未运行时，通过 fluxdown:// 协议唤起应用后重试 HTTP。
 *
 * === 拉起速度优化策略 ===
 * 1. 连接状态缓存（_appAlive）：避免每次都冷探测，热路径直连节省 ~3s
 * 2. 首次 HTTP 超时缩短：1000ms（原 3000ms），快速 fail-fast 触发拉起
 * 3. 协议唤起 + 首次重试并发：launchViaProtocol 触发同时立即开始轮询
 * 4. 轮询间隔短→长：500/800/1200/2000ms（原 1500/2000/3000ms）
 * 5. 优先用 tabs.create（无需 scripting 权限），iframe 方案作为后备
 */

const FLUXDOWN_BASE_URL = 'http://localhost:19527';

// 热路径（App 已运行）：超时 1s，本地回环应极快响应
const HTTP_TIMEOUT_ALIVE = 1000;
// 冷路径（App 刚被唤起）：超时 2s，给进程启动留余量
const HTTP_TIMEOUT_COLD = 2000;
// 连通性缓存有效期：30 秒
// 弱网环境下 App 一直在线，30s 内不重复探测减少 RTT 开销
const APP_ALIVE_CACHE_TTL = 30_000;
// 唤起后重试间隔（ms），短→长覆盖 App 启动时间跨度（通常 1-3s）
const RETRY_DELAYS = [400, 700, 1200, 2000, 3000];

// ──────────────────────────────────────────────────────────────
// 连通性状态缓存
// _appAlive = true  → 最近一次成功，热路径直发
// _appAlive = false → 上次失败，直接走冷路径（不二次探测）
// ──────────────────────────────────────────────────────────────
let _appAlive = false;
let _appAliveCachedAt = 0;
// 连续失败计数，用于热路径连续失败后主动失效缓存
let _consecutiveFailures = 0;
// Bug R3-8 修复：防止并发请求同时进入冷路径时重复唤起 App（多次 tabs.create）。
// 第一个发起唤起的请求持有此 Promise，后续并发请求复用同一个冷路径 Promise。
let _coldPathPromise: Promise<ApiResponse> | null = null;

function markAppAlive() {
  _appAlive = true;
  _appAliveCachedAt = Date.now();
  _consecutiveFailures = 0;
}

function markAppDead() {
  _appAlive = false;
  _appAliveCachedAt = 0;
  _consecutiveFailures++;
}

function isAppAliveCached(): boolean {
  // 连续失败 2 次则强制失效热路径缓存，避免连续误判
  if (_consecutiveFailures >= 2) return false;
  return _appAlive && Date.now() - _appAliveCachedAt < APP_ALIVE_CACHE_TTL;
}

export interface DownloadRequest {
  url: string;
  filename?: string;
  referrer?: string;
  cookies?: string;
  headers?: Record<string, string>;
  fileSize?: number;
  mimeType?: string;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  taskId?: string;
}

export interface BatchDownloadItem {
  url: string;
  filename?: string;
  referrer?: string;
  cookies?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * 通过自定义协议唤起 FluxDown 桌面应用。
 *
 * 优先使用 tabs.create（更可靠，无需 scripting 权限），
 * 失败后降级到向当前 tab 注入 iframe。
 */
async function launchViaProtocol(): Promise<void> {
  // 优先：在后台新标签页打开 fluxdown:// 协议，系统会拦截并启动 App，然后立即关闭标签页
  try {
    const newTab = await chrome.tabs.create({ url: 'fluxdown://wake', active: false });
    if (newTab.id != null) {
      // 给协议处理器 500ms 响应时间，然后关闭标签
      setTimeout(() => {
        chrome.tabs.remove(newTab.id!).catch(() => {});
      }, 500);
    }
    return;
  } catch {
    // tabs.create 失败，降级到 iframe 注入
  }

  // 降级：向当前活跃 tab 注入隐藏 iframe（需要 scripting 或 tabs 权限）
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const tabUrl = tab?.url ?? '';
    const canInject =
      tab?.id != null &&
      tabUrl !== '' &&
      !tabUrl.startsWith('chrome://') &&
      !tabUrl.startsWith('chrome-extension://') &&
      !tabUrl.startsWith('edge://') &&
      !tabUrl.startsWith('about:') &&
      !tabUrl.startsWith('moz-extension://');

    if (canInject && tab.id != null) {
      const injectFn = () => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'fluxdown://wake';
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 1500);
      };

      if (chrome.scripting?.executeScript) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: injectFn });
      } else {
        const code = `(${injectFn.toString()})()`;
        await new Promise<void>((resolve) => {
          (chrome as any).tabs.executeScript(tab.id, { code }, () => resolve());
        });
      }
    }
  } catch {
    // 两种方式均失败
  }
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function httpPost(body: string, timeoutMs = HTTP_TIMEOUT_ALIVE): Promise<Response> {
  return fetchWithTimeout(
    `${FLUXDOWN_BASE_URL}/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
    timeoutMs,
  );
}

async function sendWithAutoLaunch(body: string): Promise<ApiResponse> {
  // ── 热路径：缓存命中，直接发送 ──────────────────────────────
  if (isAppAliveCached()) {
    try {
      const response = await httpPost(body, HTTP_TIMEOUT_ALIVE);
      const result = (await response.json()) as ApiResponse;
      markAppAlive();
      return result;
    } catch {
      // App 可能已重启或临时不可用，失效缓存，继续走冷路径
      markAppDead();
      console.warn('[FluxDown] Hot path failed, falling through to cold path');
    }
  }

  // ── 冷路径 Step 1：先尝试一次（App 可能已在运行但缓存过期）──
  // 超时 1s，快速判断是否需要唤起
  try {
    const response = await httpPost(body, HTTP_TIMEOUT_ALIVE);
    const result = (await response.json()) as ApiResponse;
    markAppAlive();
    return result;
  } catch {
    // 确认 App 未运行，进入唤起流程
    markAppDead();
  }

  // ── 冷路径 Step 2：并发唤起 + 轮询重试 ─────────────────────
  // Bug R3-8 修复：若已有冷路径在进行（并发发送时），复用同一个 Promise，
  // 避免重复调用 launchViaProtocol 多次打开标签页唤起 App。
  if (_coldPathPromise) {
    // 冷路径已在进行，等其完成后用同一结果（或失败）重新尝试发送当前 body
    try {
      await _coldPathPromise;
    } catch { /* ignore */ }
    // 冷路径完成后（App 可能已启动），立即尝试发送
    try {
      const response = await httpPost(body, HTTP_TIMEOUT_COLD);
      const result = (await response.json()) as ApiResponse;
      markAppAlive();
      return result;
    } catch {
      return { success: false, message: 'FluxDown app not running' };
    }
  }

  // 发起新的冷路径，并共享给并发调用
  _coldPathPromise = (async (): Promise<ApiResponse> => {
    // launchViaProtocol 与轮询并发，不阻塞第一次重试
    const launchPromise = launchViaProtocol();

    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i]));
      try {
        // 第一轮用较短超时（App 可能已快速启动），后续用 cold 超时
        const timeout = i === 0 ? HTTP_TIMEOUT_ALIVE : HTTP_TIMEOUT_COLD;
        const response = await httpPost(body, timeout);
        const result = (await response.json()) as ApiResponse;
        markAppAlive();
        launchPromise.catch(() => {});
        return result;
      } catch {
        // 继续下一轮，指数退避已在 RETRY_DELAYS 中体现
      }
    }

    launchPromise.catch(() => {});
    return { success: false, message: 'FluxDown app not running' };
  })().finally(() => {
    _coldPathPromise = null;
  });

  return _coldPathPromise;
}

export async function sendDownloadRequest(request: DownloadRequest): Promise<ApiResponse> {
  return sendWithAutoLaunch(JSON.stringify(request));
}

export async function sendBatchDownloadRequest(items: BatchDownloadItem[]): Promise<ApiResponse> {
  if (items.length === 0) {
    return { success: false, message: 'No items' };
  }

  const joinedUrl = items.map((item) => item.url).join('\n');
  // Bug R2-7 修复：使用第一个 item 的 cookies（与 referrer 保持同 item 一致性）。
  // 批量下载的 cookies 只能对应第一个 URL 的域名，App 端批量任务会逐个发请求时各自处理认证。
  const cookies = items[0]?.cookies || '';

  const request: DownloadRequest = {
    url: joinedUrl,
    filename: '',
    referrer: items[0]?.referrer || '',
    cookies,
  };

  return sendWithAutoLaunch(JSON.stringify(request));
}

export async function checkFluxDownAvailable(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${FLUXDOWN_BASE_URL}/ping`,
      { method: 'GET' },
      HTTP_TIMEOUT_ALIVE,
    );
    const data = (await response.json()) as ApiResponse;
    const alive = data.success === true;
    if (alive) markAppAlive(); else markAppDead();
    return alive;
  } catch {
    markAppDead();
    return false;
  }
}
