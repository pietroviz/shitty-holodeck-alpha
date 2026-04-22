import { Scene3D }              from './scene3d.js';
import { BridgeStack }          from './BridgeStack.js';
import { CharacterBridge }      from './bridges/CharacterBridge.js?v=3';
import { EnvironmentBridge }    from './bridges/EnvironmentBridge.js?v=41';
import { MusicBridge }          from './bridges/MusicBridge.js?v=2';
import { ObjectBridge }         from './bridges/ObjectBridge.js?v=2';
import { ImageBridge }          from './bridges/ImageBridge.js?v=2';
import { VoiceBridge }          from './bridges/VoiceBridge.js?v=2';
import { loadGlobalAssets, loadUserAssets } from './assetLoader.js';
import { showPreview, destroyPreview, previewSpeak, previewSpeakWhenReady, previewStopVoice, setOnSpeakStateChange, isPreviewSpeaking, previewPlayMusic, previewStopMusic, isPreviewMusicPlaying, previewPlayEnvironment, previewStopEnvironment, isPreviewEnvironmentPlaying, previewResetView } from './previewRenderer.js?v=5';
import { generateId }                       from './db.js';
import { generateThumbnailBatch, disposeThumbnailRenderer } from './thumbnailGenerator.js';

// ── Thumbnail cache (persists across category switches within session) ──
const _thumbCache = new Map();

/**
 * Format a ms timestamp as a relative time like "Modified 2 days ago".
 * Falls back to an empty string if no valid timestamp is available.
 */
function _relTime(ms) {
    if (!ms || isNaN(ms)) return '';
    const now = Date.now();
    const diff = Math.max(0, now - ms);
    const sec  = Math.round(diff / 1000);
    const min  = Math.round(sec / 60);
    const hr   = Math.round(min / 60);
    const day  = Math.round(hr  / 24);
    const wk   = Math.round(day / 7);
    const mo   = Math.round(day / 30);
    const yr   = Math.round(day / 365);

    if (sec  < 60)  return 'Modified just now';
    if (min  < 60)  return `Modified ${min} ${min === 1 ? 'minute' : 'minutes'} ago`;
    if (hr   < 24)  return `Modified ${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
    if (day  < 7)   return `Modified ${day} ${day === 1 ? 'day' : 'days'} ago`;
    if (wk   < 5)   return `Modified ${wk} ${wk === 1 ? 'week' : 'weeks'} ago`;
    if (mo   < 12)  return `Modified ${mo} ${mo === 1 ? 'month' : 'months'} ago`;
    return `Modified ${yr} ${yr === 1 ? 'year' : 'years'} ago`;
}

function _itemModifiedLabel(item) {
    // Try common places the modified timestamp might live
    const ms = item?.meta?.modified
            ?? item?.modified
            ?? item?.meta?.updated
            ?? item?.meta?.created;
    if (typeof ms === 'string') return _relTime(new Date(ms).getTime());
    return _relTime(ms);
}

// ── Pre-rendered thumbnail path for stock assets ──
const THUMB_PATH = 'thumbnails';

// ── Type-based placeholder icons for items without thumbnails ──
const _THUMB_PLACEHOLDERS = {
    character:   { icon: '👤', bg: '#2A3240' },
    environment: { icon: '🌄', bg: '#2A3240' },
    voice:       { icon: '🎙', bg: '#2A3240' },
    music:       { icon: '🎵', bg: '#2A3240' },
    prop:        { icon: '📦', bg: '#2A3240' },
    object:      { icon: '📦', bg: '#2A3240' },
    image:       { icon: '🖼', bg: '#2A3240' },
    asset:       { icon: '🖼', bg: '#2A3240' },
};
function _thumbHTML(item) {
    // Stock assets: ALWAYS use pre-rendered static thumbnail (never the browser-gen cache)
    if (item.id && item.meta?.owner !== 'user') {
        const esc = _THUMB_PLACEHOLDERS[item.type] || { icon: '•', bg: '#2A3240' };
        return `<img src="${THUMB_PATH}/${item.id}.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;align-items:center;justify-content:center;width:100%;height:100%;background:${esc.bg};border-radius:6px;font-size:20px;">${esc.icon}</span>`;
    }
    // User assets: check thumbnail cache
    const cached = item.meta?.thumbnail || _thumbCache.get(item.id);
    if (cached) return `<img src="${cached}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
    const ph = _THUMB_PLACEHOLDERS[item.type] || { icon: '•', bg: '#2A3240' };
    return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${ph.bg};border-radius:6px;font-size:20px;">${ph.icon}</span>`;
}

/** Map menu labels → bridge classes for Create/Edit. */
const BRIDGE_MAP = {
    'Character':   CharacterBridge,
    'Environment': EnvironmentBridge,
    'Music':       MusicBridge,
    '3D Object':   ObjectBridge,
    '2D Image':    ImageBridge,
    'Voice':       VoiceBridge,
};

/** Map asset types (from JSON) → display labels for BRIDGE_MAP lookup. */
const TYPE_TO_LABEL = {
    character: 'Character',
    prop:      '3D Object',
    music:     'Music',
    asset:     '2D Image',
    environment: 'Environment',
    image:     '2D Image',
    object:    '3D Object',
    voice:     'Voice',
};

/* ══════════════════════════════════════════════════════════
   SVG icon helpers
   ══════════════════════════════════════════════════════════ */
function svg(d, w = 20, h = 20) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

