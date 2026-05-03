/**
 * facialHairRig.js — 2D canvas facial hair anchored to the mouth area.
 *
 * Two textured planes (moustache + beard) parented to the faceAnchor. Each
 * style picks one or both. Jaw open drifts the beard down and stretches it,
 * nudges the moustache up slightly — the same viseme params the MouthRig
 * already consumes drive both motions, so hair "reads" as part of the face.
 *
 * Styles are hand-drawn SVG-style Path2D strings so they stay crisp when
 * the plane gets tinted with the user's facial-hair color.
 */

import * as THREE from 'three';

// Plane dimensions in world units at the reference head width. The mesh gets
// scaled uniformly by (actualHeadWidth / REF_HEAD_WIDTH) on attach.
const REF_HEAD_WIDTH = 0.5;
const MOUSTACHE_PLANE = { w: 0.22, h: 0.10 };
const BEARD_PLANE     = { w: 0.28, h: 0.24 };
const CANVAS_PX       = 256;

// Base local-Y offsets relative to the mouth center (mouthY in faceAnchor
// local space). Positive = above the mouth.
const MOUSTACHE_BASE_Y_OFFSET =  0.028;
const BEARD_BASE_Y_OFFSET     = -0.135;   // anchor below bottom lip, small gap
const FACE_Z_OFFSET           =  0.003;   // in front of the mouth plane

// Jaw motion coefficients (world units per unit jawOpen).
const MOUSTACHE_JAW_Y     = 0.004;   // subtle upward drift
const BEARD_JAW_Y         = 0.028;   // chin drops → beard drops
const BEARD_JAW_STRETCH_Y = 0.18;    // + scale.y as jaw opens

