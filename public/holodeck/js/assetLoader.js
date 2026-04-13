/**
 * assetLoader.js — Loads pre-generated global assets from /global_assets/
 * and user-created assets from IndexedDB.
 *
 * Global assets are JSON files in the global_assets/ folder.
 * User assets are stored in IndexedDB via db.js.
 */

import { dbGetAll } from './db.js';

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
};

// Map "My Stuff" labels → IndexedDB store names
const USER_STORES = {
    Characters:   'characters',
    Environments: 'environments',
    Music:        'music',
    '3D Objects': 'objects',
    '2D Images':  'images',
    Voices:       'voices',
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
        // Images have sub-folders; load a few key ones
        const subfolders = ['man-made-props', 'natural-props', 'walls', 'textures'];
        for (const sub of subfolders) {
            const items = await _loadAllJsonInFolder(`${BASE_PATH}/images/${sub}`);
            assets.push(...items);
        }
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

    for (const [catKey, catData] of Object.entries(manifest.categories || {})) {
        // If we only want a sub-category (e.g. "environment" from objects)
        if (subFilter && catKey !== subFilter) continue;

        const catFolder = `${BASE_PATH}/${folder}/${catKey}`;
        for (const filename of (catData.files || [])) {
            try {
                const res = await fetch(`${catFolder}/${filename}`);
                if (res.ok) {
                    const asset = await res.json();
                    asset._category = catData.name || catKey;
                    assets.push(asset);
                }
            } catch { /* skip failed loads */ }
        }
    }

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
                for (const f of manifest.files) {
                    try {
                        const r = await fetch(`${folderPath}/${f}`);
                        if (r.ok) assets.push(await r.json());
                    } catch { /* skip */ }
                }
                return assets;
            }
            if (manifest.categories) {
                for (const cat of Object.values(manifest.categories)) {
                    for (const f of (cat.files || [])) {
                        try {
                            const catPath = cat.folder
                                ? `${folderPath}/${cat.folder}/${f}`
                                : `${folderPath}/${f}`;
                            const r = await fetch(catPath);
                            if (r.ok) {
                                const a = await r.json();
                                a._category = cat.name;
                                assets.push(a);
                            }
                        } catch { /* skip */ }
                    }
                }
                return assets;
            }
        }
    } catch { /* no manifest, try index */ }

    // Fallback: try fetching an index.json we generate
    try {
        const res = await fetch(`${folderPath}/_index.json`);
        if (res.ok) {
            const filenames = await res.json();
            const assets = [];
            for (const f of filenames) {
                try {
                    const r = await fetch(`${folderPath}/${f}`);
                    if (r.ok) assets.push(await r.json());
                } catch { /* skip */ }
            }
            return assets;
        }
    } catch { /* no index */ }

    return [];
}
