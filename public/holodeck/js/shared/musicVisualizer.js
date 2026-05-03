/**
 * musicVisualizer.js — clumped-cluster visualizer for music themes.
 *
 * Six roles, six primitives, all packed into one centred sculpture:
 *
 *   bass    → 1 big sphere at the centre        (size 1.5, k 0.40, slow heavy)
 *   melody  → a few prisms ringing the bass     (size 1.0, k 0.30, sustained glow)
 *   chords  → cylinders at the next radius      (size 0.6, k 0.30, broad medium)
 *   pad     → torii looped around the cluster   (size 0.4, k 0.25, slow breathing)
 *   drums   → many small cubes scattered around (size 0.3, k 0.60, snappy fast)
 *   texture → many small icosas at the outside  (size 0.2, k 0.20, subtle shimmer)
 *
 * The "k" coefficient is the pulse magnitude — scale grows by `k` on
 * each fire and decays back. Different decay times per role give them
 * distinct rhythmic character without any rotation.
 *
 * IMPORTANT: the visualizer ONLY animates when `tick()` is told music
 * is actually playing. When `opts.isPlaying` is false (or no fires have
 * arrived), the cluster sits still — no synthesised loop, no spinning.
 *
 * Palette is derived from the theme's `coverColor` so the whole
 * composition feels tonally unified.
 *
 * Used by:
 *   - bridges/MusicBridge.js  (editor view; passes real `firesByRole`)
 *   - previewRenderer.js      (browse view; same — both go through musicPlayer)
 */

import * as THREE from 'three';

/* ── Per-role spec ──────────────────────────────────────────────── */

const ROLE_SPEC = {
    bass: {
        shape: 'sphere',   size: 1.50, k: 0.40,
        decayMs: 600,                    // slow heavy
        emissiveBase: 0.18, count: 1,
    },
    melody: {
        shape: 'prism',    size: 1.00, k: 0.30,
        decayMs: 480, emissiveDecayMs: 750,   // sustained glow
        emissiveBase: 0.22, count: 4, ringRadius: 1.05, yJitter: 0.32,
    },
    chords: {
        shape: 'cylinder', size: 0.60, k: 0.30,
        decayMs: 400,                    // broad medium
        emissiveBase: 0.16, count: 4, ringRadius: 1.55, yJitter: 0.45,
    },
    pad: {
        shape: 'torus',    size: 0.40, k: 0.25,
        decayMs: 700, breathe: true,     // slow breathing
        emissiveBase: 0.14, count: 1,
    },
    drums: {
        shape: 'cube',     size: 0.30, k: 0.60,
        decayMs: 200,                    // snappy fast
        emissiveBase: 0.14, count: 8, scatterMin: 0.85, scatterMax: 1.65, yMin: 0.45, yMax: 1.65,
    },
    texture: {
        shape: 'icosa',    size: 0.20, k: 0.20,
        decayMs: 250,                    // subtle shimmer
        emissiveBase: 0.30, count: 10, scatterMin: 1.65, scatterMax: 2.55, yMin: 0.30, yMax: 2.05,
    },
};

const ROLE_ORDER = ['pad', 'bass', 'melody', 'chords', 'drums', 'texture'];

/* ── Palette derivation ──────────────────────────────────────────── */

/**
 * Derive a per-track scene background colour from the theme's
 * `coverColor`. Returns a THREE.Color tuned dark enough that the
 * cluster's bright shapes pop against it, but with enough hue + a
 * little saturation that you can tell which theme you're looking at.
 */
export function deriveBackgroundColor(coverColor) {
    const c = new THREE.Color(coverColor || '#5b9bd5');
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    /* Floor saturation a bit so super-grey themes still read as
     * tinted, cap it so super-saturated themes don't overwhelm. */
    const s = Math.min(0.45, Math.max(0.12, hsl.s * 0.40));
    return new THREE.Color().setHSL(hsl.h, s, 0.11);
}

function _derivePalette(hex) {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const make = (h, s, l) => new THREE.Color().setHSL((h + 1) % 1, clamp(s, 0, 1), clamp(l, 0.05, 0.95));
    return {
        bass:    make(hsl.h,             clamp(hsl.s + 0.10, 0.35, 1.0), Math.max(0.22, hsl.l * 0.60)),
        drums:   make((hsl.h + 0.50),    clamp(hsl.s * 0.65, 0.20, 1.0), 0.34),
        pad:     make(hsl.h,             hsl.s * 0.45,                     Math.min(0.78, hsl.l + 0.18)),
        chords:  make((hsl.h + 0.07),    hsl.s,                            hsl.l),
        melody:  make((hsl.h - 0.07),    clamp(hsl.s + 0.05, 0, 1),        Math.min(0.78, hsl.l + 0.15)),
        texture: make((hsl.h + 0.22),    clamp(hsl.s * 0.95, 0.4, 1.0),    Math.min(0.85, hsl.l + 0.30)),
    };
}

