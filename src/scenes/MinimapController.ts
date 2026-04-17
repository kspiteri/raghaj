import * as Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../config/constants';
import { FONT } from '../config/fonts';
import type { SettlementMarker } from '../systems/SettlementSystem';

const MAP_MARGIN = 10;
const TEXTURE_SIZE = 512;

export default class MinimapController {
    private mapContainer!:  Phaser.GameObjects.Container;
    private mapImage!:      Phaser.GameObjects.Image;
    private mapGraphics!:   Phaser.GameObjects.Graphics;
    private settlementLayer!: Phaser.GameObjects.Graphics;
    private mapFrame!:      Phaser.GameObjects.Graphics;
    private mapOverlay!:    Phaser.GameObjects.Rectangle;
    private mapVisible     = false;
    private mapDrawPtr:    number | null = null;
    private lastDrawPos    = { x: 0, y: 0 };
    private settlementSource: (() => SettlementMarker[]) | null = null;
    private settlementLabels: Phaser.GameObjects.Text[] = [];

    // Stored so they can be removed in destroy()
    private onPtrDown!:  (ptr: Phaser.Input.Pointer) => void;
    private onPtrMove!:  (ptr: Phaser.Input.Pointer) => void;
    private onPtrUp!:    (ptr: Phaser.Input.Pointer) => void;

    constructor(private scene: Phaser.Scene) {}

    build(): void {
        // Full-viewport dark overlay — blocks game view (and vignette bleed-through)
        this.mapOverlay = this.scene.add.rectangle(0, 0, 1, 1, 0x0d0804, 0.92)
            .setOrigin(0).setDepth(248).setVisible(false);

        this.mapContainer = this.scene.add.container(0, 0).setDepth(250).setVisible(false);

        // Map image — display size set in position()
        this.mapImage = this.scene.add.image(0, 0, 'minimap-2d').setOrigin(0);
        // Settlement cartographic markers (below user ink)
        this.settlementLayer = this.scene.add.graphics();
        // Ink drawing layer (container-local coords)
        this.mapGraphics = this.scene.add.graphics();
        // Ornate parchment frame (redrawn in position())
        this.mapFrame = this.scene.add.graphics();

        const clearBtn = this.scene.add.text(0, 0, 'Clear', {
            fontSize: '11px', color: '#3a2508', fontStyle: 'bold', fontFamily: FONT,
            backgroundColor: '#d4b888', padding: { x: 8, y: 3 },
        }).setName('clearBtn').setInteractive({ useHandCursor: true });
        clearBtn.on('pointerdown', () => {
            this.mapGraphics.clear();
            this.setDrawStyle();
        });

        const closeBtn = this.scene.add.text(0, 0, '✕ Close', {
            fontSize: '11px', color: '#3a2508', fontStyle: 'bold', fontFamily: FONT,
            backgroundColor: '#d4b888', padding: { x: 8, y: 3 },
        }).setName('closeBtn').setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggle());

        this.mapContainer.add([this.mapImage, this.settlementLayer, this.mapGraphics, this.mapFrame, clearBtn, closeBtn]);

        // ── Drawing handlers ─────────────────────────────────────────────
        this.onPtrDown = (ptr: Phaser.Input.Pointer) => {
            if (!this.mapVisible || !this.isPointerInside(ptr.x, ptr.y)) return;
            if (this.mapDrawPtr !== null) return;
            this.mapDrawPtr  = ptr.id;
            this.lastDrawPos = this.screenToMap(ptr.x, ptr.y);
        };

        this.onPtrMove = (ptr: Phaser.Input.Pointer) => {
            if (ptr.id !== this.mapDrawPtr) return;
            if (!this.isPointerInside(ptr.x, ptr.y)) { this.mapDrawPtr = null; return; }
            const to = this.screenToMap(ptr.x, ptr.y);
            this.mapGraphics.beginPath();
            this.mapGraphics.moveTo(this.lastDrawPos.x, this.lastDrawPos.y);
            this.mapGraphics.lineTo(to.x, to.y);
            this.mapGraphics.strokePath();
            this.lastDrawPos = to;
        };

        this.onPtrUp = (ptr: Phaser.Input.Pointer) => {
            if (ptr.id === this.mapDrawPtr) this.mapDrawPtr = null;
        };

