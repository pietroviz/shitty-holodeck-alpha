/**
 * db.js — Shared IndexedDB persistence for all asset types.
 *
 * Single database with one object store per asset type.
 * Common CRUD interface: save, getAll, get, remove.
 *
 * === Normalized Asset Schema ===
 *
 * Every asset — global presets, user-created, seeded — follows one shape:
 *
 *   {
 *     id:   string,               // unique ID
 *     type: string,               // 'character', 'voice', 'object', etc.
 *     name: string,
 *     tags: string[],
 *     meta: {
 *       created:   number,        // timestamp
 *       modified:  number,
 *       thumbnail: string|null,   // data URL
 *       owner:     string,        // 'user' | 'public' | 'system'
 *       origin:    string|null,   // 'preset' | 'user' | 'remix'
 *       sourceId:  string|null,   // ID of the asset this was derived from
 *       sourceVersion: number,    // version of the source when snapshotted
 *       version:   number,        // this asset's own version (bumped on save)
 *     },
 *     payload: {
 *       description: string,
 *       format:      string,      // 'voice_state', 'mesh', 'character_state', etc.
 *       state:       Object,      // builder-specific state (synthesis params, etc.)
 *       _editor:     Object|null, // editor-specific data (prop elements, etc.)
 *     },
 *     refs: AssetRef[],           // sub-asset references (voice on character, hat, etc.)
 *   }
 *
 * === Asset References (refs) ===
 *
 * When asset A embeds asset B (e.g. a character's voice), we store:
 *
 *   {
 *     slot:          string,      // named slot: 'voice', 'hat', 'glasses', etc.
 *     assetId:       string,      // ID of the referenced asset in its store
 *     sourceId:      string|null, // original preset/template ID (for provenance)
 *     sourceVersion: number,      // version of source when snapshot was taken
 *     snapshot:      Object,      // full asset data (self-contained copy)
 *   }
 *
 * The snapshot makes the parent self-contained. The sourceId/assetId enable
 * future "update available" flows. When a user duplicates/remixes, the
 * snapshot becomes theirs — the original creator can still update theirs.
 */

const DB_NAME    = 'holodeck_assets';
const DB_VERSION = 2;

const STORES = [
    'characters',
    'environments',
    'music',
    'objects',
    'images',
    'voices',
    'simulations',
    'stories',
];

let dbInstance = null;

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            for (const name of STORES) {
                if (!db.objectStoreNames.contains(name)) {
                    const store = db.createObjectStore(name, { keyPath: 'id' });
                    store.createIndex('name',     'name',          { unique: false });
                    store.createIndex('modified',  'meta.modified', { unique: false });
                }
            }
        };

        req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Generate a short unique ID. */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ══════════════════════════════════════════════════════════
   AUTH-AWARE CRUD DISPATCH
   ──────────────────────────────────────────────────────────
   Public dbSave / dbGetAll / dbGet / dbDelete decide on first
   call whether the user is signed in (via /api/user/profile).
   - signed in  → CRUD against /api/assets/* (Supabase, RLS)
   - signed out → CRUD against IndexedDB (local-only, fallback)
   The Local variants are still exported so callers that always
   want browser-local storage (e.g. seeding) can opt in.
   ══════════════════════════════════════════════════════════ */

const STORE_TO_TYPE = {
    characters:   'character',
    environments: 'environment',
    music:        'music',
    voices:       'voice',
    objects:      'object',
    images:       'image',
    stories:      'story',
    simulations:  'simulation',
};

// Inverse: asset.type → store name. Used by callers that have an asset and
// need its store ('object' covers legacy 'prop' which never made it into a
// store name). Falls back to 'images' so unknown types still hit *some* store.
const TYPE_TO_STORE = Object.fromEntries(
    Object.entries(STORE_TO_TYPE).map(([store, type]) => [type, store])
);
TYPE_TO_STORE.prop = 'objects';

export function storeForType(type) {
    return TYPE_TO_STORE[type] || 'images';
}

let _authStatePromise = null;
async function _getAuthState() {
    if (_authStatePromise) return _authStatePromise;
    _authStatePromise = (async () => {
        try {
            const res = await fetch('/api/user/profile', { credentials: 'include' });
            if (!res.ok) return { signedIn: false };
            const json = await res.json();
            const signedIn = !!json.authenticated && !json.guest;
            // One-time visibility so it's obvious in DevTools which path is active.
            console.log(`[db] persistence: ${signedIn ? 'Supabase (signed in)' : 'IndexedDB (signed out)'}`);
            return { signedIn };
        } catch (err) {
            console.warn('[db] auth check failed, falling back to IndexedDB', err);
            return { signedIn: false };
        }
    })();
    return _authStatePromise;
}

