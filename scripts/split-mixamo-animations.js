#!/usr/bin/env node
/**
 * split-mixamo-animations.js
 *
 * Reads the 39 MB mixamo-simbox.json (full Mixamo skeleton, every bone +
 * finger tracked) and emits one trimmed-down JSON per animation into
 * public/holodeck/global_assets/animations/<emotion>/anim_<id>.json.
 *
 * What gets kept
 *   • 3 bone tracks per animation: Hips → root, Spine2 → torso, Head → head.
 *     Our procedural characters don't have arms / fingers / individual
 *     spine joints, so the rest of the skeleton would have nowhere to land
 *     anyway. We keep the gestalt — body sway, lean, head turn — which
 *     is what carries dialogue performance for stylised characters.
 *   • emotion + intent metadata so the runtime can pick animations
 *     semantically ("speaker is angry → play angry-talk").
 *   • duration + loop hints (idle clips loop, talk clips one-shot).
 *
 * What gets dropped
 *   • Arms, hands, fingers, feet, individual spine joints (~87 tracks).
 *   • Position tracks (the source already stripped root motion + leg
 *     positions — see normalization "strip-legs-and-root-position").
 *
 * Output shape
 *   Same envelope as our other stock assets (id / type / tags / meta /
 *   payload.state). Plays via shared/animationRig.js.
 *
 * Run
 *   node scripts/split-mixamo-animations.js
 */

const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const SOURCE     = path.join(REPO_ROOT, 'public/holodeck/global_assets/animations/mixamo-simbox.json');
const OUT_DIR    = path.join(REPO_ROOT, 'public/holodeck/global_assets/animations');

// Mixamo bone → procedural-character target name. Anything not in this
// map gets dropped on the floor. Property suffix (.quaternion) preserved.
//
// LeftArm / RightArm carry the upper-arm rotation (the dominant motion
// for "wave / point / gesture"). The runtime applies a calibration
// offset (see animationRig.js) to re-aim Mixamo's T-pose into our
// arms-by-side rest. Forearm + hand + finger bones still drop — our
// procedural characters don't have elbows or fingers.
const BONE_MAP = {
    'mixamorigHips.quaternion':     'root.quaternion',
    'mixamorigSpine2.quaternion':   'torso.quaternion',
    'mixamorigHead.quaternion':     'head.quaternion',
    'mixamorigLeftArm.quaternion':  'armL.quaternion',
    'mixamorigRightArm.quaternion': 'armR.quaternion',
};

const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
console.log(`Loaded ${source.animations.length} animations from ${path.relative(REPO_ROOT, SOURCE)}`);
console.log();

// Animations we deliberately drop — measured peak arm-deviation < 0.05
// (effectively static arm motion). The picker would otherwise occasionally
// land on these for talk lines and the speaker would just stand there.
const SKIP_IDS = new Set([
    'neutral-talk-talking3',
    'scared-talk-standactionpraying',
]);

let kept = 0, skipped = 0;

for (const anim of source.animations) {
    if (SKIP_IDS.has(anim.id)) {
        console.warn(`  - ${anim.id}: in SKIP_IDS (low-motion talk clip) — skipped`);
        skipped++;
        continue;
    }

    const tracks = [];
    for (const track of anim.clip.tracks) {
        const targetName = BONE_MAP[track.name];
        if (!targetName) continue;
        tracks.push({
            name:   targetName,
            times:  Array.from(track.times || []),
            values: Array.from(track.values || []),
        });
    }

    if (tracks.length === 0) {
        console.warn(`  ! ${anim.id}: no usable bone tracks — skipped`);
        skipped++;
        continue;
    }

    // Both idle and talk animations loop. The runtime swaps animations on
    // speaker-change rather than relying on talks ending naturally — so a
    // multi-second line keeps the speaker animated throughout instead of
    // freezing at the end of a one-shot.
    const isIdle = anim.intent === 'idle';

    const out = {
        id:   `anim_${anim.id}`,
        type: 'animation',
        name: anim.label || anim.id,
        tags: [anim.emotion, anim.intent],
        meta: {
            origin:         'mixamo',
            sourceFilename: anim.filename,
            created:        source.generatedAt,
            modified:       source.generatedAt,
            version:        1,
        },
        payload: {
            description: `Mixamo ${anim.intent} animation, "${anim.emotion}" emotion. Trimmed to root/torso/head bones.`,
            format:      'animation_state',
            state: {
                duration:  anim.duration,
                loop:      true,    // see comment above — loop both intents
                emotion:   anim.emotion,
                intent:    anim.intent,
                tracks,
            },
        },
    };

    const dir = path.join(OUT_DIR, anim.emotion);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `anim_${anim.id}.json`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, JSON.stringify(out, null, 2));

    const sizeKB = (fs.statSync(filepath).size / 1024).toFixed(1);
    console.log(`  ${anim.emotion}/${filename}  ${tracks.length} tracks  ${anim.duration.toFixed(2)}s  ${sizeKB} KB`);
    kept++;
}

// Build manifest covering only the freshly-written emotion folders.
const categories = {};
for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(OUT_DIR, entry.name);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith('anim_'));
    if (files.length === 0) continue;
    categories[entry.name] = {
        name:   entry.name[0].toUpperCase() + entry.name.slice(1),
        count:  files.length,
        files,
        folder: entry.name,
    };
}

const manifestPath = path.join(OUT_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ categories }, null, 2) + '\n');

console.log();
console.log(`Done. ${kept} animations written, ${skipped} skipped.`);
console.log(`Manifest: ${path.relative(REPO_ROOT, manifestPath)}`);
