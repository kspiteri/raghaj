# Ragħaj

*Ragħaj* (pronounced *ra-ay*) is Maltese for "shepherd."

A quiet, contemplative game set in the Maltese countryside. You play as a shepherd guiding your flock across the sun-baked garigue and limestone terraces of Malta — herding sheep with your dog, finding good grazing land, and pausing now and then to take in the landscape.

There are no enemies, no timers, no fail states. Just open land, a flock to look after, and the sound of the islands. *

---

*

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

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD | Move shepherd |
| Hold Shift | Run |
| Touch joystick | Move (distance = speed) |
| 1 / 2 / 3 / 4 | Dog commands (Mur / Ejja / Ieqaf / Bravu!) |
| G | Guide ability — nearby sheep follow you |
| M | Toggle map |
| Mouse wheel / pinch | Zoom |
| + / − | Zoom in / out |

---

## Built with

- [Phaser 3](https://phaser.io) — game engine
- [Vite](https://vitejs.dev) — build tool
- TypeScript

---

*MIT License*
