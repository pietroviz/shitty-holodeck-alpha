/**
 * StoryBridge.js — Story asset editor bridge.
 *
 * Tabs: File · Setup · Story
 *
 * File   — name, description, tags
 * Setup  — pick an archetype for each cast slot (CHAR_A/B/C),
 *          choose tension level and emotional arc
 * Story  — read-through of the matched narreme sequence
 *
 * Behaviour: as the user changes any Setup dial, the bridge looks up
 * the closest matching sequence in the 743-entry corpus bundle and
 * swaps its beats + cast details into the current asset. The 3D scene
 * shows three archetype badges placed where CHAR_A/B/C stand in the
 * default environment layout.
 */

import { BaseBridge } from './BaseBridge.js?v=4';
import { renderFileTab, wireFileTabEvents, tweenToPose } from '../shared/builderUI.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { standard } from '../shared/materials.js';
import { VoiceEngine } from '../shared/voiceEngine.js';
import {
    buildArchetypeHead,
    runStoryPlayback,
    showSubtitle,
    setSubtitleWord,
    hideSubtitle,
    removeSubtitle,
    updateStoryNameTags,
    removeStoryNameTags,
    pickThreeBeats,
    speakWithArchetype,
    animateStoryHeads,
} from '../shared/archetypeHead.js?v=4';

// Neutral default voice params — the VoiceEngine is re-applied to these at
// the top of every spoken line so per-archetype pitch/speed deltas don't
// accumulate across the read-through.
const STORY_BASE_VOICE = { speed: 175, pitch: 50, amplitude: 100, wordgap: 0, variant: 'm3' };

// ── Tab definitions ─────────────────────────────────────────────
const TABS = [
    { id: 'file',  label: 'File',  icon: '📄' },
    { id: 'setup', label: 'Setup', icon: '🎭' },
    { id: 'story', label: 'Story', icon: '📖' },
];

// ── The 12 archetypes (ordered; matches corpus) ────────────────
// Each has its own colour so badges read at a glance.
const ARCHETYPES = [
    { name: 'Anchor',   emoji: '⚓', color: '#6b8caf', loves: 'being understood',            fears: 'being overlooked' },
    { name: 'Bloom',    emoji: '🌱', color: '#7dbf6e', loves: 'believing in people',         fears: 'being made to feel naive' },
    { name: 'Champion', emoji: '🛡️', color: '#d49d3f', loves: 'rising to the moment',        fears: 'letting the group down' },
    { name: 'Compass',  emoji: '🧭', color: '#8a7cd1', loves: 'the next unknown',            fears: 'being stuck' },
    { name: 'Crown',    emoji: '👑', color: '#d4b23f', loves: 'holding it together',         fears: 'losing control of the room' },
    { name: 'Edge',     emoji: '⚡', color: '#e0c447', loves: 'calling it straight',         fears: 'being managed or softened' },
    { name: 'Flame',    emoji: '🔥', color: '#e05f3f', loves: 'feeling it all the way',      fears: 'being dismissed as too much' },
    { name: 'Glitch',   emoji: '👾', color: '#9f5fc4', loves: 'breaking the pattern',        fears: 'being taken too seriously' },
    { name: 'Magic',    emoji: '✨', color: '#c47cc4', loves: 'making things happen',        fears: 'being seen as all talk' },
    { name: 'Maker',    emoji: '🔨', color: '#8a6a4f', loves: 'bringing an idea into the world', fears: 'the thing not being good' },
    { name: 'Nest',     emoji: '🪺', color: '#b29d6e', loves: 'taking care of people',       fears: 'not being needed' },
    { name: 'Signal',   emoji: '📡', color: '#5fb2c4', loves: 'seeing the pattern first',    fears: 'being wrong in public' },
];
const ARCHETYPE_BY_NAME = new Map(ARCHETYPES.map(a => [a.name, a]));

