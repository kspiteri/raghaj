import * as Phaser from 'phaser';
import { FONT, FONT_DISPLAY } from '../config/fonts';
import type { ControlMode } from '../config/types';
import SaveSystem from '../systems/SaveSystem';

interface Row {
    input: string;
    action: string;
}

const TOUCH_ROWS: Row[] = [
    { input: 'Joystick',                  action: 'Move shepherd (distance = speed)' },
    { input: 'Mur / Ejja / Ieqaf / Bravu!', action: 'Dog commands (tap buttons)' },
    { input: 'Agħti',                     action: 'Give treat — active when dog is close' },
    { input: 'Mexxi',                     action: 'Guide — nearby sheep follow you for 8s' },
    { input: '🗺️',                        action: 'Toggle parchment minimap' },
    { input: 'Pinch',                     action: 'Zoom' },
];

const KEYBOARD_ROWS: Row[] = [
    { input: 'Arrow keys / WASD', action: 'Move shepherd' },
    { input: 'Shift',             action: 'Run' },
    { input: '1 / 2 / 3 / 4',    action: 'Mur / Ejja / Ieqaf / Bravu!' },
    { input: 'G',                 action: 'Mexxi — guide nearby sheep for 8s' },
    { input: 'M',                 action: 'Toggle parchment minimap' },
    { input: '= / −',             action: 'Zoom in / out' },
    { input: 'Mouse wheel',       action: 'Zoom' },
];

const DOG_ROWS: Row[] = [
    { input: 'Mur',    action: 'Free — dog autonomously herds strays' },
    { input: 'Ejja',   action: 'Follow — trails behind you, detours to push strays' },
    { input: 'Ieqaf',  action: 'Stop — holds position, auto-reverts (trust-timed)' },
    { input: 'Bravu!', action: 'Praise — builds dog trust (combo up to ×5)' },
    { input: 'Agħti',  action: 'Give treat — +15 trust' },
];

// Layout constants
const PAD       = 18;
const ROW_H     = 32;
const COL_W     = 160;
const TITLE_H   = 22;   // height of the title text row
const DIVIDER_H = 1;    // height of the horizontal rule
const SECTION_H = 18;   // height of a section label row
const CLOSE_H   = 36;   // height of the close button area

export default class ControlsOverlay {
    private container: Phaser.GameObjects.Container;
    private visible = false;
    private _mode: ControlMode = 'keyboard';
    private _firstRun = false;
    private readonly _onEsc    = () => this.hide();
    private readonly _onResize = () => this._rebuild();

    constructor(private scene: Phaser.Scene, private save: SaveSystem) {
        this.container = scene.add.container(0, 0).setDepth(310).setAlpha(0);
    }

    private build(width: number, height: number, mode: ControlMode, firstRun: boolean): void {
        this.container.removeAll(true);

        const rows   = mode === 'touch' ? TOUCH_ROWS : KEYBOARD_ROWS;
        const panelW = Math.min(460, width * 0.88);

        const ctrlH  = rows.length * ROW_H;
        const dogH   = DOG_ROWS.length * ROW_H;
        const panelH =
            PAD + TITLE_H +
            PAD + SECTION_H + ctrlH +
            PAD + DIVIDER_H +
            PAD + SECTION_H + dogH +
            PAD + CLOSE_H +
            PAD;

        const cx = width  / 2;
        const cy = height / 2;

        // Dark overlay — swallows clicks beneath; clicking outside dismisses
        const backdrop = this.scene.add.rectangle(cx, cy, width, height, 0x000000, 0.55)
            .setInteractive();
        backdrop.on('pointerdown', () => this.hide());
        this.container.add(backdrop);

        const bg = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x120c04, 0.95)
            .setStrokeStyle(1, 0x6a5040, 0.9).setOrigin(0.5);
        this.container.add(bg);

        let y = cy - panelH / 2 + PAD;

        // ── Title ──────────────────────────────────────────────────────────────
        const title = this.scene.add.text(cx, y + TITLE_H / 2, 'Controls', {
            fontSize: '15px', color: '#c8a060', fontFamily: FONT_DISPLAY, fontStyle: 'bold',
        }).setOrigin(0.5, 0.5);
        this.container.add(title);
        y += TITLE_H + PAD;

