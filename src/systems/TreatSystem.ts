import Phaser from 'phaser';
import Shepherd from '../entities/Shepherd';
import Dog from '../entities/Dog/Dog';
import { isoProject } from '../utils/iso';
import {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    TREAT_COLLECT_RADIUS,
    TREAT_GIVE_RADIUS,
    TREAT_MAX_CARRY,
    TREAT_RESPAWN_MS,
} from '../config/constants';

interface TreatData {
    x: number;
    y: number;
    sprite: Phaser.GameObjects.Text;
    respawnTimer: number;
    active: boolean;
}

export default class TreatSystem {
    private treats: TreatData[] = [];
    private isSea: (wx: number, wy: number) => boolean;
    private scene: Phaser.Scene;

    constructor(
        scene: Phaser.Scene,
        count: number,
        isSea: (wx: number, wy: number) => boolean,
        shepherd: Shepherd,
    ) {
        this.isSea = isSea;
        this.scene = scene;

        for (let i = 0; i < count; i++) {
            const { x, y } = this.randomNearPosition(shepherd.x, shepherd.y);
            const iso = isoProject(x, y);
            const sprite = scene.add.text(iso.x, iso.y - 12, '🍖', { fontSize: '16px' })
                .setOrigin(0.5, 1)
                .setDepth(x + y + 1);
            this.treats.push({ x, y, sprite, respawnTimer: 0, active: true });
        }
    }

    update(delta: number, shepherd: Shepherd, dog: Dog): void {
        for (const t of this.treats) {
            if (!t.active) {
                t.respawnTimer -= delta;
                if (t.respawnTimer <= 0) {
                    const pos = this.randomNearPosition(shepherd.x, shepherd.y);
                    t.x = pos.x;
                    t.y = pos.y;
                    const iso = isoProject(t.x, t.y);
                    t.sprite.setPosition(iso.x, iso.y - 12);
                    t.sprite.setDepth(t.x + t.y + 1);
                    t.sprite.setVisible(true);
                    t.active = true;
                }
                continue;
            }

            // Shepherd collects treat
            if (shepherd.treatCount < TREAT_MAX_CARRY) {
                const dist = Math.hypot(shepherd.x - t.x, shepherd.y - t.y);
                if (dist < TREAT_COLLECT_RADIUS) {
                    t.active = false;
                    t.respawnTimer = TREAT_RESPAWN_MS;
                    t.sprite.setVisible(false);
                    shepherd.treatCount++;
                    continue;
                }
            }
        }

        // Shepherd gives treat to dog by walking toward it
        if (shepherd.treatCount > 0 && shepherd.isMoving) {
            const dist = Math.hypot(shepherd.x - dog.x, shepherd.y - dog.y);
            if (dist < TREAT_GIVE_RADIUS) {
                // Check shepherd is moving toward dog (dot product > 0)
                const dogDirX = dog.x - shepherd.x;
                const dogDirY = dog.y - shepherd.y;
                const dot = shepherd.velocity.x * dogDirX + shepherd.velocity.y * dogDirY;
                if (dot > 0) {
                    shepherd.treatCount--;
                    dog.giveTreat();
                }
            }
        }
    }

    private randomNearPosition(cx: number, cy: number): { x: number; y: number } {
        const cam   = this.scene.cameras.main;
        const halfW = (cam.width  / cam.zoom) * 0.45;
        const halfH = (cam.height / cam.zoom) * 0.45;

        let x: number, y: number;
        let attempts = 0;
        do {
            x = Phaser.Math.Clamp(cx + (Math.random() * 2 - 1) * halfW, 0, WORLD_WIDTH);
            y = Phaser.Math.Clamp(cy + (Math.random() * 2 - 1) * halfH, 0, WORLD_HEIGHT);
            attempts++;
        } while (this.isSea(x, y) && attempts < 20);
        return { x, y };
    }

    destroy(): void {
        for (const t of this.treats) t.sprite.destroy();
        this.treats.length = 0;
    }
}
