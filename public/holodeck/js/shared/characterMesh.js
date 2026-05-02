/**
 * characterMesh.js — Build a full character (body, head, eyes, animated mouth,
 * facial hair, accessories) from a character asset, as a standalone THREE.Group.
 *
 * Extracted from previewRenderer._buildCharacterPreview so SimulationBridge
 * (and any future multi-character scene) can show real characters instead of
 * archetype-head stand-ins.
 *
 * Returns { group, mouthRig, facialHairRig, dispose }. The caller feeds
 * `visemeParams` from a VoiceEngine into `mouthRig.update()` and
 * `facialHairRig.update()` every frame so the character actually talks.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeEyeTexture, makeEyebrowTexture } from './eyeTexture.js';
import { generateHeadGeometry } from './headShapes.js';
import { generateBodyGeometry } from './bodyShapes.js';
import { MouthRig } from './mouthRig.js';
import { FacialHairRig } from './facialHairRig.js';
import {
    HEAD, COLOR_ZONES, HAND,
    BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    FACE_FEATURES, FACE_PLACEMENT_PRESETS,
} from './charConfig.js';

const FLOAT_Y = 0.15;

const _propCache = {};

async function _fetchProp(propId) {
    if (!propId || propId === 'none') return null;
    if (_propCache[propId]) return _propCache[propId];
    const paths = [
        `global_assets/objects/fashion/headwear/${propId}.json`,
        `global_assets/objects/fashion/glasses/${propId}.json`,
        `global_assets/objects/fashion/facial_hair/${propId}.json`,
    ];
    for (const p of paths) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                const data = await res.json();
                _propCache[propId] = data;
                return data;
            }
        } catch { /* try next */ }
    }
    return null;
}

const PRIM = {
    box(p) { return new THREE.BoxGeometry(p.width||p.sx||1, p.height||p.sy||1, p.depth||p.sz||1); },
    sphere(p) { return new THREE.SphereGeometry(p.radius||0.5, 16, 12); },
    cylinder(p) { return new THREE.CylinderGeometry(p.radiusTop??p.radius??0.5, p.radiusBottom??p.radius??0.5, p.height||1, 16); },
    cone(p) { const g = new THREE.ConeGeometry(p.radius||0.5, p.height||1, 16); g.rotateX(Math.PI); return g; },
    torus(p) { const g = new THREE.TorusGeometry(p.radius||0.5, p.tubeRadius||p.tube||0.15, 12, 24); g.rotateX(Math.PI/2); return g; },
    capsule(p) { return new THREE.CapsuleGeometry(p.radius||0.3, p.length||1, 8, 12); },
    hemisphere(p) { return new THREE.SphereGeometry(p.radius||0.5, 16, 12, 0, Math.PI*2, 0, Math.PI/2); },
    pyramid(p) { return new THREE.ConeGeometry((p.baseWidth||1)/2, p.height||1, 4); },
};

function _renderPropGroup(propData, primaryColor, scale) {
    const payload = propData.payload;
    const elements = payload._editor?.elements || [];
    const colorMap = payload._editor?.color_assignments || payload.color_assignments || {};
    const group = new THREE.Group();

    const sorted = [...elements].sort((a,b) => (a.zIndex||0)-(b.zIndex||0));
    for (const el of sorted) {
        const factory = PRIM[el.primitiveId || el.primitive];
        if (!factory) continue;
        const p = el.params || {};
        const geo = factory(p);
        let fill = p.fill || 'primary';
        let color;
        if (fill === 'primary' && primaryColor) color = primaryColor;
        else if (colorMap[fill]) color = colorMap[fill];
        else if (fill.startsWith?.('#')) color = fill;
        else color = '#888888';
        const mat = new THREE.MeshStandardMaterial({
            color, metalness: p.metalness ?? 0.1, roughness: p.roughness ?? 0.7,
            transparent: (p.opacity??1) < 1, opacity: p.opacity ?? 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.px||0, p.py||0, p.pz||0);
        const d = Math.PI / 180;
        mesh.rotation.set((p.rx||0)*d, (p.ry||0)*d, (p.rz||0)*d);
        group.add(mesh);
    }
    if (scale) group.scale.setScalar(scale);
    return group;
}

function _twoZoneMaterial(topHex, bottomHex, splitY) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTopColor    = { value: new THREE.Color(topHex) };
        sh.uniforms.uBottomColor = { value: new THREE.Color(bottomHex) };
        sh.uniforms.uSplitY      = { value: splitY };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vModelY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelY = position.y;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>',
                '#include <common>\nuniform vec3 uTopColor;\nuniform vec3 uBottomColor;\nuniform float uSplitY;\nvarying float vModelY;')
            .replace('#include <color_fragment>',
                '#include <color_fragment>\nvec3 zoneColor = vModelY >= uSplitY ? uTopColor : uBottomColor;\ndiffuseColor.rgb *= zoneColor;');
    };
    return mat;
}

