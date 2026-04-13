import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
    BONE_HIERARCHY, CHARACTER, DEFAULT_COLORS, HEAD,
    BASE_BONES, BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    COLOR_ZONES, FACE_FEATURES, FACE_PLACEMENT_PRESETS, HAND,
} from './config.js';
import { MouthRig } from './mouthRig.js';
import { EyeRig } from './eyeRig.js';
import { createHeadwearMesh, createGlassesMesh, createFacialHairMesh, disposeAccessory } from './accessories.js';
import { generateHeadGeometry } from './headShapes.js';
import { generateBodyGeometry } from './bodyShapes.js';

// ── Bone Position Calculation ──────────────────────────

/**
 * Computes bone positions with independent body and head sizing.
 * Body bones (Spine→Neck) scale to cover bodyMeshHeight.
 * Head bone offset = neckGap (fixed), HeadTop_End offset = headHeight.
 * This guarantees a consistent neck gap regardless of size combos.
 */
function computeBonePositions(bodyWidth, bodyMeshHeight, headWidth, headHeight) {
    const bones = {};

    // ── Body spine chain: scale to cover bodyMeshHeight exactly ──
    const bodyBoneNames = [
        'mixamorig:Spine', 'mixamorig:Spine1',
        'mixamorig:Spine2', 'mixamorig:Neck',
    ];
    const bodyBoneBaseSum = bodyBoneNames.reduce((s, n) => s + BASE_BONES.spine[n], 0);
    const bodyScale = bodyMeshHeight / bodyBoneBaseSum;

    // Hips at float height
    const hipsY = Math.max(CHARACTER.floatHeight, 0.2);
    bones['mixamorig:Hips'] = { pos: [0, hipsY, 0] };

    // Scaled body bone offsets (each relative to parent)
    for (const name of bodyBoneNames) {
        bones[name] = { pos: [0, BASE_BONES.spine[name] * bodyScale, 0] };
    }

    // ── Head bone chain: fixed offsets for consistent gap ──
    // Head bone offset from Neck = neckGap → head bottom at body top + gap
    bones['mixamorig:Head'] = { pos: [0, HEAD.neckGap, 0] };
    // HeadTop_End offset from Head = headHeight → spans full head
    bones['mixamorig:HeadTop_End'] = { pos: [0, headHeight, 0] };

    // ── Arms ──
    const arms = BASE_BONES.arms;
    const shoulderOffsetX = bodyWidth / 2 + 0.02;

    // Spine2 world Y
    const spine2WorldY = hipsY
        + BASE_BONES.spine['mixamorig:Spine'] * bodyScale
        + BASE_BONES.spine['mixamorig:Spine1'] * bodyScale
        + BASE_BONES.spine['mixamorig:Spine2'] * bodyScale;

    // Shoulders near body top
    const bodyMeshTopY = hipsY + bodyMeshHeight;
    const shoulderTargetY = bodyMeshTopY - 0.05;
    const shoulderRelativeY = shoulderTargetY - spine2WorldY;

    bones['mixamorig:LeftShoulder']  = { pos: [-(shoulderOffsetX), shoulderRelativeY, 0] };
    bones['mixamorig:RightShoulder'] = { pos: [shoulderOffsetX, shoulderRelativeY, 0] };

    // Arm scaling proportional to body height
    const baseArmLength = arms.upperArm.x + arms.foreArm.x + arms.hand.x;
    const referenceHeight = BODY_HEIGHT_PRESETS.medium.height;
    const scaledArmLength = baseArmLength * (bodyMeshHeight / referenceHeight);

    const bodyBottomY = hipsY;
    const maxArmLength = shoulderTargetY - bodyBottomY;
    const finalArmLength = Math.min(scaledArmLength, maxArmLength);
    const armScale = finalArmLength / baseArmLength;

    bones['mixamorig:LeftArm']       = { pos: [-(arms.upperArm.x * armScale), 0, 0] };
    bones['mixamorig:RightArm']      = { pos: [arms.upperArm.x * armScale, 0, 0] };
    bones['mixamorig:LeftForeArm']   = { pos: [-(arms.foreArm.x * armScale), 0, 0] };
    bones['mixamorig:RightForeArm']  = { pos: [arms.foreArm.x * armScale, 0, 0] };
    bones['mixamorig:LeftHand']      = { pos: [-(arms.hand.x * armScale), 0, 0] };
    bones['mixamorig:RightHand']     = { pos: [arms.hand.x * armScale, 0, 0] };

    // ── Legs (fixed) ──
    const legs = BASE_BONES.legs;
    bones['mixamorig:LeftUpLeg']       = { pos: [-legs.hip.x, legs.hip.y, 0] };
    bones['mixamorig:RightUpLeg']      = { pos: [legs.hip.x, legs.hip.y, 0] };
    bones['mixamorig:LeftLeg']         = { pos: [0, legs.upperLeg.y, 0] };
    bones['mixamorig:RightLeg']        = { pos: [0, legs.upperLeg.y, 0] };
    bones['mixamorig:LeftFoot']        = { pos: [0, legs.lowerLeg.y, 0] };
    bones['mixamorig:RightFoot']       = { pos: [0, legs.lowerLeg.y, 0] };
    bones['mixamorig:LeftToeBase']     = { pos: [0, 0, legs.foot.z] };
    bones['mixamorig:RightToeBase']    = { pos: [0, 0, legs.foot.z] };
    bones['mixamorig:LeftToeBase_End'] = { pos: [0, 0, legs.toe.z] };
    bones['mixamorig:RightToeBase_End']= { pos: [0, 0, legs.toe.z] };

    return bones;
}

