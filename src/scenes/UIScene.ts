import Phaser from 'phaser';
import CommandSystem, { COMMANDS } from '../systems/CommandSystem';
import Shepherd from '../entities/Shepherd';
import Dog from '../entities/Dog/Dog';
import { Poem } from '../systems/PoetrySystem';
import {
    POETRY_FADE_DURATION, JOYSTICK_RADIUS, JOYSTICK_DEAD_ZONE,
    GUIDE_COOLDOWN_MS, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
    SHEPHERD_WALK_SPEED, SHEPHERD_RUN_SPEED, TREAT_GIVE_RADIUS,
} from '../config/constants';
import { isoJoystickTransform } from '../utils/iso';

type ControlMode = 'keyboard' | 'touch';

const FONT         = "'Lora', Georgia, serif";
const FONT_DISPLAY = "'Cinzel', Georgia, serif";

// Keyboard shortcut labels matching COMMANDS order
const CMD_KEYS = ['1', '2', '3', '4'];

const CMD_ROW_H    = 56;   // command button row height
const STATUS_BAR_H = 36;   // status + gwida bar height
const HUD_H        = CMD_ROW_H + STATUS_BAR_H;
const MAP_MARGIN   = 10;   // minimap margin from edge

function panelW(height: number) {
    return Math.min(height * 0.55, 420);
}

export default class UIScene extends Phaser.Scene {
    private commandSystem!: CommandSystem;
    private shepherd!: Shepherd;
    private dog!: Dog;

    private controlMode: ControlMode = 'touch';

    private poemContainer!: Phaser.GameObjects.Container;

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

    // Joystick
    private joystickBase!:  Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickPointerId: number | null = null;
    private joystickOrigin    = { x: 0, y: 0 };
    private joystickCurrentPos = { x: 0, y: 0 };

    // Pinch zoom (touch)
    private zoomPinchActive    = false;
    private zoomPinchDist      = 0;
    private zoomPtr2Id: number | null = null;
    private zoomPtr2Pos        = { x: 0, y: 0 };

    // Keyboard
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    private shift!: Phaser.Input.Keyboard.Key;

    private currentPoem: Poem | null = null;
    private showingEnglish = false;

    // Minimap
    private mapContainer!:  Phaser.GameObjects.Container;
    private mapImage!:      Phaser.GameObjects.Image;
    private mapGraphics!:   Phaser.GameObjects.Graphics;
    private mapFrame!:      Phaser.GameObjects.Graphics;
    private mapOverlay!:    Phaser.GameObjects.Rectangle;
    private mapToggleBtn!:  Phaser.GameObjects.Text;
    private mapVisible      = false;
    private mapDrawPtr: number | null = null;
    private lastDrawPos     = { x: 0, y: 0 };

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

        this.poemContainer = this.add.container(0, 0).setDepth(300).setAlpha(0);

        this.buildMinimap();
        this.buildJoystick();
        this.bindKeyboard();
        this.layout();

        this.scale.on('resize', this.layout, this);
        this.events.on('show-poem',   (poem: Poem)   => this.displayPoem(poem));
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
        this.input.keyboard?.on('keydown-M', () => this.toggleMinimap());
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

    // ── Joystick + pinch zoom ─────────────────────────────────────────────────