const ICON = {
    menu:         svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>', 24),
    video:        svg('<path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>'),
    play:         svg('<polygon points="5 3 19 12 5 21 5 3"/>', 32, 32),
    stop:         svg('<rect x="6" y="6" width="12" height="12" rx="2" ry="2" fill="currentColor" stroke="none"/>', 32, 32),
    pencil:       svg('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>', 16),
    send:         svg('<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>'),
    wand:         svg('<path d="m15 4-8.5 8.5-1 4.5 4.5-1L19 7.5z"/><path d="M3 3l4.5 4.5"/><path d="m20.5 9.5 1-1a2.121 2.121 0 0 0-3-3l-1 1"/>'),
    x:            svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    more:         svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    arrowUpDown:  svg('<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>'),
    copy:         svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    trash:        svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
    download:     svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    search:       svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
    chevronLeft:  svg('<path d="m15 18-6-6 6-6"/>'),
    chevronDown:  svg('<path d="m6 9 6 6 6-6"/>'),
    check:        svg('<path d="M20 6 9 17l-5-5"/>'),
    home:         svg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    compass:      svg('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>'),
    folder:       svg('<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>'),
    plus:         svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    settings:     svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
    orbit:        svg('<circle cx="12" cy="12" r="3"/><path d="M3 12a9 9 0 1 0 18 0A9 9 0 0 0 3 12"/><path d="M12 3c1.5 4.5 1.5 13.5 0 18"/><path d="M3 12c4.5-1.5 13.5-1.5 18 0"/>'),
    trees:        svg('<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>'),
    users:        svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    music:        svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    box:          svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>'),
    image:        svg('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
    dice:         `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="2" y="2" width="20" height="20" rx="4" fill="white"/><circle cx="12" cy="8" r="1.5" fill="black"/><circle cx="8" cy="12" r="1.5" fill="black"/><circle cx="16" cy="12" r="1.5" fill="black"/><circle cx="12" cy="16" r="1.5" fill="black"/></svg>`,
    layout:       svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
    mic:          svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'),
    sparkle:      svg('<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>'),
    info:         svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
};

/* ══════════════════════════════════════════════════════════
   MENU CONFIG
   ══════════════════════════════════════════════════════════ */

/** Asset category items shared by Templates, My Stuff, and Create New. */
const ASSET_CATEGORIES = [
    { label: 'Environments', singular: 'Environment', icon: ICON.trees  },
    { label: 'Characters',   singular: 'Character',   icon: ICON.users  },
    { label: 'Voices',       singular: 'Voice',        icon: ICON.mic    },
    { label: 'Music',        singular: 'Music',        icon: ICON.music  },
    { label: '3D Objects',   singular: '3D Object',    icon: ICON.box    },
    { label: '2D Images',    singular: '2D Image',     icon: ICON.image  },
];

const PANEL_CATEGORIES = {
    Characters:   ['All Characters', 'My Characters'],
    Environments: ['All Environments', 'My Environments'],
    Voices:       ['All Voices', 'My Voices'],
    Music:        ['All Music', 'My Music'],
    '3D Objects': ['All 3D Objects', 'My 3D Objects'],
    '2D Images':  ['All 2D Images', 'My 2D Images'],
};

/** One-level floating menu items. Each action handled directly. */
const TOP_MENU = [
    { icon: ICON.compass, label: 'Explore',     action: 'explore'                       },
    { icon: ICON.layout,  label: 'Templates',   action: 'section', section: 'templates' },
    { icon: ICON.folder,  label: 'My Stuff',    action: 'section', section: 'mystuff'   },
];

/**
 * Panel navigation stack — manages the side panel's depth levels.
 * Level 0: category picker (Templates, My Stuff, Create New)
 * Level 1: asset browser (e.g. Voices, Characters)
 * Level 2+: handled by BridgeStack (editors)
 */
let _panelNav = {
    section: '',      // 'templates' | 'mystuff' | 'create'
    sectionLabel: '', // 'Templates' | 'My Stuff' | 'Create New'
    level: 0,         // 0 = category picker, 1 = asset browser
    category: '',     // e.g. 'Voices', 'Characters' (when level >= 1)
};

/* ══════════════════════════════════════════════════════════
   PANEL DATA (loaded dynamically from global_assets + IndexedDB)
   ══════════════════════════════════════════════════════════ */
let panelItems    = [];   // current loaded assets
let panelLoading  = false;
let panelSource   = '';   // 'explore' | 'mystuff'

/** Panel labels that support auto-play preview when browsing. */
const AUTO_PLAY_PANELS = new Set(['Voices', 'Characters', 'Music', 'Environments']);
function _canAutoPlay(label) { return AUTO_PLAY_PANELS.has(label); }

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */
const S = {
    isNew:              false,
    createType:         null,
    menuOpen:           false,
    panelOpen:          false,
    panelLabel:         '',
    sortOption:         'All',
    sortDropdownOpen:   false,
    sortOrder:          'newest',   // newest | az | za | oldest
    sortMenuOpen:       false,      // ellipsis → sort dropdown
    categoryMenuOpen:   false,      // custom category/source dropdown
    panelSearchMode:    false,
    panelSearchQuery:   '',
    itemMenuOpenId:     null,       // which item's ellipsis menu is open
    uiVisible:          true,
    panelCategory:      '',         // active sub-category filter within the panel

    // ── Builder integration ────────────────────────────
    builderMode:        false,      // true while BridgeStack has ≥1 bridge
    lastSavedAsset:     null,       // most recently saved asset (any type)

    // ── Viewport preview ─────────────────────────────
    previewAsset:       null,       // currently loaded/previewed asset from browse list
    selectedIndex:      -1,         // index of selected item in the filtered list
    autoPlayVoice:      false,      // auto-speak preview text when browsing voices
};

/* ══════════════════════════════════════════════════════════
   DOM REFS
   ══════════════════════════════════════════════════════════ */
let E = {}; // populated in init()

/* ── Saved browse state (restored when edit bridge pops back) ── */
let _savedBrowseState = null;

/**
 * Duplicate a global/template asset into a user-editable copy.
 * Creates a new asset with a fresh ID and user ownership.
 */
function _duplicateAssetForEdit(asset) {
    const state = asset.payload?.state || asset.state || {};
    const now = Date.now();

    // Carry forward the full payload so bridges can read _editor, color_assignments, etc.
    const srcPayload = asset.payload || {};
    const payload = structuredClone(srcPayload);
    // Merge top-level state into payload.state so bridges always find it
    if (!payload.state) payload.state = {};
    Object.assign(payload.state, structuredClone(state));

    return {
        id:   generateId(),
        type: asset.type,
        name: (asset.name || 'Untitled') + ' (Copy)',
        description: payload.description || asset.description || '',
        tags: [...(asset.tags || [])],
        meta: {
            created:   now,
            modified:  now,
            tags:      [...(asset.tags || [])],
            thumbnail: asset.meta?.thumbnail || null,
            owner:     'user',
            templateId: asset.id,  // track which template this came from
        },
        payload,
        state: { ...state },
    };
}

/* ══════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════ */
function render() {
    const { isNew, createType, menuOpen,
            panelOpen, panelLabel, sortOption,
            sortDropdownOpen, panelSearchMode, panelSearchQuery,
            uiVisible } = S;

    // ── Scene disabled while in new-mode (null while builder is active) ───
    if (scene) scene.disabled = isNew;

    // ── Left panel ─────────────────────────
    E.leftPanel.classList.toggle('open', panelOpen);
    E.leftPanel.setAttribute('aria-hidden', String(!panelOpen));
    // When builder mode is active the bridge manages #panel-inner itself
    if (panelOpen && !S.builderMode) {
        if (_panelNav.level === 0 && _panelNav.section) {
            renderCategoryPicker();
        } else {
            renderPanel();
        }
    }

    // ── UI fade ────────────────────────────
    E.uiElements.classList.toggle('faded', !uiVisible);

    // ── Hamburger: always visible except in new mode ─
    // When panel is open, hamburger becomes a section-switcher
    E.hamburgerBtn.classList.toggle('hidden', isNew);
    E.hamburgerBtn.classList.toggle('panel-open', panelOpen);
    E.menuDropdown.classList.toggle('panel-open', panelOpen);

    // ── Menu ───────────────────────────────
    E.menuBackdrop.classList.toggle('visible', menuOpen);
    E.menuDropdown.classList.toggle('visible', menuOpen);
    if (menuOpen) renderMenu();

    // ── Reset btn: hide in new mode or while a preview/env is auto-rotating ────────
    const bridgePlaying   = S.builderMode && bridgeStack.top()?.bridge?._isPlaying;
    const previewPlaying  = !S.builderMode && isPreviewEnvironmentPlaying();
    E.resetBtn.classList.toggle('hidden', isNew || bridgePlaying || previewPlaying);

    // ── Safe-area ──────────────────────────
    // Border fades to transparent when panel is open OR when UI is hiding
    E.safeArea.classList.toggle('transparent', panelOpen || !uiVisible);

    // ── New overlay ────────────────────────
    E.newOverlay.classList.toggle('visible', isNew);

    // ── Bottom gradient ────────────────────
    E.bottomGradient.classList.toggle('new-mode', isNew);

    // ── Play button ────────────────────────
    E.playWrap.classList.toggle('hidden', isNew);

    // ── Title row ──────────────────────────
    const displayAsset = S.previewAsset || S.lastSavedAsset;
    const assetTypeIcon = displayAsset ? (
        { character: ICON.users, prop: ICON.box, music: ICON.music, asset: ICON.image,
          environment: ICON.trees, object: ICON.box, image: ICON.image, voice: ICON.music
        }[displayAsset.type] || ICON.box
    ) : '';
    // Show asset thumbnail in title row (fall back to type icon)
    if (!isNew && displayAsset) {
        E.titleThumb.innerHTML = _thumbHTML(displayAsset);
    } else {
        E.titleThumb.innerHTML = isNew ? ICON.wand : assetTypeIcon;
    }
    E.titleText.textContent  = isNew
        ? (createType ? `Create New ${createType}…` : 'Create New…')
        : (displayAsset ? displayAsset.name : 'Untitled');
    // Element count: hidden in "new" mode and in builder/edit mode
    // (replaced by the Surprise Me button in edit mode).
    E.elCount.classList.toggle('hidden', isNew || S.builderMode);
    // Edit button: only meaningful while actively previewing an asset
    // in the browse panel. Hidden in builder mode (you're already editing)
    // and on the index page (reserved for full simulations later).
    const canEditNow = !S.builderMode && !!S.previewAsset && S.panelOpen;
    E.editBtn.classList.toggle('hidden', isNew || !canEditNow);
    // Surprise button: visible in "new" mode AND in builder/edit mode
    E.surpriseBtn.classList.toggle('hidden', !isNew && !S.builderMode);

    // ── New toggle btn ─────────────────────
    E.newBtn.classList.toggle('active', isNew);
    E.newBtn.setAttribute('aria-pressed', String(isNew));
}

/* ── Menu HTML (one level deep — section switcher) ─────── */
function renderMenu(submenu) {
    if (submenu === 'create') {
        // ── "Create New" submenu — lists asset types ──
        E.menuDropdown.innerHTML = `
            <button class="menu-back" data-action="menu-back">
                <span class="mi-icon">${ICON.chevronLeft}</span>
                <span class="back-title">Create New</span>
            </button>
            <div class="menu-divider"></div>
            ${ASSET_CATEGORIES.map(c => `
                <button class="menu-item" data-create="${c.singular}">
                    <span class="mi-icon">${c.icon}</span>
                    <span class="mi-spacer">${c.singular}</span>
                </button>`).join('')}
        `;
        // Wire submenu events
        E.menuDropdown.querySelector('[data-action="menu-back"]')
            .addEventListener('click', () => renderMenu());
        E.menuDropdown.querySelectorAll('[data-create]').forEach(btn => {
            btn.addEventListener('click', () => {
                openCreate(btn.dataset.create);
            });
        });
    } else {
        // ── Top-level menu ──
        E.menuDropdown.innerHTML = `
            ${TOP_MENU.map(it => `
                <button class="menu-item" data-section="${it.section || ''}" data-action="${it.action}">
                    <span class="mi-icon">${it.icon}</span>
                    <span class="mi-spacer">${it.label}</span>
                </button>`).join('')}
            <button class="menu-item" data-action="create-new">
                <span class="mi-icon">${ICON.sparkle}</span>
                <span class="mi-spacer">Create New</span>
                <span class="mi-suffix">${ICON.chevronRight}</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" data-action="about">
                <span class="mi-icon">${ICON.info}</span>
                <span class="mi-spacer">About</span>
            </button>
            <button class="menu-item" data-action="settings">
                <span class="mi-icon">${ICON.settings}</span>
                <span class="mi-spacer">Settings</span>
            </button>
        `;
        E.menuDropdown.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                const act     = btn.dataset.action;
                if (act === 'about') {
                    document.getElementById('about-overlay').style.display = 'flex';
                    closeMenu();
                } else if (act === 'settings') {
                    openSettings();
                } else if (act === 'create-new') {
                    renderMenu('create');
                } else if (act === 'explore') {
                    goExplore();
                } else if (section) {
                    openSection(section);
                } else {
                    closeMenu();
                }
            });
        });
    }
}

