# Settlements System — Ragħaj

## Context

The game world is 36 000×36 000 px of procedural Maltese terrain with no points of interest beyond randomly spawning treats and wild sheep. Adding settlements gives the shepherd something to navigate toward, anchors the fictional landscape with named places, and provides a lightweight quest loop (e.g. carry a letter from one village to another) that creates purposeful movement and rewards without breaking the contemplative tone.

**Decisions:**
- 3 fixed-anchor villages (always at the same world coordinates) + 4 randomly placed farmsteads/chapels
- Random positions are saved to `localStorage` so they persist across sessions
- Quest style: simple proximity-based "deliver" and "visit" tasks, no complex inventory

---

## Approach

A new `SettlementSystem` owns all placement, visuals, proximity detection, and quest state. It follows the same collaborator pattern as `GrassSystem` and `TreatSystem`: instantiated in `GameScene.create()`, passed a `TerrainSystem` reference for terrain queries, and called in `GameScene.update()`. Fixed anchors are expressed as fractional world coordinates (0–1) and snapped to land via the existing `terrain.findLandNear()`. Random positions are generated once and written to `SaveSystem`. UIScene receives events (`settlement-enter`, `quest-available`, `quest-complete`) and shows lightweight toasts.

---

## File Changes

### Create
- **`data/settlements.json`** — settlement definitions: id, Maltese name, type, optional fractional anchor, quest templates
- **`src/systems/SettlementSystem.ts`** — placement, visuals, proximity loop, quest state machine

### Modify
- **`src/config/constants.ts`** — add `SETTLEMENT_INTERACT_RADIUS`, `SETTLEMENT_MIN_DIST`, `SETTLEMENT_RANDOM_COUNT`
- **`src/systems/SaveSystem.ts`** — add settlement positions persistence (`raghaj_settlement_positions`), discovered ids (`raghaj_discoveries`), completed quest ids (`raghaj_quests_done`)
- **`src/scenes/GameScene.ts`** — instantiate `SettlementSystem`, call `update()`, wire events to UIScene
- **`src/scenes/UIScene.ts`** — add `LocationBanner` (name toast on arrival) and `QuestPrompt` (accept/decline overlay for quests)

---

## Implementation Steps

### Task 1 — Data & constants

**`data/settlements.json`**

Anchors derived from real GPS coordinates mapped onto the heightmap bounds (N 36.09°, S 35.80°, W 14.18°, E 14.58°):

| Settlement | Lat / Lon | fx | fy |
|---|---|---|---|
| Valletta | 35.8997°N, 14.5147°E | 0.837 | 0.657 |
| Mdina | 35.8872°N, 14.4038°E | 0.560 | 0.699 |
| Marsaxlokk | 35.8413°N, 14.5431°E | 0.908 | 0.857 |

```json
[
  {
    "id": "valletta", "name": "Valletta", "type": "village",
    "anchor": { "fx": 0.837, "fy": 0.657 },
    "quests": [
      { "id": "val-letter", "type": "deliver", "to": "mdina",
        "label": "Deliver a letter to Mdina", "reward": { "treats": 3 } }
    ]
  },
  {
    "id": "mdina", "name": "Mdina", "type": "village",
    "anchor": { "fx": 0.560, "fy": 0.699 },
    "quests": [
      { "id": "mdi-poem", "type": "visit", "label": "Rest within the Silent City",
        "reward": { "poemTrigger": true } }
    ]
  },
  {
    "id": "marsaxlokk", "name": "Marsaxlokk", "type": "village",
    "anchor": { "fx": 0.908, "fy": 0.857 },
    "quests": [
      { "id": "mxl-letter", "type": "deliver", "to": "valletta",
        "label": "Carry fresh catch to Valletta", "reward": { "treats": 2 } }
    ]
  }
]
```
The 4 random farmsteads/chapels have no anchor and no quests initially (or a single "visit" quest).

**`src/config/constants.ts`** — append:
```ts
export const SETTLEMENT_INTERACT_RADIUS = 200;   // px — proximity trigger
export const SETTLEMENT_MIN_DIST        = 3500;  // px — min distance between any two settlements
export const SETTLEMENT_RANDOM_COUNT    = 4;
```

---

### Task 2 — SaveSystem extensions (`src/systems/SaveSystem.ts`)

Add three new key/method pairs following the existing `KEY_POEMS` pattern:

```ts
const KEY_SETTLEMENT_POS  = 'raghaj_settlement_positions';
const KEY_DISCOVERIES     = 'raghaj_discoveries';
const KEY_QUESTS_DONE     = 'raghaj_quests_done';
```

Methods:
- `getSettlementPositions(): Array<{id:string,wx:number,wy:number}>`
- `saveSettlementPositions(positions: Array<{id:string,wx:number,wy:number}>): void`
- `getDiscoveries(): string[]`
- `addDiscovery(id: string): void`
- `getQuestsDone(): string[]`
- `completeQuest(id: string): void`

---

### Task 3 — SettlementSystem (`src/systems/SettlementSystem.ts`)

**Types:**
```ts
interface SettlementDef {
  id: string; name: string; type: 'village' | 'farmstead' | 'chapel';
  anchor?: { fx: number; fy: number };
  quests: QuestDef[];
}
interface QuestDef {
  id: string; type: 'deliver' | 'visit'; to?: string;
  label: string; reward: { treats?: number; poemTrigger?: boolean };
}
interface PlacedSettlement extends SettlementDef {
  wx: number; wy: number;
  icon: Phaser.GameObjects.Container;
}
interface ActiveQuest {
  def: QuestDef; fromId: string;
  carryingItem: boolean;
}
```

