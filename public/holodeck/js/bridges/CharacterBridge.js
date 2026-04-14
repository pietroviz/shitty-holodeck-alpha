/**
 * CharacterBridge.js — Full character editor bridge.
 *
 * Provides: Mixamo-compatible skeleton, 8 head shapes, 8 body shapes,
 * canvas EyeRig + MouthRig, invisible arms with visible hands,
 * DawnBringer 32 palette colors, accessories, face placement,
 * OrbitControls with auto-spin, meSpeak voice + viseme mouth movement.
 */

import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
    DEFAULT_COLORS, CHARACTER, HEAD, COLOR_ZONES,
    FACE_FEATURES, FACE_PLACEMENT_PRESETS, HAND,
    BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    BONE_HIERARCHY, BASE_BONES, EYE_SHAPES,
    HAIR_STYLES, HAT_STYLES, GLASSES_STYLES, FACIAL_HAIR_STYLES,
    PROP_REF_WIDTH, FACE_PROP_REF_WIDTH, FACIAL_HAIR_REF_WIDTH,
    VOICE_PRESETS,
} from '../shared/charConfig.js';
import { generateHeadGeometry, HEAD_SHAPE_OPTIONS } from '../shared/headShapes.js';
import { generateBodyGeometry, BODY_SHAPE_OPTIONS } from '../shared/bodyShapes.js';
import { EyeRig, BlinkController } from '../shared/eyeRig.js';
import { MouthRig } from '../shared/mouthRig.js';
import { renderProp } from '../shared/propRenderer.js';
import { VoiceEngine } from '../shared/voiceEngine.js';
import { AnimationManager, ANIMATION_FILES } from '../shared/animationManager.js';
import { createTwoZoneMaterial } from '../shared/materials.js';
import { VoiceBridge } from './VoiceBridge.js';
import { ObjectBridge } from './ObjectBridge.js';
import { loadGlobalAssets } from '../assetLoader.js';
import { setRef, getRef, removeRef, getState as dbGetState } from '../db.js';

/* ═══════════════════════════════════════════════════════
   SINGLETONS (loaded once, shared across instances)
   ═══════════════════════════════════════════════════════ */

let _db32Colors = null;
async function loadPalette() {
    if (_db32Colors) return _db32Colors;
    try {
        const resp = await fetch('global_assets/pallettes/db32.json');
        const data = await resp.json();
        _db32Colors = data.colors;
    } catch {
        _db32Colors = [
            '#000000','#222034','#45283c','#663931','#8f563b','#df7126','#d9a066','#eec39a',
            '#fbf236','#99e550','#6abe30','#37946e','#4b692f','#524b24','#323c39','#3f3f74',
            '#306082','#5b6ee1','#639bff','#5fcde4','#cbdbfc','#ffffff','#9badb7','#847e87',
            '#696a6a','#595652','#76428a','#ac3232','#d95763','#d77bba','#8f974a','#8a6f30',
        ].map((hex, i) => ({ index: i, hex, name: '' }));
    }
    return _db32Colors;
}

const _propCache = {};
async function fetchProp(propId) {
    if (_propCache[propId]) return _propCache[propId];
    for (const sub of ['headwear', 'glasses', 'facial_hair']) {
        try {
            const r = await fetch(`global_assets/objects/fashion/${sub}/${propId}.json`);
            if (r.ok) { const d = await r.json(); _propCache[propId] = d; return d; }
        } catch { /* next */ }
    }
    return null;
}

/* ═══════════════════════════════════════════════════════
   MESH FACTORY (unchanged from prior session)
   ═══════════════════════════════════════════════════════ */

function computeBonePositions(bodyWidth, bodyMeshHeight, headWidth, headHeight) {
    const bones = {};
    const bodyBoneNames = ['mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2','mixamorig:Neck'];
    const bodyBoneBaseSum = bodyBoneNames.reduce((s,n) => s + BASE_BONES.spine[n], 0);
    const bodyScale = bodyMeshHeight / bodyBoneBaseSum;
    const hipsY = Math.max(CHARACTER.floatHeight, 0.2);
    bones['mixamorig:Hips'] = { pos: [0, hipsY, 0] };
    for (const name of bodyBoneNames) bones[name] = { pos: [0, BASE_BONES.spine[name] * bodyScale, 0] };
    bones['mixamorig:Head'] = { pos: [0, HEAD.neckGap, 0] };
    bones['mixamorig:HeadTop_End'] = { pos: [0, headHeight, 0] };
    const arms = BASE_BONES.arms;
    const shoulderOffsetX = bodyWidth / 2 + 0.02;
    const spine2WorldY = hipsY + BASE_BONES.spine['mixamorig:Spine']*bodyScale + BASE_BONES.spine['mixamorig:Spine1']*bodyScale + BASE_BONES.spine['mixamorig:Spine2']*bodyScale;
    const bodyMeshTopY = hipsY + bodyMeshHeight;
    const shoulderTargetY = bodyMeshTopY - 0.05;
    const shoulderRelativeY = shoulderTargetY - spine2WorldY;
    bones['mixamorig:LeftShoulder']  = { pos: [-(shoulderOffsetX), shoulderRelativeY, 0] };
    bones['mixamorig:RightShoulder'] = { pos: [shoulderOffsetX, shoulderRelativeY, 0] };
    const baseArmLength = arms.upperArm.x + arms.foreArm.x + arms.hand.x;
    const scaledArmLength = baseArmLength * (bodyMeshHeight / BODY_HEIGHT_PRESETS.medium.height);
    const finalArmLength = Math.min(scaledArmLength, shoulderTargetY - hipsY);
    const armScale = finalArmLength / baseArmLength;
    bones['mixamorig:LeftArm']  = { pos: [-(arms.upperArm.x*armScale),0,0] };
    bones['mixamorig:RightArm'] = { pos: [arms.upperArm.x*armScale,0,0] };
    bones['mixamorig:LeftForeArm']  = { pos: [-(arms.foreArm.x*armScale),0,0] };
    bones['mixamorig:RightForeArm'] = { pos: [arms.foreArm.x*armScale,0,0] };
    bones['mixamorig:LeftHand']  = { pos: [-(arms.hand.x*armScale),0,0] };
    bones['mixamorig:RightHand'] = { pos: [arms.hand.x*armScale,0,0] };
    const legs = BASE_BONES.legs;
    bones['mixamorig:LeftUpLeg']  = { pos: [-legs.hip.x, legs.hip.y, 0] };
    bones['mixamorig:RightUpLeg'] = { pos: [legs.hip.x, legs.hip.y, 0] };
    bones['mixamorig:LeftLeg']  = { pos: [0, legs.upperLeg.y, 0] };
    bones['mixamorig:RightLeg'] = { pos: [0, legs.upperLeg.y, 0] };
    bones['mixamorig:LeftFoot']  = { pos: [0, legs.lowerLeg.y, 0] };
    bones['mixamorig:RightFoot'] = { pos: [0, legs.lowerLeg.y, 0] };
    bones['mixamorig:LeftToeBase']  = { pos: [0,0,legs.foot.z] };
    bones['mixamorig:RightToeBase'] = { pos: [0,0,legs.foot.z] };
    bones['mixamorig:LeftToeBase_End']  = { pos: [0,0,legs.toe.z] };
    bones['mixamorig:RightToeBase_End'] = { pos: [0,0,legs.toe.z] };
    return bones;
}

