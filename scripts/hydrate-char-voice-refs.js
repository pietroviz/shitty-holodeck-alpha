#!/usr/bin/env node
/**
 * Hydrate voiceId → voice ref on stock characters.
 *
 * Stock characters already carry a `state.voiceId` (e.g. "voice_giant")
 * but CharacterBridge / previewRenderer read the `voice` entry from the
 * refs array, not the state field. Without the ref, voices never play.
 *
 * This script walks every stock char JSON, looks up the referenced voice
 * asset, and writes a voice ref matching the format produced by
 * setRef() in public/holodeck/js/db.js.
 *
 * Idempotent: re-running updates existing voice refs to the current
 * voice snapshot.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHAR_BASE = path.join(ROOT, 'public/holodeck/global_assets/characters');
const VOICE_BASE = path.join(ROOT, 'public/holodeck/global_assets/voices');
const CHAR_CATS = ['creatures', 'fantasy', 'internet', 'sci-fi', 'television'];
const VOICE_CATS = ['standard', 'fantasy', 'accented', 'creatures', 'everyday'];

function loadVoices() {
    const map = new Map();
    for (const cat of VOICE_CATS) {
        const dir = path.join(VOICE_BASE, cat);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.json')) continue;
            const asset = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (asset?.id) map.set(asset.id, asset);
        }
    }
    return map;
}

function buildVoiceRef(voiceAsset) {
    return {
        slot: 'voice',
        assetId: voiceAsset.id,
        sourceId: voiceAsset.meta?.sourceId || voiceAsset.id,
        sourceVersion: voiceAsset.meta?.version ?? 1,
        snapshot: JSON.parse(JSON.stringify(voiceAsset)),
    };
}

function main() {
    const voices = loadVoices();
    console.log(`Loaded ${voices.size} voices.\n`);

    let updated = 0;
    let alreadyCurrent = 0;
    const missingVoice = [];

    for (const cat of CHAR_CATS) {
        const dir = path.join(CHAR_BASE, cat);
        if (!fs.existsSync(dir)) continue;

        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.json')) continue;
            const fpath = path.join(dir, f);
            const char = JSON.parse(fs.readFileSync(fpath, 'utf8'));
            const voiceId = char.payload?.state?.voiceId;
            if (!voiceId || voiceId === 'none') continue;

            const voiceAsset = voices.get(voiceId);
            if (!voiceAsset) {
                missingVoice.push({ char: char.name, voiceId });
                continue;
            }

            if (!Array.isArray(char.refs)) char.refs = [];

            const existing = char.refs.find(r => r.slot === 'voice');
            const newRef = buildVoiceRef(voiceAsset);

            if (existing && existing.assetId === newRef.assetId
                && existing.sourceVersion === newRef.sourceVersion) {
                alreadyCurrent++;
                continue;
            }

            char.refs = char.refs.filter(r => r.slot !== 'voice');
            char.refs.push(newRef);

            fs.writeFileSync(fpath, JSON.stringify(char, null, 2) + '\n', 'utf8');
            updated++;
            console.log(`  ${cat.padEnd(10)} ${char.name.padEnd(28)} → ${voiceId}`);
        }
    }

    console.log(`\nDone.`);
    console.log(`  updated:        ${updated}`);
    console.log(`  already current:${alreadyCurrent}`);
    console.log(`  missing voice:  ${missingVoice.length}`);
    if (missingVoice.length) {
        console.log('\nUnknown voiceIds (skipped):');
        missingVoice.forEach(m => console.log(`  ${m.char} → ${m.voiceId}`));
    }
}

main();
