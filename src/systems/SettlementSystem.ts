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

    private createVisual(
        scene: Phaser.Scene,
        s: PlacedSettlement,
    ): Phaser.GameObjects.Container {
        const iso   = isoProject(s.wx, s.wy);
        const color = s.type === 'village'   ? 0xc8a060 :
                      s.type === 'chapel'    ? 0xd0c090 : 0x8a7050;
        const size  = s.type === 'village' ? 12 : 8;

        const gfx = scene.add.graphics();

        const traceDiamond = () => {
            gfx.beginPath();
            gfx.moveTo(0, -size);
            gfx.lineTo(size, 0);
            gfx.lineTo(0, size);
            gfx.lineTo(-size, 0);
            gfx.closePath();
        };

        gfx.fillStyle(color, 1);
        traceDiamond();
        gfx.fillPath();

        gfx.lineStyle(1.5, 0x3a2a10, 0.7);
        traceDiamond();
        gfx.strokePath();

        const fontSize = s.type === 'village' ? '14px' : '11px';
        const label = scene.add.text(0, -(size + 14), s.name, {
            fontSize,
            color: '#f5e0c0',
            fontFamily: "'Lora', Georgia, serif",
            stroke: '#1a0a00',
            strokeThickness: 3,
        }).setOrigin(0.5, 1);

        return scene.add.container(iso.x, iso.y, [gfx, label]).setDepth(15);
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

    destroy(): void {
        for (const s of this.settlements) s.icon.destroy();
        this.settlements.length = 0;
    }
}
