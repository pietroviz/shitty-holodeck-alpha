/**
 * thumbnailGenerator.js — Offscreen thumbnail generator for browse panel.
 *
 * Uses a small hidden WebGL canvas to render asset previews and capture
 * JPEG thumbnails. Processes one asset at a time to avoid GPU contention.
 */

import * as THREE from 'three';
import { SCENE, LIGHT } from './shared/palette.js';
import { standard, groundMaterial } from './shared/materials.js';
import {
    CHARACTER, BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    FACE_FEATURES, DEFAULT_COLORS,
} from './shared/charConfig.js';

const THUMB_SIZE = 128;
let _renderer = null;
let _initFailed = false;

function _ensureRenderer() {
    if (_renderer) return _renderer;
    if (_initFailed) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;
        _renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'low-power',
        });
        _renderer.setSize(THUMB_SIZE, THUMB_SIZE);
        _renderer.shadowMap.enabled = false;
        _renderer.toneMapping = THREE.ACESFilmicToneMapping;
        _renderer.toneMappingExposure = 1.0;
        return _renderer;
    } catch (e) {
        console.warn('[ThumbGen] WebGL init failed:', e);
        _initFailed = true;
        return null;
    }
}

function _buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE.builderBg);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

    scene.add(new THREE.AmbientLight(SCENE.ambient, LIGHT.ambientIntensity));
    const key = new THREE.DirectionalLight(SCENE.keyLight, LIGHT.keyIntensity);
    key.position.set(...LIGHT.keyPosition);
    scene.add(key);
    const fill = new THREE.DirectionalLight(SCENE.fillLight, LIGHT.fillIntensity);
    fill.position.set(...LIGHT.fillPosition);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundMaterial());
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    return { scene, camera };
}

// ── Character (simplified — just body + head + eyes) ──────────

function _buildCharacter(scene, camera, asset) {
    const s = asset.payload?.state || {};
    const group = new THREE.Group();

    const heightP = BODY_HEIGHT_PRESETS[s.heightPreset] || BODY_HEIGHT_PRESETS.medium;
    const widthP  = BODY_WIDTH_PRESETS[s.widthPreset]   || BODY_WIDTH_PRESETS.moderate;
    const bodyH = heightP.height;
    const bodyW = widthP.width;

    // Body — simple cylinder (avoid complex geometry generators for reliability)
    const bodyGeo = new THREE.CylinderGeometry(bodyW / 2, bodyW / 2, bodyH, 12);
    const torsoColor = s.torsoColor || DEFAULT_COLORS.torsoColor;
    const body = new THREE.Mesh(bodyGeo, standard(torsoColor));
    body.position.y = bodyH / 2;
    group.add(body);

    // Head
    const headHP = HEAD_HEIGHT_PRESETS[s.headHeightPreset] || HEAD_HEIGHT_PRESETS.medium;
    const headWP = HEAD_WIDTH_PRESETS[s.headWidthPreset]   || HEAD_WIDTH_PRESETS.moderate;
    const headH = headHP.height;
    const headW = headWP.width;

    const headGeo = new THREE.SphereGeometry(Math.max(headW, headH) / 2, 12, 10);
    headGeo.scale(headW / Math.max(headW, headH), headH / Math.max(headW, headH), headW / Math.max(headW, headH));
    const skinColor = s.skinColor || DEFAULT_COLORS.skinColor;
    const head = new THREE.Mesh(headGeo, standard(skinColor));
    head.position.y = bodyH + CHARACTER.neckGap + headH / 2;
    group.add(head);

    // Eyes
    const eyeSize = FACE_FEATURES.eye.scleraDiameter * 0.5;
    const eyeGeo = new THREE.SphereGeometry(eyeSize, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const faceZ = headW * 0.45;
    const eyeY = head.position.y + headH * 0.05;
    const eyeX = headW * 0.18;

    for (const xSign of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(xSign * eyeX, eyeY, faceZ);
        group.add(eye);

        const pupilGeo = new THREE.SphereGeometry(eyeSize * 0.5, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: s.eyeIrisColor || '#4a7a8c' });
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.set(xSign * eyeX, eyeY, faceZ + eyeSize * 0.6);
        group.add(pupil);
    }

    scene.add(group);

    const charHeight = bodyH + CHARACTER.neckGap + headH;
    camera.position.set(0.4, charHeight * 0.5, 1.5);
    camera.lookAt(0, charHeight * 0.45, 0);
}

// ── Prop / 3D Object ──────────────────────────────────────────

