/**
 * VoiceBridge.js — Voice Builder bridge.
 *
 * Full voice synthesis editor with:
 *   - Voice tab: language, preset chips, synthesis params (speed/pitch/vol/amp/wordgap), effects (7 sliders)
 *   - Mouth tab: lip-sync tuning (snappiness/audio lead), lip color/thickness, layer visibility
 *   - Display tab: face color, caption style
 *   - 3D preview: floating head with MouthRig, driven by VoiceEngine
 *   - Text input + play/stop button
 */

import { BaseBridge } from './BaseBridge.js?v=3';
import { tweenToPose } from '../shared/builderUI.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoiceEngine } from '../shared/voiceEngine.js';
import { MouthRig }    from '../shared/mouthRig.js';
import { VOICE_PRESETS, VOICE_DEFAULTS, HEAD, HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
         DEFAULT_COLORS, FACE_FEATURES }
    from '../shared/charConfig.js';
import { generateHeadGeometry } from '../shared/headShapes.js';
import { makeEyeTexture } from '../shared/eyeTexture.js';
import { createTwoZoneMaterial } from '../shared/materials.js';

/* ── Language options ─────────────────────────────── */
const LANGUAGES = [
    ['en/en-us', 'English (US)'],    ['en/en',    'English (UK)'],
    ['en/en-rp', 'English (RP)'],    ['en/en-sc', 'English (Scottish)'],
    ['fr',       'French'],          ['de',       'German'],
    ['es',       'Spanish'],         ['es-la',    'Spanish (Latin Am.)'],
    ['it',       'Italian'],         ['pt',       'Portuguese'],
    ['nl',       'Dutch'],           ['sv',       'Swedish'],
    ['pl',       'Polish'],          ['ro',       'Romanian'],
    ['hu',       'Hungarian'],       ['cs',       'Czech'],
    ['fi',       'Finnish'],         ['tr',       'Turkish'],
    ['el',       'Greek'],           ['eo',       'Esperanto'],
];

const TABS = [
    { id: 'voice',   label: 'Voice',   icon: '🎤' },
    { id: 'mouth',   label: 'Mouth',   icon: '👄' },
    { id: 'display', label: 'Display', icon: '🎨' },
];

const DEFAULT_TEXT = 'Hello! I am a voice. Customize me to sound however you like!';

