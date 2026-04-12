import Phaser from 'phaser';
import PreloadScene from './scenes/PreloadScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import { TARGET_FPS } from './config/constants';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    scale: {
        // RESIZE: canvas always matches the parent container size exactly
        mode: Phaser.Scale.RESIZE,
        parent: 'game',
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
        target: TARGET_FPS,
        forceSetTimeOut: false,
    },
    scene: [PreloadScene, GameScene, UIScene],
};

new Phaser.Game(config);
