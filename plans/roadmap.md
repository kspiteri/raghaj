# Ragħaj — Development Roadmap

## Phase 1: Prototype

Goal: Playable core loop. One dog, basic terrain, herding works, poems appear.

**Stack:** Vite + Phaser 3 (pure 2D) + TypeScript + pnpm — no Three.js.

- [ ] Project scaffold
- [ ] Phaser 2D isometric-style top-down view (angled camera illusion via sprite art)
- [ ] Basic tiled garigue ground + a few dry-stone wall sprites
- [ ] Shepherd entity with virtual joystick movement
- [ ] Flock of 200 sheep with boids (cohesion / separation / alignment)
- [ ] One dog — state machine: idle / moving / herding
- [ ] 4 Phase 1 commands: Ejja l-hawn / Oqgħod / Mur / Waqqaf
- [ ] Command buttons UI (Maltese label + English phonetic hint, touch-friendly)
- [ ] Dog exerts repulsion vector on nearby sheep
- [ ] Poetry system: JSON-driven, text-only, calm-moment trigger (~10s still)
- [ ] 3–4 placeholder poems (Maltese + English subtitle toggle)
- [ ] localStorage save: flock count + unlocked poems

---

## Phase 2: Core Release

Goal: Full feature set, two dogs, all commands, predators, real poems.

- [ ] Second herding dog
- [ ] Remaining commands: Xellug / Lemin / Bravu! (with praise feedback)
- [ ] Voice input — SpeechRecognition API, no locale restriction (user's device language used, Maltese phoneme matching done via keyword detection not locale lock), graceful button fallback
- [ ] Lost sheep: discoverable lambs that grow the flock on reunion
- [ ] Predators: fox / bird of prey — dogs can chase away
- [ ] Cliff edges: sheep may tumble but are recoverable
- [ ] Procedural terrain chunking (garigue, terraced fields, cliff faces, sea horizon)
- [ ] Real poem narration audio (MP3/OGG, same JSON schema)
- [ ] Poetry library in pause menu (replay any unlocked poem)
- [ ] Full UI polish: earthy palette, handwritten-style Maltese font accents
- [ ] 8–12 poems at launch with easy JSON drop-in for new recordings

---

## Phase 3: Polish & PWA

Goal: Beautiful, installable, culturally complete.

- [ ] **Isometric view** — switch from flat top-down to true isometric projection (Phaser tilemaps or custom isometric transform). Sheep, shepherd, dog sprites all need isometric art. Significant visual uplift.
- [ ] Day-night cycle with dynamic lighting
- [ ] Light seasonal variations (spring wildflowers, dry summer, autumn haze)
- [ ] Cosmetic options: shepherd hat variants, flock wool tints
- [ ] PWA manifest + service worker (offline play, install to home screen)
- [ ] Accessibility: colour-blind modes, text-only poetry mode, sound level toggles
- [ ] Donation / support link (itch.io page)
- [ ] More poems added post-launch via JSON (no app update needed)

---

## Key Constants (tunable in `src/config/constants.ts`)

| Constant | Phase 1 Value |
|---|---|
| `FLOCK_SIZE_INITIAL` | 200 |
| `FLOCK_SIZE_MAX` | 1000 | _(scale up after Phase 1 performance validated)_ |
| `BOID_COHESION` | 0.3 |
| `BOID_SEPARATION` | 1.5 |
| `BOID_ALIGNMENT` | 0.7 |
| `BOID_DOG_REPULSION` | 2.0 |
| `DOG_REPULSION_RADIUS` | 150 |
| `SHEPHERD_SPEED` | 200 |
| `DOG_SPEED` | 350 |
| `SHEEP_SPEED` | 120 |
| `LOD_NEAR_THRESHOLD` | 300 |
| `POETRY_STILL_TRIGGER_MS` | 10000 |