/**
 * "Explore" — return to the default home view (blank simulation).
 * Eventually this will load random simulations for discovery.
 */
function goExplore() {
    closeMenu();

    // If builder is active, pop it
    if (S.builderMode && bridgeStack && !bridgeStack.isEmpty) {
        bridgeStack.popAll();
    }

    // Close panel, exit new mode, clear preview
    S.panelOpen    = false;
    S.isNew        = false;
    S.createType   = null;
    S.builderMode  = false;
    S.previewAsset = null;
    S.lastSavedAsset = null;
    _panelNav = { section: '', sectionLabel: '', level: 0, category: '' };

    // Destroy any preview and restore default scene
    destroyPreview();
    if (scene) { scene.destroy(); scene = null; }
    scene = new Scene3D(E.sceneContainer);

    render();
}

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL
   ══════════════════════════════════════════════════════════ */

/** Cached user profile (fetched once per session). */
let _userProfile = null;
let _profileFetched = false;

async function fetchUserProfile() {
    if (_profileFetched) return _userProfile;
    try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
            _userProfile = await res.json();
        } else {
            _userProfile = { authenticated: false, guest: true };
        }
    } catch {
        _userProfile = { authenticated: false, guest: true };
    }
    _profileFetched = true;
    return _userProfile;
}

function openSettings() {
    closeMenu();
    const overlay = document.getElementById('settings-overlay');
    overlay.style.display = 'flex';
    renderSettingsContent();
}

function closeSettings() {
    document.getElementById('settings-overlay').style.display = 'none';
}

async function renderSettingsContent() {
    const container = document.getElementById('settings-content');
    container.innerHTML = `<p style="color:var(--text-dim); font-size:14px;">Loading...</p>`;

    const profile = await fetchUserProfile();

    if (profile.authenticated && profile.user) {
        const u = profile.user;
        container.innerHTML = `
            <div class="settings-section">
                <span class="settings-label">Account</span>
                <span class="settings-value">${_esc(u.displayName)}</span>
                ${u.username ? `<span class="settings-value" style="font-size:13px; color:var(--text-dim);">@${_esc(u.username)}</span>` : ''}
            </div>
            <div class="settings-section">
                <span class="settings-label">Email</span>
                <span class="settings-value" style="font-size:13px;">${_esc(u.email)}</span>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <span class="settings-label">Version</span>
                <span class="settings-value" style="font-size:13px;">Shitty Holodeck v0.2 — Alpha</span>
            </div>
            <div class="settings-divider"></div>
            <button class="settings-btn danger" id="settings-signout">Sign Out</button>
        `;
        container.querySelector('#settings-signout').addEventListener('click', async () => {
            try {
                await fetch('/api/auth/signout', { method: 'POST' });
            } catch { /* ignore */ }
            _userProfile = null;
            _profileFetched = false;
            window.location.href = '/';
        });
    } else {
        container.innerHTML = `
            <div class="settings-guest-banner">
                <p>You're browsing as a <strong style="color:var(--text-primary);">guest</strong>. Sign in to save your creations and access them later.</p>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button class="settings-btn primary" id="settings-signin">Sign in with Email</button>
                <button class="settings-btn secondary" id="settings-dismiss">Keep Exploring</button>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <span class="settings-label">Version</span>
                <span class="settings-value" style="font-size:13px;">Shitty Holodeck v0.2 — Alpha</span>
            </div>
        `;
        container.querySelector('#settings-signin').addEventListener('click', () => {
            window.location.href = '/auth/login';
        });
        container.querySelector('#settings-dismiss').addEventListener('click', closeSettings);
    }
}

/** Simple HTML escaper for user-provided text. */
function _esc(str) {
    const el = document.createElement('span');
    el.textContent = str || '';
    return el.innerHTML;
}

/**
 * Open a section — transitions the side panel to the category picker
 * for that section (Templates, My Stuff).
 */
function openSection(section) {
    const labels = { templates: 'Templates', mystuff: 'My Stuff' };
    _panelNav = {
        section,
        sectionLabel: labels[section] || section,
        level: 0,
        category: '',
    };

    // If builder is active, pop it first
    if (S.builderMode && bridgeStack && !bridgeStack.isEmpty) {
        bridgeStack.popAll();
    }

    // Reset browse state
    panelItems = [];
    panelLoading = false;
    panelSource = '';

    S.panelOpen        = true;
    S.panelLabel       = labels[section] || section;
    S.menuOpen         = false;
    S.builderMode      = false;
    S.isNew            = false;
    S.createType       = null;
    S.sortMenuOpen     = false;
    S.itemMenuOpenId   = null;
    S.panelSearchMode  = false;
    S.panelSearchQuery = '';
    S.selectedIndex    = -1;

    render();
}

/**
 * Render the category picker for the current section.
 * This is the "level 0" of the side panel nav.
 */
function renderCategoryPicker() {
    const { section, sectionLabel } = _panelNav;

    const categories = ASSET_CATEGORIES;

    E.panelInner.innerHTML = `
        <!-- Header -->
        <div class="ph-row">
            <button class="ph-btn" id="panel-close">${ICON.x}</button>
            <span class="ph-title">${sectionLabel}</span>
            <div style="width:40px"></div>
        </div>

        <!-- Category list -->
        <div class="panel-items" id="panel-items-list">
            ${categories.map(cat => `
                <button class="panel-category-btn" data-label="${cat.label}" data-singular="${cat.singular || cat.label}">
                    <span class="mi-icon">${cat.icon}</span>
                    <span>${cat.label}</span>
                    <span class="mi-suffix">${ICON.chevronRight}</span>
                </button>`).join('')}
        </div>
    `;

    // Wire close
    E.panelInner.querySelector('#panel-close')
        .addEventListener('click', closePanel);

    // Wire category buttons
    E.panelInner.querySelectorAll('.panel-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const label    = btn.dataset.label;
            const singular = btn.dataset.singular;
            const source = section === 'mystuff' ? 'mystuff' : 'explore';
            _panelNav.level    = 1;
            _panelNav.category = label;
            openPanel(label, source);
        });
    });
}

/* ── Sort helpers ───────────────────────────────────────── */
const SORT_ORDERS = [
    { key: 'newest', label: 'Newest first'  },
    { key: 'oldest', label: 'Oldest first'  },
    { key: 'az',     label: 'A → Z'         },
    { key: 'za',     label: 'Z → A'         },
];

