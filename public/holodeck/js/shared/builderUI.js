/**
 * builderUI.js — Shared UI helpers used across all builder bridges.
 *
 * Keeps the visual language consistent (subtitles + dice, flat File-tab
 * fields, unified surprise-dice handling) so that fixes and tweaks happen
 * in one place.
 */

const _esc = (s = '') =>
    String(s).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));

/**
 * Smoothly tween a Three.js camera + OrbitControls back to a target pose.
 * Returns a cancel function. Use this in each bridge's resetView().
 *
 *   import { tweenToPose } from '../shared/builderUI.js';
 *   resetView() {
 *       this._resetCancel?.();
 *       this._resetCancel = tweenToPose(this._camera, this._controls,
 *                                        this._initialCamPos, this._initialTarget);
 *   }
 */
export function tweenToPose(camera, controls, toPos, toTarget, durationMs = 500) {
    if (!camera || !controls || !toPos) return () => {};
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    const startTime = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    let raf = null;
    let cancelled = false;
    const step = (now) => {
        if (cancelled) return;
        const t = Math.min(1, (now - startTime) / durationMs);
        const e = ease(t);
        camera.position.lerpVectors(fromPos, toPos, e);
        controls.target.lerpVectors(fromTgt, toTarget, e);
        controls.update();
        if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); };
}

/** Single dice icon for Surprise buttons. */
export const DICE_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="3"/>
  <circle cx="8"  cy="8"  r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="16" cy="8"  r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="8"  cy="16" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
</svg>`;

/**
 * Subtitle row used as a group header in tabs. Pass a falsy `surpriseKey` to
 * omit the dice button (for static / read-only sections like the fixed Cast).
 *   <div class="cb-subtitle-row">
 *     <div class="cb-subtitle">TEXT</div>
 *     <button class="cb-field-surprise" data-surprise="key">🎲</button>   ← optional
 *   </div>
 */
export function renderSubtitle(text, surpriseKey) {
    const dice = surpriseKey
        ? `<button type="button" class="cb-field-surprise" data-surprise="${surpriseKey}"
               aria-label="Surprise me" title="Surprise me">${DICE_ICON}</button>`
        : '';
    return `
        <div class="cb-subtitle-row">
            <div class="cb-subtitle">${_esc(text)}</div>
            ${dice}
        </div>`;
}

/**
 * Per-field label row (label on left, dice on right). Used inside .cb-field
 * blocks for individual labeled inputs (e.g. File tab's Name/Description/Tags).
 */
export function renderFieldHead(label, surpriseKey) {
    return `
        <div class="cb-field-head">
            <div class="cb-label">${_esc(label)}</div>
            <button type="button" class="cb-field-surprise" data-surprise="${surpriseKey}"
                    aria-label="Surprise me" title="Surprise me">${DICE_ICON}</button>
        </div>`;
}

/**
 * Standard File tab markup: Name / Description / Tags, all with per-field
 * subtitles + dice in the unified flat .cb-field layout.
 *
 * options:
 *   namePlaceholder  - placeholder text for the name input
 *   descPlaceholder  - placeholder text for the description textarea
 *   tagsPlaceholder  - placeholder text for the tags input
 */
export function renderFileTab(asset, options = {}) {
    const namePh = options.namePlaceholder || 'Name…';
    const descPh = options.descPlaceholder || 'Describe this asset…';
    const tagsPh = options.tagsPlaceholder || 'e.g. tag1, tag2, tag3';
    const name = _esc(asset?.name || '');
    const desc = _esc(asset?.payload?.description || asset?.description || '');
    const tags = _esc((asset?.tags || []).join(', '));
    return `
        <div class="cb-field">
            ${renderFieldHead('Name', 'name')}
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="${_esc(namePh)}" maxlength="40">
        </div>
        <div class="cb-field">
            ${renderFieldHead('Description', 'description')}
            <textarea class="cb-desc-input" placeholder="${_esc(descPh)}"
                      rows="3" maxlength="200">${desc}</textarea>
        </div>
        <div class="cb-field">
            ${renderFieldHead('Tags', 'tags')}
            <input type="text" class="cb-tags-input"
                   value="${tags}" placeholder="${_esc(tagsPh)}" maxlength="100">
        </div>`;
}

/**
 * Wire the standard File tab inputs (Name / Description / Tags) and the
 * per-field Surprise dice. Bridges call this once after _renderPanel().
 *
 *   bridge: the bridge instance (uses bridge.asset, bridge._scheduleAutoSave,
 *           and optional bridge._onSurpriseField(key))
 *   panel:  the panel root element to query within
 *   options.formatType: payload.format value to set when creating the
 *                       payload object (e.g. 'character_state')
 */
export function wireFileTabEvents(panel, bridge, options = {}) {
    const formatType = options.formatType || `${bridge.asset?.type || 'asset'}_state`;

    panel.querySelector('.bridge-name-input')?.addEventListener('input', (e) => {
        if (bridge.asset) bridge.asset.name = e.target.value.trim();
        bridge._scheduleAutoSave?.();
    });

    panel.querySelector('.cb-desc-input')?.addEventListener('input', (e) => {
        if (!bridge.asset) return;
        if (!bridge.asset.payload) {
            bridge.asset.payload = {
                description: '',
                format: formatType,
                state: {},
                _editor: null,
            };
        }
        bridge.asset.payload.description = e.target.value;
        bridge._scheduleAutoSave?.();
    });

    panel.querySelector('.cb-tags-input')?.addEventListener('input', (e) => {
        if (!bridge.asset) return;
        bridge.asset.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
        bridge._scheduleAutoSave?.();
    });

    // File-tab Surprise dice are stubs until the building-intelligence layer
    // lands. Routes to bridge._onSurpriseField if defined; otherwise logs.
    panel.querySelectorAll('.cb-field-surprise[data-surprise]').forEach(btn => {
        const key = btn.dataset.surprise;
        if (key === 'name' || key === 'description' || key === 'tags') {
            btn.addEventListener('click', () => {
                if (bridge._onSurpriseField) bridge._onSurpriseField(key);
                else console.debug(`[${bridge.displayName || 'Builder'}] surprise "${key}" stub`);
            });
        }
    });
}
