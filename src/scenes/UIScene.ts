import * as Phaser from 'phaser';
import CommandSystem, { COMMANDS } from '../systems/CommandSystem';
import Shepherd from '../entities/Shepherd';
import Dog from '../entities/Dog/Dog';
import { Poem } from '../systems/PoetrySystem';
import {
    GUIDE_COOLDOWN_MS, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
    SHEPHERD_WALK_SPEED, SHEPHERD_RUN_SPEED, TREAT_GIVE_RADIUS,
} from '../config/constants';
import { isoJoystickTransform } from '../utils/iso';
import MinimapController  from './MinimapController';
import JoystickController from './JoystickController';
import PoemOverlay        from './PoemOverlay';

type ControlMode = 'keyboard' | 'touch';

const FONT         = "'Lora', Georgia, serif";
const FONT_DISPLAY = "'Cinzel', Georgia, serif";

// Keyboard shortcut labels matching COMMANDS order
const CMD_KEYS = ['1', '2', '3', '4'];

const CMD_ROW_H    = 56;   // command button row height
const STATUS_BAR_H = 36;   // status + gwida bar height
const HUD_H        = CMD_ROW_H + STATUS_BAR_H;

export default class UIScene extends Phaser.Scene {
    private commandSystem!: CommandSystem;
    private shepherd!: Shepherd;
    private dog!: Dog;

    private controlMode: ControlMode = 'touch';

    private minimap!:  MinimapController;
    private joystick!: JoystickController;
    private poem!:     PoemOverlay;

    // Status bar objects (recreated on layout)
    private statusBar!:   Phaser.GameObjects.Rectangle;
    private toggleBtn!:   Phaser.GameObjects.Text;
    private moodIcon!:    Phaser.GameObjects.Text;
    private treatText!:   Phaser.GameObjects.Text;
    private trustText!:   Phaser.GameObjects.Text;
    private guidePill!:   Phaser.GameObjects.Rectangle;
    private guideFill!:   Phaser.GameObjects.Rectangle;
    private guideLabel!:  Phaser.GameObjects.Text;
    private guideTooltip: Phaser.GameObjects.Container | null = null;

    // Command row (recreated on layout)
    private cmdRow!: Phaser.GameObjects.Rectangle;
    private cmdButtons: Phaser.GameObjects.Rectangle[] = [];
    private cmdRowItems: Phaser.GameObjects.GameObject[] = [];
    private cmdTooltip:    Phaser.GameObjects.Container | null = null;
    private treatBtn:      Phaser.GameObjects.Rectangle | null = null;
    private treatBtnLabel: Phaser.GameObjects.Text | null      = null;
    private ejjaFill:      Phaser.GameObjects.Rectangle | null = null;
    private ejjaFillMaxW   = 0;

    // Keyboard
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    private shift!: Phaser.Input.Keyboard.Key;

    constructor() {
        super({ key: 'UIScene' });
    }

    init(data: { commandSystem: CommandSystem; shepherd: Shepherd; dog: Dog }): void {
        this.commandSystem = data.commandSystem;
        this.shepherd      = data.shepherd;
        this.dog           = data.dog;
    }