/** Extract unique subcategories from loaded assets for dynamic dropdown. */
function _extractSubcategories(items) {
    const cats = new Map();
    for (const it of items) {
        const cat = it._category || it.meta?.category || '';
        if (cat) {
            const key = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
            cats.set(key, (cats.get(key) || 0) + 1);
        }
    }
    return [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function sortedItems(items) {
    const q = S.panelSearchQuery.toLowerCase();
    let list = q
        ? items.filter(it => {
            const name = (it.name || '').toLowerCase();
            const type = (it.type || '').toLowerCase();
            const tags = (it.tags || []).join(' ').toLowerCase();
            return name.includes(q) || type.includes(q) || tags.includes(q);
          })
        : [...items];

    // Filter by subcategory if one is actively selected
    const cat = S.panelCategory;
    if (cat && cat !== 'All' && !cat.startsWith('All ') && !cat.startsWith('My ')) {
        list = list.filter(it => {
            const itemCat = it._category || it.meta?.category || '';
            return itemCat.toLowerCase() === cat.toLowerCase();
        });
    }

    switch (S.sortOrder) {
        case 'az':     list.sort((a,b) => (a.name||'').localeCompare(b.name||'')); break;
        case 'za':     list.sort((a,b) => (b.name||'').localeCompare(a.name||'')); break;
        case 'oldest': list.reverse(); break;
    }
    return list;
}

/* ── Panel items-only update (avoids re-rendering search input) ── */
function renderPanelItems() {
    const items = sortedItems(panelItems);

    // Update item count
    const countEl = E.panelInner.querySelector('.ps-count');
    if (countEl) countEl.textContent = `${items.length} items`;

    // Update items list only
    const listEl = E.panelInner.querySelector('#panel-items-list');
    if (!listEl) return;
    const savedScroll = listEl.scrollTop;
    listEl.innerHTML = items.length === 0
        ? `<div class="panel-empty-state"><p style="color:var(--text-dim);">No results</p></div>`
        : items.map((it, idx) => `
        <div class="panel-item ${idx === S.selectedIndex ? 'selected' : ''}"
             data-idx="${idx}" data-id="${it.id}">
            <div class="pi-thumb">${_thumbHTML(it)}</div>
            <div class="pi-text">
                <div class="pi-name">${it.name || 'Untitled'}</div>
                <div class="pi-detail">${it.type || ''}</div>
                <div class="pi-detail">${_itemModifiedLabel(it)}</div>
                ${it.payload?.catchphrase ? `<div class="pi-catchphrase">${it.payload.catchphrase}</div>` : ''}
            </div>
            <button class="pi-action pi-edit" data-idx="${idx}" data-id="${it.id}" title="Edit">${ICON.pencil}</button>
            <div class="pi-more-wrap">
                <button class="pi-action pi-more" data-idx="${idx}" title="More">${ICON.more}</button>
            </div>
        </div>`).join('');
    listEl.scrollTop = savedScroll;

    // Re-wire item click events
    E.panelInner.querySelectorAll('.panel-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.pi-action')) return;
            selectAsset(parseInt(el.dataset.idx), items);
        });
    });
    E.panelInner.querySelectorAll('.pi-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id    = btn.dataset.id;
            const asset = items.find(it => it.id === id);
            if (!asset) return;
            const label = TYPE_TO_LABEL[asset.type] || 'Character';
            const BridgeClass = BRIDGE_MAP[label];
            if (BridgeClass) {
                _savedBrowseState = {
                    panelLabel: S.panelLabel, panelSource, panelItems: [...panelItems],
                    selectedIndex: S.selectedIndex, previewAsset: S.previewAsset,
                    sortOrder: S.sortOrder, panelCategory: S.panelCategory,
                };
                const isTemplate = panelSource === 'explore' || asset.meta?.owner !== 'user';
                openBuilder(BridgeClass, isTemplate ? _duplicateAssetForEdit(asset) : asset, label);
            }
        });
    });
}

