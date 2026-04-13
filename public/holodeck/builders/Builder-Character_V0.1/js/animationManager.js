import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * Normalizes Mixamo animation track names so they match our sanitized bone names.
 *
 * Track names arrive as "mixamorigHips.quaternion" (or "mixamorig1:Hips.quaternion").
 * Our bone names are sanitized with THREE.PropertyBinding.sanitizeNodeName(), which
 * strips reserved characters (colons, brackets, dots in names, etc.).
 *
 * We apply the same sanitization to the node-name portion of each track so they match.
 */
function normalizeTrackNames(clip) {
    // Sanitize node names and collect indices of Hips position tracks to remove
    const removeIndices = [];

    for (let i = 0; i < clip.tracks.length; i++) {
        const track = clip.tracks[i];

        // Split "nodeName.property" (first dot separates node from property path)
        const dotIndex = track.name.indexOf('.');
        if (dotIndex === -1) continue;

        const nodeName = track.name.substring(0, dotIndex);
        const property = track.name.substring(dotIndex); // includes the leading "."

        // Sanitize the node name exactly like we sanitize bone.name
        const sanitized = THREE.PropertyBinding.sanitizeNodeName(nodeName);
        track.name = sanitized + property;

        // Remove Hips .position tracks — Mixamo bakes absolute root-motion
        // positions from the original character, which teleports our custom
        // character off-screen. We keep only rotation/quaternion data.
        if (sanitized.match(/Hips$/i) && property === '.position') {
            removeIndices.push(i);
        }

        // Strip only .position tracks from spine/neck/head bones.
        // Quaternion (rotation) tracks are now KEPT — the head is a separate
        // mesh parented to the Head bone, so spine/neck/head rotations work
        // naturally without the old face-drift issue.
        if (/Spine|Neck|Head/.test(sanitized) && property === '.position') {
            removeIndices.push(i);
        }

        // Remove ALL leg bone tracks (position, quaternion, scale)
        // Prevents tiny hidden leg stubs from animating visibly outside body
        if (/(?:Up)?Leg|Foot|ToeBase/.test(sanitized)) {
            removeIndices.push(i);
        }
    }

    // Remove marked tracks in reverse order to preserve indices
    for (let i = removeIndices.length - 1; i >= 0; i--) {
        clip.tracks.splice(removeIndices[i], 1);
    }
}

export class AnimationManager {
    constructor(characterMesh) {
        this.mixer = new THREE.AnimationMixer(characterMesh);
        this.actions = {};
        this.currentAction = null;
        this.loader = new FBXLoader();
    }

    /**
     * Loads a Mixamo FBX animation file.
     * The FBX should be exported from Mixamo with "Without Skin".
     */
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

    /**
     * Loads multiple animations from a list of file paths.
     * Display names are derived from filenames (e.g. "animations/Run - Fast.fbx" → "Run - Fast").
     * Returns the names of successfully loaded animations.
     */
    async loadAnimations(animationFiles) {
        const loaded = [];
        for (const filePath of animationFiles) {
            // Derive display name from filename:
            //   "animations/Dancing - Hiphop~fast-energetic.fbx" → "Dancing - Hiphop"
            //   "animations/Standing - Idle.fbx" → "Standing - Idle"
            // Text after ~ is LLM context (hidden from UI).
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

    /**
     * Plays the named animation with crossfade from the current one.
     */
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

    /**
     * Stops the current animation.
     */
    stop() {
        if (this.currentAction) {
            this.currentAction.fadeOut(0.4);
            this.currentAction = null;
        }
    }

    /**
     * Must be called each frame with the delta time from the clock.
     */
    update(deltaTime) {
        this.mixer.update(deltaTime);
    }

    /**
     * Returns an array of loaded animation names.
     */
    getAnimationNames() {
        return Object.keys(this.actions);
    }
}