// Each style defines moustachePath and/or beardPath as Path2D SVG strings.
// Coordinates are in canvas-pixel space with origin at the plane center;
// +Y is downward. Styles may override moustachePlaneW/H or beardPlaneW/H
// (world units) for extra-wide / extra-tall silhouettes like walrus.
const STYLES = {
    none:       null,

    chevron: {
        moustachePath: 'M -78 -8 Q -40 -20 0 -14 Q 40 -20 78 -8 L 64 18 Q 30 6 0 10 Q -30 6 -64 18 Z',
    },
    handlebar: {
        // Classic handlebar: thin flat body along the lip, tips curl upward into tight loops.
        moustachePlaneW: 0.34,
        moustachePlaneH: 0.14,
        moustachePath:
            'M -78 -2 Q -56 -8 -36 -4 Q -18 0 -8 -4 L 0 -6 L 8 -4 Q 18 0 36 -4 Q 56 -8 78 -2 ' +
            'Q 92 -8 104 -24 Q 112 -40 100 -46 Q 88 -48 84 -36 Q 82 -26 90 -22 Q 82 -18 68 -14 ' +
            'Q 48 -8 26 -2 Q 10 2 2 4 L 0 6 L -2 4 Q -10 2 -26 -2 Q -48 -8 -68 -14 Q -82 -18 -90 -22 ' +
            'Q -82 -26 -84 -36 Q -88 -48 -100 -46 Q -112 -40 -104 -24 Q -92 -8 -78 -2 Z',
    },
    pencil: {
        moustachePath: 'M -72 -2 Q -36 -10 0 -6 Q 36 -10 72 -2 L 68 4 Q 34 -2 0 2 Q -34 -2 -68 4 Z',
    },
    walrus: {
        // Wider plane (~2× stock moustache) + tall enough to carry the droop.
        moustachePlaneW: 0.44,
        moustachePlaneH: 0.22,
        moustachePath:
            'M -120 -22 Q -80 -38 -40 -30 Q 0 -24 40 -30 Q 80 -38 120 -22 ' +
            'Q 118 20 96 46 Q 72 60 44 54 Q 20 46 4 36 Q 0 32 -4 36 Q -20 46 -44 54 ' +
            'Q -72 60 -96 46 Q -118 20 -120 -22 Z',
    },

    goatee: {
        beardPath:
            'M -34 -72 Q -12 -86 0 -82 Q 12 -86 34 -72 ' +
            'Q 28 -40 20 -12 Q 10 16 0 26 Q -10 16 -20 -12 Q -28 -40 -34 -72 Z',
    },
    soul_patch: {
        beardPath: 'M -14 -70 Q 0 -80 14 -70 L 10 -40 Q 0 -32 -10 -40 Z',
    },
    chin_curtain: {
        // Beard-only, covers chin + jawline, no moustache (Lincoln-style).
        beardPath:
            'M -84 -78 Q -52 -88 0 -86 Q 52 -88 84 -78 ' +
            'Q 82 -40 72 -6 Q 56 24 34 34 Q 14 40 0 40 Q -14 40 -34 34 ' +
            'Q -56 24 -72 -6 Q -82 -40 -84 -78 Z',
    },
    viking_beard: {
        // Beard-only, long + thick, no moustache.
        beardPlaneW: 0.34,
        beardPlaneH: 0.34,
        beardPath:
            'M -96 -78 Q -58 -94 0 -88 Q 58 -94 96 -78 ' +
            'Q 98 -24 90 20 Q 78 58 56 86 Q 34 104 18 112 Q 8 116 0 116 Q -8 116 -18 112 ' +
            'Q -34 104 -56 86 Q -78 58 -90 20 Q -98 -24 -96 -78 Z',
    },

    full_beard: {
        moustachePath:
            'M -94 -10 Q -50 -22 0 -16 Q 50 -22 94 -10 L 78 14 Q 40 2 0 6 Q -40 2 -78 14 Z',
        beardPath:
            'M -96 -82 Q -60 -98 0 -92 Q 60 -98 96 -82 ' +
            'Q 92 -30 76 6 Q 52 40 0 52 Q -52 40 -76 6 Q -92 -30 -96 -82 Z',
    },
    long_beard: {
        moustachePath:
            'M -92 -8 Q -48 -22 0 -14 Q 48 -22 92 -8 L 76 14 Q 40 2 0 6 Q -40 2 -76 14 Z',
        beardPlaneW: 0.30,
        beardPlaneH: 0.30,
        beardPath:
            'M -96 -82 Q -60 -98 0 -92 Q 60 -98 96 -82 ' +
            'Q 92 -20 82 32 Q 66 78 30 104 Q 12 116 0 118 Q -12 116 -30 104 ' +
            'Q -66 78 -82 32 Q -92 -20 -96 -82 Z',
    },
};

// Legacy key migration — old 3D-prop asset IDs map to the closest new style.
const STYLE_ALIASES = {
    prop_mustache:   'chevron',
    prop_full_beard: 'full_beard',
    prop_goatee:     'goatee',
    prop_soul_patch: 'soul_patch',
    prop_long_beard: 'long_beard',
};

function resolveStyle(style) {
    if (!style) return 'none';
    return STYLE_ALIASES[style] || style;
}