        this.scene.input.on('pointerdown', this.onPtrDown);
        this.scene.input.on('pointermove', this.onPtrMove);
        this.scene.input.on('pointerup',   this.onPtrUp);
    }

    position(): void {
        if (!this.mapContainer) return;
        const { width, height } = this.scene.scale;
        const ms    = this.getMapSize();
        const s     = ms / TEXTURE_SIZE;

        // Resize overlay to cover full viewport
        this.mapOverlay?.setSize(width, height);

        // Center map container
        this.mapContainer.setScale(s);
        this.mapContainer.setPosition(
            Math.round((width  - ms) / 2),
            Math.round((height - ms) / 2),
        );

        this.mapImage?.setDisplaySize(TEXTURE_SIZE, TEXTURE_SIZE);

        // Close button: top-right, within border strip
        const closeBtn = this.mapContainer.getByName('closeBtn') as Phaser.GameObjects.Text | null;
        closeBtn?.setPosition(TEXTURE_SIZE - 4, 4).setOrigin(1, 0);

        // Clear button: bottom-centre, within border strip
        const clearBtn = this.mapContainer.getByName('clearBtn') as Phaser.GameObjects.Text | null;
        clearBtn?.setPosition(TEXTURE_SIZE / 2, TEXTURE_SIZE - 4).setOrigin(0.5, 1);

        this.drawParchmentFrame(TEXTURE_SIZE);
        this.setDrawStyle();
    }

    toggle(): void {
        this.mapVisible = !this.mapVisible;
        this.mapOverlay.setVisible(this.mapVisible);
        this.mapContainer.setVisible(this.mapVisible);
        this.position();
        if (this.mapVisible) this.redrawSettlements();
    }

    createToggleButton(x: number, cy: number): Phaser.GameObjects.Text {
        const btn = this.scene.add.text(x, cy, '🗺️', { fontSize: '18px' })
            .setOrigin(0, 0.5).setDepth(200).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => this.toggle());
        return btn;
    }

    isPointerInside(px: number, py: number): boolean {
        if (!this.mapVisible) return false;
        const ms = this.getMapSize();
        const { width, height } = this.scene.scale;
        const mx = Math.round((width  - ms) / 2);
        const my = Math.round((height - ms) / 2);
        return px >= mx && px <= mx + ms && py >= my && py <= my + ms;
    }

    private getMapSize(): number {
        const { width, height } = this.scene.scale;
        return Math.min(width, height) - MAP_MARGIN * 2;
    }

    private screenToMap(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.mapContainer.x) / (this.mapContainer.scaleX || 1),
            y: (sy - this.mapContainer.y) / (this.mapContainer.scaleY || 1),
        };
    }

    private setDrawStyle(): void {
        this.mapGraphics.lineStyle(2, 0x3a2508, 0.80);
    }

    setSettlementSource(fn: () => SettlementMarker[]): void {
        this.settlementSource = fn;
    }

    destroy(): void {
        this.scene.input.off('pointerdown', this.onPtrDown);
        this.scene.input.off('pointermove', this.onPtrMove);
        this.scene.input.off('pointerup',   this.onPtrUp);
        for (const lbl of this.settlementLabels) lbl.destroy();
        this.settlementLabels = [];
        this.mapContainer.destroy();
        this.mapOverlay.destroy();
    }

    private worldToMap(wx: number, wy: number): { x: number; y: number } {
        return {
            x: (wx / WORLD_WIDTH)  * TEXTURE_SIZE,
            y: (wy / WORLD_HEIGHT) * TEXTURE_SIZE,
        };
    }

    private redrawSettlements(): void {
        if (!this.settlementSource) return;
        const g = this.settlementLayer;
        g.clear();

        // Remove previous labels
        for (const lbl of this.settlementLabels) {
            this.mapContainer.remove(lbl, true);
        }
        this.settlementLabels = [];

        const INK = 0x3a2508;

        for (const m of this.settlementSource()) {
            const { x, y } = this.worldToMap(m.wx, m.wy);

            if (m.type === 'village') {
                // Large circle + white fill + thick ink ring + centre dot
                g.lineStyle(2.5, INK, 1);
                g.fillStyle(0xfffbe6, 1);
                g.fillCircle(x, y, 10);
                g.strokeCircle(x, y, 10);
                g.fillStyle(INK, 1);
                g.fillCircle(x, y, 3);
            } else if (m.type === 'chapel') {
                // Bold cross on light backing circle — kappella symbol
                g.fillStyle(0xfffbe6, 0.9);
                g.fillCircle(x, y, 7);
                g.lineStyle(2.5, INK, 1);
                g.beginPath();
                g.moveTo(x,     y - 8); g.lineTo(x,     y + 8);
                g.moveTo(x - 5, y - 3); g.lineTo(x + 5, y - 3);
                g.strokePath();
            } else {
                // Farmstead — bold filled square with ink border
                g.fillStyle(0xfffbe6, 0.9);
                g.fillRect(x - 5, y - 5, 10, 10);
                g.lineStyle(2, INK, 1);
                g.strokeRect(x - 5, y - 5, 10, 10);
            }

            // Name label — shadow for legibility over the map
            const label = this.scene.add.text(x, y - (m.type === 'village' ? 14 : 10), m.name, {
                fontSize: m.type === 'village' ? '11px' : '9px',
                color: '#1a0c00',
                fontFamily: FONT,
                fontStyle: 'bold',
                stroke: '#fffbe6',
                strokeThickness: 3,
            }).setOrigin(0.5, 1);
            this.mapContainer.add(label);
            this.settlementLabels.push(label);
        }
    }

    private drawParchmentFrame(size: number): void {
        if (!this.mapFrame) return;
        this.mapFrame.clear();

        const INK   = 0x3a2508;
        const PARCH = 0xd4b888;
        const B     = 9;   // border strip width in local px

        // Parchment border strip
        this.mapFrame.fillStyle(PARCH, 0.95);
        this.mapFrame.fillRect(0, 0, size, B);
        this.mapFrame.fillRect(0, size - B, size, B);
        this.mapFrame.fillRect(0, B, B, size - B * 2);
        this.mapFrame.fillRect(size - B, B, B, size - B * 2);

        // Outer ink line
        this.mapFrame.lineStyle(1.5, INK, 0.88);
        this.mapFrame.strokeRect(0.5, 0.5, size - 1, size - 1);
        // Inner ink line
        this.mapFrame.lineStyle(0.8, INK, 0.55);
        this.mapFrame.strokeRect(B - 1, B - 1, size - (B - 1) * 2, size - (B - 1) * 2);

        // Corner crosshairs
        const T = 5;
        this.mapFrame.lineStyle(1.2, INK, 0.72);
        for (const [cx, cy] of [[B, B], [size - B, B], [B, size - B], [size - B, size - B]] as [number, number][]) {
            this.mapFrame.beginPath();
            this.mapFrame.moveTo(cx - T, cy); this.mapFrame.lineTo(cx + T, cy);
            this.mapFrame.moveTo(cx, cy - T); this.mapFrame.lineTo(cx, cy + T);
            this.mapFrame.strokePath();
        }
    }
}
