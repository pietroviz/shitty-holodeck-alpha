/**
 * envScene.js — Build an environment (sky, ground, stage, walls, lights,
 * weather, stage props, ground objects) from an env asset into a THREE.Scene.
 *
 * Parity with EnvironmentBridge and previewRenderer: handles `state.props`
 * (PROP_A..E place/scatter/tile on stage, height-capped) and
 * `state.groundObjects` (scatter/tile on ground plane, height-capped, culled
 * inside the camera corridor), plus everything the V1 build already did
 * (sky, ground, stage, walls, lights, orb, fog, weather).
 *
 * Returns { group, walls, weather, tick, dispose, ready }.
 *   - group    — env group added to scene; caller doesn't need to re-add
 *   - walls    — { back, front, left, right } sub-groups for dynamic culling
 *   - weather  — { points, vels, type, hasWalls } or null
 *   - tick(delta, camera) — advance weather + cull walls + cull tall ground objects
 *   - dispose() — remove everything from the scene and free GPU memory
 *   - ready    — Promise that resolves when async props + ground objects finish
 *                loading (the env is usable before this settles; the promise
 *                is just there if a caller wants to wait).
 */

import * as THREE from 'three';
import {
    STAGE_SIZE,
    cellToWorld as _cellToWorld,
    inCameraCorridor as _inCameraCorridor,
} from './envGeometry.js?v=2';

const WALL_THICK  = 0.25;
const SKY_RADIUS  = 50;
const ORB_RANGE   = 9;

const WEATHER_COUNT  = 500;
const WEATHER_SPREAD = 14;
const WEATHER_HEIGHT = 12;
const WEATHER_CFG = {
    snow:   { speed: 0.8, drift: 0.4, size: 0.08, color: 0xffffff, opacity: 0.9 },
    rain:   { speed: 7.0, drift: 0.1, size: 0.03, color: 0x88aacc, opacity: 0.5 },
    leaves: { speed: 1.2, drift: 0.8, size: 0.12, color: 0xffffff, opacity: 0.95 },
};

// Stage + ground scatter/tile constants — must match EnvironmentBridge.
const PROP_HEIGHT_CAP        = 0.6;
const GROUND_OBJ_HEIGHT_CAP  = 1.5;
const SCATTER_COUNTS         = { low: 6, med: 14, high: 28 };
const TILE_SPACING           = { low: 3.5, med: 2.5, high: 1.8 };
const STAGE_SCATTER_COUNTS   = { low: 3, med: 6, high: 10 };
const STAGE_TILE_SPACING     = { low: 2.0, med: 1.4, high: 1.0 };

// Camera corridor (_inCameraCorridor) and BINGO grid (_cellToWorld) live in
// shared/envGeometry.js, imported above. Single source of truth for the grid.

// ── Object asset fetch / manifest list (module-level caches) ──
let _OBJECT_LIST = null;
async function _loadObjectList() {
    if (_OBJECT_LIST) return _OBJECT_LIST;
    try {
        const res = await fetch('global_assets/objects/manifest.json');
        const manifest = await res.json();
        const list = [];
        const skip = new Set(['headwear', 'items', 'panels', 'fashion']);
        for (const [catKey, cat] of Object.entries(manifest.categories)) {
            if (skip.has(catKey)) continue;
            for (const file of cat.files) {
                const id = file.replace('.json', '');
                list.push({ id, path: `global_assets/objects/${catKey}/${file}` });
            }
        }
        _OBJECT_LIST = list;
    } catch { _OBJECT_LIST = []; }
    return _OBJECT_LIST;
}

const _assetCache = new Map();
async function _fetchAsset(path) {
    if (_assetCache.has(path)) return _assetCache.get(path);
    const res  = await fetch(path);
    const data = await res.json();
    _assetCache.set(path, data);
    return data;
}

