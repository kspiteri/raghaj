import * as Phaser from 'phaser';
import BaseEntity from '../BaseEntity';
import { DogState, DogCommand } from './types';
import { nextDogState } from './DogStates';
import {
    DOG_SPEED,
    DOG_REPULSION_RADIUS,
    DOG_AUTONOMOUS_INTERVAL,
    DOG_STRAY_THRESHOLD,
    DOG_GATHER_RADIUS,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    DOG_STOP_DECAY_START_MS,
    TRUST_HIGH_THRESHOLD,
    TRUST_HIGH_SPEED_FACTOR,
    DOG_STOP_MAX_MS,
    MUR_SHEPHERD_RADIUS,
    EJJA_DURATION_MIN_MS,
    EJJA_DURATION_MAX_MS,
    IEQAF_DURATION_MIN_MS,
    EJJA_STRAY_DETOUR_MS,
    DOG_FOLLOW_OFFSET,
} from '../../config/constants';
import { SheepData } from '../Sheep/Sheep';
import { isoProject } from '../../utils/iso';
import DogTrust from './DogTrust';

const DOG_SPRITE_SCALE = 0.15;

export default class Dog extends BaseEntity {
    private sprite: Phaser.GameObjects.Sprite;
    private isSea: (wx: number, wy: number) => boolean;
    state: DogState = DogState.IDLE;

    private targetX: number;
    private targetY: number;
    private autonomousTimer = 0;

    // Trust
    private trust: DogTrust;
    private stopTimer      = 0;
    // Recalculated each IEQAF command based on current trust; persists until next IEQAF
    private stopMaxMs      = DOG_STOP_MAX_MS;

    // Ejja session
    private ejjaActive     = false;
    private ejjaTimer      = 0;
    private ejjaTotalMs    = 0;
    private ejjaStrayTimer = 0;

    // Fetch (auto-herd a newly joined wild sheep)
    private fetchSheep: SheepData | null = null;
    private fetchHome:  SheepData | null = null;

    constructor(scene: Phaser.Scene, x: number, y: number, isSea: (wx: number, wy: number) => boolean) {
        super(scene, x, y);
        this.isSea = isSea;
        this.targetX = x;
        this.targetY = y;
        this.trust = new DogTrust(scene, () => ({ x: this.x, y: this.y }));

        const iso = isoProject(x, y);
        this.sprite = scene.add.sprite(iso.x, iso.y, 'dog')
            .setScale(DOG_SPRITE_SCALE)
            .setOrigin(0.5, 1.0)
            .setDepth(x + y);
        this.sprite.play('dog-idle');
    }

    // ── Trust API ────────────────────────────────────────────────────────────

    getTrust(): number { return this.trust.getTrust(); }

    /** Returns 0–1 fraction of ejja time remaining, or null when not active. */
    getEjjaProgress(): number | null {
        if (!this.ejjaActive || this.ejjaTotalMs <= 0) return null;
        return Math.max(0, this.ejjaTimer / this.ejjaTotalMs);
    }

    addTrust(amount: number): void {
        this.trust.addTrust(amount);
    }

    giveTreat(): void {
        this.trust.giveTreat();
    }

    /**
     * Spam-able praise: up to PRAISE_MAX_COMBO rapid presses within PRAISE_WINDOW_MS.
     * Each press gives +1 trust and shows a floating +N above the dog.
     * Cooldown after the window closes = PRAISE_BASE_COOLDOWN_MS × combo count.
     */
    praise(): void {
        this.trust.praise();
    }

    /** Floating emoji/text above the dog that rises and fades over ~1s. */
    showHeartEffect(text: string): void {
        this.trust.showHeartEffect(text);
    }

