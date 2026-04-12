import { WORLD_WIDTH, WORLD_HEIGHT } from '../config/constants';

// Isometric projection: flat world (wx, wy) → iso screen (x, y)
// Uses a 2:1 diamond ratio (standard pixel art iso)
const ISO_X = 0.5;
const ISO_Y = 0.25;

export function isoProject(wx: number, wy: number): { x: number; y: number } {
    return {
        x: (wx - wy) * ISO_X,
        y: (wx + wy) * ISO_Y,
    };
}

// Iso world bounds (precomputed from world corners)
export const ISO_MIN_X  = (0 - WORLD_HEIGHT) * ISO_X; // = -2000
export const ISO_MIN_Y  = 0;
export const ISO_WORLD_W = WORLD_WIDTH;                // = 4000
export const ISO_WORLD_H = (WORLD_WIDTH + WORLD_HEIGHT) * ISO_Y; // = 2000

// Transform joystick input so screen-right feels like right on the joystick.
// Without this, joystick-right moves world +x which goes iso bottom-right (↘), not screen-right (→).
// The rotation by -45° aligns joystick axes with iso screen axes.
export function isoJoystickTransform(jx: number, jy: number): { x: number; y: number } {
    const S = Math.SQRT2;
    return {
        x: (jx + jy) / S,
        y: (-jx + jy) / S,
    };
}
