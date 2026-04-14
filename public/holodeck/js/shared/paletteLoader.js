/**
 * paletteLoader.js — Shared DawnBringer 32-colour palette loader.
 *
 * Used by CharacterBridge, ObjectBridge, ImageBridge, and any future
 * builder that needs the DB32 swatch palette for color picking.
 */

let _db32Colors = null;

/**
 * Load the DawnBringer 32 palette.
 * @returns {Promise<Array<{index:number, hex:string, name:string}>>}
 */
export async function loadPalette() {
    if (_db32Colors) return _db32Colors;
    try {
        const resp = await fetch('global_assets/pallettes/db32.json');
        const data = await resp.json();
        _db32Colors = data.colors;
    } catch {
        // Fallback hardcoded DB32
        _db32Colors = [
            '#000000','#222034','#45283c','#663931','#8f563b','#df7126','#d9a066','#eec39a',
            '#fbf236','#99e550','#6abe30','#37946e','#4b692f','#524b24','#323c39','#3f3f74',
            '#306082','#5b6ee1','#639bff','#5fcde4','#cbdbfc','#ffffff','#9badb7','#847e87',
            '#696a6a','#595652','#76428a','#ac3232','#d95763','#d77bba','#8f974a','#8a6f30',
        ].map((hex, i) => ({ index: i, hex, name: '' }));
    }
    return _db32Colors;
}

/**
 * Render the DB32 swatch grid HTML.
 * @param {Array} palette — array from loadPalette()
 * @returns {string} HTML string of swatch buttons
 */
export function paletteGridHtml(palette) {
    if (!palette) return '';
    return palette.map(c =>
        `<button class="cb-pal-swatch" data-hex="${c.hex}"
                 title="${c.name || ''}" style="background:${c.hex};"></button>`
    ).join('');
}
