# Ragħaj — Development Roadmap

## Phase 1: Prototype ✓ Complete

- [x] Project scaffold (Vite + Phaser 3 + TypeScript + pnpm)
- [x] Isometric-style top-down view via `isoProject()` utility
- [x] Chunked procedural terrain (garigue, coast, elevation levels, sea)
- [x] Shepherd entity with virtual joystick, run speed, camera follow
- [x] Flock of 200 sheep with boids (cohesion / separation / alignment)
- [x] One dog — state machine: idle / herding / stopped
- [x] Commands: Mur / Ejja / Ieqaf / Bravu! / Agħti / Mexxi
- [x] Command buttons UI (Maltese labels, Cinzel font, English tooltips on hover)
- [x] Dog repulsion vector on nearby sheep
- [x] Dog trust system (0–100, treats, praise combos, idle decay)
- [x] Treat collectibles (5 on map, spawn near player, shepherd collects + gives to dog)
- [x] Grass system — per-tile levels, regrowth, eat when grazing, bare-ground repulsion
- [x] Stray sheep — bare-ground timer, wander multiplier, stray flag
- [x] Flock mood — average grass level, scales cohesion/separation boid weights
- [x] Mexxi (guide) ability — nearby sheep orbit shepherd for 8s, 30s cooldown
- [x] Ejja continuous follow — dog trails behind shepherd, periodic stray detours
- [x] Trust-timed Ejja/Ieqaf duration (lerp min→max with trust)
- [x] Poetry system (wired, poems disabled pending content)
- [x] localStorage save: flock count + unlocked poems
- [x] HiDPI canvas (devicePixelRatio), WebGL vignette post-processing
- [x] Voice input (SpeechRecognition, keyword matching, no locale lock)

---

## Phase 2: Gameplay Depth

Goal: Meaningful consequences, emergent events, richer progression.

- [ ] **Flock growth** — wild sheep at map edges wander in; approach slowly and they join
- [ ] **Flock births** — high mood + sustained good grazing occasionally adds a lamb
- [ ] **Permanent stray loss** — sheep that reaches the map edge is lost from the count
- [ ] **Day/night cycle** — visual lighting shift; sheep graze less at night, dog more restless
- [ ] **Water sources** — sheep need water periodically; mood drops if dry too long
- [ ] **Weather** — wind biases sheep drift; rain boosts grass regrowth
- [ ] **Named dog** — dog gets a name; trust persists across sessions (localStorage)
- [ ] **New command at high trust** — Ġema (gather entire flock) unlocked at trust ≥ 80
- [ ] **Poems via landmarks** — unlock at specific explored map locations, not just stillness
- [ ] **Journal** — discovery log: named locations, found sheep, unlocked poems (localStorage)
- [ ] **Shepherd stamina** — running drains a bar; walking/standing restores it
- [ ] **Flock count HUD** — live count visible in top-left corner
- [ ] Second herding dog
- [ ] Predators: fox / bird of prey — dog can chase away
- [ ] Real poem narration audio (MP3/OGG)
- [ ] Poetry library in pause menu (replay unlocked poems)

---

## Phase 3: Polish & PWA

Goal: Beautiful, installable, culturally complete.

- [ ] Seasonal variations (spring wildflowers, dry summer, autumn haze)
- [ ] Cosmetic options: shepherd hat variants, flock wool tints
- [ ] PWA manifest + service worker (offline play, install to home screen)
- [ ] Accessibility: colour-blind modes, text-only poetry mode, sound toggles
- [ ] 8–12 poems at launch, easy JSON drop-in for new recordings post-launch
- [ ] Donation / support link (itch.io)

---

## Key Constants (src/config/constants.ts)

| Constant | Value |
|---|---|
| `FLOCK_SIZE_INITIAL` | 200 |
| `WORLD_WIDTH / HEIGHT` | 36 000 × 36 000 px |
| `DOG_TRUST_INITIAL` | 30 |
| `TREAT_SPAWN_COUNT` | 5 |
| `GUIDE_DURATION_MS` | 8 000 |
| `GUIDE_COOLDOWN_MS` | 30 000 |
| `EJJA_DURATION_MIN/MAX_MS` | 8 000 / 45 000 |
| `IEQAF_DURATION_MIN_MS` | 10 000 |
| `DOG_STOP_MAX_MS` | 60 000 |
| `GRASS_REGROW_RATE_PER_SEC` | 0.05 (0→3 in ~60s) |
| `STRAY_TIME_THRESHOLD` | 20s |
