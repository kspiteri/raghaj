import * as Phaser from 'phaser';
import { Poem } from '../systems/PoetrySystem';
import { POETRY_FADE_DURATION } from '../config/constants';

const FONT = "'Lora', Georgia, serif";

function panelW(height: number): number {
    return Math.min(height * 0.55, 420);
}

export default class PoemOverlay {
    private container:     Phaser.GameObjects.Container;
    private currentPoem:   Poem | null = null;
    private showingEnglish = false;

    constructor(private scene: Phaser.Scene) {
        this.container = scene.add.container(0, 0).setDepth(300).setAlpha(0);
    }

    build(height: number): void {
        this.container.removeAll(true);

        const pw    = panelW(height);
        const ph    = Math.round(pw * 0.52);
        const cx    = 0;
        const cy    = 0;

        const border = this.scene.add.rectangle(cx, cy, pw + 4, ph + 4, 0xc8a96e, 0.6).setName('border');
        const bg     = this.scene.add.rectangle(cx, cy, pw, ph, 0x1a0f05, 0.90).setName('bg');

        const title = this.scene.add.text(cx, cy - ph / 2 + 20, '', {
            fontSize: '13px', color: '#c8a96e', fontStyle: 'italic', fontFamily: FONT,
        }).setOrigin(0.5).setName('title');

        const body = this.scene.add.text(cx, cy - 10, '', {
            fontSize: '14px', color: '#f5e6c8', fontFamily: FONT,
            wordWrap: { width: pw - 40 }, align: 'center', lineSpacing: 6,
        }).setOrigin(0.5).setName('body');

        const author = this.scene.add.text(cx, cy + ph / 2 - 32, '', {
            fontSize: '11px', color: '#907060', fontFamily: FONT,
        }).setOrigin(0.5).setName('author');

        const toggle = this.scene.add.text(cx, cy + ph / 2 - 14, '[ English ]', {
            fontSize: '11px', color: '#c8a96e', fontFamily: FONT,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('toggle');

        const close = this.scene.add.text(cx + pw / 2 - 14, cy - ph / 2 + 14, '✕', {
            fontSize: '13px', color: '#907060', fontFamily: FONT,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        close.on('pointerdown',  () => this.hide());
        toggle.on('pointerdown', () => {
            this.showingEnglish = !this.showingEnglish;
            toggle.setText(this.showingEnglish ? '[ Malti ]' : '[ English ]');
            this.updatePoemText();
        });

        this.container.add([border, bg, title, body, author, toggle, close]);

        if (this.container.alpha > 0 && this.currentPoem) this.updatePoemText();
    }

    display(poem: Poem): void {
        this.currentPoem    = poem;
        this.showingEnglish = false;
        this.updatePoemText();
        (this.container.getByName('toggle') as Phaser.GameObjects.Text).setText('[ English ]');
        this.scene.tweens.add({
            targets:  this.container,
            alpha:    1,
            duration: POETRY_FADE_DURATION,
            ease:     'Sine.easeIn',
        });
    }

    hide(): void {
        this.scene.tweens.add({
            targets:  this.container,
            alpha:    0,
            duration: POETRY_FADE_DURATION,
            ease:     'Sine.easeOut',
        });
    }

    setPosition(x: number, y: number): void {
        this.container.setPosition(x, y);
    }

    get alpha(): number {
        return this.container.alpha;
    }

    private updatePoemText(): void {
        if (!this.currentPoem) return;
        const p = this.currentPoem;
        (this.container.getByName('title')  as Phaser.GameObjects.Text).setText(p.title);
        (this.container.getByName('body')   as Phaser.GameObjects.Text)
            .setText(this.showingEnglish ? p.text_en : p.text_mt);
        (this.container.getByName('author') as Phaser.GameObjects.Text).setText(`— ${p.author}`);
    }
}