/** Save an asset. */
export async function dbSave(storeName, asset) {
    const auth = await _getAuthState();
    if (!auth.signedIn) return dbSaveLocal(storeName, asset);

    const type = STORE_TO_TYPE[storeName];
    if (!type) throw new Error(`[db] Unknown store: ${storeName}`);

    const body = {
        id:      asset.id,
        type:    asset.type || type,
        name:    asset.name,
        tags:    asset.tags    ?? [],
        meta:    asset.meta    ?? {},
        payload: asset.payload ?? {},
        refs:    asset.refs    ?? [],
    };
    const res = await fetch('/api/assets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`[db] /api/assets/save ${res.status}: ${errText}`);
    }
    return asset;
}

/** Get all assets in a store, sorted newest-first. */
export async function dbGetAll(storeName) {
    const auth = await _getAuthState();
    if (!auth.signedIn) return dbGetAllLocal(storeName);

    const type = STORE_TO_TYPE[storeName];
    if (!type) throw new Error(`[db] Unknown store: ${storeName}`);

    const res = await fetch(`/api/assets/list?type=${encodeURIComponent(type)}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`[db] /api/assets/list ${res.status}`);
    const json = await res.json();
    const results = (json.assets || []).map(migrateAsset);
    results.sort((a, b) => (b.meta?.modified || 0) - (a.meta?.modified || 0));
    return results;
}

/** Get a single asset by id, or null if not found. */
export async function dbGet(storeName, id) {
    const auth = await _getAuthState();
    if (!auth.signedIn) return dbGetLocal(storeName, id);

    const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
        credentials: 'include',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`[db] /api/assets/${id} ${res.status}`);
    const json = await res.json();
    return json.asset ? migrateAsset(json.asset) : null;
}

/** Delete an asset by id. */
export async function dbDelete(storeName, id) {
    const auth = await _getAuthState();
    if (!auth.signedIn) return dbDeleteLocal(storeName, id);

    const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`[db] /api/assets/${id} delete ${res.status}`);
}

/* ══════════════════════════════════════════════════════════
   INDEXEDDB CRUD (local fallback)
   ══════════════════════════════════════════════════════════ */

export async function dbSaveLocal(storeName, asset) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(asset);
        tx.oncomplete = () => resolve(asset);
        tx.onerror    = (e) => reject(e.target.error);
    });
}

export async function dbGetAllLocal(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => {
            const results = (req.result || []).map(migrateAsset);
            results.sort((a, b) => (b.meta?.modified || 0) - (a.meta?.modified || 0));
            resolve(results);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function dbGetLocal(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result ? migrateAsset(req.result) : null);
        req.onerror   = (e) => reject(e.target.error);
    });
}

export async function dbDeleteLocal(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror    = (e) => reject(e.target.error);
    });
}

/* ══════════════════════════════════════════════════════════
   ASSET CREATION
   ══════════════════════════════════════════════════════════ */

/**
 * Create a new asset with the normalized schema.
 *
 * @param {string} type    — 'character', 'environment', 'voice', etc.
 * @param {Object} state   — builder-specific state object
 * @param {string} [name]
 * @param {Object} [opts]  — optional overrides
 * @param {string} [opts.format]       — payload format hint
 * @param {string} [opts.description]  — human description
 * @param {Object} [opts._editor]      — editor-specific data (prop elements)
 * @param {string} [opts.origin]       — 'user' | 'preset' | 'remix'
 * @param {string} [opts.sourceId]     — ID of source asset (for remixes)
 * @param {number} [opts.sourceVersion] — version of source when snapshotted
 */
export function createAsset(type, state, name, opts = {}) {
    const now = Date.now();
    return {
        id: generateId(),
        type,
        name: name || `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        tags: [],
        meta: {
            created:       now,
            modified:      now,
            thumbnail:     null,
            owner:         'user',
            origin:        opts.origin || 'user',
            sourceId:      opts.sourceId || null,
            sourceVersion: opts.sourceVersion ?? 0,
            version:       1,
        },
        payload: {
            description: opts.description || '',
            format:      opts.format || `${type}_state`,
            state:       { ...state },
            _editor:     opts._editor || null,
        },
        refs: [],
    };
}

/* ══════════════════════════════════════════════════════════
   ASSET REFERENCES
   ══════════════════════════════════════════════════════════ */

/**
 * Set (or replace) a ref on an asset for a given slot.
 *
 * @param {Object} parentAsset — the parent asset (e.g. a character)
 * @param {string} slot        — named slot ('voice', 'hat', 'glasses', etc.)
 * @param {Object} childAsset  — the child asset to snapshot into the ref
 */
export function setRef(parentAsset, slot, childAsset) {
    if (!parentAsset.refs) parentAsset.refs = [];

    // Remove existing ref for this slot
    parentAsset.refs = parentAsset.refs.filter(r => r.slot !== slot);

    // Add new ref with a deep snapshot
    parentAsset.refs.push({
        slot,
        assetId:       childAsset.id,
        sourceId:      childAsset.meta?.sourceId || childAsset.id,
        sourceVersion: childAsset.meta?.version ?? 1,
        snapshot:      structuredClone(childAsset),
    });
}

/**
 * Get a ref snapshot for a given slot, or null.
 *
 * @param {Object} parentAsset
 * @param {string} slot
 * @returns {Object|null} — the full snapshot asset, or null
 */
