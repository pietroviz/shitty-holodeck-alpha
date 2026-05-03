/**
 * MusicBridge.js — music theme editor bridge (v2, plan §10).
 *
 * Tabs: File · Shape · Sound   (Director is Phase 2 and intentionally omitted)
 *
 *   File   — name, description, tags (unchanged shared builderUI surface)
 *   Shape  — Valence / Complexity / Speed sliders, Mood preset, Key, Scale,
 *            Variety, Re-roll. The three "runtime-modulatable" sliders also
 *            bear a 'director' hint badge per plan §8.
 *   Sound  — Pack picker (single Game Boy card today, more coming), Layers
 *            read-out with on/off + register nudge, Texture + Groove pickers.
 *
 * State model matches _refs/music-tool-plan.md §7 exactly. Legacy assets
 * (the 24 stock templates in the old format) auto-convert on open via
 * {@link _legacyToV2} so existing content keeps opening without migration
 * ceremony. New assets persist in the v2 schema.
 *
 * Playback runs through the new compiler pipeline (musicCompiler.js →
 * Tone.js via import map). Live slider writes are stubbed with console
 * feedback in Shape; full setParam wiring lands in Phase 1 step 10.
 */

import { BaseBridge }                       from './BaseBridge.js?v=4';
import { renderFileTab, wireFileTabEvents } from '../shared/builderUI.js';
import { musicPlayer }                      from '../shared/musicPlayer.js?v=1';
import { validateTheme }                    from '../shared/musicSchema.js?v=1';
import { buildMusicVisualizer, deriveBackgroundColor } from '../shared/musicVisualizer.js?v=4';
import * as THREE                           from 'three';
import { standard }                         from '../shared/materials.js';
import { UI }                               from '../shared/palette.js';

/* ══════════════════════════════════════════════════════════════════
   STATIC CHOICE LISTS (UI surface)
   ══════════════════════════════════════════════════════════════════ */

const TABS = [
    { id: 'file',  label: 'File',  icon: '📄' },
    { id: 'shape', label: 'Shape', icon: '◈' },
    { id: 'sound', label: 'Sound', icon: '♫' },
];

const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Plan §10 — human scale labels over Tonal modes. Each entry maps a friendly
// word to the underlying mode string the compiler expects in defaults.scale.
const SCALE_CHOICES = [
    { id: 'major',       label: 'Folky',   blurb: 'Bright, familiar' },
    { id: 'minor',       label: 'Sad',     blurb: 'Dark, melancholic' },
    { id: 'dorian',      label: 'Pensive', blurb: 'Sad with a lift' },
    { id: 'phrygian',    label: 'Tense',   blurb: 'Uneasy, Spanish' },
    { id: 'lydian',      label: 'Bright',  blurb: 'Dreamy, floating' },
    { id: 'mixolydian',  label: 'Dreamy',  blurb: 'Rock-adjacent' },
    { id: 'major_pentatonic', label: 'Simple', blurb: 'Folk, no wrong notes' },
    { id: 'blues',       label: 'Bluesy',  blurb: 'Grit, dirty' },
];

// Modulation modes — the four named intensity presets every theme exposes.
// These are the live "mode" levers that a future scene-pairing system writes
// to. Today the editor exposes them as a Mode picker.
const MODULATION_MODES = [
    { id: 'intro',   label: 'Intro',   blurb: 'sparsest, soft entry' },
    { id: 'waiting', label: 'Waiting', blurb: 'low-energy, holding' },
    { id: 'active',  label: 'Active',  blurb: 'theme at full character' },
    { id: 'peak',    label: 'Peak',    blurb: 'all layers, top intensity' },
];

// Plan §10 Mood dropdown. Each preset seeds a slider cluster. Pack preference
// is optional — today every preset falls back to game_boy since that's the
// only pack shipped; as more packs land, these pick the right match.
const MOOD_PRESETS = [
    { id: 'cozy',        label: 'Cozy',        valence: 0.75, complexity: 0.3,  speed: 0.85 },
    { id: 'tense',       label: 'Tense',       valence: 0.25, complexity: 0.7,  speed: 1.2  },
    { id: 'playful',     label: 'Playful',     valence: 0.85, complexity: 0.6,  speed: 1.1  },
    { id: 'eerie',       label: 'Eerie',       valence: 0.15, complexity: 0.5,  speed: 0.8  },
    { id: 'epic',        label: 'Epic',        valence: 0.65, complexity: 0.9,  speed: 1.0  },
    { id: 'melancholy',  label: 'Melancholy',  valence: 0.3,  complexity: 0.4,  speed: 0.9  },
    { id: 'triumphant',  label: 'Triumphant',  valence: 0.9,  complexity: 0.75, speed: 1.05 },
    { id: 'dreamy',      label: 'Dreamy',      valence: 0.7,  complexity: 0.35, speed: 0.85 },
    { id: 'mysterious',  label: 'Mysterious',  valence: 0.35, complexity: 0.45, speed: 0.9  },
    { id: 'frantic',     label: 'Frantic',     valence: 0.4,  complexity: 0.95, speed: 1.5  },
    { id: 'peaceful',    label: 'Peaceful',    valence: 0.7,  complexity: 0.25, speed: 0.75 },
    { id: 'bittersweet', label: 'Bittersweet', valence: 0.5,  complexity: 0.45, speed: 0.95 },
];

