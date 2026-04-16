import * as Phaser from 'phaser';
import { TILE_SIZE, TILE_ELEV_STEP, TILE_ELEV_MAX, WORLD_WIDTH, WORLD_HEIGHT } from '../config/constants';

// ── Elevation colors (top face), index = elevation level 0..7 ────────────────
// Palette tuned for Maltese landscape:
//   coast → sparse dry grass → garigue → limestone plateau → summit chalk
const ELEV_TOP: number[] = [
    0xecdea8, // 0  coastal sand / limestone
    0xcabc5e, // 1  sparse dry grass
    0xa09e50, // 2  garigue scrub
    0x7c9040, // 3  denser garigue
    0xb09048, // 4  rocky scrub / maquis
    0xd4a858, // 5  bare limestone plateau
    0xe8c87a, // 6  upper terrace limestone
    0xf4e8cc, // 7  summit / ta' dmejrek chalk
];

const SEA_COLOR  = '#1c4e7a';
const MAX_ELEV_H = TILE_ELEV_MAX * TILE_ELEV_STEP;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic pseudo-random in 0..1 from tile coordinates. */
function tileHash(col: number, row: number): number {
    const n = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

/** Independent second hash for per-channel colour variation. */
function tileHash2(col: number, row: number): number {
    const n = Math.sin(col * 269.5 + row * 183.3) * 29938.1234;
    return n - Math.floor(n);
}

/** Darken a hex colour by factor f (0 = black, 1 = unchanged). */
function darken(hex: number, f: number): string {
    const r = Math.floor(((hex >> 16) & 0xff) * f);
    const g = Math.floor(((hex >>  8) & 0xff) * f);
    const b = Math.floor(( hex        & 0xff) * f);
    return `rgb(${r},${g},${b})`;
}

/**
 * Apply per-tile colour variation using two independent hashes:
 *   h1 → overall brightness shift (±10%)
 *   h2 → slight green/red tint variation (±5%)
 */
function varyColor(hex: number, h1: number, h2: number): string {
    const bright = 1 + (h1 - 0.5) * 0.20;   // ±10% brightness
    const tint   = (h2 - 0.5) * 0.08;         // slight hue shift
    const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 0xff) * (bright + tint))));
    const g = Math.min(255, Math.max(0, Math.round(((hex >>  8) & 0xff) * (bright - tint * 0.5))));
    const b = Math.min(255, Math.max(0, Math.round(( hex        & 0xff) * bright)));
    return `rgb(${r},${g},${b})`;
}

/**
 * Convert an RGBA pixel from the coloured topo relief map into a discrete
 * elevation level (0–7) or -1 for sea / background.
 */
function colorToElev(r: number, g: number, b: number, a: number): number {
    if (a < 20)              return -1;  // transparent
    if (b > r + 50 && b > g - 5) return -1;  // light-blue sea

    const lum = (r + g + b) / 3;

    if (lum < 40) return 0;  // dark shadow → low land
    if (lum > 185 && (Math.max(r, g, b) - Math.min(r, g, b)) < 45) return 6; // near-white summit

    // Primary discriminator: R/G ratio
    const rg = r / Math.max(g, 1);
    if (rg < 0.55) return 0;
    if (rg < 0.75) return 1;
    if (rg < 0.95) return 2;
    if (rg < 1.15) return 3;
    if (rg < 1.40) return 4;
    if (rg < 1.65) return 5;
    return 6;
}

// ─────────────────────────────────────────────────────────────────────────────
export default class TerrainSystem {
    private elevGrid: number[][] = [];  // [col][row] = level (-1 = sea)

    constructor(scene: Phaser.Scene) {
        this.buildElevGrid(scene);
        this.markChannels();
        this.flattenCoasts();
        this.bakeTerrain(scene);
        this.bakeMinimapTexture(scene);
    }

    /** Returns true only for deep sea tiles — channels (-2) and land (≥0) are passable. */
    isSea(wx: number, wy: number): boolean {
        return this.elevAt(wx, wy) === -1;
    }

