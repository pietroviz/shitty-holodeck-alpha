/**
 * SimulationBridge.js — Simulation asset editor bridge.
 *
 * A simulation binds together an environment, 3 characters, a music
 * track, and a story. On playback, the music loops and the story
 * beats read through via the shared voice engine, using archetype
 * heads as V1 stand-ins for the picked characters.
 *
 * Tabs: File · Setup · Other
 *
 * Setup:  environment slot + 3 character slots (CHAR_A/B/C).
 * Other:  music slot, story slot, camera + post-effects (coming soon).
 *
 * Each slot has Swap (dropdown) + dice (random) + edit (drill-down
 * into that asset's bridge). On new, Surprise Me rolls a full sim.
 */

import { BaseBridge } from './BaseBridge.js?v=3';
import { renderFileTab, wireFileTabEvents, DICE_ICON, tweenToPose } from '../shared/builderUI.js';
import { loadGlobalAssets } from '../assetLoader.js';
import { setRef, getRef, dbGetAll } from '../db.js?v=2';
import { EnvironmentBridge } from './EnvironmentBridge.js?v=41';
import { CharacterBridge }   from './CharacterBridge.js?v=3';
import { MusicBridge }       from './MusicBridge.js?v=2';
import { StoryBridge }       from './StoryBridge.js?v=4';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoiceEngine } from '../shared/voiceEngine.js';
import { MusicEngine } from '../shared/musicEngine.js';
import {
    buildArchetypeHead,
    runStoryPlayback,
    showSubtitle,
    hideSubtitle,
    removeSubtitle,
    setSubtitleWord,
    updateStoryNameTags,
    removeStoryNameTags,
    pickThreeBeats,
    speakWithArchetype,
    animateStoryHeads,
} from '../shared/archetypeHead.js?v=2';
import { buildEnvScene } from '../shared/envScene.js?v=2';
import { buildCharacterMesh } from '../shared/characterMesh.js?v=2';

const SIM_BASE_VOICE = { speed: 175, pitch: 50, amplitude: 100, wordgap: 0, variant: 'm3' };

const TABS = [
    { id: 'file',  label: 'File',  icon: '📄' },
    { id: 'setup', label: 'Setup', icon: '🎬' },
    { id: 'other', label: 'Other', icon: '✨' },
];

const CAST_SLOTS = ['CHAR_A', 'CHAR_B', 'CHAR_C'];

// Default starter archetypes if we have no story yet.
const DEFAULT_ARCHETYPES = { CHAR_A: 'Edge', CHAR_B: 'Bloom', CHAR_C: 'Glitch' };

// Triangle stage framing. Full-body characters stand on the ground (y=0);
// archetype-head fallbacks are lifted in _buildCast so their heads float at
// a similar height to a real character's head.
const SLOT_POSITIONS = {
    CHAR_B: [-0.85, 0, -0.55],
    CHAR_A: [ 0.00, 0,  0.00],
    CHAR_C: [ 0.85, 0, -0.55],
};
const SLOT_ROT_Y = { CHAR_B: 0.55, CHAR_A: 0, CHAR_C: -0.55 };
const ARCHETYPE_HEAD_LIFT_Y = 0.95;   // match previous head-only look when no char asset
const INITIAL_CAM_POS    = new THREE.Vector3(0, 2.0, 4.8);
const INITIAL_CAM_TARGET = new THREE.Vector3(0, 1.0, -0.25);

// Closed-mouth rest pose fed to non-speaking characters each tick so their
// viseme shapes don't freeze mid-word when the speaker changes.
const MOUTH_REST_PARAMS = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };

const THUMB_PATH = 'thumbnails';

function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));
}
function _pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// Build a thumb <img> for an asset; falls back to an emoji placeholder.
// Mirrors app.js _thumbHTML but scoped to the bridge's card layout.
const SLOT_PLACEHOLDER = {
    environment: { icon: '🌄', bg: '#2A3240' },
    character:   { icon: '👤', bg: '#2A3240' },
    music:       { icon: '🎵', bg: '#2A3240' },
    story:       { icon: '📖', bg: '#2A3240' },
};
function _thumbHTML(asset, typeKey) {
    const ph = SLOT_PLACEHOLDER[typeKey] || { icon: '•', bg: '#2A3240' };
    if (!asset) {
        return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${ph.bg};border-radius:6px;font-size:22px;">${ph.icon}</span>`;
    }
    if (asset.meta?.owner !== 'user') {
        return `<img src="${THUMB_PATH}/${_esc(asset.id)}.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;align-items:center;justify-content:center;width:100%;height:100%;background:${ph.bg};border-radius:6px;font-size:22px;">${ph.icon}</span>`;
    }
    const cached = asset.meta?.thumbnail;
    if (cached) return `<img src="${cached}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
    return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${ph.bg};border-radius:6px;font-size:22px;">${ph.icon}</span>`;
}

