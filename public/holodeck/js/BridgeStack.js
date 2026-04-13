/**
 * BridgeStack.js — Navigation stack for nested builder editing.
 *
 * Manages a stack of bridge instances. Each bridge owns the 3D viewport
 * and the side panel. Push to drill into a sub-editor, pop to return.
 *
 * See _docs/ARCHITECTURE-BridgeStack.md for the full design.
 */

export class BridgeStack {

    /**
     * @param {HTMLElement} sceneContainer — #scene-container
     * @param {HTMLElement} panelEl        — #panel-inner
     * @param {Object}      callbacks
     * @param {Function}    callbacks.onStackChange — called after every push/pop with { depth, label, isEmpty }
     */
    constructor(sceneContainer, panelEl, callbacks = {}) {
        this.sceneContainer = sceneContainer;
        this.panelEl        = panelEl;
        this.stack          = [];
        this._onStackChange = callbacks.onStackChange || (() => {});
    }

    /** Current depth of the stack. */
    get depth() { return this.stack.length; }

    /** Whether the stack is empty (home state). */
    get isEmpty() { return this.stack.length === 0; }

    /** The active (top) bridge entry, or null. */
    top() {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    /** The breadcrumb trail as an array of labels. */
    get breadcrumb() {
        return this.stack.map(e => e.label);
    }

    /**
     * Push a new bridge onto the stack.
     *
     * @param {class}       BridgeClass — constructor that implements the Bridge interface
     * @param {Object|null} asset       — asset to edit, or null for new
     * @param {string}      label       — display label for breadcrumbs (e.g. "Character")
     */
    async push(BridgeClass, asset, label) {
        // ── Fade out viewport ──
        this.sceneContainer.style.transition = 'opacity 0.15s ease';
        this.sceneContainer.style.opacity = '0';
        await _sleep(150);

        // ── Suspend current top ──
        const current = this.top();
        if (current) current.bridge.suspend();

        // ── Build breadcrumb ──
        const crumbs = this.stack.map(e => e.label).concat(label);

        // ── Create new bridge ──
        const bridge = new BridgeClass(this.sceneContainer, this.panelEl, {
            asset,
            breadcrumb: crumbs,

            onSave: (savedAsset) => {
                this._pop(savedAsset);
            },

            onCancel: () => {
                this._pop(null);
            },

            onDrillDown: (ChildBridge, childAsset, childLabel) => {
                this.push(ChildBridge, childAsset, childLabel);
            },
        });

        this.stack.push({ bridge, label, asset });
        await bridge.init();

        // ── Re-show panel (suspend hid it) ──
        this.panelEl.style.display = '';

        // ── Fade in viewport ──
        this.sceneContainer.style.opacity = '1';
        await _sleep(150);
        this.sceneContainer.style.transition = '';

        this._notify();
    }

    /**
     * Pop the top bridge. Internal — called by bridge save/cancel callbacks.
     * @param {Object|null} savedAsset — the saved asset, or null if cancelled
     */
    async _pop(savedAsset) {
        if (this.stack.length === 0) return;

        // ── Fade out ──
        this.sceneContainer.style.transition = 'opacity 0.15s ease';
        this.sceneContainer.style.opacity = '0';
        await _sleep(150);

        // ── Destroy top ──
        const popped = this.stack.pop();
        popped.bridge.destroy();

        // ── Resume parent or signal empty ──
        const parent = this.top();
        if (parent) {
            parent.bridge.resume(savedAsset);
        }

        // ── Fade in ──
        this.sceneContainer.style.opacity = '1';
        await _sleep(150);
        this.sceneContainer.style.transition = '';

        this._notify(savedAsset);
    }

    /**
     * Pop all the way back to home (cancel everything).
     */
    async popAll() {
        while (this.stack.length > 0) {
            const entry = this.stack.pop();
            entry.bridge.destroy();
        }
        this._notify(null);
    }

    /**
     * Pop back to a specific depth (for breadcrumb navigation).
     * Everything above that depth is cancelled/destroyed.
     * @param {number} targetDepth — 0 = home, 1 = first bridge, etc.
     */
    async popTo(targetDepth) {
        // ── Fade out ──
        this.sceneContainer.style.transition = 'opacity 0.15s ease';
        this.sceneContainer.style.opacity = '0';
        await _sleep(150);

        while (this.stack.length > targetDepth) {
            const entry = this.stack.pop();
            entry.bridge.destroy();
        }

        const parent = this.top();
        if (parent) {
            parent.bridge.resume(null);
        }

        // ── Fade in ──
        this.sceneContainer.style.opacity = '1';
        await _sleep(150);
        this.sceneContainer.style.transition = '';

        this._notify(null);
    }

    /** @private Notify host of stack change. */
    _notify(savedAsset) {
        this._onStackChange({
            depth:      this.stack.length,
            label:      this.top()?.label || null,
            isEmpty:    this.stack.length === 0,
            savedAsset: savedAsset || null,
        });
    }
}

/** @private Simple sleep helper. */
function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
