/**
 * animationManager.js — Shared animation manager for Mixamo FBX animations.
 *
 * Ported from builders/Builder-Character_V0.1/js/animationManager.js
 * with the same track normalization (strips legs, position tracks).
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * Normalizes Mixamo animation track names so they match our sanitized bone names.
 * Strips leg bone tracks and Hips/Spine/Neck/Head position tracks.
 */
function normalizeTrackNames(clip) {
    const removeIndices = [];

    for (let i = 0; i < clip.tracks.length; i++) {
        const track = clip.tracks[i];
        const dotIndex = track.name.indexOf('.');
        if (dotIndex === -1) continue;

        const nodeName = track.name.substring(0, dotIndex);
        const property = track.name.substring(dotIndex);

        const sanitized = THREE.PropertyBinding.sanitizeNodeName(nodeName);
        track.name = sanitized + property;

        // Remove Hips .position tracks (root motion)
        if (sanitized.match(/Hips$/i) && property === '.position') {
            removeIndices.push(i);
        }

        // Strip .position tracks from spine/neck/head bones
        if (/Spine|Neck|Head/.test(sanitized) && property === '.position') {
            removeIndices.push(i);
        }

        // Remove ALL leg bone tracks
        if (/(?:Up)?Leg|Foot|ToeBase/.test(sanitized)) {
            removeIndices.push(i);
        }
    }

    // Remove in reverse to preserve indices
    for (let i = removeIndices.length - 1; i >= 0; i--) {
        clip.tracks.splice(removeIndices[i], 1);
    }
}

/** Default animation files (from global_assets/animations/) */
export const ANIMATION_FILES = [
    'global_assets/animations/Standing (Idle)~slight hand movement.fbx',
    'global_assets/animations/Talking (Normal)~standing, arm movement, slight head movement.fbx',
    'global_assets/animations/Talking (Calm)~standing, arm movement, slight head movement.fbx',
    'global_assets/animations/Talking (Argue)~standing, agressive arms.fbx',
    'global_assets/animations/Talking (Phone)~agreeable head movement, some hand movement and slow body rotation turning left and right.fbx',
    'global_assets/animations/Dancing (Hip Hop)~90s style running on the spot.fbx',
    'global_assets/animations/Dancing (Salsa)~lots of hips and arm movement.fbx',
    'global_assets/animations/Dancing (Twerk)~lots of bum shaking.fbx',
];

export class AnimationManager {
    constructor(characterMesh) {
        this.mixer = new THREE.AnimationMixer(characterMesh);
        this.actions = {};
        this.currentAction = null;
        this.loader = new FBXLoader();
    }

    /** Load a single Mixamo FBX animation. */
    async loadAnimation(name, url) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (fbx) => {
                    if (fbx.animations.length > 0) {
                        const clip = fbx.animations[0];
                        clip.name = name;
                        normalizeTrackNames(clip);
                        const action = this.mixer.clipAction(clip);
                        this.actions[name] = action;
                        resolve(action);
                    } else {
                        reject(new Error(`No animations found in ${url}`));
                    }
                },
                undefined,
                (error) => {
                    console.warn(`Failed to load animation "${name}" from ${url}:`, error);
                    reject(error);
                }
            );
        });
    }

    /** Load all animation files. Returns names of successfully loaded animations. */
    async loadAnimations(animationFiles) {
        const loaded = [];
        for (const filePath of animationFiles) {
            const basename = filePath.split('/').pop().replace(/\.fbx$/i, '');
            const name = basename.includes('~') ? basename.split('~')[0].trim() : basename;
            try {
                await this.loadAnimation(name, filePath);
                loaded.push(name);
            } catch (e) {
                console.warn(`Skipping animation "${name}":`, e.message);
            }
        }
        return loaded;
    }

    /** Play the named animation with crossfade. */
    play(name, fadeDuration = 0.4) {
        const newAction = this.actions[name];
        if (!newAction) return;

        if (this.currentAction && this.currentAction !== newAction) {
            this.currentAction.fadeOut(fadeDuration);
        }

        newAction.reset();
        newAction.fadeIn(fadeDuration);
        newAction.play();
        this.currentAction = newAction;
    }

    /** Stop the current animation. */
    stop() {
        if (this.currentAction) {
            this.currentAction.fadeOut(0.4);
            this.currentAction = null;
        }
    }

    /** Must be called each frame with delta time. */
    update(deltaTime) {
        this.mixer.update(deltaTime);
    }

    /** Returns array of loaded animation names. */
    getAnimationNames() {
        return Object.keys(this.actions);
    }

    /** Dispose the mixer. */
    dispose() {
        this.stop();
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.mixer.getRoot());
    }
}