/** Build a Three.js Group from an object asset's element list. Bottom at y=0. */
function _buildMeshFromAsset(asset) {
    const elements = asset?.payload?._editor?.elements;
    if (!elements || !elements.length) return null;
    const colors = asset.payload.color_assignments || {};

    const group = new THREE.Group();
    for (const el of elements) {
        let geom;
        switch (el.type) {
            case 'box':
                geom = new THREE.BoxGeometry(el.width || 1, el.height || 1, el.depth || 1); break;
            case 'cylinder':
                geom = new THREE.CylinderGeometry(
                    el.radiusTop ?? 0.5, el.radiusBottom ?? 0.5, el.height || 1, 16); break;
            case 'cone':
                geom = new THREE.ConeGeometry(el.radius ?? 0.5, el.height || 1, 16); break;
            case 'sphere':
                geom = new THREE.SphereGeometry(el.radius ?? 0.5, 16, 12); break;
            case 'torus':
                geom = new THREE.TorusGeometry(el.radius ?? 0.5, el.tube ?? 0.2, 12, 24); break;
            default:
                geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }
        const hex = (typeof el.fill === 'string' && colors[el.fill])
            ? colors[el.fill] : (el.fill || '#888888');
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            roughness: el.roughness ?? 0.85,
            metalness: el.metalness ?? 0,
            transparent: (el.opacity ?? 1) < 1,
            opacity: el.opacity ?? 1,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(el.px || 0, el.py || 0, el.pz || 0);
        mesh.rotation.set(el.rx || 0, el.ry || 0, el.rz || 0);
        mesh.castShadow = true;
        group.add(mesh);
    }
    const box3 = new THREE.Box3().setFromObject(group);
    if (box3.min.y !== 0) group.children.forEach(c => { c.position.y -= box3.min.y; });
    group.userData._templateHeight = box3.max.y - box3.min.y;
    return group;
}

function _disposeGroup(g) {
    g.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
        else child.material?.dispose?.();
    });
}

function _stageScatterPoints(count, usedCells) {
    const pts = [];
    let tries = 0;
    while (pts.length < count && tries < count * 20) {
        const x = (Math.random() - 0.5) * STAGE_SIZE;
        const z = (Math.random() - 0.5) * STAGE_SIZE;
        tries++;
        let blocked = false;
        for (const c of usedCells) {
            const p = _cellToWorld(c);
            if (p && Math.abs(x - p.x) < 0.4 && Math.abs(z - p.z) < 0.4) { blocked = true; break; }
        }
        if (blocked) continue;
        pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
    }
    return pts;
}

function _stageTilePoints(spacing, usedCells) {
    const half = STAGE_SIZE / 2;
    const pts = [];
    for (let x = -half + spacing / 2; x < half; x += spacing) {
        for (let z = -half + spacing / 2; z < half; z += spacing) {
            let blocked = false;
            for (const c of usedCells) {
                const p = _cellToWorld(c);
                if (p && Math.abs(x - p.x) < 0.4 && Math.abs(z - p.z) < 0.4) { blocked = true; break; }
            }
            if (blocked) continue;
            pts.push({ x, z, rotY: 0 });
        }
    }
    return pts;
}

function _groundScatterPoints(halfGround, count, stageHalf) {
    const pts = [];
    let tries = 0;
    while (pts.length < count && tries < count * 20) {
        const x = (Math.random() - 0.5) * halfGround * 2;
        const z = (Math.random() - 0.5) * halfGround * 2;
        tries++;
        if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
        if (_inCameraCorridor(x, z, stageHalf)) continue;
        pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
    }
    return pts;
}

function _groundTilePoints(halfGround, spacing, stageHalf) {
    const pts = [];
    for (let x = -halfGround + spacing / 2; x < halfGround; x += spacing) {
        for (let z = -halfGround + spacing / 2; z < halfGround; z += spacing) {
            if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
            if (_inCameraCorridor(x, z, stageHalf)) continue;
            pts.push({ x, z, rotY: 0 });
        }
    }
    return pts;
}

function _cullGroundObjects(meshes, camera) {
    if (!meshes || !meshes.length) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const camLen = Math.sqrt(cx * cx + cz * cz) || 1;
    const cnx = cx / camLen, cnz = cz / camLen;
    const cosThr   = Math.cos(Math.PI * 2 / 9);
    const stageHalf = STAGE_SIZE / 2 + 0.5;
    const heightThr = 0.8;
    for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const ox = m.position.x, oz = m.position.z;
        const oLen = Math.sqrt(ox * ox + oz * oz);
        if (oLen < stageHalf) { m.visible = true; continue; }
        const worldH = m.userData._worldHeight || 0;
        if (worldH < heightThr) { m.visible = true; continue; }
        const dot = (ox * cnx + oz * cnz) / (oLen || 1);
        m.visible = dot <= cosThr;
    }
}

function _tinted(hex) {
    const c = new THREE.Color(hex);
    c.lerp(new THREE.Color(0xffffff), 0.5);
    return c;
}

