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
 * Renders a centered modal over the current document with the DB32
 * palette. Clicking a swatch calls onPick(hex) and closes the modal.
 * ESC or clicking the backdrop also closes without picking.
 */

import { loadPalette } from './paletteLoader.js';

let _currentInstance = null;

export async function showColorPicker({ currentHex = '', title = 'Choose color', onPick = () => {} } = {}) {
    // Only one modal at a time
    if (_currentInstance) _currentInstance.close();

    const palette = await loadPalette();

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

    // Fade in
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const close = () => {
        backdrop.classList.remove('visible');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => backdrop.remove(), 150);
        _currentInstance = null;
    };

    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    // Close on backdrop click (but not card click)
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelector('.color-picker-close').addEventListener('click', close);

    // Pick a swatch
    backdrop.querySelectorAll('.color-picker-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            const hex = sw.dataset.hex;
            onPick(hex);
            close();
        });
    });

    _currentInstance = { close };
}