    private buildJoystick(): void {
        this.joystickBase  = this.add.circle(0, 0, JOYSTICK_RADIUS, 0x000000, 0.22).setDepth(100).setAlpha(0);
        this.joystickThumb = this.add.circle(0, 0, JOYSTICK_RADIUS * 0.45, 0xffffff, 0.5).setDepth(101).setAlpha(0);

        this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            if (this.controlMode !== 'touch') return;
            if (ptr.y > this.scale.height - HUD_H - 20) return;
            if (this.isPointerInMinimap(ptr.x, ptr.y)) return;  // handled by minimap

            if (this.joystickPointerId === null) {
                // First finger: start joystick
                this.joystickPointerId   = ptr.id;
                this.joystickOrigin      = { x: ptr.x, y: ptr.y };
                this.joystickCurrentPos  = { x: ptr.x, y: ptr.y };
                this.joystickBase.setPosition(ptr.x, ptr.y).setAlpha(0.22);
                this.joystickThumb.setPosition(ptr.x, ptr.y).setAlpha(0.5);
            } else if (this.zoomPtr2Id === null) {
                // Second finger: start pinch zoom, pause joystick
                this.zoomPtr2Id    = ptr.id;
                this.zoomPtr2Pos   = { x: ptr.x, y: ptr.y };
                this.zoomPinchDist = Math.hypot(
                    ptr.x - this.joystickCurrentPos.x,
                    ptr.y - this.joystickCurrentPos.y,
                );
                this.zoomPinchActive = true;
                this.shepherd.setVelocity(0, 0, false);
                this.joystickBase.setAlpha(0);
                this.joystickThumb.setAlpha(0);
            }
        });

        this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
            if (ptr.id === this.joystickPointerId) {
                this.joystickCurrentPos = { x: ptr.x, y: ptr.y };
                if (this.zoomPinchActive) {
                    this.updatePinch();
                } else {
                    this.updateJoystick(ptr.x, ptr.y);
                }
            } else if (ptr.id === this.zoomPtr2Id) {
                this.zoomPtr2Pos = { x: ptr.x, y: ptr.y };
                this.updatePinch();
            }
        });

        this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
            if (ptr.id === this.zoomPtr2Id) {
                // Second finger lifted: end pinch, resume joystick
                this.zoomPtr2Id      = null;
                this.zoomPinchActive = false;
                if (this.joystickPointerId !== null) {
                    this.joystickOrigin = { ...this.joystickCurrentPos };
                    this.joystickBase.setPosition(this.joystickCurrentPos.x, this.joystickCurrentPos.y).setAlpha(0.22);
                    this.joystickThumb.setPosition(this.joystickCurrentPos.x, this.joystickCurrentPos.y).setAlpha(0.5);
                }
                return;
            }

            if (ptr.id !== this.joystickPointerId) return;
            // Primary finger lifted: clear everything
            this.joystickPointerId = null;
            this.zoomPinchActive   = false;
            this.zoomPtr2Id        = null;
            this.shepherd.setVelocity(0, 0, false);
            this.joystickBase.setAlpha(0);
            this.joystickThumb.setAlpha(0);
        });
    }

    private updateJoystick(px: number, py: number): void {
        const dx   = px - this.joystickOrigin.x;
        const dy   = py - this.joystickOrigin.y;
        const dist = Math.hypot(dx, dy);

        if (dist < JOYSTICK_DEAD_ZONE) {
            this.shepherd.setVelocity(0, 0, false);
            this.joystickThumb.setPosition(this.joystickBase.x, this.joystickBase.y);
            return;
        }

        const clamped = Math.min(dist, JOYSTICK_RADIUS);
        const nx  = dx / dist;
        const ny  = dy / dist;
        const iso = isoJoystickTransform(nx, ny);
        const ratio = Phaser.Math.Clamp(
            (clamped - JOYSTICK_DEAD_ZONE) / (JOYSTICK_RADIUS - JOYSTICK_DEAD_ZONE),
            0, 1,
        );
        const speed = Phaser.Math.Linear(SHEPHERD_WALK_SPEED, SHEPHERD_RUN_SPEED, ratio);
        this.shepherd.setVelocity(iso.x, iso.y, true, speed);
        this.joystickThumb.setPosition(
            this.joystickBase.x + nx * clamped,
            this.joystickBase.y + ny * clamped,
        );
    }

    private updatePinch(): void {
        const newDist = Math.hypot(
            this.zoomPtr2Pos.x - this.joystickCurrentPos.x,
            this.zoomPtr2Pos.y - this.joystickCurrentPos.y,
        );
        if (this.zoomPinchDist > 0) {
            const cam = this.scene.get('GameScene').cameras.main;
            cam.setZoom(Phaser.Math.Clamp(
                cam.zoom * (newDist / this.zoomPinchDist),
                ZOOM_MIN,
                ZOOM_MAX,
            ));
        }
        this.zoomPinchDist = newDist;
    }

    // ── Control mode toggle ───────────────────────────────────────────────────

    private toggleControlMode(): void {
        this.controlMode = this.controlMode === 'touch' ? 'keyboard' : 'touch';
        if (this.controlMode === 'keyboard' && this.joystickPointerId !== null) {
            this.joystickPointerId = null;
            this.shepherd.setVelocity(0, 0, false);
            this.joystickBase.setAlpha(0);
            this.joystickThumb.setAlpha(0);
        }
        this.layout();
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    private layout(): void {
        const { width, height } = this.scale;

        this.buildStatusBar(width, height);
        this.buildCommandRow(width, height);
        this.positionMinimap();

        const wasVisible = this.poemContainer.alpha > 0;
        this.buildPoemOverlay(width, height);
        if (wasVisible && this.currentPoem) this.updatePoemText();
        this.poemContainer.setPosition(width / 2, height / 2 - HUD_H / 2);
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
        this.mapToggleBtn?.destroy();

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
        this.mapToggleBtn = this.add.text(x, cy, '🗺️', { fontSize: '18px' })
            .setOrigin(0, 0.5).setDepth(200).setInteractive({ useHandCursor: true });
        this.mapToggleBtn.on('pointerdown', () => this.toggleMinimap());

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
            this.guideTooltip!.setPosition(pillX, cy - STATUS_BAR_H / 2 - guideTooltipBg.height / 2 - 4).setVisible(true);
        });
        this.guidePill.on('pointerout',  () => this.guideTooltip!.setVisible(false));
        this.guidePill.on('pointerdown', () => {
            this.shepherd.activateGuide();
            this.guideTooltip!.setVisible(false);
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
                this.cmdTooltip!
                    .setPosition(cx, rowY - tooltipBg.height / 2 - 6)
                    .setVisible(true);
            });
            btn.on('pointerout', () => {
                btn.setFillStyle(baseFill, 0.0);
                this.cmdTooltip!.setVisible(false);
            });
            if (isAghti) {
                btn.on('pointerdown', () => {
                    this.cmdTooltip!.setVisible(false);
                    const dist = Math.hypot(this.shepherd.x - this.dog.x, this.shepherd.y - this.dog.y);
                    if (this.shepherd.treatCount > 0 && dist < TREAT_GIVE_RADIUS) {
                        this.shepherd.treatCount--;
                        this.dog.giveTreat();
                        btn.setFillStyle(hitFill, 0.9);
                        this.time.delayedCall(120, () => btn.setFillStyle(baseFill, 0.0));
                    }
                });
            } else {
                btn.on('pointerdown', () => {
                    this.commandSystem.dispatch(def.command);
                    this.cmdTooltip!.setVisible(false);
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

    // ── Poem overlay ──────────────────────────────────────────────────────────

    private buildPoemOverlay(width: number, height: number): void {
        this.poemContainer.removeAll(true);

        const pw    = panelW(height);
        const ph    = Math.round(pw * 0.52);
        const cx    = 0;
        const cy    = 0;

        const border = this.add.rectangle(cx, cy, pw + 4, ph + 4, 0xc8a96e, 0.6).setName('border');
        const bg     = this.add.rectangle(cx, cy, pw, ph, 0x1a0f05, 0.90).setName('bg');

        const title = this.add.text(cx, cy - ph / 2 + 20, '', {
            fontSize: '13px', color: '#c8a96e', fontStyle: 'italic', fontFamily: FONT,
        }).setOrigin(0.5).setName('title');

        const body = this.add.text(cx, cy - 10, '', {
            fontSize: '14px', color: '#f5e6c8', fontFamily: FONT,
            wordWrap: { width: pw - 40 }, align: 'center', lineSpacing: 6,
        }).setOrigin(0.5).setName('body');

        const author = this.add.text(cx, cy + ph / 2 - 32, '', {
            fontSize: '11px', color: '#907060', fontFamily: FONT,
        }).setOrigin(0.5).setName('author');

        const toggle = this.add.text(cx, cy + ph / 2 - 14, '[ English ]', {
            fontSize: '11px', color: '#c8a96e', fontFamily: FONT,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('toggle');

        const close = this.add.text(cx + pw / 2 - 14, cy - ph / 2 + 14, '✕', {
            fontSize: '13px', color: '#907060', fontFamily: FONT,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        close.on('pointerdown',  () => this.hidePoem());
        toggle.on('pointerdown', () => {
            this.showingEnglish = !this.showingEnglish;
            toggle.setText(this.showingEnglish ? '[ Malti ]' : '[ English ]');
            this.updatePoemText();
        });

        this.poemContainer.add([border, bg, title, body, author, toggle, close]);

        void width;
    }

    private displayPoem(poem: Poem): void {
        this.currentPoem    = poem;
        this.showingEnglish = false;
        this.updatePoemText();
        (this.poemContainer.getByName('toggle') as Phaser.GameObjects.Text).setText('[ English ]');
        this.tweens.add({
            targets:  this.poemContainer,
            alpha:    1,
            duration: POETRY_FADE_DURATION,
            ease:     'Sine.easeIn',
        });
    }

    private updatePoemText(): void {
        if (!this.currentPoem) return;
        const p = this.currentPoem;
        (this.poemContainer.getByName('title')  as Phaser.GameObjects.Text).setText(p.title);
        (this.poemContainer.getByName('body')   as Phaser.GameObjects.Text)
            .setText(this.showingEnglish ? p.text_en : p.text_mt);
        (this.poemContainer.getByName('author') as Phaser.GameObjects.Text).setText(`— ${p.author}`);
    }

    private hidePoem(): void {
        this.tweens.add({
            targets:  this.poemContainer,
            alpha:    0,
            duration: POETRY_FADE_DURATION,
            ease:     'Sine.easeOut',
        });
    }

    // ── Minimap ───────────────────────────────────────────────────────────────

    /** Map size: largest square that fits the viewport with a small margin. */
    private getMapSize(): number {
        const { width, height } = this.scale;
        return Math.min(width, height) - MAP_MARGIN * 2;
    }

    private buildMinimap(): void {
        // Full-viewport dark overlay — blocks game view (and vignette bleed-through)
        this.mapOverlay = this.add.rectangle(0, 0, 1, 1, 0x0d0804, 0.92)
            .setOrigin(0).setDepth(248).setVisible(false);

        this.mapContainer = this.add.container(0, 0).setDepth(250).setVisible(false);

        // Map image — display size set in positionMinimap
        this.mapImage = this.add.image(0, 0, 'minimap-2d').setOrigin(0);
        // Ink drawing layer (container-local coords)
        this.mapGraphics = this.add.graphics();
        // Ornate parchment frame (redrawn in positionMinimap)
        this.mapFrame = this.add.graphics();

        const clearBtn = this.add.text(0, 0, 'Clear', {
            fontSize: '11px', color: '#3a2508', fontStyle: 'bold', fontFamily: FONT,
            backgroundColor: '#d4b888', padding: { x: 8, y: 3 },
        }).setName('clearBtn').setInteractive({ useHandCursor: true });
        clearBtn.on('pointerdown', () => {
            this.mapGraphics.clear();
            this.setDrawStyle();
        });

        const closeBtn = this.add.text(0, 0, '✕ Close', {
            fontSize: '11px', color: '#3a2508', fontStyle: 'bold', fontFamily: FONT,
            backgroundColor: '#d4b888', padding: { x: 8, y: 3 },
        }).setName('closeBtn').setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggleMinimap());

        this.mapContainer.add([this.mapImage, this.mapGraphics, this.mapFrame, clearBtn, closeBtn]);

        // ── Drawing handlers ─────────────────────────────────────────────
        this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            if (!this.mapVisible || !this.isPointerInMinimap(ptr.x, ptr.y)) return;
            if (this.mapDrawPtr !== null) return;
            this.mapDrawPtr  = ptr.id;
            this.lastDrawPos = this.screenToMap(ptr.x, ptr.y);
        });

        this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
            if (ptr.id !== this.mapDrawPtr) return;
            if (!this.isPointerInMinimap(ptr.x, ptr.y)) { this.mapDrawPtr = null; return; }
            const to = this.screenToMap(ptr.x, ptr.y);
            this.mapGraphics.beginPath();
            this.mapGraphics.moveTo(this.lastDrawPos.x, this.lastDrawPos.y);
            this.mapGraphics.lineTo(to.x, to.y);
            this.mapGraphics.strokePath();
            this.lastDrawPos = to;
        });

        this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
            if (ptr.id === this.mapDrawPtr) this.mapDrawPtr = null;
        });
    }

    /** Screen coords → container-local coords. */
    private screenToMap(sx: number, sy: number): { x: number; y: number } {
        const s = this.mapContainer.scaleX || 1;
        return {
            x: (sx - this.mapContainer.x) / s,
            y: (sy - this.mapContainer.y) / s,
        };
    }

    private setDrawStyle(): void {
        this.mapGraphics.lineStyle(2, 0x3a2508, 0.80);
    }

    private toggleMinimap(): void {
        this.mapVisible = !this.mapVisible;
        this.mapOverlay.setVisible(this.mapVisible);
        this.mapContainer.setVisible(this.mapVisible);
        this.positionMinimap();
    }

    private positionMinimap(): void {
        if (!this.mapContainer) return;
        const { width, height } = this.scale;
        const ms    = this.getMapSize();
        const BUILT = 512;
        const s     = ms / BUILT;

        // Resize overlay to cover full viewport
        this.mapOverlay?.setSize(width, height);

        // Center map container
        this.mapContainer.setScale(s);
        this.mapContainer.setPosition(
            Math.round((width  - ms) / 2),
            Math.round((height - ms) / 2),
        );

        this.mapImage?.setDisplaySize(BUILT, BUILT);

        // Close button: top-right, within border strip
        const closeBtn = this.mapContainer.getByName('closeBtn') as Phaser.GameObjects.Text | null;
        closeBtn?.setPosition(BUILT - 4, 4).setOrigin(1, 0);

        // Clear button: bottom-centre, within border strip
        const clearBtn = this.mapContainer.getByName('clearBtn') as Phaser.GameObjects.Text | null;
        clearBtn?.setPosition(BUILT / 2, BUILT - 4).setOrigin(0.5, 1);

        this.drawParchmentFrame(BUILT);
        this.setDrawStyle();
    }

    private drawParchmentFrame(size: number): void {
        if (!this.mapFrame) return;
        this.mapFrame.clear();

        const INK   = 0x3a2508;
        const PARCH = 0xd4b888;
        const B     = 9;   // border strip width in local px

        // Parchment border strip
        this.mapFrame.fillStyle(PARCH, 0.95);
        this.mapFrame.fillRect(0, 0, size, B);
        this.mapFrame.fillRect(0, size - B, size, B);
        this.mapFrame.fillRect(0, B, B, size - B * 2);
        this.mapFrame.fillRect(size - B, B, B, size - B * 2);

        // Outer ink line
        this.mapFrame.lineStyle(1.5, INK, 0.88);
        this.mapFrame.strokeRect(0.5, 0.5, size - 1, size - 1);
        // Inner ink line
        this.mapFrame.lineStyle(0.8, INK, 0.55);
        this.mapFrame.strokeRect(B - 1, B - 1, size - (B - 1) * 2, size - (B - 1) * 2);

        // Corner crosshairs
        const T = 5;
        this.mapFrame.lineStyle(1.2, INK, 0.72);
        for (const [cx, cy] of [[B, B], [size - B, B], [B, size - B], [size - B, size - B]] as [number, number][]) {
            this.mapFrame.beginPath();
            this.mapFrame.moveTo(cx - T, cy); this.mapFrame.lineTo(cx + T, cy);
            this.mapFrame.moveTo(cx, cy - T); this.mapFrame.lineTo(cx, cy + T);
            this.mapFrame.strokePath();
        }
    }

    private isPointerInMinimap(px: number, py: number): boolean {
        if (!this.mapVisible) return false;
        const ms = this.getMapSize();
        const { width, height } = this.scale;
        const mx = Math.round((width  - ms) / 2);
        const my = Math.round((height - ms) / 2);
        return px >= mx && px <= mx + ms && py >= my && py <= my + ms;
    }
}