function _makePathTexture(svgPath, color, cvW, cvH) {
    const canvas = document.createElement('canvas');
    canvas.width  = cvW;
    canvas.height = cvH;
    const ctx = canvas.getContext('2d');
    ctx.translate(cvW / 2, cvH / 2);
    const p = new Path2D(svgPath);
    ctx.fillStyle = color;
    ctx.fill(p);
    // Subtle outline to anchor the shape against skin tones.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.stroke(p);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function _makePlane(planeW, planeH) {
    const geo = new THREE.PlaneGeometry(planeW, planeH);
    // Lit + emissive — see characterMesh.js eye material for rationale.
    // Beard dims naturally with scene lighting but never goes pure-black.
    // Note: emissiveMap is set later in setStyle() once a texture is bound.
    const mat = new THREE.MeshLambertMaterial({
        emissive: 0xffffff, emissiveIntensity: 0.35,
        transparent: true, depthWrite: false, side: THREE.FrontSide,
        toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
}

export class FacialHairRig {
    constructor() {
        this.anchor    = null;
        this.mouthY    = 0;
        this.faceZ     = 0;
        this.headWidth = REF_HEAD_WIDTH;

        this.style = 'none';
        this.color = '#4a3728';

        this.moustacheMesh = null;
        this.beardMesh     = null;

        this._baseMoustacheY = 0;
        this._baseBeardY     = 0;
    }

    attach(anchorGroup, mouthY, faceZ, headWidth) {
        this.anchor    = anchorGroup;
        this.mouthY    = mouthY;
        this.faceZ     = faceZ;
        this.headWidth = headWidth;
        this._rebuild();
    }

    setStyle(style) {
        const resolved = resolveStyle(style);
        if (resolved === this.style) return;
        this.style = resolved;
        this._rebuild();
    }

    setColor(hex) {
        if (hex === this.color) return;
        this.color = hex;
        this._rebuild();
    }

    update(visemeParams) {
        const jaw = visemeParams?.jawOpen ?? 0;
        if (this.moustacheMesh) {
            this.moustacheMesh.position.y = this._baseMoustacheY + jaw * MOUSTACHE_JAW_Y;
        }
        if (this.beardMesh) {
            this.beardMesh.position.y = this._baseBeardY - jaw * BEARD_JAW_Y;
            this.beardMesh.scale.y    = 1 + jaw * BEARD_JAW_STRETCH_Y;
        }
    }

    _rebuild() {
        this._disposeMeshes();
        if (!this.anchor || this.style === 'none') return;

        const cfg = STYLES[this.style];
        if (!cfg) return;

        const s = this.headWidth / REF_HEAD_WIDTH;

        if (cfg.moustachePath) {
            const planeW = cfg.moustachePlaneW ?? MOUSTACHE_PLANE.w;
            const planeH = cfg.moustachePlaneH ?? MOUSTACHE_PLANE.h;
            const cvH    = Math.round(CANVAS_PX * planeH / planeW);
            const tex    = _makePathTexture(cfg.moustachePath, this.color, CANVAS_PX, cvH);
            const mesh   = _makePlane(planeW, planeH);
            mesh.material.map = tex;
            mesh.material.emissiveMap = tex;
            mesh.material.needsUpdate = true;
            mesh.name = 'facialHairMoustache';
            this._baseMoustacheY = this.mouthY + MOUSTACHE_BASE_Y_OFFSET * s;
            mesh.position.set(0, this._baseMoustacheY, this.faceZ + FACE_Z_OFFSET);
            mesh.scale.setScalar(s);
            this.anchor.add(mesh);
            this.moustacheMesh = mesh;
        }

        if (cfg.beardPath) {
            const planeW = cfg.beardPlaneW ?? BEARD_PLANE.w;
            const planeH = cfg.beardPlaneH ?? BEARD_PLANE.h;
            const cvH    = Math.round(CANVAS_PX * planeH / planeW);
            const tex    = _makePathTexture(cfg.beardPath, this.color, CANVAS_PX, cvH);
            const mesh   = _makePlane(planeW, planeH);
            mesh.material.map = tex;
            mesh.material.emissiveMap = tex;
            mesh.material.needsUpdate = true;
            mesh.name = 'facialHairBeard';
            this._baseBeardY = this.mouthY + BEARD_BASE_Y_OFFSET * s;
            mesh.position.set(0, this._baseBeardY, this.faceZ + FACE_Z_OFFSET);
            mesh.scale.setScalar(s);
            this.anchor.add(mesh);
            this.beardMesh = mesh;
        }
    }

    _disposeMeshes() {
        for (const mesh of [this.moustacheMesh, this.beardMesh]) {
            if (!mesh) continue;
            mesh.geometry.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
            if (mesh.parent) mesh.parent.remove(mesh);
        }
        this.moustacheMesh = null;
        this.beardMesh     = null;
    }

    dispose() {
        this._disposeMeshes();
        this.anchor = null;
    }
}
