import Phaser from 'phaser';
import BaseEntity from '../BaseEntity';
import { DogState, DogCommand } from './types';
import { nextDogState } from './DogStates';
import {
    DOG_SPEED,
    DOG_REPULSION_RADIUS,
    DOG_AUTONOMOUS_INTERVAL,
    DOG_STRAY_THRESHOLD,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    DOG_TRUST_INITIAL,
    PRAISE_BASE_COOLDOWN_MS,
    PRAISE_WINDOW_MS,
    PRAISE_MAX_COMBO,
    DOG_STOP_DECAY_START_MS,
    DOG_STOP_DECAY_RATE,
    DOG_IDLE_DECAY_INTERVAL_MS,
    TRUST_HIGH_THRESHOLD,
    TRUST_LOW_THRESHOLD,
    TRUST_LOW_IGNORE_CHANCE,
    TRUST_HIGH_SPEED_FACTOR,
    DOG_STOP_MAX_MS,
    MUR_SHEPHERD_RADIUS,
    TREAT_TRUST_BONUS,
} from '../../config/constants';
import { SheepData } from '../Sheep/Sheep';
import { isoProject } from '../../utils/iso';

const SCALE = 0.15;

export default class Dog extends BaseEntity {
    private sprite: Phaser.GameObjects.Sprite;
    private isSea: (wx: number, wy: number) => boolean;
    state: DogState = DogState.IDLE;

    private targetX: number;
    private targetY: number;
    private autonomousTimer = 0;

