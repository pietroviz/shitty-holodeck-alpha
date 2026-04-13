import { VOICE_PRESETS, CHARACTER_MANIFEST, DEFAULT_CHARACTER_ID } from './config.js';
import { parsePrompt } from './prompt.js';
import { dbSave, dbGetAll, dbGet, dbDelete, createAsset, seedCharacters, saveCharacterToFile } from './db.js';
import { renderGallery, captureThumbnail } from './gallery.js';

// ── Default character state (for "new") ─────────────────
const DEFAULT_STATE = {
    heightPreset: 'medium', widthPreset: 'moderate',
    headHeightPreset: 'medium', headWidthPreset: 'moderate',
    faceHeightPreset: 'medium', faceWidthPreset: 'moderate',
    headShape: 'roundedBox', bodyShape: 'roundedBox', facePlacement: 'mid',
    scalpColor: '#8b2020', skinColor: '#ffcc88',
    torsoColor: '#7b4daa', bottomColor: '#3a2870',
    eyeIrisColor: null, eyePupilSize: null, eyeIrisSize: null,
    eyeShape: 'circle', lipColor: null, lipThickness: null,
    hairStyle: 'none', hairColor: '#4a3728',
    hatStyle: 'none', hatColor: '#333333',
    facialHairStyle: 'none', facialHairColor: '#4a3728',
    glassesStyle: 'none', glassesColor: '#333333',
};

// ── Module-level state ──────────────────────────────────
let currentAsset = null;       // The active asset being edited/viewed
let preEditSnapshot = null;    // Snapshot for Cancel recovery
let appState = 'editing';      // 'closed' | 'browse' | 'editing'
let isCreateMode = false;      // "New" toggle — create vs modify
let _character = null;
let _renderer = null;
let _scene = null;
let _camera = null;

/**
 * Sets up UI event handlers for all tabs, controls, and the bottom bar.
 */
export async function initUI(character, getAnimationManager, getSkeletonHelper, voiceEngine, renderer, scene, camera) {
    _character = character;
    _renderer = renderer;
    _scene = scene;
    _camera = camera;

    // ── Body Tab ──────────────────────────────────────
    document.getElementById('scalp-color').addEventListener('input', (e) => character.setScalpColor(e.target.value));
    document.getElementById('skin-color').addEventListener('input', (e) => character.setSkinColor(e.target.value));
    document.getElementById('torso-color').addEventListener('input', (e) => character.setTorsoColor(e.target.value));
    document.getElementById('bottom-color').addEventListener('input', (e) => character.setBottomColor(e.target.value));

    setupToggle('body-shape-toggle', (v) => character.setBodyShape(v));
    setupToggle('height-toggle', (v) => character.setHeightPreset(v));
    setupToggle('width-toggle', (v) => character.setWidthPreset(v));

    document.getElementById('show-skeleton').addEventListener('change', (e) => {
        const helper = getSkeletonHelper();
        if (helper) helper.visible = e.target.checked;
    });

    buildAnimationDropdown(getAnimationManager);

    // ── Head Tab ──────────────────────────────────────
    setupToggle('head-shape-toggle', (v) => character.setHeadShape(v));
    setupToggle('head-height-toggle', (v) => character.setHeadHeightPreset(v));
    setupToggle('head-width-toggle', (v) => character.setHeadWidthPreset(v));
    setupToggle('face-height-toggle', (v) => character.setFaceHeightPreset(v));
    setupToggle('face-width-toggle', (v) => character.setFaceWidthPreset(v));
    setupToggle('face-placement-toggle', (v) => character.setFacePlacement(v));
    setupHeadTab(character);

    // ── Style Tab ────────────────────────────────────
    setupStyleTab(character);

    // ── Panel Tabs ────────────────────────────────────
    setupTabs();

    // ── File Tab ──────────────────────────────────────
    setupFileTab();

    // ── Voice Tab ─────────────────────────────────────
    setupVoiceTab(voiceEngine);

    // ── Bottom Bar ────────────────────────────────────
    setupBottomBar(character, voiceEngine, getAnimationManager);

    // ── Panel Header & State Machine ─────────────────
    setupPanelHeader(character);

    // Seed bundled characters into DB if not already present
    await seedCharacters(CHARACTER_MANIFEST);

    // Load saved character — prefer default, else most recent
    const savedAssets = await dbGetAll();
    if (savedAssets.length > 0) {
        const defaultChar = DEFAULT_CHARACTER_ID ? savedAssets.find(a => a.id === DEFAULT_CHARACTER_ID) : null;
        currentAsset = defaultChar || savedAssets[0];
        character.setState(currentAsset.state);
        syncUIToCharacter(character);
    }
    setState('closed');

    // Generate missing thumbnails after first render
    generateMissingThumbnails(savedAssets, character, renderer);
}

// ══════════════════════════════════════════════════════════
// STATE MACHINE: closed / browse / editing
// ══════════════════════════════════════════════════════════

