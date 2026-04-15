import Phaser from 'phaser';
import shepUrl  from '../assets/sprites/shep.png';
import dogUrl   from '../assets/sprites/dog.png';
import sheepUrl from '../assets/sprites/sheep.png';
import goatUrl      from '../assets/sprites/goat.png';
import heightmapUrl from '../assets/heightmap.png';

const FRAME_W = 292;
const FRAME_H = 392;

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload(): void {
        this.load.spritesheet('shepherd', shepUrl,  { frameWidth: FRAME_W, frameHeight: FRAME_H });
        this.load.spritesheet('dog',      dogUrl,   { frameWidth: FRAME_W, frameHeight: FRAME_H });
        this.load.spritesheet('sheep',    sheepUrl, { frameWidth: FRAME_W, frameHeight: FRAME_H });
        this.load.spritesheet('goat',     goatUrl,  { frameWidth: FRAME_W, frameHeight: FRAME_H });

        // Graceful fallback if heightmap is missing — flat terrain is used
        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            if (file.key === 'heightmap') {
                console.warn('heightmap.png not found — using flat terrain');
            }
        });
        this.load.image('heightmap', heightmapUrl);
    }

    create(): void {
        this.anims.create({
            key: 'shepherd-walk',
            frames: this.anims.generateFrameNumbers('shepherd', { start: 0, end: 7 }),
            frameRate: 8,
            repeat: -1,
        });
        this.anims.create({
            key: 'dog-idle',
            frames: this.anims.generateFrameNumbers('dog', { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1,
        });
        this.anims.create({
            key: 'dog-walk',
            frames: this.anims.generateFrameNumbers('dog', { start: 4, end: 7 }),
            frameRate: 8,
            repeat: -1,
        });
        this.anims.create({
            key: 'sheep-walk',
            frames: this.anims.generateFrameNumbers('sheep', { start: 0, end: 7 }),
            frameRate: 6,
            repeat: -1,
        });
        this.anims.create({
            key: 'goat-walk',
            frames: this.anims.generateFrameNumbers('goat', { start: 0, end: 7 }),
            frameRate: 6,
            repeat: -1,
        });

        this.scene.start('GameScene');
    }
}
