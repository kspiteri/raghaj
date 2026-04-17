import * as Phaser from 'phaser';
import CommandSystem, { COMMANDS } from '../systems/CommandSystem';
import Shepherd from '../entities/Shepherd';
import Dog from '../entities/Dog/Dog';
import { Poem } from '../systems/PoetrySystem';
import { PlacedSettlement, QuestDef, SETTLEMENT_EVENTS, SettlementMarker } from '../systems/SettlementSystem';
import {
    GUIDE_COOLDOWN_MS, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
    SHEPHERD_WALK_SPEED, SHEPHERD_RUN_SPEED, TREAT_GIVE_RADIUS,
    UI_CMD_ROW_H, UI_STATUS_BAR_H,
} from '../config/constants';
import { FONT, FONT_DISPLAY } from '../config/fonts';
import { isoJoystickTransform } from '../utils/iso';
import MinimapController  from './MinimapController';
import JoystickController from './JoystickController';
import PoemOverlay        from './PoemOverlay';

type ControlMode = 'keyboard' | 'touch';

// Keyboard shortcut labels matching COMMANDS order
const CMD_KEYS = ['1', '2', '3', '4'];

const CMD_ROW_H    = UI_CMD_ROW_H;
const STATUS_BAR_H = UI_STATUS_BAR_H;
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
    private questTracker: Phaser.GameObjects.Text | null = null;
    private questTrackerText = '';  // persists across layout rebuilds
    private mapToggleBtn: Phaser.GameObjects.Text | null = null;

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

    // Settlement UI
    private locationBanner: Phaser.GameObjects.Container | null = null;
    private questPrompt:    Phaser.GameObjects.Container | null = null;

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
        this.minimap.setSettlementSource(
            () => (this.scene.get('GameScene') as unknown as { getSettlementMarkers(): SettlementMarker[] }).getSettlementMarkers(),
        );
        this.joystick.build((px, py) => this.minimap.isPointerInside(px, py));
        this.bindKeyboard();
        this.layout();

        this.scale.on('resize', this.layout, this);
        this.events.on('show-poem',                      (poem: Poem)                                                  => this.poem.display(poem));
        this.events.on('mood-update',                    (mood: number)                                                => this.updateMoodIcon(mood));
        this.events.on(SETTLEMENT_EVENTS.ENTER,          (s: PlacedSettlement)                                        => this.showLocationBanner(s.name));
        this.events.on(SETTLEMENT_EVENTS.QUEST_AVAILABLE,(data: { settlement: PlacedSettlement; quests: QuestDef[] }) => this.showQuestBoard(data));
        this.events.on(SETTLEMENT_EVENTS.QUEST_COMPLETE, (_q: QuestDef)                                               => { this.showLocationBanner('Quest complete!'); this.updateQuestTracker(null); });

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
        this.questTracker?.destroy();
        this.questTracker = null;
        this.mapToggleBtn?.destroy();
        this.mapToggleBtn = null;

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

        // Map toggle — stored so it can be destroyed on rebuild
        this.mapToggleBtn = this.minimap.createToggleButton(x, cy);
        x += 30;

        // Active quest tracker — fills remaining space left of Mexxi pill
        const pillW    = 90;
        const pillX    = width - pillW / 2 - 10;
        const trackerW = pillX - pillW / 2 - 10 - x;
        this.questTracker = this.add.text(x, cy, this.questTrackerText, {
            fontSize: '11px', color: '#c8d8a0', fontFamily: FONT, fontStyle: 'italic',
            fixedWidth: Math.max(0, trackerW), wordWrap: { width: Math.max(0, trackerW) },
        }).setOrigin(0, 0.5).setDepth(200);

        // Mexxi pill (right side)
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

    // ── Settlement notifications ──────────────────────────────────────────────

    private updateQuestTracker(label: string | null): void {
        this.questTrackerText = label ? `→ ${label}` : '';
        this.questTracker?.setText(this.questTrackerText);
    }

    private showLocationBanner(text: string): void {
        // Cancel any existing banner
        if (this.locationBanner) {
            this.tweens.killTweensOf(this.locationBanner);
            this.locationBanner.destroy();
            this.locationBanner = null;
        }

        const { width } = this.scale;
        const bg    = this.add.rectangle(0, 0, width * 0.6, 36, 0x1a0f05, 0.82).setOrigin(0.5);
        const label = this.add.text(0, 0, text, {
            fontSize: '15px', color: '#f5e0c0',
            fontFamily: FONT, fontStyle: 'bold',
        }).setOrigin(0.5);

        this.locationBanner = this.add.container(width / 2, Math.round(this.scale.height * 0.08), [bg, label])
            .setDepth(220).setAlpha(0);

        this.tweens.add({
            targets:  this.locationBanner,
            alpha:    1,
            duration: 500,
            ease:     'Sine.easeOut',
            onComplete: () => {
                this.time.delayedCall(2000, () => {
                    if (!this.locationBanner) return;
                    this.tweens.add({
                        targets:  this.locationBanner,
                        alpha:    0,
                        duration: 500,
                        ease:     'Sine.easeIn',
                        onComplete: () => {
                            this.locationBanner?.destroy();
                            this.locationBanner = null;
                        },
                    });
                });
            },
        });
    }

    private showQuestBoard(data: { settlement: PlacedSettlement; quests: QuestDef[] }): void {
        if (this.questPrompt) {
            this.tweens.killTweensOf(this.questPrompt);
            this.questPrompt.destroy();
            this.questPrompt = null;
        }

        const { width, height } = this.scale;
        const ROW_H  = 36;
        const PAD    = 14;
        const panelW = Math.min(340, width * 0.85);
        const panelH = PAD * 2 + 22 + data.quests.length * ROW_H + 32; // title + rows + close btn
        const cx     = width  / 2;
        const cy     = height / 2 - 40;

        const allItems: Phaser.GameObjects.GameObject[] = [];
        const depth = 225;

        const bg = this.add.rectangle(cx, cy, panelW, panelH, 0x120c04, 0.93)
            .setStrokeStyle(1, 0x6a5040, 0.9).setOrigin(0.5).setDepth(depth);
        allItems.push(bg);

        const title = this.add.text(cx, cy - panelH / 2 + PAD, data.settlement.name, {
            fontSize: '13px', color: '#c8a060', fontFamily: FONT, fontStyle: 'bold',
        }).setOrigin(0.5, 0).setDepth(depth);
        allItems.push(title);

        const dismiss = () => {
            allItems.forEach(o => {
                this.tweens.killTweensOf(o);
                this.tweens.add({ targets: o, alpha: 0, duration: 200, onComplete: () => (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy() });
            });
            this.tweens.killTweensOf(tweenHandle);
            tweenHandle.destroy();
            this.questPrompt = null;
        };

        let rowY = cy - panelH / 2 + PAD + 22;
        for (const q of data.quests) {
            const rowBg = this.add.rectangle(cx, rowY + ROW_H / 2, panelW - PAD * 2, ROW_H - 4, 0x1a1208, 0.6)
                .setOrigin(0.5).setDepth(depth);
            allItems.push(rowBg);

            const rowLabel = this.add.text(cx - panelW / 2 + PAD + 4, rowY + ROW_H / 2, q.label, {
                fontSize: '11px', color: '#f0dfc0', fontFamily: FONT,
                fixedWidth: panelW - PAD * 2 - 70,
            }).setOrigin(0, 0.5).setDepth(depth);
            allItems.push(rowLabel);

            const acceptBg = this.add.rectangle(cx + panelW / 2 - PAD - 30, rowY + ROW_H / 2, 56, ROW_H - 10, 0x1a6040, 0.9)
                .setOrigin(0.5).setDepth(depth).setInteractive({ useHandCursor: true });
            const acceptLbl = this.add.text(cx + panelW / 2 - PAD - 30, rowY + ROW_H / 2, 'Accept', {
                fontSize: '10px', color: '#a0f0b0', fontFamily: FONT_DISPLAY,
            }).setOrigin(0.5).setDepth(depth);
            allItems.push(acceptBg, acceptLbl);

            acceptBg.on('pointerdown', () => {
                this.events.emit(SETTLEMENT_EVENTS.QUEST_ACCEPT, data.settlement.id, q.id);
                if (q.type === 'deliver') this.updateQuestTracker(q.label);
                dismiss();
            });

            rowY += ROW_H;
        }

        // Close button
        const closeBtnY = cy + panelH / 2 - PAD - 10;
        const closeBg = this.add.rectangle(cx, closeBtnY, 80, 24, 0x2a1a10, 0.8)
            .setOrigin(0.5).setDepth(depth).setInteractive({ useHandCursor: true });
        const closeLbl = this.add.text(cx, closeBtnY, 'Not now', {
            fontSize: '10px', color: '#907060', fontFamily: FONT_DISPLAY,
        }).setOrigin(0.5).setDepth(depth);
        allItems.push(closeBg, closeLbl);
        closeBg.on('pointerdown', dismiss);

        allItems.forEach(o => (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0));
        this.tweens.add({ targets: allItems, alpha: 1, duration: 300 });

        // Empty sentinel container used only as a handle for the "kill existing prompt" guard
        const tweenHandle = this.add.container(0, 0).setDepth(depth);
        this.questPrompt = tweenHandle;
    }
}