/**
 * A slot card: 64×64 thumb on the left, name + dropdown + dice + edit on the right.
 *   - key     — DOM data-key for event wiring ('env' | 'char_A' | 'music' | 'story')
 *   - label   — slot label (e.g. "Environment", "CHAR_A")
 *   - asset   — currently picked asset (or null)
 *   - typeKey — 'environment' | 'character' | 'music' | 'story' for the placeholder
 *   - options — [{id, name}] for the dropdown
 *   - editable — whether to show the Edit button (requires an asset)
 *   - emphasis — optional short string below the name (e.g. "— main character")
 */
function _renderSlotCard({ key, label, asset, typeKey, options, editable = true, emphasis = '' }) {
    const name    = asset?.name || '— not chosen —';
    const opts    = options.map(o =>
        `<option value="${_esc(o.id)}" ${asset && o.id === asset.id ? 'selected' : ''}>${_esc(o.name || o.id)}</option>`
    ).join('');
    const editDisabled = (!editable || !asset) ? 'disabled' : '';
    return `
      <div class="cb-field" style="padding:10px;">
        <div style="display:flex;gap:10px;align-items:center;">
          <div style="width:64px;height:64px;flex-shrink:0;">
            ${_thumbHTML(asset, typeKey)}
          </div>
          <div style="flex:1;min-width:0;">
            <div class="cb-label" style="margin-bottom:4px;">${_esc(label)}${emphasis ? ` <span style="opacity:.6;font-weight:400;">${_esc(emphasis)}</span>` : ''}</div>
            <div class="cb-hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;">${_esc(name)}</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="cb-select sim-slot-select" data-key="${_esc(key)}" style="flex:1;min-width:0;">
                <option value="">— random —</option>
                ${opts}
              </select>
              <button class="cb-field-surprise sim-slot-dice" data-key="${_esc(key)}" aria-label="Random" title="Random">${DICE_ICON}</button>
              <button class="cb-shape-btn sim-slot-edit" data-key="${_esc(key)}" ${editDisabled} title="Edit" style="padding:4px 10px;">✏️</button>
            </div>
          </div>
        </div>
      </div>`;
}