const TENSION_LEVELS = ['low', 'medium', 'high'];
const EMOTIONAL_ARCS = ['rising', 'falling', 'rise_then_fall', 'steady_with_spike'];

const CAST_SLOTS = ['CHAR_A', 'CHAR_B', 'CHAR_C'];

// CHAR_A sits front-and-centre; B/C are pulled back + inward so the main
// character reads as the focus. Tighter spacing than a full BINGO cell so
// the trio feels grouped without being crowded.
const SLOT_POSITIONS = {
    CHAR_B: [-0.85, 0.95, -0.55],
    CHAR_A: [ 0.00, 0.95,  0.00],
    CHAR_C: [ 0.85, 0.95, -0.55],
};
const SLOT_ROT_Y = {
    CHAR_B:  0.55,
    CHAR_A:  0,
    CHAR_C: -0.55,
};

// Initial camera pose — matches browse preview so browse → edit feels
// continuous. Also the reset-view target. Camera dropped (1.15 → 0.75) so the
// heads sit higher in the frame and read more centered vertically.
const INITIAL_CAM_POS    = new THREE.Vector3(0, 0.75, 2.8);
const INITIAL_CAM_TARGET = new THREE.Vector3(0, 0.95, -0.25);

// Corpus bundle is fetched once and shared across all StoryBridge instances
// (it's ~7MB and doesn't change at runtime).
const CORPUS_URL = 'global_assets/stories/corpus.json';
let _corpusPromise = null;
function _loadCorpus() {
    if (!_corpusPromise) {
        _corpusPromise = fetch(CORPUS_URL)
            .then(r => r.ok ? r.json() : { sequences: [] })
            .catch(() => ({ sequences: [] }));
    }
    return _corpusPromise;
}

// ── HTML-escape helper (small; avoids depending on DOM) ────────
function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));
}