function _buildProp(scene, camera, asset) {
    const payload = asset.payload || {};
    const elements = payload._editor?.elements || [];
    const colorMap = payload._editor?.color_assignments || payload.color_assignments || {};
    const group = new THREE.Group();

    const PRIM = {
        box(p) { return new THREE.BoxGeometry(p.width||p.sx||1, p.height||p.sy||1, p.depth||p.sz||1); },
        sphere(p) { return new THREE.SphereGeometry(p.radius||0.5, 12, 8); },
        cylinder(p) { return new THREE.CylinderGeometry(p.radiusTop??p.radius??0.5, p.radiusBottom??p.radius??0.5, p.height||1, 12); },
        cone(p) { const g = new THREE.ConeGeometry(p.radius||0.5, p.height||1, 12); g.rotateX(Math.PI); return g; },
        torus(p) { const g = new THREE.TorusGeometry(p.radius||0.5, p.tubeRadius||p.tube||0.15, 8, 16); g.rotateX(Math.PI/2); return g; },
        capsule(p) { return new THREE.CapsuleGeometry(p.radius||0.3, p.length||1, 4, 8); },
    };

    for (const el of elements) {
        const factory = PRIM[el.primitiveId || el.primitive];
        if (!factory) continue;
        const p = el.params || {};
        const geo = factory(p);
        let fill = p.fill || 'primary';
        let color = '#888888';
        if (fill === 'primary') color = payload.primaryColor || '#888888';
        else if (colorMap[fill]) color = colorMap[fill];
        else if (typeof fill === 'string' && fill.startsWith('#')) color = fill;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.px||0, p.py||0, p.pz||0);
        const d = Math.PI / 180;
        mesh.rotation.set((p.rx||0)*d, (p.ry||0)*d, (p.rz||0)*d);
        group.add(mesh);
    }

    scene.add(group);
    camera.position.set(0.5, 0.8, 1.8);
    camera.lookAt(0, 0.4, 0);
}

// ── Environment ────────────────────────────────────────────────

function _buildEnvironment(scene, camera, asset) {
    const payload = asset.payload || {};
    const st = payload.state || {};
    const skyColor = st.skyColor || payload.skyColor || '#87CEEB';
    const groundColor = st.groundColor || payload.groundColor || '#4a7a4a';

    const skyGeo = new THREE.SphereGeometry(5, 16, 12);
    scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: skyColor, side: THREE.BackSide })));

    const gMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.9 }));
    gMesh.rotation.x = -Math.PI / 2;
    gMesh.position.y = 0.01;
    scene.add(gMesh);

    camera.position.set(2, 1.5, 3);
    camera.lookAt(0, 0.3, 0);
}

// ── Fallback (voice, music, image) ─────────────────────────────

function _buildFallback(scene, camera, asset) {
    const typeColors = { voice: '#7eb8c9', music: '#c97eb8', image: '#b8c97e', asset: '#b8c97e' };
    const color = typeColors[asset.type] || '#888888';
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    );
    mesh.position.y = 0.5;
    scene.add(mesh);
    camera.position.set(0, 0.5, 2);
    camera.lookAt(0, 0.5, 0);
}

// ── Dispose helper ──────────────────────────────────────────────

function _disposeScene(scene) {
    scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
}

// ── Public API ──────────────────────────────────────────────────

export function generateThumbnail(asset) {
    const renderer = _ensureRenderer();
    if (!renderer) return null;
    try {
        const { scene, camera } = _buildScene();
        const type = asset.type;
        if (type === 'character')                       _buildCharacter(scene, camera, asset);
        else if (type === 'prop' || type === 'object')  _buildProp(scene, camera, asset);
        else if (type === 'environment')                _buildEnvironment(scene, camera, asset);
        else                                            _buildFallback(scene, camera, asset);

        renderer.render(scene, camera);
        const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.7);
        _disposeScene(scene);
        return dataURL;
    } catch (e) {
        console.error('[ThumbGen] Failed for', asset.id, ':', e);
        return null;
    }
}

export async function generateThumbnailBatch(assets, onThumb, delayMs = 30) {
    console.log(`[ThumbGen] Starting batch for ${assets.length} assets`);
    let success = 0, fail = 0;
    for (const asset of assets) {
        if (asset.meta?.thumbnail) continue;
        const dataURL = generateThumbnail(asset);
        if (dataURL) {
            // Check if the image is not just a blank canvas
            const isBlank = dataURL.length < 1000;
            if (isBlank) {
                console.warn(`[ThumbGen] ${asset.id} generated but looks blank (${dataURL.length} bytes)`);
                fail++;
            } else {
                onThumb(asset, dataURL);
                success++;
            }
        } else {
            fail++;
        }
        if (success + fail <= 3) {
            console.log(`[ThumbGen] ${asset.id} (${asset.type}): ${dataURL ? dataURL.length + ' bytes' : 'FAILED'}`);
        }
        await new Promise(r => setTimeout(r, delayMs));
    }
    console.log(`[ThumbGen] Done: ${success} ok, ${fail} failed`);
}

export function disposeThumbnailRenderer() {
    if (_renderer) {
        _renderer.dispose();
        _renderer = null;
    }
}