// ── Skeleton Creation ──────────────────────────────────

function createSkeleton(bonePositions) {
    const bones = {};

    for (const name of Object.keys(bonePositions)) {
        const bone = new THREE.Bone();
        bone.name = THREE.PropertyBinding.sanitizeNodeName(name);
        const [x, y, z] = bonePositions[name].pos;
        bone.position.set(x, y, z);
        bones[name] = bone;
    }

    for (const [parentName, childNames] of Object.entries(BONE_HIERARCHY)) {
        const parent = bones[parentName];
        if (!parent) continue;
        for (const childName of childNames) {
            if (bones[childName]) parent.add(bones[childName]);
        }
    }

    const rootBone = bones['mixamorig:Hips'];
    const boneArray = [];
    rootBone.traverse((obj) => {
        if (obj.isBone) boneArray.push(obj);
    });

    const skeleton = new THREE.Skeleton(boneArray);
    return { skeleton, bones, rootBone };
}

// ── Spine Chain World Positions ────────────────────────

function getSpineChainWorldY(bonePositions) {
    const chain = [
        'mixamorig:Hips',
        'mixamorig:Spine',
        'mixamorig:Spine1',
        'mixamorig:Spine2',
        'mixamorig:Neck',
        'mixamorig:Head',
        'mixamorig:HeadTop_End',
    ];

    let cumulativeY = 0;
    const result = [];

    for (const name of chain) {
        cumulativeY += bonePositions[name].pos[1];
        result.push({ name, worldY: cumulativeY });
    }

    return result;
}

// ── Two-Zone Color Material ───────────────────────────

