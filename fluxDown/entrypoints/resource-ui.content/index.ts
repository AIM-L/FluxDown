/**
 * FluxDown 页面内 UI — 悬浮圆点 + 资源面板
 *
 * - 默认停靠右侧边缘，半隐藏，hover 露出
 * - 自由拖拽（X+Y），松手后平滑吸附到最近的左/右边缘
 * - 面板方向随停靠侧自动切换
 *
 * 【定位策略】圆点统一用 `left` 定位，不用 `right`，
 *  避免拖拽时 left/right 冲突、CSS 无法跨属性过渡。
 *  右侧停靠 = left: calc(100% - Npx)
 */

import type { DetectedResource, ResourceType, ConfidenceLevel, TrackPairGroup } from '@/utils/resource-types';
import { formatFileSize, getResourceTypeIcon, groupTrackPairs } from '@/utils/resource-types';
import type { DashManifest } from '@/utils/dash-manifest';
import type { MessageKey } from '@/utils/locales/zh-CN';
import { initI18n, setLocale, t } from '@/utils/i18n';
import './style.css';

/* ===== 常量 ===== */
interface TabDef { key: 'all' | ResourceType; i18nKey: MessageKey }

/**
 * 选轨小窗展示用的清晰度选项（UI 视图模型，脱离 DetectedResource 的必填字段约束，
 * 因为权威 manifest 轨道来自解析而非嗅探，没有 confidence/tabId 等资源存储专属字段）。
 */
interface QualityOption {
  quality: string;
  videoUrl: string;
  audioUrl?: string;
  /** 预格式化的大小/码率文本；真实大小用 formatFileSize，未知大小时显示码率，绝不伪造 */
  sizeLabel: string;
  /** 轨道构成标注，如 "视频轨" / "视频轨 + 音频轨" */
  kindLabel: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
}
const TABS: TabDef[] = [
  { key: 'all', i18nKey: 'panel.tabAll' },
  { key: 'video', i18nKey: 'panel.tabVideo' },
  { key: 'audio', i18nKey: 'panel.tabAudio' },
  { key: 'document', i18nKey: 'panel.tabDocs' },
  { key: 'archive', i18nKey: 'panel.tabArchive' },
  { key: 'stream', i18nKey: 'panel.tabStream' },
  { key: 'subtitle', i18nKey: 'panel.tabSubtitle' },
  { key: 'magnet', i18nKey: 'panel.tabMagnet' },
  { key: 'other', i18nKey: 'panel.tabOther' },
];

const SVG_DOWNLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
const SVG_CLOSE = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
const SVG_LOGO = '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 17h14"/>';
const SVG_EMPTY = '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>';
const SVG_EYE_OFF = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>';

const STORAGE_KEY = 'fluxdown_dot_pos';
const DOT_VISIBLE_KEY = 'fluxdown_dot_visible';