**`constructor(scene, terrain, save, callbacks)`**
1. Load settlement defs from `data/settlements.json`
2. Call `resolvePositions(terrain, save)` → returns `PlacedSettlement[]`
3. For each settlement call `createVisual(scene, settlement)`

**`resolvePositions(terrain, save)`**
1. Load saved random positions from `save.getSettlementPositions()`
2. For anchor settlements: `terrain.findLandNear(def.anchor.fx * WORLD_WIDTH, def.anchor.fy * WORLD_HEIGHT)` — always re-snap (deterministic). Approximate world px: Valletta ~(30 132, 23 652), Mdina ~(20 160, 25 164), Marsaxlokk ~(32 688, 30 852)
3. Random slots: use saved position if exists, else generate with `terrain.findRandomInteriorPosition(2)` respecting `SETTLEMENT_MIN_DIST` (pattern mirrors `spawnWildSheep` in `GameScene.ts:87-98`)
4. Save newly generated random positions back to localStorage

**`createVisual(scene, s: PlacedSettlement)`**
- `Phaser.GameObjects.Graphics` filled diamond at `(s.wx, s.wy)`, depth 15
- Color: `0xc8a060` village / `0x8a7050` farmstead / `0xd0c090` chapel
- Name label: `scene.add.text(s.wx, s.wy - 28, s.name, ...)` depth 16
- Both wrapped in a container stored on `s.icon`

**`update(shepherdX, shepherdY, save)`**
- Per settlement: check `Math.hypot` against `SETTLEMENT_INTERACT_RADIUS`
- On entry: emit `onEnter(s)`, check if active quest destination matches → call `completeActiveQuest`
- Track inside/outside state per settlement to avoid repeated triggers

**`acceptQuest(settlementId, questDefId)`** — sets `activeQuest`, `carryingItem = true`

**`completeActiveQuest(save)`** — saves to `raghaj_quests_done`, applies reward callbacks, clears `activeQuest`

---

### Task 4 — GameScene wiring (`src/scenes/GameScene.ts`)

1. After `TerrainSystem` construction, instantiate:
```ts
this.settlementSystem = new SettlementSystem(this, terrain, this.saveSystem, {
  onEnter:          (s) => this.scene.get('UIScene').events.emit('settlement-enter', s),
  onQuestAvailable: (s, q) => this.scene.get('UIScene').events.emit('quest-available', { settlement: s, quest: q }),
  onQuestComplete:  (q) => this.scene.get('UIScene').events.emit('quest-complete', q),
  onTreats:         (n) => this.shepherd.addTreats(n),
  onPoemTrigger:    () => this.poetrySystem.triggerPoem(),
});
```
2. In `update()`, call `this.settlementSystem.update(this.shepherd.x, this.shepherd.y, this.saveSystem)`
3. Add `addTreats(n)` to `src/entities/Shepherd.ts`:
```ts
addTreats(n: number): void {
  this.treatCount = Math.min(TREAT_MAX_CARRY, this.treatCount + n);
}
```

---

### Task 5 — UIScene notifications (`src/scenes/UIScene.ts`)

**LocationBanner** — fades in at top-centre for 2s then fades out:
```ts
private showLocationBanner(text: string): void { ... }
```
Uses `this.scale.width`, follows existing tween pattern in the file.

**QuestPrompt** — simple two-button modal:
- Displays `quest.label` + destination name
- "Accept" button calls back into GameScene via `this.scene.get('GameScene')` to call `settlementSystem.acceptQuest()`
- "Not now" dismisses

Wire in `create()`:
```ts
this.events.on('settlement-enter', (s) => this.showLocationBanner(s.name));
this.events.on('quest-available',  (data) => this.showQuestPrompt(data));
this.events.on('quest-complete',   (q) => this.showLocationBanner('Quest complete!'));
```

---

## Acceptance Criteria

1. On load, 3 village icons at fixed anchor coordinates (snapped to land) + 4 farmstead/chapel icons at randomly generated positions
2. Same 4 random positions on reload (from `localStorage`)
3. Entering settlement radius → location name banner fades in/out
4. A deliver quest is offered on arrival at eligible settlement; accepting sets active quest
5. Reaching quest destination with active quest triggers completion, applies treat reward, clears quest
6. Completed quest ids in `localStorage`; same quest not re-offered
7. All 7 settlements ≥ 3500px apart
8. Settlement icons visible above terrain, below shepherd (depth 15–16)

---

## Verification Steps

1. `pnpm dev` → zoom out → confirm 7 settlement icons spread across the world
2. Reload → same 4 random positions (verify `localStorage.getItem('raghaj_settlement_positions')`)
3. Navigate to a village → location banner appears with correct name
4. Run deliver quest end-to-end → treat count increases by reward amount
5. Complete quest → re-enter same settlement → no quest prompt
6. Console: confirm `terrain.isSea(wx, wy)` is false for all settlement positions

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Fixed anchors land on sea | `terrain.findLandNear()` BFS handles this — anchors just need to be roughly in the right area |
| Random slots can't satisfy min-distance on a tight map | Retry with reduced `SETTLEMENT_MIN_DIST` (−500px per retry) |
| `addTreats()` missing on Shepherd | One-liner addition — zero risk |
| Active quest lost on reload | Acceptable for v1; add `raghaj_active_quest` to SaveSystem as follow-up |
| `scale.width` not available during banner creation | Already used in existing `layout()` — safe to use the same way |
