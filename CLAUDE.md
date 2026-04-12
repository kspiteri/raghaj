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
    constants.ts        — all tunable game values (flock, boids, speeds, camera, poetry)
  entities/
    BaseEntity.ts       — shared base: scene ref, x/y, abstract update(), destroy()
    Shepherd.ts         — player entity: virtual joystick input, isMoving flag, camera anchor
    Dog/
      Dog.ts            — herding dog: receiveCommand(), getRepulsionVector(), state-driven movement
      DogStates.ts      — state transition function: DogState × DogCommand → DogState
      types.ts          — DogState enum, DogCommand union type
    Sheep/
      Sheep.ts          — SheepData interface: x, y, vx, vy, sprite
      Flock.ts          — flock manager: spawn(), syncSprites(), destroy()
  scenes/
    GameScene.ts        — main scene: terrain setup, entity updates, poetry trigger, save
    UIScene.ts          — overlay: command buttons (Maltese labels), poem fade-in display
  systems/
    FlockSystem.ts      — boids (cohesion / separation / alignment) + dog repulsion vector
    CommandSystem.ts    — COMMANDS array, dispatch(), tryMatchVoice() keyword matching
    TerrainSystem.ts    — tiled garigue ground + static dry-stone wall props
    PoetrySystem.ts     — JSON poem loader, ~10s still trigger, unlocks via SaveSystem
    VoiceSystem.ts      — SpeechRecognition wrapper, no locale lock, auto-restart on end
    SaveSystem.ts       — localStorage: raghaj_flock_count, raghaj_poems_unlocked[]
  main.ts               — Phaser config (EXPAND scale, 60fps, transparent off) + boot
data/
  poems.json            — poem library: id, title, author, narrator, text_mt, text_en, audio
plans/
  roadmap.md            — phased development plan (Phase 1 → 3)
```

## Architecture

Pure Phaser 2D — no Three.js. Single canvas, top-down angled view with isometric-style sprite art.
UIScene runs in parallel with GameScene as a display overlay (launched via `scene.launch`).
GameScene owns all entities and systems; passes callbacks/refs to systems that need to emit UI events.

## Key Constants (src/config/constants.ts)

| Constant | Value | Notes |
|---|---|---|
| `FLOCK_SIZE_INITIAL` | 200 | Scale up after Phase 1 perf validated |
| `FLOCK_SIZE_MAX` | 1000 | |
| `BOID_COHESION` | 0.3 | Steer toward average neighbour position |
| `BOID_SEPARATION` | 1.5 | Push away when too close |
| `BOID_ALIGNMENT` | 0.7 | Match average neighbour velocity |
| `BOID_DOG_REPULSION` | 2.0 | Multiplier on dog push vector |
| `BOID_NEIGHBOR_RADIUS` | 80px | How far a sheep looks for neighbours |
| `DOG_REPULSION_RADIUS` | 150px | Dog influence range on flock |
| `SHEPHERD_SPEED` | 200px/s | |
| `DOG_SPEED` | 350px/s | |
| `SHEEP_SPEED` | 120px/s | Max boid velocity |
| `JOYSTICK_RADIUS` | 60px | Outer ring size |
| `POETRY_STILL_TRIGGER_MS` | 10 000ms | Stillness before poem fires |
| `WORLD_WIDTH / HEIGHT` | 4000×4000px | |
| `TILE_SIZE` | 64px | Ground tile size |

## Roadmap

See `plans/roadmap.md` — Phase 1 (prototype), Phase 2 (core), Phase 3 (PWA + polish).

## Maltese Commands

| Label | Hint | Command |
|---|---|---|
| Ejja l-hawn | Come here | `COME` |
| Oqgħod | Stay | `STAY` |
| Mur | Go | `GO` |
| Waqqaf | Stop | `STOP` |
| Xellug | Left | `LEFT` _(Phase 2)_ |
| Lemin | Right | `RIGHT` _(Phase 2)_ |
| Bravu! | Good boy | `PRAISE` _(Phase 2)_ |