function createSkeleton(bonePositions) {
    const bones = {};
    for (const name of Object.keys(bonePositions)) {
        const bone = new THREE.Bone();
        bone.name = THREE.PropertyBinding.sanitizeNodeName(name);
        const [x,y,z] = bonePositions[name].pos;
        bone.position.set(x,y,z);
        bones[name] = bone;
    }
    for (const [p, children] of Object.entries(BONE_HIERARCHY)) {
        const parent = bones[p]; if (!parent) continue;
        for (const c of children) if (bones[c]) parent.add(bones[c]);
    }
    const rootBone = bones['mixamorig:Hips'];
    const arr = []; rootBone.traverse(o => { if (o.isBone) arr.push(o); });
    return { skeleton: new THREE.Skeleton(arr), bones, rootBone };
}

function getSpineChainWorldY(bp) {
    const chain = ['mixamorig:Hips','mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2','mixamorig:Neck','mixamorig:Head','mixamorig:HeadTop_End'];
    let y = 0; const r = [];
    for (const n of chain) { y += bp[n].pos[1]; r.push({ name: n, worldY: y }); }
    return r;
}

function createBodyMesh(skeleton, bp, bodyWidth, bodyMeshHeight, shapeKey, torsoColor, bottomColor) {
    const spineChain = getSpineChainWorldY(bp);
    const hipsY = spineChain[0].worldY;
    const geometry = generateBodyGeometry(shapeKey, bodyWidth, bodyMeshHeight);
    geometry.translate(0, hipsY + bodyMeshHeight/2, 0);
    const bodySpineChain = spineChain.filter(b => !b.name.includes('Head'));
    const pos = geometry.attributes.position, vc = pos.count;
    const bim = {}; skeleton.bones.forEach((b,i) => { bim[b.name] = i; });
    const si = new Uint16Array(vc*4), sw = new Float32Array(vc*4);
    for (let i = 0; i < vc; i++) {
        const vy = pos.getY(i);
        let li = 0;
        for (let j = 1; j < bodySpineChain.length; j++) { if (bodySpineChain[j].worldY <= vy) li = j; else break; }
        const ui = Math.min(li+1, bodySpineChain.length-1);
        const lb = bodySpineChain[li], ub = bodySpineChain[ui];
        let w; if (li===ui) w=1; else { const r=ub.worldY-lb.worldY; w=r>0?(vy-lb.worldY)/r:0.5; w=Math.max(0,Math.min(1,w)); }
        const o=i*4;
        si[o]=bim[THREE.PropertyBinding.sanitizeNodeName(lb.name)]||0;
        si[o+1]=bim[THREE.PropertyBinding.sanitizeNodeName(ub.name)]||0;
        sw[o]=1-w; sw[o+1]=w;
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si,4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw,4));
    const material = createTwoZoneMaterial(torsoColor, bottomColor, hipsY + COLOR_ZONES.bottomHeight);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return { mesh, material };
}

function createHeadMesh(headWidth, headHeight, shapeKey, scalpColor, skinColor) {
    const { geometry, frontZ } = generateHeadGeometry(shapeKey, headWidth, headHeight);
    const headLocalY = headHeight/2;
    const splitY = headLocalY + headHeight/2 - headHeight * HEAD.scalpFraction;
    const material = createTwoZoneMaterial(scalpColor, skinColor, splitY);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return { mesh, material, headWidth, headHeight, headLocalY, frontZ };
}

function createFaceAnchor(headWidth, headHeight, headLocalY, frontZ, hPreset, wPreset, placementKey) {
    const ag = new THREE.Group(); ag.name = 'faceAnchor';
    const fz = frontZ + 0.002;
    const scalpH = headHeight * HEAD.scalpFraction, skinH = headHeight - scalpH;
    const skinCY = headLocalY - headHeight/2 + skinH/2;
    const cy = skinCY + FACE_PLACEMENT_PRESETS[placementKey].offset;
    const exo = FACE_FEATURES.eye.xOffsetByWidth[wPreset];
    const eyo = FACE_FEATURES.eye.yOffsetByHeight[hPreset];
    const le = new EyeRig(); le.attach(ag, -exo, cy+eyo, fz);
    const re = new EyeRig(); re.attach(ag, exo, cy+eyo, fz);
    const myo = FACE_FEATURES.mouth.yOffsetByHeight[hPreset];
    const mr = new MouthRig(); mr.attach(ag, cy, myo, fz);
    return { anchorGroup: ag, mouthRig: mr, leftEye: le, rightEye: re, eyeY: cy+eyo, mouthY: cy-myo, faceZ: fz };
}

function createHands(bones, bodyWidth, color) {
    const s = bodyWidth / HAND.referenceBodyWidth;
    const geo = new RoundedBoxGeometry(HAND.baseWidth*s, HAND.baseHeight*s, HAND.baseDepth*s, HAND.segments, HAND.cornerRadius*s);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
    const lh = new THREE.Mesh(geo, mat); lh.castShadow = true; bones['mixamorig:LeftHand'].add(lh);
    const rh = new THREE.Mesh(geo.clone(), mat); rh.castShadow = true; bones['mixamorig:RightHand'].add(rh);
    return { leftHand: lh, rightHand: rh, material: mat };
}

