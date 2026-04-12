import { SheepData } from '../entities/Sheep/Sheep';
import Dog from '../entities/Dog/Dog';
import GrassSystem from './GrassSystem';
import {
    BOID_COHESION,
    BOID_SEPARATION,
    BOID_ALIGNMENT,
    BOID_DOG_REPULSION,
    BOID_NEIGHBOR_RADIUS,
    BOID_WANDER_STRENGTH,
    WANDER_TURN_RATE,
    SHEEP_GRAZE_SPEED,
    SHEEP_FLEE_SPEED,
    WALL_AVOIDANCE_RADIUS,
    SHEEP_SHEPHERD_AVOID_RADIUS,
    SHEEP_SHEPHERD_AVOID_STRENGTH,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    TILE_SIZE,
    SHEEP_BARE_SPEED_FACTOR,
    BOID_BARE_REPULSION,
    STRAY_TIME_THRESHOLD,
    STRAY_WANDER_MULTIPLIER,
    MOOD_HIGH_THRESHOLD,
    MOOD_LOW_THRESHOLD,
    MOOD_HIGH_COHESION_BONUS,
    MOOD_LOW_SEP_BONUS,
    GUIDE_SPREAD_RADIUS,
} from '../config/constants';

interface WallRect { x: number; y: number; w: number; h: number; }

