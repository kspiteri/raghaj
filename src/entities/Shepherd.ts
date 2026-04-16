import * as Phaser from 'phaser';
import BaseEntity from './BaseEntity';
import { SHEPHERD_RUN_SPEED, WORLD_WIDTH, WORLD_HEIGHT, GUIDE_DURATION_MS, GUIDE_COOLDOWN_MS } from '../config/constants';
import { isoProject } from '../utils/iso';

const SCALE = 0.25;

export default class Shepherd extends BaseEntity {
    private sprite: Phaser.GameObjects.Sprite;
    readonly velocity = { x: 0, y: 0 };
    private facingRight = true;
    private isSea: (wx: number, wy: number) => boolean;
    isMoving = false;

    // Treat inventory
    treatCount = 0;

    // Guide ability
    guideActive   = false;
    guideCooldown = 0;   // ms remaining on cooldown
    private guideTimer = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, isSea: (wx: number, wy: number) => boolean) {
        super(scene, x, y);
        this.isSea = isSea;
        const iso = isoProject(x, y);
        this.sprite = scene.add.sprite(iso.x, iso.y, 'shepherd')
            .setScale(SCALE)
            .setOrigin(0.5, 1.0)
            .setDepth(x + y)
            .setFrame(0);
    }

    // Called by UIScene joystick / keyboard (vx/vy already iso-transformed)
    setVelocity(vx: number, vy: number, moving: boolean, speed = SHEPHERD_RUN_SPEED): void {
        this.velocity.x = vx * speed;
        this.velocity.y = vy * speed;
        this.isMoving = moving;
        // In iso, screen-right direction = (vx - vy) > 0
        const screenXDir = vx - vy;
        if (Math.abs(screenXDir) > 0.05) this.facingRight = screenXDir > 0;
    }

    /** Consume one treat. Returns true if a treat was available. */
    giveOneTreat(): boolean {
        if (this.treatCount <= 0) return false;
        this.treatCount--;
        return true;
    }

    /** Activate guide ability. Returns false if on cooldown. */
    activateGuide(): boolean {        if (this.guideCooldown > 0) return false;
        this.guideActive   = true;
        this.guideTimer    = GUIDE_DURATION_MS;
        this.guideCooldown = GUIDE_COOLDOWN_MS;
        return true;
    }

    update(delta: number): void {
        const dt = delta / 1000;
        const nx = Phaser.Math.Clamp(this.x + this.velocity.x * dt, 0, WORLD_WIDTH);
        const ny = Phaser.Math.Clamp(this.y + this.velocity.y * dt, 0, WORLD_HEIGHT);
        // Coast sliding: try each axis independently so shepherd slides along shoreline
        this.x = this.isSea(nx, this.y) ? this.x : nx;
        this.y = this.isSea(this.x, ny) ? this.y : ny;

        // Guide timers
        if (this.guideActive) {
            this.guideTimer -= delta;
            if (this.guideTimer <= 0) this.guideActive = false;
        }
        if (this.guideCooldown > 0) this.guideCooldown = Math.max(0, this.guideCooldown - delta);

        const iso = isoProject(this.x, this.y);
        this.sprite.setPosition(iso.x, iso.y);
        this.sprite.setDepth(this.x + this.y);
        this.sprite.setFlipX(!this.facingRight);

        if (this.isMoving) {
            if (!this.sprite.anims.isPlaying) this.sprite.play('shepherd-walk');
        } else {
            this.sprite.anims.stop();
            this.sprite.setFrame(0);
        }

        this.scene.cameras.main.centerOn(iso.x, iso.y);
    }

    destroy(): void {
        this.sprite.destroy();
    }
}
