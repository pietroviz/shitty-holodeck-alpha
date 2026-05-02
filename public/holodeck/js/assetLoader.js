/**
 * assetLoader.js — Loads pre-generated global assets from /global_assets/
 * and user-created assets from IndexedDB.
 *
 * Global assets are JSON files in the global_assets/ folder.
 * User assets are stored in IndexedDB via db.js.
 */

import { dbGetAll } from './db.js?v=2';

// ─────────────────────────────────────────────────────────────────
//  CATEGORY → FOLDER MAPPING
// ─────────────────────────────────────────────────────────────────

const GLOBAL_CATEGORIES = {
    Characters:   { folder: 'characters',    hasManifest: true,  type: 'character' },
    Environments: { folder: 'environments',  hasManifest: true,  type: 'environment' },
    Music:        { folder: 'music',         hasManifest: true,  type: 'music' },
    '3D Objects': { folder: 'objects',       hasManifest: true,  type: 'prop' },
    '2D Images':  { folder: 'images',        hasManifest: false, type: 'asset' },
    Voices:       { folder: 'voices',        hasManifest: true,  type: 'voice' },
    Stories:      { folder: 'stories',       hasManifest: true,  type: 'story' },
    Simulations:  { folder: 'simulations',   hasManifest: true,  type: 'simulation' },
    Animations:   { folder: 'animations',    hasManifest: true,  type: 'animation' },
};

// Map "My Stuff" labels → IndexedDB store names
const USER_STORES = {
    Characters:   'characters',
    Environments: 'environments',
    Music:        'music',
    '3D Objects': 'objects',
    '2D Images':  'images',
    Voices:       'voices',
    Stories:      'stories',
    Simulations:  'simulations',
    Animations:   'animations',
};

const BASE_PATH = 'global_assets';

// ─────────────────────────────────────────────────────────────────
//  CACHES
// ─────────────────────────────────────────────────────────────────

const _globalCache = {};   // key: category label → array of assets
const _manifestCache = {}; // key: folder → manifest object

// ─────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Load global (pre-generated) assets for a given Explore category.
 * Results are cached after first load.
 * @param {string} category — e.g. "Characters", "Music", "3D Objects"
 * @returns {Promise<Array>} — array of asset objects with at minimum { id, name, type, tags }
 */
export async function loadGlobalAssets(category) {
    if (_globalCache[category]) return _globalCache[category];

    const cfg = GLOBAL_CATEGORIES[category];
    if (!cfg) return [];

    let assets = [];

    if (cfg.hasManifest) {
        assets = await _loadFromManifest(cfg.folder, cfg.subFilter);
    } else if (category === '2D Images') {
        // Images have sub-folders; load all in parallel
        const subfolders = ['man-made-props', 'natural-props', 'walls', 'textures'];
        const subResults = await Promise.all(
            subfolders.map(sub => _loadAllJsonInFolder(`${BASE_PATH}/images/${sub}`))
        );
        for (const items of subResults) assets.push(...items);
    }

    _globalCache[category] = assets;
    return assets;
}

/**
 * Load user-created assets from IndexedDB for a given My Stuff category.
 * @param {string} category — e.g. "Characters", "Music"
 * @returns {Promise<Array>}
 */
export async function loadUserAssets(category) {
    const store = USER_STORES[category];
    if (!store) return [];
    try {
        return await dbGetAll(store);
    } catch {
        return [];
    }
}

/**
 * Get a single global asset by loading its JSON file directly.
 * @param {string} path — relative path from project root, e.g. "global_assets/characters/char_aria.json"
 * @returns {Promise<Object|null>}
 */
export async function loadAssetFile(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Load assets from a manifest.json in the given folder.
 * Manifest structure: { categories: { key: { name, files: [...] } } }
 */
async function _loadFromManifest(folder, subFilter) {
    const manifestPath = `${BASE_PATH}/${folder}/manifest.json`;

    if (!_manifestCache[folder]) {
        try {
            const res = await fetch(manifestPath);
            if (!res.ok) return [];
            _manifestCache[folder] = await res.json();
        } catch {
            return [];
        }
    }

    const manifest = _manifestCache[folder];
    const assets = [];

    // Build flat list of all fetch promises across all categories (parallel)
    const fetchJobs = [];
    for (const [catKey, catData] of Object.entries(manifest.categories || {})) {
        if (subFilter && catKey !== subFilter) continue;
        const catFolder = `${BASE_PATH}/${folder}/${catKey}`;
        const catLabel = catData.name || catKey;
        for (const filename of (catData.files || [])) {
            fetchJobs.push(
                fetch(`${catFolder}/${filename}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(a => { if (a) a._category = catLabel; return a; })
                    .catch(() => null)
            );
        }
    }
    const results = await Promise.all(fetchJobs);
    for (const a of results) { if (a) assets.push(a); }

    return assets;
}

/**
 * Load all .json files in a flat folder (no manifest).
 * Lists files by fetching a directory — requires server to serve directory listings,
 * OR we pre-fetch known filenames. Since we can't list directories via fetch,
 * we load the folder contents via a bulk approach.
 */
async function _loadAllJsonInFolder(folderPath) {
    // Try loading a manifest first
    try {
        const res = await fetch(`${folderPath}/manifest.json`);
        if (res.ok) {
            const manifest = await res.json();
            const assets = [];
            // Manifest might have flat files array or categories
            if (manifest.files) {
                const results = await Promise.all(
                    manifest.files.map(f =>
                        fetch(`${folderPath}/${f}`).then(r => r.ok ? r.json() : null).catch(() => null)
                    )
                );
                return results.filter(Boolean);
            }
            if (manifest.categories) {
                const jobs = [];
                for (const cat of Object.values(manifest.categories)) {
                    for (const f of (cat.files || [])) {
                        const catPath = cat.folder
                            ? `${folderPath}/${cat.folder}/${f}`
                            : `${folderPath}/${f}`;
                        jobs.push(
                            fetch(catPath)
                                .then(r => r.ok ? r.json() : null)
                                .then(a => { if (a) a._category = cat.name; return a; })
                                .catch(() => null)
                        );
                    }
                }
                return (await Promise.all(jobs)).filter(Boolean);
            }
        }
    } catch { /* no manifest, try index */ }

    // Fallback: try fetching an index.json we generate
    try {
        const res = await fetch(`${folderPath}/_index.json`);
        if (res.ok) {
            const filenames = await res.json();
            const results = await Promise.all(
                filenames.map(f =>
                    fetch(`${folderPath}/${f}`).then(r => r.ok ? r.json() : null).catch(() => null)
                )
            );
            return results.filter(Boolean);
        }
    } catch { /* no index */ }

    return [];
}