    // Trust
    trust: number = DOG_TRUST_INITIAL;
    private praiseTimer    = 0;   // cooldown remaining (ms)
    private praiseCombo    = 0;   // rapid presses counted so far
    private praiseWindow   = 0;   // window remaining to add more presses (ms)
    private stopTimer      = 0;
    private idleDecayTimer = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, isSea: (wx: number, wy: number) => boolean) {
        super(scene, x, y);
        this.isSea = isSea;
        this.targetX = x;
        this.targetY = y;

        const iso = isoProject(x, y);
        this.sprite = scene.add.sprite(iso.x, iso.y, 'dog')
            .setScale(SCALE)
            .setOrigin(0.5, 1.0)
            .setDepth(x + y);
        this.sprite.play('dog-idle');
    }

    // ── Trust API ────────────────────────────────────────────────────────────

    getTrust(): number { return this.trust; }

    addTrust(amount: number): void {
        this.trust = Phaser.Math.Clamp(this.trust + amount, 0, 100);
    }

    giveTreat(): void {
        this.addTrust(TREAT_TRUST_BONUS);
        this.showHeartEffect('❤️');
    }

    /**
     * Spam-able praise: up to PRAISE_MAX_COMBO rapid presses within PRAISE_WINDOW_MS.
     * Each press gives +1 trust and shows a floating +N above the dog.
     * Cooldown after the window closes = PRAISE_BASE_COOLDOWN_MS × combo count.
     */
    praise(): void {
        if (this.praiseTimer > 0) return; // on cooldown

        if (this.praiseWindow <= 0) {
            // Fresh press — start a new combo window
            this.praiseCombo = 0;
        }

        if (this.praiseCombo >= PRAISE_MAX_COMBO) return; // combo maxed

        this.praiseCombo++;
        this.praiseWindow = PRAISE_WINDOW_MS;
        this.addTrust(1);
        this.showHeartEffect(`❤️ +${this.praiseCombo}`);
    }

    /** Floating emoji/text above the dog that rises and fades over ~1s. */
    showHeartEffect(text: string): void {
        const iso = isoProject(this.x, this.y);
        const label = this.scene.add.text(iso.x, iso.y - 60, text, {
            fontSize: '18px',
        }).setOrigin(0.5, 1).setDepth(99999);

        this.scene.tweens.add({
            targets: label,
            y:       label.y - 40,
            alpha:   0,
            duration: 900,
            ease: 'Sine.easeOut',
            onComplete: () => label.destroy(),
        });
    }

    /** Returns false if trust is low and a random roll triggers an ignore. */
    canExecuteCommand(): boolean {
        if (this.trust >= TRUST_LOW_THRESHOLD) return true;
        return Math.random() > TRUST_LOW_IGNORE_CHANCE;
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    receiveCommand(command: DogCommand, shepherdX: number, shepherdY: number): void {
        if (command !== 'BRAVU' && !this.canExecuteCommand()) return; // silently ignored

        if (command === 'BRAVU') {
            this.praise();
            return;
        }

        this.state = nextDogState(this.state, command);
        this.autonomousTimer = 0;
        this.stopTimer = 0;

        switch (command) {
            case 'MUR':
                this.targetX = this.x;
                this.targetY = this.y;
                break;
            case 'EJJA':
                this.targetX = shepherdX;
                this.targetY = shepherdY;
                break;
            case 'IEQAF':
                this.targetX = this.x;
                this.targetY = this.y;
                break;
        }
    }

    // ── Autonomous tickers ───────────────────────────────────────────────────

    tickAutonomous(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        if (this.state === DogState.IDLE)    this.tickMUR(sheep, shepherdX, shepherdY, delta);
        if (this.state === DogState.HERDING) this.tickEJJA(sheep, shepherdX, shepherdY, delta);
    }

    /** Free mode — nudge stray sheep within MUR_SHEPHERD_RADIUS of shepherd. */
    private tickMUR(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        this.autonomousTimer += delta;
        const interval = this.trust >= TRUST_HIGH_THRESHOLD
            ? DOG_AUTONOMOUS_INTERVAL * TRUST_HIGH_SPEED_FACTOR
            : DOG_AUTONOMOUS_INTERVAL;
        if (this.autonomousTimer < interval) return;
        this.autonomousTimer = 0;

        if (sheep.length === 0) return;

        let farthest: SheepData | null = null;
        let maxDist = DOG_STRAY_THRESHOLD;

        for (const s of sheep) {
            const distToShepherd = Math.hypot(s.x - shepherdX, s.y - shepherdY);
            if (distToShepherd > MUR_SHEPHERD_RADIUS) continue; // only care about nearby sheep
            if (distToShepherd > maxDist) {
                maxDist = distToShepherd;
                farthest = s;
            }
        }

        if (!farthest) return;

        const dx = shepherdX - farthest.x;
        const dy = shepherdY - farthest.y;
        const dist = Math.hypot(dx, dy);
        this.targetX = farthest.x - (dx / dist) * (DOG_REPULSION_RADIUS * 0.6);
        this.targetY = farthest.y - (dy / dist) * (DOG_REPULSION_RADIUS * 0.6);
        this.state = DogState.HERDING;
    }

    /** Follow mode — target farthest stray first; else position between shepherd and flock. */
    private tickEJJA(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        this.autonomousTimer += delta;
        const interval = this.trust >= TRUST_HIGH_THRESHOLD
            ? DOG_AUTONOMOUS_INTERVAL * TRUST_HIGH_SPEED_FACTOR
            : DOG_AUTONOMOUS_INTERVAL;
        if (this.autonomousTimer < interval) return;
        this.autonomousTimer = 0;

        if (sheep.length === 0) return;

        // Prefer targeting stray sheep
        let farthestStray: SheepData | null = null;
        let maxStrayDist = 0;
        for (const s of sheep) {
            if (!s.isStray) continue;
            const d = Math.hypot(s.x - shepherdX, s.y - shepherdY);
            if (d > maxStrayDist) { maxStrayDist = d; farthestStray = s; }
        }

        if (farthestStray) {
            const dx = shepherdX - farthestStray.x;
            const dy = shepherdY - farthestStray.y;
            const dist = Math.hypot(dx, dy);
            this.targetX = farthestStray.x - (dx / dist) * (DOG_REPULSION_RADIUS * 0.6);
            this.targetY = farthestStray.y - (dy / dist) * (DOG_REPULSION_RADIUS * 0.6);
            return;
        }

        // No strays — position between shepherd and flock centroid
        let cx = 0, cy = 0;
        for (const s of sheep) { cx += s.x; cy += s.y; }
        cx /= sheep.length;
        cy /= sheep.length;

        this.targetX = (shepherdX + cx) / 2;
        this.targetY = (shepherdY + cy) / 2;
    }

    // ── Repulsion ────────────────────────────────────────────────────────────

    getRepulsionVector(sx: number, sy: number): { x: number; y: number } {
        const dx = sx - this.x;
        const dy = sy - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist === 0 || dist > DOG_REPULSION_RADIUS) return { x: 0, y: 0 };

        const strength = 1 - dist / DOG_REPULSION_RADIUS;
        return { x: (dx / dist) * strength, y: (dy / dist) * strength };
    }

    // ── Update ───────────────────────────────────────────────────────────────

    update(delta: number): void {
        const dt = delta / 1000;

        // Trust timers
        if (this.praiseTimer > 0)    this.praiseTimer  = Math.max(0, this.praiseTimer - delta);
        if (this.praiseWindow > 0) {
            this.praiseWindow -= delta;
            if (this.praiseWindow <= 0 && this.praiseCombo > 0) {
                // Window closed — start cooldown proportional to combo count
                this.praiseTimer = PRAISE_BASE_COOLDOWN_MS * this.praiseCombo;
                this.praiseCombo = 0;
            }
        }
        if (this.idleDecayTimer > 0)  this.idleDecayTimer -= delta;
        if (this.idleDecayTimer <= 0) {
            this.addTrust(-1);
            this.idleDecayTimer = DOG_IDLE_DECAY_INTERVAL_MS;
        }

        // STOPPED state logic
        if (this.state === DogState.STOPPED) {
            this.stopTimer += delta;
            if (this.stopTimer > DOG_STOP_DECAY_START_MS) {
                this.addTrust(-DOG_STOP_DECAY_RATE * dt);
            }
            if (this.stopTimer >= DOG_STOP_MAX_MS) {
                this.state = DogState.IDLE;
                this.stopTimer = 0;
            }
            this.sprite.play('dog-idle', true);
            return;
        } else {
            this.stopTimer = 0;
        }

        if (this.state === DogState.IDLE) {
            this.sprite.play('dog-idle', true);
            return;
        }

        // Clamp target to world bounds
        this.targetX = Phaser.Math.Clamp(this.targetX, 0, WORLD_WIDTH);
        this.targetY = Phaser.Math.Clamp(this.targetY, 0, WORLD_HEIGHT);

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 6) {
            this.state = DogState.IDLE;
            this.sprite.play('dog-idle', true);
            return;
        }

        const speed = Math.min(DOG_SPEED * dt, dist);
        const newX = this.x + (dx / dist) * speed;
        const newY = this.y + (dy / dist) * speed;
        this.x = this.isSea(newX, this.y) ? this.x : newX;
        this.y = this.isSea(this.x, newY) ? this.y : newY;

        const iso = isoProject(this.x, this.y);
        this.sprite.setPosition(iso.x, iso.y);
        this.sprite.setDepth(this.x + this.y);
        this.sprite.setFlipX((dx - dy) < 0);
        this.sprite.play('dog-walk', true);
    }

    destroy(): void {
        this.sprite.destroy();
    }
}