function setState(newState) {
    appState = newState;
    document.body.classList.remove('state-closed', 'state-browse', 'state-editing', 'state-search');
    document.body.classList.add(`state-${newState}`);

    const titleEl = document.getElementById('panel-title');

    if (newState === 'browse') {
        refreshGallery();
        if (titleEl) titleEl.textContent = 'Browse';
    }

    if (newState === 'search') {
        refreshGallery();
        if (titleEl) titleEl.textContent = 'Search';
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }
    }

    if (newState === 'editing') {
        const nameInput = document.getElementById('character-name');
        nameInput.value = currentAsset?.name || 'Untitled Character';
        syncFileTabToAsset();
    }

    updateItemNameRow();
}

function updateItemNameRow() {
    const nameEl = document.getElementById('item-name-display');
    const thumbEl = document.getElementById('item-thumb');
    if (!nameEl) return;
    nameEl.textContent = currentAsset?.name || 'No character loaded';
    if (thumbEl) {
        thumbEl.src = currentAsset?.meta?.thumbnail || '';
    }
}

async function generateMissingThumbnails(assets, character, renderer, forceAll = false) {
    const needThumbs = forceAll
        ? assets.filter(a => a.state)
        : assets.filter(a => !a.meta?.thumbnail && a.state);
    if (needThumbs.length === 0) return;

    const originalAsset = currentAsset;

    for (const asset of needThumbs) {
        character.setState(asset.state);
        // Wait two frames for render to complete
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const thumb = captureThumbnail(renderer, _scene, _camera);
        asset.meta = asset.meta || {};
        asset.meta.thumbnail = thumb;
        await dbSave(asset);
    }

    // Restore the original character
    if (originalAsset) {
        character.setState(originalAsset.state);
    }
    updateItemNameRow();
}

let activeCategory = 'all';