/* ── Panel HTML ─────────────────────────────────────────── */
function renderPanel() {
    const { panelLabel, panelSearchMode, panelSearchQuery,
            sortOption, sortDropdownOpen,
            sortMenuOpen, sortOrder, itemMenuOpenId, selectedIndex } = S;
    const activeSortLabel = SORT_ORDERS.find(o => o.key === sortOrder)?.label ?? 'Newest first';
    const items = sortedItems(panelItems);
    const isEmpty = !panelLoading && items.length === 0;
    const isMyStuff = panelSource === 'mystuff';

    // Save scroll position before rebuilding
    const listEl = E.panelInner.querySelector('#panel-items-list');
    const savedScroll = listEl ? listEl.scrollTop : 0;

    // Show back arrow when we're deeper than the top level of the panel nav
    const showBackArrow = _panelNav.level >= 1;

    E.panelInner.innerHTML = `
        <!-- Header -->
        <div class="ph-row">
            <button class="ph-btn" id="panel-close">${showBackArrow ? ICON.chevronLeft : ICON.x}</button>
            <span class="ph-title">${panelSearchMode ? 'Search' : panelLabel}</span>
            <div class="ph-more-wrap">
                <button class="ph-btn" id="panel-more-btn">${ICON.more}</button>
                ${sortMenuOpen ? `
                <div class="sort-menu" id="sort-menu">
                    <div class="sort-menu-section-label">Sort by</div>
                    ${SORT_ORDERS.map(o => `
                        <button class="sort-menu-item" data-order="${o.key}">
                            ${o.label}
                            ${sortOrder === o.key ? `<span class="check-icon">${ICON.check}</span>` : ''}
                        </button>`).join('')}
                </div>` : ''}
            </div>
        </div>

        <!-- Controls row: category dropdown + search toggle (matches Figma Make layout) -->
        <div class="ps-row" id="ps-row">
            ${panelSearchMode
                ? `<div class="search-input-wrap">
                       <input class="search-input" id="panel-search-input"
                              value="${panelSearchQuery}"
                              placeholder="Search ${panelLabel.toLowerCase()}..." autofocus>
                   </div>`
                : (() => {
                       const subcats   = _extractSubcategories(panelItems);
                       const isMy      = panelSource === 'mystuff';
                       const typeLabel = panelLabel;
                       const topLabel     = isMy ? `My ${typeLabel}` : 'All Templates';
                       const switchValue  = isMy ? `All ${typeLabel}` : `My ${typeLabel}`;
                       const switchLabel  = isMy ? 'All Templates'    : `My ${typeLabel}`;
                       // What to show on the button face
                       let activeLabel = topLabel;
                       if (S.panelCategory && S.panelCategory !== 'All') {
                           const match = subcats.find(([n]) => n === S.panelCategory);
                           if (match) activeLabel = match[0];
                       }
                       const topActive = !S.panelCategory || S.panelCategory === 'All';
                       return `
                       <div class="panel-filter-wrap" id="panel-filter-wrap">
                           <button class="panel-source-btn" id="panel-source-btn" type="button">
                               <span class="panel-source-btn-label">${activeLabel}</span>
                               <span class="panel-source-btn-chev">${ICON.chevronDown}</span>
                           </button>
                           ${S.categoryMenuOpen ? `
                           <div class="panel-source-menu" id="panel-source-menu">
                               <button class="sort-menu-item" data-cat-value="All">
                                   <span>${topLabel}</span>
                                   ${topActive ? `<span class="check-icon">${ICON.check}</span>` : ''}
                               </button>
                               ${subcats.map(([name, count]) => `
                                   <button class="sort-menu-item" data-cat-value="${name}">
                                       <span>${name} (${count})</span>
                                       ${S.panelCategory === name ? `<span class="check-icon">${ICON.check}</span>` : ''}
                                   </button>
                               `).join('')}
                               <div class="panel-source-menu-divider"></div>
                               <button class="sort-menu-item" data-cat-value="${switchValue}">
                                   <span>${switchLabel}</span>
                               </button>
                           </div>` : ''}
                       </div>`;
                   })()
            }
            <button class="search-toggle" id="search-toggle">
                ${panelSearchMode ? ICON.x : ICON.search}
            </button>
        </div>

        <!-- Item count + active sort (subtle info row) -->
        <div class="panel-info-row">
            <span class="ps-count">${panelLoading ? 'Loading...' : `${items.length} items`}</span>
            ${sortOrder !== 'newest' ? `
            <span class="sort-active-pill">
                ${ICON.arrowUpDown} ${activeSortLabel}
            </span>` : ''}
            ${_canAutoPlay(panelLabel) ? `
            <label class="panel-autoplay">
                <span>Auto-play</span>
                <input type="checkbox" id="panel-autoplay-cb" ${S.autoPlayVoice ? 'checked' : ''}>
            </label>` : ''}
        </div>

        <!-- Items or Empty State -->
        <div class="panel-items" id="panel-items-list">
            ${panelLoading ? `
                <div class="panel-empty-state">
                    <div class="panel-spinner"></div>
                    <p style="color:var(--text-dim);">Loading assets...</p>
                </div>
            ` : isEmpty ? `
                <div class="panel-empty-state">
                    <p style="color:var(--text-dim);margin-bottom:12px;">
                        No ${panelLabel.toLowerCase()} yet
                    </p>
                    ${isMyStuff ? `
                        <button class="cb-save-btn" id="panel-create-new-btn" style="width:auto;padding:10px 24px;">
                            ${ICON.plus} Create New
                        </button>
                    ` : ''}
                </div>
            ` : items.map((it, idx) => `
                <div class="panel-item ${idx === selectedIndex ? 'selected' : ''}"
                     data-idx="${idx}" data-id="${it.id}">
                    <div class="pi-thumb">${_thumbHTML(it)}</div>
                    <div class="pi-text">
                        <div class="pi-name">${it.name || 'Untitled'}</div>
                        <div class="pi-detail">${it.type || ''}</div>
                        <div class="pi-detail">${_itemModifiedLabel(it)}</div>
                ${it.payload?.catchphrase ? `<div class="pi-catchphrase">${it.payload.catchphrase}</div>` : ''}
                    </div>
                    <button class="pi-action pi-edit" data-idx="${idx}" data-id="${it.id}" title="Edit">${ICON.pencil}</button>
                    <div class="pi-more-wrap">
                        <button class="pi-action pi-more" data-idx="${idx}" title="More">${ICON.more}</button>
                        ${itemMenuOpenId === idx ? `
                        <div class="item-menu">
                            <button class="item-menu-btn" data-action="duplicate" data-idx="${idx}">${ICON.copy} Duplicate</button>
                            <button class="item-menu-btn" data-action="export" data-idx="${idx}">${ICON.download} Export JSON</button>
                            <div class="item-menu-divider"></div>
                            <button class="item-menu-btn danger" data-action="delete" data-idx="${idx}">${ICON.trash} Delete</button>
                        </div>` : ''}
                    </div>
                </div>`).join('')}
        </div>
    `;

    /* ── Wire events ── */
    E.panelInner.querySelector('#panel-close').addEventListener('click', () => {
        if (_panelNav.level >= 1) {
            // Back to category picker
            panelBackToCategories();
        } else {
            closePanel();
        }
    });

    // Sort menu (ellipsis)
    E.panelInner.querySelector('#panel-more-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        S.sortMenuOpen = !S.sortMenuOpen;
        S.itemMenuOpenId = null;
        render();
    });
    if (sortMenuOpen) {
        E.panelInner.querySelectorAll('.sort-menu-item').forEach(btn => {
            btn.addEventListener('click', () => {
                S.sortOrder    = btn.dataset.order;
                S.sortMenuOpen = false;
                render();
            });
        });
    }

    // Search toggle
    E.panelInner.querySelector('#search-toggle')?.addEventListener('click', () => {
        S.panelSearchMode  = !S.panelSearchMode;
        S.panelSearchQuery = '';
        S.sortDropdownOpen = false;
        render();
    });
    if (panelSearchMode) {
        const inp = E.panelInner.querySelector('#panel-search-input');
        if (inp) {
            inp.addEventListener('input', (e) => { S.panelSearchQuery = e.target.value; renderPanelItems(); });
            inp.focus();
        }
    }

    // Auto-play toggle in panel info row
    const autoplayCb = E.panelInner.querySelector('#panel-autoplay-cb');
    if (autoplayCb) {
        autoplayCb.addEventListener('change', (e) => {
            S.autoPlayVoice = e.target.checked;
            if (S.autoPlayVoice && S.previewAsset) {
                // Just turned on → play the current asset
                _autoPlayCurrentAsset();
            } else if (!S.autoPlayVoice && S.previewAsset) {
                // Just turned off → stop any in-flight playback
                if (S.previewAsset.type === 'music') {
                    previewStopMusic();
                } else if (S.previewAsset.type === 'environment') {
                    previewStopEnvironment();
                } else if (S.previewAsset.type === 'voice' || S.previewAsset.type === 'character') {
                    previewStopVoice();
                }
                _setPlayBtnState(false);
            }
        });
    }

    // "Create New" button in empty My Stuff state
    const createNewBtn = E.panelInner.querySelector('#panel-create-new-btn');
    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => {
            // Map plural labels back to singular for Create
            const singularMap = { Characters:'Character', Environments:'Environment', Voices:'Voice', Music:'Music', '3D Objects':'3D Object', '2D Images':'2D Image' };
            const createType = singularMap[panelLabel] || panelLabel;
            closePanel();
            openCreate(createType);
        });
    }

    // Item click → select & preview in viewport
    E.panelInner.querySelectorAll('.panel-item').forEach(el => {
        el.addEventListener('click', (e) => {
            // Don't select if they clicked edit or more buttons
            if (e.target.closest('.pi-action')) return;
            const idx = parseInt(el.dataset.idx);
            selectAsset(idx, items);
        });
    });

    // Per-item edit button → open editor (use asset ID for robustness)
    E.panelInner.querySelectorAll('.pi-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id    = btn.dataset.id;
            const asset = items.find(it => it.id === id);
            if (!asset) return;
            const label = TYPE_TO_LABEL[asset.type] || 'Character';
            const BridgeClass = BRIDGE_MAP[label];
            if (BridgeClass) {
                // Save browse state so we can return to it after editing
                _savedBrowseState = {
                    panelLabel: S.panelLabel,
                    panelSource: panelSource,
                    panelItems: [...panelItems],
                    selectedIndex: S.selectedIndex,
                    previewAsset: S.previewAsset,
                    sortOrder: S.sortOrder,
                    panelCategory: S.panelCategory,
                };

                // Template (explore) assets → duplicate to user storage first
                const isTemplate = panelSource === 'explore' || asset.meta?.owner !== 'user';
                const editAsset = isTemplate ? _duplicateAssetForEdit(asset) : asset;
                openBuilder(BridgeClass, editAsset, label);
            }
        });
    });

    // Per-item ellipsis menus
    E.panelInner.querySelectorAll('.pi-more').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            S.itemMenuOpenId = S.itemMenuOpenId === idx ? null : idx;
            S.sortMenuOpen   = false;
            render();
        });
    });
    if (itemMenuOpenId !== null) {
        E.panelInner.querySelectorAll('.item-menu-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const idx    = parseInt(btn.dataset.idx);
                const asset  = items[idx];
                S.itemMenuOpenId = null;

                if (action === 'duplicate' && asset) {
                    const copy = _duplicateAssetForEdit(asset);
                    copy.name = (asset.name || 'Untitled') + ' (Copy)';
                    const { dbSave } = await import('./db.js');
                    const store = asset.type === 'character' ? 'characters'
                                : asset.type === 'environment' ? 'environments'
                                : asset.type === 'music' ? 'music'
                                : asset.type === 'prop' || asset.type === 'object' ? 'objects'
                                : 'images';
                    await dbSave(store, copy);
                    // If viewing My Stuff, refresh to show the new copy
                    if (panelSource === 'mystuff') {
                        panelItems = await loadUserAssets(S.panelLabel);
                    }
                } else if (action === 'export' && asset) {
                    // Download asset as JSON file
                    const json = JSON.stringify(asset, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href = url;
                    a.download = `${(asset.name || 'asset').replace(/[^a-z0-9_-]/gi, '_')}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                } else if (action === 'delete' && asset) {
                    // Only allow deleting user assets, not templates
                    if (asset.meta?.owner !== 'user' && panelSource === 'explore') {
                        console.warn('Cannot delete template assets');
                    } else {
                        const confirmDelete = confirm(`Delete "${asset.name || 'Untitled'}"? This cannot be undone.`);
                        if (confirmDelete) {
                            const { dbDelete } = await import('./db.js');
                            const store = asset.type === 'character' ? 'characters'
                                        : asset.type === 'environment' ? 'environments'
                                        : asset.type === 'music' ? 'music'
                                        : asset.type === 'prop' || asset.type === 'object' ? 'objects'
                                        : 'images';
                            await dbDelete(store, asset.id);
                            panelItems = panelItems.filter(it => it.id !== asset.id);
                            // Clear preview if we deleted the selected asset
                            if (S.previewAsset?.id === asset.id) {
                                S.previewAsset = null;
                                S.selectedIndex = -1;
                                destroyPreview();
                                scene = new Scene3D(E.sceneContainer);
                            }
                        }
                    }
                }

                render();
            });
        });
    }

    // Close open dropdowns on panel body click
    E.panelInner.addEventListener('click', () => {
        if (S.sortMenuOpen || S.itemMenuOpenId !== null) {
            S.sortMenuOpen   = false;
            S.itemMenuOpenId = null;
            render();
        }
    }, { once: true });

    // Custom source dropdown (replaces native <select>)
    const catBtn = E.panelInner.querySelector('#panel-source-btn');
    if (catBtn) {
        catBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            S.categoryMenuOpen = !S.categoryMenuOpen;
            // Close sort menu if open (mutually exclusive)
            if (S.categoryMenuOpen) S.sortMenuOpen = false;
            render();
        });
    }
    // Outside-click closes the menu
    if (S.categoryMenuOpen) {
        const closeOnOutside = (e) => {
            const menu = E.panelInner.querySelector('#panel-source-menu');
            const btn  = E.panelInner.querySelector('#panel-source-btn');
            if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
                S.categoryMenuOpen = false;
                document.removeEventListener('mousedown', closeOnOutside);
                document.removeEventListener('keydown', closeOnEsc);
                render();
            }
        };
        const closeOnEsc = (e) => {
            if (e.key === 'Escape') {
                S.categoryMenuOpen = false;
                document.removeEventListener('mousedown', closeOnOutside);
                document.removeEventListener('keydown', closeOnEsc);
                render();
            }
        };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEsc);
    }
    // Menu item clicks
    E.panelInner.querySelectorAll('#panel-source-menu .sort-menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const val = item.dataset.catValue;
            S.categoryMenuOpen = false;

            // "My X" → switch to user assets and reload
            if (val.startsWith('My ')) {
                S.panelCategory = 'All';
                panelLoading = true;
                panelItems = [];
                S.selectedIndex = -1;
                panelSource = 'mystuff';
                render();
                try {
                    panelItems = await loadUserAssets(S.panelLabel);
                } catch (err) {
                    console.warn('Failed to load:', err);
                    panelItems = [];
                }
                panelLoading = false;
                render();
            }
            // "All X" (e.g., "All Templates" / "All Environments") → switch back to explore
            else if (val.startsWith('All ') && val !== 'All') {
                S.panelCategory = 'All';
                panelLoading = true;
                panelItems = [];
                S.selectedIndex = -1;
                panelSource = 'explore';
                render();
                try {
                    panelItems = await loadGlobalAssets(S.panelLabel);
                } catch (err) {
                    console.warn('Failed to load:', err);
                    panelItems = [];
                }
                panelLoading = false;
                render();
            }
            // Subcategory filter — no reload, just re-render
            else {
                S.panelCategory = val;
                S.selectedIndex = -1;
                render();
            }
        });
    });

    // Restore scroll position after innerHTML rebuild, then nudge if needed
    const newList = E.panelInner.querySelector('#panel-items-list');
    if (newList && savedScroll) newList.scrollTop = savedScroll;
    if (selectedIndex >= 0) {
        const sel = E.panelInner.querySelector('.panel-item.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
}

/** Auto-play the current preview asset's voice (voice or character). */
function _autoPlayCurrentAsset() {
    const asset = S.previewAsset;
    if (!asset) return;
    const assetState = asset.payload?.state || asset.state || {};
    if (asset.type === 'voice') {
        const speakText = assetState.previewText || "Look at me, I'm a character.";
        previewSpeakWhenReady(speakText);
    } else if (asset.type === 'character') {
        // Characters use catchphrase, greeting, or default
        const speakText = asset.payload?.catchphrase || assetState.greeting || assetState.previewText || "Look at me, I'm a character.";
        previewSpeakWhenReady(speakText);
    } else if (asset.type === 'music') {
        previewPlayMusic(asset);
    } else if (asset.type === 'environment') {
        // For environments, "play" = rotate the camera. Later we'll add
        // music/effects tied to the env's own settings.
        previewPlayEnvironment();
        _setPlayBtnState(true);
    }
}

/* ── Select an asset in the panel list and preview it ──── */
function selectAsset(idx, items) {
    const asset = items?.[idx];
    if (!asset) return;

    // Stop any currently playing voice/music/rotation before switching
    previewStopVoice();
    previewStopMusic();
    previewStopEnvironment();
    _setPlayBtnState(false);

    S.selectedIndex = idx;
    S.previewAsset  = asset;
    S.lastSavedAsset = asset;

    // Destroy the default scene and show the asset preview
    if (scene) { scene.destroy(); scene = null; }
    showPreview(E.sceneContainer, asset, {
        // Auto-capture thumbnail if the asset doesn't have one
        onThumbnail: !asset.meta?.thumbnail && !_thumbCache.has(asset.id) ? async (dataURL) => {
            if (!asset.meta) asset.meta = {};
            asset.meta.thumbnail = dataURL;
            _thumbCache.set(asset.id, dataURL);
            // Update the thumbnail in the panel list
            const thumb = E.panelInner.querySelector(`.panel-item[data-id="${asset.id}"] .pi-thumb`);
            if (thumb && !thumb.querySelector('img')) {
                thumb.innerHTML = `<img src="${dataURL}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
            }
            // Persist thumbnail to IndexedDB for user-owned assets
            if (asset.meta?.owner === 'user') {
                try {
                    const { dbSave } = await import('./db.js');
                    const store = asset.type === 'character' ? 'characters'
                                : asset.type === 'environment' ? 'environments'
                                : asset.type === 'voice' ? 'voices'
                                : asset.type === 'music' ? 'music'
                                : asset.type === 'prop' || asset.type === 'object' ? 'objects'
                                : 'images';
                    await dbSave(store, asset);
                } catch (e) { /* silent — thumbnail is cached in memory as fallback */ }
            }
        } : null,
    });

    render();

    // Auto-play preview when browsing with auto-play enabled
    if (S.autoPlayVoice && _canAutoPlay(S.panelLabel)) {
        _autoPlayCurrentAsset();
    }
}

