/**
 * archetypeHead.js — Floating head with mouth rig, one per archetype.
 *
 * Shared by StoryBridge (edit view) and previewRenderer (browse view) so both
 * render the same head + mouth kit for story playback.
 *
 * A "head" here is a head geo + scalp/skin two-zone material + two eyes + a
 * MouthRig. The returned object also exposes a simple `talk(amplitude)` driver
 * used by the playback loop to wiggle the mouth while a character is speaking.
 */

import * as THREE from 'three';
const _NAME_TAG_WORLD = new THREE.Vector3();
import { HEAD, HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS, FACE_FEATURES } from './charConfig.js';
import { generateHeadGeometry } from './headShapes.js';
import { makeEyeTexture } from './eyeTexture.js';
import { createTwoZoneMaterial } from './materials.js';
import { MouthRig } from './mouthRig.js';

// ── Archetype palettes ─────────────────────────────────────────
// Scalp = archetype signature colour (bold, identifies the archetype at a glance).
// Face  = non-human creature tone that harmonises with scalp. Avoids skin beige
//         so the archetype reads as an abstract role — fillable by any creature
//         or human — rather than a specific person.
// Lip   = contrast against face.
// Eye   = iris colour.
export const ARCHETYPE_PALETTE = {
    Anchor:   { face: '#aac2d4', scalp: '#6b8caf', lip: '#b85560', eye: '#4a7a8c' },
    Bloom:    { face: '#b8dba6', scalp: '#7dbf6e', lip: '#c95a6a', eye: '#5f8a3f' },
    Champion: { face: '#e8b870', scalp: '#d49d3f', lip: '#b73d3d', eye: '#6a4a28' },
    Compass:  { face: '#b8adde', scalp: '#8a7cd1', lip: '#b85560', eye: '#4a3d8a' },
    Crown:    { face: '#e8d280', scalp: '#d4b23f', lip: '#a83030', eye: '#6a4a28' },
    Edge:     { face: '#8d929c', scalp: '#5a5a5a', lip: '#b0404a', eye: '#2a2a2a' },
    Flame:    { face: '#f0a088', scalp: '#e05f3f', lip: '#aa3030', eye: '#7a3a20' },
    Glitch:   { face: '#d8a8e0', scalp: '#9f5fc4', lip: '#4ac4c4', eye: '#c44ac4' },
    Magic:    { face: '#d8b4d8', scalp: '#c47cc4', lip: '#b85580', eye: '#8a3a8a' },
    Maker:    { face: '#b89878', scalp: '#8a6a4f', lip: '#a84a50', eye: '#4a3020' },
    Nest:     { face: '#d8c48a', scalp: '#b29d6e', lip: '#b85560', eye: '#5a3a20' },
    Signal:   { face: '#a8d4da', scalp: '#5fb2c4', lip: '#b85560', eye: '#2a6a7a' },
};

const MOUTH_REST = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };

// ── Per-archetype voice offsets ────────────────────────────────
// Layered on top of whatever base VoiceEngine state is applied so each
// character sounds a bit different even while they share one engine.
// Chosen to read as androgynous / creature-ish rather than gendered — klatt
// variants are synthetic and genderless; f3/f4 are the lowest female variants
// and sit in a neutral range when kept near baseline pitch. m-variants are
// avoided because they pin the cast to "male human". Pitch deltas stay small
// so nobody drifts into clearly-female territory either.
export const ARCHETYPE_VOICE = {
    Anchor:   { variant: 'klatt',  pitchDelta:  -2, speedDelta:  -5 },
    Bloom:    { variant: 'f4',     pitchDelta:   0, speedDelta:   0 },
    Champion: { variant: 'klatt3', pitchDelta:   2, speedDelta:   5 },
    Compass:  { variant: 'f3',     pitchDelta:  -2, speedDelta:   0 },
    Crown:    { variant: 'klatt2', pitchDelta:   0, speedDelta:  -3 },
    Edge:     { variant: 'klatt',  pitchDelta:  -4, speedDelta:   5 },
    Flame:    { variant: 'klatt4', pitchDelta:   6, speedDelta:  10 },
    Glitch:   { variant: 'klatt2', pitchDelta:  10, speedDelta:  15 },
    Magic:    { variant: 'klatt3', pitchDelta:   5, speedDelta:   0 },
    Maker:    { variant: 'klatt2', pitchDelta:  -6, speedDelta:  -5 },
    Nest:     { variant: 'f3',     pitchDelta:   2, speedDelta:  -5 },
    Signal:   { variant: 'klatt4', pitchDelta:   0, speedDelta:  10 },
};

