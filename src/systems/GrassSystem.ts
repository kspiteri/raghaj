import * as Phaser from 'phaser';
import { SheepData } from '../entities/Sheep/Sheep';
import {
    TILE_SIZE,
    GRASS_INITIAL_LEVEL,
    GRASS_REGROW_RATE_PER_SEC,
    GRASS_EAT_AMOUNT,
    GRAZE_ZONE_SIZE,
} from '../config/constants';

// Overlay tint colours per grass level (applied as semi-transparent iso diamond)
const GRASS_OVERLAY: Array<{ color: number; alpha: number } | null> = [
    { color: 0x8b4513, alpha: 0.35 },  // 0 — bare
    { color: 0xa0522d, alpha: 0.25 },  // 1 — sparse
    { color: 0x6b8e23, alpha: 0.15 },  // 2 — moderate
    null,                               // 3 — lush (transparent, skip)
];

// Iso corner math (no elevation — overlay sits flat on terrain at depth 1)
const S = TILE_SIZE;

function tileCorners(col: number, row: number) {
    const tx = col * S;
    const ty = row * S;
    return [
        { x: (tx - ty) * 0.5,           y: (tx + ty) * 0.25 },         // NW
        { x: (tx + S - ty) * 0.5,       y: (tx + S + ty) * 0.25 },     // NE
        { x: (tx + S - ty - S) * 0.5,   y: (tx + S + ty + S) * 0.25 }, // SE
        { x: (tx - ty - S) * 0.5,       y: (tx + ty + S) * 0.25 },     // SW
    ];
}

export default class GrassSystem {
    private grass: Uint8Array;
    private accum: Float32Array;   // sub-integer accumulator for smooth regrowth
    private isLand: Uint8Array;    // 1 = land tile, 0 = sea (never regrows)
    private rows: number;
    private cols: number;
    private dirtyTiles = new Set<number>();
    private completedZones = new Set<string>();
    private overlay: Phaser.GameObjects.Graphics;

    constructor(
        scene: Phaser.Scene,
        isSea: (wx: number, wy: number) => boolean,
        cols: number,
        rows: number,
    ) {
        this.cols = cols;
        this.rows = rows;
        const size = cols * rows;
        this.grass  = new Uint8Array(size);
        this.accum  = new Float32Array(size);
        this.isLand = new Uint8Array(size);

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const wx = c * TILE_SIZE + TILE_SIZE / 2;
                const wy = r * TILE_SIZE + TILE_SIZE / 2;
                if (!isSea(wx, wy)) {
                    const idx = c * rows + r;
                    this.isLand[idx] = 1;
                    this.grass[idx]  = GRASS_INITIAL_LEVEL;
                    this.accum[idx]  = GRASS_INITIAL_LEVEL;
                }
            }
        }

        this.overlay = scene.add.graphics().setDepth(1);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    getGrass(col: number, row: number): number {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return 0;
        return this.grass[col * this.rows + row];
    }

    getGrassAt(wx: number, wy: number): number {
        return this.getGrass(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
    }

    /** Called by FlockSystem each frame per sheep on this tile. Amount is dt-scaled (levels/sec). */
    eatGrass(col: number, row: number, dt: number): void {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
        const idx = col * this.rows + row;
        if (!this.isLand[idx]) return;
        this.accum[idx] = Math.max(0, this.accum[idx] - GRASS_EAT_AMOUNT * dt);
        const newLevel = Math.floor(this.accum[idx]);
        if (newLevel !== this.grass[idx]) {
            this.grass[idx] = newLevel;
            this.dirtyTiles.add(idx);
        }
    }

    /** Weak outward repulsion when standing on a bare tile. */
    tileRepulsion(sx: number, sy: number): { x: number; y: number } {
        if (this.getGrassAt(sx, sy) > 0) return { x: 0, y: 0 };
        const col = Math.floor(sx / TILE_SIZE);
        const row = Math.floor(sy / TILE_SIZE);
        const cx = (col + 0.5) * TILE_SIZE;
        const cy = (row + 0.5) * TILE_SIZE;
        const dx = sx - cx;
        const dy = sy - cy;
        const dist = Math.hypot(dx, dy) || 1;
        return { x: dx / dist, y: dy / dist };
    }

    /** Average grass quality 0.0–1.0 under all sheep. */
    averageGrassUnder(sheep: SheepData[]): number {
        if (sheep.length === 0) return 1;
        let sum = 0;
        for (const s of sheep) sum += this.getGrassAt(s.x, s.y);
        return sum / (sheep.length * GRASS_INITIAL_LEVEL);
    }

    /** Fires cb(zoneId) once for each 20×20 tile zone that has been fully grazed bare. */
    checkGrazingZones(cb: (zoneId: string) => void): void {
        const zCols = Math.ceil(this.cols / GRAZE_ZONE_SIZE);
        const zRows = Math.ceil(this.rows / GRAZE_ZONE_SIZE);

        for (let zc = 0; zc < zCols; zc++) {
            for (let zr = 0; zr < zRows; zr++) {
                const id = `${zc}:${zr}`;
                if (this.completedZones.has(id)) continue;

                let allBare = true;
                outer:
                for (let c = zc * GRAZE_ZONE_SIZE; c < Math.min((zc + 1) * GRAZE_ZONE_SIZE, this.cols); c++) {
                    for (let r = zr * GRAZE_ZONE_SIZE; r < Math.min((zr + 1) * GRAZE_ZONE_SIZE, this.rows); r++) {
                        const idx = c * this.rows + r;
                        if (this.isLand[idx] && this.grass[idx] > 0) { allBare = false; break outer; }
                    }
                }

                if (allBare) {
                    this.completedZones.add(id);
                    cb(id);
                }
            }
        }
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(delta: number): void {
        const regrow = GRASS_REGROW_RATE_PER_SEC * (delta / 1000);

        for (let idx = 0; idx < this.grass.length; idx++) {
            if (!this.isLand[idx]) continue;
            if (this.grass[idx] >= GRASS_INITIAL_LEVEL) continue;

            const prev = this.accum[idx];
            this.accum[idx] = Math.min(GRASS_INITIAL_LEVEL, prev + regrow);
            const newLevel = Math.floor(this.accum[idx]);
            if (newLevel !== this.grass[idx]) {
                this.grass[idx] = newLevel;
                this.dirtyTiles.add(idx);
            }
        }

        if (this.dirtyTiles.size > 0) this.redrawOverlay();
    }

    // ── Overlay rendering ────────────────────────────────────────────────────

    private redrawOverlay(): void {
        this.dirtyTiles.clear();
        this.overlay.clear();

        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const idx = c * this.rows + r;
                if (!this.isLand[idx]) continue;
                const tint = GRASS_OVERLAY[Math.min(this.grass[idx], 3)];
                if (!tint) continue;

                this.overlay.fillStyle(tint.color, tint.alpha);
                this.overlay.fillPoints(tileCorners(c, r) as Phaser.Math.Vector2[], true);
            }
        }
    }

    destroy(): void {
        this.overlay.destroy();
    }
}