function _buildSkySphere(skyTop, skyMid, skyBot) {
    const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const top = new THREE.Color(skyTop);
    const mid = new THREE.Color(skyMid);
    const bot = new THREE.Color(skyBot);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = y / SKY_RADIUS;
        const k = Math.pow(Math.abs(t), 1.7);
        const color = t >= 0 ? mid.clone().lerp(top, k) : mid.clone().lerp(bot, k);
        colors[i * 3]     = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.renderOrder = -1;
    return sphere;
}

function _buildWalls(state) {
    const h = state.walls || 0;
    if (h === 0) return null;

    const group = new THREE.Group();
    const t     = WALL_THICK;
    const W     = STAGE_SIZE;
    const halfW = W / 2;
    const SILL = 0.5, LINT = 0.5, SIDE = 0.5, GUT = 0.25;

    const style = state.windowStyle || 'none';
    const count = style === 'single' ? 1 : style === 'double' ? 2 : style === 'triple' ? 3 : 0;
    const hasWindows = count > 0 && h >= 2;
    const winH = Math.max(0, h - SILL - LINT);

    const wallMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.wallColor || '#696a6a'),
        roughness: 0.85,
    });
    const paneMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.windowColor || '#8ec8f0'),
        roughness: 0.3, metalness: 0.1,
        transparent: true,
        opacity: state.windowOpacity ?? 0.25,
        side: THREE.DoubleSide,
    });

    let winW = 0;
    const winCentres = [];
    if (hasWindows) {
        const interiorW = W - SIDE * 2;
        winW = (interiorW - (count - 1) * GUT) / count;
        let x = -halfW + SIDE + winW / 2;
        for (let i = 0; i < count; i++) { winCentres.push(x); x += winW + GUT; }
    }

    const walls = {};
    const buildWall = (origin, isVertical, name) => {
        const sub = new THREE.Group();
        sub.name = name;
        sub.position.copy(origin);
        const addSlab = (along, y, width, height, isPane = false) => {
            const depth = isPane ? t * 0.3 : t;
            const geom = isVertical
                ? new THREE.BoxGeometry(depth, height, width)
                : new THREE.BoxGeometry(width, height, depth);
            const m = new THREE.Mesh(geom, isPane ? paneMat : wallMat);
            if (isVertical) m.position.set(0, y, along);
            else            m.position.set(along, y, 0);
            sub.add(m);
        };
        if (!hasWindows) {
            addSlab(0, h / 2, W, h);
        } else {
            addSlab(0, SILL / 2,      W, SILL);
            addSlab(0, h - LINT / 2,  W, LINT);
            const pillarY = SILL + winH / 2;
            addSlab(-halfW + SIDE / 2, pillarY, SIDE, winH);
            addSlab( halfW - SIDE / 2, pillarY, SIDE, winH);
            for (let i = 0; i < winCentres.length - 1; i++) {
                const mid = (winCentres[i] + winCentres[i + 1]) / 2;
                addSlab(mid, pillarY, GUT, winH);
            }
            for (const cx of winCentres) {
                addSlab(cx, pillarY, winW * 0.98, winH * 0.98, true);
            }
        }
        group.add(sub);
        walls[name] = sub;
    };

    buildWall(new THREE.Vector3(0, 0, -halfW - t / 2), false, 'back');
    buildWall(new THREE.Vector3(0, 0,  halfW + t / 2), false, 'front');
    buildWall(new THREE.Vector3(-halfW - t / 2, 0, 0), true,  'left');
    buildWall(new THREE.Vector3( halfW + t / 2, 0, 0), true,  'right');

    return { group, walls, wallMat, paneMat };
}

