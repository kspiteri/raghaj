# Ragħaj

A contemplative Maltese sheep-herding game. Phaser 3 + Vite + TypeScript, pnpm.

## Stack

- **Phaser 3** — game engine (pure 2D, no Three.js)
- **Vite** — bundler
- **TypeScript** — strict mode
- **pnpm** — package manager

## Project Structure

```
src/
  config/
    constants.ts        — all tunable game values
  entities/
    BaseEntity.ts       — shared base: scene ref, x/y, update(), destroy()
    Shepherd.ts         — player: joystick input, isMoving, guideActive, treatCount
    Dog/
      Dog.ts            — herding dog: state machine, trust system, commands
      DogStates.ts      — state transition: DogState × DogCommand → DogState
      types.ts          — DogState enum, DogCommand union
    Sheep/
      Sheep.ts          — SheepData: x, y, vx, vy, sprite, strayTimer, isStray, isGuided
      Flock.ts          — spawn clusters, syncSprites(), destroy()
  scenes/
    GameScene.ts        — main scene: terrain, entities, grass, treats, mood, poetry
    UIScene.ts          — overlay: command buttons, guide button, mood icon, treat count, poem display
  systems/
    FlockSystem.ts      — boids + dog repulsion + guided sheep + grass/stray integration + mood scaling
    CommandSystem.ts    — COMMANDS array, dispatch(), tryMatchVoice()
    TerrainSystem.ts    — chunked procedural terrain (garigue, coast, elevation), findRandomInteriorPosition()
    GrassSystem.ts      — per-tile grass levels, regrowth, eat, visual overlay, grazing zones
    TreatSystem.ts      — treat collectibles: spawn near player, shepherd collects, gives to dog
    PoetrySystem.ts     — JSON poem loader, still-trigger, unlock via SaveSystem
    VoiceSystem.ts      — SpeechRecognition wrapper, no locale lock, auto-restart
    SaveSystem.ts       — localStorage: raghaj_flock_count, raghaj_poems_unlocked[]
  pipelines/
    VignettePipeline.ts — WebGL post-processing vignette
  utils/
    iso.ts              — isoProject(wx, wy) → screen coords
  main.ts               — Phaser config (EXPAND, 60fps, devicePixelRatio resolution) + boot
data/
  poems.json            — poem library: id, title, author, text_mt, text_en, audio
plans/
  roadmap.md            — phased development plan
```

## Architecture

Pure Phaser 2D — no Three.js. Isometric-style projection via `isoProject()` utility.
UIScene runs in parallel with GameScene as a display overlay (`scene.launch`).
GameScene owns all entities and systems; emits events to UIScene via `scene.get('UIScene').events.emit()`.

### Font constants (UIScene.ts)
- `FONT = "'Lora', Georgia, serif"` — body text, tooltips
- `FONT_DISPLAY = "'Cinzel', Georgia, serif"` — command button labels

Both loaded via Google Fonts in `index.html`.

### HiDPI
Phaser config includes `resolution: window.devicePixelRatio` (via intersection type workaround — not in Phaser 3.90 types).

## Key Constants (src/config/constants.ts)

| Constant | Value | Notes |
|---|---|---|
| `FLOCK_SIZE_INITIAL` | 200 | |
| `WORLD_WIDTH / HEIGHT` | 36000×36000px | Chunked terrain |
| `TILE_SIZE` | 64px | |
| `BOID_COHESION` | 0.06 | |
| `BOID_SEPARATION` | 1.5 | |
| `BOID_ALIGNMENT` | 0.4 | |
| `DOG_REPULSION_RADIUS` | 150px | |
| `SHEEP_GRAZE_SPEED` | 22px/s | Calm wander |
| `SHEEP_FLEE_SPEED` | 120px/s | When fleeing dog |
| `SHEPHERD_WALK_SPEED` | 90px/s | |
| `SHEPHERD_RUN_SPEED` | 300px/s | |
| `DOG_SPEED` | 300px/s | |
| `GUIDE_DURATION_MS` | 8 000ms | Mexxi ability duration |
| `GUIDE_COOLDOWN_MS` | 30 000ms | |
| `GUIDE_RADIUS` | 300px | Sheep pulled into guide |
| `GUIDE_SPREAD_RADIUS` | 180px | Guided sheep orbit distance |
| `DOG_TRUST_INITIAL` | 30 | 0–100 scale |
| `TREAT_SPAWN_COUNT` | 5 | Always on map, respawn near player |
| `TREAT_TRUST_BONUS` | 15 | Trust added per treat given |
| `EJJA_DURATION_MIN_MS` | 8 000ms | At trust=0 |
| `EJJA_DURATION_MAX_MS` | 45 000ms | At trust=100 |
| `IEQAF_DURATION_MIN_MS` | 10 000ms | At trust=0 |
| `DOG_STOP_MAX_MS` | 60 000ms | At trust=100 |
| `POETRY_STILL_TRIGGER_MS` | 10 000ms | |

## Maltese Commands

| Label | Description | DogCommand |
|---|---|---|
| Mur | Free — dog autonomously herds strays | `MUR` |
| Ejja | Follow — dog follows shepherd, detours to push strays | `EJJA` |
| Ieqaf | Stop — dog holds position, auto-reverts (trust-timed) | `IEQAF` |
| Bravu! | Praise — adds trust (combo up to ×5) | `BRAVU` |
| Agħti | Give treat — enabled when dog is close enough | `AGHTI` |
| Mexxi | Guide — nearby sheep follow shepherd for 8s | _(Shepherd ability)_ |

## Dog Trust System

- Starts at 30; range 0–100
- Gains: treats (+15), praise combo (+1 per press, up to 5 in window)
- Loses: idle decay (−1 every 15s), stopped too long (−2/s after 20s), praise cooldown
- Effects: low trust (<40) → 20% chance commands ignored; high trust (>70) → faster autonomous decisions, longer Ejja/Ieqaf durations