// ── Beat trimming ──────────────────────────────────────────────
// The corpus ships 6–8 beats per entry. For the read-through we trim to 3 so
// the emotional arc lands cleanly: opening beat + peak-tension beat + closing
// beat. Works for rising / falling / rise_then_fall / steady_with_spike.
export function pickThreeBeats(beats) {
    if (!Array.isArray(beats) || beats.length <= 3) return beats || [];

    const firstIdx = 0;
    const lastIdx  = beats.length - 1;

    // Peak tension among the middle beats (exclude first + last).
    let peakIdx = -1, peakTension = -Infinity;
    for (let i = firstIdx + 1; i < lastIdx; i++) {
        const t = Number(beats[i].tension ?? 0);
        if (t > peakTension) { peakTension = t; peakIdx = i; }
    }
    // Fallback — pick the geometric middle if tensions are all equal/missing.
    if (peakIdx < 0) peakIdx = Math.floor((firstIdx + lastIdx) / 2);

    return [beats[firstIdx], beats[peakIdx], beats[lastIdx]];
}

/**
 * Build a floating head for the given archetype.
 * @returns { group: THREE.Group, mouthRig: MouthRig, talk: (amp) => void, dispose: () => void }
 *          `group` origin is the visual centre of the head — place it directly.
 */
export function buildArchetypeHead(archetypeName) {
    const pal = ARCHETYPE_PALETTE[archetypeName] || ARCHETYPE_PALETTE.Anchor;

    const headH = HEAD_HEIGHT_PRESETS.medium.height;
    const headW = HEAD_WIDTH_PRESETS.moderate.width;
    const { geometry: headGeo, frontZ } = generateHeadGeometry('roundedBox', headW, headH);

    const headGroup = new THREE.Group();
    // The head geo sits with its bottom at y=0 inside this group — lift the
    // group by headH/2 so the outer `group` origin is the head's visual centre.
    headGroup.position.y = -headH / 2;

    const scalpSplitY = headH - headH * HEAD.scalpFraction;
    let headMat;
    try {
        headMat = createTwoZoneMaterial(pal.scalp, pal.face, scalpSplitY, 0.06);
    } catch {
        headMat = new THREE.MeshStandardMaterial({ color: pal.face, roughness: 0.6, metalness: 0.05 });
    }
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Eyes
    const exo = FACE_FEATURES.eye.xOffsetByWidth.moderate;
    const eyo = FACE_FEATURES.eye.yOffsetByHeight.medium;
    const myo = FACE_FEATURES.mouth.yOffsetByHeight.medium;
    const skinH = headH - headH * HEAD.scalpFraction;
    const skinCY = skinH / 2;
    const faceZ = frontZ + 0.005;

    const eyeTex = makeEyeTexture(pal.eye, 'circle');
    const eyeSize = FACE_FEATURES.eye.scleraDiameter * 1.3;
    const eyeGeo = new THREE.PlaneGeometry(eyeSize, eyeSize);
    const eyeMatL = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
    eyeL.position.set(-exo, skinCY + eyo, faceZ);
    headGroup.add(eyeL);

    const eyeTexR = eyeTex.clone();
    eyeTexR.needsUpdate = true;
    const eyeMatR = new THREE.MeshBasicMaterial({ map: eyeTexR, transparent: true, depthWrite: false });
    const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeMatR);
    eyeR.position.set(exo, skinCY + eyo, faceZ);
    headGroup.add(eyeR);

    // Mouth
    const mouthRig = new MouthRig();
    if (mouthRig.setLipColor) mouthRig.setLipColor(pal.lip);
    if (mouthRig.setLipThickness) mouthRig.setLipThickness(3.5);
    mouthRig.attach(headGroup, skinCY, myo, faceZ);
    mouthRig.update(MOUTH_REST);

    // Outer group — group origin = head visual centre
    const group = new THREE.Group();
    group.add(headGroup);

    function talk(amp) {
        mouthRig.update({ ...MOUTH_REST, jawOpen: Math.max(0, Math.min(0.9, amp || 0)) });
    }

    // Full viseme-driven mouth update. Accepts whatever VoiceEngine.getVisemeParams()
    // returns ({ jawOpen, lipWidth, lipRound, tongueUp, teethShow, ... }) so the
    // mouth shape mirrors the actual spoken sound, not just jaw open.
    function talkParams(params) {
        if (!params) { mouthRig.update(MOUTH_REST); return; }
        mouthRig.update({
            jawOpen:   Math.max(0, Math.min(0.9, params.jawOpen   ?? 0)),
            lipWidth:  params.lipWidth  ?? MOUTH_REST.lipWidth,
            lipRound:  params.lipRound  ?? MOUTH_REST.lipRound,
            tongueUp:  params.tongueUp  ?? MOUTH_REST.tongueUp,
            teethShow: params.teethShow ?? MOUTH_REST.teethShow,
        });
    }

    function dispose() {
        mouthRig.dispose?.();
        group.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
    }

    return { group, mouthRig, talk, talkParams, dispose };
}

