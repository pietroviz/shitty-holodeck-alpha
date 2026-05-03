#!/usr/bin/env node
/**
 * migrate-cast-zone-props.js — Relocate stage props that overlap the cast.
 *
 * The cast layout (CAST_LAYOUT in shared/envGeometry.js) puts characters at:
 *   CHAR_A: (0,  0, -1)   upstage centre
 *   CHAR_B: (-1, 0,  0)   downstage left
 *   CHAR_C: (1,  0,  0)   downstage right
 *
 * Stage props placed in the inner 3×3 of the BINGO grid (x∈[-1..1], z∈[-1..1])
 * land directly between or in front of cast members — the "log in the middle
 * of the env" issue. The legacy env data was authored before the conversation
 * triangle existed and treated the centre of stage as a fine prop spot.
 *
 * This script walks every env JSON, finds props in 'place' mode whose cell
 * is in the inner 3×3, and relocates them to a sensible perimeter cell that
 * preserves their thematic position (centre prop → back centre, char-spot
 * prop → far flank, etc.).
 *
 * Backups go to environments_pre_cast_zone_migration/.
 *
 * Usage:
 *   node scripts/migrate-cast-zone-props.js
 *   node scripts/migrate-cast-zone-props.js --dry-run
 */

const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const ENVS_DIR   = path.join(REPO_ROOT, 'public/holodeck/global_assets/environments');
const BACKUP_DIR = path.join(REPO_ROOT, 'public/holodeck/global_assets/environments_pre_cast_zone_migration');
const DRY_RUN    = process.argv.includes('--dry-run');

// Inner 3×3 (cast zone) → perimeter. Each cell pushes outward in the
// most natural direction to preserve thematic intent:
//   (0,0)  centre → back centre  (push behind cast)
//   (0,-1) CHAR_A spot → back centre (behind A)
//   (-1,0) CHAR_B spot → far left flank
//   (1,0)  CHAR_C spot → far right flank
//   (corners) → diagonal perimeter
// Keys are "x,z" strings; values are [x,z] integer pairs.
const CAST_ZONE = {
    '0,0':   [ 0, -2],
    '0,-1':  [ 0, -2],
    '0,1':   [ 0,  2],
    '-1,-1': [-2, -2],
    '-1,0':  [-2,  0],
    '-1,1':  [-2,  2],
    '1,-1':  [ 2, -2],
    '1,0':   [ 2,  0],
    '1,1':   [ 2,  2],
};

function relocate(cell) {
    const key = `${cell.x},${cell.z}`;
    const target = CAST_ZONE[key];
    if (!target) return null;
    return { x: target[0], y: 0, z: target[1] };
}

function isCastZone(cell) {
    if (!cell) return false;
    if (typeof cell !== 'object' || cell.x == null || cell.z == null) return false;
    return cell.x >= -1 && cell.x <= 1 && cell.z >= -1 && cell.z <= 1;
}

function listEnvFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('environments_pre_')) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listEnvFiles(p));
        else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
            out.push(p);
        }
    }
    return out;
}

function main() {
    const files = listEnvFiles(ENVS_DIR);
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Scanning ${files.length} env JSON files for cast-zone props…`);
    console.log();

    let totalMoved = 0;
    let filesChanged = 0;

    for (const file of files) {
        const rel = path.relative(ENVS_DIR, file);
        const raw = fs.readFileSync(file, 'utf8');
        let asset;
        try { asset = JSON.parse(raw); } catch { console.error('  parse fail:', rel); continue; }

        const props = asset?.payload?.state?.props;
        if (!Array.isArray(props)) continue;

        // Track cells already used in this env so we don't relocate
        // multiple props onto the same target cell.
        const occupied = new Set();
        for (const p of props) {
            if (p?.mode === 'place' && p.cell?.x != null && p.cell?.z != null && !isCastZone(p.cell)) {
                occupied.add(`${p.cell.x},${p.cell.z}`);
            }
        }

        let movedHere = 0;
        for (const p of props) {
            if (p?.mode !== 'place') continue;
            if (!isCastZone(p.cell)) continue;
            let target = relocate(p.cell);
            if (!target) continue;

            // Avoid collision: if target cell is already taken, walk
            // around the perimeter until a free cell is found.
            let key = `${target.x},${target.z}`;
            const PERIMETER = [
                [-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],
                [2,-1],[2,0],[2,1],[2,2],
                [1,2],[0,2],[-1,2],[-2,2],[-2,1],[-2,0],[-2,-1],
            ];
            if (occupied.has(key)) {
                const idx = PERIMETER.findIndex(([x,z]) => x === target.x && z === target.z);
                for (let step = 1; step < PERIMETER.length; step++) {
                    const [nx, nz] = PERIMETER[(idx + step) % PERIMETER.length];
                    const nKey = `${nx},${nz}`;
                    if (!occupied.has(nKey)) { target = { x: nx, y: 0, z: nz }; key = nKey; break; }
                }
            }

            const before = `${p.cell.x},${p.cell.z}`;
            p.cell = target;
            occupied.add(key);
            movedHere++;
            console.log(`  ${rel}  ${p.assetId}  (${before}) → (${target.x},${target.z})`);
        }

        if (movedHere > 0) {
            if (!DRY_RUN) {
                const backupPath = path.join(BACKUP_DIR, rel);
                fs.mkdirSync(path.dirname(backupPath), { recursive: true });
                fs.writeFileSync(backupPath, raw);
                fs.writeFileSync(file, JSON.stringify(asset, null, 2) + '\n');
            }
            filesChanged++;
            totalMoved += movedHere;
        }
    }

    console.log();
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
    console.log(`  Files changed:  ${filesChanged}`);
    console.log(`  Props relocated: ${totalMoved}`);
    if (!DRY_RUN && filesChanged > 0) {
        console.log(`  Originals backed up to: ${path.relative(REPO_ROOT, BACKUP_DIR)}`);
    }
}

main();