function createAccessoryMesh(propData, color, scale) {
    return propData ? renderProp(propData, { primaryColor: color, scale }) : null;
}

function disposeGroup(g) {
    if (!g) return;
    g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
    if (g.parent) g.parent.remove(g);
}

/* ═══════════════════════════════════════════════════════
   TAB DEFINITIONS
   ═══════════════════════════════════════════════════════ */

const TABS = [
    { id: 'file', label: 'File', icon: '📄' },
    { id: 'body', label: 'Body', icon: '◼' },
    { id: 'head', label: 'Head', icon: '●' },
    { id: 'face', label: 'Face', icon: '👁' },
    { id: 'style', label: 'Style', icon: '🎨' },
    { id: 'gear', label: 'Gear', icon: '⚙' },
];

const GREETING_TEXT = 'Hello! Welcome to the character builder. I am ready to be customized!';

/* ═══════════════════════════════════════════════════════
   CHARACTER BRIDGE
   ═══════════════════════════════════════════════════════ */

export class CharacterBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Character';
        this.storeName   = 'characters';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        this._state = {
            description: d.description || '',
            tags: d.tags || [],
            heightPreset: d.heightPreset || 'medium',
            widthPreset: d.widthPreset || 'moderate',
            headHeightPreset: d.headHeightPreset || 'medium',
            headWidthPreset: d.headWidthPreset || 'moderate',
            headShape: d.headShape || 'roundedBox',
            bodyShape: d.bodyShape || 'roundedBox',
            facePlacement: d.facePlacement || 'mid',
            faceHeightPreset: d.faceHeightPreset || 'medium',
            faceWidthPreset: d.faceWidthPreset || 'moderate',
            scalpColor: d.scalpColor || DEFAULT_COLORS.scalp,
            skinColor: d.skinColor || DEFAULT_COLORS.skin,
            torsoColor: d.torsoColor || DEFAULT_COLORS.torso,
            bottomColor: d.bottomColor || DEFAULT_COLORS.bottom,
            eyeIrisColor: d.eyeIrisColor || null,
            eyeShape: d.eyeShape || 'circle',
            lipColor: d.lipColor || null,
            hairStyle: d.hairStyle || 'none',
            hairColor: d.hairColor || '#4a3728',
            hatStyle: d.hatStyle || 'none',
            hatColor: d.hatColor || '#333333',
            glassesStyle: d.glassesStyle || 'none',
            glassesColor: d.glassesColor || '#333333',
            facialHairStyle: d.facialHairStyle || 'none',
            facialHairColor: d.facialHairColor || '#4a3728',
            voicePreset: d.voicePreset || 'narrator',
            animPreset: d.animPreset || 'Standing (Idle)',
        };

        this._container     = new THREE.Group();
        this._bodyMesh = null; this._bodyMaterial = null;
        this._headMesh = null; this._headMaterial = null;
        this._headGroup = null; this._skeleton = null;
        this._bones = null; this._rootBone = null;
        this._faceAnchor = null; this._handMeshes = null;
        this._mouthRig = null; this._leftEye = null; this._rightEye = null;
        this._blinkCtrl = new BlinkController();
        this._hairGroup = null; this._hatGroup = null;
        this._glassesGroup = null; this._facialHairGrp = null;

        this._palette = null;
        this._activeColorTarget = null;
        this._activeTab = 'file';

        // OrbitControls
        this._controls = null;
        this._autoSpin = true;
        this._autoSpinSpeed = 0.3;
        this._userInteracted = false;

        // Voice
        this._voiceEngine = new VoiceEngine();
        this._voiceReady = false;

        // Animation
        this._animManager = null;
        this._animNames = [];
        this._animLoaded = false;
        this._isPlaying = false;  // true while play button is active

        // Held item (object) picker state
        this._showItemPicker = false;
        this._itemTemplates  = null;
        this._itemBrowseOpen = false;
    }

    /* ── Scene ── */

    async _buildScene() {
        this._camera.position.set(0, 1.3, 3.5);
        this._camera.lookAt(0, 0.8, 0);
        this._camera.fov = 40;
        this._camera.updateProjectionMatrix();

        // Orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.target.set(0, 0.8, 0);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance = 1.5;
        this._controls.maxDistance = 8;
        this._controls.maxPolarAngle = Math.PI * 0.85;
        this._controls.update();

        // Stop auto-spin on user interaction
        const stopSpin = () => { this._autoSpin = false; this._userInteracted = true; };
        this._renderer.domElement.addEventListener('pointerdown', stopSpin);
        this._renderer.domElement.addEventListener('wheel', stopSpin);

        this._palette = await loadPalette();
        await this._buildCharacter();
        this._scene.add(this._container);

        // Init voice engine in background (don't block)
        this._voiceEngine.init().then(() => {
            this._voiceReady = true;
            // Apply voice ref state if one is assigned, otherwise use legacy preset
            const voiceRef = this._getVoiceRef();
            if (voiceRef) {
                const vs = voiceRef.payload?.state || voiceRef.state || {};
                this._voiceEngine.applyState(vs);
            } else {
                this._voiceEngine.setPreset(this._state.voicePreset);
            }
        }).catch(e => console.warn('[CharacterBridge] Voice engine failed:', e.message));

        // Load animations in background
        this._initAnimations();
    }

    /* ── Per-frame ── */

    _onTick(delta) {
        const deltaMs = delta * 1000;
        this._blinkCtrl.update(deltaMs);

        // Voice → mouth
        this._voiceEngine.update(deltaMs);
        if (this._mouthRig) this._mouthRig.update(this._voiceEngine.getVisemeParams());

        // Animation mixer
        if (this._animManager) this._animManager.update(delta);

        // Auto-spin
        if (this._autoSpin && this._controls) {
            this._controls.autoRotate = true;
            this._controls.autoRotateSpeed = this._autoSpinSpeed;
        } else if (this._controls) {
            this._controls.autoRotate = false;
        }
        if (this._controls) this._controls.update();
    }

    /* ── Character build/rebuild ── */

    async _buildCharacter() {
        this._disposeCharacter();
        const s = this._state;
        const bw = BODY_WIDTH_PRESETS[s.widthPreset].width;
        const bh = BODY_HEIGHT_PRESETS[s.heightPreset].height;
        const hw = HEAD_WIDTH_PRESETS[s.headWidthPreset].width;
        const hh = HEAD_HEIGHT_PRESETS[s.headHeightPreset].height;
        const bp = computeBonePositions(bw, bh, hw, hh);
        const { skeleton, bones, rootBone } = createSkeleton(bp);
        this._skeleton = skeleton; this._bones = bones; this._rootBone = rootBone;

        const br = createBodyMesh(skeleton, bp, bw, bh, s.bodyShape, s.torsoColor, s.bottomColor);
        this._bodyMesh = br.mesh; this._bodyMaterial = br.material;

        this._headGroup = new THREE.Group(); this._headGroup.name = 'headGroup';
        const hr = createHeadMesh(hw, hh, s.headShape, s.scalpColor, s.skinColor);
        this._headMesh = hr.mesh; this._headMaterial = hr.material;
        this._headGroup.add(this._headMesh);

        const fr = createFaceAnchor(hr.headWidth, hr.headHeight, hr.headLocalY, hr.frontZ, s.faceHeightPreset, s.faceWidthPreset, s.facePlacement);
        this._faceAnchor = fr.anchorGroup; this._mouthRig = fr.mouthRig;
        this._leftEye = fr.leftEye; this._rightEye = fr.rightEye;
        this._headGroup.add(this._faceAnchor);

        if (s.eyeIrisColor) { this._leftEye.setIrisColor(s.eyeIrisColor); this._rightEye.setIrisColor(s.eyeIrisColor); }
        if (s.eyeShape !== 'circle') { this._leftEye.setShape(s.eyeShape); this._rightEye.setShape(s.eyeShape); }
        if (s.lipColor) this._mouthRig.setLipColor(s.lipColor);

        this._blinkCtrl.clear(); this._blinkCtrl.register(this._leftEye, this._rightEye);

        const headTopY = hr.headLocalY + hr.headHeight/2;
        await this._loadAccessories(hr.headWidth, headTopY, fr.eyeY, fr.mouthY, fr.faceZ);

        bones['mixamorig:Head'].add(this._headGroup);
        this._handMeshes = createHands(bones, bw, s.skinColor);
        this._bodyMesh.add(rootBone); this._bodyMesh.bind(skeleton);
        this._container.add(this._bodyMesh);
    }

    async _loadAccessories(headWidth, headTopY, eyeY, mouthY, faceZ) {
        const s = this._state;
        const load = async (id, refW, parent, posY, posZ) => {
            if (!id || id === 'none') return null;
            const d = await fetchProp(id); if (!d) return null;
            const g = createAccessoryMesh(d, s[id.includes('glasses') ? 'glassesColor' : id.includes('mustache') || id.includes('beard') || id.includes('goatee') || id.includes('soul') ? 'facialHairColor' : 'hairColor'], headWidth / refW);
            if (g) { g.position.set(0, posY, posZ || 0); parent.add(g); }
            return g;
        };
        // Hair
        if (s.hairStyle !== 'none') { const d = await fetchProp(s.hairStyle); if (d) { this._hairGroup = createAccessoryMesh(d, s.hairColor, headWidth/PROP_REF_WIDTH); if (this._hairGroup) { this._hairGroup.position.y = headTopY; this._headGroup.add(this._hairGroup); } } }
        // Hat
        if (s.hatStyle !== 'none') { const d = await fetchProp(s.hatStyle); if (d) { this._hatGroup = createAccessoryMesh(d, s.hatColor, headWidth/PROP_REF_WIDTH); if (this._hatGroup) { this._hatGroup.position.y = headTopY; this._headGroup.add(this._hatGroup); } } }
        // Glasses
        if (s.glassesStyle !== 'none') { const d = await fetchProp(s.glassesStyle); if (d) { this._glassesGroup = createAccessoryMesh(d, s.glassesColor, headWidth/FACE_PROP_REF_WIDTH); if (this._glassesGroup) { this._glassesGroup.position.set(0, eyeY, faceZ+0.01); this._faceAnchor.add(this._glassesGroup); } } }
        // Facial hair
        if (s.facialHairStyle !== 'none') { const d = await fetchProp(s.facialHairStyle); if (d) { this._facialHairGrp = createAccessoryMesh(d, s.facialHairColor, headWidth/FACIAL_HAIR_REF_WIDTH); if (this._facialHairGrp) { this._facialHairGrp.position.set(0, mouthY-0.02, faceZ+0.01); this._faceAnchor.add(this._facialHairGrp); } } }
    }

    _disposeCharacter() {
        if (this._bodyMesh) { this._container.remove(this._bodyMesh); this._bodyMesh.geometry.dispose(); this._bodyMesh.material.dispose(); }
        if (this._headMesh) { this._headMesh.geometry.dispose(); this._headMesh.material.dispose(); }
        disposeGroup(this._hairGroup); this._hairGroup = null;
        disposeGroup(this._hatGroup); this._hatGroup = null;
        disposeGroup(this._glassesGroup); this._glassesGroup = null;
        disposeGroup(this._facialHairGrp); this._facialHairGrp = null;
        if (this._leftEye) { this._leftEye.dispose(); this._leftEye = null; }
        if (this._rightEye) { this._rightEye.dispose(); this._rightEye = null; }
        if (this._mouthRig) { this._mouthRig.dispose(); this._mouthRig = null; }
        if (this._faceAnchor) this._faceAnchor.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
        if (this._handMeshes) { this._handMeshes.leftHand.geometry.dispose(); this._handMeshes.rightHand.geometry.dispose(); this._handMeshes.material.dispose(); }
        this._headGroup = null; this._blinkCtrl.clear();
        this._bodyMesh = null; this._bodyMaterial = null; this._headMesh = null; this._headMaterial = null;
        this._skeleton = null; this._bones = null; this._rootBone = null; this._faceAnchor = null; this._handMeshes = null;
    }

    async _rebuild() { await this._buildCharacter(); this._renderPanel(); }

    _applyColors() {
        const s = this._state;
        if (this._bodyMaterial) { this._bodyMaterial.userData.topColor.value.set(s.torsoColor); this._bodyMaterial.userData.bottomColor.value.set(s.bottomColor); }
        if (this._headMaterial) { this._headMaterial.userData.topColor.value.set(s.scalpColor); this._headMaterial.userData.bottomColor.value.set(s.skinColor); }
        if (this._handMeshes) this._handMeshes.material.color.set(s.skinColor);
    }

    /* ── Voice ── */

    _speakGreeting() {
        if (!this._voiceReady) return;
        const voiceRef = this._getVoiceRef();
        if (voiceRef) {
            const vs = voiceRef.payload?.state || voiceRef.state || {};
            this._voiceEngine.applyState(vs);
        } else {
            this._voiceEngine.setPreset(this._state.voicePreset);
        }
        const text = (voiceRef?.payload?.state || voiceRef?.state || {}).previewText || GREETING_TEXT;
        this._voiceEngine.speak(text);
    }

    /* ── Voice ref helpers ── */

    /** Get the voice snapshot from this character's refs, or null. */
    _getVoiceRef() {
        return getRef(this.asset, 'voice');
    }

    /** Called when a child bridge (VoiceBridge/ObjectBridge) pops back with a saved asset. */
    _onResume(savedAsset) {
        if (savedAsset && savedAsset.type === 'voice') {
            // Store as a ref — snapshot with provenance tracking
            setRef(this.asset, 'voice', savedAsset);
            this._state.voicePreset = (savedAsset.payload?.state || savedAsset.state || {}).presetKey || 'narrator';
            // Apply voice to engine immediately
            const vs = savedAsset.payload?.state || savedAsset.state || {};
            if (this._voiceReady && vs) {
                this._voiceEngine.applyState(vs);
            }
        } else if (savedAsset && (savedAsset.type === 'object' || savedAsset.type === 'prop')) {
            // Store held item as a ref
            setRef(this.asset, 'heldItem', savedAsset);
        }
    }

    /** Open the VoiceBridge editor for the current voice asset. */
    _editVoice() {
        const voiceRef = this._getVoiceRef();
        const voiceAsset = voiceRef || this._buildDefaultVoiceAsset();
        if (this.onDrillDown) {
            this.onDrillDown(VoiceBridge, voiceAsset, 'Voice');
        }
    }

    /** Browse voice templates, then open editor for the selected one. */
    async _browseVoices() {
        if (this._voiceBrowseOpen) return;
        this._voiceBrowseOpen = true;
        try {
            const voices = await loadGlobalAssets('Voices');
            this._voiceTemplates = voices;
            this._voiceBrowseOpen = false;
            this._showVoicePicker = true;
            this._renderPanel();
        } catch (e) {
            console.warn('[CharacterBridge] Failed to load voice templates:', e);
            this._voiceBrowseOpen = false;
        }
    }

    /** Select a voice template — assign it as a ref and optionally drill into editor. */
    _selectVoiceTemplate(voice, editAfter = false) {
        // Store as a ref — snapshot with provenance
        setRef(this.asset, 'voice', voice);
        this._state.voicePreset = (voice.payload?.state || voice.state || {}).presetKey || voice.id;
        const vs = voice.payload?.state || voice.state || {};
        if (this._voiceReady && vs) {
            this._voiceEngine.applyState(vs);
        }
        this._showVoicePicker = false;
        if (editAfter) {
            this._editVoice();
        } else {
            this._renderPanel();
        }
    }

    /** Render the Held Item section HTML for the Gear tab. */
    _renderHeldItemSection() {
        const item = this._getHeldItemRef();
        const itemName = item ? _esc(item.name || 'Untitled Object') : 'None';
        const itemDesc = item?.payload?.description ? _esc(item.payload.description) : 'No item equipped';
        const itemColor = item?.payload?.color_assignments?.primary
            || item?.payload?.state?.colorAssignments?.primary
            || '#6F6F6F';

        // Item picker (if open)
        let itemPickerHtml = '';
        if (this._showItemPicker && this._itemTemplates) {
            const grouped = {};
            for (const obj of this._itemTemplates) {
                const cat = obj._category || obj.tags?.[0] || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(obj);
            }
            itemPickerHtml = `<div class="cb-item-picker">
                <div class="cb-item-picker-header">
                    <span>Choose Item</span>
                    <button class="cb-item-picker-close">✕</button>
                </div>
                ${Object.entries(grouped).map(([cat, items]) => `
                    <div class="cb-item-cat-title">${_esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
                    <div class="cb-item-grid">
                        ${items.map(obj => {
                            const pc = obj.payload?.color_assignments?.primary || '#6F6F6F';
                            return `<button class="cb-item-thumb" data-item-id="${_esc(obj.id)}" title="${_esc(obj.name)}">
                                <div class="cb-item-thumb-icon" style="background:${pc};"></div>
                                <div class="cb-item-thumb-name">${_esc(obj.name)}</div>
                            </button>`;
                        }).join('')}
                    </div>
                `).join('')}
            </div>`;
        }

        return `
            <div class="cb-section-title" style="margin-bottom:8px;">Held Item</div>
            <div class="cb-item-card">
                <div class="cb-item-card-icon" style="background:${itemColor};"></div>
                <div class="cb-item-card-info">
                    <div class="cb-item-card-name">${itemName}</div>
                    <div class="cb-item-card-desc">${itemDesc}</div>
                </div>
                <div class="cb-item-card-actions">
                    ${item ? `<button class="cb-item-edit-btn" title="Edit Item">✎</button>
                              <button class="cb-item-remove-btn" title="Remove Item">✕</button>` : ''}
                </div>
            </div>
            <button class="cb-item-browse-btn">Browse Items</button>
            ${itemPickerHtml}
        `;
    }

    /** Build a default voice asset from the current voicePreset. */
    _buildDefaultVoiceAsset() {
        const preset = VOICE_PRESETS[this._state.voicePreset];
        return {
            id: 'voice_' + this._state.voicePreset,
            type: 'voice',
            name: preset?.label || 'Narrator',
            tags: ['standard'],
            meta: {
                origin: 'preset', owner: 'system', version: 1, thumbnail: null,
                sourceId: 'voice_' + this._state.voicePreset, sourceVersion: 1,
            },
            payload: {
                description: preset?.label || 'Default voice',
                format: 'voice_state',
                state: {
                    language: 'en/en-us',
                    variant: preset?.variant || 'm3',
                    speed: preset?.speed ?? 155,
                    pitch: preset?.pitch ?? 40,
                    volume: 100,
                    amplitude: preset?.amplitude ?? 100,
                    wordgap: preset?.wordgap ?? 1,
                    reverb: preset?.reverb ?? 0,
                    wobble: preset?.wobble ?? 0,
                    wobbleSpeed: preset?.wobbleSpeed ?? 5,
                    brightness: preset?.brightness ?? 0,
                    breathiness: preset?.breathiness ?? 0,
                    vocalFry: preset?.vocalFry ?? 0,
                    chorus: preset?.chorus ?? 0,
                    mouthSnappiness: 85,
                    audioLead: 40,
                    lipColor: '#d4626e',
                    lipThickness: 3.5,
                    showLips: true,
                    showTeeth: true,
                    showTongue: true,
                    faceColor: '#7eb8c9',
                    scalpColor: '#3d6b7a',
                    captionSize: 18,
                    presetKey: this._state.voicePreset,
                    previewText: GREETING_TEXT,
                },
            },
            refs: [],
        };
    }

    /* ── Held Item (Object) ref helpers ── */

    /** Get the held item snapshot from this character's refs, or null. */
    _getHeldItemRef() {
        return getRef(this.asset, 'heldItem');
    }

    /** Open ObjectBridge to edit the held item. */
    _editHeldItem() {
        const itemRef = this._getHeldItemRef();
        if (!itemRef) return; // nothing to edit
        if (this.onDrillDown) {
            this.onDrillDown(ObjectBridge, itemRef, 'Held Item');
        }
    }

    /** Remove the held item ref. */
    _removeHeldItem() {
        removeRef(this.asset, 'heldItem');
        this._renderPanel();
    }

    /** Browse 3D object templates. */
    async _browseItems() {
        if (this._itemBrowseOpen) return;
        this._itemBrowseOpen = true;
        try {
            const objects = await loadGlobalAssets('3D Objects');
            this._itemTemplates = objects;
            this._itemBrowseOpen = false;
            this._showItemPicker = true;
            this._renderPanel();
        } catch (e) {
            console.warn('[CharacterBridge] Failed to load object templates:', e);
            this._itemBrowseOpen = false;
        }
    }

    /** Select an object template — assign it as a held item ref. */
    _selectItemTemplate(item, editAfter = false) {
        setRef(this.asset, 'heldItem', item);
        this._showItemPicker = false;
        if (editAfter) {
            this._editHeldItem();
        } else {
            this._renderPanel();
        }
    }

    /* ── Animation ── */

    async _initAnimations() {
        if (!this._bodyMesh) return;
        this._animManager = new AnimationManager(this._bodyMesh);
        try {
            this._animNames = await this._animManager.loadAnimations(ANIMATION_FILES);
            this._animLoaded = true;
            console.log('[CharacterBridge] Animations loaded:', this._animNames);
            // Re-render panel to populate animation dropdown
            this._renderPanel();
        } catch (e) {
            console.warn('[CharacterBridge] Animation loading failed:', e.message);
        }
    }

    /** Start playing the selected animation + voice + mouth. */
    play() {
        this._isPlaying = true;
        // Play animation
        if (this._animLoaded && this._animManager) {
            this._animManager.play(this._state.animPreset);
        }
        // Play voice
        this._speakGreeting();
    }

    /** Stop animation + voice + mouth. */
    stopPlayback() {
        this._isPlaying = false;
        if (this._animManager) this._animManager.stop();
        this._voiceEngine.stop();
    }

    /* ── Destroy (cleanup orbit + voice + animation) ── */

    destroy() {
        this._voiceEngine.stop();
        if (this._animManager) { this._animManager.dispose(); this._animManager = null; }
        if (this._controls) { this._controls.dispose(); this._controls = null; }
        super.destroy();
    }

    /* ═══════════════════════════════════════════════════
       PANEL — Tabbed layout (Figma Make style)
       ═══════════════════════════════════════════════════ */

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const desc = _esc(this._state.description || '');
        const tags = _esc((this._state.tags || []).join(', '));
        const s = this._state;
        const tab = this._activeTab;

        // Palette swatches
        const palHtml = this._palette
            ? this._palette.map(c => `<button class="cb-pal-swatch" data-hex="${c.hex}" title="${c.name||''}" style="background:${c.hex};"></button>`).join('')
            : '';

        // Tab bar (Figma Make style)
        const tabBar = `<div class="cb-tabs-list">
            ${TABS.map(t => `<button class="cb-tab-trigger ${t.id===tab?'active':''}" data-tab="${t.id}"><span class="cb-tab-icon">${t.icon}</span>${t.label}</button>`).join('')}
        </div>`;

        // Tab content
        let content = '';
        if (tab === 'file') {
            content = `
                <div class="cb-preset-row">
                  <label class="cb-color-label">Name:</label>
                  <input type="text" class="bridge-name-input cb-name-input" value="${name}" placeholder="Character name..." style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff;font-size:14px;font-family:inherit;outline:none;">
                  <span class="cb-char-count" style="font-size:11px;color:var(--text-dim);margin-top:2px;">${name.length}/50</span>
                </div>
                <div class="cb-preset-row">
                  <label class="cb-color-label">Description:</label>
                  <textarea class="cb-desc-input" placeholder="Describe your character..." rows="3" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;font-family:inherit;outline:none;resize:vertical;">${desc}</textarea>
                  <span class="cb-char-count" style="font-size:11px;color:var(--text-dim);margin-top:2px;">${desc.length}/200</span>
                </div>
                <div class="cb-preset-row">
                  <label class="cb-color-label">Tags:</label>
                  <input type="text" class="cb-tags-input" value="${tags}" placeholder="e.g. hero, warrior, npc" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff;font-size:13px;font-family:inherit;outline:none;">
                  <span class="cb-char-count" style="font-size:11px;color:var(--text-dim);margin-top:2px;">${tags.length}/100</span>
                </div>
            `;
        } else if (tab === 'body') {
            content = `
                ${_presetRow('Shape', 'bodyShape', BODY_SHAPE_OPTIONS, s.bodyShape)}
                ${_triRow('Height', 'heightPreset', BODY_HEIGHT_PRESETS, s.heightPreset)}
                ${_triRow('Width', 'widthPreset', BODY_WIDTH_PRESETS, s.widthPreset)}
            `;
        } else if (tab === 'head') {
            content = `
                ${_presetRow('Shape', 'headShape', HEAD_SHAPE_OPTIONS, s.headShape)}
                ${_triRow('Height', 'headHeightPreset', HEAD_HEIGHT_PRESETS, s.headHeightPreset)}
                ${_triRow('Width', 'headWidthPreset', HEAD_WIDTH_PRESETS, s.headWidthPreset)}
            `;
        } else if (tab === 'face') {
            content = `
                ${_presetRow('Eyes', 'eyeShape', Object.entries(EYE_SHAPES).map(([k,v])=>({key:k,label:v.label})), s.eyeShape)}
                ${_triRow('Placement', 'facePlacement', FACE_PLACEMENT_PRESETS, s.facePlacement)}
                ${_triRow('Face Height', 'faceHeightPreset', { squat:{label:'Squat'}, medium:{label:'Medium'}, tall:{label:'Tall'} }, s.faceHeightPreset)}
                ${_triRow('Face Width', 'faceWidthPreset', { narrow:{label:'Narrow'}, moderate:{label:'Moderate'}, wide:{label:'Wide'} }, s.faceWidthPreset)}
            `;
        } else if (tab === 'style') {
            content = `
                ${_swatchRow('Scalp',  'scalpColor',  s.scalpColor)}
                ${_swatchRow('Skin',   'skinColor',   s.skinColor)}
                ${_swatchRow('Torso',  'torsoColor',  s.torsoColor)}
                ${_swatchRow('Bottom', 'bottomColor', s.bottomColor)}
                ${_swatchRow('Eyes',   'eyeIrisColor', s.eyeIrisColor || '#4a7a8c')}
                ${_swatchRow('Lips',   'lipColor',    s.lipColor || '#d4626e')}
                <div class="cb-palette-grid" style="display:none;">${palHtml}</div>
            `;
        } else if (tab === 'gear') {
            // Build animation options from loaded names
            const animOptions = {};
            if (this._animLoaded && this._animNames.length) {
                for (const n of this._animNames) animOptions[n] = { label: n };
            } else {
                animOptions['Standing (Idle)'] = { label: 'Loading...' };
            }

            // Voice card — read from refs
            const va = this._getVoiceRef();
            const vaState = va?.payload?.state || va?.state || {};
            const voiceName = va ? _esc(va.name || 'Untitled Voice') : _esc(VOICE_PRESETS[s.voicePreset]?.label || 'Narrator');
            const voiceDesc = va?.payload?.description ? _esc(va.payload.description) : 'Default voice preset';
            const voiceFace = vaState.faceColor || '#7eb8c9';
            const voiceLip  = vaState.lipColor  || '#d4626e';

            // Voice picker (if open)
            let voicePickerHtml = '';
            if (this._showVoicePicker && this._voiceTemplates) {
                const grouped = {};
                for (const v of this._voiceTemplates) {
                    const cat = v.tags?.[0] || 'other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(v);
                }
                voicePickerHtml = `<div class="cb-voice-picker">
                    <div class="cb-voice-picker-header">
                        <span>Choose Voice</span>
                        <button class="cb-voice-picker-close">✕</button>
                    </div>
                    ${Object.entries(grouped).map(([cat, voices]) => `
                        <div class="cb-voice-cat-title">${_esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
                        <div class="cb-voice-grid">
                            ${voices.map(v => `
                                <button class="cb-voice-thumb" data-voice-id="${_esc(v.id)}" title="${_esc(v.name)}">
                                    <div class="cb-voice-thumb-face" style="background:${v.payload?.state?.faceColor || '#7eb8c9'};">
                                        <div class="cb-voice-thumb-lip" style="background:${v.payload?.state?.lipColor || '#d4626e'};"></div>
                                    </div>
                                    <div class="cb-voice-thumb-name">${_esc(v.name)}</div>
                                </button>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>`;
            }

            content = `
                ${_selectRow('Hair', 'hairStyle', HAIR_STYLES, s.hairStyle)}
                ${s.hairStyle !== 'none' ? _swatchRow('Hair Color', 'hairColor', s.hairColor) : ''}
                ${_selectRow('Hat', 'hatStyle', HAT_STYLES, s.hatStyle)}
                ${s.hatStyle !== 'none' ? _swatchRow('Hat Color', 'hatColor', s.hatColor) : ''}
                ${_selectRow('Glasses', 'glassesStyle', GLASSES_STYLES, s.glassesStyle)}
                ${s.glassesStyle !== 'none' ? _swatchRow('Glasses Color', 'glassesColor', s.glassesColor) : ''}
                ${_selectRow('Facial Hair', 'facialHairStyle', FACIAL_HAIR_STYLES, s.facialHairStyle)}
                ${s.facialHairStyle !== 'none' ? _swatchRow('Facial Hair Color', 'facialHairColor', s.facialHairColor) : ''}
                <div class="cb-palette-grid" style="display:none;">${palHtml}</div>
                <div class="cb-section-divider"></div>
                <div class="cb-section-title" style="margin-bottom:8px;">Voice</div>
                <div class="cb-voice-card">
                    <div class="cb-voice-card-face" style="background:${voiceFace};">
                        <div class="cb-voice-card-lip" style="background:${voiceLip};"></div>
                    </div>
                    <div class="cb-voice-card-info">
                        <div class="cb-voice-card-name">${voiceName}</div>
                        <div class="cb-voice-card-desc">${voiceDesc}</div>
                    </div>
                    <div class="cb-voice-card-actions">
                        <button class="cb-speak-btn" title="Preview">▶</button>
                        <button class="cb-voice-edit-btn" title="Edit Voice">✎</button>
                    </div>
                </div>
                <button class="cb-voice-browse-btn">Browse Voices</button>
                ${voicePickerHtml}
                <div class="cb-section-divider"></div>
                ${this._renderHeldItemSection()}
                <div class="cb-section-divider"></div>
                ${_selectRow('Animation', 'animPreset', animOptions, s.animPreset)}
                <button class="cb-play-btn">${this._isPlaying ? '■ Stop' : '▶ Play'}</button>
            `;
        }

        return `
          ${tabBar}
          <div class="cb-tab-content">${content}</div>
        `;
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

        // Shape buttons → rebuild
        panel.querySelectorAll('.cb-shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.prop, v = btn.dataset.key;
                if (this._state[p] === v) return;
                this._state[p] = v;
                this._rebuild();
            });
        });

        // Tri-preset buttons → rebuild
        panel.querySelectorAll('.cb-tri-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.prop, v = btn.dataset.key;
                if (this._state[p] === v) return;
                this._state[p] = v;
                this._rebuild();
            });
        });

        // Color swatch → open palette
        panel.querySelectorAll('.cb-color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const p = sw.dataset.property;
                const grid = panel.querySelector('.cb-palette-grid');
                if (!grid) return;
                if (this._activeColorTarget === p && grid.style.display !== 'none') {
                    grid.style.display = 'none'; this._activeColorTarget = null;
                } else {
                    this._activeColorTarget = p;
                    grid.style.display = 'grid';
                    grid.scrollIntoView({ behavior: 'instant', block: 'nearest' });
                }
            });
        });

        // Palette swatch → apply color
        panel.querySelectorAll('.cb-pal-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                if (!this._activeColorTarget) return;
                const hex = sw.dataset.hex, p = this._activeColorTarget;
                this._state[p] = hex;
                const el = panel.querySelector(`.cb-color-swatch[data-property="${p}"]`);
                if (el) el.style.background = hex;
                if (p === 'eyeIrisColor') { this._leftEye?.setIrisColor(hex); this._rightEye?.setIrisColor(hex); }
                else if (p === 'lipColor') { this._mouthRig?.setLipColor(hex); }
                else if (p === 'hairColor' || p === 'hatColor' || p === 'glassesColor' || p === 'facialHairColor') {
                    const grp = p === 'hairColor' ? this._hairGroup : p === 'hatColor' ? this._hatGroup : p === 'glassesColor' ? this._glassesGroup : this._facialHairGrp;
                    if (grp) grp.traverse(c => { if (c.isMesh && c.material && !c.material.map) c.material.color.set(hex); });
                }
                else this._applyColors();
            });
        });

        // Accessory / animation selects (voice is now handled separately)
        panel.querySelectorAll('.cb-acc-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const p = sel.dataset.prop;
                this._state[p] = sel.value;
                if (p === 'animPreset') {
                    if (this._isPlaying && this._animManager) {
                        this._animManager.play(sel.value);
                    }
                } else {
                    this._rebuild();
                }
            });
        });

        // Voice preview button
        panel.querySelector('.cb-speak-btn')?.addEventListener('click', () => this._speakGreeting());

        // Voice edit button → drill down into VoiceBridge
        panel.querySelector('.cb-voice-edit-btn')?.addEventListener('click', () => this._editVoice());

        // Voice browse button → load and show template picker
        panel.querySelector('.cb-voice-browse-btn')?.addEventListener('click', () => this._browseVoices());

        // Voice picker close
        panel.querySelector('.cb-voice-picker-close')?.addEventListener('click', () => {
            this._showVoicePicker = false;
            this._renderPanel();
        });

        // Voice template thumbnails in picker
        panel.querySelectorAll('.cb-voice-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.voiceId;
                const voice = this._voiceTemplates?.find(v => v.id === id);
                if (voice) this._selectVoiceTemplate(voice, false);
            });
        });

        // Held item edit button → drill down into ObjectBridge
        panel.querySelector('.cb-item-edit-btn')?.addEventListener('click', () => this._editHeldItem());

        // Held item remove button
        panel.querySelector('.cb-item-remove-btn')?.addEventListener('click', () => this._removeHeldItem());

        // Held item browse button
        panel.querySelector('.cb-item-browse-btn')?.addEventListener('click', () => this._browseItems());

        // Item picker close
        panel.querySelector('.cb-item-picker-close')?.addEventListener('click', () => {
            this._showItemPicker = false;
            this._renderPanel();
        });

        // Item template thumbnails in picker
        panel.querySelectorAll('.cb-item-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.itemId;
                const item = this._itemTemplates?.find(o => o.id === id);
                if (item) this._selectItemTemplate(item, false);
            });
        });

        // Animation play/stop button
        panel.querySelector('.cb-play-btn')?.addEventListener('click', () => {
            if (this._isPlaying) {
                this.stopPlayback();
            } else {
                this.play();
            }
            this._renderPanel();
        });

        // Description input
        panel.querySelector('.cb-desc-input')?.addEventListener('input', (e) => {
            this._state.description = e.target.value;
        });

        // Tags input
        panel.querySelector('.cb-tags-input')?.addEventListener('input', (e) => {
            this._state.tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
        });
    }

    _getState() { return { ...this._state }; }

    _applyState(state) {
        this._state = { ...state };
        this._rebuild();
    }
}

