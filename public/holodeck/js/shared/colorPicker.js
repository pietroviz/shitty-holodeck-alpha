/**
 * colorPicker.js — Shared DB32 color picker modal.
 *
 * Usage:
 *   import { showColorPicker } from '../shared/colorPicker.js';
 *   showColorPicker({
 *       currentHex: '#4b692f',
 *       title: 'Ground Color',
 *       onPick: (hex) => { ... },
 *   });
 *
 * By default the modal overlays just the left panel (#left-panel)
 * so the 3D viewport stays visible behind it. Pass `targetSelector`
 * to overlay a different element. The modal repositions itself if
 * the window is resized while open.
 */

import { loadPalette } from './paletteLoader.js';

let _currentInstance = null;

export async function showColorPicker({
    currentHex = '',
    title = 'Choose color',
    onPick = () => {},
    targetSelector = '#left-panel',
} = {}) {
    if (_currentInstance) _currentInstance.close();

    const palette = await loadPalette();
    const target = document.querySelector(targetSelector) || document.body;

    const backdrop = document.createElement('div');
    backdrop.className = 'color-picker-backdrop';
    backdrop.innerHTML = `
        <div class="color-picker-card" role="dialog" aria-modal="true" aria-label="${title}">
            <div class="color-picker-head">
                <span class="color-picker-title">${title}</span>
                <button class="color-picker-close" aria-label="Close">&times;</button>
            </div>
            <div class="color-picker-grid">
                ${palette.map(c => {
                    const sel = c.hex.toLowerCase() === (currentHex || '').toLowerCase();
                    return `<button type="button" class="color-picker-swatch ${sel ? 'selected' : ''}"
                                data-hex="${c.hex}" title="${c.name || c.hex}"
                                style="background:${c.hex};"></button>`;
                }).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    // Position the backdrop over the target element only (not full screen).
    const place = () => {
        const r = target.getBoundingClientRect();
        backdrop.style.left   = r.left + 'px';
        backdrop.style.top    = r.top + 'px';
        backdrop.style.width  = r.width + 'px';
        backdrop.style.height = r.height + 'px';
    };
    place();

    // Reposition if the window resizes (e.g. orientation change on mobile).
    const onResize = () => place();
    window.addEventListener('resize', onResize);

    // Fade in
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const close = () => {
        backdrop.classList.remove('visible');
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        setTimeout(() => backdrop.remove(), 150);
        _currentInstance = null;
    };

    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelector('.color-picker-close').addEventListener('click', close);

    backdrop.querySelectorAll('.color-picker-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            const hex = sw.dataset.hex;
            onPick(hex);
            close();
        });
    });

    _currentInstance = { close };
}