function _mat(color, emissiveIntensity = 0.15, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity,
        roughness:   opts.roughness   ?? 0.35,
        metalness:   opts.metalness   ?? 0.55,
        transparent: opts.transparent ?? false,
        opacity:     opts.opacity     ?? 1.0,
    });
}

function _mkRand(seed) {
    let s = (seed | 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 100000) / 100000; };
}

function _disposeGroup(g) {
    g.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material?.dispose?.();
    });
}

/* ── Per-role mesh builders ──────────────────────────────────────── */

function _buildBass(spec, color, seed) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(
        new THREE.SphereGeometry(spec.size * 0.55, 32, 24),
        _mat(color, spec.emissiveBase, { roughness: 0.30, metalness: 0.65 }),
    );
    g.add(m);
    return { group: g, pulse: [m] };
}

function _buildMelody(spec, color, seed) {
    /* Prisms = triangular prisms (CylinderGeometry with 3 radial segs)
       arranged in a tight ring around the bass. Tilted slightly each
       different so they read as a small chorus around the centre. */
    const g = new THREE.Group();
    const pulse = [];
    const rand = _mkRand(seed + 17);
    const r = spec.size * 0.28;
    const h = spec.size * 0.85;
    for (let i = 0; i < spec.count; i++) {
        const a = (i / spec.count) * Math.PI * 2 + 0.2;
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, h, 3),
            _mat(color, spec.emissiveBase, { roughness: 0.30, metalness: 0.55 }),
        );
        m.position.set(
            Math.cos(a) * spec.ringRadius,
            (rand() - 0.5) * spec.yJitter * 2,
            Math.sin(a) * spec.ringRadius,
        );
        m.rotation.y = a + rand() * 0.4 - 0.2;
        m.rotation.z = (rand() - 0.5) * 0.35;
        g.add(m);
        pulse.push(m);
    }
    return { group: g, pulse };
}

function _buildChords(spec, color, seed) {
    /* Short cylinders standing upright at the next ring. */
    const g = new THREE.Group();
    const pulse = [];
    const rand = _mkRand(seed + 23);
    const r = spec.size * 0.32;
    const h = spec.size * 0.95;
    for (let i = 0; i < spec.count; i++) {
        const a = (i / spec.count) * Math.PI * 2 + Math.PI / 4;
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, h, 24),
            _mat(color, spec.emissiveBase, { roughness: 0.35, metalness: 0.55 }),
        );
        m.position.set(
            Math.cos(a) * spec.ringRadius,
            (rand() - 0.5) * spec.yJitter * 2,
            Math.sin(a) * spec.ringRadius,
        );
        m.rotation.x = (rand() - 0.5) * 0.15;
        m.rotation.z = (rand() - 0.5) * 0.15;
        g.add(m);
        pulse.push(m);
    }
    return { group: g, pulse };
}

function _buildPad(spec, color, seed) {
    /* One slim torus tilted slightly off the horizontal — reads as a
       single Saturn-style ring drifting around the cluster. */
    const g = new THREE.Group();
    const m = new THREE.Mesh(
        new THREE.TorusGeometry(2.05, spec.size * 0.12, 14, 80),
        _mat(color, spec.emissiveBase, { roughness: 0.40, metalness: 0.50, transparent: true, opacity: 0.85 }),
    );
    m.rotation.set(1.30, 0.18, 0.10);
    g.add(m);
    return { group: g, pulse: [m] };
}

function _buildDrums(spec, color, seed) {
    /* Many small cubes scattered tightly within a shell around the
       inner cluster. Snappy individual pulse on each fire. */
    const g = new THREE.Group();
    const pulse = [];
    const rand = _mkRand(seed + 31);
    for (let i = 0; i < spec.count; i++) {
        const r = spec.scatterMin + rand() * (spec.scatterMax - spec.scatterMin);
        const a = rand() * Math.PI * 2;
        const y = spec.yMin + rand() * (spec.yMax - spec.yMin);
        const s = spec.size * (0.75 + rand() * 0.5);
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(s, s, s),
            _mat(color, spec.emissiveBase, { roughness: 0.30, metalness: 0.65 }),
        );
        m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        g.add(m);
        pulse.push(m);
    }
    return { group: g, pulse };
}

function _buildTexture(spec, color, seed) {
    /* Many small icosahedrons in the outermost shell. Subtle shimmer. */
    const g = new THREE.Group();
    const pulse = [];
    const rand = _mkRand(seed + 41);
    for (let i = 0; i < spec.count; i++) {
        const r = spec.scatterMin + rand() * (spec.scatterMax - spec.scatterMin);
        const a = rand() * Math.PI * 2;
        const y = spec.yMin + rand() * (spec.yMax - spec.yMin);
        const m = new THREE.Mesh(
            new THREE.IcosahedronGeometry(spec.size * 0.5, 0),
            _mat(color, spec.emissiveBase, { roughness: 0.20, metalness: 0.80 }),
        );
        m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        g.add(m);
        pulse.push(m);
    }
    return { group: g, pulse };
}

