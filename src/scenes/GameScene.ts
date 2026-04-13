import Phaser from 'phaser';
import Shepherd from '../entities/Shepherd';
import Dog from '../entities/Dog/Dog';
import Flock from '../entities/Sheep/Flock';
import FlockSystem from '../systems/FlockSystem';
import CommandSystem from '../systems/CommandSystem';
import TerrainSystem from '../systems/TerrainSystem';
import PoetrySystem from '../systems/PoetrySystem';
import SaveSystem from '../systems/SaveSystem';
import GrassSystem from '../systems/GrassSystem';
import TreatSystem from '../systems/TreatSystem';
import VignettePipeline from '../pipelines/VignettePipeline';
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GUIDE_RADIUS, MOOD_UPDATE_INTERVAL_MS, WILD_SHEEP_COUNT, WILD_MIN_DIST, WILD_JOIN_RADIUS } from '../config/constants';
import { Poem } from '../systems/PoetrySystem';

export default class GameScene extends Phaser.Scene {
    private shepherd!: Shepherd;
    private dog!: Dog;
    private flock!: Flock;
    private isSea!: (wx: number, wy: number) => boolean;
    private isSeaOrChannel!: (wx: number, wy: number) => boolean;

    private flockSystem!: FlockSystem;
    private commandSystem!: CommandSystem;
    private poetrySystem!: PoetrySystem;
    private saveSystem!: SaveSystem;
    private grassSystem!: GrassSystem;
    private treatSystem!: TreatSystem;

    private flockMood   = 0.5;
    private moodTimer   = 0;

    constructor() {
        super({ key: 'GameScene' });
    }

    create(): void {
        this.cameras.main.setZoom(0.4);
        this.cameras.main.setBackgroundColor('#1c4e7a');

        const terrain = new TerrainSystem(this);
        this.isSea          = terrain.isSea.bind(terrain);
        this.isSeaOrChannel = terrain.isSeaOrChannel.bind(terrain);

        // Spawn on random interior land (elevation ≥ 1 = not coast)
        const spawn = terrain.findRandomInteriorPosition(1);
        const cx = spawn.x;
        const cy = spawn.y;

        const cols = Math.ceil(WORLD_WIDTH  / TILE_SIZE);
        const rows = Math.ceil(WORLD_HEIGHT / TILE_SIZE);
        this.grassSystem = new GrassSystem(this, this.isSea, cols, rows);

        this.saveSystem = new SaveSystem();

        this.shepherd = new Shepherd(this, cx, cy, this.isSea);
        this.dog      = new Dog(this, cx + 60, cy + 40, this.isSea);
        this.flock    = new Flock(this, cx, cy, this.isSeaOrChannel);

        this.treatSystem  = new TreatSystem(this, 5, this.isSea, this.shepherd);
        this.flockSystem  = new FlockSystem();

        this.spawnWildSheep(cx, cy);

        this.commandSystem = new CommandSystem(this.dog, () => ({
            x: this.shepherd.x,
            y: this.shepherd.y,
        }));

        this.poetrySystem = new PoetrySystem(
            (poem: Poem) => this.showPoem(poem),
            this.saveSystem,
        );

        this.scene.launch('UIScene', {
            commandSystem: this.commandSystem,
            shepherd:      this.shepherd,
            dog:           this.dog,
        });

        // Register + apply vignette PostFX (WebGL only)
        if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
            this.game.renderer.pipelines.addPostPipeline('VignettePipeline', VignettePipeline);
            this.cameras.main.setPostPipeline(VignettePipeline);
        }
    }

    private spawnWildSheep(spawnX: number, spawnY: number): void {
        let placed = 0;
        let attempts = 0;
        while (placed < WILD_SHEEP_COUNT && attempts < WILD_SHEEP_COUNT * 20) {
            attempts++;
            const x = Math.random() * WORLD_WIDTH;
            const y = Math.random() * WORLD_HEIGHT;
            if (this.isSeaOrChannel(x, y)) continue;
            if (Math.hypot(x - spawnX, y - spawnY) < WILD_MIN_DIST) continue;
            this.flock.addWild(x, y);
            placed++;
        }
    }

    private showPoem(poem: Poem): void {
        this.scene.get('UIScene').events.emit('show-poem', poem);
    }

    update(_time: number, delta: number): void {
        this.shepherd.update(delta);
        this.dog.tickAutonomous(this.flock.sheep, this.shepherd.x, this.shepherd.y, delta);
        this.dog.update(delta);

        this.grassSystem.update(delta);
        this.treatSystem.update(delta, this.shepherd);

        // Sync guided sheep state
        const guideActive = this.shepherd.guideActive;
        for (const s of this.flock.sheep) {
            s.isGuided = guideActive &&
                Math.hypot(s.x - this.shepherd.x, s.y - this.shepherd.y) < GUIDE_RADIUS;
        }

        // Wild sheep join when shepherd gets close
        for (const s of this.flock.sheep) {
            if (!s.isWild) continue;
            if (Math.hypot(s.x - this.shepherd.x, s.y - this.shepherd.y) < WILD_JOIN_RADIUS) {
                s.isWild = false;
                s.sprite.clearTint();
                this.dog.startFetch(s, this.flock.sheep);
                // Brief scale pulse so the join is obvious
                this.tweens.add({
                    targets:  s.sprite,
                    scaleX:   0.18,
                    scaleY:   0.18,
                    duration: 180,
                    yoyo:     true,
                    ease:     'Sine.easeOut',
                });
            }
        }

        this.flockSystem.update(
            this.flock.sheep, this.dog, [], this.shepherd.x, this.shepherd.y,
            delta, this.isSeaOrChannel, this.grassSystem, this.flockMood,
        );
        this.flock.syncSprites();

        // Mood update (every 500ms)
        this.moodTimer += delta;
        if (this.moodTimer >= MOOD_UPDATE_INTERVAL_MS) {
            this.moodTimer = 0;
            this.flockMood = this.grassSystem.averageGrassUnder(this.flock.sheep);
            this.scene.get('UIScene').events.emit('mood-update', this.flockMood);
        }

        this.poetrySystem.update(this.shepherd.isMoving, delta);
        this.saveSystem.saveFlockCount(this.flock.sheep.length);
    }
}
