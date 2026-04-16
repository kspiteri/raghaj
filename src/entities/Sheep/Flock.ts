import * as Phaser from 'phaser';
import { SheepData } from './Sheep';
import { FLOCK_SIZE_INITIAL } from '../../config/constants';
import { isoProject } from '../../utils/iso';

const NUM_GROUPS   = 8;
const GROUP_SPREAD = 40;   // px — radius of each cluster
const HERD_SPREAD  = 280;  // px — how far groups are from the anchor
const SPRITE_SCALE = 0.12;
const GOAT_RATIO   = 0.15;

export default class Flock {
    readonly sheep: SheepData[] = [];
    private scene: Phaser.Scene;

    constructor(
        scene: Phaser.Scene,
        anchorX: number,
        anchorY: number,
        isSeaOrChannel?: (wx: number, wy: number) => boolean,
    ) {
        this.scene = scene;
        this.spawnClusters(anchorX, anchorY, FLOCK_SIZE_INITIAL, isSeaOrChannel);
    }

    private spawnClusters(
        cx: number,
        cy: number,
        count: number,
        isSeaOrChannel?: (wx: number, wy: number) => boolean,
    ): void {
        const perGroup = Math.floor(count / NUM_GROUPS);

        for (let g = 0; g < NUM_GROUPS; g++) {
            const angle = (g / NUM_GROUPS) * Math.PI * 2;
            const dist = HERD_SPREAD * (0.6 + Math.random() * 0.7);
            const gx = cx + Math.cos(angle) * dist;
            const gy = cy + Math.sin(angle) * dist;

            const groupCount = g === NUM_GROUPS - 1 ? count - perGroup * (NUM_GROUPS - 1) : perGroup;

            for (let i = 0; i < groupCount; i++) {
                let x = 0, y = 0;
                // Retry up to 8 times to avoid spawning in sea
                for (let attempt = 0; attempt < 8; attempt++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * GROUP_SPREAD;
                    x = gx + Math.cos(a) * r;
                    y = gy + Math.sin(a) * r;
                    if (!isSeaOrChannel || !isSeaOrChannel(x, y)) break;
                }

                const key = Math.random() < GOAT_RATIO ? 'goat' : 'sheep';
                const iso = isoProject(x, y);
                const sprite = this.scene.add.sprite(iso.x, iso.y, key)
                    .setScale(SPRITE_SCALE)
                    .setOrigin(0.5, 1.0)
                    .setDepth(x + y);
                sprite.play(`${key}-walk`);

                this.sheep.push({
                    x, y, vx: 0, vy: 0,
                    wanderAngle: Math.random() * Math.PI * 2,
                    sprite,
                    strayTimer: 0,
                    isStray: false,
                    isGuided: false,
                    isWild: false,
                });
            }
        }
    }

    addWild(x: number, y: number): void {
        const key = Math.random() < GOAT_RATIO ? 'goat' : 'sheep';
        const iso = isoProject(x, y);
        const sprite = this.scene.add.sprite(iso.x, iso.y, key)
            .setScale(SPRITE_SCALE)
            .setOrigin(0.5, 1.0)
            .setDepth(x + y)
            .setTint(0xaaaaaa);
        sprite.play(`${key}-walk`);
        this.sheep.push({
            x, y, vx: 0, vy: 0,
            wanderAngle: Math.random() * Math.PI * 2,
            sprite,
            strayTimer: 0,
            isStray: false,
            isGuided: false,
            isWild: true,
        });
    }

    syncSprites(): void {
        for (const s of this.sheep) {
            const iso = isoProject(s.x, s.y);
            s.sprite.setPosition(iso.x, iso.y);
            s.sprite.setDepth(s.x + s.y);
            // In iso, screen-right = (vx - vy) > 0
            const screenXVel = s.vx - s.vy;
            if (Math.abs(screenXVel) > 0.5) s.sprite.setFlipX(screenXVel < 0);
        }
    }

    destroy(): void {
        for (const s of this.sheep) s.sprite.destroy();
        this.sheep.length = 0;
    }
}