const SHAPE_BUILDERS = {
    sphere:   _buildBass,
    prism:    _buildMelody,
    cylinder: _buildChords,
    torus:    _buildPad,
    cube:     _buildDrums,
    icosa:    _buildTexture,
};

/* ──────────────────────────────────────────────────────────────────
   Public API.

   buildMusicVisualizer({ scene, theme, anchorY })

   theme: any of —
     - the v2 state ({ coverColor, layers, ... })
     - a full theme JSON ({ payload: { state: {...} } })
     - a legacy asset ({ payload: { mood_color, layers, ... } })

   Returns { tick(opts), dispose(), roles[] }.

   tick(opts):
     - opts.now            — wall clock ms (defaults to performance.now())
     - opts.isPlaying      — boolean. If false, the cluster sits at base
                             scale + base emissive. No synthesized loop.
     - opts.firesByRole    — { role: lastFireMs, ... } from
                             musicPlayer.getLastFireByRole(). Drives the
                             actual pulse animation.
   ────────────────────────────────────────────────────────────────── */
export function buildMusicVisualizer({ scene, theme, anchorY = 0 }) {
    const state =
        theme?.payload?.state ??
        theme?.payload ??
        theme;
    const coverColor =
        state?.coverColor ??
        theme?.payload?.mood_color ??
        state?.mood_color ??
        '#5b9bd5';
    const layers = Array.isArray(state?.layers) ? state.layers : [];
    const seed = state?.seeds?.pattern ?? 1;

    const palette      = _derivePalette(coverColor);
    const presentRoles = new Set(layers.map(l => l.role));
    const builtMeshes  = [];
    const roleEntries  = {};

    /* The cluster is centred at (0, anchorY + 1.0, 0) — bass dead-centre,
     * everything else built around it. */
    const CLUSTER_Y = anchorY + 1.0;

    for (const role of ROLE_ORDER) {
        if (!presentRoles.has(role)) continue;
        const spec    = ROLE_SPEC[role];
        const color   = palette[role];
        const builder = SHAPE_BUILDERS[spec.shape];
        if (!builder) continue;

        const built = builder(spec, color, seed + ROLE_ORDER.indexOf(role));
        built.group.position.set(0, CLUSTER_Y, 0);
        built.group.userData.spec = spec;
        scene.add(built.group);
        builtMeshes.push(built.group);
        roleEntries[role] = built;
    }

    const lastFireByRole = {};

    function tick(opts = {}) {
        const now = opts.now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const playing = opts.isPlaying === true;

        /* Only ingest fires when actually playing — guarantees a hard
         * stop the moment music ends, no lingering ghost pulses. */
        if (playing && opts.firesByRole) {
            for (const role of Object.keys(opts.firesByRole)) {
                const v = opts.firesByRole[role];
                if (v && v > (lastFireByRole[role] ?? 0)) lastFireByRole[role] = v;
            }
        }

        for (const role of Object.keys(roleEntries)) {
            const { group, pulse } = roleEntries[role];
            const spec   = group.userData.spec;
            const last   = lastFireByRole[role] ?? 0;
            const dt     = playing ? (now - last) : Infinity;
            const baseEm = spec.emissiveBase;

            /* Two parallel envelopes: one for scale, one for emissive.
             * Melody gets a slower emissive envelope ("sustained glow")
             * so the prisms keep glowing after each strike has faded. */
            const scaleDecay    = spec.decayMs;
            const emissiveDecay = spec.emissiveDecayMs ?? spec.decayMs;
            const scaleEnv = (dt >= 0 && dt < scaleDecay)
                ? Math.exp(-(dt / scaleDecay) * 4.5) : 0;
            const emEnv = (dt >= 0 && dt < emissiveDecay)
                ? Math.exp(-(dt / emissiveDecay) * 4.5) : 0;

            let scale = 1 + scaleEnv * spec.k;

            /* Pad alone gets a slow ambient breath layered on top of
             * its (rare) pulse, even when no note has fired yet, so
             * the rings always feel alive. */
            if (spec.breathe) {
                scale *= 1 + Math.sin(now * 0.0006) * 0.03;
            }

            group.scale.setScalar(scale);
            for (const m of pulse) {
                if (m.material && 'emissiveIntensity' in m.material) {
                    m.material.emissiveIntensity = baseEm + emEnv * spec.k * 1.4;
                }
            }
        }
    }

    function dispose() {
        for (const g of builtMeshes) {
            scene.remove(g);
            _disposeGroup(g);
        }
    }

    return { tick, dispose, roles: [...presentRoles] };
}
