/**
 * MusicBridge.js — Full music theme editor bridge.
 *
 * Tabs: File · Layers · Pattern · Settings
 *
 * File     — name, description, tags
 * Layers   — audio layer list with gain sliders, add/remove
 * Pattern  — BPM slider, key selector, scale selector, Strudel pattern code
 * Settings — duration behavior, fade in/out, mood colour, delete
 */

import { BaseBridge } from './BaseBridge.js?v=4';
import { renderFileTab, wireFileTabEvents } from '../shared/builderUI.js';
import * as THREE from 'three';
import { standard } from '../shared/materials.js';
import { UI }       from '../shared/palette.js';

// ── Tab definitions ─────────────────────────────────────────────
const TABS = [
    { id: 'file',     label: 'File',     icon: '📄' },
    { id: 'layers',   label: 'Layers',   icon: '≡' },
    { id: 'pattern',  label: 'Pattern',  icon: '♫' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
];

// ── Musical keys & scales ───────────────────────────────────────
const KEYS   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALES = ['major','minor','dorian','mixolydian','pentatonic','blues'];

// ── Mood colours ────────────────────────────────────────────────
const MOODS = [
    { id: 'calm',      label: 'Calm',      color: '#5b9bd5' },
    { id: 'energetic', label: 'Energetic', color: '#ff6b6b' },
    { id: 'dark',      label: 'Dark',      color: '#4a4a6a' },
    { id: 'warm',      label: 'Warm',      color: '#f0a050' },
    { id: 'cool',      label: 'Cool',      color: '#50c8f0' },
];

// ── Duration behaviors ──────────────────────────────────────────
const DURATIONS = ['loop', 'play-once', 'fade-out'];

// ── Scale intervals (semitones from root) ──────────────────────
const SCALE_INTERVALS = {
    major:       [0, 2, 4, 5, 7, 9, 11],
    minor:       [0, 2, 3, 5, 7, 8, 10],
    dorian:      [0, 2, 3, 5, 7, 9, 10],
    mixolydian:  [0, 2, 4, 5, 7, 9, 10],
    pentatonic:  [0, 2, 4, 7, 9],
    blues:       [0, 3, 5, 6, 7, 10],
};

const ALL_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function getScaleNotes(key, scale, octLow = 3, octHigh = 5) {
    const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.minor;
    const rootIdx = ALL_NOTES.indexOf(key);
    if (rootIdx < 0) return [];
    const notes = [];
    for (let oct = octLow; oct <= octHigh; oct++) {
        for (const interval of intervals) {
            const noteIdx = (rootIdx + interval) % 12;
            const noteOct = oct + Math.floor((rootIdx + interval) / 12);
            if (noteOct > octHigh) break;
            notes.push(`${ALL_NOTES[noteIdx]}${noteOct}`);
        }
    }
    return notes;
}

function generateLayerPattern(scaleNotes, oscType, count = 8) {
    if (scaleNotes.length === 0) return '';
    if (oscType === 'sawtooth') {
        // Bass: lower octave, fewer notes
        const pool = scaleNotes.filter(n => parseInt(n.slice(-1)) <= 3);
        const src = pool.length > 0 ? pool : scaleNotes.slice(0, 5);
        return Array.from({ length: Math.min(count, 4) }, () => src[Math.floor(Math.random() * src.length)]).join(' ');
    }
    if (oscType === 'square') {
        // Lead: mid-high melodic
        const pool = scaleNotes.filter(n => { const o = parseInt(n.slice(-1)); return o >= 4 && o <= 5; });
        const src = pool.length > 0 ? pool : scaleNotes;
        return Array.from({ length: count }, () => src[Math.floor(Math.random() * src.length)]).join(' ');
    }
    if (oscType === 'triangle') {
        // Perc: rhythmic, limited range
        const src = scaleNotes.slice(0, 3);
        return Array.from({ length: count }, () => src[Math.floor(Math.random() * src.length)]).join(' ');
    }
    // Sine/pad: slow, wide
    const pool = scaleNotes.filter(n => parseInt(n.slice(-1)) >= 3);
    const src = pool.length > 0 ? pool : scaleNotes;
    return Array.from({ length: Math.min(count, 6) }, () => src[Math.floor(Math.random() * src.length)]).join(' ');
}

// ── Oscillator types for instrument selection ──────────────────
const OSC_TYPES = [
    { id: 'sine',     label: 'Sine (Pad)' },
    { id: 'square',   label: 'Square (Lead)' },
    { id: 'sawtooth', label: 'Sawtooth (Bass)' },
    { id: 'triangle', label: 'Triangle (Perc)' },
];

export class MusicBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Music';
        this.storeName   = 'music';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        const p = this.asset?.payload || {};

        // Prefer saved state (from auto-save), fall back to direct payload fields (stock assets)
        this._state = {
            bpm:       d.bpm       || p.bpm       || 120,
            key:       d.key       || p.key       || 'C',
            scale:     d.scale     || p.scale     || 'minor',
            pattern:   d.pattern   || p.pattern   || '',
            duration:  d.duration  || p.duration_behavior || 'loop',
            fadeIn:    d.fadeIn    ?? p.fade_in    ?? 2.0,
            fadeOut:   d.fadeOut   ?? p.fade_out   ?? 3.0,
            moodColor: d.moodColor || p.mood_color || '#5b9bd5',
            layers:    structuredClone(d.layers || p.layers || []),
        };

        // UI state
        this._activeTab = 'file';
        this._meshes    = [];
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE — Animated music visualizer
    // ═══════════════════════════════════════════════════════════════

    _buildScene() {
        this._camera.position.set(0, 3, 5);
        this._camera.lookAt(0, 1, 0);
        this._camera.fov = 60;
        this._camera.updateProjectionMatrix();

        this._buildVisualizer();
    }

    /** Build visualizer meshes that react to state. */
    _buildVisualizer() {
        // Remove old
        for (const m of this._meshes) {
            this._scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
        this._meshes = [];

        const moodHex = this._state.moodColor || '#5b9bd5';
        const moodInt = parseInt(moodHex.slice(1), 16);

        // Central pulsing sphere (mood colour)
        const sphere = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.6, 2),
            standard(moodInt, { emissive: moodInt, emissiveIntensity: 0.15 }),
        );
        sphere.position.set(0, 1.5, 0);
        sphere.userData.rotAxis = new THREE.Vector3(0, 1, 0).normalize();
        sphere.userData.baseScale = 1;
        this._scene.add(sphere);
        this._meshes.push(sphere);

        // Orbiting rings (one per layer, up to 4)
        const layers = this._state.layers;
        const ringCount = Math.min(layers.length, 4) || 1;
        for (let i = 0; i < ringCount; i++) {
            const hue = (i * 0.25 + 0.55) % 1;
            const color = new THREE.Color().setHSL(hue, 0.6, 0.55);
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.9 + i * 0.35, 0.04, 8, 32),
                standard(color, { transparent: true, opacity: 0.6 }),
            );
            ring.position.set(0, 1.5, 0);
            ring.userData.rotAxis = new THREE.Vector3(
                Math.sin(i * 1.2), 1, Math.cos(i * 1.2),
            ).normalize();
            ring.userData.speed = 0.003 + i * 0.001;
            this._scene.add(ring);
            this._meshes.push(ring);
        }

        // Beat indicator dots (based on BPM)
        const dotCount = Math.min(Math.round(this._state.bpm / 30), 8);
        for (let i = 0; i < dotCount; i++) {
            const angle = (i / dotCount) * Math.PI * 2;
            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 8, 8),
                standard(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }),
            );
            dot.position.set(Math.cos(angle) * 2, 1.5 + Math.sin(angle) * 0.5, Math.sin(angle) * 2);
            dot.userData.orbitAngle = angle;
            dot.userData.orbitSpeed = (this._state.bpm / 120) * 0.01;
            this._scene.add(dot);
            this._meshes.push(dot);
        }
    }

    _onTick(delta) {
        const time = performance.now() * 0.001;
        const bpmFactor = this._state.bpm / 120;

        for (const m of this._meshes) {
            // Rotation
            if (m.userData.rotAxis) {
                const speed = m.userData.speed || 0.004;
                m.rotateOnWorldAxis(m.userData.rotAxis, speed * bpmFactor);
            }

            // Orbit (beat dots)
            if (m.userData.orbitAngle !== undefined) {
                m.userData.orbitAngle += m.userData.orbitSpeed;
                const a = m.userData.orbitAngle;
                m.position.set(Math.cos(a) * 2, 1.5 + Math.sin(a * 2) * 0.3, Math.sin(a) * 2);
            }

            // Pulse central sphere
            if (m.userData.baseScale) {
                const pulse = 1 + Math.sin(time * bpmFactor * 2) * 0.08;
                m.scale.setScalar(pulse);
            }
        }
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
        if (tab === 'file')     body = this._renderFileTab();
        if (tab === 'layers')   body = this._renderLayersTab();
        if (tab === 'pattern')  body = this._renderPatternTab();
        if (tab === 'settings') body = this._renderSettingsTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File Tab ────────────────────────────────────────────────
    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Music theme name…',
            descPlaceholder: 'Describe this music theme…',
            tagsPlaceholder: 'e.g. lofi, jazz, ambient',
        });
    }

    // ── Layers Tab ──────────────────────────────────────────────
    _renderLayersTab() {
        const layers = this._state.layers;

        let layerHtml = '';
        if (layers.length === 0) {
            layerHtml = '<div class="cb-hint">No layers yet — add one below</div>';
        } else {
            layerHtml = layers.map((layer, i) => {
                const oscOpts = OSC_TYPES.map(o =>
                    `<option value="${o.id}" ${(layer.oscType || 'sine') === o.id ? 'selected' : ''}>${o.label}</option>`
                ).join('');
                return `
                <div class="cb-element-row" style="display:flex;gap:8px;align-items:center;padding:8px;background:${UI.panelRaised};border-radius:8px;margin-bottom:6px;">
                    <div style="flex:1;">
                        <input type="text" class="cb-input cb-layer-name" data-idx="${i}"
                               value="${_esc(layer.name || `Layer ${i + 1}`)}"
                               placeholder="Layer name" style="margin-bottom:4px;width:100%;">
                        <select class="cb-acc-select cb-layer-osc" data-idx="${i}" style="margin-bottom:4px;width:100%;font-size:11px;">
                            ${oscOpts}
                        </select>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="cb-color-label" style="font-size:10px;white-space:nowrap;">Gain:</label>
                            <input type="range" class="cb-range cb-layer-gain" data-idx="${i}"
                                   value="${layer.gain ?? 0.8}" min="0" max="1" step="0.05"
                                   style="flex:1;">
                            <span class="cb-color-label" style="font-size:10px;min-width:28px;">${(layer.gain ?? 0.8).toFixed(2)}</span>
                        </div>
                    </div>
                    <button class="cb-btn-sm cb-layer-del" data-idx="${i}" title="Remove layer"
                            style="color:${UI.danger};">✕</button>
                </div>`;
            }).join('');
        }

        return `
          <div class="cb-section">
            <div class="cb-section-title">Music Layers (${layers.length})</div>
            ${layerHtml}
            <button class="cb-btn-sm cb-layer-add" style="margin-top:8px;">+ Add Layer</button>
          </div>`;
    }

    // ── Pattern Tab ─────────────────────────────────────────────
    _renderPatternTab() {
        const s = this._state;

        const keyBtns = KEYS.map(k =>
            `<button class="cb-shape-btn cb-key-btn ${s.key === k ? 'active' : ''}" data-key="${k}">${k}</button>`
        ).join('');

        const scaleBtns = SCALES.map(sc =>
            `<button class="cb-shape-btn cb-scale-btn ${s.scale === sc ? 'active' : ''}" data-scale="${sc}">${_capitalize(sc)}</button>`
        ).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Tempo</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="range" class="cb-range cb-bpm-slider" value="${s.bpm}" min="40" max="200" step="1" style="flex:1;">
              <span class="cb-bpm-display" style="font-size:14px;font-weight:600;min-width:60px;text-align:right;color:${UI.textPrimary};">${s.bpm} BPM</span>
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Key</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(6,1fr);">${keyBtns}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Scale</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(3,1fr);">${scaleBtns}</div>
          </div>
          <div class="cb-section">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div class="cb-section-title" style="margin:0;">Generate</div>
              <button class="cb-btn-sm cb-generate-notes" style="font-size:11px;">
                🎲 Generate from ${s.key} ${_capitalize(s.scale)}
              </button>
            </div>
            <div class="cb-hint" style="margin-top:4px;">
              Auto-fill layer patterns using the selected key &amp; scale.
              ${s.layers.length === 0 ? '<br><em>Add layers first in the Layers tab.</em>' : `Will update ${s.layers.length} layer(s).`}
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Master Pattern</div>
            <textarea class="cb-input cb-pattern-code" rows="4"
                      placeholder="stack(s('piano').n('0 2 4 7'), s('hh*8'))"
                      style="font-family:monospace;font-size:12px;width:100%;resize:vertical;">${_esc(s.pattern)}</textarea>
            <div class="cb-hint" style="margin-top:4px;">Strudel / TidalCycles pattern syntax</div>
          </div>`;
    }

    // ── Settings Tab ────────────────────────────────────────────
    _renderSettingsTab() {
        const s = this._state;

        const durOpts = DURATIONS.map(d =>
            `<option value="${d}" ${s.duration === d ? 'selected' : ''}>${_capitalize(d.replace('-', ' '))}</option>`
        ).join('');

        const moodBtns = MOODS.map(m =>
            `<button class="cb-shape-btn cb-mood-btn ${s.moodColor === m.color ? 'active' : ''}"
                     data-color="${m.color}" title="${m.label}"
                     style="display:flex;align-items:center;gap:4px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${m.color};"></span>
                ${m.label}
             </button>`
        ).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Duration Behavior</div>
            <select class="cb-acc-select cb-duration-select">${durOpts}</select>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Fade In</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="range" class="cb-range cb-fade-in" value="${s.fadeIn}" min="0" max="10" step="0.5" style="flex:1;">
              <span class="cb-color-label" style="min-width:36px;">${s.fadeIn.toFixed(1)}s</span>
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Fade Out</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="range" class="cb-range cb-fade-out" value="${s.fadeOut}" min="0" max="10" step="0.5" style="flex:1;">
              <span class="cb-color-label" style="min-width:36px;">${s.fadeOut.toFixed(1)}s</span>
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Mood Colour</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(3,1fr);">${moodBtns}</div>
          </div>`;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENT WIRING
    // ═══════════════════════════════════════════════════════════════

    _wirePanelEvents() {
        const panel = this.panelEl;

        // Tab switching
        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // ── File tab (shared wiring) ──
        wireFileTabEvents(panel, this, { formatType: 'music_state' });

        // ── Layers tab ──
        panel.querySelectorAll('.cb-layer-name').forEach(inp => {
            inp.addEventListener('change', () => {
                const i = parseInt(inp.dataset.idx);
                if (this._state.layers[i]) {
                    this._state.layers[i].name = inp.value;
                    this.markDirty('Rename layer');
                }
            });
        });
        panel.querySelectorAll('.cb-layer-gain').forEach(inp => {
            inp.addEventListener('input', () => {
                const i = parseInt(inp.dataset.idx);
                if (this._state.layers[i]) {
                    this._state.layers[i].gain = parseFloat(inp.value);
                    // Update display label
                    const label = inp.parentElement?.querySelector('.cb-color-label:last-child');
                    if (label) label.textContent = parseFloat(inp.value).toFixed(2);
                }
            });
            inp.addEventListener('change', () => {
                this.markDirty('Adjust gain');
            });
        });
        panel.querySelectorAll('.cb-layer-osc').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.idx);
                if (this._state.layers[i]) {
                    this._state.layers[i].oscType = sel.value;
                    this.markDirty('Change instrument');
                }
            });
        });
        panel.querySelectorAll('.cb-layer-del').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.layers.splice(parseInt(btn.dataset.idx), 1);
                this._buildVisualizer();
                this.markDirty('Remove layer');
                this._renderPanel();
            });
        });
        panel.querySelector('.cb-layer-add')?.addEventListener('click', () => {
            this._state.layers.push({
                name: `Layer ${this._state.layers.length + 1}`,
                gain: 0.8,
                oscType: 'sine',
                pattern: '',
            });
            this._buildVisualizer();
            this.markDirty('Add layer');
            this._renderPanel();
        });

        // ── Pattern tab ──
        // BPM slider
        const bpmSlider = panel.querySelector('.cb-bpm-slider');
        if (bpmSlider) {
            bpmSlider.addEventListener('input', () => {
                this._state.bpm = parseInt(bpmSlider.value);
                const display = panel.querySelector('.cb-bpm-display');
                if (display) display.textContent = `${this._state.bpm} BPM`;
            });
            bpmSlider.addEventListener('change', () => {
                this._buildVisualizer();
                this.markDirty('Change BPM');
            });
        }

        // Key buttons
        panel.querySelectorAll('.cb-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.key = btn.dataset.key;
                this.markDirty('Change key');
                this._renderPanel();
            });
        });

        // Scale buttons
        panel.querySelectorAll('.cb-scale-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.scale = btn.dataset.scale;
                this.markDirty('Change scale');
                this._renderPanel();
            });
        });

        // Generate Notes button
        panel.querySelector('.cb-generate-notes')?.addEventListener('click', () => {
            const scaleNotes = getScaleNotes(this._state.key, this._state.scale);
            if (scaleNotes.length === 0 || this._state.layers.length === 0) return;
            for (const layer of this._state.layers) {
                layer.pattern = generateLayerPattern(scaleNotes, layer.oscType || 'sine');
            }
            this.markDirty('Generate notes');
            this._renderPanel();
        });

        // Pattern code
        panel.querySelector('.cb-pattern-code')?.addEventListener('input', (e) => {
            this._state.pattern = e.target.value;
        });
        panel.querySelector('.cb-pattern-code')?.addEventListener('change', () => {
            this.markDirty('Edit pattern');
        });

        // ── Settings tab ──
        // Duration
        panel.querySelector('.cb-duration-select')?.addEventListener('change', (e) => {
            this._state.duration = e.target.value;
            this.markDirty('Change duration');
        });

        // Fade in
        const fadeInSlider = panel.querySelector('.cb-fade-in');
        if (fadeInSlider) {
            fadeInSlider.addEventListener('input', () => {
                this._state.fadeIn = parseFloat(fadeInSlider.value);
                const label = fadeInSlider.parentElement?.querySelector('.cb-color-label');
                if (label) label.textContent = `${this._state.fadeIn.toFixed(1)}s`;
            });
            fadeInSlider.addEventListener('change', () => this.markDirty('Change fade in'));
        }

        // Fade out
        const fadeOutSlider = panel.querySelector('.cb-fade-out');
        if (fadeOutSlider) {
            fadeOutSlider.addEventListener('input', () => {
                this._state.fadeOut = parseFloat(fadeOutSlider.value);
                const label = fadeOutSlider.parentElement?.querySelector('.cb-color-label');
                if (label) label.textContent = `${this._state.fadeOut.toFixed(1)}s`;
            });
            fadeOutSlider.addEventListener('change', () => this.markDirty('Change fade out'));
        }

        // Mood colour buttons
        panel.querySelectorAll('.cb-mood-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.moodColor = btn.dataset.color;
                this._buildVisualizer();
                this.markDirty('Change mood');
                this._renderPanel();
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    _getState() {
        return {
            bpm:       this._state.bpm,
            key:       this._state.key,
            scale:     this._state.scale,
            pattern:   this._state.pattern,
            duration:  this._state.duration,
            fadeIn:    this._state.fadeIn,
            fadeOut:   this._state.fadeOut,
            moodColor: this._state.moodColor,
            layers:    structuredClone(this._state.layers),
        };
    }

    _applyState(state) {
        this._state = { ...state, layers: structuredClone(state.layers || []) };
        this._buildVisualizer();
    }
}

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
