import * as Phaser from 'phaser';
import rawDefs from '../../data/settlements.json';
import {
    WORLD_WIDTH, WORLD_HEIGHT,
    SETTLEMENT_INTERACT_RADIUS,
    SETTLEMENT_MIN_DIST,
} from '../config/constants';
import TerrainSystem from './TerrainSystem';
import SaveSystem from './SaveSystem';
import { isoProject } from '../utils/iso';

// ── Event name constants (shared with GameScene / UIScene) ────────────────────

export const SETTLEMENT_EVENTS = {
    ENTER:           'settlement-enter',
    QUEST_AVAILABLE: 'quest-available',
    QUEST_COMPLETE:  'quest-complete',
    QUEST_ACCEPT:    'quest-accept',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuestDef {
    id: string;
    type: 'deliver' | 'visit';
    to?: string;
    label: string;
    reward: { treats?: number; poemTrigger?: boolean };
}

export interface SettlementDef {
    id: string;
    name: string;
    type: 'village' | 'farmstead' | 'chapel';
    anchor?: { fx: number; fy: number };
    quests: QuestDef[];
}

export interface PlacedSettlement extends SettlementDef {
    wx: number;
    wy: number;
    icon: Phaser.GameObjects.Container;
}

export interface ActiveQuest {
    def: QuestDef;
    fromId: string;
    carryingItem: boolean;
}

export type SettlementMarker = {
    wx: number; wy: number;
    name: string;
    type: 'village' | 'farmstead' | 'chapel';
};

interface SettlementCallbacks {
    onEnter:          (s: PlacedSettlement) => void;
    onQuestAvailable: (s: PlacedSettlement, q: QuestDef) => void;
    onQuestComplete:  (q: QuestDef) => void;
    onTreats:         (n: number) => void;
    onPoemTrigger:    () => void;
}

// ── Runtime type-guard ────────────────────────────────────────────────────────

function isSettlementDef(v: unknown): v is SettlementDef {
    if (typeof v !== 'object' || v === null) return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.id     === 'string' &&
        typeof o.name   === 'string' &&
        ['village', 'farmstead', 'chapel'].includes(o.type as string) &&
        Array.isArray(o.quests)
    );
}

// ── SettlementSystem ──────────────────────────────────────────────────────────

export default class SettlementSystem {
    private settlements: PlacedSettlement[] = [];
    private activeQuest: ActiveQuest | null = null;
    private insideIds = new Set<string>();
    private callbacks: SettlementCallbacks;
    private save: SaveSystem;

    constructor(
        scene: Phaser.Scene,
        terrain: TerrainSystem,
        save: SaveSystem,
        callbacks: SettlementCallbacks,
    ) {
        this.callbacks = callbacks;
        this.save      = save;

        const defs = (rawDefs as unknown[]).filter(isSettlementDef);
        this.settlements = this.resolvePositions(defs, terrain);
        for (const s of this.settlements) {
            s.icon = this.createVisual(scene, s);
        }
    }

    // ── Position resolution ───────────────────────────────────────────────────

    private resolvePositions(
        defs: SettlementDef[],
        terrain: TerrainSystem,
    ): PlacedSettlement[] {
        const savedPositions = this.save.getSettlementPositions();
        const placed: PlacedSettlement[] = [];
        let hasNewRandom = false;

        for (const def of defs) {
            if (def.anchor) {
                const pos = terrain.findLandNear(
                    def.anchor.fx * WORLD_WIDTH,
                    def.anchor.fy * WORLD_HEIGHT,
                );
                placed.push({ ...def, wx: pos.x, wy: pos.y, icon: null! });
            } else {
                const saved = savedPositions.find(p => p.id === def.id);
                if (saved) {
                    placed.push({ ...def, wx: saved.wx, wy: saved.wy, icon: null! });
                } else {
                    const pos = this.generateRandomPosition(terrain, placed);
                    placed.push({ ...def, wx: pos.x, wy: pos.y, icon: null! });
                    hasNewRandom = true;
                }
            }
        }

        if (hasNewRandom) {
            const randomPositions = placed
                .filter(s => !defs.find(d => d.id === s.id)?.anchor)
                .map(s => ({ id: s.id, wx: s.wx, wy: s.wy }));
            this.save.saveSettlementPositions(randomPositions);
        }

        return placed;
    }

