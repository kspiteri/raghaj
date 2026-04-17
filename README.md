# Ragħaj

*Ragħaj* (pronounced *ra-ay*) is Maltese for "shepherd."

A quiet, contemplative game set in the Maltese countryside. You play as a shepherd guiding your flock across the sun-baked garigue and limestone terraces of Malta — herding sheep with your dog, finding good grazing land, and pausing now and then to take in the landscape.

There are no enemies, no timers, no fail states. Just open land, a flock to look after, and the sound of the islands. *

---

( * some of this stuff might not be implemented yet )

---

## Play

[**Play in your browser →**](https://kspiteri.github.io/raghaj)

---

## Run locally

You'll need [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) installed.

```bash
git clone https://github.com/kspiteri/raghaj.git
cd raghaj
pnpm install
pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173).

To build for production:

```bash
pnpm build
```

---

## Commands

| Button | Key | Action |
|---|---|---|
| Mur | 1 | Free — dog autonomously herds strays |
| Ejja | 2 | Follow — dog trails behind you, detours to push strays |
| Ieqaf | 3 | Stop — dog holds position, auto-reverts (trust-timed) |
| Bravu! | 4 | Praise — builds dog trust (combo up to ×5) |
| Agħti | — | Give treat — active when dog is close enough |
| Mexxi | G | Guide — nearby sheep follow you for 8 seconds |

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD | Move shepherd |
| Hold Shift | Run |
| Touch joystick | Move (distance = speed) |
| M | Toggle parchment minimap |
| Mouse wheel / = / − | Zoom |

---

## Dog trust

Your dog has a trust level (0–100). It affects how long commands last and how reliably they're obeyed.

- **Gain trust:** give treats (Agħti), praise (Bravu!)
- **Lose trust:** leaving the dog idle too long, keeping it stopped too long
- **Low trust (<40):** 20% chance commands are silently ignored
- **High trust (>70):** faster autonomous decisions, longer Ejja/Ieqaf durations

---

## Built with

- [Phaser 4](https://phaser.io) — game engine
- [Vite](https://vitejs.dev) — build tool
- TypeScript

---

*MIT License*