/* ═══════════════════════════════════════════════════════
   PANEL HTML HELPERS
   ═══════════════════════════════════════════════════════ */

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }

function _presetRow(label, prop, options, activeKey) {
    return `<div class="cb-preset-row">
      <label class="cb-color-label">${label}:</label>
      <div class="cb-shape-grid">${options.map(o =>
        `<button class="cb-shape-btn ${o.key===activeKey?'active':''}" data-prop="${prop}" data-key="${o.key}" title="${o.label}">${o.label}</button>`
      ).join('')}</div></div>`;
}

function _triRow(label, prop, presets, activeKey) {
    return `<div class="cb-preset-row">
      <label class="cb-color-label">${label}:</label>
      <div class="cb-preset-btns">${Object.entries(presets).map(([k,v]) =>
        `<button class="cb-tri-btn ${k===activeKey?'active':''}" data-prop="${prop}" data-key="${k}">${v.label}</button>`
      ).join('')}</div></div>`;
}

function _swatchRow(label, prop, hex) {
    return `<div class="cb-color-row">
      <label class="cb-color-label">${label}:</label>
      <button class="cb-color-swatch" data-property="${prop}" style="background:${_esc(hex)};"></button>
    </div>`;
}

function _selectRow(label, prop, styles, activeKey) {
    return `<div class="cb-preset-row">
      <label class="cb-color-label">${label}:</label>
      <select class="cb-acc-select" data-prop="${prop}">${Object.entries(styles).map(([k,v]) =>
        `<option value="${k}" ${k===activeKey?'selected':''}>${v.label}</option>`
      ).join('')}</select></div>`;
}