async function refreshGallery(filter) {
    const container = document.getElementById('gallery-container');
    const categorySelect = document.getElementById('gallery-category-select');

    // Build category dropdown from all assets
    const allAssets = await dbGetAll();
    const tagCounts = {};
    for (const a of allAssets) {
        for (const t of (a.tags || [])) {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
    }
    if (categorySelect) {
        const prev = categorySelect.value;
        categorySelect.innerHTML = `<option value="all">All Characters (${allAssets.length})</option>`;
        for (const [tag, cnt] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.textContent = `${tag} (${cnt})`;
            categorySelect.appendChild(opt);
        }
        categorySelect.value = prev || 'all';
        activeCategory = categorySelect.value;
    }

    // Combine category + search filter
    const categoryFilter = activeCategory !== 'all' ? activeCategory : null;

    const count = await renderGallery(container, {
        activeId: currentAsset?.id || null,
        filter: filter || null,
        categoryFilter,
        onSelect: (asset) => {
            // Click card = preview load (stay in browse)
            currentAsset = asset;
            _character.setState(asset.state);
            syncUIToCharacter(_character);
            updateItemNameRow();
            refreshGallery(); // re-render to update active highlight
        },
        onEdit: (asset) => {
            // Click edit button = enter editing mode
            currentAsset = asset;
            _character.setState(asset.state);
            syncUIToCharacter(_character);
            preEditSnapshot = JSON.stringify(asset.state);
            setState('editing');
        },
        onDelete: async (id) => {
            await dbDelete(id);
            if (currentAsset?.id === id) {
                currentAsset = null;
                _character.setState({ ...DEFAULT_STATE });
                syncUIToCharacter(_character);
            }
            refreshGallery();
        },
    });

    // Update title with count
    const titleEl = document.getElementById('panel-title');
    const prefix = appState === 'search' ? 'Search' : 'Browse';
    titleEl.textContent = count > 0 ? `${prefix} (${count})` : prefix;
}

async function saveCurrentAsset() {
    if (!_character || !_renderer) return;

    const state = _character.getState();
    const name = document.getElementById('file-name').value.trim() || 'Untitled Character';
    const description = document.getElementById('file-desc').value.trim();
    const tags = document.getElementById('file-tags').value
        .split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const thumbnail = captureThumbnail(_renderer, _scene, _camera);

    if (currentAsset) {
        currentAsset.name = name;
        currentAsset.description = description;
        currentAsset.tags = tags;
        currentAsset.state = { ...state };
        currentAsset.meta.modified = Date.now();
        currentAsset.meta.thumbnail = thumbnail;
        await dbSave(currentAsset);
    } else {
        currentAsset = createAsset(state, name);
        currentAsset.description = description;
        currentAsset.tags = tags;
        currentAsset.meta.thumbnail = thumbnail;
        await dbSave(currentAsset);
    }

    // Also persist to assets/characters/ folder
    saveCharacterToFile(currentAsset);

    updateItemNameRow();
}

// ── File Tab ─────────────────────────────────────────────

function setupFileTab() {
    const fileNameInput = document.getElementById('file-name');
    const fileDescInput = document.getElementById('file-desc');
    const fileTagsInput = document.getElementById('file-tags');
    const headerNameInput = document.getElementById('character-name');

    function updateCharCounts() {
        document.getElementById('file-name-count').textContent = fileNameInput.value.length;
        document.getElementById('file-desc-count').textContent = fileDescInput.value.length;
        document.getElementById('file-tags-count').textContent = fileTagsInput.value.length;
    }

    // Sync file name → header name
    fileNameInput.addEventListener('input', () => {
        headerNameInput.value = fileNameInput.value;
        updateCharCounts();
    });

    // Sync header name → file name
    headerNameInput.addEventListener('input', () => {
        fileNameInput.value = headerNameInput.value;
        updateCharCounts();
    });

    fileDescInput.addEventListener('input', updateCharCounts);
    fileTagsInput.addEventListener('input', updateCharCounts);
}

function syncFileTabToAsset() {
    const fileNameInput = document.getElementById('file-name');
    const fileDescInput = document.getElementById('file-desc');
    const fileTagsInput = document.getElementById('file-tags');

    fileNameInput.value = currentAsset?.name || 'Untitled Character';
    fileDescInput.value = currentAsset?.description || '';
    fileTagsInput.value = (currentAsset?.tags || []).join(', ');

    document.getElementById('file-name-count').textContent = fileNameInput.value.length;
    document.getElementById('file-desc-count').textContent = fileDescInput.value.length;
    document.getElementById('file-tags-count').textContent = fileTagsInput.value.length;
}

// ── Panel Header Wiring ──────────────────────────────────

function setupPanelHeader(character) {
    const nameInput = document.getElementById('character-name');

    // ── Open panel FAB / hamburger menu ──────────────
    const stageMenu = document.getElementById('stage-hamburger-menu');

    document.getElementById('open-panel-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        stageMenu.classList.toggle('open');
    });

    document.getElementById('stage-menu-browse').addEventListener('click', () => {
        stageMenu.classList.remove('open');
        setState('browse');
    });

    document.getElementById('stage-menu-new').addEventListener('click', () => {
        stageMenu.classList.remove('open');
        currentAsset = null;
        character.setState({ ...DEFAULT_STATE });
        syncUIToCharacter(character);
        preEditSnapshot = JSON.stringify(DEFAULT_STATE);
        setState('editing');
    });

    document.getElementById('stage-menu-duplicate').addEventListener('click', async () => {
        stageMenu.classList.remove('open');
        if (!currentAsset) return;
        const state = character.getState();
        const name = (currentAsset.name || 'Untitled') + ' Copy';
        currentAsset = createAsset(state, name);
        if (_renderer) currentAsset.meta.thumbnail = captureThumbnail(_renderer, _scene, _camera);
        await dbSave(currentAsset);
        preEditSnapshot = JSON.stringify(state);
        setState('editing');
    });

    document.getElementById('stage-menu-export').addEventListener('click', () => {
        stageMenu.classList.remove('open');
        const state = character.getState();
        const name = currentAsset?.name || 'character';
        const blob = new Blob([JSON.stringify({ name, state }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('stage-menu-import').addEventListener('click', () => {
        stageMenu.classList.remove('open');
        document.getElementById('import-file-input').click();
    });

    document.getElementById('stage-menu-delete').addEventListener('click', async () => {
        stageMenu.classList.remove('open');
        if (currentAsset && confirm(`Delete "${currentAsset.name}"?`)) {
            await dbDelete(currentAsset.id);
            currentAsset = null;
            character.setState({ ...DEFAULT_STATE });
            syncUIToCharacter(character);
            updateItemNameRow();
        }
    });

    // ── Cancel (browse/search) → close or go to browse
    document.getElementById('btn-cancel-browse').addEventListener('click', () => {
        if (appState === 'search') {
            setState('browse');
        } else {
            setState('closed');
        }
    });

    // ── Cancel (editing) → restore snapshot, close panel
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        if (preEditSnapshot) {
            const snap = JSON.parse(preEditSnapshot);
            character.setState(snap);
            syncUIToCharacter(character);
            if (currentAsset) {
                currentAsset.state = snap;
            }
            preEditSnapshot = null;
        }
        setState('closed');
    });

    // ── Done (editing) → save, close panel ───────────
    document.getElementById('btn-done').addEventListener('click', async () => {
        await saveCurrentAsset();
        preEditSnapshot = null;
        setState('closed');
    });

    // ── Import file handler ──────────────────────────
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.state) {
                    character.setState(data.state);
                    syncUIToCharacter(character);
                    currentAsset = createAsset(data.state, data.name || 'Imported Character');
                    if (_renderer) currentAsset.meta.thumbnail = captureThumbnail(_renderer, _scene, _camera);
                    await dbSave(currentAsset);
                    preEditSnapshot = JSON.stringify(data.state);
                    setState('editing');
                }
            } catch (err) {
                console.error('[Import] Failed to parse file:', err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // ── Edit menu ────────────────────────────────────
    const editMenuBtn = document.getElementById('btn-menu-edit');
    const editMenu = document.getElementById('edit-menu');

    editMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editMenu.classList.toggle('open');
    });

    document.getElementById('menu-duplicate').addEventListener('click', async () => {
        editMenu.classList.remove('open');
        await saveCurrentAsset();
        const state = character.getState();
        const name = (nameInput.value.trim() || 'Untitled') + ' Copy';
        currentAsset = createAsset(state, name);
        if (_renderer) currentAsset.meta.thumbnail = captureThumbnail(_renderer, _scene, _camera);
        await dbSave(currentAsset);
        nameInput.value = name;
        preEditSnapshot = JSON.stringify(state);
    });

    document.getElementById('menu-export').addEventListener('click', () => {
        editMenu.classList.remove('open');
        const state = character.getState();
        const name = nameInput.value.trim() || 'character';
        const blob = new Blob([JSON.stringify({ name, state }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('menu-delete').addEventListener('click', async () => {
        editMenu.classList.remove('open');
        if (currentAsset && confirm(`Delete "${currentAsset.name}"?`)) {
            await dbDelete(currentAsset.id);
            currentAsset = null;
            character.setState({ ...DEFAULT_STATE });
            syncUIToCharacter(character);
            preEditSnapshot = null;
            setState('browse');
        }
    });

    // ── Edit button on stage (item-name-row) ─────────
    document.getElementById('btn-edit-stage').addEventListener('click', () => {
        if (!currentAsset) {
            // Create an asset from the current character state
            currentAsset = createAsset(character.getState(), 'Untitled Character');
        }
        preEditSnapshot = JSON.stringify(currentAsset.state || character.getState());
        setState('editing');
    });

    // ── Close all menus on outside click ─────────────
    document.addEventListener('click', () => {
        editMenu.classList.remove('open');
        stageMenu.classList.remove('open');
    });

    // ── Search button → enter search state ───────────
    document.getElementById('btn-search').addEventListener('click', () => {
        setState('search');
    });

    // ── Search input → filter gallery live ─────────
    document.getElementById('search-input').addEventListener('input', (e) => {
        refreshGallery(e.target.value);
    });

    // ── Escape in search → back to browse ──────────
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            setState('browse');
        }
    });

    // ── Category dropdown → filter gallery ──────────
    document.getElementById('gallery-category-select').addEventListener('change', (e) => {
        activeCategory = e.target.value;
        refreshGallery();
    });

    // ── Arrow key navigation in gallery ─────────────
    document.addEventListener('keydown', (e) => {
        if (appState !== 'browse' && appState !== 'search') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();

        const cards = Array.from(document.querySelectorAll('#gallery-container .gallery-card'));
        if (cards.length === 0) return;

        const activeIdx = cards.findIndex(c => c.classList.contains('active'));
        let nextIdx;
        if (e.key === 'ArrowDown') {
            nextIdx = activeIdx < cards.length - 1 ? activeIdx + 1 : 0;
        } else {
            nextIdx = activeIdx > 0 ? activeIdx - 1 : cards.length - 1;
        }
        cards[nextIdx].click();
        cards[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

// ── Sync UI Controls to Character State ──────────────────

function syncUIToCharacter(character) {
    const s = character.getState();

    setToggleValue('body-shape-toggle', s.bodyShape);
    setToggleValue('height-toggle', s.heightPreset);
    setToggleValue('width-toggle', s.widthPreset);
    setToggleValue('head-shape-toggle', s.headShape);
    setToggleValue('head-height-toggle', s.headHeightPreset);
    setToggleValue('head-width-toggle', s.headWidthPreset);
    setToggleValue('face-height-toggle', s.faceHeightPreset);
    setToggleValue('face-width-toggle', s.faceWidthPreset);
    setToggleValue('face-placement-toggle', s.facePlacement);
    setToggleValue('eye-shape-toggle', s.eyeShape);
    setToggleValue('hair-style-toggle', s.hairStyle);
    setToggleValue('hat-style-toggle', s.hatStyle);
    setToggleValue('glasses-style-toggle', s.glassesStyle);
    setToggleValue('facial-hair-style-toggle', s.facialHairStyle);

    setColorPicker('scalp-color', s.scalpColor);
    setColorPicker('skin-color', s.skinColor);
    setColorPicker('torso-color', s.torsoColor);
    setColorPicker('bottom-color', s.bottomColor);
    if (s.eyeIrisColor) setColorPicker('eye-iris-color', s.eyeIrisColor);
    if (s.lipColor) setColorPicker('mouth-lip-color', s.lipColor);
    setColorPicker('hair-color', s.hairColor);
    setColorPicker('hat-color', s.hatColor);
    setColorPicker('glasses-color', s.glassesColor);
    setColorPicker('facial-hair-color', s.facialHairColor);

    if (s.eyePupilSize !== null) setSlider('eye-pupil-size', s.eyePupilSize);
    if (s.eyeIrisSize !== null) setSlider('eye-iris-size', s.eyeIrisSize);
    if (s.lipThickness !== null) setSlider('mouth-lip-thickness', s.lipThickness);
}

// ── Helpers ─────────────────────────────────────────────────

function setupToggle(containerId, onChange) {
    const container = document.getElementById(containerId);
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
        btn.addEventListener('click', () => {
            for (const b of buttons) b.classList.remove('active');
            btn.classList.add('active');
            onChange(btn.dataset.value);
        });
    }
}

function buildAnimationDropdown(getAnimationManager) {
    const select = document.getElementById('anim-select');
    const animationManager = getAnimationManager();
    const names = animationManager.getAnimationNames();
    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    select.addEventListener('change', () => {
        const mgr = getAnimationManager();
        const value = select.value;
        if (value === '') { mgr.stop(); } else { mgr.play(value); }
    });
}

function updateSliderDisplay(slider) {
    const display = document.querySelector(`.slider-val[data-for="${slider.id}"]`);
    if (display) display.textContent = slider.value;
}

// ── Panel Tabs ─────────────────────────────────────────────

function setupTabs() {
    const tabs = document.querySelectorAll('.panel-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.tab-content[data-tab="${target}"]`).classList.add('active');
        });
    });
}

// ── Head Tab (eyes + mouth) ─────────────────────────────────

function setupHeadTab(character) {
    setupToggle('eye-shape-toggle', (v) => character.setEyeShape(v));

    const irisColorPicker = document.getElementById('eye-iris-color');
    if (irisColorPicker) {
        irisColorPicker.addEventListener('input', (e) => character.setEyeIrisColor(e.target.value));
    }

    const pupilSizeSlider = document.getElementById('eye-pupil-size');
    if (pupilSizeSlider) {
        pupilSizeSlider.addEventListener('input', () => {
            updateSliderDisplay(pupilSizeSlider);
            character.setEyePupilSize(parseFloat(pupilSizeSlider.value));
        });
    }

    const irisSizeSlider = document.getElementById('eye-iris-size');
    if (irisSizeSlider) {
        irisSizeSlider.addEventListener('input', () => {
            updateSliderDisplay(irisSizeSlider);
            character.setEyeIrisSize(parseFloat(irisSizeSlider.value));
        });
    }

    const lipColorPicker = document.getElementById('mouth-lip-color');
    if (lipColorPicker) {
        lipColorPicker.addEventListener('input', (e) => character.setLipColor(e.target.value));
    }

    const lipThicknessSlider = document.getElementById('mouth-lip-thickness');
    if (lipThicknessSlider) {
        lipThicknessSlider.addEventListener('input', () => {
            updateSliderDisplay(lipThicknessSlider);
            character.setLipThickness(parseFloat(lipThicknessSlider.value));
        });
    }
}

// ── Style Tab (accessories) ──────────────────────────────────

function setupStyleTab(character) {
    setupToggle('hair-style-toggle', (v) => character.setHairStyle(v));
    const hairColorPicker = document.getElementById('hair-color');
    if (hairColorPicker) hairColorPicker.addEventListener('input', (e) => character.setHairColor(e.target.value));

    setupToggle('hat-style-toggle', (v) => character.setHatStyle(v));
    const hatColorPicker = document.getElementById('hat-color');
    if (hatColorPicker) hatColorPicker.addEventListener('input', (e) => character.setHatColor(e.target.value));

    setupToggle('glasses-style-toggle', (v) => character.setGlassesStyle(v));
    const glassesColorPicker = document.getElementById('glasses-color');
    if (glassesColorPicker) glassesColorPicker.addEventListener('input', (e) => character.setGlassesColor(e.target.value));

    setupToggle('facial-hair-style-toggle', (v) => character.setFacialHairStyle(v));
    const facialHairColorPicker = document.getElementById('facial-hair-color');
    if (facialHairColorPicker) facialHairColorPicker.addEventListener('input', (e) => character.setFacialHairColor(e.target.value));
}

// ── Voice Tab ──────────────────────────────────────────────

function setupVoiceTab(voiceEngine) {
    const presetsContainer = document.getElementById('voice-presets');

    const paramSliders = {
        speed: document.getElementById('vs-speed'),
        pitch: document.getElementById('vs-pitch'),
        amplitude: document.getElementById('vs-amplitude'),
        wordgap: document.getElementById('vs-wordgap'),
    };

    const effectSliders = {
        reverb: document.getElementById('vfx-reverb'),
        wobble: document.getElementById('vfx-wobble'),
        wobbleSpeed: document.getElementById('vfx-wobbleSpeed'),
        brightness: document.getElementById('vfx-brightness'),
        breathiness: document.getElementById('vfx-breathiness'),
        vocalFry: document.getElementById('vfx-vocalFry'),
        chorus: document.getElementById('vfx-chorus'),
    };

    const effectSetters = {
        reverb: 'setReverb', wobble: 'setWobble', wobbleSpeed: 'setWobbleSpeed',
        brightness: 'setBrightness', breathiness: 'setBreathiness',
        vocalFry: 'setVocalFry', chorus: 'setChorus',
    };

    function syncSlidersToPreset(preset) {
        if (paramSliders.speed) { paramSliders.speed.value = preset.speed; updateSliderDisplay(paramSliders.speed); }
        if (paramSliders.pitch) { paramSliders.pitch.value = preset.pitch; updateSliderDisplay(paramSliders.pitch); }
        if (paramSliders.amplitude) { paramSliders.amplitude.value = Math.min(150, preset.amplitude); updateSliderDisplay(paramSliders.amplitude); }
        if (paramSliders.wordgap) { paramSliders.wordgap.value = preset.wordgap; updateSliderDisplay(paramSliders.wordgap); }
        for (const [key, slider] of Object.entries(effectSliders)) {
            if (slider && preset[key] !== undefined) { slider.value = preset[key]; updateSliderDisplay(slider); }
        }
    }

    function deselectAllPresets() {
        presetsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    }

    let firstChip = true;
    for (const [key, preset] of Object.entries(VOICE_PRESETS)) {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = preset.label;
        chip.dataset.preset = key;
        if (firstChip) { chip.classList.add('active'); voiceEngine.setPreset(key); syncSlidersToPreset(preset); firstChip = false; }
        chip.addEventListener('click', () => { deselectAllPresets(); chip.classList.add('active'); voiceEngine.setPreset(key); syncSlidersToPreset(preset); });
        presetsContainer.appendChild(chip);
    }

    for (const [key, slider] of Object.entries(paramSliders)) {
        if (!slider) continue;
        slider.addEventListener('input', () => { updateSliderDisplay(slider); deselectAllPresets(); voiceEngine.voiceParams[key] = parseFloat(slider.value); });
    }

    for (const [key, slider] of Object.entries(effectSliders)) {
        if (!slider) continue;
        slider.addEventListener('input', () => {
            updateSliderDisplay(slider); deselectAllPresets();
            const setterName = effectSetters[key];
            if (voiceEngine.effectChain && voiceEngine.effectChain[setterName]) voiceEngine.effectChain[setterName](parseFloat(slider.value));
        });
    }

    const previewBtn = document.getElementById('voice-preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            if (!voiceEngine.isReady) return;
            if (voiceEngine.isSpeaking) { voiceEngine.stop(); return; }
            voiceEngine.speak('Hello! This is a preview of the current voice.');
        });
    }
}

// ── Bottom Bar (text input + mode toggle + speak/send) ─────

function setupBottomBar(character, voiceEngine, getAnimationManager) {
    const textInput = document.getElementById('voice-text');
    const speakBtn = document.getElementById('voice-speak-btn');
    const statusEl = document.getElementById('voice-status');
    const playIcon = document.getElementById('btn-icon-play');
    const sendIcon = document.getElementById('btn-icon-send');

    let inputMode = 'speak';

    const stopIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

    function showPlayIcon() { playIcon.classList.remove('hidden'); sendIcon.classList.add('hidden'); }
    function showSendIcon() { sendIcon.classList.remove('hidden'); playIcon.classList.add('hidden'); }

    function updateSpeakBtn(speaking) {
        if (speaking) {
            speakBtn.innerHTML = stopIconSvg;
            speakBtn.classList.add('speaking');
            speakBtn.classList.remove('prompt-mode');
            speakBtn.title = 'Stop';
        } else {
            speakBtn.classList.remove('speaking');
            if (inputMode === 'speak') {
                speakBtn.innerHTML = ''; speakBtn.appendChild(playIcon); speakBtn.appendChild(sendIcon);
                showPlayIcon(); speakBtn.classList.remove('prompt-mode'); speakBtn.title = 'Speak';
            } else {
                speakBtn.innerHTML = ''; speakBtn.appendChild(playIcon); speakBtn.appendChild(sendIcon);
                showSendIcon(); speakBtn.classList.add('prompt-mode'); speakBtn.title = 'Send';
            }
        }
    }

    // ── New toggle (create mode) ──────────────────────
    const newToggle = document.getElementById('btn-new-toggle');
    newToggle.addEventListener('click', () => {
        isCreateMode = !isCreateMode;
        newToggle.classList.toggle('active', isCreateMode);
        if (isCreateMode) {
            textInput.placeholder = 'Describe a new character...';
        } else {
            textInput.placeholder = inputMode === 'prompt' ? 'Describe what you want to change...' : 'Type something to speak...';
        }
    });

    const modeButtons = document.querySelectorAll('#input-mode-toggle .mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === inputMode) return;
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            inputMode = mode;
            if (mode === 'speak') {
                document.body.classList.remove('prompt-mode');
                textInput.placeholder = 'Type something to speak...';
                showPlayIcon(); speakBtn.classList.remove('prompt-mode'); speakBtn.title = 'Speak';
                // Reset create mode when switching to speak
                isCreateMode = false;
                newToggle.classList.remove('active');
            } else {
                document.body.classList.add('prompt-mode');
                textInput.placeholder = isCreateMode ? 'Describe a new character...' : 'Describe what you want to change...';
                showSendIcon(); speakBtn.classList.add('prompt-mode'); speakBtn.title = 'Send';
            }
        });
    });

    speakBtn.addEventListener('click', () => {
        if (inputMode === 'speak') { handleSpeak(); } else { handlePrompt(); }
    });

    function handleSpeak() {
        if (!voiceEngine.isReady) { statusEl.textContent = 'Voice engine still loading...'; statusEl.classList.remove('hidden'); return; }
        if (voiceEngine.isSpeaking) { voiceEngine.stop(); const mgr = getAnimationManager(); if (mgr) mgr.stop(); updateSpeakBtn(false); return; }
        const text = textInput.value.trim();
        if (!text) return;
        updateSpeakBtn(true);
        const animSelect = document.getElementById('anim-select');
        if (animSelect && animSelect.value) { const mgr = getAnimationManager(); if (mgr) mgr.play(animSelect.value); }
        voiceEngine.speak(text);
    }

    function getApiKey() { return sessionStorage.getItem('anthropic_api_key') || ''; }

    function promptForApiKey() {
        const key = prompt('Enter your Anthropic API key to enable AI prompts.\n\nThis is stored only for this browser session.');
        if (key && key.trim()) { sessionStorage.setItem('anthropic_api_key', key.trim()); return key.trim(); }
        return null;
    }

    async function handlePrompt() {
        const text = textInput.value.trim();
        if (!text) return;

        // If create-new mode, reset to defaults first
        const wasCreateMode = isCreateMode;
        if (wasCreateMode) {
            currentAsset = null;
            character.setState({ ...DEFAULT_STATE });
            syncUIToCharacter(character);
        }

        let apiKey = getApiKey();
        if (!apiKey) {
            apiKey = promptForApiKey();
            if (!apiKey) {
                const delta = parsePrompt(text);
                const keys = Object.keys(delta);
                if (keys.length > 0) { applyPromptDelta(delta, character); statusEl.textContent = `Applied ${keys.length} change${keys.length > 1 ? 's' : ''} (offline)`; }
                else { statusEl.textContent = 'No API key set. Using keyword matching only.'; }
                statusEl.classList.remove('hidden');
                setTimeout(() => statusEl.classList.add('hidden'), 3000);
                if (wasCreateMode) finalizeCreateMode(text);
                return;
            }
        }

        speakBtn.disabled = true;
        statusEl.textContent = wasCreateMode ? 'Creating new character...' : 'Thinking...';
        statusEl.classList.remove('hidden');

        try {
            const resp = await fetch('/api/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text, apiKey, createNew: wasCreateMode }),
            });
            const data = await resp.json();

            if (data.error) {
                if (data.error === 'no_api_key') {
                    sessionStorage.removeItem('anthropic_api_key');
                    statusEl.textContent = 'API key missing. Click send again to enter one.';
                } else if (data.error.includes?.('auth') || data.error.includes?.('key') || data.error.includes?.('401')) {
                    sessionStorage.removeItem('anthropic_api_key');
                    statusEl.textContent = 'Invalid API key. Click send again to re-enter.';
                } else {
                    console.warn('[Prompt] API error, using local parser:', data.error);
                    const delta = parsePrompt(text);
                    const keys = Object.keys(delta);
                    if (keys.length > 0) { applyPromptDelta(delta, character); statusEl.textContent = `Applied ${keys.length} change${keys.length > 1 ? 's' : ''} (offline)`; }
                    else { statusEl.textContent = 'API error: ' + data.error; }
                }
            } else if (data.delta) {
                const keys = Object.keys(data.delta);
                if (keys.length > 0) { applyPromptDelta(data.delta, character); statusEl.textContent = `Applied ${keys.length} change${keys.length > 1 ? 's' : ''}`; }
                else { statusEl.textContent = 'No changes detected from description.'; }
            }
        } catch (err) {
            console.warn('[Prompt] Fetch failed, using local parser:', err);
            const delta = parsePrompt(text);
            const keys = Object.keys(delta);
            if (keys.length > 0) { applyPromptDelta(delta, character); statusEl.textContent = `Applied ${keys.length} change${keys.length > 1 ? 's' : ''} (offline)`; }
            else { statusEl.textContent = 'Connection failed. Try keywords like "tall wizard with beard".'; }
        }

        // If was create mode, auto-save as new asset
        if (wasCreateMode) finalizeCreateMode(text);

        speakBtn.disabled = false;
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }

    async function finalizeCreateMode(promptText) {
        // Extract a name from the prompt (first few words)
        const words = promptText.split(/\s+/).slice(0, 4).join(' ');
        const name = words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'New Character';
        currentAsset = createAsset(character.getState(), name);
        if (_renderer) currentAsset.meta.thumbnail = captureThumbnail(_renderer, _scene, _camera);
        await dbSave(currentAsset);

        // Turn off create mode
        isCreateMode = false;
        newToggle.classList.remove('active');
        textInput.placeholder = 'Describe what you want to change...';
        updateItemNameRow();

        statusEl.textContent = `Created "${name}"`;
    }

    voiceEngine.onSpeakEnd = () => { updateSpeakBtn(false); };

    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); speakBtn.click(); }
    });

    if (!voiceEngine.isReady) {
        statusEl.textContent = 'Voice engine loading...';
        statusEl.classList.remove('hidden');
        const checkReady = setInterval(() => {
            if (voiceEngine.isReady) { statusEl.classList.add('hidden'); clearInterval(checkReady); }
        }, 500);
    }
}