/* ══════════════════════════════════════════════════════════
   ACTIONS
   ══════════════════════════════════════════════════════════ */
function closeMenu() {
    S.menuOpen = false;
    render();
}

/**
 * Open the browse panel for a given category.
 * @param {string} label  — e.g. "Characters", "Music"
 * @param {string} source — 'explore' | 'mystuff'
 */
async function openPanel(label, source = 'explore') {
    panelItems    = [];
    panelLoading  = true;
    panelSource   = source;

    // Track in panel nav
    if (_panelNav.section) {
        _panelNav.level    = 1;
        _panelNav.category = label;
    }

    S.panelOpen        = true;
    S.panelLabel       = label;
    S.menuOpen         = false;
    S.sortOption       = 'All';
    S.sortDropdownOpen = false;
    S.sortMenuOpen     = false;
    S.panelSearchMode  = false;
    S.panelSearchQuery = '';
    S.itemMenuOpenId   = null;
    S.selectedIndex    = -1;
    S.panelCategory    = 'All';
    render();

    // Load assets in background
    try {
        if (source === 'mystuff') {
            panelItems = await loadUserAssets(label);
        } else {
            panelItems = await loadGlobalAssets(label);
        }
    } catch (err) {
        console.warn(`Failed to load ${label}:`, err);
        panelItems = [];
    }

    panelLoading = false;
    render();

    // Generate thumbnails in the background ONLY for user-created assets that don't have one.
    // Stock assets use pre-rendered thumbnails from the thumbnails/ folder (loaded via _thumbHTML).
    const needsThumbs = panelItems.filter(it =>
        it.meta?.owner === 'user' && !it.meta?.thumbnail && !_thumbCache.has(it.id)
    );
    if (needsThumbs.length > 0) {
        generateThumbnailBatch(needsThumbs, (asset, dataURL) => {
            if (!asset.meta) asset.meta = {};
            asset.meta.thumbnail = dataURL;
            _thumbCache.set(asset.id, dataURL);
            // Update visible thumbnail in the panel
            const thumb = E.panelInner?.querySelector(`.panel-item[data-id="${asset.id}"] .pi-thumb`);
            if (thumb) {
                thumb.innerHTML = `<img src="${dataURL}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
            }
        }).then(() => disposeThumbnailRenderer());
    }
}

function closePanel() {
    S.panelOpen        = false;
    S.panelLabel       = '';
    S.panelSearchMode  = false;
    S.panelSearchQuery = '';
    S.sortDropdownOpen = false;
    S.sortMenuOpen     = false;
    S.itemMenuOpenId   = null;
    S.selectedIndex    = -1;
    panelItems         = [];
    panelSource        = '';
    _panelNav = { section: '', sectionLabel: '', level: 0, category: '' };

    // Keep the viewport content (preview or scene) as-is.
    // Whatever was loaded stays visible — the user can enjoy
    // a full-width view of their last selection. A new scene
    // only gets created when something else needs to take over.
    // If nothing was ever loaded, ensure we at least have the default scene.
    if (!S.previewAsset && !scene) {
        scene = new Scene3D(E.sceneContainer);
    }

    render();
}

/**
 * Navigate back from asset browser (level 1) to category picker (level 0).
 */
function panelBackToCategories() {
    _panelNav.level    = 0;
    _panelNav.category = '';
    panelItems         = [];
    panelSource        = '';
    panelLoading       = false;

    S.panelLabel       = _panelNav.sectionLabel;
    S.sortMenuOpen     = false;
    S.itemMenuOpenId   = null;
    S.panelSearchMode  = false;
    S.panelSearchQuery = '';
    S.selectedIndex    = -1;

    // Keep the viewport content — preview stays visible while
    // the user browses categories. It'll get replaced naturally
    // when they select a new item or enter a builder.

    render();
}

function openCreate(type) {
    // Enter "new" mode — darkened viewport with turquoise glow,
    // bottom nav shows "Create New {type}…"
    // The builder opens when the user submits a prompt or clicks the go button.
    closeMenu();
    S.createType    = type;
    S.isNew         = true;
    S.panelOpen     = false;
    S.builderMode   = false;
    render();
}

function toggleNew() {
    S.isNew      = !S.isNew;
    S.createType = S.isNew ? S.createType : null;
    render();
}

/* ══════════════════════════════════════════════════════════
   BRIDGE STACK  — unified builder navigation
   ══════════════════════════════════════════════════════════ */
let bridgeStack = null;   // initialised in init()

/**
 * Open any builder bridge.
 * @param {class}       BridgeClass — e.g. CharacterBridge
 * @param {Object|null} asset       — existing asset to edit, or null for new
 * @param {string}      label       — breadcrumb label (e.g. "Character")
 */
async function openBuilder(BridgeClass, asset, label) {
    // First push? Tear down existing viewport (holodeck scene or preview)
    if (bridgeStack.isEmpty) {
        if (scene) { scene.destroy(); scene = null; }
        destroyPreview();
    }

    S.builderMode      = true;
    S.panelOpen        = true;
    S.panelLabel       = asset ? `Edit ${label}` : `New ${label}`;
    S.menuOpen         = false;
    S.sortMenuOpen     = false;
    S.itemMenuOpenId   = null;
    S.panelSearchMode  = false;
    S.panelSearchQuery = '';
    render();

    await bridgeStack.push(BridgeClass, asset, label);
}

/**
 * Called by BridgeStack whenever the stack changes (push, pop, etc.).
 */
function onStackChange({ depth, label, isEmpty, savedAsset }) {
    if (isEmpty) {
        S.builderMode = false;

        if (savedAsset) {
            S.lastSavedAsset = savedAsset;
        }

        // If we came from a browse panel, restore it instead of going home
        if (_savedBrowseState) {
            const bs = _savedBrowseState;
            _savedBrowseState = null;

            // Restore panel nav to browse level
            _panelNav.level    = 1;
            _panelNav.category = bs.panelLabel;

            S.panelOpen      = true;
            S.panelLabel     = bs.panelLabel;
            S.sortOrder      = bs.sortOrder;

            // If we just saved a new copy (template duplicate), switch to "My X"
            // so the user lands on their newly created asset in the right view.
            const wasTemplateCopy = savedAsset && savedAsset.meta?.owner === 'user'
                && (savedAsset.meta?.templateId || bs.panelSource === 'explore');
            if (wasTemplateCopy) {
                // Land in "My <Type>" view. The dropdown renders "All" value as
                // "My <Type>" label when panelSource === 'mystuff', so set
                // panelCategory = 'All' to match.
                S.panelCategory = 'All';
                panelSource = 'mystuff';
                panelLoading = true;
                panelItems = [];
                render();

                // Async: reload user assets then select the saved one
                loadUserAssets(bs.panelLabel).then(items => {
                    panelItems = items;
                    panelLoading = false;

                    // Find the saved asset in the list and select it
                    const idx = items.findIndex(it => it.id === savedAsset.id);
                    S.selectedIndex = idx >= 0 ? idx : 0;
                    S.previewAsset = idx >= 0 ? items[idx] : (items[0] || null);

                    if (S.previewAsset) {
                        if (scene) { scene.destroy(); scene = null; }
                        showPreview(E.sceneContainer, S.previewAsset);
                    }
                    render();
                });
            } else {
                // Normal restore — same category, same items
                panelItems  = bs.panelItems;
                panelSource = bs.panelSource;
                panelLoading = false;
                S.panelCategory  = bs.panelCategory;

                // Use the saved asset (if just saved) as preview, else the previously selected one
                const previewTarget = savedAsset || bs.previewAsset;
                S.previewAsset = previewTarget;
                S.selectedIndex = bs.selectedIndex;

                // If we had a preview showing, restore it
                if (previewTarget) {
                    if (scene) { scene.destroy(); scene = null; }
                    showPreview(E.sceneContainer, previewTarget);
                } else {
                    scene = new Scene3D(E.sceneContainer);
                }

                render();
            }
        } else {
            // No saved browse state — close panel.
            // If the builder just saved an asset, show it as a preview
            // so the user sees their creation full-screen instead of a blank viewport.
            S.panelOpen = false;
            if (savedAsset) {
                S.previewAsset = savedAsset;
                if (scene) { scene.destroy(); scene = null; }
                showPreview(E.sceneContainer, savedAsset);
            } else if (!scene && !E.sceneContainer.querySelector('canvas')) {
                // Nothing at all to show — fall back to the default scene
                scene = new Scene3D(E.sceneContainer);
            }
            render();
        }
    } else {
        // Stack still has bridges — update title bar
        S.panelLabel = label;
        if (savedAsset) {
            S.lastSavedAsset = savedAsset;
        }
    }
}

/* ══════════════════════════════════════════════════════════
   UI FADE ON VIEWPORT DRAG / SCROLL
   ══════════════════════════════════════════════════════════ */
let wheelTimer = null;

function isUiTarget(el) {
    return el.closest('[data-ui], button, nav, input, textarea');
}

function fadeOut() {
    S.uiVisible = false;
    render();
    _notifyChromeFade(true);
}
function fadeIn() {
    S.uiVisible = true;
    render();
    _notifyChromeFade(false);
}

/** Toggle fade on chrome elements that live outside #ui-elements:
 *  the hamburger (inside the iframe) and the feedback tab (outside, in
 *  the parent window — via postMessage). */
function _notifyChromeFade(faded) {
    if (E.hamburgerBtn) E.hamburgerBtn.classList.toggle('faded', faded);
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'holodeck-ui-fade', faded }, '*');
        }
    } catch (_) { /* cross-origin or no parent — ignore */ }
}

function initUiFade() {
    const vp = E.viewport;

    vp.addEventListener('pointerdown', (e) => {
        if (S.isNew) return;                      // don't fade during "new" overlay
        if (isUiTarget(e.target)) return;         // button/input clicks don't fade
        fadeOut();
    }, true);

    window.addEventListener('pointerup', () => {
        if (!S.uiVisible) fadeIn();
    }, true);

    vp.addEventListener('wheel', (e) => {
        if (S.isNew) return;
        if (isUiTarget(e.target)) return;
        fadeOut();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(fadeIn, 300);
    }, true);
}

/* ── ESC key: close menu → panel → new mode (in that priority order) ── */
function initKeyboard() {
    window.addEventListener('keydown', (e) => {
        // ── Arrow key navigation in browse panel ──
        if (S.panelOpen && !S.builderMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const items = sortedItems(panelItems);
            if (items.length === 0) return;
            let idx = S.selectedIndex;
            if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
            else                       idx = Math.max(idx - 1, 0);
            selectAsset(idx, items);
            return;
        }

        // ── Spacebar play/stop in browse mode ──
        if (e.key === ' ' && !S.builderMode && !S.isNew && S.previewAsset
            && !e.target.closest('input, textarea, select')) {
            e.preventDefault();
            E.playBtn.click();
            return;
        }

        if (e.key !== 'Escape') return;
        const aboutEl = document.getElementById('about-overlay');
        if (aboutEl && aboutEl.style.display !== 'none') {
            aboutEl.style.display = 'none'; return;
        }
        if (S.menuOpen) {
            closeMenu();
        } else if (S.builderMode && bridgeStack && !bridgeStack.isEmpty) {
            bridgeStack.popAll();
        } else if (S.panelOpen && _panelNav.level >= 1) {
            panelBackToCategories();
        } else if (S.panelOpen) {
            closePanel();
        } else if (S.isNew) {
            S.isNew = false; S.createType = null; render();
        }
    });
}

/* ══════════════════════════════════════════════════════════
   PLAY / STOP BUTTON STATE
   ══════════════════════════════════════════════════════════ */
function _setPlayBtnState(isSpeaking) {
    if (!E.playBtn) return;
    E.playBtn.innerHTML = isSpeaking ? ICON.stop : ICON.play;
    E.playBtn.classList.toggle('is-speaking', isSpeaking);
    // Reset button hides while the viewport is actively auto-rotating
    // (so the reset action doesn't clash visually with a moving camera).
    if (E.resetBtn) {
        const bridgePlaying  = S.builderMode && bridgeStack.top()?.bridge?._isPlaying;
        const previewPlaying = !S.builderMode && isPreviewEnvironmentPlaying();
        E.resetBtn.classList.toggle('hidden', S.isNew || bridgePlaying || previewPlaying);
    }
}

/* ══════════════════════════════════════════════════════════
   SEND BUTTON STATE  (enable when prompt has text)
   ══════════════════════════════════════════════════════════ */
function updateSendBtn() {
    const hasText = E.promptInput.value.trim().length > 0;
    E.sendBtn.disabled = !hasText;
    E.sendBtn.classList.toggle('has-text', hasText);
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
let scene;

function init() {
    E = {
        leftPanel:       document.getElementById('left-panel'),
        panelInner:      document.getElementById('panel-inner'),
        viewport:        document.getElementById('viewport'),
        sceneContainer:  document.getElementById('scene-container'),
        safeArea:        document.getElementById('safe-area'),
        newOverlay:      document.getElementById('new-overlay'),
        uiElements:      document.getElementById('ui-elements'),
        hamburgerBtn:    document.getElementById('hamburger-btn'),
        menuBackdrop:    document.getElementById('menu-backdrop'),
        menuDropdown:    document.getElementById('menu-dropdown'),
        resetBtn:        document.getElementById('reset-btn'),
        bottomGradient:  document.getElementById('bottom-gradient'),
        playWrap:        document.getElementById('play-wrap'),
        playBtn:         document.getElementById('play-btn'),
        titleRow:        document.getElementById('title-row'),
        titleThumb:      document.getElementById('title-thumb'),
        titleText:       document.getElementById('title-text'),
        elCount:         document.getElementById('el-count'),
        editBtn:         document.getElementById('edit-btn'),
        surpriseBtn:     document.getElementById('surprise-btn'),
        promptBox:       document.getElementById('prompt-box'),
        promptInput:     document.getElementById('prompt-input'),
        newBtn:          document.getElementById('new-btn'),
        sendBtn:         document.getElementById('send-btn'),
    };

    // ── Static button icons ─────────────────────
    E.hamburgerBtn.innerHTML = ICON.menu;
    E.resetBtn.innerHTML     = ICON.video;
    E.playBtn.innerHTML      = ICON.play;
    E.editBtn.innerHTML      = `${ICON.pencil}<span>Edit</span>`;
    E.surpriseBtn.innerHTML  = `${ICON.dice}<span>Surprise me!</span>`;
    E.sendBtn.innerHTML      = ICON.send;

    // ── Three.js scene ──────────────────────────
    scene = new Scene3D(E.sceneContainer);

    // ── Bridge stack ────────────────────────────
    bridgeStack = new BridgeStack(E.sceneContainer, E.panelInner, {
        onStackChange,
    });

    // ── Button events ───────────────────────────
    E.hamburgerBtn.addEventListener('click', () => {
        S.menuOpen = !S.menuOpen;
        render();
    });

    E.menuBackdrop.addEventListener('click', closeMenu);

    E.resetBtn.addEventListener('click', () => {
        // Priority:
        //   1. active bridge (edit mode)
        //   2. preview renderer (while browsing an asset)
        //   3. Scene3D (index)
        if (S.builderMode) {
            const entry = bridgeStack.top();
            if (entry?.bridge?.resetView) entry.bridge.resetView();
        } else if (S.previewAsset) {
            previewResetView();
        } else {
            scene?.resetView();
        }
    });

    E.newOverlay.addEventListener('click', () => {
        S.isNew      = false;
        S.createType = null;
        render();
    });

    E.newBtn.addEventListener('click', toggleNew);

    E.promptInput.addEventListener('input', updateSendBtn);

    E.sendBtn.addEventListener('click', () => {
        if (!E.promptInput.value.trim()) return;
        // Placeholder: just clear for now
        E.promptInput.value = '';
        updateSendBtn();
    });

    E.playBtn.addEventListener('click', () => {
        if (S.builderMode) {
            // Edit view — delegate to the active bridge's play/stop
            const entry = bridgeStack.top();
            if (entry?.bridge) {
                const b = entry.bridge;
                if (b._isSpeaking || b._isPlaying) {
                    if (b.stopPlayback) b.stopPlayback();
                    else if (b.stop) b.stop();
                    _setPlayBtnState(false);
                } else {
                    if (b.play) b.play();
                    _setPlayBtnState(true);
                    // Listen for speak end to reset button
                    if (b._voiceEngine) {
                        const prevCb = b._voiceEngine.onSpeakEnd;
                        b._voiceEngine.onSpeakEnd = () => {
                            if (prevCb) prevCb();
                            _setPlayBtnState(false);
                        };
                    }
                }
            }
        } else if (S.previewAsset) {
            // Browse view — toggle play/stop
            if (S.previewAsset.type === 'music') {
                // Music toggle
                if (isPreviewMusicPlaying()) {
                    previewStopMusic();
                    _setPlayBtnState(false);
                } else {
                    previewPlayMusic(S.previewAsset);
                    _setPlayBtnState(true);
                }
            } else if (S.previewAsset.type === 'environment') {
                // Environment toggle: rotation on/off (later: +music/effects)
                if (isPreviewEnvironmentPlaying()) {
                    previewStopEnvironment();
                    _setPlayBtnState(false);
                } else {
                    previewPlayEnvironment();
                    _setPlayBtnState(true);
                }
            } else if (isPreviewSpeaking()) {
                previewStopVoice();
            } else {
                const assetState = S.previewAsset.payload?.state || S.previewAsset.state || {};
                const speakText = (S.previewAsset.type === 'voice' && assetState.previewText)
                    ? assetState.previewText
                    : (S.previewAsset.payload?.catchphrase || assetState.greeting || "Look at me, I'm a character.");
                previewSpeak(speakText);
            }
        }
    });

    // Update play button visual when speaking state changes
    setOnSpeakStateChange((isSpeaking) => _setPlayBtnState(isSpeaking));

    // Bridges can dispatch this event to sync the global play button
    // state when their own _isPlaying flag flips (e.g. user drags the
    // env viewport and auto-rotate stops).
    document.addEventListener('bridge-play-state', (e) => {
        _setPlayBtnState(!!e.detail?.playing);
    });

    E.editBtn.addEventListener('click', () => {
        // Index-page Edit is reserved for full simulations later.
        // Until then, only act when actively previewing an asset
        // in the browse panel.
        if (!S.panelOpen || !S.previewAsset) return;
        const asset = S.previewAsset;
        if (asset) {
            const label = TYPE_TO_LABEL[asset.type] || 'Character';
            const BridgeClass = BRIDGE_MAP[label];
            if (BridgeClass) {
                // Save browse state if panel is open so we can return to it
                if (S.panelOpen && panelItems.length > 0) {
                    _savedBrowseState = {
                        panelLabel: S.panelLabel,
                        panelSource: panelSource,
                        panelItems: [...panelItems],
                        selectedIndex: S.selectedIndex,
                        previewAsset: S.previewAsset,
                        sortOrder: S.sortOrder,
                        panelCategory: S.panelCategory,
                    };
                }

                // Template assets → duplicate to user storage first
                const isTemplate = panelSource === 'explore' || asset.meta?.owner !== 'user';
                const editAsset = isTemplate ? _duplicateAssetForEdit(asset) : asset;
                openBuilder(BridgeClass, editAsset, label);
            }
        }
    });

    E.surpriseBtn.addEventListener('click', async () => {
        // Builder mode — surprise the active bridge (randomise everything)
        if (S.builderMode) {
            const entry = bridgeStack.top();
            if (entry?.bridge?.surpriseAll) entry.bridge.surpriseAll();
            return;
        }

        // "New" mode — pick a random character template and show it
        try {
            const chars = await loadGlobalAssets('Characters');
            if (chars.length === 0) return;
            const pick = chars[Math.floor(Math.random() * chars.length)];

            // Open the browse panel to Characters and select it
            panelItems   = chars;
            panelSource  = 'explore';
            panelLoading = false;

            S.panelOpen        = true;
            S.panelLabel       = 'Characters';
            S.menuOpen         = false;
            S.sortMenuOpen     = false;
            S.itemMenuOpenId   = null;
            S.panelSearchMode  = false;
            S.panelSearchQuery = '';
            S.panelCategory    = 'All Characters';

            const idx = chars.indexOf(pick);
            selectAsset(idx >= 0 ? idx : 0, sortedItems(chars));
        } catch (e) {
            console.warn('[Surprise] Failed:', e.message);
        }
    });

    // ── About modal ─────────────────────────────
    const aboutOverlay = document.getElementById('about-overlay');
    const aboutCloseBtn = document.getElementById('about-close-btn');
    function closeAbout() { aboutOverlay.style.display = 'none'; }
    aboutCloseBtn.addEventListener('click', closeAbout);
    aboutOverlay.addEventListener('click', (e) => {
        if (e.target === aboutOverlay) closeAbout();
    });

    // ── Settings modal ──────────────────────────
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    settingsCloseBtn.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) closeSettings();
    });

    // ── UI fade + keyboard ───────────────────────
    initUiFade();
    initKeyboard();

    // ── Initial render ──────────────────────────
    render();
}

/* ══════════════════════════════════════════════════════════
   FEEDBACK CONTEXT  — exposes current state to the parent
   frame so the feedback tab can capture what the user is
   looking at when they submit a note.
   ══════════════════════════════════════════════════════════ */
window.__getHolodeckContext = () => {
    const parts = [];

    // Section / mode
    if (S.builderMode) {
        // In a builder
        const asset = S.previewAsset || S.lastSavedAsset;
        const name  = asset?.name || 'Untitled';
        const type  = asset?.type || '';
        const label = TYPE_TO_LABEL[type] || type || 'Unknown';
        parts.push(`${label} Builder`);
        parts.push(`Editing "${name}"`);
    } else if (S.panelOpen && _panelNav.section) {
        // Browsing a section
        const section = _panelNav.sectionLabel || _panelNav.section;
        parts.push(section);
        if (_panelNav.category) parts.push(_panelNav.category);
        if (S.panelCategory && S.panelCategory !== 'All') {
            parts.push(S.panelCategory);
        }
        if (S.previewAsset) {
            parts.push(`Viewing "${S.previewAsset.name || 'Untitled'}"`);
        }
    } else if (S.isNew) {
        parts.push('Create New');
        if (S.createType) parts.push(S.createType);
    } else {
        parts.push('Explore (Home)');
    }

    return parts.join(' > ');
};

document.addEventListener('DOMContentLoaded', init);