        // ── Controls section ───────────────────────────────────────────────────
        this.addSectionLabel(cx, panelW, y, mode === 'touch' ? 'TOUCH' : 'KEYBOARD');
        y += SECTION_H;

        for (const row of rows) {
            this.addRow(cx, y, panelW, row.input, row.action);
            y += ROW_H;
        }

        y += PAD;

        // Divider
        const div = this.scene.add.rectangle(cx, y + DIVIDER_H / 2, panelW - PAD * 2, DIVIDER_H, 0x4a3020, 0.6)
            .setOrigin(0.5, 0);
        this.container.add(div);
        y += DIVIDER_H + PAD;

        // ── Dog commands section ───────────────────────────────────────────────
        this.addSectionLabel(cx, panelW, y, 'DOG COMMANDS');
        y += SECTION_H;

        for (const row of DOG_ROWS) {
            this.addRow(cx, y, panelW, row.input, row.action);
            y += ROW_H;
        }

        y += PAD;

        // ── Close button ───────────────────────────────────────────────────────
        const closeBg = this.scene.add.rectangle(cx, y + CLOSE_H / 2, 120, 28, 0x1a6040, 0.9)
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        const closeLbl = this.scene.add.text(cx, y + CLOSE_H / 2, firstRun ? 'Start playing' : 'Close', {
            fontSize: '12px', color: '#a0f0b0', fontFamily: FONT_DISPLAY,
        }).setOrigin(0.5);

        closeBg.on('pointerover', () => closeBg.setFillStyle(0x26a060, 0.95));
        closeBg.on('pointerout',  () => closeBg.setFillStyle(0x1a6040, 0.9));
        closeBg.on('pointerdown', () => this.hide());

        this.container.add([closeBg, closeLbl]);
    }

    private addSectionLabel(cx: number, panelW: number, y: number, text: string): void {
        const lbl = this.scene.add.text(cx - panelW / 2 + PAD, y + SECTION_H / 2, text, {
            fontSize: '10px', color: '#907060', fontFamily: FONT_DISPLAY,
        }).setOrigin(0, 0.5);
        this.container.add(lbl);
    }

    private addRow(cx: number, y: number, panelW: number, input: string, action: string): void {
        const actionW = panelW - PAD * 2 - COL_W;

        const inputLbl = this.scene.add.text(cx - panelW / 2 + PAD, y + ROW_H / 2, input, {
            fontSize: '12px', color: '#f0dfc0', fontFamily: FONT_DISPLAY,
            fixedWidth: COL_W,
        }).setOrigin(0, 0.5);

        const actionLbl = this.scene.add.text(cx - panelW / 2 + PAD + COL_W, y + ROW_H / 2, action, {
            fontSize: '12px', color: '#c0b090', fontFamily: FONT,
            fixedWidth: actionW, wordWrap: { width: actionW },
        }).setOrigin(0, 0.5);

        this.container.add([inputLbl, actionLbl]);
    }

    private _rebuild(): void {
        const { width, height } = this.scene.scale;
        this.build(width, height, this._mode, this._firstRun);
    }

    show(width: number, height: number, mode: ControlMode, firstRun = false): void {
        if (this.visible) return;
        this.visible   = true;
        this._mode     = mode;
        this._firstRun = firstRun;
        this.scene.tweens.killTweensOf(this.container);
        this.build(width, height, mode, firstRun);
        this.scene.tweens.add({
            targets: this.container, alpha: 1, duration: 350, ease: 'Sine.easeOut',
            onComplete: () => { if (firstRun) this.save.markControlsSeen(); },
        });
        this.scene.input.keyboard?.on('keydown-ESC', this._onEsc, this);
        this.scene.scale.on('resize', this._onResize, this);
    }

    hide(): void {
        if (!this.visible) return;
        this.visible = false;
        this.scene.input.keyboard?.off('keydown-ESC', this._onEsc, this);
        this.scene.scale.off('resize', this._onResize, this);
        this.scene.tweens.add({
            targets: this.container, alpha: 0, duration: 250, ease: 'Sine.easeIn',
            onComplete: () => { if (!this.visible) this.container.removeAll(true); },
        });
    }

    isVisible(): boolean {
        return this.visible;
    }
}
