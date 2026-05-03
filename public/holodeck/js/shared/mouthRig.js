import * as THREE from 'three';
import { MOUTH_RIG, VISEMES } from './charConfig.js';

const SIZE = MOUTH_RIG.canvasSize;
const HALF = SIZE / 2;
const SCALE = SIZE / 120;

export class MouthRig {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = SIZE;
        this.canvas.height = SIZE;
        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        this.geometry = new THREE.PlaneGeometry(MOUTH_RIG.planeSize, MOUTH_RIG.planeSize);
        // Lit + emissive — see characterMesh.js eye material for rationale.
        // Diffuse responds to scene lighting (mouth dims with the env mood);
        // emissiveMap at 0.35 intensity floors the brightness so lips stay
        // readable even at night.
        this.material = new THREE.MeshLambertMaterial({
            map: this.texture, emissive: 0xffffff, emissiveMap: this.texture,
            emissiveIntensity: 0.35,
            transparent: true, depthWrite: false, side: THREE.FrontSide,
            toneMapped: false,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'mouthRigPlane';

        this.currentParams = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };
        this.lipColor = MOUTH_RIG.lipColor;
        this.lipThickness = MOUTH_RIG.lipThickness;
        this._dirty = true;
        this._render();
    }

    attach(anchorGroup, cy, mouthYOffset, faceZ) {
        this.mesh.position.set(0, cy - mouthYOffset, faceZ + 0.002);
        anchorGroup.add(this.mesh);
    }

    update(params) {
        if (!params) return;
        let changed = false;
        for (const key of Object.keys(this.currentParams)) {
            if (params[key] !== undefined && Math.abs(params[key] - this.currentParams[key]) > 0.001) {
                this.currentParams[key] = params[key];
                changed = true;
            }
        }
        if (changed || this._dirty) {
            this._render();
            this.texture.needsUpdate = true;
            this._dirty = false;
        }
    }

    _render() {
        const ctx = this.ctx;
        const p = this.currentParams;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.save();
        ctx.translate(HALF, HALF);
        ctx.scale(SCALE, SCALE);

        const openRx = 30 + p.lipWidth * 20 - p.lipRound * 12;
        const openRy = 2 + p.jawOpen * 28;

        // Interior
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx, openRy, 0, 0, Math.PI * 2);
        ctx.fillStyle = MOUTH_RIG.interiorColor;
        ctx.fill();

        // Clip for teeth & tongue
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx, openRy, 0, 0, Math.PI * 2);
        ctx.clip();

        // Tongue
        const tongueY = 8 - p.tongueUp * 16;
        ctx.beginPath();
        ctx.ellipse(0, tongueY, openRx * 0.6, 10 + p.jawOpen * 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = MOUTH_RIG.tongueColor;
        ctx.fill();

        // Teeth
        const teethW = openRx * 1.6;
        const jawGate = Math.min(1, p.jawOpen * 8);
        const teethOpacity = p.teethShow > 0.05 ? jawGate : 0;

        if (teethOpacity > 0.01) {
            const upperH = 6 + p.teethShow * 14;
            ctx.globalAlpha = teethOpacity;
            ctx.beginPath();
            _roundRect(ctx, -teethW / 2, -openRy - 2, teethW, upperH, 2);
            ctx.fillStyle = MOUTH_RIG.upperTeethColor;
            ctx.fill();

            const lowerTeethW = teethW * 0.85;
            const lowerH = 5 + p.teethShow * 8;
            ctx.globalAlpha = teethOpacity * 0.9;
            ctx.beginPath();
            _roundRect(ctx, -lowerTeethW / 2, openRy - 4 - p.teethShow * 6, lowerTeethW, lowerH, 2);
            ctx.fillStyle = MOUTH_RIG.lowerTeethColor;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore(); // remove clip

        // Lip outline
        const halfStroke = this.lipThickness / 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx + halfStroke, openRy + halfStroke, 0, 0, Math.PI * 2);
        ctx.strokeStyle = this.lipColor;
        ctx.lineWidth = this.lipThickness;
        ctx.stroke();

        ctx.restore(); // remove translate/scale
    }

    setRest() { this.update(VISEMES.REST); }

    setLipColor(hex) {
        this.lipColor = hex;
        this._dirty = true; this._render();
    }

    setLipThickness(val) {
        this.lipThickness = val;
        this._dirty = true; this._render();
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
}

function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