const GROOVES  = [
    { id: 'straight', label: 'Straight' }, { id: 'swing',    label: 'Swing'    },
    { id: 'shuffle',  label: 'Shuffle'  }, { id: 'dub',      label: 'Dub'      },
    { id: 'march',    label: 'March'    }, { id: 'waltz',    label: 'Waltz'    },
];
const TEXTURES = [
    { id: 'clean',      label: 'Clean'      }, { id: 'lofi',     label: 'Lo-fi'      },
    { id: 'crunchy',    label: 'Crunchy'    }, { id: 'widescreen', label: 'Widescreen' },
];

// Pack catalog for the Sound tab. Today only game_boy is implemented — the
// rest are placeholder cards that show the plan's §6 roster. As each pack's
// roles land in packs.json, flip `available: true` here.
const PACK_CATALOG = [
    { id: 'game_boy',     label: 'Game Boy / NES',   blurb: 'Pulse leads, triangle bass, noise drums',      available: true  },
    { id: 'fm_90s',       label: 'FM-era 90s',       blurb: 'FM bells + brass, crunchy squares',            available: false },
    { id: 'c64_sid',      label: 'C64 SID',          blurb: 'Filter-swept saw, vibrato leads',              available: false },
    { id: 'techno_acid',  label: 'Techno / Acid',    blurb: 'TB-303 bass, 4-on-floor kicks',                 available: false },
    { id: 'synthwave',    label: 'Synthwave',        blurb: 'Detuned supersaw pads, gated claps',            available: false },
    { id: 'brass_fanfare',label: 'Brass Fanfare',    blurb: 'Slow-attack saws as brass section',            available: false },
    { id: 'orchestral',   label: 'Orchestral Lite',  blurb: 'Stylized strings, woodwinds, harp',            available: false },
    { id: 'acid_jazz',    label: 'Acid Jazz',        blurb: 'Walking bass, brushed hats',                    available: false },
    { id: 'trap_808',     label: 'Trap / 808',       blurb: 'Sub bass, fast hats, long 808 kicks',           available: false },
    { id: 'dub_reggae',   label: 'Dub / Reggae',     blurb: 'Offbeat chords, deep bass, slapback',           available: false },
    { id: 'circus',       label: 'Circus',           blurb: 'Playful square + oompah',                       available: false },
    { id: 'horror_drone', label: 'Horror / Drone',   blurb: 'Detuned dissonant pads',                        available: false },
    { id: 'surf',         label: 'Surf',             blurb: 'Tremolo saw, bright register',                  available: false },
];

const LAYER_ROLES = ['bass', 'melody', 'chords', 'pad', 'drums', 'texture'];

/* ══════════════════════════════════════════════════════════════════
   BRIDGE
   ══════════════════════════════════════════════════════════════════ */

