import * as Phaser from 'phaser';

export interface SheepData {
    x: number;
    y: number;
    vx: number;
    vy: number;
    wanderAngle: number; // radians — slowly rotates to create grazing drift
    sprite: Phaser.GameObjects.Sprite;
    strayTimer: number;  // seconds spent on bare ground; resets on grass
    isStray: boolean;    // true after STRAY_TIME_THRESHOLD seconds on bare
    isGuided: boolean;   // true while shepherd guide ability is active
    isWild: boolean;     // true until shepherd comes within WILD_JOIN_RADIUS
}