    create(): void {
        // Auto-detect control mode
        const hasTouch     = this.sys.game.device.input.touch || navigator.maxTouchPoints > 0;
        this.controlMode   = hasTouch ? 'touch' : 'keyboard';

        this.poem    = new PoemOverlay(this);
        this.minimap = new MinimapController(this);
        this.joystick = new JoystickController(this, this.shepherd, HUD_H, () => this.controlMode);

        this.minimap.build();
        this.joystick.build((px, py) => this.minimap.isPointerInside(px, py));
        this.bindKeyboard();
        this.layout();

        this.scale.on('resize', this.layout, this);
        this.events.on('show-poem',   (poem: Poem)   => this.poem.display(poem));
        this.events.on('mood-update', (mood: number) => this.updateMoodIcon(mood));

        // Mouse wheel zoom
        this.input.on('wheel', (
            _ptr: Phaser.Input.Pointer,
            _objs: unknown,
            _dx: number,
            dy: number,
        ) => {
            const cam = this.scene.get('GameScene').cameras.main;
            const factor = dy > 0 ? (1 - ZOOM_STEP) : (1 + ZOOM_STEP);
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX));
        });

        // Keyboard zoom: = / - (plus/minus)
        this.input.keyboard?.on('keydown-PLUS',  () => this.stepZoom(+1));
        this.input.keyboard?.on('keydown-MINUS', () => this.stepZoom(-1));
        this.input.keyboard?.on('keydown-EQUALS', () => this.stepZoom(+1)); // = without shift
        this.input.keyboard?.on('keydown-M', () => this.minimap.toggle());
    }

    update(): void {
        // Keyboard movement
        if (this.controlMode === 'keyboard' && this.cursors) {
            const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
            const right = this.cursors.right.isDown || this.wasd.D.isDown;
            const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
            const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

            let vx = 0, vy = 0;
            if (left)  vx -= 1;
            if (right) vx += 1;
            if (up)    vy -= 1;
            if (down)  vy += 1;

            if (vx !== 0 || vy !== 0) {
                const len = Math.hypot(vx, vy);
                const iso = isoJoystickTransform(vx / len, vy / len);
                const speed = this.shift?.isDown ? SHEPHERD_RUN_SPEED : SHEPHERD_WALK_SPEED;
                this.shepherd.setVelocity(iso.x, iso.y, true, speed);
            } else {
                this.shepherd.setVelocity(0, 0, false);
            }
        }

        // Guide pill cooldown fill
        const cd     = this.shepherd.guideCooldown;
        const filled = cd > 0 ? (1 - cd / GUIDE_COOLDOWN_MS) : 1;
        if (this.guideFill && this.guidePill) {
            this.guideFill.width = Math.max(2, filled * this.guidePill.width);
            const ready = cd <= 0;
            this.guidePill.setFillStyle(ready ? 0x1a6060 : 0x0d3030, ready ? 0.88 : 0.6);
            this.guideLabel?.setAlpha(ready ? 1 : 0.5);
        }

        // Live HUD text
        this.treatText?.setText(`🍖 ${this.shepherd.treatCount}`);
        this.trustText?.setText(`❤️ ${Math.round(this.dog.getTrust())}`);

        // Ejja timer bar
        if (this.ejjaFill) {
            const progress = this.dog.getEjjaProgress();
            if (progress !== null) {
                this.ejjaFill.setVisible(true).setSize(Math.max(1, progress * this.ejjaFillMaxW), this.ejjaFill.height);
            } else {
                this.ejjaFill.setVisible(false);
            }
        }
        if (this.treatBtn && this.treatBtnLabel) {
            const canGive = this.shepherd.treatCount > 0 &&
                Math.hypot(this.shepherd.x - this.dog.x, this.shepherd.y - this.dog.y) < TREAT_GIVE_RADIUS;
            const a = canGive ? 1 : 0.3;
            this.treatBtn.setAlpha(a);
            this.treatBtnLabel.setAlpha(a);
        }
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    private bindKeyboard(): void {
        if (!this.input.keyboard) return;

        this.cursors = this.input.keyboard.createCursorKeys();
        this.shift   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.wasd = {
            W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        CMD_KEYS.forEach((key, i) => {
            this.input.keyboard!.on(`keydown-${key}`, () => {
                if (COMMANDS[i]) this.commandSystem.dispatch(COMMANDS[i].command);
            });
        });

        this.input.keyboard.on('keydown-G', () => this.shepherd.activateGuide());
    }

    private stepZoom(direction: 1 | -1): void {
        const cam = this.scene.get('GameScene').cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + direction * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
    }

    // ── Control mode toggle ───────────────────────────────────────────────────

    private toggleControlMode(): void {
        this.controlMode = this.controlMode === 'touch' ? 'keyboard' : 'touch';
        if (this.controlMode === 'keyboard' && this.joystick) {
            this.joystick.cancelAndHide();
        }
        this.layout();
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    private layout(): void {
        const { width, height } = this.scale;

        this.buildStatusBar(width, height);
        this.buildCommandRow(width, height);
        this.minimap.position();

        this.poem.build(height);
        this.poem.setPosition(width / 2, height / 2 - HUD_H / 2);
    }

    // ── Status bar ────────────────────────────────────────────────────────────

    private buildStatusBar(width: number, height: number): void {
        this.statusBar?.destroy();
        this.toggleBtn?.destroy();
        this.moodIcon?.destroy();
        this.treatText?.destroy();
        this.trustText?.destroy();
        this.guidePill?.destroy();
        this.guideFill?.destroy();
        this.guideLabel?.destroy();
        this.guideTooltip?.destroy();
        this.guideTooltip = null;

        const y = height - HUD_H;

        this.statusBar = this.add.rectangle(width / 2, y + STATUS_BAR_H / 2, width, STATUS_BAR_H, 0x1a1008, 0.82)
            .setDepth(199);

        const cy = y + STATUS_BAR_H / 2;
        let x = 10;

        // Toggle (far left)
        this.toggleBtn = this.add.text(x, cy, this.controlMode === 'keyboard' ? '⌨️' : '👆', {
            fontSize: '17px',
        }).setOrigin(0, 0.5).setDepth(200).setInteractive({ useHandCursor: true });
        this.toggleBtn.on('pointerdown', () => this.toggleControlMode());
        x += 36;

        // Mood
        this.moodIcon = this.add.text(x, cy, '😐', { fontSize: '18px' })
            .setOrigin(0, 0.5).setDepth(200);
        x += 30;

        // Treats
        this.treatText = this.add.text(x, cy, '🍖 0', { fontSize: '12px', color: '#f5e6c8', fontFamily: FONT })
            .setOrigin(0, 0.5).setDepth(200);
        x += 56;

        // Trust
        this.trustText = this.add.text(x, cy, '❤️ 30', { fontSize: '12px', color: '#f5e6c8', fontFamily: FONT })
            .setOrigin(0, 0.5).setDepth(200);
        x += 60;

        // Map toggle
        this.minimap.createToggleButton(x, cy);

        // Mexxi pill (right side)
        const pillW = 90;
        const pillX = width - pillW / 2 - 10;

        const guideTooltipText = this.add.text(0, 0, '', {
            fontSize: '11px', color: '#f5e6c8', fontFamily: FONT, align: 'center',
        }).setOrigin(0.5);
        const guideTooltipBg = this.add.rectangle(0, 0, 10, 10, 0x1a0f05, 0.92).setOrigin(0.5);
        this.guideTooltip = this.add.container(0, 0, [guideTooltipBg, guideTooltipText])
            .setDepth(210).setVisible(false);

        this.guidePill = this.add.rectangle(pillX, cy, pillW, STATUS_BAR_H - 10, 0x1a6060, 0.88)
            .setDepth(200).setInteractive({ useHandCursor: true });
        this.guidePill.on('pointerover', () => {
            guideTooltipText.setText('Nearby sheep follow\nyou for 8 seconds');
            const padX = 14, padY = 8;
            guideTooltipBg.setSize(guideTooltipText.width + padX * 2, guideTooltipText.height + padY * 2);
            this.guideTooltip?.setPosition(pillX, cy - STATUS_BAR_H / 2 - guideTooltipBg.height / 2 - 4).setVisible(true);
        });
        this.guidePill.on('pointerout',  () => this.guideTooltip?.setVisible(false));
        this.guidePill.on('pointerdown', () => {
            this.shepherd.activateGuide();
            this.guideTooltip?.setVisible(false);
        });

        this.guideFill = this.add.rectangle(pillX - pillW / 2, cy, pillW, STATUS_BAR_H - 10, 0x40d0d0, 0.35)
            .setOrigin(0, 0.5).setDepth(201);

        const kbHint = this.controlMode === 'keyboard' ? ' [G]' : '';
        this.guideLabel = this.add.text(pillX, cy, `Mexxi${kbHint}`, {
            fontSize: '11px', color: '#a0f0f0', fontStyle: 'bold', fontFamily: FONT_DISPLAY,
        }).setOrigin(0.5, 0.5).setDepth(202);
    }

    // ── Command row ───────────────────────────────────────────────────────────

    private buildCommandRow(width: number, height: number): void {
        this.cmdRow?.destroy();
        this.cmdButtons.forEach(b => b.destroy());
        this.cmdRowItems.forEach(o => (o as Phaser.GameObjects.GameObject).destroy());
        this.cmdTooltip?.destroy();
        this.cmdButtons  = [];
        this.cmdRowItems = [];
        this.treatBtn      = null;
        this.treatBtnLabel = null;
        this.ejjaFill      = null;
        this.ejjaFillMaxW  = 0;

        const rowY = height - CMD_ROW_H;
        const btnW = width / COMMANDS.length;

        this.cmdRow = this.add.rectangle(width / 2, height - CMD_ROW_H / 2, width, CMD_ROW_H, 0x120c04, 0.90)
            .setDepth(199);

        // Shared tooltip — one instance repositioned on hover
        const tooltipText = this.add.text(0, 0, '', {
            fontSize: '11px', color: '#f5e6c8', fontFamily: FONT, align: 'center',
        }).setOrigin(0.5);
        const tooltipBg = this.add.rectangle(0, 0, 10, 10, 0x1a0f05, 0.92).setOrigin(0.5);
        // bg drawn behind text inside container
        this.cmdTooltip = this.add.container(0, 0, [tooltipBg, tooltipText])
            .setDepth(210).setVisible(false);

        COMMANDS.forEach((def, i) => {
            const cx  = i * btnW + btnW / 2;
            const cy  = height - CMD_ROW_H / 2;

            const isAghti  = def.command === 'AGHTI';
            const isBravu  = def.command === 'BRAVU';
            const baseFill = isBravu ? 0x3d2010 : isAghti ? 0x1e3020 : 0x1e1408;
            const hitFill  = isBravu ? 0x8a4020 : isAghti ? 0x3a7040 : 0x4a3020;

            const btn = this.add.rectangle(cx, cy, btnW - 2, CMD_ROW_H - 2, baseFill, 0.0)
                .setDepth(200).setInteractive({ useHandCursor: true });
            this.cmdButtons.push(btn);

            if (i > 0) {
                this.cmdRowItems.push(
                    this.add.rectangle(i * btnW, cy, 1, CMD_ROW_H - 8, 0x6a5040, 0.4).setDepth(200),
                );
            }

            const labelColor = isBravu ? '#f0c080' : isAghti ? '#a0f0b0' : '#f0e0c0';
            const labelText = this.add.text(cx, cy, def.label, {
                fontSize: '15px', color: labelColor, fontStyle: 'bold',
                fontFamily: FONT_DISPLAY,
            }).setOrigin(0.5).setDepth(201);
            this.cmdRowItems.push(labelText);

            if (isAghti) {
                this.treatBtn      = btn;
                this.treatBtnLabel = labelText;
            }

            if (def.command === 'EJJA') {
                const barH = 3;
                const barW = btnW - 8;
                this.ejjaFillMaxW = barW;
                // background track
                this.cmdRowItems.push(
                    this.add.rectangle(cx, height - barH / 2 - 1, barW, barH, 0x2a2010, 0.7).setDepth(200),
                );
                // fill bar (starts hidden)
                this.ejjaFill = this.add.rectangle(cx - barW / 2, height - barH / 2 - 1, 0, barH, 0x60c080, 0.85)
                    .setOrigin(0, 0.5).setDepth(201).setVisible(false);
                this.cmdRowItems.push(this.ejjaFill);
            }

            if (this.controlMode === 'keyboard' && CMD_KEYS[i]) {
                this.cmdRowItems.push(
                    this.add.text(cx + btnW / 2 - 6, rowY + 4, `[${CMD_KEYS[i]}]`, {
                        fontSize: '8px', color: '#907060', fontFamily: FONT_DISPLAY,
                    }).setOrigin(1, 0).setDepth(201),
                );
            }

            btn.on('pointerover', () => {
                btn.setFillStyle(hitFill, 0.6);
                tooltipText.setText(def.description);
                const padX = 14, padY = 8;
                tooltipBg.setSize(tooltipText.width + padX * 2, tooltipText.height + padY * 2);
                this.cmdTooltip
                    ?.setPosition(cx, rowY - tooltipBg.height / 2 - 6)
                    .setVisible(true);
            });
            btn.on('pointerout', () => {
                btn.setFillStyle(baseFill, 0.0);
                this.cmdTooltip?.setVisible(false);
            });
            if (isAghti) {
                btn.on('pointerdown', () => {
                    this.cmdTooltip?.setVisible(false);
                    const dist = Math.hypot(this.shepherd.x - this.dog.x, this.shepherd.y - this.dog.y);
                    if (dist < TREAT_GIVE_RADIUS && this.shepherd.giveOneTreat()) {
                        this.dog.giveTreat();
                        btn.setFillStyle(hitFill, 0.9);
                        this.time.delayedCall(120, () => btn.setFillStyle(baseFill, 0.0));
                    }
                });
            } else {
                btn.on('pointerdown', () => {
                    this.commandSystem.dispatch(def.command);
                    this.cmdTooltip?.setVisible(false);
                    btn.setFillStyle(hitFill, 0.9);
                    this.time.delayedCall(120, () => btn.setFillStyle(baseFill, 0.0));
                });
            }
        });
    }

    // ── Mood icon ─────────────────────────────────────────────────────────────

    private updateMoodIcon(mood: number): void {
        if (!this.moodIcon) return;
        if (mood > 0.7)      this.moodIcon.setText('😊');
        else if (mood > 0.3) this.moodIcon.setText('😐');
        else                 this.moodIcon.setText('😤');
    }
}
