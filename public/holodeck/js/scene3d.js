import * as THREE from 'three';
import { Line2 }        from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

/**
 * Scene3D — Three.js viewport with orbit + pan + zoom controls.
 * Matches the Figma Make reference:
 *   - Mid-grey background (#5A5A5A)
 *   - 21×21 world-unit GridHelper
 *   - Floating grey cube
 *   - 5×5 thick perimeter outline (Line2, linewidth 3) + inner grid
 *   - Mouse: left-drag=orbit, right-drag=pan, wheel=zoom
 *   - Touch: 1-finger=orbit, 2-finger=pinch/pan
 */
export class Scene3D {
    constructor(container) {
        this.container = container;
        this.disabled  = false;

        this._camDist = 0;
        this._theta   = 0;
        this._phi     = 0;
        this._target  = new THREE.Vector3(0, 0, 0);

        this._init();
    }

    _init() {
        const c = this.container;

        /* ── Scene ─────────────────────────────────────── */
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x5A5A5A);

        /* ── Camera ────────────────────────────────────── */
        const camera = new THREE.PerspectiveCamera(50, c.clientWidth / c.clientHeight, 0.1, 1000);
        camera.position.set(5.2, 3.9, 5.2);
        camera.lookAt(0, 0, 0);
        this.camera = camera;

        const cx = 5.2, cy = 3.9, cz = 5.2;
        this._camDist = Math.sqrt(cx*cx + cy*cy + cz*cz);
        this._theta   = Math.atan2(cx, cz);
        this._phi     = Math.acos(cy / this._camDist);