// ── Prompt Application ──────────────────────────────────

function setToggleValue(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
}

function setColorPicker(id, hex) {
    const el = document.getElementById(id);
    if (el && hex) el.value = hex;
}

function setSlider(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    const valSpan = document.querySelector(`.slider-val[data-for="${id}"]`);
    if (valSpan) valSpan.textContent = val;
}

function applyPromptDelta(delta, character) {
    const APPLY_MAP = {
        heightPreset:      { set: v => character.setHeightPreset(v),      ui: v => setToggleValue('height-toggle', v) },
        widthPreset:       { set: v => character.setWidthPreset(v),       ui: v => setToggleValue('width-toggle', v) },
        bodyShape:         { set: v => character.setBodyShape(v),         ui: v => setToggleValue('body-shape-toggle', v) },
        headShape:         { set: v => character.setHeadShape(v),         ui: v => setToggleValue('head-shape-toggle', v) },
        headHeightPreset:  { set: v => character.setHeadHeightPreset(v),  ui: v => setToggleValue('head-height-toggle', v) },
        headWidthPreset:   { set: v => character.setHeadWidthPreset(v),   ui: v => setToggleValue('head-width-toggle', v) },
        faceHeightPreset:  { set: v => character.setFaceHeightPreset(v),  ui: v => setToggleValue('face-height-toggle', v) },
        faceWidthPreset:   { set: v => character.setFaceWidthPreset(v),   ui: v => setToggleValue('face-width-toggle', v) },
        facePlacement:     { set: v => character.setFacePlacement(v),     ui: v => setToggleValue('face-placement-toggle', v) },
        hairStyle:         { set: v => character.setHairStyle(v),         ui: v => setToggleValue('hair-style-toggle', v) },
        hatStyle:          { set: v => character.setHatStyle(v),          ui: v => setToggleValue('hat-style-toggle', v) },
        glassesStyle:      { set: v => character.setGlassesStyle(v),      ui: v => setToggleValue('glasses-style-toggle', v) },
        facialHairStyle:   { set: v => character.setFacialHairStyle(v),   ui: v => setToggleValue('facial-hair-style-toggle', v) },
        eyeShape:          { set: v => character.setEyeShape(v),          ui: v => setToggleValue('eye-shape-toggle', v) },
        scalpColor:        { set: v => character.setScalpColor(v),        ui: v => setColorPicker('scalp-color', v) },
        skinColor:         { set: v => character.setSkinColor(v),         ui: v => setColorPicker('skin-color', v) },
        torsoColor:        { set: v => character.setTorsoColor(v),        ui: v => setColorPicker('torso-color', v) },
        bottomColor:       { set: v => character.setBottomColor(v),       ui: v => setColorPicker('bottom-color', v) },
        hairColor:         { set: v => character.setHairColor(v),         ui: v => setColorPicker('hair-color', v) },
        hatColor:          { set: v => character.setHatColor(v),          ui: v => setColorPicker('hat-color', v) },
        glassesColor:      { set: v => character.setGlassesColor(v),      ui: v => setColorPicker('glasses-color', v) },
        facialHairColor:   { set: v => character.setFacialHairColor(v),   ui: v => setColorPicker('facial-hair-color', v) },
        lipColor:          { set: v => character.setLipColor(v),          ui: v => setColorPicker('mouth-lip-color', v) },
        eyeIrisColor:      { set: v => character.setEyeIrisColor(v),      ui: v => setColorPicker('eye-iris-color', v) },
        eyePupilSize:      { set: v => character.setEyePupilSize(v),      ui: v => setSlider('eye-pupil-size', v) },
        eyeIrisSize:       { set: v => character.setEyeIrisSize(v),       ui: v => setSlider('eye-iris-size', v) },
    };

    for (const [key, value] of Object.entries(delta)) {
        const handler = APPLY_MAP[key];
        if (handler) { handler.set(value); handler.ui(value); }
    }
}