    /** Returns true for sea AND channels — sheep use this so they stay on land. */
    isSeaOrChannel(wx: number, wy: number): boolean {
        return this.elevAt(wx, wy) < 0;
    }

    /**
     * Returns a random land tile with elevation >= minElev (default 1 = not coast).
     * Samples every 4th tile for performance; falls back to findLandNear(centre).
     */
    findRandomInteriorPosition(minElev = 1): { x: number; y: number } {
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;
        const candidates: [number, number][] = [];

        for (let c = 0; c < cols; c += 4) {
            for (let r = 0; r < rows; r += 4) {
                if ((this.elevGrid[c]?.[r] ?? -1) >= minElev) {
                    candidates.push([c, r]);
                }
            }
        }

        if (candidates.length === 0) {
            return this.findLandNear(
                (cols / 2) * TILE_SIZE,
                (rows / 2) * TILE_SIZE,
            );
        }

        const [c, r] = candidates[Math.floor(Math.random() * candidates.length)];
        return {
            x: (c + 0.5) * TILE_SIZE,
            y: (r + 0.5) * TILE_SIZE,
        };
    }

    private elevAt(wx: number, wy: number): number {
        const col = Math.floor(wx / TILE_SIZE);
        const row = Math.floor(wy / TILE_SIZE);
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;
        if (col < 0 || row < 0 || col >= cols || row >= rows) return -1;
        return this.elevGrid[col][row];
    }