    private generateRandomPosition(
        terrain: TerrainSystem,
        existing: PlacedSettlement[],
    ): { x: number; y: number } {
        let currentMinDist = SETTLEMENT_MIN_DIST;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (attempt > 0 && attempt % 20 === 0) {
                currentMinDist = Math.max(1000, currentMinDist - 500);
            }
            const pos = terrain.findRandomInteriorPosition(2);
            const tooClose = existing.some(
                s => Math.hypot(pos.x - s.wx, pos.y - s.wy) < currentMinDist,
            );
            if (!tooClose) return pos;
        }
        console.warn('[SettlementSystem] Could not satisfy min-distance after 100 attempts; using fallback position');
        return terrain.findRandomInteriorPosition(2);
    }

    // ── Visuals ───────────────────────────────────────────────────────────────
    //
    // Each draw* method is a sprite placeholder — replace the Graphics calls
    // with scene.add.sprite / scene.add.image once assets are ready.
    // Coordinate origin (0,0) = ground anchor; buildings draw upward (−y).

    // Maltese limestone palette
    private static readonly PAL = {
        STONE:         0xd4a862,  // main wall — warm honey limestone
        STONE_SHADE:   0xb8904a,  // shadow face
        STONE_DARK:    0x9a7432,  // deep shadow / parapet edge
        WINDOW:        0x1a2c3a,  // window opening
        DOOR:          0x1a3a60,  // wooden door (deep blue)
        BALCONY_BLUE:  0x1a4a8a,  // gallarija — classic blue
        BALCONY_GREEN: 0x1a5a38,  // gallarija — green variant
        DOME:          0xc89848,  // church dome — slightly richer
        CROSS:         0x7a5825,  // bronze cross
        ROOF:          0xa88040,  // roof / parapet cap
    } as const;

    private createVisual(
        scene: Phaser.Scene,
        s: PlacedSettlement,
    ): Phaser.GameObjects.Container {
        const iso = isoProject(s.wx, s.wy);
        const gfx = scene.add.graphics();

        // Scale drives rendered size in iso space.
        // Village scale=5 → ~320px tall at iso coords (≈130px on screen at zoom 0.4).
        // Adjust label to sit above the scaled top.
        let buildScale: number;
        let labelY: number;

        if (s.type === 'village') {
            this.drawVillage(gfx);
            buildScale = 5;
            labelY = -64 * buildScale - 15;  // above cross top
        } else if (s.type === 'chapel') {
            this.drawChapel(gfx);
            buildScale = 4;
            labelY = -47 * buildScale - 12;
        } else {
            this.drawFarmstead(gfx);
            buildScale = 4;
            labelY = -30 * buildScale - 12;
        }

        gfx.setScale(buildScale);

        const fontSize = s.type === 'village' ? '14px' : '11px';
        const label = scene.add.text(0, labelY, s.name, {
            fontSize,
            color: '#f5e0c0',
            fontFamily: "'Lora', Georgia, serif",
            stroke: '#1a0a00',
            strokeThickness: 3,
        }).setOrigin(0.5, 1);

        return scene.add.container(iso.x, iso.y, [gfx, label]).setDepth(15);
    }

    /** Village — dense cluster + church dome. Placeholder for sprite sheet. */
    private drawVillage(g: Phaser.GameObjects.Graphics): void {
        const { STONE, STONE_SHADE, STONE_DARK, WINDOW, DOOR,
                BALCONY_BLUE, BALCONY_GREEN, DOME, CROSS, ROOF } = SettlementSystem.PAL;

        // ── Building cluster (left → right) ──────────────────────────────────
        // Each rect is one "building face" sprite placeholder
        g.fillStyle(STONE_SHADE, 1);
        g.fillRect(-38,  -12, 12, 12);   // far-left outbuilding

        g.fillStyle(STONE, 1);
        g.fillRect(-28,  -20, 16, 20);   // left building

        g.fillStyle(STONE, 1);
        g.fillRect(-14,  -28, 14, 28);   // centre-left (taller)

        g.fillStyle(STONE_SHADE, 1);
        g.fillRect(  -2, -32, 16, 32);   // centre (tallest — houses the bell tower)

        g.fillStyle(STONE, 1);
        g.fillRect(  16, -22, 14, 22);   // right building

        g.fillStyle(STONE_SHADE, 1);
        g.fillRect(  28, -10, 10, 10);   // far-right outbuilding

        // ── Parapet caps (roofline) ───────────────────────────────────────────
        g.fillStyle(ROOF, 1);
        g.fillRect(-40,  -12,  14, 3);
        g.fillRect(-30,  -20,  18, 3);
        g.fillRect(-16,  -28,  16, 3);
        g.fillRect(  -4, -32,  18, 3);
        g.fillRect(  14, -22,  16, 3);
        g.fillRect(  26, -10,  12, 3);

        // ── Bell tower shaft (centre building) ───────────────────────────────
        g.fillStyle(STONE, 1);
        g.fillRect(-4, -46, 10, 16);

        // ── Church dome ───────────────────────────────────────────────────────
        g.fillStyle(STONE_DARK, 1);
        g.fillRect(-6, -52, 14, 8);      // drum

        g.fillStyle(DOME, 1);
        g.fillCircle(1, -53, 9);         // dome sphere

        // Cross
        g.fillStyle(CROSS, 1);
        g.fillRect( 0, -64, 2,  8);      // vertical
        g.fillRect(-3, -60, 8,  2);      // horizontal

        // ── Windows ───────────────────────────────────────────────────────────
        g.fillStyle(WINDOW, 1);
        g.fillRect(-26, -15, 4, 5);      // left building
        g.fillRect(-11, -22, 4, 5);      // centre-left
        g.fillRect(  0, -25, 4, 5);      // centre, upper
        g.fillRect(  7, -25, 4, 5);
        g.fillRect(  0, -14, 4, 5);      // centre, lower
        g.fillRect( 18, -16, 4, 5);      // right building

        // ── Blue gallarija (enclosed balcony) — iconic Maltese detail ─────────
        g.fillStyle(BALCONY_BLUE, 1);
        g.fillRect( -1, -16, 9, 5);      // centre building

        g.fillStyle(BALCONY_GREEN, 1);
        g.fillRect(-12, -20, 7, 4);      // centre-left

        // ── Door ──────────────────────────────────────────────────────────────
        g.fillStyle(DOOR, 1);
        g.fillRect(  1,  -8, 5, 8);      // arched door (arch approximated by rect)
    }

    /** Farmstead — simple stone razzett. Placeholder for sprite. */
    private drawFarmstead(g: Phaser.GameObjects.Graphics): void {
        const { STONE, STONE_SHADE, STONE_DARK, WINDOW, DOOR, BALCONY_BLUE, ROOF } = SettlementSystem.PAL;

        // Main building body
        g.fillStyle(STONE, 1);
        g.fillRect(-18, -22, 36, 22);

        // Upper section (set back)
        g.fillStyle(STONE_SHADE, 1);
        g.fillRect(-10, -30, 20, 10);

        // Parapet caps
        g.fillStyle(ROOF, 1);
        g.fillRect(-20, -22, 38, 3);
        g.fillRect(-12, -30, 22, 3);

        // Shadow under eave
        g.fillStyle(STONE_DARK, 1);
        g.fillRect(-18, -19, 36, 2);

        // Windows
        g.fillStyle(WINDOW, 1);
        g.fillRect(-14, -16, 4, 5);
        g.fillRect( -4, -16, 4, 5);
        g.fillRect(  6, -16, 4, 5);
        g.fillRect( -5, -26, 4, 5);  // upper window

        // Balcony
        g.fillStyle(BALCONY_BLUE, 1);
        g.fillRect(-3, -10, 8, 4);

        // Door
        g.fillStyle(DOOR, 1);
        g.fillRect(-3,  -8, 6, 8);
    }

    /** Chapel — small kappella with bell tower. Placeholder for sprite. */
    private drawChapel(g: Phaser.GameObjects.Graphics): void {
        const { STONE, STONE_SHADE, STONE_DARK, WINDOW, DOOR, DOME, CROSS, ROOF } = SettlementSystem.PAL;

        // Nave body
        g.fillStyle(STONE, 1);
        g.fillRect(-14, -20, 28, 20);

        // Facade / bell tower
        g.fillStyle(STONE_SHADE, 1);
        g.fillRect( -8, -34, 16, 16);

        // Parapet caps
        g.fillStyle(ROOF, 1);
        g.fillRect(-16, -20, 30, 3);
        g.fillRect(-10, -34, 18, 3);

        // Small dome on facade
        g.fillStyle(DOME, 1);
        g.fillCircle(0, -36, 6);

        g.fillStyle(STONE_DARK, 1);
        g.fillRect(-3, -40, 6, 5);    // drum

        // Cross
        g.fillStyle(CROSS, 1);
        g.fillRect( 0, -47, 2, 6);
        g.fillRect(-2, -44, 6, 2);

        // Windows
        g.fillStyle(WINDOW, 1);
        g.fillRect(-10, -14, 4, 5);
        g.fillRect(  6, -14, 4, 5);
        g.fillRect( -2, -28, 5, 6);   // rose window hint on facade

        // Door arch
        g.fillStyle(DOOR, 1);
        g.fillRect( -3,  -8, 6, 8);
    }

    // ── Update loop ───────────────────────────────────────────────────────────

    update(shepherdX: number, shepherdY: number): void {
        for (const s of this.settlements) {
            const dist   = Math.hypot(shepherdX - s.wx, shepherdY - s.wy);
            const inside = dist < SETTLEMENT_INTERACT_RADIUS;

            if (inside && !this.insideIds.has(s.id)) {
                this.insideIds.add(s.id);
                this.onEnterSettlement(s);
            } else if (!inside && this.insideIds.has(s.id)) {
                this.insideIds.delete(s.id);
            }
        }
    }

    private onEnterSettlement(s: PlacedSettlement): void {
        this.callbacks.onEnter(s);
        this.save.addDiscovery(s.id);

        if (this.activeQuest?.def.to === s.id) {
            this.completeActiveQuest();
            return;
        }

        const done      = this.save.getQuestsDone();
        const available = s.quests.find(q => !done.includes(q.id));
        if (available) {
            this.callbacks.onQuestAvailable(s, available);
        }
    }

    // ── Quest management ──────────────────────────────────────────────────────

    acceptQuest(settlementId: string, questId: string): void {
        const s = this.settlements.find(s => s.id === settlementId);
        const q = s?.quests.find(q => q.id === questId);
        if (!s || !q) return;

        if (q.type === 'visit') {
            this.save.completeQuest(q.id);
            this.dispatchReward(q);
            return;
        }

        if (this.activeQuest) return;

        this.activeQuest = { def: q, fromId: settlementId, carryingItem: true };
    }

    private completeActiveQuest(): void {
        if (!this.activeQuest) return;
        const q = this.activeQuest.def;
        this.save.completeQuest(q.id);
        this.dispatchReward(q);
        this.activeQuest = null;
    }

    private dispatchReward(q: QuestDef): void {
        if (q.reward.treats)      this.callbacks.onTreats(q.reward.treats);
        if (q.reward.poemTrigger) this.callbacks.onPoemTrigger();
        this.callbacks.onQuestComplete(q);
    }

    getActiveQuest(): ActiveQuest | null {
        return this.activeQuest;
    }

    getMarkers(): SettlementMarker[] {
        return this.settlements.map(s => ({
            wx: s.wx, wy: s.wy, name: s.name, type: s.type,
        }));
    }

    destroy(): void {
        for (const s of this.settlements) s.icon.destroy();
        this.settlements.length = 0;
    }
}