export class StoryBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Story';
        this.storeName   = 'stories';

        const saved = this.asset?.payload?.state || this.asset?.state || {};

        // Canonical editor state. Start from the asset payload if it has one,
        // otherwise from the meta default defaults (three starter archetypes).
        this._state = {
            cast:                saved.cast?.length ? structuredClone(saved.cast) : [
                { slot: 'CHAR_A', archetype: 'Edge',   emoji: '⚡' },
                { slot: 'CHAR_B', archetype: 'Bloom',  emoji: '🌱' },
                { slot: 'CHAR_C', archetype: 'Glitch', emoji: '👾' },
            ],
            tension_level:       saved.tension_level     || 'medium',
            emotional_arc:       saved.emotional_arc     || 'rise_then_fall',
            relationship:        saved.relationship      || null,
            relationship_between:saved.relationship_between || null,
            location:            saved.location          || null,
            age_target:          saved.age_target        || null,
            // Presets ship with 6–8 beats from the corpus; trim to 3 on load so
            // the read-through matches the emotional-arc resolution we want.
            beats:               pickThreeBeats(saved.beats || []),
            beat_count:          pickThreeBeats(saved.beats || []).length,
            conditioning_notes:  saved.conditioning_notes || null,
            // tracked so a tiny tweak that still best-matches the same corpus
            // entry doesn't re-render the read-through every keystroke
            _matchedCorpusId:    saved._matchedCorpusId   || null,
        };

        this._activeTab = 'setup';
        this._heads = [];            // { slot, container, basePos, talk } entries
        this._speakingSlot = null;   // drives mouth-wiggle + head bob in _onTick
        this._playback = null;       // controller returned by runStoryPlayback
        this._isPlaying = false;     // reflected in the global Play button
        this._voiceEngine = null;
        this._voiceReady  = false;
        this._initVoice();
    }

    async _initVoice() {
        this._voiceEngine = new VoiceEngine();
        try {
            await this._voiceEngine.init();
            this._voiceEngine.applyState(STORY_BASE_VOICE);
            this._voiceReady = true;
        } catch (e) {
            console.warn('[StoryBridge] Voice engine init failed:', e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE — three archetype heads sitting in a row
    // ═══════════════════════════════════════════════════════════════

    async _buildScene() {
        this._camera.position.copy(INITIAL_CAM_POS);
        this._camera.lookAt(INITIAL_CAM_TARGET);
        this._camera.fov = 50;
        this._camera.updateProjectionMatrix();

        // Orbit controls — matches the other builders (drag to orbit, pinch/wheel
        // to zoom). Stays within the same distance/polar envelope so the user
        // can't end up under the floor.
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.target.copy(INITIAL_CAM_TARGET);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance   = 1.2;
        this._controls.maxDistance   = 6;
        this._controls.maxPolarAngle = Math.PI * 0.85;
        this._controls.update();

        this._buildHeads();
    }

    _buildHeads() {
        // Tear down old heads
        for (const entry of this._heads) {
            this._scene.remove(entry.container);
            entry.dispose?.();
        }
        this._heads = [];

        for (const cast of this._state.cast) {
            const head = buildArchetypeHead(cast.archetype);
            const container = new THREE.Group();
            container.add(head.group);
            const pos = SLOT_POSITIONS[cast.slot] || [0, 0.95, 0];
            const rotY = SLOT_ROT_Y[cast.slot] || 0;
            container.position.set(...pos);
            container.rotation.y = rotY;
            this._scene.add(container);
            this._heads.push({
                slot: cast.slot,
                container,
                basePos: container.position.clone(),
                baseRotY: rotY,
                label: `${cast.archetype}-core`,
                talk: head.talk,
                talkParams: head.talkParams,
                dispose: head.dispose,
            });
        }

        // If the user was mid-read-through, keep playback going with the new cast.
        if (this._isPlaying) this._restartPlayback();
    }

    _onTick(delta) {
        // Pump the voice engine so visemeEngine advances and getVisemeParams()
        // returns fresh, audio-driven jawOpen + lip shape params.
        if (this._voiceEngine) this._voiceEngine.update((delta || 0) * 1000);
        if (this._controls)    this._controls.update();

        const visemeParams = this._voiceEngine ? this._voiceEngine.getVisemeParams() : null;
        const amp = visemeParams ? Math.max(0, Math.min(1, visemeParams.jawOpen || 0)) : 0;
        animateStoryHeads(this._heads, {
            speakingSlot: this._speakingSlot,
            amp,
            visemeParams,
            t: performance.now() * 0.001,
        });

        // Floating archetype name over the speaking head + one-word-at-a-time subtitle.
        updateStoryNameTags(this._heads, this._speakingSlot, this._camera, this._renderer.domElement);
        if (this._speakingSlot && visemeParams && visemeParams.wordIdx >= 0) {
            setSubtitleWord(visemeParams.wordIdx);
        }
    }

    /** Tween camera back to the initial triangle framing. */
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
        hideSubtitle();
    }

    _restartPlayback() {
        this._stopPlayback();
        const beats = this._state.beats || [];
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
                if (silent) {
                    this._speakingSlot = null;
                    hideSubtitle();
                    return;
                }
                this._speakingSlot = slot;
                showSubtitle(text);
            },
            onIdle: () => {
                this._speakingSlot = null;
                hideSubtitle();
            },
            speakLine: async (text, archetype) => {
                if (!this._voiceReady || !this._voiceEngine) return;
                await speakWithArchetype(this._voiceEngine, {
                    text, archetype, baseState: STORY_BASE_VOICE,
                });
            },
            loop: true,
        });
    }

    /** Public play — start the read-through. */
    play() {
        if (this._isPlaying) return;
        if ((this._state.beats?.length ?? 0) === 0) return;
        this._isPlaying = true;
        this._restartPlayback();
        this._renderPanel();
    }

    /** Public stop — halt the read-through. */
    stopPlayback() {
        if (!this._isPlaying) return;
        this._isPlaying = false;
        this._stopPlayback();
        this._renderPanel();
        document.dispatchEvent(new CustomEvent('bridge-play-state', { detail: { playing: false } }));
    }

    _togglePlay() {
        if (this._isPlaying) this.stopPlayback();
        else this.play();
    }

    suspend() {
        if (this._isPlaying) this.stopPlayback();
        super.suspend?.();
    }

    destroy() {
        // Notify the global Play button so it drops the is-speaking state
        // whenever the bridge tears down mid-playback (pop / mode switch).
        const wasPlaying = this._isPlaying;
        this._isPlaying = false;
        this._stopPlayback();
        removeSubtitle();
        removeStoryNameTags();
        for (const entry of this._heads) entry.dispose?.();
        this._heads = [];
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
        if (tab === 'story') body = this._renderStoryTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Story name…',
            descPlaceholder: 'What is this story about?',
            tagsPlaceholder: 'e.g. sanctuary, mentor, medium',
        });
    }

    _renderSetupTab() {
        const s = this._state;

        // Three cast pickers — "{Name}-core" options, no extra detail
        const castRows = s.cast.map((c, i) => {
            const opts = ARCHETYPES.map(a =>
                `<option value="${a.name}" ${a.name === c.archetype ? 'selected' : ''}>${a.name}-core</option>`
            ).join('');
            const arch = ARCHETYPE_BY_NAME.get(c.archetype) || ARCHETYPES[0];
            return `
              <div class="cb-field">
                <div class="cb-field-head">
                  <div class="cb-label">${c.slot}${i === 0 ? ' <span style="opacity:.6;font-weight:400;">— main character</span>' : ''}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${arch.color};font-size:16px;flex-shrink:0;">${arch.emoji}</span>
                  <select class="cb-select story-archetype" data-slot="${c.slot}" style="flex:1;">${opts}</select>
                </div>
              </div>`;
        }).join('');

        // Tension segmented control
        const tensionBtns = TENSION_LEVELS.map(t =>
            `<button class="cb-shape-btn story-tension ${s.tension_level === t ? 'active' : ''}" data-tension="${t}">${t}</button>`
        ).join('');

        // Emotional arc — 2×2 grid
        const arcBtns = EMOTIONAL_ARCS.map(a => {
            const label = a.replace(/_/g, ' ');
            return `<button class="cb-shape-btn story-arc ${s.emotional_arc === a ? 'active' : ''}" data-arc="${a}">${label}</button>`;
        }).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Cast</div>
            ${castRows}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Tension</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(3,1fr);">${tensionBtns}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Emotional Arc</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(2,1fr);">${arcBtns}</div>
          </div>
          <div class="cb-section">
            <div class="cb-hint">
              Turn any dial and the story reshapes. We pull from a hidden
              library of 743 sequences — the closest match to your archetypes,
              tension, and arc becomes the read-through on the Story tab.
            </div>
          </div>`;
    }

    _renderStoryTab() {
        const s = this._state;
        if (!s.beats || s.beats.length === 0) {
            return `<div class="cb-section"><div class="cb-hint">Matching a story…</div></div>`;
        }

        const locLabel = s.location ? `${s.location.type || 'somewhere'}` : 'somewhere';
        const arcLabel = (s.emotional_arc || '').replace(/_/g, ' ');
        const playIcon  = this._isPlaying ? '■' : '▶';
        const playLabel = this._isPlaying ? 'Stop'  : 'Play';
        const header = `
          <div class="cb-section">
            <div class="cb-section-title">${_esc(s.cast.map(c => c.archetype).join(' · '))}</div>
            <div class="cb-hint">
              ${_esc(locLabel)} · tension ${_esc(s.tension_level || '')} · ${_esc(arcLabel)}
              ${s.relationship ? ` · ${_esc(String(s.relationship).replace(/_/g, ' '))}` : ''}
            </div>
            <button class="vb-play-btn story-play-btn${this._isPlaying ? ' speaking' : ''}" style="margin-top:10px;">${playIcon} ${playLabel}</button>
          </div>`;

        const beats = s.beats.map((b, i) => {
            const chars = (b.characters || []).join(', ');
            const cue = b.cue
                ? `<div class="cb-hint">${_esc(cueLabel(b.cue))}</div>`
                : '';
            const lines = (b.lines || []).map(l => {
                const cast = s.cast.find(c => c.slot === l.speaker);
                const emoji = cast?.emoji || '';
                return `<div style="margin:4px 0;">
                  <span style="opacity:.65;">${emoji} ${_esc(l.speaker)}:</span>
                  <span>“${_esc(l.text)}”</span>
                </div>`;
            }).join('');
            return `
              <div class="cb-section" style="padding:10px 12px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.7;margin-bottom:6px;">
                  <span>Beat ${i + 1}${b.function ? ` · ${_esc(b.function)}` : ''}</span>
                  <span>tension ${b.tension ?? '—'}${b.emotion ? ` · ${_esc(b.emotion)}` : ''}</span>
                </div>
                <div style="font-size:11px;opacity:.55;margin-bottom:6px;">${_esc(chars)}</div>
                ${cue}
                ${lines}
              </div>`;
        }).join('');

        return header + beats;
    }

    _wirePanelEvents() {
        const panel = this.panelEl;

        // Tab switching
        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // File tab wiring
        if (this._activeTab === 'file') {
            wireFileTabEvents(panel, this, { formatType: 'story_state' });
        }

        // Archetype pickers
        panel.querySelectorAll('.story-archetype').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const slot = e.target.dataset.slot;
                const archetypeName = e.target.value;
                this._setArchetype(slot, archetypeName);
                await this._applyBestMatch();
                this._buildHeads();
                this._renderPanel();
            });
        });

        // Tension buttons
        panel.querySelectorAll('.story-tension').forEach(btn => {
            btn.addEventListener('click', async () => {
                this._state.tension_level = btn.dataset.tension;
                await this._applyBestMatch();
                if (this._isPlaying) this._restartPlayback();
                this._renderPanel();
            });
        });

        // Arc buttons
        panel.querySelectorAll('.story-arc').forEach(btn => {
            btn.addEventListener('click', async () => {
                this._state.emotional_arc = btn.dataset.arc;
                await this._applyBestMatch();
                if (this._isPlaying) this._restartPlayback();
                this._renderPanel();
            });
        });

        // Play / stop button (matches VoiceBridge's vb-play-btn pattern)
        const playBtn = panel.querySelector('.story-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this._togglePlay());
        }

        // If we arrived with no beats yet (preset loaded fresh), warm up now
        // (don't auto-play — wait for the user to press Play).
        if ((this._state.beats?.length ?? 0) === 0) {
            this._applyBestMatch().then(() => {
                this._renderPanel();
            });
        }
    }

    _setArchetype(slot, name) {
        const arch = ARCHETYPE_BY_NAME.get(name);
        if (!arch) return;
        const cast = this._state.cast.find(c => c.slot === slot);
        if (!cast) return;
        cast.archetype = arch.name;
        cast.emoji     = arch.emoji;
        cast.loves     = arch.loves;
        cast.fears     = arch.fears;
    }

    /**
     * Find the corpus entry that best matches the current cast/tension/arc
     * and swap its beats + story metadata into the editor state.
     */
    async _applyBestMatch() {
        const bundle = await _loadCorpus();
        const seqs = bundle.sequences || [];
        if (seqs.length === 0) return;

        const target = {
            A: this._state.cast.find(c => c.slot === 'CHAR_A')?.archetype,
            B: this._state.cast.find(c => c.slot === 'CHAR_B')?.archetype,
            C: this._state.cast.find(c => c.slot === 'CHAR_C')?.archetype,
            tension: this._state.tension_level,
            arc:     this._state.emotional_arc,
        };

        let best = null;
        let bestScore = -1;
        for (const seq of seqs) {
            const score = _scoreMatch(seq, target);
            if (score > bestScore) { bestScore = score; best = seq; }
        }
        if (!best) return;

        // Avoid churn: if same corpus entry still wins, don't re-copy fields
        if (this._state._matchedCorpusId === best.corpus_id) return;

        this._state._matchedCorpusId   = best.corpus_id;
        // Trim to 3 beats so the arc reads clearly in the read-through +
        // playback. Corpus ships 6–8 beats but we only want opening, climax,
        // and close — see pickThreeBeats().
        this._state.beats              = structuredClone(pickThreeBeats(best.beats || []));
        this._state.beat_count         = this._state.beats.length;
        this._state.location           = structuredClone(best.location || null);
        this._state.relationship       = best.relationship || null;
        this._state.relationship_between = best.relationship_between || null;
        this._state.age_target         = best.age_target || null;
        this._state.conditioning_notes = best.conditioning_notes || null;

        // The matched sequence carries its own cast labels in CHAR_A/B/C order;
        // the user's chosen archetypes win, but we overlay the voice hints for
        // any slot whose archetype still matches.
        for (const slot of CAST_SLOTS) {
            const userCast  = this._state.cast.find(c => c.slot === slot);
            const matchCast = best.cast?.find(c => c.slot === slot);
            if (userCast && matchCast && userCast.archetype === matchCast.archetype) {
                userCast.loves      = matchCast.loves      || userCast.loves;
                userCast.fears      = matchCast.fears      || userCast.fears;
                userCast.voice_hint = matchCast.voice_hint || null;
            } else if (userCast) {
                // Keep clean: purge stale voice hint if archetype diverged
                userCast.voice_hint = null;
            }
        }
    }

    _getState() { return this._state; }

    _applyState(state) {
        this._state = structuredClone(state);
        this._buildHeads();
    }

    _onResume() {
        // If we came back from a child bridge and were playing, resume.
        if (this._isPlaying && !this._playback && (this._state.beats?.length ?? 0) > 0) {
            this._restartPlayback();
        }
    }
}

// ── Scoring for nearest-match (v1) ─────────────────────────────
// Strategy: slot-exact matches dominate. If slot-exact score is zero,
// fall back to bag-of-archetypes overlap (order-insensitive). Arc and
// tension add smaller bonuses so they act as tiebreakers + nudges.
function _scoreMatch(seq, target) {
    const seqBySlot = new Map((seq.cast || []).map(c => [c.slot, c.archetype]));

    let slotExact = 0;
    if (seqBySlot.get('CHAR_A') === target.A) slotExact += 100;
    if (seqBySlot.get('CHAR_B') === target.B) slotExact += 100;
    if (seqBySlot.get('CHAR_C') === target.C) slotExact += 100;

    let score = slotExact;

    // Bag overlap fallback (only counts if slot-exact didn't cover everything)
    if (slotExact < 300) {
        const tgtBag = [target.A, target.B, target.C].filter(Boolean);
        const seqBag = (seq.cast || []).map(c => c.archetype);
        const used = new Set();
        for (const t of tgtBag) {
            const idx = seqBag.findIndex((a, i) => a === t && !used.has(i));
            if (idx >= 0) { score += 35; used.add(idx); }
        }
    }

    if (seq.emotional_arc === target.arc)       score += 50;
    if (seq.tension_level === target.tension)   score += 20;

    return score;
}

// ── Cue → label helper ────────────────────────────────────────
function cueLabel(cue) {
    if (!cue || !cue.type) return '';
    const icon = {
        music_box:       '🎵',
        environment_box: '🌲',
        image_box:       '🎨',
        prop_box:        '🧸',
    }[cue.type] || '•';
    const params = Object.entries(cue.params || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
    return `${icon} ${cue.type.replace(/_/g, ' ')}${params ? ` (${params})` : ''}`;
}