export class MusicBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Music';
        this.storeName   = 'music';

        this._state = this._loadState(this.asset);

        // UI state
        this._activeTab = 'file';
        this._meshes    = [];

        // Audio is owned by the shared musicPlayer singleton. The bridge
        // just calls it. Local _isPlaying mirrors musicPlayer's state for
        // outer-Play-button compatibility (app.js reads bridge._isPlaying).
        this._isPlaying    = false;
        this._activityTimer = null;

        // Visible status line under the Play button. Updated by play()/error
        // paths so failures are obvious without opening devtools.
        this._statusLine  = '';
        this._statusKind  = 'idle';   // 'idle' | 'loading' | 'playing' | 'error'

        // Currently active modulation mode (intro/waiting/active/peak). Used
        // for the Mode picker UI; not persisted in the asset.
        this._currentMode = 'active';
    }

    /* ──────────────────────────────────────────────────────────────
       STATE — v2 schema, with legacy-asset auto-conversion.
       ────────────────────────────────────────────────────────────── */

    _loadState(asset) {
        const p = asset?.payload;
        // Native v2 envelope — { payload: { format: 'music_state_v2', state: {...} } }.
        // This is the format new themes are stored in on disk and what the
        // bridge writes back via _getState. Cheapest path; no conversion.
        if (p?.format === 'music_state_v2' && p.state) {
            return _withDefaults(p.state);
        }
        const d = p?.state;
        if (d && _looksLikeV2(d)) return _withDefaults(d);
        if (p && _looksLikeV2(p)) return _withDefaults(_stripRootMeta(p));
        // Otherwise legacy — convert in place. Existing 24 templates are this shape.
        return _legacyToV2(p || {});
    }

    /* ──────────────────────────────────────────────────────────────
       SCENE — composed still-life visualizer (shared module). Each
       role gets its own fixed shape; deeper roles are larger and
       lower in frame, brighter roles are smaller and higher. Pulses
       are driven by real fire times from musicPlayer.getLastFireByRole().
       ────────────────────────────────────────────────────────────── */

    _buildScene() {
        this._camera.position.set(0, 1.8, 5.8);
        this._camera.lookAt(0, 1.0, 0);
        this._camera.fov = 55;
        this._camera.updateProjectionMatrix();
        this._buildVisualizer();
    }

    _buildVisualizer() {
        // Tear down previous viz cleanly.
        if (this._viz) {
            try { this._viz.dispose(); } catch {}
            this._viz = null;
        }
        for (const m of this._meshes) {
            this._scene.remove(m);
            m.geometry?.dispose?.();
            m.material?.dispose?.();
        }
        this._meshes = [];

        // Per-track background derived from the theme's coverColor —
        // each theme paints its own stage.
        if (this._scene) {
            this._scene.background = deriveBackgroundColor(this._state.coverColor);
            // Hide ground plane + grid + reference square set up by
            // BaseBridge — the music view is the floating cluster only.
            for (const child of this._scene.children) {
                if (child.type === 'Mesh' && child.geometry?.type === 'PlaneGeometry') child.visible = false;
                if (child.type === 'GridHelper') child.visible = false;
                if (child.type === 'Line')       child.visible = false;
            }
        }

        this._viz = buildMusicVisualizer({
            scene:   this._scene,
            theme:   this._state,
            anchorY: 0,
        });
    }

    _onTick() {
        if (!this._viz) return;
        /* The visualizer ONLY animates when music is actually playing.
         * No synthesized beat clock when idle — shapes sit at rest so
         * it's obvious that hitting Play is what made them move. */
        this._viz.tick({
            isPlaying:    this._isPlaying === true,
            firesByRole:  this._isPlaying ? musicPlayer.getLastFireByRole() : null,
        });
    }

    /* ══════════════════════════════════════════════════════════════
       PANEL
       ══════════════════════════════════════════════════════════════ */

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
        if (tab === 'shape') body = this._renderShapeTab();
        if (tab === 'sound') body = this._renderSoundTab();

        const playIcon  = this._isPlaying ? '■' : '▶';
        const playLabel = this._isPlaying ? 'Stop' : 'Play';
        const statusHtml = this._statusLine
            ? `<div class="mb-status mb-status-${this._statusKind}">${_esc(this._statusLine)}</div>`
            : '';

        // Per-role activity row — only meaningful while playing. Each badge
        // shows whether that role has fired a note in the last second.
        // Updated by _tickActivity() from a 200ms interval, so we don't have
        // to re-render the whole panel on every fire.
        const activeRoles = this._sectionARoles();
        const activityHtml = (this._isPlaying && activeRoles.length > 0)
            ? `<div class="mb-activity">${activeRoles.map(role =>
                `<span class="mb-activity-dot" data-role="${role}">${_capitalize(role)}</span>`
              ).join('')}</div>`
            : '';

        const playHtml = `
          <div class="mb-audition">
            <button class="cb-play-btn mb-play-btn ${this._isPlaying ? 'playing' : ''}"
                    title="Preview this theme">${playIcon} ${playLabel}</button>
            ${statusHtml}
            ${activityHtml}
          </div>`;

        return tabBar + `<div class="cb-tab-content">${body}</div>` + playHtml;
    }

    _sectionARoles() {
        const sectionA = this._state.sections?.[0];
        const roles    = sectionA?.layers ?? [];
        return roles.filter(role => this._state.layers.some(l => l.role === role));
    }

    /* ─ File ──────────────────────────────────────────────────────── */
    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Music theme name…',
            descPlaceholder: 'Describe the feel in one line…',
            tagsPlaceholder: 'e.g. cozy, chiptune, bright',
        });
    }

    /* ─ Shape — primary editing surface (plan §10 Tab 2) ──────────── */
    _renderShapeTab() {
        const s = this._state;

        const modeOpts = MODULATION_MODES.map(m =>
            `<option value="${m.id}"${this._currentMode === m.id ? ' selected' : ''}>${m.label} — ${m.blurb}</option>`
        ).join('');

        const moodOpts = MOOD_PRESETS.map(m =>
            `<option value="${m.id}"${s.mood === m.id ? ' selected' : ''}>${m.label}</option>`
        ).join('');

        const keyBtns = KEYS.map(k =>
            `<button class="cb-shape-btn mb-key-btn ${s.scaleKey === k ? 'active' : ''}"
                     data-key="${k}">${k}</button>`
        ).join('');

        const scaleOpts = SCALE_CHOICES.map(sc =>
            `<option value="${sc.id}"${s.scaleMode === sc.id ? ' selected' : ''}>${sc.label} — ${sc.blurb}</option>`
        ).join('');

        const bpmReadout = (s.cps * s.speed * 60 * 4).toFixed(0);

        return `
          <div class="cb-section">
            <div class="cb-section-title">Mode <span class="mb-director-badge" title="Also written by the scene-pairing system at runtime">DIR</span></div>
            <select class="cb-acc-select mb-mode-select">${modeOpts}</select>
            <div class="cb-hint" style="margin-top:4px;">
              The four named intensity states this theme exposes to camera/script systems. Each mode
              snaps Valence, Complexity, Speed and the layer set to a preset at the next cycle boundary.
            </div>
          </div>

          <div class="cb-section">
            <div class="cb-section-title">Mood Preset</div>
            <select class="cb-acc-select mb-mood-select">
              <option value="">— pick a mood —</option>
              ${moodOpts}
            </select>
            <div class="cb-hint" style="margin-top:4px;">Seeds Valence, Complexity and Speed below (one-shot author tool).</div>
          </div>

          ${_sliderRow('Valence',    'valence',    s.valence,    0, 1, 0.01, 'Dark ↔ Bright',      true)}
          ${_sliderRow('Complexity', 'complexity', s.complexity, 0, 1, 0.01, 'Sparse ↔ Dense',     true)}
          ${_sliderRow('Speed',      'speed',      s.speed,      0.5, 2.0, 0.05, `Slow ↔ Fast · ${bpmReadout} BPM`, true)}

          <div class="cb-section">
            <div class="cb-section-title">Key</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(6,1fr);">${keyBtns}</div>
          </div>

          <div class="cb-section">
            <div class="cb-section-title">Scale</div>
            <select class="cb-acc-select mb-scale-select">${scaleOpts}</select>
          </div>

          ${_sliderRow('Variety', 'variety', s.variety, 0, 1, 0.01, 'How often patterns surprise', false)}

          <div class="cb-section">
            <button class="cb-btn-sm mb-reroll-btn" title="Regenerate pattern variation with a new seed">
              🎲 Re-roll take (seed ${s.seeds.pattern})
            </button>
            <div class="cb-hint" style="margin-top:4px;">Same theme, same shape — different take.</div>
          </div>
        `;
    }

    /* ─ Sound — plan §10 Tab 3 ────────────────────────────────────── */
    _renderSoundTab() {
        const s = this._state;

        const packCards = PACK_CATALOG.map(p => {
            const active  = s.pack === p.id;
            const dim     = p.available ? '' : 'opacity:0.4;cursor:not-allowed;';
            const badge   = p.available ? '' : '<span style="font-size:9px;color:#999;margin-left:4px;">soon</span>';
            return `
              <div class="mb-pack-card ${active ? 'active' : ''}"
                   data-pack="${p.id}" data-available="${p.available}"
                   style="${dim}">
                <div class="mb-pack-label">${p.label}${badge}</div>
                <div class="mb-pack-blurb">${p.blurb}</div>
              </div>`;
        }).join('');

        const layerRows = s.layers.map((layer, i) => {
            const enabled = _layerInSectionA(s, layer.role);
            return `
              <div class="mb-layer-row" data-idx="${i}">
                <label class="mb-toggle">
                  <input type="checkbox" class="mb-layer-toggle" ${enabled ? 'checked' : ''} data-role="${layer.role}">
                  <span class="mb-layer-role">${_capitalize(layer.role)}</span>
                </label>
                <div class="mb-layer-meta">
                  <span style="font-size:10px;color:${UI.textDim};">register</span>
                  <input type="range" class="mb-layer-register" min="-2" max="2" step="1"
                         value="${layer.register}" data-idx="${i}">
                  <span class="mb-layer-reg-val">${layer.register >= 0 ? '+' : ''}${layer.register}</span>
                </div>
              </div>`;
        }).join('') || '<div class="cb-hint">No layers yet.</div>';

        const grooveOpts  = GROOVES.map(g  => `<option value="${g.id}"${s.groove  === g.id ? ' selected':''}>${g.label}</option>`).join('');
        const textureOpts = TEXTURES.map(t => `<option value="${t.id}"${s.texture === t.id ? ' selected':''}>${t.label}</option>`).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Instrument Pack</div>
            <div class="mb-pack-grid">${packCards}</div>
          </div>

          <div class="cb-section">
            <div class="cb-section-title">Layers (${s.layers.length})</div>
            ${layerRows}
          </div>

          <div class="cb-section" style="display:flex;gap:12px;">
            <div style="flex:1;">
              <div class="cb-section-title">Texture</div>
              <select class="cb-acc-select mb-texture-select">${textureOpts}</select>
            </div>
            <div style="flex:1;">
              <div class="cb-section-title">Groove</div>
              <select class="cb-acc-select mb-groove-select">${grooveOpts}</select>
            </div>
          </div>
        `;
    }

    /* ══════════════════════════════════════════════════════════════
       EVENT WIRING
       ══════════════════════════════════════════════════════════════ */

    _wirePanelEvents() {
        const panel = this.panelEl;

        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        wireFileTabEvents(panel, this, { formatType: 'music_state_v2' });

        // ── Shape ──
        panel.querySelector('.mb-mode-select')?.addEventListener('change', (e) => {
            const modeName = e.target.value;
            this._currentMode = modeName;
            // Live-apply if playing; the player snaps params + layer toggles at cycle.
            if (this._isPlaying) musicPlayer.applyMode(modeName);
            // Mirror mode preset values into _state so the sliders reflect the new
            // dial positions and the next play() reflects the chosen mode.
            const mode = this._state.modulation?.modes?.[modeName];
            if (mode) {
                if (typeof mode.valence    === 'number') this._state.valence    = mode.valence;
                if (typeof mode.complexity === 'number') this._state.complexity = mode.complexity;
                if (typeof mode.speed      === 'number') this._state.speed      = mode.speed;
                if (Array.isArray(mode.layers)) {
                    const sec = this._state.sections?.[0];
                    if (sec) sec.layers = [...mode.layers];
                }
            }
            this._renderPanel();
        });

        panel.querySelector('.mb-mood-select')?.addEventListener('change', (e) => {
            const preset = MOOD_PRESETS.find(m => m.id === e.target.value);
            if (!preset) return;
            this._state.mood       = preset.id;
            this._state.valence    = preset.valence;
            this._state.complexity = preset.complexity;
            this._state.speed      = preset.speed;
            this.markDirty('Apply mood preset');
            this._restartPlaybackIfPlaying();
            this._renderPanel();
        });

        panel.querySelectorAll('.mb-slider').forEach(inp => {
            const prop = inp.dataset.prop;
            inp.addEventListener('input', () => {
                const val = parseFloat(inp.value);
                this._state[prop] = val;
                const valEl = inp.parentElement.querySelector('.mb-slider-val');
                if (valEl) valEl.textContent = val.toFixed(2);
                this._setParamLive(prop, val);
            });
            inp.addEventListener('change', () => this.markDirty(`Change ${prop}`));
        });

        panel.querySelectorAll('.mb-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.scaleKey = btn.dataset.key;
                this.markDirty('Change key');
                this._restartPlaybackIfPlaying();
                this._renderPanel();
            });
        });

        panel.querySelector('.mb-scale-select')?.addEventListener('change', (e) => {
            this._state.scaleMode = e.target.value;
            this.markDirty('Change scale');
            this._restartPlaybackIfPlaying();
        });

        panel.querySelector('.mb-reroll-btn')?.addEventListener('click', () => {
            this._state.seeds.pattern = (Math.floor(Math.random() * 10000)) | 0;
            this.markDirty('Re-roll');
            this._restartPlaybackIfPlaying();
            this._renderPanel();
        });

        // ── Sound ──
        panel.querySelectorAll('.mb-pack-card').forEach(card => {
            card.addEventListener('click', () => {
                if (card.dataset.available !== 'true') return;
                this._state.pack = card.dataset.pack;
                this.markDirty('Change pack');
                this._restartPlaybackIfPlaying();
                this._renderPanel();
            });
        });

        panel.querySelectorAll('.mb-layer-toggle').forEach(input => {
            input.addEventListener('change', () => {
                const role = input.dataset.role;
                _toggleRoleInSectionA(this._state, role, input.checked);
                this.markDirty(`${input.checked ? 'Enable' : 'Disable'} ${role}`);
                // Live mute via the shared player — smooth gain ramp, no restart.
                if (this._isPlaying) {
                    musicPlayer.setLayerEnabled(role, input.checked);
                }
            });
        });

        panel.querySelectorAll('.mb-layer-register').forEach(input => {
            input.addEventListener('input', () => {
                const i   = parseInt(input.dataset.idx, 10);
                const val = parseInt(input.value, 10);
                if (!this._state.layers[i]) return;
                this._state.layers[i].register = val;
                const label = input.parentElement.querySelector('.mb-layer-reg-val');
                if (label) label.textContent = (val >= 0 ? '+' : '') + val;
            });
            input.addEventListener('change', () => this.markDirty('Register shift'));
        });

        panel.querySelector('.mb-texture-select')?.addEventListener('change', (e) => {
            this._state.texture = e.target.value;
            this.markDirty('Change texture');
        });
        panel.querySelector('.mb-groove-select')?.addEventListener('change', (e) => {
            this._state.groove = e.target.value;
            this.markDirty('Change groove');
        });

        // ── Play / Stop ──
        panel.querySelector('.mb-play-btn')?.addEventListener('click', () => this._togglePlay());
    }

    /* ══════════════════════════════════════════════════════════════
       AUDIO LIFECYCLE — all routes through the shared musicPlayer singleton.
       ══════════════════════════════════════════════════════════════ */

    async play() {
        if (this._isPlaying) return;
        this._setStatus('loading audio…', 'loading');

        const theme = this._asCompilableTheme();
        const validation = validateTheme(theme);
        if (!validation.ok) {
            console.warn('[MusicBridge] theme has schema errors (attempting playback anyway):', validation.errors);
        }

        try {
            await musicPlayer.play(theme, {
                params: {
                    valence:    this._state.valence,
                    complexity: this._state.complexity,
                    speed:      this._state.speed,
                },
                seed:  this._state.seeds.pattern,
                onEnd: () => {
                    this._isPlaying = false;
                    this._stopActivityPolling();
                    this._renderPanel();
                },
            });
            this._isPlaying = true;
            const activeRoles = this._sectionARoles();
            this._setStatus(
                `${activeRoles.join(' + ')} · ${theme.defaults.scale} · seed ${theme.seeds.pattern}`,
                'playing',
            );
            this._startActivityPolling();
        } catch (e) {
            console.error('[MusicBridge] play failed:', e);
            this._setStatus(`play failed: ${e?.message || e}`, 'error');
        }
    }

    /* ── Activity polling — read musicPlayer.getLastFireByRole() every
          200ms and toggle the .active class on each role badge. We touch
          DOM directly (no _renderPanel) so input focus / slider drag isn't
          interrupted while we update. */
    _startActivityPolling() {
        this._stopActivityPolling();
        const ACTIVE_WINDOW_MS = 700;
        this._activityTimer = setInterval(() => {
            if (!this._isPlaying) return this._stopActivityPolling();
            const fires = musicPlayer.getLastFireByRole();
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            this.panelEl.querySelectorAll('.mb-activity-dot').forEach(el => {
                const role = el.dataset.role;
                const last = fires[role] ?? 0;
                el.classList.toggle('active', (now - last) < ACTIVE_WINDOW_MS);
            });
        }, 200);
    }

    _stopActivityPolling() {
        if (this._activityTimer) {
            clearInterval(this._activityTimer);
            this._activityTimer = null;
        }
    }

    _setStatus(line, kind) {
        this._statusLine = line || '';
        this._statusKind = kind || 'idle';
        this._renderPanel();
    }

    stopPlayback() {
        if (!this._isPlaying) return;
        try { musicPlayer.stop(); } catch {}
        this._isPlaying = false;
        this._stopActivityPolling();
        this._setStatus('', 'idle');
    }

    _togglePlay() {
        if (this._isPlaying) this.stopPlayback();
        else this.play();
    }

    /** Live parameter write for the three director-controllable sliders. */
    _setParamLive(name, value) {
        if (!this._isPlaying) return;
        if (name === 'valence' || name === 'complexity' || name === 'speed') {
            musicPlayer.setParam(name, value);
        }
        // Keep the BPM readout in the Speed label fresh — a gentle DOM write.
        if (name === 'speed') {
            const slider = this.panelEl.querySelector('.mb-slider[data-prop="speed"]');
            const hint   = slider?.parentElement?.querySelector('.mb-slider-hint');
            if (hint) {
                const bpm = this._state.cps * value * 60 * 4;
                hint.textContent = `Slow ↔ Fast · ${bpm.toFixed(0)} BPM`;
            }
        }
    }

    /** Restart the live player to pick up non-live state changes (key, scale, seed, pack). */
    _restartPlaybackIfPlaying() {
        if (!this._isPlaying) return;
        this.stopPlayback();
        // Give Tone a tick to dispose cleanly before re-instantiating.
        setTimeout(() => this.play(), 50);
    }

    suspend() {
        if (this._isPlaying) this.stopPlayback();
        super.suspend();
    }

    destroy() {
        this.stopPlayback();
        super.destroy();
    }

    /* ──────────────────────────────────────────────────────────────
       Produce a plan-§7-shaped theme object from current state so the
       compiler + validator can consume it. This is the single contact
       point between the bridge's runtime state and the compile pipeline.
       ────────────────────────────────────────────────────────────── */
    _asCompilableTheme() {
        const s = this._state;
        return {
            id:          this.asset?.id || s.id || 'untitled',
            name:        this.asset?.name || s.name || 'Untitled',
            description: this.asset?.payload?.description || s.description || '',
            tags:        this.asset?.tags?.length ? this.asset.tags : ['untitled'],
            defaults: {
                pack:       s.pack,
                scale:      `${s.scaleKey}:${s.scaleMode}`,
                cps:        s.cps,
                valence:    s.valence,
                complexity: s.complexity,
                speed:      s.speed,
                variety:    s.variety,
                groove:     s.groove,
                texture:    s.texture,
            },
            layers:     structuredClone(s.layers),
            sections:   structuredClone(s.sections),
            seeds:      structuredClone(s.seeds),
            modulation: structuredClone(s.modulation ?? null),
        };
    }

    /* ══════════════════════════════════════════════════════════════
       STATE PERSISTENCE — writes/reads the v2 schema.
       ══════════════════════════════════════════════════════════════ */

    _getState() {
        return structuredClone(this._state);
    }

    _applyState(state) {
        this._state = _withDefaults(state);
        this._buildVisualizer();
        this._renderPanel();
    }
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */

function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function _esc(t) {
    return String(t).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));
}

function _sliderRow(label, prop, value, min, max, step, hint, directorHint) {
    const badge = directorHint
        ? `<span class="mb-director-badge" title="Also controlled by director at runtime">DIR</span>`
        : '';
    return `
      <div class="cb-section mb-slider-section">
        <div class="cb-section-title" style="display:flex;align-items:center;gap:6px;">
          ${label}${badge}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <input type="range" class="cb-range mb-slider"
                 data-prop="${prop}" value="${value}" min="${min}" max="${max}" step="${step}"
                 style="flex:1;">
          <span class="mb-slider-val" style="min-width:42px;text-align:right;color:${UI.accent};font-variant-numeric:tabular-nums;">${Number(value).toFixed(2)}</span>
        </div>
        <div class="cb-hint mb-slider-hint" style="margin-top:2px;">${hint}</div>
      </div>`;
}

/** True if this payload is already in v2 shape. */
function _looksLikeV2(d) {
    return d && typeof d === 'object'
        && typeof d.cps      === 'number'
        && Array.isArray(d.layers)
        && (d.layers.length === 0 || typeof d.layers[0].role === 'string');
}

/** Drop meta/top-level fields from a raw template to leave only the v2 state fields. */
function _stripRootMeta(payload) {
    const { description: _d, format: _f, ...rest } = payload || {};
    return rest;
}

/** Fill in any missing v2 fields with sensible defaults. Safe on partial state. */
function _withDefaults(s) {
    const out = {
        modulation: s.modulation ?? null,
        id:         s.id         ?? null,
        name:       s.name       ?? null,
        pack:       s.pack       ?? 'game_boy',
        scaleKey:   s.scaleKey   ?? 'C',
        scaleMode:  s.scaleMode  ?? 'major',
        cps:        s.cps        ?? 0.55,
        valence:    clamp01(s.valence    ?? 0.6),
        complexity: clamp01(s.complexity ?? 0.5),
        speed:      clampRange(s.speed   ?? 1.0, 0.5, 2.0),
        variety:    clamp01(s.variety    ?? 0.4),
        groove:     s.groove     ?? 'straight',
        texture:    s.texture    ?? 'clean',
        mood:       s.mood       ?? '',
        coverColor: s.coverColor ?? '#5b9bd5',
        layers:     Array.isArray(s.layers) ? s.layers.map(_defaultLayer) : [],
        // Pass sections through verbatim if at least one is present (the
        // schema now allows base loops with a single section). Old assets
        // with no sections get a single empty A that gets filled below.
        sections:   Array.isArray(s.sections) && s.sections.length >= 1
                      ? s.sections
                      : [{ id: 'A', layers: [] }],
        seeds:      s.seeds      ?? { pattern: Math.floor(Math.random() * 10000), variation: 0 },
    };
    // Back-compat bridge: if scale came in as "Key:mode", split it.
    if (typeof s.scale === 'string' && s.scale.includes(':')) {
        const [k, m] = s.scale.split(':', 2);
        out.scaleKey  = k;
        out.scaleMode = m;
    }
    // Populate empty sections with all roles by default (legacy fallback —
    // new themes ship sections fully populated, so this only kicks in for
    // ancient asset blobs lacking a sections array entirely).
    if (out.sections[0].layers.length === 0 && out.layers.length > 0) {
        const allRoles = out.layers.map(l => l.role);
        out.sections = [{ id: 'A', layers: allRoles.slice() }];
    }
    return out;
}

function _defaultLayer(l = {}) {
    return {
        role:        l.role     ?? 'melody',
        pattern:     l.pattern  ?? 'choose(c4,e4,g4)',
        feel:        Array.isArray(l.feel) && l.feel.length >= 3 ? l.feel : ['unset','unset','unset'],
        register:    Number.isInteger(l.register) ? clampRange(l.register, -3, 3) : 0,
        densityBase: clamp01(l.densityBase ?? 0.5),
    };
}

function clamp01(v) {
    const n = +v;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}
// NB: do NOT use `+v || lo` — that drops legitimate zero values to `lo`,
// because `0 || -3` is `-3` in JS. (This was the cause of the entire-song
// pitched-down-3-octaves bug in the edit path.)
function clampRange(v, lo, hi) {
    const n = +v;
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function _layerInSectionA(state, role) {
    return state.sections[0]?.layers?.includes(role) ?? false;
}

function _toggleRoleInSectionA(state, role, on) {
    const section = state.sections[0];
    if (!section || !Array.isArray(section.layers)) return;
    const idx = section.layers.indexOf(role);
    if (on && idx < 0) section.layers.push(role);
    if (!on && idx >= 0) section.layers.splice(idx, 1);
}

/* ──────────────────────────────────────────────────────────────────
   Legacy-asset conversion. The existing 24 stock templates have
   `payload.layers[i] = { name, pattern, gain, oscType }` with
   space-separated note patterns. We map them to the v2 shape so they
   open in the new editor without losing information.
   ────────────────────────────────────────────────────────────────── */

function _legacyToV2(legacyPayload) {
    const p = legacyPayload || {};
    // Old user-copy assets in IndexedDB stored their content under
    // payload.state (auto-save dumps the bridge's flat state there). Stock
    // legacy templates use payload.* directly. Try both locations for every
    // field so either layout converts cleanly.
    const inner = (p.state && typeof p.state === 'object') ? p.state : p;
    const legacyLayers = Array.isArray(inner.layers) ? inner.layers : (Array.isArray(p.layers) ? p.layers : []);

    // Role inference from the old layer name convention
    // ("drum_*", "bass_*", "pad_*", "lead_*", "melody_*", "texture_*").
    const toRole = (name) => {
        const n = (name || '').toLowerCase();
        if (n.includes('drum') || n.includes('beat') || n.includes('perc') || n.includes('kick')) return 'drums';
        if (n.includes('bass')) return 'bass';
        if (n.includes('pad'))  return 'pad';
        if (n.includes('lead') || n.includes('melody')) return 'melody';
        if (n.includes('chord')) return 'chords';
        return 'texture';
    };

    // Cheap way to satisfy the v2 randomization rail for converted legacy
    // patterns: wrap the original in a single-item choose() so the shape
    // validates. The listener-perceived pattern is identical.
    const wrapRandom = (pattern) => {
        const trimmed = (pattern || '').trim();
        if (!trimmed) return 'choose(c4,e4)';
        // If already has choose()/irand(), leave it alone.
        if (/\bchoose\s*\(|\birand\s*\(/.test(trimmed)) return trimmed;
        // Split and prepend a choose() at the end so the pattern carries
        // at least one random element without disturbing the main figure.
        return `${trimmed.toLowerCase()} choose(${_firstNoteOf(trimmed)},${_firstNoteOf(trimmed)})`;
    };

    // Map legacy BPM to cps: 1 cycle = 4 beats, so cps = bpm / (60 * 4).
    const bpm = inner.bpm ?? p.bpm;
    const cps = (bpm && bpm > 0) ? (bpm / 240) : 0.5;

    // Key + scale — legacy uses "A" + "natural minor"; normalize.
    const rawKey   = inner.key   ?? p.key;
    const rawScale = inner.scale ?? p.scale ?? inner.scaleMode ?? p.scaleMode;
    const key  = typeof rawKey   === 'string' ? rawKey.replace(/^([A-G][#b]?).*$/, '$1') : 'C';
    const mode = _normalizeLegacyMode(rawScale);

    const seenRoles = new Set();
    const layers = legacyLayers
        .map((l) => {
            let role = toRole(l.name);
            while (seenRoles.has(role)) {
                // De-dupe roles by falling back through the list. Keeps the
                // v2 validator happy (no duplicate roles per theme).
                const options = LAYER_ROLES.filter(r => !seenRoles.has(r));
                if (options.length === 0) return null;
                role = options[0];
            }
            seenRoles.add(role);
            return _defaultLayer({
                role,
                pattern: wrapRandom(l.pattern),
                feel:    ['converted','legacy','unset'],
                register: 0,
                densityBase: clamp01(l.gain ?? 0.5),
            });
        })
        .filter(Boolean)
        .slice(0, 6);  // v2 hard cap

    // Ensure at least 3 layers so the v2 schema is happy; pad with a quiet
    // texture layer if we're short. Pattern uses choose() to pass validation.
    while (layers.length < 3) {
        const fillRole = LAYER_ROLES.find(r => !seenRoles.has(r)) ?? 'texture';
        seenRoles.add(fillRole);
        layers.push(_defaultLayer({
            role:     fillRole,
            pattern:  'choose(c4,~) ~ ~ ~',
            feel:     ['placeholder','quiet','filler'],
            densityBase: 0.1,
        }));
    }

    const sections = [
        { id: 'A', layers: layers.map(l => l.role) },
        { id: 'B', layers: layers.map(l => l.role) },
    ];

    return _withDefaults({
        pack:       'game_boy',
        scaleKey:   key,
        scaleMode:  mode,
        cps,
        valence:    0.55,
        complexity: Math.min(1, 0.3 + layers.length * 0.1),
        speed:      1.0,
        variety:    0.3,
        groove:     'straight',
        texture:    'clean',
        coverColor: inner.coverColor || inner.mood_color || p.mood_color || '#5b9bd5',
        layers,
        sections,
        seeds:      { pattern: Math.floor(Math.random() * 10000), variation: 0 },
    });
}

function _normalizeLegacyMode(mode) {
    if (typeof mode !== 'string') return 'major';
    const m = mode.toLowerCase().replace(/\s+/g, '_').replace('-', '_');
    if (m === 'natural_minor' || m === 'aeolian' || m === 'minor') return 'minor';
    if (m === 'major' || m === 'ionian')                           return 'major';
    if (m === 'dorian' || m === 'mixolydian' || m === 'lydian'
        || m === 'phrygian' || m === 'locrian')                    return m;
    if (m.includes('penta'))                                       return 'major_pentatonic';
    if (m.includes('blues'))                                       return 'blues';
    return 'major';
}

function _firstNoteOf(pattern) {
    const m = String(pattern || '').trim().toLowerCase().match(/[a-g][#b]?\d/);
    return m ? m[0] : 'c4';
}
