import * as Phaser from 'phaser';

export default abstract class BaseEntity {
    protected scene: Phaser.Scene;
    x: number;
    y: number;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.x = x;
        this.y = y;
    }

    abstract update(delta: number): void;

    destroy(): void {}
}