// ── Shared head animator ───────────────────────────────────────
// Drives the story heads for one frame. Used by both previewRenderer
// (browse preview) and StoryBridge (edit view) so they stay visually
// identical. Each head entry must carry:
//   slot, container, basePos (Vector3), baseRotY (number), talk, talkParams.
// `amp` is 0..1 voice jaw-open; `visemeParams` is VoiceEngine.getVisemeParams()
// (optional — speaker mouth uses it when present, else falls back to amp).
export function animateStoryHeads(heads, { speakingSlot, amp, visemeParams, t }) {
    amp = Math.max(0, Math.min(1, amp || 0));
    for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        const speaking = h.slot === speakingSlot;

        // Idle sway — everyone drifts a bit so the scene never feels frozen.
        const idleBob = Math.sin(t * 1.25 + i * 1.3) * 0.012;
        const idleYaw = Math.sin(t * 0.8 + i * 0.9) * 0.02;

        // Speaker: amplitude-driven bob + head wiggle; scaled by instantaneous jaw open.
        const speakBob  = speaking ? (0.02 + amp * 0.09) * Math.sin(t * 9) : 0;
        const speakYaw  = speaking ? Math.sin(t * 7.5) * 0.05 * (0.3 + amp * 0.9) : 0;
        const speakRoll = speaking ? Math.sin(t * 5.5) * 0.03 * amp : 0;

        h.container.position.y = h.basePos.y + idleBob + speakBob;
        h.container.rotation.y = (h.baseRotY || 0) + idleYaw + speakYaw;
        h.container.rotation.z = speakRoll;

        // Mouth — speaker uses voice-driven viseme params when available.
        if (speaking) {
            if (visemeParams && h.talkParams) h.talkParams(visemeParams);
            else                              h.talk(amp);
        } else {
            h.talk(0);
        }
    }
}

// ── Subtitle overlay ────────────────────────────────────────────
// Anchored to the inside bottom-centre of #safe-area. A single DOM element is
// shared across the whole app — showSubtitle() sets the line's words and
// renders the first, then setSubtitleWord() advances one word at a time driven
// by the VisemeEngine's wordIdx.