export class VoiceBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Voice';
        this.storeName   = 'voices';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        this._state = {
            // Synthesis params
            language:   d.language   || 'en/en-us',
            variant:    d.variant    || VOICE_DEFAULTS.params.variant || 'm3',
            speed:      d.speed      ?? VOICE_DEFAULTS.params.speed,
            pitch:      d.pitch      ?? VOICE_DEFAULTS.params.pitch,
            volume:     d.volume     ?? VOICE_DEFAULTS.params.volume,
            amplitude:  d.amplitude  ?? VOICE_DEFAULTS.params.amplitude,
            wordgap:    d.wordgap    ?? VOICE_DEFAULTS.params.wordgap,
            // Extended synthesis params (meSpeak/eSpeak native)
            linebreak:  d.linebreak  ?? 0,
            capitals:   d.capitals   ?? 0,
            punct:      d.punct      ?? false,
            nostop:     d.nostop     ?? false,
            // Audio post-processing effects
            reverb:      d.reverb      ?? VOICE_DEFAULTS.effects.reverb,
            wobble:      d.wobble      ?? VOICE_DEFAULTS.effects.wobble,
            wobbleSpeed: d.wobbleSpeed ?? VOICE_DEFAULTS.effects.wobbleSpeed,
            brightness:  d.brightness  ?? VOICE_DEFAULTS.effects.brightness,
            vocalFry:    d.vocalFry    ?? VOICE_DEFAULTS.effects.vocalFry,
            chorus:      d.chorus      ?? VOICE_DEFAULTS.effects.chorus,
            // Mouth
            mouthSnappiness: d.mouthSnappiness ?? 85,
            audioLead:       d.audioLead       ?? 40,
            lipColor:        d.lipColor        || '#d4626e',
            lipThickness:    d.lipThickness    ?? 3.5,
            showLips:        d.showLips         ?? true,
            showTeeth:       d.showTeeth        ?? true,
            showTongue:      d.showTongue       ?? true,
            // Display
            faceColor:   d.faceColor   || '#7eb8c9',
            scalpColor:  d.scalpColor  || '#3d6b7a',
            captionSize: d.captionSize ?? 18,
            // Preset key (for UI tracking, not persisted as state)
            presetKey:   d.presetKey   || null,
            // Text
            previewText: d.previewText || DEFAULT_TEXT,
        };

        this._activeTab = 'voice';
        this._voiceEngine = null;
        this._voiceReady = false;
        this._mouthRig = null;
        this._isSpeaking = false;
        this._controls = null;
        this._headMesh = null;
        this._headGroup = null;
    }

    /* ══════════════════════════════════════════════════════════
       SCENE
       ══════════════════════════════════════════════════════════ */

    async _buildScene() {
        // Camera — close-up on head
        const headCenterY = 0.72;
        this._camera.position.set(0, headCenterY, 1.6);
        this._camera.lookAt(0, headCenterY, 0);
        this._camera.fov = 45;
        this._camera.updateProjectionMatrix();

        // Orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.target.set(0, headCenterY, 0);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance = 0.8;
        this._controls.maxDistance = 4;
        this._controls.maxPolarAngle = Math.PI * 0.85;
        this._controls.update();

        this._buildHead();
        this._initVoice();
    }

    _buildHead() {
        // Clean up old head
        if (this._headGroup) {
            this._scene.remove(this._headGroup);
            this._headGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        }

        this._headGroup = new THREE.Group();
        const headCenterY = 0.72;
        this._headGroup.position.y = headCenterY - HEAD_HEIGHT_PRESETS['medium'].height / 2;

        // Head geometry — use medium defaults
        const headH = HEAD_HEIGHT_PRESETS['medium'].height;
        const headW = HEAD_WIDTH_PRESETS['moderate'].width;
        const { geometry: headGeo, frontZ } = generateHeadGeometry('roundedBox', headW, headH);

        // Two-zone material for scalp/skin
        const scalpSplitY = headH - headH * HEAD.scalpFraction;
        const headMat = this._createHeadMaterial(scalpSplitY);
        this._headMesh = new THREE.Mesh(headGeo, headMat);
        this._headMesh.castShadow = true;
        this._headGroup.add(this._headMesh);

        // Eyes — canvas texture on planes (matches character creator style)
        const exo = FACE_FEATURES.eye.xOffsetByWidth.moderate;
        const eyo = FACE_FEATURES.eye.yOffsetByHeight.medium;
        const myo = FACE_FEATURES.mouth.yOffsetByHeight.medium;
        const skinH = headH - headH * HEAD.scalpFraction;
        const skinCY = skinH / 2;  // head geometry bottom at y=0
        const faceZ = frontZ + 0.005;

        const eyeTex = makeEyeTexture('#4a7a8c', 'circle');
        const eyePlaneSize = FACE_FEATURES.eye.scleraDiameter * 1.3;
        const eyeGeo = new THREE.PlaneGeometry(eyePlaneSize, eyePlaneSize);

        const eyeMatL = new THREE.MeshBasicMaterial({
            map: eyeTex, transparent: true, depthWrite: false, side: THREE.FrontSide,
        });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
        eyeL.position.set(-exo, skinCY + eyo, faceZ);
        this._headGroup.add(eyeL);

        const eyeTexR = eyeTex.clone();
        eyeTexR.needsUpdate = true;
        const eyeMatR = new THREE.MeshBasicMaterial({
            map: eyeTexR, transparent: true, depthWrite: false, side: THREE.FrontSide,
        });
        const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeMatR);
        eyeR.position.set(exo, skinCY + eyo, faceZ);
        this._headGroup.add(eyeR);

        // Mouth rig
        if (this._mouthRig) this._mouthRig.dispose();
        this._mouthRig = new MouthRig();
        this._mouthRig.setLipColor(this._state.lipColor);
        this._mouthRig.setLipThickness(this._state.lipThickness);
        this._mouthRig.attach(this._headGroup, skinCY, myo, faceZ);

        this._scene.add(this._headGroup);
    }

    _createHeadMaterial(splitY) {
        // Try to use shared two-zone material, fallback to basic
        try {
            return createTwoZoneMaterial(this._state.scalpColor, this._state.faceColor, splitY, 0.06);
        } catch {
            // Fallback: simple face-color material
            return new THREE.MeshStandardMaterial({
                color: this._state.faceColor,
                roughness: 0.6, metalness: 0.05,
            });
        }
    }

    async _initVoice() {
        this._voiceEngine = new VoiceEngine();
        try {
            await this._voiceEngine.init();
            this._voiceEngine.applyState(this._state);
            this._voiceReady = true;
        } catch (e) {
            console.warn('[VoiceBridge] Voice engine init failed:', e.message);
        }
    }

    _onTick(delta) {
        if (this._controls) this._controls.update();
        if (this._voiceReady && this._isSpeaking) {
            this._voiceEngine.update(delta * 1000);
            const p = this._voiceEngine.getVisemeParams();
            if (this._mouthRig) this._mouthRig.update(p);
        }
    }

    /* ══════════════════════════════════════════════════════════
       PANEL
       ══════════════════════════════════════════════════════════ */

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const s = this._state;

        // Tab bar
        let tabBar = '<div class="vb-tabs">';
        for (const t of TABS) {
            tabBar += `<button class="vb-tab${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
                <span class="vb-tab-icon">${t.icon}</span> ${t.label}
            </button>`;
        }
        tabBar += '</div>';

        // Name input
        const nameHtml = `<div class="cb-section">
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Voice name...">
        </div>`;

        // Tab content
        let body = '';
        if (this._activeTab === 'voice')   body = this._renderVoiceTab(s);
        if (this._activeTab === 'mouth')   body = this._renderMouthTab(s);
        if (this._activeTab === 'display') body = this._renderDisplayTab(s);

        // Text input + play button
        const playIcon = this._isSpeaking ? '■' : '▶';
        const playLabel = this._isSpeaking ? 'Stop' : 'Play';
        const textHtml = `
            <div class="vb-text-section">
                <textarea class="vb-text-input" rows="3" placeholder="Type text to speak...">${_esc(s.previewText)}</textarea>
                <button class="vb-play-btn${this._isSpeaking ? ' speaking' : ''}">${playIcon} ${playLabel}</button>
            </div>`;

        return nameHtml + tabBar + body + textHtml;
    }

    _renderVoiceTab(s) {
        // Language select
        const langOpts = LANGUAGES.map(([v, l]) =>
            `<option value="${v}"${v === s.language ? ' selected' : ''}>${l}</option>`
        ).join('');

        // Variant select — all meSpeak/eSpeak variants
        const VARIANTS = [
            ['m1','Male 1'],['m2','Male 2'],['m3','Male 3'],['m4','Male 4'],
            ['m5','Male 5'],['m6','Male 6'],['m7','Male 7 (deep)'],
            ['f1','Female 1'],['f2','Female 2'],['f3','Female 3'],['f4','Female 4'],['f5','Female 5'],
            ['croak','Croak'],['whisper','Whisper (M)'],['whisperf','Whisper (F)'],
            ['klatt','Klatt 1'],['klatt2','Klatt 2'],['klatt3','Klatt 3'],['klatt4','Klatt 4'],
        ];
        const variantOpts = VARIANTS.map(([v, l]) =>
            `<option value="${v}"${v === s.variant ? ' selected' : ''}>${l}</option>`
        ).join('');

        // Capitals mode select
        const capOpts = [
            ['0','Off'],['1','Click sound'],['2','Announce "capital"'],['3','Pitch raise'],
        ].map(([v,l]) => `<option value="${v}"${String(s.capitals) === v ? ' selected' : ''}>${l}</option>`).join('');

        // Preset chips
        const chips = Object.entries(VOICE_PRESETS).map(([key, p]) =>
            `<button class="vb-chip${s.presetKey === key ? ' active' : ''}" data-preset="${key}">${p.label}</button>`
        ).join('');

        return `
            <div class="cb-section">
                <div class="cb-section-title">Language</div>
                <select class="vb-select" data-prop="language">${langOpts}</select>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Voice Preset</div>
                <div class="vb-chip-group">${chips}</div>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Voice Character</div>
                <select class="vb-select" data-prop="variant">${variantOpts}</select>
                <p class="vb-hint">Formant voice variant — changes timbre and character.</p>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Synthesis Parameters</div>
                ${_slider('Speed', 'speed', s.speed, 80, 450, 5, ' wpm')}
                ${_slider('Pitch', 'pitch', s.pitch, 0, 100, 1, '')}
                ${_slider('Amplitude', 'amplitude', s.amplitude, 0, 200, 5, '')}
                ${_slider('Volume', 'volume', s.volume, 0, 200, 5, '%')}
                ${_slider('Word Gap', 'wordgap', s.wordgap, 0, 50, 1, '')}
                ${_slider('Line Break', 'linebreak', s.linebreak, 0, 20, 1, '')}
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Speech Options</div>
                <div class="vb-slider-row">
                    <label class="cb-color-label">Capitals:</label>
                    <select class="vb-select" data-prop="capitals">${capOpts}</select>
                </div>
                <div class="vb-toggles">
                    ${_toggle('Speak Punctuation', 'punct', s.punct)}
                    ${_toggle('No End Pause', 'nostop', s.nostop)}
                </div>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Audio Post-Processing</div>
                ${_slider('Reverb', 'reverb', s.reverb, 0, 100, 1, '')}
                ${_slider('Wobble', 'wobble', s.wobble, 0, 100, 1, '')}
                ${_slider('Wobble Speed', 'wobbleSpeed', s.wobbleSpeed, 1, 20, 0.5, ' Hz')}
                ${_slider('Brightness', 'brightness', s.brightness, -100, 100, 1, '')}
                ${_slider('Vocal Fry', 'vocalFry', s.vocalFry, 0, 100, 1, '')}
                ${_slider('Chorus', 'chorus', s.chorus, 0, 100, 1, '')}
                <p class="vb-hint">Post-processing effects applied after synthesis. Set all to 0 for clean output.</p>
            </div>`;
    }

    _renderMouthTab(s) {
        return `
            <div class="cb-section">
                <div class="cb-section-title">Lip Sync Tuning</div>
                ${_slider('Snappiness', 'mouthSnappiness', s.mouthSnappiness, 0, 100, 5, '')}
                ${_slider('Audio Lead', 'audioLead', s.audioLead, -100, 150, 10, ' ms')}
                <p class="vb-hint">Snappiness: 0 = smooth blend, 100 = instant snap.<br>Audio Lead: positive = mouth arrives before sound.</p>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Lip Color</div>
                <div class="cb-color-row">
                    <label class="cb-color-label">Color:</label>
                    <input type="color" class="cb-color-input" data-prop="lipColor" value="${s.lipColor}">
                </div>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Lip Thickness</div>
                ${_slider('Thickness', 'lipThickness', s.lipThickness, 0, 16, 0.5, ' px')}
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Layer Visibility</div>
                <div class="vb-toggles">
                    ${_toggle('Lips', 'showLips', s.showLips)}
                    ${_toggle('Teeth', 'showTeeth', s.showTeeth)}
                    ${_toggle('Tongue', 'showTongue', s.showTongue)}
                </div>
            </div>`;
    }

    _renderDisplayTab(s) {
        return `
            <div class="cb-section">
                <div class="cb-section-title">Face Color</div>
                <div class="cb-color-row">
                    <label class="cb-color-label">Skin:</label>
                    <input type="color" class="cb-color-input" data-prop="faceColor" value="${s.faceColor}">
                </div>
                <div class="cb-color-row" style="margin-top:6px;">
                    <label class="cb-color-label">Scalp:</label>
                    <input type="color" class="cb-color-input" data-prop="scalpColor" value="${s.scalpColor}">
                </div>
            </div>
            <div class="cb-section">
                <div class="cb-section-title">Caption Size</div>
                ${_slider('Font Size', 'captionSize', s.captionSize, 12, 40, 1, ' px')}
            </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       EVENT WIRING
       ══════════════════════════════════════════════════════════ */

    _wirePanelEvents() {
        const panel = this.panelEl;

        // Tab switches
        panel.querySelectorAll('.vb-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // Preset chips
        panel.querySelectorAll('.vb-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.preset;
                const preset = VOICE_PRESETS[key];
                if (!preset) return;
                this._state.presetKey = key;
                // Apply preset values to state
                this._state.variant = preset.variant;
                this._state.speed = preset.speed;
                this._state.pitch = preset.pitch;
                this._state.amplitude = preset.amplitude;
                this._state.wordgap = preset.wordgap;
                this._state.reverb = preset.reverb;
                this._state.wobble = preset.wobble;
                this._state.wobbleSpeed = preset.wobbleSpeed;
                this._state.brightness = preset.brightness;
                this._state.vocalFry = preset.vocalFry;
                this._state.chorus = preset.chorus;
                // Apply to engine
                if (this._voiceReady) this._voiceEngine.setPreset(key);
                // Re-render to update sliders
                this._renderPanel();
            });
        });

        // Language select
        const langSel = panel.querySelector('select[data-prop="language"]');
        if (langSel) {
            langSel.addEventListener('change', () => {
                this._state.language = langSel.value;
                if (this._voiceReady) {
                    this._voiceEngine.setLanguage(langSel.value).catch(e =>
                        console.warn('[VoiceBridge] Language switch failed:', e.message));
                }
            });
        }

        // Variant select
        const varSel = panel.querySelector('select[data-prop="variant"]');
        if (varSel) {
            varSel.addEventListener('change', () => {
                this._state.variant = varSel.value;
                this._state.presetKey = null;
                if (this._voiceReady) this._voiceEngine.setVariant(varSel.value);
            });
        }

        // Capitals select
        const capSel = panel.querySelector('select[data-prop="capitals"]');
        if (capSel) {
            capSel.addEventListener('change', () => {
                this._state.capitals = parseInt(capSel.value);
                if (this._voiceReady) this._voiceEngine.setCapitals(this._state.capitals);
            });
        }

        // All sliders
        panel.querySelectorAll('.vb-slider').forEach(inp => {
            const handler = () => {
                const prop = inp.dataset.prop;
                const val = parseFloat(inp.value);
                this._state[prop] = val;
                // Update label
                const valSpan = inp.parentElement.querySelector('.vb-slider-val');
                if (valSpan) valSpan.textContent = val + (inp.dataset.suffix || '');
                // Clear preset tracking since user changed a param
                this._state.presetKey = null;
                // Apply to engine
                this._applyParamToEngine(prop, val);
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Color inputs
        panel.querySelectorAll('.cb-color-input').forEach(inp => {
            inp.addEventListener('input', () => {
                const prop = inp.dataset.prop;
                this._state[prop] = inp.value;
                if (prop === 'lipColor' && this._mouthRig) this._mouthRig.setLipColor(inp.value);
                if (prop === 'faceColor' || prop === 'scalpColor') this._buildHead();
            });
        });

        // Toggle checkboxes
        panel.querySelectorAll('.vb-toggle-input').forEach(inp => {
            inp.addEventListener('change', () => {
                const prop = inp.dataset.prop;
                this._state[prop] = inp.checked;
                // Apply boolean params to engine
                if (this._voiceReady) {
                    if (prop === 'punct')  this._voiceEngine.setPunct(inp.checked);
                    if (prop === 'nostop') this._voiceEngine.setNostop(inp.checked);
                }
            });
        });

        // Play button
        const playBtn = panel.querySelector('.vb-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this._togglePlay());
        }

        // Text input
        const textArea = panel.querySelector('.vb-text-input');
        if (textArea) {
            textArea.addEventListener('input', () => {
                this._state.previewText = textArea.value;
            });
        }
    }

    _applyParamToEngine(prop, val) {
        if (!this._voiceReady) return;
        const eng = this._voiceEngine;
        switch (prop) {
            case 'speed':       eng.setSpeed(val); break;
            case 'pitch':       eng.setPitch(val); break;
            case 'volume':      eng.setVolume(val); break;
            case 'amplitude':   eng.setAmplitude(val); break;
            case 'wordgap':     eng.setWordgap(val); break;
            case 'linebreak':   eng.setLinebreak(val); break;
            case 'reverb':      eng.setReverb(val); break;
            case 'wobble':      eng.setWobble(val); break;
            case 'wobbleSpeed': eng.setWobbleSpeed(val); break;
            case 'brightness':  eng.setBrightness(val); break;
            case 'vocalFry':    eng.setVocalFry(val); break;
            case 'chorus':      eng.setChorus(val); break;
            case 'lipThickness':
                if (this._mouthRig) this._mouthRig.setLipThickness(val);
                break;
        }
    }

    /** Public play — starts voice preview. */
    play() {
        if (this._isSpeaking || !this._voiceReady) return;
        const text = this._state.previewText || DEFAULT_TEXT;
        this._voiceEngine.applyState(this._state);
        this._voiceEngine.onSpeakEnd = () => {
            this._isSpeaking = false;
            if (this._mouthRig) this._mouthRig.setRest();
            this._renderPanel();
        };
        this._voiceEngine.speak(text);
        this._isSpeaking = true;
        this._renderPanel();
    }

    /** Public stop — stops voice preview. */
    stopPlayback() {
        if (!this._isSpeaking) return;
        if (this._voiceReady) this._voiceEngine.stop();
        this._isSpeaking = false;
        if (this._mouthRig) this._mouthRig.setRest();
        this._renderPanel();
        document.dispatchEvent(new CustomEvent('bridge-play-state', { detail: { playing: false } }));
    }

    /** Tween camera back to its initial pose. */
    resetView() {
        this.stopPlayback();
        if (!this._controls || !this._camera) return;
        this._resetCancel?.();
        const headCenterY = 0.72; // mirrors _buildScene's initial pose
        this._resetCancel = tweenToPose(
            this._camera, this._controls,
            new THREE.Vector3(0, headCenterY, 1.6),
            new THREE.Vector3(0, headCenterY, 0),
        );
    }

    suspend() {
        if (this._isSpeaking) this.stopPlayback();
        super.suspend();
    }

    _togglePlay() {
        if (this._isSpeaking) this.stopPlayback();
        else this.play();
    }

    /* ══════════════════════════════════════════════════════════
       STATE / LIFECYCLE
       ══════════════════════════════════════════════════════════ */

    _getState() {
        return { ...this._state };
    }

    _applyState(state) {
        this._state = { ...state };
        // Re-apply to voice engine
        if (this._voiceReady) this._voiceEngine.applyState(this._state);
        // Rebuild head visuals
        this._buildHead();
    }

    destroy() {
        if (this._voiceEngine) this._voiceEngine.stop();
        if (this._mouthRig) this._mouthRig.dispose();
        if (this._controls) this._controls.dispose();
        super.destroy();
    }
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

function _esc(t) {
    return String(t).replace(/[&<>"']/g, m => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;',
    })[m]);
}

function _slider(label, prop, val, min, max, step, suffix) {
    return `
        <div class="vb-slider-row">
            <label class="vb-slider-label">${label}</label>
            <input type="range" class="vb-slider" data-prop="${prop}" data-suffix="${suffix}"
                   value="${val}" min="${min}" max="${max}" step="${step}">
            <span class="vb-slider-val">${val}${suffix}</span>
        </div>`;
}

function _toggle(label, prop, checked) {
    return `
        <label class="vb-toggle">
            <input type="checkbox" class="vb-toggle-input" data-prop="${prop}" ${checked ? 'checked' : ''}>
            <span class="vb-toggle-label">${label}</span>
        </label>`;
}