function svg(inner: string, cls = ''): string {
  return `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    console.log('[FluxDown UI] starting');

    /* ========== i18n 初始化 ========== */
    await initI18n();

    /* ========== 状态 ========== */
    let resources: DetectedResource[] = [];
    let activeTab: string = 'all';
    const selectedIds = new Set<string>();
    let panelOpen = false;
    let side: 'left' | 'right' = 'right';

    /* ========== DOM 引用 ========== */
    let dotEl: HTMLElement;
    let badgeEl: HTMLElement;
    let panelEl: HTMLElement;
    let tabsEl: HTMLElement;
    let listEl: HTMLElement;
    let countEl: HTMLElement;
    let selectAllEl: HTMLInputElement;
    let batchCountEl: HTMLElement;
    let batchBtnEl: HTMLButtonElement;
    let selectAllText: Text;
    let floatBtnEl: HTMLElement;
    let qualityPickerEl: HTMLElement;
    let pendingQualityOptions: QualityOption[] = [];
    let previewEl: HTMLElement;
    let previewHideTimer: ReturnType<typeof setTimeout> | null = null;
    /** 页面拦到的权威 DASH manifest（video[]/audio[] 轨道 + 真实清晰度）；未嗅探到时为 null。 */
    let dashManifest: DashManifest | null = null;

    /* ========== Shadow UI ========== */
    const ui = await createShadowRootUi(ctx, {
      name: 'fluxdown-ui',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        buildDot(container);
        buildPanel(container);
        buildFloatButton(container);
        buildQualityPicker(container);
        buildPreview(container);
        restoreDotPosition();
      },
    });
    ui.mount();

    /* ========== 消息监听 ========== */
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'resourcesUpdated' && Array.isArray(msg.resources)) {
        resources = msg.resources;
        render();
      }
      if (msg.action === 'toggleResourcePanel') {
        togglePanel();
      }
      if (msg.action === 'dashManifestUpdated' && msg.manifest) {
        dashManifest = msg.manifest;
      }
    });

    /* ========== 语言变化监听 ========== */
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes['fluxdown_locale']) {
        const newLocale = changes['fluxdown_locale'].newValue;
        if (newLocale) {
          setLocale(newLocale);
          refreshStaticTexts();
          render();
        }
      }
      if (DOT_VISIBLE_KEY in changes) {
        applyDotVisibility(changes[DOT_VISIBLE_KEY].newValue !== false);
      }
    });

    try {
      const resp = await browser.runtime.sendMessage({ action: 'getResources' });
      if (resp?.resources?.length > 0) {
        resources = resp.resources;
        render();
      }
      if (resp?.dashManifest) {
        dashManifest = resp.dashManifest;
      }
    } catch { /* */ }

    /* ========== 视频 hover ========== */
    let floatTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverVideo: HTMLVideoElement | null = null;

    // 从事件路径中查找 video 元素：B站/迅雷等播放器在 video 上覆盖弹幕/控件层，
    // e.target 往往是覆盖层而非 video 本身，composedPath 可穿透覆盖层与 shadow DOM。
    function videoInPath(e: Event): HTMLVideoElement | null {
      const path = e.composedPath ? e.composedPath() : [];
      for (const node of path) {
        if (node instanceof HTMLVideoElement) return node;
      }
      return e.target instanceof HTMLVideoElement ? e.target : null;
    }

    document.addEventListener('mouseover', (e) => {
      const video = videoInPath(e);
      if (!video) return;
      hoverVideo = video;
      if (floatTimer) { clearTimeout(floatTimer); floatTimer = null; }
      showFloat(video);
    }, true);

    document.addEventListener('mouseout', (e) => {
      if (!videoInPath(e)) return;
      floatTimer = setTimeout(hideFloat, 400);
    }, true);

    /* ================================================================
     *  构建 DOM
     * ================================================================ */

    function buildDot(root: HTMLElement): void {
      dotEl = h('div', 'fluxdown-dot');
      // 初始隐藏，等 restoreDotPosition 定位后再显示，避免闪烁
      dotEl.style.visibility = 'hidden';
      dotEl.innerHTML = `
        ${svg(SVG_LOGO, 'dot-icon')}
        <span class="dot-badge"></span>
      `;
      badgeEl = dotEl.querySelector('.dot-badge') as HTMLElement;

      // 点击 → 切换面板
      dotEl.addEventListener('click', (e) => {
        if (didDrag) { didDrag = false; return; }
        e.stopPropagation();
        togglePanel();
      });

      // ===== 拖拽（X+Y 自由移动，松手吸附边缘） =====
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let dragging = false;
      let didDrag = false;
      let moveCount = 0;

      dotEl.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        dragging = true;
        didDrag = false;
        moveCount = 0;
        startX = e.clientX;
        startY = e.clientY;

        // getBoundingClientRect 保证获取准确的视口坐标，
        // 不受 Shadow DOM / offsetParent / CSS right 等影响
        const rect = dotEl.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        dotEl.setPointerCapture(e.pointerId);
        dotEl.classList.add('dragging');

        // 拖拽开始时关闭面板（拖拽是重新定位操作，面板碍事）
        if (panelOpen) {
          panelOpen = false;
          panelEl.classList.remove('visible');
          dotEl.classList.remove('active');
        }
      });

      dotEl.addEventListener('pointermove', (e: PointerEvent) => {
        if (!dragging) return;
        moveCount++;
        if (moveCount < 3) return;
        didDrag = true;

        // 允许拖到半隐藏的范围：left 从 -18 到 viewport-18
        const newLeft = Math.max(-18, Math.min(
          window.innerWidth - 18,
          startLeft + (e.clientX - startX),
        ));
        const newTop = Math.max(20, Math.min(
          window.innerHeight - 56,
          startTop + (e.clientY - startY),
        ));

        // 拖拽中只用 inline left + top（.dragging 禁用了过渡）
        dotEl.style.left = `${newLeft}px`;
        dotEl.style.top = `${newTop}px`;
      });

      const endDrag = () => {
        if (!dragging) return;
        dragging = false;

        if (!didDrag) {
          // 没有实际拖拽，只是点击，直接恢复
          dotEl.classList.remove('dragging');
          return;
        }

        // 用 getBoundingClientRect 获取松手时准确位置
        const rect = dotEl.getBoundingClientRect();
        const currentLeft = rect.left;
        const currentTop = rect.top;

        // 根据圆点中心 X 判断吸附方向
        const centerX = currentLeft + 18;
        side = centerX < window.innerWidth / 2 ? 'left' : 'right';

        // --- 平滑吸附动画序列 ---
        // 1) 确保 inline left 是当前像素值（.dragging 仍在，无过渡）
        dotEl.style.left = `${currentLeft}px`;
        dotEl.style.top = `${Math.round(currentTop)}px`;

        // 2) 设置目标 side class（CSS class 定义了吸附目标 left 值）
        applySideClass();

        // 3) 移除 .dragging → CSS transition 启用
        dotEl.classList.remove('dragging');

        // 4) 强制浏览器完成一次样式计算（确认 "before" 状态）
        void dotEl.offsetWidth;

        // 5) 清除 inline left → CSS class 的 left 值生效
        //    浏览器看到 left 从 currentLeft → CSS 目标值，触发过渡动画
        dotEl.style.left = '';

        // 持久化
        saveDotPosition(Math.round(currentTop), side);
      };

      dotEl.addEventListener('pointerup', endDrag);
      dotEl.addEventListener('pointercancel', endDrag);

      root.appendChild(dotEl);
    }

    /** 切换 .left / .right CSS 类（不操作 inline style） */
    function applySideClass(): void {
      dotEl.classList.toggle('left', side === 'left');
      dotEl.classList.toggle('right', side === 'right');
    }

    function buildPanel(root: HTMLElement): void {
      panelEl = h('div', 'fluxdown-panel');

      const header = h('div', 'panel-header');
      header.innerHTML = `
        ${svg(SVG_LOGO, 'logo')}
        <span class="title">FluxDown</span>
        <span class="resource-count"></span>
      `;
      countEl = header.querySelector('.resource-count') as HTMLElement;

      const hideBtn = h('button', 'btn-close');
      hideBtn.title = t('panel.hideDot');
      hideBtn.innerHTML = svg(SVG_EYE_OFF);
      hideBtn.addEventListener('click', () => {
        browser.storage.local.set({ [DOT_VISIBLE_KEY]: false });
        if (panelOpen) togglePanel();
      });
      header.appendChild(hideBtn);

      const closeBtn = h('button', 'btn-close');
      closeBtn.innerHTML = svg(SVG_CLOSE);
      closeBtn.addEventListener('click', () => { togglePanel(); });
      header.appendChild(closeBtn);

      tabsEl = h('div', 'panel-tabs');
      listEl = h('div', 'panel-list');

      const footer = h('div', 'panel-footer');
      const label = document.createElement('label');
      selectAllEl = document.createElement('input');
      selectAllEl.type = 'checkbox';
      label.appendChild(selectAllEl);
      selectAllText = document.createTextNode(` ${t('panel.selectAll')}`);
      label.appendChild(selectAllText);
      selectAllEl.addEventListener('change', () => {
        const items = filtered();
        if (selectAllEl.checked) {
          for (const r of items) selectedIds.add(r.id);
        } else { selectedIds.clear(); }
        renderList();
        updateBatch();
      });

      batchBtnEl = document.createElement('button');
      batchBtnEl.className = 'batch-btn';
      batchBtnEl.disabled = true;
      batchBtnEl.innerHTML = `${svg(SVG_DOWNLOAD)} ${t('panel.batchDownload')} (<span>0</span>)`;
      batchCountEl = batchBtnEl.querySelector('span') as HTMLElement;
      batchBtnEl.addEventListener('click', () => {
        const items = resources.filter((r) => selectedIds.has(r.id));
        if (items.length === 0) return;

        // 一次性发送所有选中资源给 Background，由 Background 端顺序执行
        // 避免循环 sendMessage 导致 Chrome MV3 消息通道串行阻塞，只有第一个被处理
        browser.runtime.sendMessage({
          action: 'batchDownload',
          items: items.map((r) => ({
            url: r.url,
            referrer: r.pageUrl || location.href,
            filename: r.filename,
            fileSize: r.size > 0 ? r.size : undefined,
            mimeType: r.mimeType,
          })),
        }).catch(() => {});

        selectedIds.clear();
        renderList();
        updateBatch();
        updateSelectAll();
      });

      footer.appendChild(label);
      footer.appendChild(batchBtnEl);

      panelEl.appendChild(header);
      panelEl.appendChild(tabsEl);
      panelEl.appendChild(listEl);
      panelEl.appendChild(footer);
      root.appendChild(panelEl);
    }

    function buildFloatButton(root: HTMLElement): void {
      floatBtnEl = h('div', 'fluxdown-float-btn');
      floatBtnEl.innerHTML = `${svg(SVG_DOWNLOAD, 'icon')}<span class="label"></span>`;
      floatBtnEl.addEventListener('mouseenter', () => {
        if (floatTimer) { clearTimeout(floatTimer); floatTimer = null; }
      });
      floatBtnEl.addEventListener('mouseleave', () => {
        floatTimer = setTimeout(hideFloat, 300);
      });
      floatBtnEl.addEventListener('click', () => {
        if (!hoverVideo) return;
        const src = hoverVideo.currentSrc || hoverVideo.src;
        const isBlob = !src || src.startsWith('blob:') || src.startsWith('data:');

        // 直链视频 → 直接下载。
        if (!isBlob && src) {
          browser.runtime.sendMessage({
            action: 'downloadResource', url: src, referrer: location.href,
          }).catch(() => {});
          hideFloat();
          return;
        }

        // blob/MSE 视频（B站/迅雷等）无直链 → 优先用页面拦到的权威 DASH manifest
        // 构造真清晰度档（height/bandwidth 来自 manifest，可信）；manifest 缺失时
        // 回退到嗅探碎片的 groupTrackPairs（分片无法可靠区分清晰度，仅保底）。
        // 存在音视频轨对或多档清晰度 → 弹出清晰度选择小窗；只有一条无音频的单轨
        // → 直接下载；两者都拿不到（未嗅探到媒体）→ 回退打开资源面板。
        const media = mediaResources();
        const options =
          dashManifest && dashManifest.video.length > 0
            ? qualityOptionsFromManifest(dashManifest)
            : qualityOptionsFromTrackGroups(groupTrackPairs(media));
        const needsPicker =
          options.length > 1 || options.some((o) => o.audioUrl);
        if (needsPicker) {
          const rect = floatBtnEl.getBoundingClientRect();
          hideFloat();
          showQualityPicker(options, rect);
          return;
        }
        if (options.length === 1) {
          downloadQualityOption(options[0]);
          hideFloat();
          return;
        }
        if (media.length > 0) {
          activeTab = media.some((r) => r.type === 'video') ? 'video' : 'all';
          if (!panelOpen) togglePanel();
          else render();
        }
        hideFloat();
      });
      root.appendChild(floatBtnEl);
    }

    /* ================================================================
     *  面板控制
     * ================================================================ */

    function togglePanel(): void {
      panelOpen = !panelOpen;
      if (panelOpen) {
        const dotY = parseInt(dotEl.style.top) || Math.round(window.innerHeight * 0.4);
        positionPanel(dotY);
        panelEl.classList.add('visible');
        dotEl.classList.add('active');
        render();
      } else {
        panelEl.classList.remove('visible');
        dotEl.classList.remove('active');
      }
    }

    function positionPanel(dotY: number): void {
      const panelHeight = 460;
      let top = dotY - 20;
      if (top + panelHeight > window.innerHeight - 10) {
        top = window.innerHeight - panelHeight - 10;
      }
      if (top < 10) top = 10;
      panelEl.style.top = `${top}px`;

      // 重置
      panelEl.style.left = '';
      panelEl.style.right = '';

      if (side === 'left') {
        panelEl.classList.add('left');
        panelEl.classList.remove('right');
        panelEl.style.left = '52px';
      } else {
        panelEl.classList.remove('left');
        panelEl.classList.add('right');
        panelEl.style.right = '52px';
      }
    }

    function applyDotVisibility(visible: boolean): void {
      if (visible) {
        dotEl.classList.remove('hidden');
      } else {
        dotEl.classList.add('hidden');
        if (panelOpen) togglePanel();
      }
    }

    function restoreDotPosition(): void {
      // 禁用过渡，避免初始定位时有动画
      dotEl.classList.add('dragging');

      const applyDefaults = () => {
        dotEl.style.top = `${Math.round(window.innerHeight * 0.4)}px`;
        side = 'right';
        applySideClass();
        dotEl.style.visibility = '';
        requestAnimationFrame(() => { dotEl.classList.remove('dragging'); });
      };

      try {
        browser.storage.local.get([STORAGE_KEY, DOT_VISIBLE_KEY]).then((r) => {
          const safeR = r ?? {};
          const pos = safeR[STORAGE_KEY];
          if (pos && typeof pos === 'object') {
            const y = typeof pos.y === 'number' && pos.y > 0
              ? Math.min(pos.y, window.innerHeight - 56)
              : Math.round(window.innerHeight * 0.4);
            dotEl.style.top = `${y}px`;
            if (pos.side === 'left' || pos.side === 'right') {
              side = pos.side;
            }
          } else {
            dotEl.style.top = `${Math.round(window.innerHeight * 0.4)}px`;
          }
          applySideClass();
          // 未设置时默认显示，明确为 false 时隐藏
          if (safeR[DOT_VISIBLE_KEY] === false) {
            dotEl.classList.add('hidden');
          }
          dotEl.style.visibility = '';
          requestAnimationFrame(() => { dotEl.classList.remove('dragging'); });
        }).catch(() => { applyDefaults(); });
      } catch { applyDefaults(); }
    }

    function saveDotPosition(y: number, s: 'left' | 'right'): void {
      try {
        browser.storage.local.set({ [STORAGE_KEY]: { y, side: s } });
      } catch { /* */ }
    }

    // 点击外部关闭面板 — composedPath 穿透 Shadow DOM
    document.addEventListener('click', (e) => {
      if (!panelOpen) return;
      const path = e.composedPath();
      if (path.includes(panelEl) || path.includes(dotEl)) return;
      panelOpen = false;
      panelEl.classList.remove('visible');
      dotEl.classList.remove('active');
    });

    /* ================================================================
     *  渲染
     * ================================================================ */

    function render(): void {
      renderBadge();
      renderTabs();
      renderList();
      updateBatch();
    }

    function renderBadge(): void {
      if (!badgeEl) return;
      const n = resources.length;
      badgeEl.textContent = n > 99 ? '99+' : String(n);
      badgeEl.classList.toggle('show', n > 0);
      if (countEl) countEl.textContent = n > 0 ? `${n} ${t('panel.resources')}` : '';
    }

    function renderTabs(): void {
      if (!tabsEl) return;
      tabsEl.innerHTML = '';
      for (const tab of TABS) {
        const count = tab.key === 'all' ? resources.length : resources.filter((r) => r.type === tab.key).length;
        if (tab.key !== 'all' && count === 0) continue;
        const btn = h('button', `panel-tab${activeTab === tab.key ? ' active' : ''}`);
        btn.textContent = `${t(tab.i18nKey)} ${count}`;
        btn.addEventListener('click', () => { activeTab = tab.key; renderTabs(); renderList(); });
        tabsEl.appendChild(btn);
      }
    }

    let showLowConf = false; // 低可信度资源是否展开

    function renderList(): void {
      if (!listEl) return;
      const items = filtered();

      if (items.length === 0) {
        listEl.innerHTML = `
          <div class="panel-empty">
            ${svg(SVG_EMPTY)}
            <span>${t('panel.empty')}</span>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';

      // 按可信度分组（资源已按 confidence desc 排序）
      const main = items.filter((r) => r.confidence !== 'low');
      const low = items.filter((r) => r.confidence === 'low');

      // 渲染 high + medium
      for (const r of main) {
        listEl.appendChild(buildResourceRow(r));
      }

      // 低可信度折叠区域
      if (low.length > 0) {
        const toggle = h('div', 'low-conf-toggle');
        toggle.innerHTML = `
          <span class="low-conf-line"></span>
          <button class="low-conf-btn">
            ${showLowConf
              ? t('panel.collapse')
              : t('panel.more', { count: String(low.length) })}
          </button>
          <span class="low-conf-line"></span>
        `;
        const btn = toggle.querySelector('.low-conf-btn') as HTMLButtonElement;
        btn.addEventListener('click', () => {
          showLowConf = !showLowConf;
          renderList();
          updateBatch();
        });
        listEl.appendChild(toggle);

        if (showLowConf) {
          for (const r of low) {
            listEl.appendChild(buildResourceRow(r));
          }
        }
      }
    }

    /** m4s/分片等 stream 类资源的轨道标注：mimeType video/ → 视频轨，audio/ → 音频轨，缺失不标注。 */
    function trackKindLabel(r: DetectedResource): { text: string; cls: string } | null {
      if (r.type !== 'stream') return null;
      const mime = r.mimeType?.toLowerCase();
      if (mime?.startsWith('video/')) return { text: t('panel.trackVideo'), cls: 'video' };
      if (mime?.startsWith('audio/')) return { text: t('panel.trackAudio'), cls: 'audio' };
      return null;
    }

    function buildResourceRow(r: DetectedResource): HTMLElement {
      const row = h('div', `resource-row conf-${r.confidence}`);
      const icon = getResourceTypeIcon(r.type);
      const sizeStr = r.size > 0 ? formatFileSize(r.size) : '';
      const quality = r.quality ? `<span class="quality-tag">${r.quality}</span>` : '';
      const track = trackKindLabel(r);
      const trackTag = track ? `<span class="track-tag ${track.cls}">${esc(track.text)}</span>` : '';
      const name = r.filename || tryDecodeUrl(r.url) || r.url;
      const confBadge = r.confidence === 'high'
        ? '<span class="conf-badge high">★</span>'
        : '';

      row.innerHTML = `
        <input type="checkbox" class="check" ${selectedIds.has(r.id) ? 'checked' : ''}>
        <span class="type-icon">${icon}</span>
        <div class="info">
          <div class="filename" title="${esc(r.url)}">${confBadge}${esc(name)}</div>
          <div class="meta">
            ${trackTag}
            ${quality}
            ${sizeStr ? `<span class="size">${sizeStr}</span>` : ''}
            ${r.mimeType ? `<span>${esc(r.mimeType)}</span>` : ''}
          </div>
        </div>
        <button class="dl-btn" title="${t('panel.download')}">${svg(SVG_DOWNLOAD)}</button>
      `;

      const cb = row.querySelector('.check') as HTMLInputElement;
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
        updateBatch();
        updateSelectAll();
      });

      // 直链视频行 hover 缩略预览；blob/MSE 无法预览独立分片，诚实跳过。
      if (r.type === 'video' && !r.url.startsWith('blob:') && !r.url.startsWith('data:')) {
        row.addEventListener('mouseenter', () => showPreview(r.url, row.getBoundingClientRect()));
        row.addEventListener('mouseleave', hidePreview);
      }
      const dl = row.querySelector('.dl-btn') as HTMLButtonElement;
      dl.addEventListener('click', () => {
        browser.runtime.sendMessage({
          action: 'downloadResource',
          url: r.url, referrer: r.pageUrl || location.href,
          filename: r.filename,
          fileSize: r.size > 0 ? r.size : undefined,
          mimeType: r.mimeType,
        }).catch(() => {});
      });

      return row;
    }

    function updateBatch(): void {
      if (batchCountEl) batchCountEl.textContent = String(selectedIds.size);
      if (batchBtnEl) batchBtnEl.disabled = selectedIds.size === 0;
    }

    function updateSelectAll(): void {
      if (!selectAllEl) return;
      const items = filtered();
      selectAllEl.checked = items.length > 0 && items.every((r) => selectedIds.has(r.id));
    }

    /** 语言切换时刷新静态文本（全选 label、批量下载按钮） */
    function refreshStaticTexts(): void {
      if (selectAllText) selectAllText.textContent = ` ${t('panel.selectAll')}`;
      if (batchBtnEl) {
        batchBtnEl.innerHTML = `${svg(SVG_DOWNLOAD)} ${t('panel.batchDownload')} (<span>0</span>)`;
        batchCountEl = batchBtnEl.querySelector('span') as HTMLElement;
        updateBatch();
      }
    }

    function filtered(): DetectedResource[] {
      return activeTab === 'all' ? resources : resources.filter((r) => r.type === activeTab);
    }

    /* ================================================================
     *  视频浮动按钮
     * ================================================================ */

    /** 该 tab 已嗅探到的媒体类资源（video/audio/stream），供浮标关联 blob/MSE 视频。 */
    function mediaResources(): DetectedResource[] {
      return resources.filter(
        (r) => r.type === 'video' || r.type === 'audio' || r.type === 'stream',
      );
    }

    function showFloat(video: HTMLVideoElement): void {
      if (!floatBtnEl) return;
      const rect = video.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80) return;

      const src = video.currentSrc || video.src;
      const isBlob = !src || src.startsWith('blob:') || src.startsWith('data:');
      const media = mediaResources();

      // 直链视频 → 可直接下载 + 可预览缩略帧；blob/MSE 视频 → 依赖嗅探到的媒体
      // 资源，无法预览独立分片（诚实跳过，不假装能预览）。两者皆无 → 不显示浮标。
      if (isBlob && media.length === 0) return;
      if (!isBlob && src) {
        showPreview(src, rect);
      } else {
        hidePreview();
      }

      floatBtnEl.style.top = `${rect.top + 8}px`;
      floatBtnEl.style.left = `${rect.right - 110}px`;

      // 分辨率标签优先取播放器实际高度；取不到时回退到嗅探资源数量提示。
      const height = video.videoHeight;
      let label = t('panel.floatDL');
      if (height >= 2160) label = '4K';
      else if (height >= 1080) label = '1080p';
      else if (height >= 720) label = '720p';
      else if (height >= 480) label = '480p';
      else if (height > 0) label = `${height}p`;
      else if (isBlob && media.length > 0) label = String(media.length);

      const lbl = floatBtnEl.querySelector('.label');
      if (lbl) lbl.textContent = label;
      floatBtnEl.classList.add('visible');
    }

    function hideFloat(): void {
      if (floatBtnEl) floatBtnEl.classList.remove('visible');
      hoverVideo = null;
      hidePreview();
    }

    /* ================================================================
     *  清晰度选择小窗（离散音视频轨对下载）
     * ================================================================ */

    function shortCodec(codecs?: string): string {
      return codecs ? codecs.split('.')[0] : '';
    }

    /** 由权威 DASH manifest 构造清晰度选项：真清晰度（height/bandwidth），配对码率最高的音频轨。 */
    function qualityOptionsFromManifest(manifest: DashManifest): QualityOption[] {
      const bestAudio = manifest.audio.length > 0
        ? manifest.audio.reduce((best, cur) => ((cur.bandwidth ?? 0) > (best.bandwidth ?? 0) ? cur : best))
        : undefined;
      const kindLabel = bestAudio
        ? `${t('panel.trackVideo')} + ${t('panel.trackAudio')}`
        : t('panel.trackVideo');

      return manifest.video.map((v) => {
        let quality: string;
        if (v.height) quality = `${v.height}P`;
        else if (v.bandwidth) quality = `${Math.round(v.bandwidth / 1000)}kbps`;
        else quality = t('panel.qualityUnknown');
        const codec = shortCodec(v.codecs);

        return {
          quality: codec ? `${quality} · ${codec}` : quality,
          videoUrl: v.url,
          audioUrl: bestAudio?.url,
          // manifest 不含时长信息，无法估出真实文件大小，诚实显示码率而非伪造大小。
          sizeLabel: v.bandwidth ? `${Math.round(v.bandwidth / 1000)} kbps` : '',
          kindLabel,
          filename: tryDecodeUrl(v.url) || 'video.mp4',
          mimeType: v.mimeType,
          fileSize: undefined,
        };
      });
    }

    /** 由嗅探碎片的 groupTrackPairs 结果构造清晰度选项（manifest 缺失时的保底，清晰度可能不准）。 */
    function qualityOptionsFromTrackGroups(groups: TrackPairGroup[]): QualityOption[] {
      return groups.map((g) => ({
        quality: g.quality,
        videoUrl: g.videoUrl,
        audioUrl: g.audioUrl,
        sizeLabel: g.videoRes.size > 0 ? formatFileSize(g.videoRes.size) : '',
        kindLabel: g.audioUrl
          ? `${t('panel.trackVideo')} + ${t('panel.trackAudio')}`
          : t('panel.trackVideo'),
        filename: g.videoRes.filename,
        mimeType: g.videoRes.mimeType,
        fileSize: g.videoRes.size > 0 ? g.videoRes.size : undefined,
      }));
    }

    function buildQualityPicker(root: HTMLElement): void {
      qualityPickerEl = h('div', 'fluxdown-quality-picker');
      root.appendChild(qualityPickerEl);
    }

    function hideQualityPicker(): void {
      if (qualityPickerEl) qualityPickerEl.classList.remove('visible');
      pendingQualityOptions = [];
    }

    /** 弹出清晰度选择小窗：列出各档真清晰度 + 大小/码率 + 轨道构成，选中后下载。 */
    function showQualityPicker(options: QualityOption[], anchorRect: DOMRect): void {
      if (!qualityPickerEl) return;
      pendingQualityOptions = options;

      const items = options.map((o, idx) => `<div class="qp-item" data-idx="${idx}">
          <div class="qp-main">
            <span class="qp-quality">${esc(o.quality)}</span>
            <span class="qp-size">${esc(o.sizeLabel)}</span>
          </div>
          <span class="qp-kind">${esc(o.kindLabel)}</span>
        </div>`).join('');

      qualityPickerEl.innerHTML = `
        <div class="qp-header">
          <span class="qp-title">${esc(t('panel.qualityPickerTitle'))}</span>
          <button type="button" class="qp-close">${svg(SVG_CLOSE)}</button>
        </div>
        <div class="qp-list">${items}</div>
      `;

      qualityPickerEl.querySelector('.qp-close')?.addEventListener('click', hideQualityPicker);
      qualityPickerEl.querySelectorAll<HTMLElement>('.qp-item').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.idx);
          const option = pendingQualityOptions[idx];
          if (option) downloadQualityOption(option);
          hideQualityPicker();
        });
      });

      // 定位到浮标附近，越界时回夹到视口内
      const width = 220;
      let left = anchorRect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = anchorRect.top;
      top = Math.max(8, Math.min(top, window.innerHeight - 40));
      qualityPickerEl.style.left = `${left}px`;
      qualityPickerEl.style.top = `${top}px`;
      qualityPickerEl.classList.add('visible');
    }

    /** 发送单条轨道（或音视频轨对）下载请求给 background。 */
    function downloadQualityOption(option: QualityOption): void {
      browser.runtime.sendMessage({
        action: 'downloadResource',
        url: option.videoUrl,
        audioUrl: option.audioUrl,
        referrer: location.href,
        filename: option.filename,
        fileSize: option.fileSize,
        mimeType: option.mimeType,
      }).catch(() => {});
    }

    /* ================================================================
     *  视频缩略预览（仅直链视频；MSE/blob 无法预览独立分片，诚实跳过）
     * ================================================================ */

    function buildPreview(root: HTMLElement): void {
      previewEl = h('div', 'fluxdown-preview');
      previewEl.innerHTML = '<video muted playsinline preload="metadata"></video>';
      const videoEl = previewEl.querySelector('video') as HTMLVideoElement;
      videoEl.addEventListener('loadedmetadata', () => {
        try {
          videoEl.currentTime = Math.min(1, (videoEl.duration || 2) * 0.1);
        } catch {
          /* 部分站点禁止跳转，保留首帧 */
        }
      });
      videoEl.addEventListener('error', hidePreview);
      root.appendChild(previewEl);
    }

    /** 显示直链视频缩略预览（复用一个隐藏 video 元素抓帧展示，绝不对 blob/MSE 视频调用）。 */
    function showPreview(url: string, anchorRect: DOMRect): void {
      if (!previewEl) return;
      if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
      const videoEl = previewEl.querySelector('video') as HTMLVideoElement;
      if (videoEl.src !== url) {
        videoEl.src = url;
      }

      const width = 200;
      let left = anchorRect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      // 优先显示在锚点上方；空间不足时改显示在下方
      const height = 112;
      let top = anchorRect.top - height - 8;
      if (top < 8) top = anchorRect.bottom + 8;
      previewEl.style.left = `${left}px`;
      previewEl.style.top = `${top}px`;
      previewEl.classList.add('visible');
    }

    function hidePreview(): void {
      if (previewHideTimer) clearTimeout(previewHideTimer);
      previewHideTimer = setTimeout(() => {
        if (previewEl) previewEl.classList.remove('visible');
      }, 150);
    }

    /* ================================================================
     *  工具
     * ================================================================ */

    function h(tag: string, cls: string): HTMLElement {
      const e = document.createElement(tag);
      e.className = cls;
      return e;
    }

    function esc(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function tryDecodeUrl(url: string): string {
      try {
        const seg = new URL(url).pathname.split('/').pop() || '';
        return decodeURIComponent(seg);
      } catch { return ''; }
    }
  },
});