const SUBTITLE_ID = 'story-subtitle';
const _subtitleState = { words: [], idx: -1 };

// Chunky pixel display font for subtitles + name tags. Press Start 2P is the
// canonical 8-bit pixel face; we load it once, the first time either element
// is created, and fall back to a system monospace so missing font files never
// leave us without a usable glyph.
const PIXEL_FONT_STACK = "'Press Start 2P', 'Silkscreen', 'Courier New', monospace";
function _ensurePixelFontLoaded() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('story-pixel-font-link')) return;
    const link = document.createElement('link');
    link.id = 'story-pixel-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(link);
}

function _ensureSubtitleEl() {
    let el = document.getElementById(SUBTITLE_ID);
    if (el) return el;
    _ensurePixelFontLoaded();
    el = document.createElement('div');
    el.id = SUBTITLE_ID;
    el.setAttribute('aria-live', 'polite');
    // Safe-area lives inside #ui-shell and uses calc(50% - 5vh) as its vertical
    // centre with height 70vh — so its bottom edge = calc(50% + 30vh) of
    // #ui-shell. The subtitle sits inside that same positioning context so the
    // percentages resolve against the same container, anchored 16px above the
    // frame's bottom edge.
    // Vertically centre the subtitle with the large play button so it tracks
    // the existing UI. #play-wrap sits at bottom:174px with a 72px tall button,
    // so the button's vertical centre is at bottom:(174+36)=210px. The
    // translate(-50%, 50%) aligns the subtitle's centre to that line.
    el.style.cssText = [
        'position:absolute',
        'left:50%',
        'bottom:210px',
        'transform:translate(-50%, 50%)',
        'max-width:min(80%, 720px)',
        'padding:10px 20px',
        'background:rgba(14,18,28,0.72)',
        'color:#fff',
        `font-family:${PIXEL_FONT_STACK}`,
        'font-size:15px',
        'font-weight:400',
        'letter-spacing:0.02em',
        'line-height:1.35',
        'border-radius:10px',
        'pointer-events:none',
        'text-align:center',
        'z-index:20',
        'opacity:0',
        'transition:opacity 180ms ease',
        'text-shadow:0 1px 3px rgba(0,0,0,0.6)',
        'backdrop-filter:blur(4px)',
        '-webkit-backdrop-filter:blur(4px)',
        'min-width:120px',
    ].join(';');
    const host = document.getElementById('ui-elements')
              || document.getElementById('ui-shell')
              || document.body;
    host.appendChild(el);
    return el;
}

export function showSubtitle(text) {
    const el = _ensureSubtitleEl();
    if (!text) {
        el.style.opacity = '0';
        _subtitleState.words = [];
        _subtitleState.idx = -1;
        return;
    }
    // Match VisemeEngine tokenization so wordIdx lines up.
    const words = String(text).split(/\s+/).filter(w => w.length > 0);
    _subtitleState.words = words;
    _subtitleState.idx = 0;
    el.textContent = words[0] || '';
    el.style.opacity = words.length ? '1' : '0';
}

export function setSubtitleWord(idx) {
    const words = _subtitleState.words;
    if (!words || words.length === 0) return;
    if (idx == null || idx < 0) return; // keep showing current word between visemes
    const clamped = Math.max(0, Math.min(words.length - 1, idx));
    if (clamped === _subtitleState.idx) return;
    _subtitleState.idx = clamped;
    const el = document.getElementById(SUBTITLE_ID);
    if (el) el.textContent = words[clamped];
}

export function hideSubtitle() {
    const el = document.getElementById(SUBTITLE_ID);
    if (el) el.style.opacity = '0';
    _subtitleState.words = [];
    _subtitleState.idx = -1;
}

export function removeSubtitle() {
    const el = document.getElementById(SUBTITLE_ID);
    if (el) el.remove();
    _subtitleState.words = [];
    _subtitleState.idx = -1;
}

