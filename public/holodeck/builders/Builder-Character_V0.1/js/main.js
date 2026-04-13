import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter } from './character.js';
import { AnimationManager } from './animationManager.js';
import { VoiceEngine } from './voiceEngine.js';
import { BlinkController } from './eyeRig.js';
import { initUI } from './ui.js';
import { ANIMATION_FILES, HEADWEAR_MANIFEST, GLASSES_MANIFEST, FACIAL_HAIR_MANIFEST } from './config.js';
import { preloadProps } from './accessories.js';
import { BoneConstraints } from './boneConstraints.js';

// ── Scene ──────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a3e);

// ── Camera ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.set(0, 1.3, 3.5);

// ── Renderer ───────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ── Orbit Controls ─────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 10;
controls.update();

// ── Lighting ───────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 8, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 20;
directionalLight.shadow.camera.left = -3;
directionalLight.shadow.camera.right = 3;
directionalLight.shadow.camera.top = 3;
directionalLight.shadow.camera.bottom = -3;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);

// ── Ground ─────────────────────────────────────────────
const groundGeometry = new THREE.PlaneGeometry(10, 10);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a5e,
    roughness: 1.0,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(10, 20, 0x555577, 0x444466);
grid.position.y = 0.001;
scene.add(grid);

// ── Voice Engine ───────────────────────────────────────
const voiceEngine = new VoiceEngine();

// ── Blink Controller ──────────────────────────────────
const blinkController = new BlinkController();

// ── Deferred state (set in init) ──────────────────────
let character = null;
let skeletonHelper = null;
let animationManager = null;
let boneConstraints = null;

async function init() {
    const loadingEl = document.getElementById('loading-indicator');

    // Preload headwear prop assets
    loadingEl.classList.remove('hidden');
    loadingEl.textContent = 'Loading assets...';
    await preloadProps([...HEADWEAR_MANIFEST, ...GLASSES_MANIFEST, ...FACIAL_HAIR_MANIFEST]);

    // Create character (needs headwear cache ready)
    character = createCharacter();
    scene.add(character.container);

    skeletonHelper = new THREE.SkeletonHelper(character.mesh);
    skeletonHelper.visible = false;
    scene.add(skeletonHelper);

    animationManager = new AnimationManager(character.mesh);
    boneConstraints = new BoneConstraints(character.bones);

    blinkController.register(character.leftEye, character.rightEye);

    // Handle character rebuilds
    character.onRebuild = () => {
        scene.remove(skeletonHelper);
        skeletonHelper.dispose();
        skeletonHelper = new THREE.SkeletonHelper(character.mesh);
        skeletonHelper.visible = document.getElementById('show-skeleton').checked;
        scene.add(skeletonHelper);

        animationManager = new AnimationManager(character.mesh);
        boneConstraints = new BoneConstraints(character.bones);
        if (ANIMATION_FILES.length > 0) {
            animationManager.loadAnimations(ANIMATION_FILES);
        }

        blinkController.clear();
        blinkController.register(character.leftEye, character.rightEye);
    };

    // Load animations
    if (ANIMATION_FILES.length > 0) {
        loadingEl.textContent = 'Loading animations...';
        await animationManager.loadAnimations(ANIMATION_FILES);
    }

    // Load voice engine
    loadingEl.textContent = 'Loading voice engine...';
    try {
        await voiceEngine.init();
    } catch (e) {
        console.warn('[Main] Voice engine failed to load:', e.message);
    }

    loadingEl.classList.add('hidden');

    initUI(character, () => animationManager, () => skeletonHelper, voiceEngine, renderer, scene, camera);
}

init();

// ── Render Loop ────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const deltaMs = delta * 1000;

    if (animationManager) animationManager.update(delta);
    if (boneConstraints) boneConstraints.update();

    // Update voice engine viseme timing
    voiceEngine.update(deltaMs);

    // Update mouth rig with current viseme params
    if (character && character.mouthRig) {
        character.mouthRig.update(voiceEngine.getVisemeParams());
    }

    // Update blink animation
    blinkController.update(deltaMs);

    controls.update();
    renderer.render(scene, camera);
}

animate();

// ── Window Resize ──────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