export default class FlockSystem {
    update(
        sheep: SheepData[],
        dog: Dog,
        walls: WallRect[],
        shepherdX: number,
        shepherdY: number,
        delta: number,
        isSea?: (wx: number, wy: number) => boolean,
        grassSystem?: GrassSystem,
        flockMood?: number,
    ): void {
        const dt = delta / 1000;
        const count = sheep.length;
        const mood = flockMood ?? 0.5;
        const cohesionScale   = mood > MOOD_HIGH_THRESHOLD ? MOOD_HIGH_COHESION_BONUS : 1.0;
        const separationScale = mood < MOOD_LOW_THRESHOLD  ? MOOD_LOW_SEP_BONUS : 1.0;

        for (let i = 0; i < count; i++) {
            const s = sheep[i];

            // ── Guided sheep: spread around shepherd, maintain separation ──────
            if (s.isGuided) {
                const dx = shepherdX - s.x;
                const dy = shepherdY - s.y;
                const distToShepherd = Math.hypot(dx, dy) || 1;

                // Separation from all other sheep
                let sepX = 0, sepY = 0;
                const sepRadius = BOID_NEIGHBOR_RADIUS;
                for (let j = 0; j < count; j++) {
                    if (i === j) continue;
                    const n = sheep[j];
                    const ndx = n.x - s.x;
                    const ndy = n.y - s.y;
                    const nd = Math.hypot(ndx, ndy);
                    if (nd < sepRadius && nd > 0) {
                        sepX -= ndx / nd;
                        sepY -= ndy / nd;
                    }
                }

                // Attract toward shepherd only when outside spread radius
                const attract = distToShepherd > GUIDE_SPREAD_RADIUS ? 4 : 0;
                s.vx += (dx / distToShepherd) * attract + sepX * BOID_SEPARATION * 1.5;
                s.vy += (dy / distToShepherd) * attract + sepY * BOID_SEPARATION * 1.5;

                const spd = Math.hypot(s.vx, s.vy);
                if (spd > SHEEP_FLEE_SPEED) {
                    s.vx = (s.vx / spd) * SHEEP_FLEE_SPEED;
                    s.vy = (s.vy / spd) * SHEEP_FLEE_SPEED;
                }
                s.vx *= 0.88;
                s.vy *= 0.88;

                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.x = Math.max(10, Math.min(s.x, WORLD_WIDTH  - 10));
                s.y = Math.max(10, Math.min(s.y, WORLD_HEIGHT - 10));
                continue;
            }

            // ── Boids ────────────────────────────────────────────────────────
            const currentSpeed = Math.hypot(s.vx, s.vy);
            const grazing = currentSpeed < SHEEP_GRAZE_SPEED * 0.5;
            const sepRadius = BOID_NEIGHBOR_RADIUS * (grazing ? 0.95 : 0.35);
            const sepForceScale = grazing ? 3.0 : 1.0;

            let cohX = 0, cohY = 0;
            let sepX = 0, sepY = 0;
            let aliX = 0, aliY = 0;
            let neighbors = 0;

            for (let j = 0; j < count; j++) {
                if (i === j) continue;
                const n = sheep[j];
                const dx = n.x - s.x;
                const dy = n.y - s.y;
                const dist = Math.hypot(dx, dy);
                if (dist > BOID_NEIGHBOR_RADIUS) continue;

                neighbors++;
                cohX += n.x;
                cohY += n.y;
                aliX += n.vx;
                aliY += n.vy;

                if (dist < sepRadius && dist > 0) {
                    sepX -= (dx / dist) * sepForceScale;
                    sepY -= (dy / dist) * sepForceScale;
                }
            }

            let steerX = 0;
            let steerY = 0;

            if (neighbors > 0) {
                steerX += ((cohX / neighbors) - s.x) * BOID_COHESION * cohesionScale;
                steerY += ((cohY / neighbors) - s.y) * BOID_COHESION * cohesionScale;
                steerX += (aliX / neighbors) * BOID_ALIGNMENT;
                steerY += (aliY / neighbors) * BOID_ALIGNMENT;
            }

            steerX += sepX * BOID_SEPARATION * separationScale;
            steerY += sepY * BOID_SEPARATION * separationScale;

            // Dog repulsion
            const rep = dog.getRepulsionVector(s.x, s.y);
            const dogInfluence = Math.hypot(rep.x, rep.y);
            steerX += rep.x * BOID_DOG_REPULSION;
            steerY += rep.y * BOID_DOG_REPULSION;

            // Wander
            const wanderMult = s.isStray ? STRAY_WANDER_MULTIPLIER : 1;
            s.wanderAngle += (Math.random() - 0.5) * WANDER_TURN_RATE * 2 * dt;
            steerX += Math.cos(s.wanderAngle) * BOID_WANDER_STRENGTH * wanderMult * dt;
            steerY += Math.sin(s.wanderAngle) * BOID_WANDER_STRENGTH * wanderMult * dt;

            // Grass repulsion (bare tiles push sheep away)
            if (grassSystem) {
                const gr = grassSystem.tileRepulsion(s.x, s.y);
                steerX += gr.x * BOID_BARE_REPULSION;
                steerY += gr.y * BOID_BARE_REPULSION;
            }

            // Wall avoidance
            for (const wall of walls) {
                const hw = wall.w / 2;
                const hh = wall.h / 2;
                const closestX = Math.max(wall.x - hw, Math.min(s.x, wall.x + hw));
                const closestY = Math.max(wall.y - hh, Math.min(s.y, wall.y + hh));
                const distToWall = Math.hypot(s.x - closestX, s.y - closestY);

                if (distToWall < WALL_AVOIDANCE_RADIUS && distToWall > 0) {
                    const strength = (1 - distToWall / WALL_AVOIDANCE_RADIUS) * 3;
                    steerX += ((s.x - closestX) / distToWall) * strength;
                    steerY += ((s.y - closestY) / distToWall) * strength;
                }
            }

            // Shepherd avoidance
            const sdx = s.x - shepherdX;
            const sdy = s.y - shepherdY;
            const sDist = Math.hypot(sdx, sdy);
            if (sDist < SHEEP_SHEPHERD_AVOID_RADIUS && sDist > 0) {
                const strength = (1 - sDist / SHEEP_SHEPHERD_AVOID_RADIUS) * SHEEP_SHEPHERD_AVOID_STRENGTH;
                steerX += (sdx / sDist) * strength;
                steerY += (sdy / sDist) * strength;
            }

            // Apply steering
            s.vx += steerX;
            s.vy += steerY;

            // Speed limit
            const onBare = grassSystem ? grassSystem.getGrassAt(s.x, s.y) === 0 : false;
            const baseMax = dogInfluence > 0.1 ? SHEEP_FLEE_SPEED : SHEEP_GRAZE_SPEED;
            const maxSpeed = onBare ? baseMax * SHEEP_BARE_SPEED_FACTOR : baseMax;
            const speed = Math.hypot(s.vx, s.vy);
            if (speed > maxSpeed) {
                s.vx = (s.vx / speed) * maxSpeed;
                s.vy = (s.vy / speed) * maxSpeed;
            }

            // Damping when grazing
            if (dogInfluence <= 0.1) {
                s.vx *= 0.92;
                s.vy *= 0.92;
            }

            s.x += s.vx * dt;
            s.y += s.vy * dt;

            // Grass eating (when nearly still)
            if (grassSystem && speed < SHEEP_GRAZE_SPEED * 0.3) {
                const col = Math.floor(s.x / TILE_SIZE);
                const row = Math.floor(s.y / TILE_SIZE);
                grassSystem.eatGrass(col, row);
            }

            // Stray timer
            if (grassSystem) {
                if (grassSystem.getGrassAt(s.x, s.y) === 0) {
                    s.strayTimer += dt;
                } else {
                    s.strayTimer = 0;
                }
                s.isStray = s.strayTimer > STRAY_TIME_THRESHOLD;
            }

            // Sea boundary
            if (isSea && isSea(s.x, s.y)) {
                s.vx = -s.vx;
                s.vy = -s.vy;
                s.x += s.vx * dt * 2;
                s.y += s.vy * dt * 2;
            }

            s.x = Math.max(10, Math.min(s.x, WORLD_WIDTH  - 10));
            s.y = Math.max(10, Math.min(s.y, WORLD_HEIGHT - 10));
        }
    }
}
