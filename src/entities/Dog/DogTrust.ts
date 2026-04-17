import * as Phaser from 'phaser';
import { isoProject } from '../../utils/iso';
import { FONT } from '../../config/fonts';
import {
    DOG_TRUST_INITIAL, TRUST_LOW_THRESHOLD, TRUST_LOW_IGNORE_CHANCE,
    PRAISE_BASE_COOLDOWN_MS, PRAISE_WINDOW_MS, PRAISE_MAX_COMBO,
    DOG_IDLE_DECAY_INTERVAL_MS, TREAT_TRUST_BONUS, DOG_STOP_DECAY_RATE,
} from '../../config/constants';

export default class DogTrust {
    trust = DOG_TRUST_INITIAL;
    private praiseTimer    = 0;
    private praiseCombo    = 0;
    private praiseWindow   = 0;
    private idleDecayTimer = DOG_IDLE_DECAY_INTERVAL_MS;

    constructor(
        private scene: Phaser.Scene,
        private getDogPos: () => { x: number; y: number },
    ) {}

    getTrust(): number { return this.trust; }

    addTrust(amount: number): void {
        this.trust = Phaser.Math.Clamp(this.trust + amount, 0, 100);
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

    giveTreat(): void {
        this.addTrust(TREAT_TRUST_BONUS);
        this.showHeartEffect('❤️');
    }

    /** Floating emoji/text above the dog that rises and fades over ~1s. */
    showHeartEffect(text: string): void {
        const pos = this.getDogPos();
        const iso = isoProject(pos.x, pos.y);
        const label = this.scene.add.text(iso.x, iso.y - 60, text, {
            fontSize: '18px', fontFamily: FONT,
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

    stopDecay(dt: number): void {
        this.addTrust(-DOG_STOP_DECAY_RATE * dt);
    }

    /** Process the three trust timer blocks from Dog.update(). */
    tick(delta: number): void {
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
    }
}
