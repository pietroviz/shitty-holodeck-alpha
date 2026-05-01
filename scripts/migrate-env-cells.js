#!/usr/bin/env node
/**
 * migrate-env-cells.js — One-shot migration: legacy BINGO cell strings
 *                       → new integer {x, y, z} object schema.
 *
 * What changes
 *   "cell": "N3"  →  "cell": {"x": 0, "y": 0, "z": 0}
 *   "cell": "B1"  →  "cell": {"x": -2, "y": 0, "z": -2}
 *   "cell": "O5"  →  "cell": {"x": 2, "y": 0, "z": 2}
 *
 * What stays
 *   • The `cast` array (if present) — env's hardcoded cast defaults are now
 *     ignored by the renderer (CAST_LAYOUT in shared/envGeometry.js drives
 *     ghost cast). Cells inside cast entries get migrated too in case any
 *     future tooling reads them, but they're no longer used at render time.
 *   • Anything that isn't a cell.
 *
 * What's skipped
 *   • Already-migrated cells (object form passes through).
 *
 * Backup
 *   • Writes a copy of every input file into
 *     `public/holodeck/global_assets/environments_pre_grid_migration/<sub>/<name>.json`
 *     BEFORE writing the migrated file. If any env reads weird after the
 *     square-on camera flip, diff against the backup folder.
 *
 * Usage
 *   node scripts/migrate-env-cells.js
 *   node scripts/migrate-env-cells.js --dry-run     # preview only
 */

const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const ENVS_DIR   = path.join(REPO_ROOT, 'public/holodeck/global_assets/environments');
const BACKUP_DIR = path.join(REPO_ROOT, 'public/holodeck/global_assets/environments_pre_grid_migration');

const DRY_RUN = process.argv.includes('--dry-run');

const BINGO = 'BINGO';

/** Parse a BINGO cell string → {x, y, z} or null. */
function bingoToXYZ(str) {
    if (typeof str !== 'string' || str.length < 2) return null;
    const letterIdx = BINGO.indexOf(str[0].toUpperCase());
    const num       = parseInt(str.slice(1), 10);
    if (letterIdx < 0 || num < 1 || num > 5) return null;
    return { x: letterIdx - 2, y: 0, z: num - 3 };
}

/** Recursively walk a value and rewrite any `cell` field that's a BINGO string. */
function migrate(value) {
    if (value == null) return { value, changed: 0 };
    if (Array.isArray(value)) {
        let changed = 0;
        const out = value.map(v => {
            const r = migrate(v);
            changed += r.changed;
            return r.value;
        });
        return { value: out, changed };
    }
    if (typeof value !== 'object') return { value, changed: 0 };

    let changed = 0;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (k === 'cell') {
            // BINGO string → integer object. Pass-through anything else.
            const xyz = bingoToXYZ(v);
            if (xyz) {
                out[k] = xyz;
                changed++;
                continue;
            }
            // Already migrated, null, or unknown — keep as-is.
            out[k] = v;
            continue;
        }
        const r = migrate(v);
        out[k] = r.value;
        changed += r.changed;
    }
    return { value: out, changed };
}

function ensureDir(dir) {
    if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true });
}

function listEnvFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listEnvFiles(p));
        } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
            out.push(p);
        }
    }
    return out;
}

function main() {
    if (!fs.existsSync(ENVS_DIR)) {
        console.error('No env dir at:', ENVS_DIR);
        process.exit(1);
    }

    const files = listEnvFiles(ENVS_DIR);
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Found ${files.length} env JSON files.`);

    let totalChanged = 0;
    let filesChanged = 0;

    for (const file of files) {
        const rel = path.relative(ENVS_DIR, file);
        const raw = fs.readFileSync(file, 'utf8');
        let asset;
        try { asset = JSON.parse(raw); }
        catch (e) { console.error(`  PARSE FAIL: ${rel} — ${e.message}`); continue; }

        const { value: migrated, changed } = migrate(asset);
        if (changed === 0) {
            console.log(`  unchanged: ${rel}`);
            continue;
        }

        // Backup the original first (only when not dry-run).
        if (!DRY_RUN) {
            const backupPath = path.join(BACKUP_DIR, rel);
            ensureDir(path.dirname(backupPath));
            fs.writeFileSync(backupPath, raw);
            fs.writeFileSync(file, JSON.stringify(migrated, null, 2) + '\n');
        }

        console.log(`  migrated: ${rel}  (${changed} cell${changed === 1 ? '' : 's'})`);
        totalChanged += changed;
        filesChanged++;
    }

    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
    console.log(`  Files changed:  ${filesChanged} / ${files.length}`);
    console.log(`  Cells rewritten: ${totalChanged}`);
    if (!DRY_RUN && filesChanged > 0) {
        console.log(`  Originals backed up to: ${path.relative(REPO_ROOT, BACKUP_DIR)}`);
    }
}

main();
