import * as Phaser from 'phaser';
import PreloadScene from './scenes/PreloadScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import { TARGET_FPS } from './config/constants';
import { WarmVignetteRenderNode, WARM_VIGNETTE_NODE } from './filters/WarmVignetteFilter';

// `resolution` is valid at runtime but missing from Phaser 4.0 types
type GameConfigWithResolution = Phaser.Types.Core.GameConfig & { resolution?: number };

const config: GameConfigWithResolution = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    resolution: window.devicePixelRatio,
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
    render: {
        renderNodes: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [WARM_VIGNETTE_NODE]: WarmVignetteRenderNode as any,
        },
    },
    scene: [PreloadScene, GameScene, UIScene],
};

new Phaser.Game(config);
