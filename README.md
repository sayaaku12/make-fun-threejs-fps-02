# make-fun-threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/sayaaku12/make-fun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/sayaaku12/make-fun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTFALL — a Counter-Strike-style tactical FPS in the browser: first-person rounds against bots, a buy phase between rounds, a plant/defuse objective, three.js 0.187.0, fully offline, no build step.

## Run it

```sh
node serve.ts --port 8080
```

Then open http://localhost:8080/ in desktop Chrome. Requires Node 22+.

## How it plays

- Two teams (Vanguard vs Ember), first to 7 round wins takes the match (13 rounds max, 7–6 possible).
- Each round: a 14-second buy phase ($800 start, rifle/grenade/armor in the shop), then live play — eliminate the other team, or plant the charge at Site A and hold it through the 35-second fuse.
- Bots use waypoints + line-of-sight shooting; the round economy pays $1,900 base for a loss plus a $500-per-loss streak bonus (capped at $3,400), $3,250 for a plant win.
- Controls: WASD move, mouse look, click to shoot, R reload, E plant/defuse, Shift walk slow, Ctrl crouch.
- Screenshots under `screenshots/` are real renders of the game's own code.

## Files

- `main.ts` — the entrypoint: builds the dossier (game files + screenshots) and verifies it deterministically.
- `serve.ts` — tiny static server for local play-testing.
- `game/` — the playable game as static files (ES modules, import map, vendored three.js 0.187.0).
- `vendor/makefun-threejs.ts` — kit file, unchanged.

## License

MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=c0tz9ttj&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
