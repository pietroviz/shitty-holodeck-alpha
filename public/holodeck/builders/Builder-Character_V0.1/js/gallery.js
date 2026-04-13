/**
 * gallery.js — Gallery list view for browsing saved characters.
 */

import { dbGetAll } from './db.js';

/**
 * Render the gallery list into a container element.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {string|null} options.activeId — Currently loaded character ID
 * @param {Function} options.onSelect — Click card → preview/load (stays in browse)
 * @param {Function} options.onEdit — Click edit btn → enter editing mode
 * @param {Function} options.onDelete — Click delete btn → confirm and delete
 */
export async function renderGallery(container, { activeId, onSelect, onEdit, onDelete, filter, categoryFilter }) {
    let assets = await dbGetAll();

    // Filter by category tag if provided
    if (categoryFilter) {
        const cat = categoryFilter.toLowerCase();
        assets = assets.filter(a => (a.tags || []).some(t => t.toLowerCase() === cat));
    }

    // Filter by name/tags if search term provided
    if (filter && filter.trim()) {
        const q = filter.trim().toLowerCase();
        assets = assets.filter(a => {
            const name = (a.name || '').toLowerCase();
            const tags = (a.tags || []).join(' ').toLowerCase();
            return name.includes(q) || tags.includes(q);
        });
    }

    container.innerHTML = '';

    if (assets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'gallery-empty';
        empty.textContent = 'No saved characters yet.';
        container.appendChild(empty);
        return assets.length;
    }

    for (const asset of assets) {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        if (asset.id === activeId) card.classList.add('active');
        card.dataset.id = asset.id;

        // Thumbnail
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb';
        if (asset.meta?.thumbnail) {
            thumb.style.backgroundImage = `url(${asset.meta.thumbnail})`;
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
        }
        card.appendChild(thumb);

        // Info
        const info = document.createElement('div');
        info.className = 'gallery-info';

        const name = document.createElement('div');
        name.className = 'gallery-name';
        name.textContent = asset.name || 'Untitled';
        info.appendChild(name);

        const date = document.createElement('div');
        date.className = 'gallery-date';
        date.textContent = formatDate(asset.meta?.modified);
        info.appendChild(date);

        // Tags
        if (asset.tags && asset.tags.length > 0) {
            const tags = document.createElement('div');
            tags.className = 'gallery-tags';
            tags.textContent = asset.tags.join(', ');
            info.appendChild(tags);
        }

        card.appendChild(info);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'gallery-actions';

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'gallery-action-btn gallery-edit-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit(asset);
        });
        actions.appendChild(editBtn);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'gallery-action-btn gallery-delete-btn';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${asset.name}"?`)) {
                onDelete(asset.id);
            }
        });
        actions.appendChild(delBtn);

        card.appendChild(actions);

        // Click card body → preview/load (stay in browse)
        card.addEventListener('click', () => {
            onSelect(asset);
        });

        container.appendChild(card);
    }

    return assets.length;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Capture a close-up portrait thumbnail of the character.
 * Temporarily repositions camera, renders at thumbnail size, then restores.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} size
 */
export function captureThumbnail(renderer, scene, camera, size = 128) {
    if (!scene || !camera) {
        // Fallback: grab center of current canvas
        const canvas = renderer.domElement;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = size;
        tmpCanvas.height = size;
        const ctx = tmpCanvas.getContext('2d');
        const srcSize = Math.min(canvas.width, canvas.height);
        ctx.drawImage(canvas, (canvas.width - srcSize) / 2, (canvas.height - srcSize) / 2, srcSize, srcSize, 0, 0, size, size);
        return tmpCanvas.toDataURL('image/png');
    }

    // Save original state
    const origPosX = camera.position.x, origPosY = camera.position.y, origPosZ = camera.position.z;
    const origAspect = camera.aspect;
    const canvas = renderer.domElement;
    const origW = canvas.width, origH = canvas.height;
    const origStyleW = canvas.style.width, origStyleH = canvas.style.height;

    // Portrait camera: close-up on head/shoulders
    camera.position.set(0, 1.35, 2.0);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 1.1, 0);

    // Render at thumbnail size
    renderer.setSize(size, size);
    renderer.render(scene, camera);

    // Capture
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = size;
    tmpCanvas.height = size;
    tmpCanvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    const dataUrl = tmpCanvas.toDataURL('image/png');

    // Restore everything
    const dpr = renderer.getPixelRatio();
    renderer.setSize(origW / dpr, origH / dpr);
    camera.position.set(origPosX, origPosY, origPosZ);
    camera.aspect = origAspect;
    camera.updateProjectionMatrix();

    return dataUrl;
}