/**
 * Build a character mesh group from a character asset JSON.
 * Origin = feet at (0,0,0). Caller positions the returned group.
 *
 * @param {Object} asset — character asset with payload.state
 * @returns {Promise<{ group: THREE.Group, totalHeight: number, dispose: Function }>}
 */
export async function buildCharacterMesh(asset) {
    const s = asset?.payload?.state || asset?.state || {};
    const group = new THREE.Group();
    group.name = `char_${asset?.id || 'unknown'}`;

    const bodyH = (BODY_HEIGHT_PRESETS[s.heightPreset] || BODY_HEIGHT_PRESETS.medium).height;
    const bodyW = (BODY_WIDTH_PRESETS[s.widthPreset]   || BODY_WIDTH_PRESETS.moderate).width;
    const headH = (HEAD_HEIGHT_PRESETS[s.headHeightPreset] || HEAD_HEIGHT_PRESETS.medium).height;
    const headW = (HEAD_WIDTH_PRESETS[s.headWidthPreset]   || HEAD_WIDTH_PRESETS.moderate).width;

    const disposables = [];

    // ── Body ──
    const bodyGeo = generateBodyGeometry(s.bodyShape || 'roundedBox', bodyW, bodyH);
    const bodySplitY = -bodyH / 2 + COLOR_ZONES.bottomHeight;
    const bodyMat = _twoZoneMaterial(s.torsoColor || '#7b4daa', s.bottomColor || '#3a2870', bodySplitY);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = FLOAT_Y + bodyH / 2;
    body.castShadow = true;
    group.add(body);
    disposables.push(bodyGeo, bodyMat);

    // ── Hands (inside arm subgroups) ──
    // Each hand lives inside an armGroup whose pivot sits at the shoulder.
    // At rest (group.quaternion = identity) the hand hangs at the side
    // because the hand mesh is positioned at (0, -armLen, 0) — i.e. straight
    // down from the shoulder pivot in armGroup-local space. Animation then
    // rotates the armGroup, swinging the hand in an arc around the shoulder.
    //
    // Named 'armL' / 'armR' so AnimationRig binds Mixamo Arm bone tracks
    // here. A future "reach for X" attention layer can also write to these
    // quaternions after the rig — last write wins.
    const handScale = bodyW / HAND.referenceBodyWidth;
    const handGeo = new RoundedBoxGeometry(
        HAND.baseWidth * handScale, HAND.baseHeight * handScale, HAND.baseDepth * handScale,
        HAND.segments, HAND.cornerRadius * handScale,
    );
    const handMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.skinColor || '#ffcc88'), roughness: 0.75, metalness: 0.05,
    });
    const bodyTopY = FLOAT_Y + bodyH;
    const handY = bodyTopY - bodyH * 0.35;
    const handX = bodyW / 2 + HAND.baseWidth * handScale * 0.8;
    // Shoulder pivot sits just inside the body's top corner. Picking handX
    // for shoulderX keeps the hand hanging straight down from the pivot,
    // so identity quaternion = arm-by-side.
    const shoulderY = bodyTopY - 0.05;
    const armLen    = shoulderY - handY;

    const armLGroup = new THREE.Group();
    armLGroup.name = 'armL';
    armLGroup.position.set(-handX, shoulderY, 0);
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(0, -armLen, 0);   // straight down from pivot
    armLGroup.add(leftHand);
    group.add(armLGroup);

    const armRGroup = new THREE.Group();
    armRGroup.name = 'armR';
    armRGroup.position.set(handX, shoulderY, 0);
    const rightHandGeo = handGeo.clone();
    const rightHand = new THREE.Mesh(rightHandGeo, handMat);
    rightHand.position.set(0, -armLen, 0);
    armRGroup.add(rightHand);
    group.add(armRGroup);

    disposables.push(handGeo, rightHandGeo, handMat);

    // ── Head subgroup ──
    // Everything from here down (head mesh, eyes, brows, mouth rig, facial
    // hair, hat, glasses) lives inside a single Group named 'head' that
    // pivots at the neck (top of body). One rotation — from AnimationRig,
    // a future "look-at" attention system, or anything else — swings the
    // entire head + face as a unit. Last write to headGroup.quaternion
    // wins, so layered systems (mocap nuance + attention bias) just stack.
    const neckGap = HEAD.neckGap;
    const headGroup = new THREE.Group();
    headGroup.name = 'head';
    headGroup.position.y = bodyTopY;   // pivot at the neck
    group.add(headGroup);

    // All Y positions below are LOCAL to headGroup (subtract bodyTopY from
    // the original world-Y formulae). Keep `headBaseY` etc. in world coords
    // for backwards-compat / external use — totalHeight, head-Y framing.
    const headBaseLocal = neckGap;
    const headBaseY     = bodyTopY + headBaseLocal;     // world (kept for return)

    const { geometry: headGeo, frontZ } = generateHeadGeometry(s.headShape || 'roundedBox', headW, headH);
    const scalpSplitY = headH - headH * HEAD.scalpFraction;
    const headMat = _twoZoneMaterial(s.scalpColor || '#8b2020', s.skinColor || '#ffcc88', scalpSplitY);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = headBaseLocal;
    headGroup.add(head);
    disposables.push(headGeo, headMat);

    // ── Face placement ──
    const faceOffset = (FACE_PLACEMENT_PRESETS[s.facePlacement] || FACE_PLACEMENT_PRESETS.mid).offset;
    const fwPreset = s.faceWidthPreset  || 'moderate';
    const fhPreset = s.faceHeightPreset || 'medium';
    const exo = FACE_FEATURES.eye.xOffsetByWidth[fwPreset]  || FACE_FEATURES.eye.xOffsetByWidth.moderate;
    const eyo = FACE_FEATURES.eye.yOffsetByHeight[fhPreset] || FACE_FEATURES.eye.yOffsetByHeight.medium;
    const myo = FACE_FEATURES.mouth.yOffsetByHeight[fhPreset] || FACE_FEATURES.mouth.yOffsetByHeight.medium;
    const skinH = headH - headH * HEAD.scalpFraction;
    // Local-to-headGroup variants of the face coords:
    const skinCYLocal  = headBaseLocal + skinH / 2;
    const faceCYLocal  = skinCYLocal + faceOffset;
    const eyeYLocal    = faceCYLocal + eyo;
    const mouthYLocal  = faceCYLocal - myo;
    // World variants kept for external math (camera framing, etc.):
    const skinCY = bodyTopY + skinCYLocal;
    const eyeY   = bodyTopY + eyeYLocal;
    const mouthY = bodyTopY + mouthYLocal;

    // ── Eyes ──
    const eyeTex = makeEyeTexture(s.eyeIrisColor, s.eyeShape, s.eyelashStyle, s.eyelashColor);
    const eyePlaneSize = FACE_FEATURES.eye.scleraDiameter * 1.3;
    const eyeGeo = new THREE.PlaneGeometry(eyePlaneSize, eyePlaneSize);
    const eyeMatL = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
    eyeL.position.set(-exo, eyeYLocal, frontZ + 0.005);
    headGroup.add(eyeL);
    const eyeTexR = eyeTex.clone(); eyeTexR.needsUpdate = true;
    const eyeGeoR = eyeGeo.clone();
    const eyeMatR = new THREE.MeshBasicMaterial({ map: eyeTexR, transparent: true, depthWrite: false });
    const eyeR = new THREE.Mesh(eyeGeoR, eyeMatR);
    eyeR.position.set(exo, eyeYLocal, frontZ + 0.005);
    headGroup.add(eyeR);
    disposables.push(eyeGeo, eyeGeoR, eyeMatL, eyeMatR, eyeTex, eyeTexR);

    // ── Eyebrows ──
    if (s.eyebrowStyle && s.eyebrowStyle !== 'none') {
        const browTexL = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || s.scalpColor || '#4a3728', false);
        const browTexR = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || s.scalpColor || '#4a3728', true);
        if (browTexL && browTexR) {
            const browSize = eyePlaneSize * 1.3;
            const browGeo = new THREE.PlaneGeometry(browSize, browSize * 0.5);
            const browMatL = new THREE.MeshBasicMaterial({ map: browTexL, transparent: true, depthWrite: false });
            const browMatR = new THREE.MeshBasicMaterial({ map: browTexR, transparent: true, depthWrite: false });
            const browL = new THREE.Mesh(browGeo, browMatL);
            const browGeoR = browGeo.clone();
            const browR = new THREE.Mesh(browGeoR, browMatR);
            const browYLocal = eyeYLocal + eyePlaneSize * 0.55;
            browL.position.set(-exo, browYLocal, frontZ + 0.006);
            browR.position.set(exo, browYLocal, frontZ + 0.006);
            headGroup.add(browL);
            headGroup.add(browR);
            disposables.push(browGeo, browGeoR, browMatL, browMatR, browTexL, browTexR);
        }
    }

    // ── Mouth (animated viseme rig — driven by caller via mouthRig.update) ──
    const mouthRig = new MouthRig();
    if (s.lipColor)     mouthRig.setLipColor(s.lipColor);
    if (s.lipThickness) mouthRig.setLipThickness(s.lipThickness);
    mouthRig.mesh.position.set(0, mouthYLocal, frontZ + 0.005);
    headGroup.add(mouthRig.mesh);

    // ── Facial hair (animated — jaw open drifts moustache + drops beard) ──
    const facialHairRig = new FacialHairRig();
    facialHairRig.setColor(s.facialHairColor || s.scalpColor || '#4a3728');
    facialHairRig.attach(headGroup, mouthYLocal, frontZ + 0.005, headW);
    if (s.facialHairStyle && s.facialHairStyle !== 'none') {
        facialHairRig.setStyle(s.facialHairStyle);
    }

    // ── Accessories (async) ──
    const headTopLocal = headBaseLocal + headH;
    const headTopY     = bodyTopY + headTopLocal;
    const PROP_REF = 1.1;
    const FACE_REF = 0.55;
    const HAIR_REF = 0.18;

    const accessoryPromises = [];
    const accessoryGroups  = [];

    // Hat / Hair (only one slot — hat takes priority). Both attach to the
    // head subgroup so they rotate with it.
    const hatId  = s.hatStyle;
    const hairId = s.hairStyle;
    const headwearId = (hatId && hatId !== 'none') ? hatId : ((hairId && hairId !== 'none') ? hairId : null);
    if (headwearId) {
        accessoryPromises.push(_fetchProp(headwearId).then(prop => {
            if (!prop) return;
            const scale = headW / PROP_REF;
            const g = _renderPropGroup(prop, hatId !== 'none' ? s.hatColor : s.hairColor, scale);
            g.position.y = headTopLocal;
            headGroup.add(g);
            accessoryGroups.push(g);
        }));
    }
    if (s.glassesStyle && s.glassesStyle !== 'none') {
        accessoryPromises.push(_fetchProp(s.glassesStyle).then(prop => {
            if (!prop) return;
            const scale = headW / FACE_REF;
            const g = _renderPropGroup(prop, s.glassesColor, scale);
            g.position.set(0, eyeYLocal, frontZ + 0.01);
            headGroup.add(g);
            accessoryGroups.push(g);
        }));
    }
    await Promise.all(accessoryPromises);

    const totalHeight = headBaseY + headH;

    function dispose() {
        mouthRig.dispose?.();
        facialHairRig.dispose?.();
        for (const obj of disposables) obj?.dispose?.();
        for (const g of accessoryGroups) {
            g.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                    if (c.material.map) c.material.map.dispose();
                    c.material.dispose();
                }
            });
        }
        if (group.parent) group.parent.remove(group);
    }

    // headGroup + arm groups are exposed so callers (AnimationRig, future
    // attention / look-at systems) can rotate them independently of the
    // body without having to traverse the scene graph by name every frame.
    return { group, headGroup, armLGroup, armRGroup, totalHeight, mouthRig, facialHairRig, dispose };
}