function _buildWeather(type, hasWalls) {
    const cfg = WEATHER_CFG[type];
    if (!cfg) return null;
    const count = WEATHER_COUNT;
    const positions = new Float32Array(count * 3);
    const vels      = new Float32Array(count * 3);
    const stageHalf = STAGE_SIZE / 2;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let x, z;
        do {
            x = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
            z = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
        } while (hasWalls && Math.abs(x) < stageHalf && Math.abs(z) < stageHalf);
        positions[i3]     = x;
        positions[i3 + 1] = Math.random() * WEATHER_HEIGHT;
        positions[i3 + 2] = z;
        const vary = 0.7 + Math.random() * 0.6;
        vels[i3]     = (Math.random() - 0.5) * cfg.drift;
        vels[i3 + 1] = -cfg.speed * vary;
        vels[i3 + 2] = (Math.random() - 0.5) * cfg.drift;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (type === 'leaves') {
        const colors = new Float32Array(count * 3);
        const palette = [
            new THREE.Color(0x88aa44), new THREE.Color(0x669933),
            new THREE.Color(0xbbaa33), new THREE.Color(0xcc8833), new THREE.Color(0xaa5522),
        ];
        for (let i = 0; i < count; i++) {
            const c = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3]     = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    const mat = new THREE.PointsMaterial({
        size: cfg.size,
        color: type === 'leaves' ? 0xffffff : cfg.color,
        vertexColors: type === 'leaves',
        transparent: true, opacity: cfg.opacity,
        depthWrite: false, sizeAttenuation: true, fog: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, vels, type, hasWalls, geo, mat };
}

function _tickWeather(w, delta) {
    const arr   = w.points.geometry.attributes.position.array;
    const vels  = w.vels;
    const count = w.points.geometry.attributes.position.count;
    const stageH = STAGE_SIZE / 2;
    const drift = WEATHER_CFG[w.type]?.drift || 0;
    const time  = performance.now() * 0.001;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        arr[i3]     += vels[i3]     * delta;
        arr[i3 + 1] += vels[i3 + 1] * delta;
        arr[i3 + 2] += vels[i3 + 2] * delta;
        if (w.type !== 'rain') {
            arr[i3]     += Math.sin(time + i * 0.37) * drift * 0.3 * delta;
            arr[i3 + 2] += Math.cos(time + i * 0.53) * drift * 0.3 * delta;
        }
        const y = arr[i3 + 1], x = arr[i3], z = arr[i3 + 2];
        const outOfBounds = y < 0 || Math.abs(x) > WEATHER_SPREAD || Math.abs(z) > WEATHER_SPREAD;
        const insideWalls = w.hasWalls && Math.abs(x) < stageH && Math.abs(z) < stageH;
        if (outOfBounds || insideWalls) {
            let nx, nz;
            do {
                nx = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
                nz = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
            } while (w.hasWalls && Math.abs(nx) < stageH && Math.abs(nz) < stageH);
            arr[i3]     = nx;
            arr[i3 + 1] = WEATHER_HEIGHT + Math.random() * 2;
            arr[i3 + 2] = nz;
        }
    }
    w.points.geometry.attributes.position.needsUpdate = true;
}

function _cullWalls(walls, camera) {
    if (!walls) return;
    const cx = camera.position.x, cz = camera.position.z;
    const ax = Math.abs(cx), az = Math.abs(cz);
    walls.back.visible = walls.front.visible = walls.left.visible = walls.right.visible = true;
    const ratio = Math.max(ax, az) / (Math.min(ax, az) + 0.001);
    if (ratio > 2.5) {
        if (ax > az) { if (cx > 0) walls.right.visible = false; else walls.left.visible = false; }
        else         { if (cz > 0) walls.front.visible = false; else walls.back.visible  = false; }
    } else {
        if (cx > 0) walls.right.visible = false; else walls.left.visible = false;
        if (cz > 0) walls.front.visible = false; else walls.back.visible = false;
    }
}

/**
 * Build an environment scene from an env asset.
 * @param {THREE.Scene} scene — the scene to add lights, fog, and env group to
 * @param {Object} asset — env asset with payload.state
 * @returns {{ group, walls, weather, tick, dispose }}
 */
export function buildEnvScene(scene, asset) {
    const p = asset?.payload || {};
    const s = p.state || {};
    const group = new THREE.Group();
    group.name = `env_${asset?.id || 'unknown'}`;

    const addedToScene = [];   // lights, fog
    const disposables  = [];

    // ── Sky sphere ──
    const skyTop = s.skyTop || '#4a5870';
    const skyMid = s.skyMid || s.skyTop || '#8497ac';
    let skyBot = s.skyBot;
    if (!skyBot) {
        const m = new THREE.Color(skyMid);
        skyBot = '#' + m.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString();
    }
    const sky = _buildSkySphere(skyTop, skyMid, skyBot);
    group.add(sky);
    disposables.push(sky.geometry, sky.material);

    // ── Ground slab ──
    const groundSize = s.groundSize ?? 19;
    const groundMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.groundColor || '#4b692f'),
        roughness: 0.95, metalness: 0,
    });
    const groundGeo = new THREE.BoxGeometry(groundSize, 1, groundSize);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    group.add(ground);
    disposables.push(groundGeo, groundMat);

    // ── Stage plane ──
    const stageMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.stageColor || '#595652'),
        roughness: 0.85,
    });
    const stageGeo = new THREE.PlaneGeometry(STAGE_SIZE, STAGE_SIZE);
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = 0.002;
    stage.receiveShadow = true;
    group.add(stage);
    disposables.push(stageGeo, stageMat);

    // ── World grid ──
    const worldGrid = new THREE.GridHelper(groundSize, groundSize, 0x2F2F2F, 0x2F2F2F);
    worldGrid.material.opacity = 0.3;
    worldGrid.material.transparent = true;
    worldGrid.position.y = 0.004;
    group.add(worldGrid);
    disposables.push(worldGrid.geometry, worldGrid.material);

    // ── Walls ──
    const wallsBundle = _buildWalls(s);
    let walls = null;
    if (wallsBundle) {
        group.add(wallsBundle.group);
        walls = wallsBundle.walls;
        disposables.push(wallsBundle.wallMat, wallsBundle.paneMat);
    }

    // ── Lighting ──
    const ambient = new THREE.AmbientLight(
        _tinted(s.ambientColor || '#ffffff'),
        s.ambientIntensity ?? 1.2,
    );
    scene.add(ambient);
    addedToScene.push(ambient);

    const dir = new THREE.DirectionalLight(
        _tinted(s.dirColor || '#ffffff'),
        s.dirIntensity ?? 0.4,
    );
    const elev = (s.sunElevation ?? 60) * Math.PI / 180;
    const lightDist = 10;
    dir.position.set(
        lightDist * Math.cos(elev) * 0.9,
        lightDist * Math.sin(elev) + 2,
        lightDist * Math.cos(elev) * 0.5,
    );
    scene.add(dir);
    addedToScene.push(dir);

    // ── Sun orb ──
    if (s.sunVisible) {
        const sunGeo = new THREE.SphereGeometry(1.5, 16, 12);
        const sunMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(s.sunColor || '#ffffee'), fog: false,
        });
        const sun = new THREE.Mesh(sunGeo, sunMat);
        const orbDist = 35;
        sun.position.set(
            -orbDist * Math.cos(elev) * 0.7,
             orbDist * Math.sin(elev),
            -orbDist * Math.cos(elev) * 0.7,
        );
        group.add(sun);
        disposables.push(sunGeo, sunMat);
    }

    // ── Floating orb light ──
    if (s.orbVisible) {
        const color = new THREE.Color(s.orbColor || '#ffddaa');
        const pt = new THREE.PointLight(color, s.orbIntensity ?? 1.4, ORB_RANGE, 2);
        const h = Math.min(3.0, Math.max(1.0, s.orbHeight ?? 2.0));
        pt.position.set(0, h, 0);
        scene.add(pt);
        addedToScene.push(pt);
        const orbGeo = new THREE.SphereGeometry(0.18, 16, 12);
        const orbMat = new THREE.MeshBasicMaterial({ color: color.clone(), fog: false });
        const orbMesh = new THREE.Mesh(orbGeo, orbMat);
        orbMesh.position.set(0, h, 0);
        group.add(orbMesh);
        disposables.push(orbGeo, orbMat);
    }

    // ── Fog ──
    let appliedFog = false;
    if (s.fogEnabled) {
        scene.fog = new THREE.FogExp2(s.fogColor || '#888888', s.fogDensity ?? 0.02);
        appliedFog = true;
    }

    // ── Weather ──
    let weather = null;
    if (s.weather && s.weather !== 'none') {
        const hasWalls = (s.walls || 0) > 0;
        weather = _buildWeather(s.weather, hasWalls);
        if (weather) group.add(weather.points);
    }

    scene.add(group);

    // ── Async stage props + ground objects ──
    // Each prop/ground slot references an object asset that lives in its own
    // JSON file; we can't build those synchronously. The env scene is usable
    // immediately (sky/stage/walls/lights) and dressing settles in later.
    const propMeshes   = [];
    const groundMeshes = [];
    let   cancelled    = false;

    const ready = (async () => {
        const list = await _loadObjectList();
        if (cancelled) return;

        const usedCells = new Set(
            (s.cast || []).filter(c => c?.cell).map(c => c.cell)
        );

        // ── Props on stage ──
        for (const slot of (s.props || [])) {
            if (cancelled) return;
            if (!slot.assetId || slot.assetId === 'none') continue;
            const entry = list.find(o => o.id === slot.assetId);
            if (!entry) continue;

            let asset;
            try { asset = await _fetchAsset(entry.path); } catch { continue; }
            if (cancelled) return;

            const template = _buildMeshFromAsset(asset);
            if (!template) continue;

            const baseScale = slot.scale ?? 1.0;
            const templateH = template.userData._templateHeight || 1;

            if (slot.mode === 'place') {
                if (!slot.cell) { _disposeGroup(template); continue; }
                const pos = _cellToWorld(slot.cell);
                if (!pos)       { _disposeGroup(template); continue; }
                const clone = template.clone();
                clone.position.set(pos.x, 0, pos.z);
                clone.rotation.y = Math.random() * Math.PI * 2;
                let sc = baseScale;
                if (templateH * sc > PROP_HEIGHT_CAP) sc = PROP_HEIGHT_CAP / templateH;
                clone.scale.set(sc, sc, sc);
                group.add(clone);
                propMeshes.push(clone);
            } else {
                const points = slot.mode === 'tile'
                    ? _stageTilePoints(STAGE_TILE_SPACING[slot.density] ?? 1.4, usedCells)
                    : _stageScatterPoints(STAGE_SCATTER_COUNTS[slot.density] ?? 6, usedCells);
                const isScatter = slot.mode !== 'tile';
                for (const pt of points) {
                    const clone = template.clone();
                    clone.position.set(pt.x, 0, pt.z);
                    clone.rotation.y = pt.rotY;
                    let sc = isScatter ? baseScale * (0.7 + Math.random() * 0.6) : baseScale;
                    if (templateH * sc > PROP_HEIGHT_CAP) sc = PROP_HEIGHT_CAP / templateH;
                    clone.scale.set(sc, sc, sc);
                    group.add(clone);
                    propMeshes.push(clone);
                }
            }
            _disposeGroup(template);
        }

        // ── Ground objects ──
        const groundHalf = (s.groundSize ?? 19) / 2;
        const stageBuf   = STAGE_SIZE / 2 + 0.5;

        for (const slot of (s.groundObjects || [])) {
            if (cancelled) return;
            if (!slot.assetId || slot.assetId === 'none') continue;
            const entry = list.find(o => o.id === slot.assetId);
            if (!entry) continue;

            let asset;
            try { asset = await _fetchAsset(entry.path); } catch { continue; }
            if (cancelled) return;

            const template = _buildMeshFromAsset(asset);
            if (!template) continue;

            const points = slot.mode === 'tile'
                ? _groundTilePoints(groundHalf, TILE_SPACING[slot.density] ?? 2.5, stageBuf)
                : _groundScatterPoints(groundHalf, SCATTER_COUNTS[slot.density] ?? 14, stageBuf);

            const baseScale = slot.scale ?? 1.0;
            const isScatter = slot.mode !== 'tile';
            const templateH = template.userData._templateHeight || 1;
            for (const pt of points) {
                const clone = template.clone();
                clone.position.set(pt.x, 0, pt.z);
                clone.rotation.y = pt.rotY;
                let sc = isScatter ? baseScale * (0.7 + Math.random() * 0.6) : baseScale;
                if (templateH * sc > GROUND_OBJ_HEIGHT_CAP) sc = GROUND_OBJ_HEIGHT_CAP / templateH;
                clone.scale.set(sc, sc, sc);
                clone.userData._worldHeight = templateH * sc;
                group.add(clone);
                groundMeshes.push(clone);
            }
            _disposeGroup(template);
        }
    })();

    function tick(delta, camera) {
        if (weather)           _tickWeather(weather, delta);
        if (walls && camera)   _cullWalls(walls, camera);
        if (camera && groundMeshes.length) _cullGroundObjects(groundMeshes, camera);
    }

    function dispose() {
        cancelled = true;
        if (weather) {
            weather.geo?.dispose?.();
            weather.mat?.dispose?.();
        }
        for (const m of propMeshes)   _disposeGroup(m);
        for (const m of groundMeshes) _disposeGroup(m);
        for (const d of disposables) d?.dispose?.();
        for (const obj of addedToScene) scene.remove(obj);
        if (appliedFog) scene.fog = null;
        if (group.parent) group.parent.remove(group);
    }

    return { group, walls, weather, tick, dispose, ready };
}