    // ── Channel detection — land-on-both-sides scan ───────────────────────────
    // For each sea tile, cast rays in 4 opposite-direction pairs. If land is
    // found within HALF tiles on BOTH sides of any pair, the tile is a channel.
    // Open ocean only has land on one side so it stays deep.
    // HALF=80 → detects channels up to 80×2×64 = 10 240px wide, covering the
    // full Malta–Comino–Gozo strait.
    private markChannels(): void {
        const HALF = 80;
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;

        const dirs: [number, number, number, number][] = [
            [ 1,  0, -1,  0],  // horizontal
            [ 0,  1,  0, -1],  // vertical
            [ 1,  1, -1, -1],  // diagonal ↘↖
            [ 1, -1, -1,  1],  // diagonal ↗↙
        ];

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                if (this.elevGrid[c][r] !== -1) continue;

                for (const [dc1, dr1, dc2, dr2] of dirs) {
                    let side1 = false, side2 = false;
                    for (let d = 1; d <= HALF; d++) {
                        const c1 = c + dc1 * d, r1 = r + dr1 * d;
                        const c2 = c + dc2 * d, r2 = r + dr2 * d;
                        if (!side1 && c1 >= 0 && c1 < cols && r1 >= 0 && r1 < rows && this.elevGrid[c1][r1] >= 0) side1 = true;
                        if (!side2 && c2 >= 0 && c2 < cols && r2 >= 0 && r2 < rows && this.elevGrid[c2][r2] >= 0) side2 = true;
                        if (side1 && side2) break;
                    }
                    if (side1 && side2) { this.elevGrid[c][r] = -2; break; }
                }
            }
        }
    }

    // ── Find nearest land tile ────────────────────────────────────────────────
    /** BFS outward from (wx, wy) until a land tile (elev ≥ 0) is found. */
    findLandNear(wx: number, wy: number): { x: number; y: number } {
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;
        const startC = Math.max(0, Math.min(cols - 1, Math.floor(wx / TILE_SIZE)));
        const startR = Math.max(0, Math.min(rows - 1, Math.floor(wy / TILE_SIZE)));

        if ((this.elevGrid[startC]?.[startR] ?? -1) >= 0) {
            return { x: wx, y: wy };
        }

        const visited = new Uint8Array(cols * rows);
        const queue   = new Int32Array(cols * rows);
        let qHead = 0, qTail = 0;

        const push = (c: number, r: number) => {
            const idx = c * rows + r;
            if (visited[idx]) return;
            visited[idx] = 1;
            queue[qTail++] = idx;
        };

        push(startC, startR);

        while (qHead < qTail) {
            const idx = queue[qHead++];
            const c = Math.floor(idx / rows);
            const r = idx % rows;

            if ((this.elevGrid[c]?.[r] ?? -1) >= 0) {
                return {
                    x: (c + 0.5) * TILE_SIZE,
                    y: (r + 0.5) * TILE_SIZE,
                };
            }

            if (c + 1 < cols)  push(c + 1, r);
            if (c - 1 >= 0)    push(c - 1, r);
            if (r + 1 < rows)  push(c, r + 1);
            if (r - 1 >= 0)    push(c, r - 1);
            // diagonal steps to avoid getting stuck in narrow sea corridors
            if (c + 1 < cols && r + 1 < rows) push(c + 1, r + 1);
            if (c - 1 >= 0   && r - 1 >= 0)   push(c - 1, r - 1);
            if (c + 1 < cols && r - 1 >= 0)   push(c + 1, r - 1);
            if (c - 1 >= 0   && r + 1 < rows)  push(c - 1, r + 1);
        }

        return { x: wx, y: wy }; // fallback — shouldn't happen
    }

    // ── Flatten coastal tiles ─────────────────────────────────────────────────
    private flattenCoasts(): void {
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                if (this.elevGrid[c][r] <= 0) continue;
                let coastal = false;
                outer:
                for (let dc = -1; dc <= 1; dc++) {
                    for (let dr = -1; dr <= 1; dr++) {
                        if (dc === 0 && dr === 0) continue;
                        const nc = c + dc, nr = r + dr;
                        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && this.elevGrid[nc][nr] < 0) {
                            coastal = true;
                            break outer;
                        }
                    }
                }
                if (coastal) this.elevGrid[c][r] = 0;
            }
        }
    }

    // ── Build elevation grid from heightmap texture ───────────────────────────
    private buildElevGrid(scene: Phaser.Scene): void {
        const cols = Math.ceil(WORLD_WIDTH  / TILE_SIZE);
        const rows = Math.ceil(WORLD_HEIGHT / TILE_SIZE);

        const texture = scene.textures.get('heightmap');
        const hasMap  = texture && texture.key !== '__MISSING';

        if (!hasMap) {
            this.elevGrid = Array.from({ length: cols }, () =>
                new Array(rows).fill(2)
            );
            return;
        }

        const img = texture.getSourceImage() as HTMLImageElement;
        const tmp = document.createElement('canvas');
        tmp.width  = img.width;
        tmp.height = img.height;
        const ctx  = tmp.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);

        this.elevGrid = Array.from({ length: cols }, (_, col) =>
            Array.from({ length: rows }, (__, row) => {
                const px = Math.min(Math.floor((col / cols) * img.width),  img.width  - 1);
                const py = Math.min(Math.floor((row / rows) * img.height), img.height - 1);
                const i  = (py * img.width + px) * 4;
                return colorToElev(data[i], data[i + 1], data[i + 2], data[i + 3]);
            })
        );
    }

    // ── Bake terrain tiles into a grid of canvas-chunk textures ──────────────
    private bakeTerrain(scene: Phaser.Scene): void {
        const cols  = Math.ceil(WORLD_WIDTH  / TILE_SIZE);
        const rows  = Math.ceil(WORLD_HEIGHT / TILE_SIZE);
        const S     = TILE_SIZE;
        const SCALE = 0.5;   // fixed quality — chunks handle device texture limits

        const isoW = WORLD_WIDTH;
        const isoH = WORLD_HEIGHT / 2;
        const offX = isoW / 2;
        const offY = MAX_ELEV_H;

        // Full canvas dimensions at SCALE=0.5
        const cw = Math.ceil((isoW + 1) * SCALE);
        const ch = Math.ceil((isoH + MAX_ELEV_H + 1) * SCALE);

        // Chunk size: fit within device WebGL texture limit (2048 minimum guarantee)
        const renderer = scene.game.renderer;
        const maxTex: number = renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
            ? (renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE) as number)
            : 4096;
        // BLEED is subtracted from CHUNK_PX so canvas + bleed never exceeds maxTex
        const BLEED      = 2; // canvas px — overlap adjacent chunks to eliminate seam gaps
        const CHUNK_PX   = Math.min(maxTex, 4096) - BLEED;
        const numCX      = Math.ceil(cw / CHUNK_PX);
        const numCY      = Math.ceil(ch / CHUNK_PX);

        // Helpers: iso world → full canvas pixel space
        const px = (ix: number) => (ix + offX) * SCALE;
        const py = (iy: number) => (iy + offY) * SCALE;

        // ── Create chunk canvases, pre-filled with sea colour ─────────────
        const canvases: HTMLCanvasElement[][] = [];
        const ctxs:     CanvasRenderingContext2D[][] = [];
        for (let ci = 0; ci < numCX; ci++) {
            canvases[ci] = [];
            ctxs[ci]     = [];
            for (let ri = 0; ri < numCY; ri++) {
                const c   = document.createElement('canvas');
                c.width   = Math.min(CHUNK_PX, cw - ci * CHUNK_PX) + BLEED;
                c.height  = Math.min(CHUNK_PX, ch - ri * CHUNK_PX) + BLEED;
                const ctx = c.getContext('2d')!;
                ctx.fillStyle = SEA_COLOR;
                ctx.fillRect(0, 0, c.width, c.height);
                canvases[ci][ri] = c;
                ctxs[ci][ri]     = ctx;
            }
        }

        // ── Draw tiles in painter's order, routing each to overlapping chunks
        for (let sum = 0; sum < cols + rows - 1; sum++) {
            for (let col = 0; col <= sum; col++) {
                const row = sum - col;
                if (col >= cols || row >= rows) continue;

                const elev      = this.elevGrid[col]?.[row] ?? -1;
                const isChannel = elev === -2;
                if (elev < 0 && !isChannel) continue;

                const h  = isChannel ? 0 : elev * TILE_ELEV_STEP;
                const tx = col * S;
                const ty = row * S;

                const nwX = px((tx - ty) * 0.5),           nwY = py((tx + ty) * 0.25 - h);
                const neX = px((tx + S - ty) * 0.5),       neY = py((tx + S + ty) * 0.25 - h);
                const seX = px((tx + S - ty - S) * 0.5),   seY = py((tx + S + ty + S) * 0.25 - h);
                const swX = px((tx - ty - S) * 0.5),       swY = py((tx + ty + S) * 0.25 - h);
                const hs  = h * SCALE;

                // Bounding box in full canvas space (generous, covers cliff faces)
                const bboxL = Math.min(nwX, swX, neX, seX) - 1;
                const bboxR = Math.max(nwX, swX, neX, seX) + 1;
                const bboxT = Math.min(nwY, neY, seY, swY) - hs - 1;
                const bboxB = Math.max(nwY, neY, seY, swY) + hs + 1;

                const c0 = Math.max(0, Math.floor(bboxL / CHUNK_PX));
                const c1 = Math.min(numCX - 1, Math.floor(bboxR / CHUNK_PX));
                const r0 = Math.max(0, Math.floor(bboxT / CHUNK_PX));
                const r1 = Math.min(numCY - 1, Math.floor(bboxB / CHUNK_PX));

                for (let ci = c0; ci <= c1; ci++) {
                    for (let ri = r0; ri <= r1; ri++) {
                        const ctx = ctxs[ci][ri];
                        ctx.save();
                        ctx.translate(-ci * CHUNK_PX, -ri * CHUNK_PX);
                        this.drawTile(ctx, isChannel, h, hs, elev, col, row,
                            nwX, nwY, neX, neY, seX, seY, swX, swY);
                        ctx.restore();
                    }
                }
            }
        }

        // ── Register textures and place chunk images in scene ─────────────
        for (let ci = 0; ci < numCX; ci++) {
            for (let ri = 0; ri < numCY; ri++) {
                const key    = `terrain-chunk-${ci}-${ri}`;
                scene.textures.addCanvas(key, canvases[ci][ri]);
                // Chunk top-left in world space = canvas offset / SCALE + origin
                const worldX = ci * CHUNK_PX / SCALE - offX;
                const worldY = ri * CHUNK_PX / SCALE - offY;
                scene.add.image(0, 0, key)
                    .setOrigin(0, 0)
                    .setPosition(worldX, worldY)
                    .setScale(1 / SCALE)
                    .setDepth(0);
            }
        }
    }

    // ── Draw a single terrain tile to a canvas context ────────────────────────
    private drawTile(
        ctx: CanvasRenderingContext2D,
        isChannel: boolean,
        h: number, hs: number, elev: number, col: number, row: number,
        nwX: number, nwY: number, neX: number, neY: number,
        seX: number, seY: number, swX: number, swY: number,
    ): void {
        if (isChannel) {
            ctx.fillStyle = '#4a9abe';
            ctx.beginPath();
            ctx.moveTo(nwX, nwY); ctx.lineTo(neX, neY);
            ctx.lineTo(seX, seY); ctx.lineTo(swX, swY);
            ctx.closePath(); ctx.fill();
            return;
        }

        const top  = ELEV_TOP[Math.min(elev, ELEV_TOP.length - 1)];
        const h1   = tileHash(col, row);
        const h2   = tileHash2(col, row);
        const varC = varyColor(top, h1, h2);

        if (h > 0) {
            const BANDS = 3;
            for (let b = 0; b < BANDS; b++) {
                const t0 = b / BANDS, t1 = (b + 1) / BANDS;
                ctx.fillStyle = darken(top, (b % 2 === 0 ? 0.52 : 0.60) + h1 * 0.06);
                ctx.beginPath();
                ctx.moveTo(swX, swY + hs * t0); ctx.lineTo(seX, seY + hs * t0);
                ctx.lineTo(seX, seY + hs * t1); ctx.lineTo(swX, swY + hs * t1);
                ctx.closePath(); ctx.fill();
            }
            for (let b = 0; b < BANDS; b++) {
                const t0 = b / BANDS, t1 = (b + 1) / BANDS;
                ctx.fillStyle = darken(top, (b % 2 === 0 ? 0.70 : 0.78) + h1 * 0.06);
                ctx.beginPath();
                ctx.moveTo(seX, seY + hs * t0); ctx.lineTo(neX, neY + hs * t0);
                ctx.lineTo(neX, neY + hs * t1); ctx.lineTo(seX, seY + hs * t1);
                ctx.closePath(); ctx.fill();
            }
        }

        ctx.fillStyle = varC;
        ctx.beginPath();
        ctx.moveTo(nwX, nwY); ctx.lineTo(neX, neY);
        ctx.lineTo(seX, seY); ctx.lineTo(swX, swY);
        ctx.closePath(); ctx.fill();

        ctx.strokeStyle = `rgba(255,245,220,${0.18 + h1 * 0.12})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(nwX, nwY); ctx.lineTo(neX, neY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(nwX, nwY); ctx.lineTo(swX, swY); ctx.stroke();

        ctx.strokeStyle = `rgba(0,0,0,${0.12 + h1 * 0.06})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(seX, seY); ctx.lineTo(neX, neY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(seX, seY); ctx.lineTo(swX, swY); ctx.stroke();
    }

    // ── Bake 2D minimap overhead texture ─────────────────────────────────────
    private bakeMinimapTexture(scene: Phaser.Scene): void {
        const cols = this.elevGrid.length;
        const rows = this.elevGrid[0]?.length ?? 0;
        const SIZE = 512;

        const canvas = document.createElement('canvas');
        canvas.width  = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;

        // ── Parchment base ────────────────────────────────────────────────
        ctx.fillStyle = '#e4cfaa';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // ── Terrain colors — ink on aged paper ────────────────────────────
        // Sea uses a hatched fill: draw as mid-tone then add hatching
        // Land elevations: warm ochre/sepia ink washes
        const LAND: Record<number, [number, number, number]> = {
            0: [210, 192, 120],  // coast  — sandy ochre
            1: [184, 165,  82],  // grass  — olive ink
            2: [158, 138,  58],  // garigue — warm brown-green
            3: [128, 106,  40],  // dense  — darker brown
            4: [140, 112,  50],  // rocky  — mid brown
            5: [168, 140,  76],  // limestone plateau
            6: [192, 162,  96],  // upper terrace
            7: [218, 192, 128],  // summit — light parchment
        };
        const SEA_RGB:  [number, number, number] = [138, 168, 185];  // muted slate-blue wash
        const CHAN_RGB  = SEA_RGB;  // same water colour throughout

        // Render pixel grid
        const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
        const d = imgData.data;

        for (let px = 0; px < SIZE; px++) {
            for (let py = 0; py < SIZE; py++) {
                const col  = Math.min(Math.floor((px / SIZE) * cols), cols - 1);
                const row  = Math.min(Math.floor((py / SIZE) * rows), rows - 1);
                const elev = this.elevGrid[col]?.[row] ?? -1;

                let rgb: [number, number, number];
                if      (elev === -2) rgb = CHAN_RGB;
                else if (elev < 0)   rgb = SEA_RGB;
                else                 rgb = LAND[Math.min(elev, 7)] ?? LAND[7];

                // Subtle per-pixel noise for parchment grain (±6)
                const n = ((Math.sin(px * 127.1 + py * 311.7) * 43758.5) % 1 + 1) * 0.5;
                const grain = (n - 0.5) * 12;

                const idx = (py * SIZE + px) * 4;
                d[idx + 0] = Math.min(255, Math.max(0, rgb[0] + grain));
                d[idx + 1] = Math.min(255, Math.max(0, rgb[1] + grain * 0.9));
                d[idx + 2] = Math.min(255, Math.max(0, rgb[2] + grain * 0.7));
                d[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        // ── Sea cross-hatching (ink lines on water) ───────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(90, 120, 140, 0.18)';
        ctx.lineWidth = 0.4;
        for (let i = -SIZE; i < SIZE * 2; i += 5) {
            ctx.beginPath(); ctx.moveTo(i, 0);      ctx.lineTo(i + SIZE, SIZE); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i, 0);      ctx.lineTo(i - SIZE, SIZE); ctx.stroke();
        }
        ctx.restore();

        // ── Ink contour lines where elevation changes (skip water-to-water) ─
        ctx.save();
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.30)';
        ctx.lineWidth = 0.6;
        for (let px = 1; px < SIZE - 1; px++) {
            for (let py = 1; py < SIZE - 1; py++) {
                const col  = Math.min(Math.floor((px / SIZE) * cols), cols - 1);
                const row  = Math.min(Math.floor((py / SIZE) * rows), rows - 1);
                const e    = this.elevGrid[col]?.[row] ?? -1;
                const colR = Math.min(Math.floor(((px + 1) / SIZE) * cols), cols - 1);
                const colD = Math.min(Math.floor((px / SIZE) * cols), cols - 1);
                const rowD = Math.min(Math.floor(((py + 1) / SIZE) * rows), rows - 1);
                const eR   = this.elevGrid[colR]?.[row]  ?? -1;
                const eD   = this.elevGrid[colD]?.[rowD] ?? -1;
                // Draw only where one side is land — skip pure water-to-water boundaries
                const edgeR = e !== eR && !(e < 0 && eR < 0);
                const edgeD = e !== eD && !(e < 0 && eD < 0);
                if (edgeR || edgeD) {
                    ctx.beginPath(); ctx.rect(px, py, 1, 1); ctx.stroke();
                }
            }
        }
        ctx.restore();

        // ── Aged-edge vignette ─────────────────────────────────────────────
        const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.28, SIZE / 2, SIZE / 2, SIZE * 0.72);
        grad.addColorStop(0,   'rgba(0,0,0,0.00)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.00)');
        grad.addColorStop(1.0, 'rgba(50,30,5,0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SIZE, SIZE);

        scene.textures.addCanvas('minimap-2d', canvas);
    }
}