        /* ── Renderer ──────────────────────────────────── */
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(c.clientWidth, c.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        c.appendChild(renderer.domElement);
        this.renderer = renderer;

        /* ── World grid ────────────────────────────────── */
        const gridHelper = new THREE.GridHelper(21, 21, 0x2F2F2F, 0x2F2F2F);
        gridHelper.material.opacity     = 0.3;
        gridHelper.material.transparent = true;
        scene.add(gridHelper);

        /* ── Floating cube ─────────────────────────────── */
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x6F6F6F })
        );
        cube.position.set(0, 0.75, 0);
        scene.add(cube);

        /* ── 5×5 perimeter outline (thick via Line2) ───── */
        const perimPositions = [
            -2.5, 0.01, -2.5,
             2.5, 0.01, -2.5,
             2.5, 0.01,  2.5,
            -2.5, 0.01,  2.5,
            -2.5, 0.01, -2.5,   // close the loop
        ];
        const perimGeo = new LineGeometry();
        perimGeo.setPositions(perimPositions.flat());
        const perimMat = new LineMaterial({
            color: 0xC8C8C8,
            linewidth: 3,
            resolution: new THREE.Vector2(c.clientWidth, c.clientHeight),
        });
        const perimLine = new Line2(perimGeo, perimMat);
        perimLine.computeLineDistances();
        scene.add(perimLine);
        this._perimMat = perimMat;

        /* ── Inner 5×5 grid lines ──────────────────────── */
        const innerMat = new THREE.LineBasicMaterial({
            color: 0xB0B0B0, opacity: 0.4, transparent: true,
        });
        for (let i = -1.5; i <= 1.5; i += 1) {
            scene.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(i,    0.01, -2.5),
                    new THREE.Vector3(i,    0.01,  2.5),
                ]), innerMat
            ));
            scene.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-2.5, 0.01, i),
                    new THREE.Vector3( 2.5, 0.01, i),
                ]), innerMat
            ));
        }

        /* ── Lights ────────────────────────────────────── */
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        this.scene = scene;

        /* ── Mouse controls ────────────────────────────── */
        let isDrag = false, isPan = false;
        let prev = { x: 0, y: 0 };
        const ROT = 0.005, PAN = 0.01;
        const el = renderer.domElement;

        // Grab cursor feedback
        el.style.cursor = 'default';

        el.addEventListener('mouseenter', () => {
            if (!this.disabled) el.style.cursor = 'grab';
        });
        el.addEventListener('mouseleave', () => {
            el.style.cursor = 'default';
            isDrag = false; isPan = false;
        });

        el.addEventListener('mousedown', (e) => {
            if (this.disabled) return;
            prev = { x: e.clientX, y: e.clientY };
            if (e.button === 0) { isDrag = true; el.style.cursor = 'grabbing'; }
            if (e.button === 2) { isPan  = true; el.style.cursor = 'move';     e.preventDefault(); }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.disabled || (!isDrag && !isPan)) return;
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            prev = { x: e.clientX, y: e.clientY };

            if (isDrag) {
                this._theta -= dx * ROT;
                this._phi    = Math.max(0.01, Math.min(Math.PI - 0.01, this._phi - dy * ROT));
            } else if (isPan) {
                this._applyPan(dx, dy, PAN);
            }
            this._updateCamera();
        });

        window.addEventListener('mouseup', () => {
            isDrag = false; isPan = false;
            el.style.cursor = 'grab';
        });

        el.addEventListener('contextmenu', e => e.preventDefault());

        el.addEventListener('wheel', (e) => {
            if (this.disabled) return;
            e.preventDefault();
            this._camDist = Math.max(1, Math.min(100, this._camDist + e.deltaY * 0.1));
            this._updateCamera();
        }, { passive: false });

        /* ── Touch controls ────────────────────────────── */
        // 1 finger  → orbit
        // 2 fingers → pinch = zoom, drag = pan (both simultaneously)
        let touches       = [];
        let lastPinchDist = 0;
        let lastMidpoint  = { x: 0, y: 0 };

        el.addEventListener('touchstart', (e) => {
            if (this.disabled) return;
            e.preventDefault();
            touches = Array.from(e.touches);
            if (touches.length === 1) {
                prev = { x: touches[0].clientX, y: touches[0].clientY };
                isDrag = true; isPan = false;
            } else if (touches.length >= 2) {
                isDrag = false;
                lastPinchDist = this._touchDist(touches[0], touches[1]);
                lastMidpoint  = this._touchMid(touches[0], touches[1]);
            }
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            if (this.disabled) return;
            e.preventDefault();
            touches = Array.from(e.touches);

            if (touches.length === 1 && isDrag) {
                const dx = touches[0].clientX - prev.x;
                const dy = touches[0].clientY - prev.y;
                prev = { x: touches[0].clientX, y: touches[0].clientY };
                this._theta -= dx * ROT;
                this._phi    = Math.max(0.01, Math.min(Math.PI - 0.01, this._phi - dy * ROT));
                this._updateCamera();
            } else if (touches.length >= 2) {
                // Pinch → zoom
                const d    = this._touchDist(touches[0], touches[1]);
                const zoom = lastPinchDist - d;
                this._camDist = Math.max(1, Math.min(100, this._camDist + zoom * 0.05));
                lastPinchDist = d;

                // 2-finger drag → pan  (same as right-click drag on desktop)
                const mid = this._touchMid(touches[0], touches[1]);
                const pdx = mid.x - lastMidpoint.x;
                const pdy = mid.y - lastMidpoint.y;
                lastMidpoint = mid;
                this._applyPan(pdx, pdy, PAN);

                this._updateCamera();
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            touches = Array.from(e.touches);
            isDrag = false; isPan = false;
            if (touches.length === 1) {
                prev = { x: touches[0].clientX, y: touches[0].clientY };
                isDrag = true;
            } else if (touches.length >= 2) {
                lastPinchDist = this._touchDist(touches[0], touches[1]);
                lastMidpoint  = this._touchMid(touches[0], touches[1]);
            }
        }, { passive: false });

        /* ── Resize — debounced to avoid flicker on panel slide ── */
        let resizeTimer = null;
        this._ro = new ResizeObserver(() => {
            // Update immediately so the canvas never shows black bars,
            // but debounce the resolution update (expensive) by 1 frame.
            camera.aspect = c.clientWidth / c.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(c.clientWidth, c.clientHeight);
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                perimMat.resolution.set(c.clientWidth, c.clientHeight);
            }, 0);
        });
        this._ro.observe(c);

        /* ── Animation / tween state ───────────────────── */
        this._tween = null; // active reset tween, if any

        /* ── Render loop (drives tweens too) ───────────── */
        const tick = (now) => {
            this._raf = requestAnimationFrame(tick);
            if (this._tween) this._stepTween(now);
            renderer.render(scene, camera);
        };
        tick(performance.now());
    }

    _touchDist(t0, t1) {
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        return Math.sqrt(dx*dx + dy*dy);
    }

    _touchMid(t0, t1) {
        return {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
        };
    }

    /* ── Easing ─────────────────────────────────────── */
    _easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    /* ── Tween step (called every frame while active) ─ */
    _stepTween(now) {
        const tw = this._tween;
        if (!tw) return;

        const elapsed  = now - tw.startTime;
        const t        = Math.min(elapsed / tw.duration, 1);
        const ease     = this._easeOutQuart(t);

        // Interpolate spherical coords + target
        this._camDist = tw.from.dist   + (tw.to.dist   - tw.from.dist)   * ease;
        this._theta   = tw.from.theta  + (tw.to.theta  - tw.from.theta)  * ease;
        this._phi     = tw.from.phi    + (tw.to.phi    - tw.from.phi)    * ease;
        this._target.lerpVectors(tw.from.target, tw.to.target, ease);

        this._updateCamera();

        if (t >= 1) this._tween = null;
    }

    _applyPan(dx, dy, speed) {
        const { camera } = this;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up    = new THREE.Vector3().crossVectors(right, dir).normalize();
        const off   = right.multiplyScalar(-dx * speed).add(up.multiplyScalar(dy * speed));
        this._target.add(off);
        camera.position.add(off);
    }

    _updateCamera() {
        const { _camDist: d, _theta: t, _phi: p, _target: tgt, camera } = this;
        camera.position.set(
            tgt.x + d * Math.sin(p) * Math.sin(t),
            tgt.y + d * Math.cos(p),
            tgt.z + d * Math.sin(p) * Math.cos(t),
        );
        camera.lookAt(tgt);
    }

    resetView() {
        const cx = 5.2, cy = 3.9, cz = 5.2;
        const toDist  = Math.sqrt(cx*cx + cy*cy + cz*cz);
        const toTheta = Math.atan2(cx, cz);
        const toPhi   = Math.acos(cy / toDist);

        this._tween = {
            startTime: performance.now(),
            duration:  500, // ms — 0.5s ease-out
            from: {
                dist:   this._camDist,
                theta:  this._theta,
                phi:    this._phi,
                target: this._target.clone(),
            },
            to: {
                dist:   toDist,
                theta:  toTheta,
                phi:    toPhi,
                target: new THREE.Vector3(0, 0, 0),
            },
        };
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this._ro)  this._ro.disconnect();
        this.renderer.dispose();
        const el = this.renderer.domElement;
        if (this.container.contains(el)) this.container.removeChild(el);
    }
}