function createTwoZoneMaterial(topColorHex, bottomColorHex, splitY) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.75,
        metalness: 0.05,
    });

    const topColorUniform    = { value: new THREE.Color(topColorHex) };
    const bottomColorUniform = { value: new THREE.Color(bottomColorHex) };
    const splitUniform       = { value: splitY };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTopColor    = topColorUniform;
        shader.uniforms.uBottomColor = bottomColorUniform;
        shader.uniforms.uSplitY      = splitUniform;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            varying float vModelY;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vModelY = position.y;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform vec3 uTopColor;
            uniform vec3 uBottomColor;
            uniform float uSplitY;
            varying float vModelY;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec3 zoneColor = vModelY >= uSplitY ? uTopColor : uBottomColor;
            diffuseColor.rgb *= zoneColor;`
        );
    };

    material.userData.topColor    = topColorUniform;
    material.userData.bottomColor = bottomColorUniform;
    material.userData.splitY      = splitUniform;

    return material;
}

// ── Body Mesh (Torso + Bottom) ────────────────────────

function createBodyMesh(skeleton, bonePositions, bodyWidth, bodyMeshHeight, shapeKey = 'roundedBox') {
    const spineChain = getSpineChainWorldY(bonePositions);
    const hipsY = spineChain[0].worldY;

    const bodyMeshCenterY = hipsY + bodyMeshHeight / 2;

    const geometry = generateBodyGeometry(shapeKey, bodyWidth, bodyMeshHeight);
    geometry.translate(0, bodyMeshCenterY, 0);

    // Skin body to spine chain (Hips through Neck — exclude Head bones)
    const bodySpineChain = spineChain.filter(b => !b.name.includes('Head'));

    const position    = geometry.attributes.position;
    const vertexCount = position.count;

    const boneIndexMap = {};
    skeleton.bones.forEach((bone, i) => { boneIndexMap[bone.name] = i; });

    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);

    for (let i = 0; i < vertexCount; i++) {
        const vy = position.getY(i);

        let lowerIdx = 0;
        for (let j = 1; j < bodySpineChain.length; j++) {
            if (bodySpineChain[j].worldY <= vy) {
                lowerIdx = j;
            } else {
                break;
            }
        }
        const upperIdx = Math.min(lowerIdx + 1, bodySpineChain.length - 1);

        const lowerBone = bodySpineChain[lowerIdx];
        const upperBone = bodySpineChain[upperIdx];

        let weight;
        if (lowerIdx === upperIdx) {
            weight = 1.0;
        } else {
            const range = upperBone.worldY - lowerBone.worldY;
            weight = range > 0 ? (vy - lowerBone.worldY) / range : 0.5;
            weight = Math.max(0, Math.min(1, weight));
        }

        const sLower = THREE.PropertyBinding.sanitizeNodeName(lowerBone.name);
        const sUpper = THREE.PropertyBinding.sanitizeNodeName(upperBone.name);
        const bi1 = boneIndexMap[sLower] || 0;
        const bi2 = boneIndexMap[sUpper] || 0;

        const offset = i * 4;
        skinIndices[offset]     = bi1;
        skinIndices[offset + 1] = bi2;
        skinIndices[offset + 2] = 0;
        skinIndices[offset + 3] = 0;

        skinWeights[offset]     = 1.0 - weight;
        skinWeights[offset + 1] = weight;
        skinWeights[offset + 2] = 0;
        skinWeights[offset + 3] = 0;
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const bottomSplitY = hipsY + COLOR_ZONES.bottomHeight;
    const material = createTwoZoneMaterial(
        DEFAULT_COLORS.torso, DEFAULT_COLORS.bottom, bottomSplitY
    );

    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return { mesh, material, bodyMeshCenterY, bodyMeshHeight };
}

// ── Head Mesh (Scalp + Skin) ──────────────────────────

function createHeadMesh(headWidth, headHeight, shapeKey = 'roundedBox') {
    const { geometry, frontZ } = generateHeadGeometry(shapeKey, headWidth, headHeight);

    const headLocalY = headHeight / 2;
    const headDepth = frontZ * 2;

    const scalpHeight = headHeight * HEAD.scalpFraction;
    const splitY = headLocalY + headHeight / 2 - scalpHeight;

    const material = createTwoZoneMaterial(
        DEFAULT_COLORS.scalp, DEFAULT_COLORS.skin, splitY
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return { mesh, material, headWidth, headHeight, headDepth, headLocalY, frontZ };
}

// ── Face Anchor (on Head bone) ────────────────────────

function createFaceAnchor(headWidth, headHeight, headLocalY, frontZ, heightPreset, widthPreset, placementKey) {
    const anchorGroup = new THREE.Group();
    anchorGroup.name = 'faceAnchor';

    const faceZ = frontZ + 0.002;

    const scalpHeight = headHeight * HEAD.scalpFraction;
    const skinHeight  = headHeight - scalpHeight;
    const skinCenterLocalY = headLocalY - headHeight / 2 + skinHeight / 2;

    const placementOffset = FACE_PLACEMENT_PRESETS[placementKey].offset;
    const cy = skinCenterLocalY + placementOffset;

    const eyeConf    = FACE_FEATURES.eye;
    const eyeXOffset = eyeConf.xOffsetByWidth[widthPreset];
    const eyeYOffset = eyeConf.yOffsetByHeight[heightPreset];

    const leftEye = new EyeRig();
    leftEye.attach(anchorGroup, -eyeXOffset, cy + eyeYOffset, faceZ);

    const rightEye = new EyeRig();
    rightEye.attach(anchorGroup, eyeXOffset, cy + eyeYOffset, faceZ);

    const mouthConf    = FACE_FEATURES.mouth;
    const mouthYOffset = mouthConf.yOffsetByHeight[heightPreset];

    const mouthRig = new MouthRig();
    mouthRig.attach(anchorGroup, cy, mouthYOffset, faceZ);

    return { anchorGroup, mouthRig, leftEye, rightEye, eyeY: cy + eyeYOffset, mouthY: cy - mouthYOffset, faceZ };
}

// ── Hands (Chubby Rounded Paddles) ────────────────────

function createHands(bones, bodyWidth, color) {
    const scale = bodyWidth / HAND.referenceBodyWidth;
    const w = HAND.baseWidth * scale;
    const h = HAND.baseHeight * scale;
    const d = HAND.baseDepth * scale;
    const r = HAND.cornerRadius * scale;

    const geo = new RoundedBoxGeometry(w, h, d, HAND.segments, r);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.75,
        metalness: 0.05,
    });

    const leftHand = new THREE.Mesh(geo, mat);
    leftHand.name = 'leftHandMesh';
    leftHand.castShadow = true;
    bones['mixamorig:LeftHand'].add(leftHand);

    const rightHand = new THREE.Mesh(geo.clone(), mat);
    rightHand.name = 'rightHandMesh';
    rightHand.castShadow = true;
    bones['mixamorig:RightHand'].add(rightHand);

    return { leftHand, rightHand, material: mat };
}

// ── Character Factory ──────────────────────────────────

export function createCharacter() {
    const state = {
        heightPreset: 'medium',
        widthPreset: 'moderate',
        headHeightPreset: 'medium',
        headWidthPreset: 'moderate',
        faceHeightPreset: 'medium',
        faceWidthPreset: 'moderate',
        headShape: 'roundedBox',
        bodyShape: 'roundedBox',
        facePlacement: 'mid',
        scalpColor: DEFAULT_COLORS.scalp,
        skinColor: DEFAULT_COLORS.skin,
        torsoColor: DEFAULT_COLORS.torso,
        bottomColor: DEFAULT_COLORS.bottom,
        eyeIrisColor: null,
        eyePupilSize: null,
        eyeIrisSize: null,
        eyeShape: 'circle',
        lipColor: null,
        lipThickness: null,
        hairStyle: 'none',
        hairColor: '#4a3728',
        hatStyle: 'none',
        hatColor: '#333333',
        facialHairStyle: 'none',
        facialHairColor: '#4a3728',
        glassesStyle: 'none',
        glassesColor: '#333333',
    };

    const container = new THREE.Group();

    let bodyMesh = null;
    let bodyMaterial = null;
    let headMesh = null;
    let headMaterial = null;
    let headGroup = null;
    let skeleton = null;
    let bones = null;
    let rootBone = null;
    let faceAnchorGroup = null;
    let handMeshes = null;
    let mouthRig = null;
    let leftEye = null;
    let rightEye = null;
    let hairGroup = null;
    let hatGroup = null;
    let facialHairGroup = null;
    let glassesGroup = null;

    function build() {
        // ── Dispose previous ────────────────────────────
        if (bodyMesh) {
            container.remove(bodyMesh);
            bodyMesh.geometry.dispose();
            bodyMesh.material.dispose();
        }
        if (headMesh) {
            headMesh.geometry.dispose();
            headMesh.material.dispose();
        }
        disposeAccessory(hairGroup); hairGroup = null;
        disposeAccessory(hatGroup); hatGroup = null;
        disposeAccessory(facialHairGroup); facialHairGroup = null;
        disposeAccessory(glassesGroup); glassesGroup = null;
        if (leftEye) { leftEye.dispose(); leftEye = null; }
        if (rightEye) { rightEye.dispose(); rightEye = null; }
        if (mouthRig) { mouthRig.dispose(); mouthRig = null; }
        if (faceAnchorGroup) {
            faceAnchorGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
        }
        if (handMeshes) {
            handMeshes.leftHand.geometry.dispose();
            handMeshes.rightHand.geometry.dispose();
            handMeshes.material.dispose();
        }
        headGroup = null;

        // ── Dimensions (body + head independent) ────────
        const bodyWidth      = BODY_WIDTH_PRESETS[state.widthPreset].width;
        const bodyMeshHeight = BODY_HEIGHT_PRESETS[state.heightPreset].height;
        const headWidth      = HEAD_WIDTH_PRESETS[state.headWidthPreset].width;
        const headHeight     = HEAD_HEIGHT_PRESETS[state.headHeightPreset].height;

        // ── Bones & skeleton ────────────────────────────
        const bonePositions = computeBonePositions(bodyWidth, bodyMeshHeight, headWidth, headHeight);
        ({ skeleton, bones, rootBone } = createSkeleton(bonePositions));

        // ── Body mesh (torso + bottom) ──────────────────
        const bodyResult = createBodyMesh(skeleton, bonePositions, bodyWidth, bodyMeshHeight, state.bodyShape);
        bodyMesh     = bodyResult.mesh;
        bodyMaterial = bodyResult.material;

        // ── Head group (attached to Head bone) ──────────
        headGroup = new THREE.Group();
        headGroup.name = 'headGroup';

        const headResult = createHeadMesh(headWidth, headHeight, state.headShape);
        headMesh     = headResult.mesh;
        headMaterial = headResult.material;
        headGroup.add(headMesh);

        // ── Face anchor (in head local space) ───────────
        let faceEyeY, faceMouthY, faceFrontZ;
        ({ anchorGroup: faceAnchorGroup, mouthRig, leftEye, rightEye, eyeY: faceEyeY, mouthY: faceMouthY, faceZ: faceFrontZ } = createFaceAnchor(
            headResult.headWidth, headResult.headHeight, headResult.headLocalY, headResult.frontZ,
            state.faceHeightPreset, state.faceWidthPreset, state.facePlacement
        ));
        headGroup.add(faceAnchorGroup);

        // Reapply stored face customizations
        if (state.eyeIrisColor) {
            leftEye.setIrisColor(state.eyeIrisColor);
            rightEye.setIrisColor(state.eyeIrisColor);
        }
        if (state.eyePupilSize !== null) {
            leftEye.setPupilSize(state.eyePupilSize);
            rightEye.setPupilSize(state.eyePupilSize);
        }
        if (state.eyeIrisSize !== null) {
            leftEye.update({ irisSize: state.eyeIrisSize });
            rightEye.update({ irisSize: state.eyeIrisSize });
        }
        if (state.eyeShape !== 'circle') {
            leftEye.setShape(state.eyeShape);
            rightEye.setShape(state.eyeShape);
        }
        if (state.lipColor) {
            mouthRig.setLipColor(state.lipColor);
        }
        if (state.lipThickness !== null) {
            mouthRig.setLipThickness(state.lipThickness);
        }

        // ── Accessories (in head group local space) ─────
        const headTopLocalY = headResult.headLocalY + headResult.headHeight / 2;

        hairGroup = createHeadwearMesh(state.hairStyle, state.hairColor, headResult.headWidth, headTopLocalY);
        if (hairGroup) headGroup.add(hairGroup);

        hatGroup = createHeadwearMesh(state.hatStyle, state.hatColor, headResult.headWidth, headTopLocalY);
        if (hatGroup) headGroup.add(hatGroup);

        // Glasses (attached to face anchor)
        glassesGroup = createGlassesMesh(
            state.glassesStyle, state.glassesColor,
            headResult.headWidth, faceEyeY, faceFrontZ
        );
        if (glassesGroup) faceAnchorGroup.add(glassesGroup);

        // Facial hair (attached to face anchor)
        facialHairGroup = createFacialHairMesh(
            state.facialHairStyle, state.facialHairColor,
            headResult.headWidth, faceMouthY, faceFrontZ
        );
        if (facialHairGroup) faceAnchorGroup.add(facialHairGroup);

        // Parent head group to Head bone
        bones['mixamorig:Head'].add(headGroup);

        // ── Hands ───────────────────────────────────────
        handMeshes = createHands(bones, bodyWidth, state.skinColor);

        // ── Bind skeleton to body mesh ──────────────────
        bodyMesh.add(rootBone);
        bodyMesh.bind(skeleton);

        // Apply stored colors
        bodyMaterial.userData.topColor.value.set(state.torsoColor);
        bodyMaterial.userData.bottomColor.value.set(state.bottomColor);
        headMaterial.userData.topColor.value.set(state.scalpColor);
        headMaterial.userData.bottomColor.value.set(state.skinColor);

        container.add(bodyMesh);
    }

    build();

    // ── Public API ─────────────────────────────────────
    const character = {
        get mesh() { return bodyMesh; },
        get container() { return container; },
        get skeleton() { return skeleton; },
        get bones() { return bones; },
        get rootBone() { return rootBone; },
        get mouthRig() { return mouthRig; },
        get leftEye() { return leftEye; },
        get rightEye() { return rightEye; },

        state,

        setScalpColor(hex) {
            state.scalpColor = hex;
            headMaterial.userData.topColor.value.set(hex);
        },
        setSkinColor(hex) {
            state.skinColor = hex;
            headMaterial.userData.bottomColor.value.set(hex);
            if (handMeshes) handMeshes.material.color.set(hex);
        },
        setTorsoColor(hex) {
            state.torsoColor = hex;
            bodyMaterial.userData.topColor.value.set(hex);
        },
        setBottomColor(hex) {
            state.bottomColor = hex;
            bodyMaterial.userData.bottomColor.value.set(hex);
        },

        setEyeIrisColor(hex) {
            state.eyeIrisColor = hex;
            if (leftEye) leftEye.setIrisColor(hex);
            if (rightEye) rightEye.setIrisColor(hex);
        },
        setEyePupilSize(val) {
            state.eyePupilSize = val;
            if (leftEye) leftEye.setPupilSize(val);
            if (rightEye) rightEye.setPupilSize(val);
        },
        setEyeIrisSize(val) {
            state.eyeIrisSize = val;
            if (leftEye) leftEye.update({ irisSize: val });
            if (rightEye) rightEye.update({ irisSize: val });
        },
        setEyeShape(key) {
            state.eyeShape = key;
            if (leftEye) leftEye.setShape(key);
            if (rightEye) rightEye.setShape(key);
        },
        setLipColor(hex) {
            state.lipColor = hex;
            if (mouthRig) mouthRig.setLipColor(hex);
        },
        setLipThickness(val) {
            state.lipThickness = val;
            if (mouthRig) mouthRig.setLipThickness(val);
        },

        // ── Body size ──
        setHeightPreset(key) {
            if (state.heightPreset === key) return;
            state.heightPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setWidthPreset(key) {
            if (state.widthPreset === key) return;
            state.widthPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },

        // ── Head size (independent) ──
        setHeadHeightPreset(key) {
            if (state.headHeightPreset === key) return;
            state.headHeightPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setHeadWidthPreset(key) {
            if (state.headWidthPreset === key) return;
            state.headWidthPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },

        // ── Head shape ──
        setHeadShape(key) {
            if (state.headShape === key) return;
            state.headShape = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },

        // ── Body shape ──
        setBodyShape(key) {
            if (state.bodyShape === key) return;
            state.bodyShape = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },

        // ── Face feature positioning ──
        setFaceHeightPreset(key) {
            if (state.faceHeightPreset === key) return;
            state.faceHeightPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setFaceWidthPreset(key) {
            if (state.faceWidthPreset === key) return;
            state.faceWidthPreset = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setFacePlacement(key) {
            if (state.facePlacement === key) return;
            state.facePlacement = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },

        // ── Accessories ──
        setHairStyle(key) {
            if (state.hairStyle === key) return;
            state.hairStyle = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setHairColor(hex) {
            state.hairColor = hex;
            if (hairGroup) {
                hairGroup.traverse(c => { if (c.material && !c.material.map) c.material.color.set(hex); });
            }
        },
        setHatStyle(key) {
            if (state.hatStyle === key) return;
            state.hatStyle = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setHatColor(hex) {
            state.hatColor = hex;
            if (hatGroup) {
                hatGroup.traverse(c => { if (c.material && !c.material.map) c.material.color.set(hex); });
            }
        },
        setFacialHairStyle(key) {
            if (state.facialHairStyle === key) return;
            state.facialHairStyle = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setFacialHairColor(hex) {
            state.facialHairColor = hex;
            if (facialHairGroup) {
                facialHairGroup.traverse(c => { if (c.material && !c.material.map) c.material.color.set(hex); });
            }
        },
        setGlassesStyle(key) {
            if (state.glassesStyle === key) return;
            state.glassesStyle = key;
            build();
            if (character.onRebuild) character.onRebuild();
        },
        setGlassesColor(hex) {
            state.glassesColor = hex;
            if (glassesGroup) {
                glassesGroup.traverse(c => { if (c.material && !c.material.map) c.material.color.set(hex); });
            }
        },

        onRebuild: null,

        /** Return a plain-object snapshot of all character state. */
        getState() {
            return { ...state };
        },

        /** Load a full state snapshot and rebuild. */
        setState(newState) {
            Object.assign(state, newState);
            build();
            if (character.onRebuild) character.onRebuild();
        },
    };

    return character;
}