// ── Floating name tags ──────────────────────────────────────────
// A single DOM layer (#story-name-tags) overlays the renderer. Each head's
// label (e.g. "Anchor-core") gets its own absolute-positioned child. Per frame
// we project each head's world position → NDC → pixel space inside the
// renderer's bounding rect. Only the currently-speaking head's tag is visible.

const NAME_TAGS_LAYER_ID = 'story-name-tags';

function _ensureNameTagsLayer(rendererEl) {
    let layer = document.getElementById(NAME_TAGS_LAYER_ID);
    if (layer && layer.parentNode) return layer;
    layer = document.createElement('div');
    layer.id = NAME_TAGS_LAYER_ID;
    layer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:0',
        'height:0',
        'pointer-events:none',
        'z-index:15',
    ].join(';');
    document.body.appendChild(layer);
    return layer;
}

function _getOrMakeTag(layer, slot, label) {
    const id = `name-tag-${slot}`;
    let tag = document.getElementById(id);
    if (tag) return tag;
    _ensurePixelFontLoaded();
    tag = document.createElement('div');
    tag.id = id;
    tag.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'transform:translate(-50%, -100%)',
        'padding:5px 12px',
        'background:rgba(14,18,28,0.72)',
        'color:#fff',
        `font-family:${PIXEL_FONT_STACK}`,
        'font-size:10px',
        'font-weight:400',
        'letter-spacing:0.04em',
        'border-radius:6px',
        'pointer-events:none',
        'white-space:nowrap',
        'opacity:0',
        'transition:opacity 160ms ease',
        'text-shadow:0 1px 2px rgba(0,0,0,0.5)',
        'backdrop-filter:blur(3px)',
        '-webkit-backdrop-filter:blur(3px)',
    ].join(';');
    tag.textContent = label;
    layer.appendChild(tag);
    return tag;
}

/**
 * Position + show/hide floating name tags for every head.
 * Call once per frame from the host's tick loop.
 */
export function updateStoryNameTags(heads, speakingSlot, camera, rendererEl) {
    if (!heads || heads.length === 0 || !camera || !rendererEl) return;
    const layer = _ensureNameTagsLayer(rendererEl);
    const rect = rendererEl.getBoundingClientRect();
    for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        if (!h || !h.container || !h.label) continue;
        const tag = _getOrMakeTag(layer, h.slot, h.label);
        if (h.slot !== speakingSlot) {
            tag.style.opacity = '0';
            continue;
        }
        // Project world-space top-of-head into pixel space.
        h.container.getWorldPosition(_NAME_TAG_WORLD);
        // Container origin is the head's visual centre. Medium head height is
        // 0.58, so its top is at +0.29 from centre. Keep ~0.17 clearance above
        // the head (a third less than the previous 0.25), so the label still
        // floats clearly but sits tighter to the character.
        _NAME_TAG_WORLD.y += 0.46;
        _NAME_TAG_WORLD.project(camera);
        // Behind camera → hide.
        if (_NAME_TAG_WORLD.z > 1) { tag.style.opacity = '0'; continue; }
        const px = rect.left + (_NAME_TAG_WORLD.x + 1) * 0.5 * rect.width;
        const py = rect.top  + (1 - (_NAME_TAG_WORLD.y + 1) * 0.5) * rect.height;
        tag.style.left = `${px}px`;
        tag.style.top  = `${py}px`;
        tag.style.opacity = '1';
    }
}

export function removeStoryNameTags() {
    const layer = document.getElementById(NAME_TAGS_LAYER_ID);
    if (layer) layer.remove();
}

// ── Playback driver ────────────────────────────────────────────
/**
 * Runs a beat-by-beat playback on top of a map of archetype heads.
 *
 * The driver is purely state — it advances through beats/lines and calls back
 * into the host (the bridge or the preview) with `onLine({ slot, label, text })`
 * and `onIdle()`. The host is responsible for actually showing the subtitle +
 * wiggling the head (via `talk(amp)` on the head handle).
 *
 * Returns a controller: { stop(), restart() }. `stop()` is safe to call
 * multiple times. Starting a new playback always stops the previous one.
 */