    /** Returns false if trust is low and a random roll triggers an ignore. */
    canExecuteCommand(): boolean {
        return this.trust.canExecuteCommand();
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    receiveCommand(command: DogCommand, _shepherdX: number, _shepherdY: number): void {
        if (command !== 'BRAVU' && !this.canExecuteCommand()) return; // silently ignored

        if (command === 'BRAVU') {
            this.praise();
            return;
        }

        if (command === 'AGHTI') return; // treat giving handled in UIScene

        this.state = nextDogState(this.state, command);
        this.autonomousTimer = 0;
        this.stopTimer = 0;

        switch (command) {
            case 'MUR':
                this.targetX    = this.x;
                this.targetY    = this.y;
                this.ejjaActive     = false;
                this.ejjaTimer      = 0;
                this.ejjaStrayTimer = 0;
                break;
            case 'EJJA':
                this.ejjaActive = true;
                this.ejjaTimer  = Phaser.Math.Linear(
                    EJJA_DURATION_MIN_MS, EJJA_DURATION_MAX_MS, this.trust.getTrust() / 100,
                );
                this.ejjaTotalMs    = this.ejjaTimer;
                this.ejjaStrayTimer = 0;
                break;
            case 'IEQAF':
                this.targetX        = this.x;
                this.targetY        = this.y;
                this.ejjaActive     = false;
                this.ejjaTimer      = 0;
                this.ejjaStrayTimer = 0;
                this.stopMaxMs  = Phaser.Math.Linear(
                    IEQAF_DURATION_MIN_MS, DOG_STOP_MAX_MS, this.trust.getTrust() / 100,
                );
                break;
        }
    }

    // ── Autonomous tickers ───────────────────────────────────────────────────

    private get autonomousInterval(): number {
        return this.trust.getTrust() >= TRUST_HIGH_THRESHOLD
            ? DOG_AUTONOMOUS_INTERVAL * TRUST_HIGH_SPEED_FACTOR
            : DOG_AUTONOMOUS_INTERVAL;
    }

    tickAutonomous(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        if (this.fetchSheep)                       this.tickFetch();
        else if (this.ejjaActive)                  this.tickEJJA(sheep, shepherdX, shepherdY, delta);
        else if (this.state === DogState.IDLE)     this.tickMUR(sheep, shepherdX, shepherdY, delta);
    }

    /** Free mode — nudge stray sheep within MUR_SHEPHERD_RADIUS of shepherd. */
    private tickMUR(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        this.autonomousTimer += delta;
        if (this.autonomousTimer < this.autonomousInterval) return;
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

    /** Follow mode — continuously follows shepherd; periodically detours to push strays. */
    private tickEJJA(sheep: SheepData[], shepherdX: number, shepherdY: number, delta: number): void {
        // Hold a stray-detour target until its timer expires
        if (this.ejjaStrayTimer > 0) {
            this.ejjaStrayTimer -= delta;
            return;
        }

        // Periodic stray check
        this.autonomousTimer += delta;
        if (this.autonomousTimer >= this.autonomousInterval) {
            this.autonomousTimer = 0;

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
                this.ejjaStrayTimer = EJJA_STRAY_DETOUR_MS;
                this.state = DogState.HERDING;
                return;
            }
        }

        // Default: follow shepherd, staying behind them
        const toBehindX = this.x - shepherdX;
        const toBehindY = this.y - shepherdY;
        const toBehindDist = Math.hypot(toBehindX, toBehindY) || 1;
        this.targetX = shepherdX + (toBehindX / toBehindDist) * DOG_FOLLOW_OFFSET;
        this.targetY = shepherdY + (toBehindY / toBehindDist) * DOG_FOLLOW_OFFSET;
        this.state   = DogState.HERDING;
    }

    // ── Fetch ─────────────────────────────────────────────────────────────────

    /** Called when a wild sheep joins. Dog goes to collect it and herd it to the nearest flock member. */
    startFetch(newSheep: SheepData, flockSheep: SheepData[]): void {
        if (this.ejjaActive || this.state === DogState.STOPPED) return;

        let nearest: SheepData | null = null;
        let nearestDist = Infinity;
        for (const s of flockSheep) {
            if (s.isWild || s === newSheep) continue;
            const d = Math.hypot(s.x - newSheep.x, s.y - newSheep.y);
            if (d < nearestDist) { nearestDist = d; nearest = s; }
        }
        if (!nearest) return;

        this.fetchSheep = newSheep;
        this.fetchHome  = nearest;
        this.state      = DogState.HERDING;
        this.autonomousTimer = 0;
        this.updateFetchTarget();
    }

    private updateFetchTarget(): void {
        if (!this.fetchSheep || !this.fetchHome) return;
        const dx = this.fetchSheep.x - this.fetchHome.x;
        const dy = this.fetchSheep.y - this.fetchHome.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.targetX = this.fetchSheep.x + (dx / dist) * (DOG_REPULSION_RADIUS * 0.6);
        this.targetY = this.fetchSheep.y + (dy / dist) * (DOG_REPULSION_RADIUS * 0.6);
    }

    private tickFetch(): void {
        if (!this.fetchSheep || !this.fetchHome) return;
        const distToHome = Math.hypot(
            this.fetchSheep.x - this.fetchHome.x,
            this.fetchSheep.y - this.fetchHome.y,
        );
        if (distToHome <= DOG_GATHER_RADIUS) {
            this.fetchSheep = null;
            this.fetchHome  = null;
            this.state      = DogState.IDLE;
            return;
        }
        this.updateFetchTarget();
        this.state = DogState.HERDING;
    }

    // ── Guide assist ─────────────────────────────────────────────────────────

    /** Called each frame while Mexxi is active and shepherd is moving.
     *  Positions the dog ahead of the shepherd in the movement direction so
     *  its repulsion funnels guided sheep forward. */
    assistGuide(tx: number, ty: number): void {
        if (this.state === DogState.STOPPED) return;
        this.targetX = tx;
        this.targetY = ty;
        this.state   = DogState.HERDING;
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
        this.trust.tick(delta);

        // Ejja session timer
        if (this.ejjaActive) {
            this.ejjaTimer -= delta;
            if (this.ejjaTimer <= 0) {
                this.ejjaActive = false;
                if (this.state === DogState.HERDING) this.state = DogState.IDLE;
            }
        }

        // STOPPED state logic
        if (this.state === DogState.STOPPED) {
            this.stopTimer += delta;
            if (this.stopTimer > DOG_STOP_DECAY_START_MS) {
                this.trust.stopDecay(dt);
            }
            if (this.stopTimer >= this.stopMaxMs) {
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

        if (dist < (this.ejjaActive ? 12 : 6)) {
            // During ejja, stay near shepherd rather than going idle
            if (!this.ejjaActive) this.state = DogState.IDLE;
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
