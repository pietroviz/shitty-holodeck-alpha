/**
 * db.js — IndexedDB persistence for character assets.
 */

const DB_NAME = 'characterbuilder_assets';
const DB_VERSION = 1;
const STORE_NAME = 'characters';

let dbInstance = null;

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('modified', 'meta.modified', { unique: false });
            }
        };

        req.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };

        req.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

/**
 * Generate a short unique ID.
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Save a character asset to the database.
 * @param {Object} asset — { id, name, meta, state }
 */
export async function dbSave(asset) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(asset);
        tx.oncomplete = () => resolve(asset);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get all character assets, sorted by modified date (newest first).
 */
export async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
            const results = req.result || [];
            results.sort((a, b) => (b.meta?.modified || 0) - (a.meta?.modified || 0));
            resolve(results);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get a single character asset by ID.
 */
export async function dbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Delete a character asset by ID.
 */
export async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Create a new character asset with default state.
 * @param {Object} characterState — The character's current state object
 * @param {string} [name] — Optional name
 * @returns {Object} The new asset
 */
export function createAsset(characterState, name) {
    const now = Date.now();
    return {
        id: generateId(),
        name: name || 'Untitled Character',
        description: '',
        tags: [],
        meta: {
            created: now,
            modified: now,
            thumbnail: null,
        },
        state: { ...characterState },
    };
}

/**
 * Persist a character asset to the server's assets/characters/ folder.
 * Converts from DB schema to the file schema used by other prototypes.
 * @param {Object} asset — DB-format asset
 */
export async function saveCharacterToFile(asset) {
    const fileData = {
        id: asset.id,
        type: 'character',
        name: asset.name,
        tags: asset.tags || [],
        meta: {
            created: new Date(asset.meta?.created || Date.now()).toISOString().split('T')[0],
            modified: new Date(asset.meta?.modified || Date.now()).toISOString().split('T')[0],
            origin: 'app',
            origin_ref: null,
            creator: 'user',
            version: 1,
            thumbnail: null,
        },
        payload: {
            description: asset.description || '',
            format: 'character_state',
            state: { ...asset.state },
        },
    };

    try {
        const resp = await fetch('/api/save-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fileData),
        });
        const result = await resp.json();
        if (!result.ok) console.warn('[SaveToFile] Server error:', result.error);
        return result;
    } catch (err) {
        console.warn('[SaveToFile] Failed:', err);
        return { ok: false, error: err.message };
    }
}

/**
 * Seed bundled character JSON files into the database if not already present.
 * @param {Array<{id: string, path: string}>} manifest
 * @returns {Promise<number>} Number of characters seeded
 */
export async function seedCharacters(manifest) {
    let seeded = 0;
    for (const entry of manifest) {
        try {
            const resp = await fetch(entry.path + '?t=' + Date.now()); // bust cache
            if (!resp.ok) { console.warn(`[Seed] Failed to load ${entry.path}`); continue; }
            const json = await resp.json();

            const existing = await dbGet(entry.id);

            // Convert from file schema to DB schema
            const now = Date.now();
            const asset = {
                id: json.id,
                name: json.name,
                description: json.payload?.description || '',
                tags: json.tags || [],
                meta: {
                    created: existing?.meta?.created || now,
                    modified: now,
                    thumbnail: null, // will be regenerated
                },
                state: json.payload?.state || {},
            };

            await dbSave(asset);
            seeded++;
        } catch (err) {
            console.warn(`[Seed] Error loading ${entry.path}:`, err);
        }
    }
    return seeded;
}