export function getRef(parentAsset, slot) {
    if (!parentAsset.refs) return null;
    const ref = parentAsset.refs.find(r => r.slot === slot);
    return ref?.snapshot || null;
}

/**
 * Remove a ref from a slot.
 */
export function removeRef(parentAsset, slot) {
    if (!parentAsset.refs) return;
    parentAsset.refs = parentAsset.refs.filter(r => r.slot !== slot);
}

/**
 * Get the raw ref entry (not just the snapshot) for a slot.
 * Useful for checking sourceId, sourceVersion, etc.
 */
export function getRefEntry(parentAsset, slot) {
    if (!parentAsset.refs) return null;
    return parentAsset.refs.find(r => r.slot === slot) || null;
}

/* ══════════════════════════════════════════════════════════
   STATE ACCESS HELPERS
   ══════════════════════════════════════════════════════════ */

/**
 * Get the builder state from an asset, regardless of schema version.
 * Works with both old ({ state }) and new ({ payload: { state } }) shapes.
 */
export function getState(asset) {
    if (!asset) return {};
    return asset.payload?.state || asset.state || {};
}

/**
 * Set the builder state on an asset (always writes to payload.state).
 * Also writes to legacy .state for backwards compatibility during transition.
 */
export function setState(asset, state) {
    if (!asset) return;
    // Ensure payload exists
    if (!asset.payload) asset.payload = { description: '', format: '', state: {}, _editor: null };
    asset.payload.state = { ...state };
    // Also maintain legacy .state for any code that still reads it
    asset.state = { ...state };
}

/* ══════════════════════════════════════════════════════════
   MIGRATION — upgrade old-shape assets on read
   ══════════════════════════════════════════════════════════ */

/**
 * Migrate an asset from the old flat schema to the normalized schema.
 * Non-destructive: if the asset already has the new shape, returns as-is.
 * Called automatically by dbGet/dbGetAll.
 */
export function migrateAsset(asset) {
    if (!asset) return asset;

    // Already normalized?
    if (asset.payload?.state !== undefined && asset.refs !== undefined) {
        return asset;
    }

    // Old shape: { state: {...} } with no payload wrapper
    if (asset.state && !asset.payload) {
        asset.payload = {
            description: asset.description || '',
            format:      `${asset.type || 'unknown'}_state`,
            state:       asset.state,
            _editor:     null,
        };
    }

    // Ensure refs array exists
    if (!asset.refs) asset.refs = [];

    // Ensure tags at top level
    if (!asset.tags) asset.tags = asset.meta?.tags || [];

    // Ensure meta has new fields
    if (asset.meta) {
        if (asset.meta.origin === undefined) asset.meta.origin = asset.meta.owner === 'user' ? 'user' : 'preset';
        if (asset.meta.sourceId === undefined) asset.meta.sourceId = null;
        if (asset.meta.sourceVersion === undefined) asset.meta.sourceVersion = 0;
        if (asset.meta.version === undefined) asset.meta.version = 1;
    }

    return asset;
}

/* ══════════════════════════════════════════════════════════
   SEEDING
   ══════════════════════════════════════════════════════════ */

/**
 * Seed assets from JSON files into a store (skip if already present).
 * Normalizes the JSON to the unified schema on import.
 *
 * @param {string} storeName
 * @param {Array<{id: string, path: string}>} manifest
 */
export async function seedFromManifest(storeName, manifest) {
    let seeded = 0;
    for (const entry of manifest) {
        try {
            // Use Local variants explicitly: stock assets must never be written
            // to a signed-in user's Supabase account by the seed path.
            const existing = await dbGetLocal(storeName, entry.id);
            if (existing) continue;

            const resp = await fetch(entry.path + '?t=' + Date.now());
            if (!resp.ok) continue;
            const json = await resp.json();

            const now = Date.now();
            const asset = {
                id:   json.id || entry.id,
                type: storeName.replace(/s$/, ''),
                name: json.name || entry.id,
                tags: json.tags || [],
                meta: {
                    created:       now,
                    modified:      now,
                    tags:          json.tags || [],
                    thumbnail:     json.meta?.thumbnail || null,
                    owner:         'public',
                    origin:        'preset',
                    sourceId:      json.id || entry.id,
                    sourceVersion: json.meta?.version ?? 1,
                    version:       json.meta?.version ?? 1,
                },
                payload: {
                    description: json.payload?.description || json.description || '',
                    format:      json.payload?.format || `${storeName.replace(/s$/, '')}_state`,
                    state:       json.payload?.state || json.state || {},
                    _editor:     json.payload?._editor || null,
                },
                refs: json.refs || [],
                // Keep legacy .state for backwards compatibility
                state: json.payload?.state || json.state || {},
            };

            await dbSaveLocal(storeName, asset);
            seeded++;
        } catch (err) {
            console.warn(`[Seed] Error loading ${entry.path}:`, err);
        }
    }
    return seeded;
}