export class SimulationBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Simulation';
        this.storeName   = 'simulations';

        const saved = this.asset?.payload?.state || this.asset?.state || {};

        this._state = {
            envId:   saved.envId   || null,
            musicId: saved.musicId || null,
            storyId: saved.storyId || null,
            cast:    saved.cast?.length ? structuredClone(saved.cast) : [
                { slot: 'CHAR_A', charId: null, archetype: DEFAULT_ARCHETYPES.CHAR_A },
                { slot: 'CHAR_B', charId: null, archetype: DEFAULT_ARCHETYPES.CHAR_B },
                { slot: 'CHAR_C', charId: null, archetype: DEFAULT_ARCHETYPES.CHAR_C },
            ],
            beats:          structuredClone(saved.beats || []),
            location:       saved.location       || null,
            tension_level:  saved.tension_level  || null,
            emotional_arc:  saved.emotional_arc  || null,
        };

        this._activeTab = 'setup';

        this._envs   = null;
        this._chars  = null;
        this._music  = null;
        this._stories = null;

        this._heads = [];            // one entry per cast slot: { slot, container, talk?, dispose, isArchetype }
        this._envHandle = null;      // { group, walls, weather, tick, dispose } from buildEnvScene
        this._castEpoch = 0;         // bumped each _buildCast — stale async builds drop their results
        this._speakingSlot = null;
        this._playback = null;
        this._isPlaying = false;

        this._voiceEngine = null;
        this._voiceReady  = false;
        this._musicEngine = null;
        this._musicReady  = false;
    }

    async _initVoice() {
        this._voiceEngine = new VoiceEngine();
        try {
            await this._voiceEngine.init();
            this._voiceEngine.applyState(SIM_BASE_VOICE);
            this._voiceReady = true;
        } catch (e) { console.warn('[SimulationBridge] voice init:', e.message); }
    }
    async _initMusic() {
        this._musicEngine = new MusicEngine();
        try {
            await this._musicEngine.init();
            this._musicReady = true;
        } catch (e) { console.warn('[SimulationBridge] music init:', e.message); }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE
    // ═══════════════════════════════════════════════════════════════

    async _buildScene() {
        // BaseBridge adds default ground/lights. The env owns its own look,
        // so strip those before building.
        this._stripBaseSceneDefaults();

        this._camera.position.copy(INITIAL_CAM_POS);
        this._camera.lookAt(INITIAL_CAM_TARGET);
        this._camera.fov = 50;
        this._camera.updateProjectionMatrix();

        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.target.copy(INITIAL_CAM_TARGET);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance   = 2;
        this._controls.maxDistance   = 12;
        this._controls.maxPolarAngle = Math.PI * 0.85;
        this._controls.update();

        this._initVoice();
        this._initMusic();

        await this._loadCatalogs();

        if (!this._state.storyId && !this._state.envId) {
            await this._rollAll();
        }

        this._rebuildEnv();
        await this._buildCast();
    }

    _stripBaseSceneDefaults() {
        const toRemove = [];
        this._scene.traverse(obj => {
            if (obj === this._scene) return;
            if (obj.isMesh || obj.isLine || obj.isGridHelper || obj.isLight) {
                toRemove.push(obj);
            }
        });
        for (const obj of toRemove) {
            obj.geometry?.dispose?.();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
            else obj.material?.dispose?.();
            this._scene.remove(obj);
        }
        this._scene.background = null;
    }

    async _loadCatalogs() {
        const [envs, chars, music, stories, userEnvs, userChars, userMusic, userStories] = await Promise.all([
            loadGlobalAssets('Environments'),
            loadGlobalAssets('Characters'),
            loadGlobalAssets('Music'),
            loadGlobalAssets('Stories'),
            dbGetAll('environments').catch(() => []),
            dbGetAll('characters').catch(() => []),
            dbGetAll('music').catch(() => []),
            dbGetAll('stories').catch(() => []),
        ]);
        const merge = (globalList, userList) => {
            const out = (globalList || []).slice();
            const seen = new Set(out.map(a => a.id));
            for (const a of (userList || [])) {
                if (!seen.has(a.id)) { out.push(a); seen.add(a.id); }
            }
            return out;
        };
        this._envs    = merge(envs,    userEnvs);
        this._chars   = merge(chars,   userChars);
        this._music   = merge(music,   userMusic);
        this._stories = merge(stories, userStories);
    }

    _findEnv(id)   { return this._envs?.find(e => e.id === id) || null; }
    _findChar(id)  { return this._chars?.find(c => c.id === id) || null; }
    _findMusic(id) { return this._music?.find(m => m.id === id) || null; }
    _findStory(id) { return this._stories?.find(s => s.id === id) || null; }

    // ── Rolling / applying ────────────────────────────────────────
    async _rollAll() {
        const env   = _pick(this._envs);
        const story = _pick(this._stories);
        const music = _pick(this._music);
        if (env)   this._applyEnv(env);
        if (story) await this._applyStory(story);
        if (music) this._applyMusic(music);
        // Fill any empty cast slots with random characters
        for (const c of this._state.cast) {
            if (!c.charId) {
                const char = _pick(this._chars);
                if (char) this._applyChar(c.slot, char);
            }
        }
    }

    _applyEnv(env) {
        this._state.envId = env.id;
        if (this.asset) setRef(this.asset, 'environment', env);
    }
    _applyMusic(music) {
        this._state.musicId = music.id;
        if (this.asset) setRef(this.asset, 'music', music);
    }
    _applyChar(slot, char) {
        const entry = this._state.cast.find(c => c.slot === slot);
        if (!entry) return;
        entry.charId = char.id;
        if (this.asset) setRef(this.asset, `char_${slot}`, char);
    }
    async _applyStory(story) {
        const st = story.payload?.state || story.state || {};
        this._state.storyId       = story.id;
        this._state.beats         = pickThreeBeats(Array.isArray(st.beats) ? st.beats : []);
        this._state.tension_level = st.tension_level || null;
        this._state.emotional_arc = st.emotional_arc || null;
        this._state.location      = st.location || null;

        // Pull archetypes from the story's cast — they drive voice + head colour
        // even when the user has their own character assets in each slot.
        const storyCast = Array.isArray(st.cast) ? st.cast : [];
        for (const c of this._state.cast) {
            const match = storyCast.find(sc => sc.slot === c.slot);
            c.archetype = match?.archetype || DEFAULT_ARCHETYPES[c.slot] || 'Anchor';
        }

        if (this.asset) setRef(this.asset, 'story', story);
    }

    // ── Environment ──
    _rebuildEnv() {
        if (this._envHandle) { this._envHandle.dispose(); this._envHandle = null; }
        if (!this._state.envId) return;
        const env = this._findEnv(this._state.envId);
        if (!env) return;
        this._envHandle = buildEnvScene(this._scene, env);
    }

    // ── Cast (full characters when charId present, archetype heads otherwise) ──
    async _buildCast() {
        const epoch = ++this._castEpoch;

        for (const entry of this._heads) {
            if (entry.container.parent) entry.container.parent.remove(entry.container);
            entry.dispose?.();
        }
        this._heads = [];

        const promises = (this._state.cast || []).map(async (cast) => {
            const pos  = SLOT_POSITIONS[cast.slot] || [0, 0, 0];
            const rotY = SLOT_ROT_Y[cast.slot] || 0;

            const charAsset = cast.charId ? this._findChar(cast.charId) : null;
            const container = new THREE.Group();
            container.position.set(...pos);
            container.rotation.y = rotY;

            const label = `${cast.archetype}-core`;

            let entry;
            if (charAsset) {
                try {
                    const mesh = await buildCharacterMesh(charAsset);
                    if (epoch !== this._castEpoch) { mesh.dispose(); return null; }
                    container.add(mesh.group);
                    entry = {
                        slot: cast.slot,
                        container,
                        basePos: container.position.clone(),
                        baseRotY: rotY,
                        label,
                        // Container sits at ground (y=0); top of head is at
                        // totalHeight. Add 0.17 clearance so the tag floats
                        // just above, matching the archetype-head spacing.
                        labelOffsetY: (mesh.totalHeight || 1.7) + 0.17,
                        mouthRig: mesh.mouthRig,
                        facialHairRig: mesh.facialHairRig,
                        dispose: () => mesh.dispose(),
                        isArchetype: false,
                    };
                } catch (e) {
                    console.warn('[SimulationBridge] character build failed, falling back to archetype head:', e);
                }
            }

            if (!entry) {
                const head = buildArchetypeHead(cast.archetype);
                container.add(head.group);
                container.position.y = ARCHETYPE_HEAD_LIFT_Y;
                entry = {
                    slot: cast.slot,
                    container,
                    basePos: container.position.clone(),
                    baseRotY: rotY,
                    label,
                    talk: head.talk,
                    talkParams: head.talkParams,
                    dispose: head.dispose,
                    isArchetype: true,
                };
            }

            if (epoch !== this._castEpoch) { entry.dispose?.(); return null; }
            this._scene.add(container);
            return entry;
        });

        const results = await Promise.all(promises);
        if (epoch !== this._castEpoch) return;   // a newer build superseded us
        this._heads = results.filter(Boolean);

        if (this._isPlaying) this._restartPlayback();
    }

    _onTick(delta) {
        if (this._voiceEngine) this._voiceEngine.update((delta || 0) * 1000);
        if (this._controls)    this._controls.update();
        if (this._envHandle)   this._envHandle.tick(delta, this._camera);
        const visemeParams = this._voiceEngine ? this._voiceEngine.getVisemeParams() : null;
        const amp = visemeParams ? Math.max(0, Math.min(1, visemeParams.jawOpen || 0)) : 0;
        const t = performance.now() * 0.001;

        // Archetype heads use the shared story animator (it calls .talk internally).
        const archetypeHeads = this._heads.filter(h => h.isArchetype);
        if (archetypeHeads.length) {
            animateStoryHeads(archetypeHeads, {
                speakingSlot: this._speakingSlot,
                amp,
                visemeParams,
                t,
            });
        }

        // Full-body characters: idle sway + speak bob, and drive mouth + facial
        // hair from voice engine. Speaker gets live viseme params; everyone else
        // resets to a closed-mouth rest pose so lips don't freeze mid-shape.
        for (let i = 0; i < this._heads.length; i++) {
            const h = this._heads[i];
            if (h.isArchetype) continue;
            const speaking = h.slot === this._speakingSlot;
            const idleBob = Math.sin(t * 1.25 + i * 1.3) * 0.012;
            const idleYaw = Math.sin(t * 0.8  + i * 0.9) * 0.02;
            const speakBob = speaking ? (0.02 + amp * 0.06) * Math.sin(t * 9) : 0;
            const speakYaw = speaking ? Math.sin(t * 7.5) * 0.04 * (0.3 + amp * 0.9) : 0;
            h.container.position.y = h.basePos.y + idleBob + speakBob;
            h.container.rotation.y = (h.baseRotY || 0) + idleYaw + speakYaw;

            const params = (speaking && visemeParams)
                ? visemeParams
                : MOUTH_REST_PARAMS;
            h.mouthRig?.update(params);
            h.facialHairRig?.update(params);
        }

        // Floating archetype name over the speaking head + one-word-at-a-time subtitle.
        updateStoryNameTags(this._heads, this._speakingSlot, this._camera, this._renderer.domElement);
        if (this._speakingSlot && visemeParams && visemeParams.wordIdx >= 0) {
            setSubtitleWord(visemeParams.wordIdx);
        }
    }

    resetView() {
        if (!this._controls || !this._camera) return;
        this._resetCancel?.();
        this._resetCancel = tweenToPose(
            this._camera, this._controls,
            INITIAL_CAM_POS.clone(),
            INITIAL_CAM_TARGET.clone(),
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLAYBACK
    // ═══════════════════════════════════════════════════════════════

    _stopPlayback() {
        if (this._playback) { this._playback.stop(); this._playback = null; }
        this._speakingSlot = null;
        if (this._voiceEngine) this._voiceEngine.stop();
        if (this._musicEngine) this._musicEngine.stop();
        hideSubtitle();
    }

    _restartPlayback() {
        this._stopPlayback();
        const beats = this._state.beats || [];

        if (this._state.musicId && this._musicReady && this._musicEngine) {
            const track = this._findMusic(this._state.musicId);
            if (track) { try { this._musicEngine.play(track); } catch (_) {} }
        }

        if (beats.length === 0) return;

        this._playback = runStoryPlayback({
            beats,
            getLabelForSlot: (slot) => {
                const cast = this._state.cast.find(c => c.slot === slot);
                return cast ? `${cast.archetype}-core` : slot;
            },
            getArchetypeForSlot: (slot) => {
                const cast = this._state.cast.find(c => c.slot === slot);
                return cast?.archetype || null;
            },
            onLine: ({ slot, text, silent }) => {
                if (silent) { this._speakingSlot = null; hideSubtitle(); return; }
                this._speakingSlot = slot;
                showSubtitle(text);
            },
            onIdle: () => { this._speakingSlot = null; hideSubtitle(); },
            speakLine: async (text, archetype) => {
                if (!this._voiceReady || !this._voiceEngine) return;
                await speakWithArchetype(this._voiceEngine, {
                    text, archetype, baseState: SIM_BASE_VOICE,
                });
            },
            loop: true,
        });
    }

    play() {
        if (this._isPlaying) return;
        if ((this._state.beats?.length ?? 0) === 0 && !this._state.musicId) return;
        this._isPlaying = true;
        this._restartPlayback();
        this._renderPanel();
    }
    stopPlayback() {
        if (!this._isPlaying) return;
        this._isPlaying = false;
        this._stopPlayback();
        this._renderPanel();
        document.dispatchEvent(new CustomEvent('bridge-play-state', { detail: { playing: false } }));
    }
    _togglePlay() { this._isPlaying ? this.stopPlayback() : this.play(); }

    suspend() {
        if (this._isPlaying) this.stopPlayback();
        super.suspend?.();
    }

    destroy() {
        const wasPlaying = this._isPlaying;
        this._isPlaying = false;
        this._stopPlayback();
        removeSubtitle();
        removeStoryNameTags();
        this._castEpoch++;   // invalidate any in-flight async character builds
        for (const entry of this._heads) {
            if (entry.container.parent) entry.container.parent.remove(entry.container);
            entry.dispose?.();
        }
        this._heads = [];
        if (this._envHandle) { this._envHandle.dispose(); this._envHandle = null; }
        if (this._controls) { this._controls.dispose(); this._controls = null; }
        if (wasPlaying) {
            document.dispatchEvent(new CustomEvent('bridge-play-state', { detail: { playing: false } }));
        }
        super.destroy();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL
    // ═══════════════════════════════════════════════════════════════

    _renderPanelBody() {
        const tab = this._activeTab;
        const tabBar = `<div class="cb-tabs-list">${
            TABS.map(t =>
                `<button class="cb-tab-trigger ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">
                    <span class="cb-tab-icon">${t.icon}</span>${t.label}
                 </button>`
            ).join('')
        }</div>`;

        let body = '';
        if (tab === 'file')  body = this._renderFileTab();
        if (tab === 'setup') body = this._renderSetupTab();
        if (tab === 'other') body = this._renderOtherTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Simulation name…',
            descPlaceholder: 'What happens in this simulation?',
            tagsPlaceholder: 'e.g. fantasy, conflict, reunion',
        });
    }

    _renderSurpriseHeader() {
        const playIcon  = this._isPlaying ? '■' : '▶';
        const playLabel = this._isPlaying ? 'Stop' : 'Play';
        return `
          <div class="cb-section">
            <button class="cb-shape-btn sim-surprise-all" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;margin-bottom:8px;">
              <span style="width:18px;height:18px;display:inline-flex;">${DICE_ICON}</span>
              Surprise Me — roll a new simulation
            </button>
            <button class="vb-play-btn sim-play-btn${this._isPlaying ? ' speaking' : ''}" style="width:100%;">${playIcon} ${playLabel}</button>
          </div>`;
    }

    _renderSetupTab() {
        const env = this._state.envId ? this._findEnv(this._state.envId) : null;

        const envCard = _renderSlotCard({
            key: 'env',
            label: 'Environment',
            asset: env,
            typeKey: 'environment',
            options: this._envs || [],
        });

        const castCards = this._state.cast.map((c, i) => {
            const char = c.charId ? this._findChar(c.charId) : null;
            return _renderSlotCard({
                key: `char_${c.slot}`,
                label: c.slot,
                asset: char,
                typeKey: 'character',
                options: this._chars || [],
                emphasis: i === 0 ? '— main character' : `— ${c.archetype}-core`,
            });
        }).join('');

        return this._renderSurpriseHeader() + `
          <div class="cb-section">
            <div class="cb-section-title">Environment</div>
            ${envCard}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Cast</div>
            ${castCards}
          </div>`;
    }

    _renderOtherTab() {
        const music = this._state.musicId ? this._findMusic(this._state.musicId) : null;
        const story = this._state.storyId ? this._findStory(this._state.storyId) : null;

        const musicCard = _renderSlotCard({
            key: 'music',
            label: 'Music Theme',
            asset: music,
            typeKey: 'music',
            options: this._music || [],
        });
        const storyCard = _renderSlotCard({
            key: 'story',
            label: 'Story',
            asset: story,
            typeKey: 'story',
            options: this._stories || [],
            emphasis: '— drives dialogue',
        });

        return this._renderSurpriseHeader() + `
          <div class="cb-section">
            <div class="cb-section-title">Music</div>
            ${musicCard}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Story</div>
            ${storyCard}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Camera</div>
            <div class="cb-hint">Camera styles — coming soon.</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Post Effects</div>
            <div class="cb-hint">Post effects — coming soon.</div>
          </div>`;
    }

    _wirePanelEvents() {
        const panel = this.panelEl;

        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        if (this._activeTab === 'file') {
            wireFileTabEvents(panel, this, { formatType: 'simulation_state' });
            return;
        }

        panel.querySelector('.sim-surprise-all')?.addEventListener('click', async () => {
            // Clear cast character picks so _rollAll re-rolls them.
            for (const c of this._state.cast) c.charId = null;
            await this._rollAll();
            this._rebuildEnv();
            await this._buildCast();
            this._scheduleAutoSave();
            this._renderPanel();
        });
        panel.querySelector('.sim-play-btn')?.addEventListener('click', () => this._togglePlay());

        panel.querySelectorAll('.sim-slot-select').forEach(sel => {
            sel.addEventListener('change', (e) => this._onSlotSwap(sel.dataset.key, e.target.value));
        });
        panel.querySelectorAll('.sim-slot-dice').forEach(btn => {
            btn.addEventListener('click', () => this._onSlotDice(btn.dataset.key));
        });
        panel.querySelectorAll('.sim-slot-edit').forEach(btn => {
            btn.addEventListener('click', () => this._onSlotEdit(btn.dataset.key));
        });
    }

    async _onSlotSwap(key, value) {
        if (!value) { this._onSlotDice(key); return; }
        await this._assignSlotById(key, value);
        await this._applySlotChangeToScene(key);
        this._scheduleAutoSave();
        this._renderPanel();
    }

    async _onSlotDice(key) {
        const catalog = this._catalogForKey(key);
        const pick = _pick(catalog);
        if (!pick) return;
        await this._assignSlotById(key, pick.id);
        await this._applySlotChangeToScene(key);
        this._scheduleAutoSave();
        this._renderPanel();
    }

    // Translate a slot-key change into the minimal scene rebuild.
    async _applySlotChangeToScene(key) {
        if (key === 'env')                  this._rebuildEnv();
        else if (key === 'story')           await this._buildCast();  // story swap updates archetypes
        else if (key.startsWith('char_'))   await this._buildCast();
        // music/other: no scene impact beyond playback
    }

    _onSlotEdit(key) {
        const ref = this._refForKey(key);
        if (!ref) return;
        const BridgeClass = this._bridgeForKey(key);
        if (!BridgeClass) return;
        const label = this._labelForKey(key);
        if (this.onDrillDown) this.onDrillDown(BridgeClass, ref, label);
    }

    _catalogForKey(key) {
        if (key === 'env')   return this._envs;
        if (key === 'music') return this._music;
        if (key === 'story') return this._stories;
        if (key.startsWith('char_')) return this._chars;
        return [];
    }

    _bridgeForKey(key) {
        if (key === 'env')   return EnvironmentBridge;
        if (key === 'music') return MusicBridge;
        if (key === 'story') return StoryBridge;
        if (key.startsWith('char_')) return CharacterBridge;
        return null;
    }

    _labelForKey(key) {
        if (key === 'env')   return 'Environment';
        if (key === 'music') return 'Music';
        if (key === 'story') return 'Story';
        if (key.startsWith('char_')) return 'Character';
        return '';
    }

    _refForKey(key) {
        if (!this.asset) return null;
        if (key === 'env')   return getRef(this.asset, 'environment');
        if (key === 'music') return getRef(this.asset, 'music');
        if (key === 'story') return getRef(this.asset, 'story');
        if (key.startsWith('char_')) return getRef(this.asset, key);
        return null;
    }

    async _assignSlotById(key, id) {
        if (key === 'env') {
            const env = this._findEnv(id);
            if (env) this._applyEnv(env);
        } else if (key === 'music') {
            const music = this._findMusic(id);
            if (music) this._applyMusic(music);
        } else if (key === 'story') {
            const story = this._findStory(id);
            if (story) await this._applyStory(story);
        } else if (key.startsWith('char_')) {
            const slot = key.slice('char_'.length); // CHAR_A/B/C
            const char = this._findChar(id);
            if (char) this._applyChar(slot, char);
        }
    }

    _onResume(savedAsset) {
        if (!savedAsset) return;
        // A child bridge returned — update the matching ref + runtime state.
        if (savedAsset.type === 'environment') {
            this._applyEnv(savedAsset);
            this._rebuildEnv();
        } else if (savedAsset.type === 'music') {
            this._applyMusic(savedAsset);
        } else if (savedAsset.type === 'story') {
            this._applyStory(savedAsset).then(async () => {
                await this._buildCast();
                this._renderPanel();
            });
            return;
        } else if (savedAsset.type === 'character') {
            // Find which slot points at this char and update the ref snapshot.
            const match = this._state.cast.find(c => c.charId === savedAsset.id);
            if (match) this._applyChar(match.slot, savedAsset);
            this._buildCast();
        }
        this._renderPanel();
    }

    _getState() { return this._state; }

    _applyState(state) {
        this._state = structuredClone(state);
        this._rebuildEnv();
        this._buildCast();
    }
}
