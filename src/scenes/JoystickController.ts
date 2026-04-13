import Phaser from 'phaser';
import Shepherd from '../entities/Shepherd';
import { isoJoystickTransform } from '../utils/iso';
import {
    JOYSTICK_RADIUS, JOYSTICK_DEAD_ZONE,
    ZOOM_MIN, ZOOM_MAX,
    SHEPHERD_WALK_SPEED, SHEPHERD_RUN_SPEED,
} from '../config/constants';

export default class JoystickController {
    private joystickBase!:      Phaser.GameObjects.Arc;
    private joystickThumb!:     Phaser.GameObjects.Arc;
    private joystickPointerId: number | null = null;
    private joystickOrigin     = { x: 0, y: 0 };
    private joystickCurrentPos = { x: 0, y: 0 };
    private zoomPinchActive    = false;
    private zoomPinchDist      = 0;
    private zoomPtr2Id:        number | null = null;
    private zoomPtr2Pos        = { x: 0, y: 0 };

    constructor(
        private scene: Phaser.Scene,
        private shepherd: Shepherd,
        private hudHeight: number,
        private getControlMode: () => string,
    ) {}

    build(isPointerInMinimap: (px: number, py: number) => boolean): void {
        this.joystickBase  = this.scene.add.circle(0, 0, JOYSTICK_RADIUS, 0x000000, 0.22).setDepth(100).setAlpha(0);
        this.joystickThumb = this.scene.add.circle(0, 0, JOYSTICK_RADIUS * 0.45, 0xffffff, 0.5).setDepth(101).setAlpha(0);

        this.scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            if (this.getControlMode() !== 'touch') return;
            if (ptr.y > this.scene.scale.height - this.hudHeight - 20) return;
            if (isPointerInMinimap(ptr.x, ptr.y)) return;  // handled by minimap

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

        this.scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
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

        this.scene.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
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

    cancelAndHide(): void {
        this.joystickPointerId = null;
        this.shepherd.setVelocity(0, 0, false);
        this.joystickBase.setAlpha(0);
        this.joystickThumb.setAlpha(0);
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
            const cam = this.scene.scene.get('GameScene').cameras.main;
            cam.setZoom(Phaser.Math.Clamp(
                cam.zoom * (newDist / this.zoomPinchDist),
                ZOOM_MIN,
                ZOOM_MAX,
            ));
        }
        this.zoomPinchDist = newDist;
    }
}