export function runStoryPlayback({
    beats,
    getLabelForSlot,
    getArchetypeForSlot,
    onLine,
    onIdle,
    speakLine,
    loop = true,
    loopPauseMs = 1600,
}) {
    let token = {};
    let stopped = false;

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    async function play() {
        const myToken = token;
        if (!beats || beats.length === 0) { onIdle?.(); return; }
        while (!stopped && myToken === token) {
            for (let bi = 0; bi < beats.length; bi++) {
                if (stopped || myToken !== token) return;
                const lines = beats[bi].lines || [];
                for (let li = 0; li < lines.length; li++) {
                    if (stopped || myToken !== token) return;
                    const line = lines[li];
                    const slot = line.speaker;
                    const text = line.text || '';
                    const label = getLabelForSlot?.(slot) || slot;
                    const archetype = getArchetypeForSlot?.(slot) || null;
                    const fallbackDuration = Math.max(1400, Math.min(5500, text.length * 55));
                    onLine?.({ slot, label, text, duration: fallbackDuration, beatIdx: bi, lineIdx: li });
                    if (speakLine) {
                        // Speak the line; fall back to the timed duration if the
                        // engine rejects or stalls.
                        const spoken = Promise.resolve(
                            speakLine(text, archetype, slot)
                        ).catch(() => null);
                        const timeout = sleep(fallbackDuration + 4000);
                        await Promise.race([spoken, timeout]);
                    } else {
                        await sleep(fallbackDuration);
                    }
                    if (stopped || myToken !== token) return;
                    onLine?.({ slot: null, label: null, text: null, duration: 0, silent: true });
                    await sleep(260);
                }
                await sleep(600);
            }
            onIdle?.();
            if (!loop) return;
            await sleep(loopPauseMs);
        }
    }

    play();

    return {
        stop() {
            stopped = true;
            token = {};
        },
        restart() {
            stopped = false;
            token = {};
            play();
        },
    };
}

// ── Voice helper ──────────────────────────────────────────────
/**
 * Speak a line through a shared VoiceEngine, applying archetype-specific
 * variant + pitch + speed tweaks so each character sounds distinct.
 * Returns a Promise that resolves when the line finishes (or is stopped).
 *
 * The caller passes a `baseState` (the voice asset's applyState payload, or
 * null) which is re-applied before every line so per-archetype offsets don't
 * accumulate across lines.
 */
export function speakWithArchetype(voiceEngine, { text, archetype, baseState }) {
    if (!voiceEngine || !text) return Promise.resolve();
    return new Promise((resolve) => {
        const voiceCfg = ARCHETYPE_VOICE[archetype] || null;

        // Reset to base so offsets don't stack across lines.
        if (baseState && voiceEngine.applyState) voiceEngine.applyState(baseState);

        if (voiceCfg) {
            if (voiceCfg.variant && voiceEngine.setVariant) {
                voiceEngine.setVariant(voiceCfg.variant);
            }
            const basePitch = voiceEngine.voiceParams?.pitch ?? 50;
            const baseSpeed = voiceEngine.voiceParams?.speed ?? 175;
            if (voiceEngine.setPitch) {
                voiceEngine.setPitch(Math.max(0, Math.min(99, basePitch + (voiceCfg.pitchDelta || 0))));
            }
            if (voiceEngine.setSpeed) {
                voiceEngine.setSpeed(Math.max(80, Math.min(450, baseSpeed + (voiceCfg.speedDelta || 0))));
            }
        }

        const prevEnd = voiceEngine.onSpeakEnd;
        voiceEngine.onSpeakEnd = () => {
            voiceEngine.onSpeakEnd = prevEnd;
            resolve();
        };

        try {
            voiceEngine.speak(text);
        } catch {
            voiceEngine.onSpeakEnd = prevEnd;
            resolve();
        }
    });
}
