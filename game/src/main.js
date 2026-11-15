// DUSTFALL — a round-based tactical FPS in the Ember Yard.
// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Vanguard (you + 3 bots) attacks; Ember (4 bots) defends
// Sites A and B. Win a round by eliminating Ember, or by planting the
// charge and holding until it detonates. Money between rounds buys guns,
// armour and grenades.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap, MAP } from './map.js';
import { createInput } from './input.js';
import { createMover } from './mover.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createBots } from './bots.js';
import { createRounds, BUY_ITEMS, KILL_REWARD, PLANT_REWARD } from './rounds.js';
import {
  WEAPONS, createWeaponState, weaponSpread, stepWeapon, tryFire, startReload,
} from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const map = createMap(scene);

// The one state object: everything the sim reads or writes lives here.
const G = {
  started: false,
  paused: false,
  playerAlive: true,
  health: 100,
  owned: ['pistol', 'rifle'],
  weaponIndex: 1,
  weapon: null,
  grenades: 1,
  grenadeList: [],
  charge: new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4, roughness: 0.5 }),
  ),
  chargePlantedAt: null,
  botDefuse: 0,
  lastKnownPush: null,
  elapsed: 0,
  stepCount: 0,
};
G.charge.visible = false;
scene.add(G.charge);

const playerMover = createMover(map.colliders, 0, 14.5);
const body = playerMover.body;
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootables = map.shootables;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const rounds = createRounds({
  audio,
  hud,
  onBuyPhase: (R) => {
    resetActors();
    hud.setRound(R.round);
    hud.setScore(R.scoreV, R.scoreE);
    hud.setMoney(R.money);
    hud.setGrenades(R.grenades);
    hud.setArmor(R.armor);
    hud.setObjective(`Plant the charge at Site ${R.attackSite} — or eliminate Ember. You carry the charge.`);
    hud.setTimer(R.buyTime, false);
    refreshBuyMenu();
    hud.showBuy(BUY_ITEMS, R.money, G.weapon.id);
    document.getElementById('buy-round').textContent = String(R.round);
  },
  onRoundStart: (R) => {
    hud.hideBuy();
    hud.setObjective(`Plant the charge at Site ${R.attackSite} — or eliminate Ember.`);
    hud.banner(`ROUND ${R.round}`, `Attack Site ${R.attackSite} — plant the charge or clear the yard`, 2200);
    audio.unlock();
  },
  onRoundEnd: () => {
    // A short breather, then the next buy phase.
    setTimeout(() => { if (!G.matchOver) rounds.startBuyPhase(); }, 4200);
  },
  onMatchEnd: (R) => {
    G.matchOver = true;
    input.releaseLock();
    hud.showOverlay('match', {
      title: R.matchWinner === 'vanguard' ? 'VANGUARD WINS' : R.matchWinner === 'ember' ? 'EMBER WINS' : 'DRAW',
      sub: R.matchReason + ' Click to play again.',
    });
  },
  onBuyWeapon: (id) => { buyWeapon(id); },
});

function setWeapon(id) {
  const index = G.owned.indexOf(id);
  if (index === -1) return;
  G.weaponIndex = index;
  G.weapon = createWeaponState(id);
  hud.setWeapon(WEAPONS[id].name);
  hud.setAmmo(G.weapon.mag, G.weapon.reserve);
}

function buyWeapon(id) {
  if (!G.owned.includes(id)) G.owned.push(id);
  setWeapon(id);
}

function refreshBuyMenu() {
  hud.showBuy(BUY_ITEMS, rounds.state.money, G.weapon.id);
}

function resetActors() {
  // Everyone back to spawn, fresh health, charge back on the player.
  const R = rounds.state;
  body.position.set(0, 0, 14.5);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  G.playerAlive = true;
  G.health = 100;
  G.grenades = R.grenades;
  G.charge.visible = false;
  G.chargePlantedAt = null;
  G.botDefuse = 0;
  for (const g of G.grenadeList) scene.remove(g.mesh);
  G.grenadeList.length = 0;
  bots.resetRound();
  hud.setHealth(100);
  hud.setArmor(R.armor);
  hud.setGrenades(G.grenades);
  if (G.weapon) hud.setAmmo(G.weapon.mag, G.weapon.reserve);
  syncCamera();
}

// Bots and their hooks: bot shots land here, and bot deaths pay here.
const bots = createBots(scene, map, rng, {
  effects,
  audio,
  now: () => G.elapsed,
  onBotHit: (target, damage, head, shooter) => {
    if (target.id === 'player') {
      hurtPlayer(damage, shooter);
    } else {
      const bot = bots.bots.find((b) => b.id === target.id);
      if (!bot || !bot.alive) return;
      const died = bots.damage(bot, damage, head);
      if (died) {
        hud.feed(shooter.name, bot.name, head);
        if (shooter.team === 'vanguard') {
          // A friendly bot's kill is worth a cheer, not money.
        }
      }
    }
  },
});

function hurtPlayer(damage, shooter) {
  if (shot) return; // staged captures never hurt the player
  if (!G.playerAlive || rounds.state.phase !== 'live') return;
  const R = rounds.state;
  let rest = damage;
  if (R.armor > 0) {
    const absorbed = Math.min(R.armor, Math.round(damage * 0.5));
    R.armor -= absorbed;
    rest -= absorbed;
    hud.setArmor(R.armor);
  }
  G.health -= rest;
  hud.setHealth(G.health);
  hud.damageFlash();
  audio.hurt();
  if (G.health <= 0) {
    G.playerAlive = false;
    hud.feed(shooter.name, 'Dust', false);
    hud.banner('YOU ARE DOWN', 'Your squad fights on — watch the round play out.', 3000);
    input.releaseLock();
  }
}

const input = createInput(renderer.domElement, onLockChange);
setWeapon('rifle');

// Spawn the squads: you plus three Vanguard bots against four Ember bots.
for (let i = 0; i < 3; i += 1) bots.spawn('vanguard', i, i === 0 ? 'rifle' : 'smg');
for (let i = 0; i < 4; i += 1) bots.spawn('ember', i, i === 3 ? 'sniper' : 'rifle');

hud.setHealth(100);
hud.setMoney(rounds.state.money);
hud.setScore(0, 0);
hud.setRound(1);
hud.setObjective('Plant the charge at Site A or B — or eliminate Ember.');
hud.setTimer(MAP.roundTime, false);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  hud.hideOverlay();
  if (rounds.state.matchWinner) {
    G.matchOver = false;
    rounds.startMatch();
    return;
  }
  if (!G.started) {
    G.started = true;
    rounds.startMatch();
    return;
  }
  if (rounds.state.phase === 'ready') {
    rounds.startRound();
  }
  input.requestLock();
});
hud.onBuy((id) => {
  if (rounds.buy(id)) refreshBuyMenu();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    G.paused = false;
    hud.hideOverlay();
    if (rounds.state.phase === 'ready') rounds.startRound();
  } else if (G.started && !G.matchOver) {
    if (rounds.state.phase === 'live' && G.playerAlive) {
      G.paused = true;
      hud.showOverlay('paused', `${rounds.state.scoreV}–${rounds.state.scoreE}`);
    }
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function playerActors() {
  // The actor list the bots see: you, then every living bot.
  const list = [{
    id: 'player', team: 'vanguard', pos: body.position, eye: body.eye,
    alive: G.playerAlive, moving: playerMover.groundSpeed() > 1, crouching: body.crouching,
  }];
  for (const bot of bots.bots) {
    list.push({
      id: bot.id, team: bot.team, pos: bot.mover.body.position, eye: bot.mover.body.eye,
      alive: bot.alive, moving: bot.mover.groundSpeed() > 1, crouching: false,
    });
  }
  return list;
}

function shoot(spreadOverride) {
  const w = G.weapon;
  if (!w || !tryFire(w)) {
    if (w && w.mag === 0 && w.cooldown <= 0) audio.dryFire();
    return false;
  }
  const spread = spreadOverride !== undefined
    ? spreadOverride
    : weaponSpread(w, playerMover.groundSpeed() > 1, body.crouching);
  camera.getWorldDirection(direction);
  const pellets = w.def.pellets;
  for (let p = 0; p < pellets; p += 1) {
    tmpVec.copy(direction);
    tmpVec.x += (rng() * 2 - 1) * spread;
    tmpVec.y += (rng() * 2 - 1) * spread;
    tmpVec.z += (rng() * 2 - 1) * spread;
    tmpVec.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec);
    const targets = shootables.concat(bots.hitMeshes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : tmpVec2.copy(camera.position).addScaledVector(tmpVec, 60);
    effects.tracer(camera.position.clone().addScaledVector(direction, 0.6), end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const head = hit.object.userData.part === 'head';
      const dist = hit.distance;
      const falloff = Math.max(0.5, 1 - dist / (w.def.range * 2));
      const dmg = Math.round(w.def.damage * (head ? w.def.headMult : 1) * falloff);
      const died = bots.damage(bot, dmg, head);
      hud.hitMarker(died);
      if (died) {
        hud.feed('Dust', bot.name, head);
        rounds.award(KILL_REWARD);
        audio.kill();
      } else audio.hit();
    } else if (hit) {
      effects.burstAt(hit.point, PALETTE.sandDark, 2.5);
    }
  }
  effects.muzzleFlash(camera.position.clone().addScaledVector(direction, 0.9));
  audio.shot(w.id);
  playerMover.body.pitch = Math.min(1.45, playerMover.body.pitch + w.def.recoil * (0.8 + rng() * 0.4));
  playerMover.body.yaw += (rng() * 2 - 1) * w.def.recoil * 0.35;
  hud.setAmmo(w.mag, w.reserve);
  return true;
}

function throwGrenade() {
  const R = rounds.state;
  if (G.grenades <= 0 || R.phase !== 'live' || !G.playerAlive) return;
  G.grenades -= 1;
  R.grenades = G.grenades;
  hud.setGrenades(G.grenades);
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rustDark), roughness: 0.4, metalness: 0.5 }),
  );
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  G.grenadeList.push({
    mesh,
    vel: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 2.1,
  });
  audio.step();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const at = g.mesh.position;
  effects.burstAt(at, PALETTE.accent, 9);
  effects.burstAt(at, PALETTE.danger, 6);
  audio.explosion();
  // Hurt every living actor near the blast, friend or foe.
  const victims = playerActors();
  for (const actor of victims) {
    if (!actor.alive) continue;
    const d = Math.hypot(actor.pos.x - at.x, actor.pos.z - at.z)
      + Math.abs((actor.pos.y + 1) - at.y) * 0.5;
    if (d > 6.5) continue;
    const dmg = Math.round(95 * (1 - d / 7.5));
    if (actor.id === 'player') hurtPlayer(dmg, { name: 'Grenade' });
    else {
      const bot = bots.bots.find((b) => b.id === actor.id);
      if (bot && bot.alive) {
        const died = bots.damage(bot, dmg, false);
        if (died) {
          hud.feed(bot.team === 'ember' ? 'Dust' : 'Grenade', bot.name, false);
          if (bot.team === 'ember') { rounds.award(KILL_REWARD); audio.kill(); }
        }
      }
    }
  }
}

// Planting and defusing: the charge is yours while it is not planted.
// Hold E inside a site's ring to plant; once planted, an Ember bot that
// reaches the charge defuses it over five seconds.
function siteAt(x, z) {
  for (const [name, site] of Object.entries(MAP.sites)) {
    if (Math.hypot(x - site.x, z - site.z) <= site.r) return name;
  }
  return null;
}

function stepInteract(dt) {
  const R = rounds.state;
  if (R.phase !== 'live') { R.planting = false; R.defusing = false; hud.hideProgress(); return; }
  const site = siteAt(body.position.x, body.position.z);
  const wantPlant = input.keys.has('KeyE') && G.playerAlive && !R.plantedSite && site;
  if (wantPlant) {
    R.planting = true;
    R.plantProgress += dt / MAP.plantTime;
    hud.showProgress(`PLANTING AT SITE ${site}`, R.plantProgress);
    if (Math.floor(R.plantProgress * 10) !== Math.floor((R.plantProgress - dt / MAP.plantTime) * 10)) audio.plantBeep();
    if (R.plantProgress >= 1) {
      R.plantedSite = site;
      R.fuseTime = MAP.fuseTime;
      R.plantProgress = 0;
      R.planting = false;
      hud.hideProgress();
      G.chargePlantedAt = MAP.sites[site];
      G.charge.position.set(MAP.sites[site].x, 0.35, MAP.sites[site].z);
      G.charge.visible = true;
      rounds.award(PLANT_REWARD);
      hud.banner('CHARGE PLANTED', `Site ${site} — hold it until detonation.`, 2600);
      hud.setObjective(`Charge planted at Site ${site} — defend it until it blows.`);
      audio.plantBeep();
    }
  } else {
    R.planting = false;
    R.plantProgress = 0;
    if (!R.plantedSite) hud.hideProgress();
  }

  if (R.plantedSite) {
    // An Ember bot standing on the charge defuses it.
    let near = false;
    for (const bot of bots.living('ember')) {
      const s = MAP.sites[R.plantedSite];
      if (Math.hypot(bot.mover.body.position.x - s.x, bot.mover.body.position.z - s.z) < 2.2) { near = true; break; }
    }
    if (near) {
      G.botDefuse += dt / MAP.defuseTime;
      hud.showProgress('EMBER IS DEFUSING THE CHARGE', G.botDefuse);
      if (G.botDefuse >= 1) {
        G.charge.visible = false;
        G.botDefuse = 0;
        hud.hideProgress();
        rounds.endRound('ember', 'Ember defused the charge.');
      }
    } else {
      G.botDefuse = Math.max(0, G.botDefuse - dt / MAP.defuseTime);
      if (!R.planting) hud.hideProgress();
    }
  }

  // Hint text for the site ring you are standing in.
  if (!R.plantedSite && site && G.playerAlive) {
    hud.setSiteHint(`Hold E — plant the charge at Site ${site}`);
  } else if (R.plantedSite && G.playerAlive) {
    hud.setSiteHint(`Charge live at Site ${R.plantedSite} — ${Math.ceil(R.fuseTime)}s to detonation`);
  } else {
    hud.setSiteHint('');
  }
}

function stepGrenades(dt) {
  for (let i = G.grenadeList.length - 1; i >= 0; i -= 1) {
    const g = G.grenadeList[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
    // A cheap bounce: if the next step is inside a collider, reflect.
    let hitWall = false;
    for (const c of map.colliders) {
      if (next.x >= c.min.x && next.x <= c.max.x && next.y >= c.min.y && next.y <= c.max.y && next.z >= c.min.z && next.z <= c.max.z) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      g.vel.multiplyScalar(-0.35);
      g.vel.y = Math.abs(g.vel.y) * 0.4 + 1;
      audio.bounce();
    } else {
      g.mesh.position.copy(next);
    }
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      G.grenadeList.splice(i, 1);
      explodeGrenade(g);
    }
  }
}

function checkElimination() {
  if (shot) return; // staged captures never end the round
  const R = rounds.state;
  if (R.phase !== 'live') return;
  if (bots.living('ember').length === 0) {
    rounds.endRound('vanguard', R.plantedSite ? 'Ember eliminated — the charge still blows.' : 'All Ember defenders eliminated.');
  } else if (bots.living('vanguard').length === 0 && !G.playerAlive) {
    rounds.endRound('ember', 'Vanguard wiped out.');
  }
}

function step(dt) {
  G.elapsed += dt;
  G.stepCount += 1;
  const R = rounds.state;
  if (R.phase === 'buy') {
    rounds.tickBuy(dt);
    hud.setTimer(R.buyTime, false);
    if (R.buyTime <= 0) {
      hud.hideBuy();
      hud.showOverlay('start', 0);
      document.getElementById('overlay-title').innerHTML = 'ROUND ' + R.round;
      document.getElementById('overlay-copy').textContent = 'Attack Site ' + R.attackSite + ' — click to deploy.';
      document.getElementById('play').textContent = 'Deploy';
      R.phase = 'ready';
    }
  } else if (R.phase === 'live') {
    const event = rounds.tick(dt);
    if (event === 'fuse') {
      effects.burstAt(G.charge.position, PALETTE.accent, 12);
      audio.explosion();
    }
    hud.setTimer(R.plantedSite ? R.fuseTime : R.roundTime, !!R.plantedSite);
    // Player movement and look.
    const look = input.takeLook();
    body.yaw -= look.x * 0.0022;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - look.y * 0.0022));
    const crouching = input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
    playerMover.setCrouch(crouching);
    const forward = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const len = Math.hypot(forward, strafe);
      wishX = (-sin * forward + cos * strafe) / len;
      wishZ = (-cos * forward - sin * strafe) / len;
    }
    const walking = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = (body.crouching ? 2.5 : 5.4) * (walking ? 0.55 : 1) * (G.weapon ? G.weapon.def.speed : 1);
    playerMover.step(dt, wishX, wishZ, speed, input.keys.has('Space'));
    if (G.playerAlive) {
      if (input.firing && G.weapon.def.auto) shoot();
      else if (input.consume('MouseDown')) shoot();
      if (input.consume('KeyR')) { if (startReload(G.weapon)) audio.reload(); }
      if (input.consume('KeyG')) throwGrenade();
      const order = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'];
      for (let n = 1; n <= 5; n += 1) {
        if (input.consume('Digit' + n)) {
          const id = order[n - 1];
          if (G.owned.includes(id)) setWeapon(id);
        }
      }
      stepInteract(dt);
    }
    stepWeapon(G.weapon, dt);
    if (G.weapon.reloading <= 0 && G.weapon.mag !== undefined) hud.setAmmo(G.weapon.mag, G.weapon.reserve);
    // Bots see you and each other.
    const actors = playerActors();
    const ctx = {
      phase: 'live',
      plantedSite: R.plantedSite,
      attackSite: R.attackSite,
      roundTimeLeft: R.roundTime,
      lastKnownPush: G.lastKnownPush,
    };
    bots.step(dt, G.elapsed, actors, ctx);
    stepGrenades(dt);
    checkElimination();
    // Track where the push is coming from so defenders rotate late-round.
    if (G.playerAlive && body.position.z < 4) {
      G.lastKnownPush = body.position.x < 0 ? 7 : 9;
    }
  }
  // Crosshair spread follows movement and bloom.
  const spreadPx = G.weapon ? 4 + weaponSpread(G.weapon, playerMover.groundSpeed() > 1, body.crouching) * 700 : 5;
  hud.setSpread(spreadPx);
  hud.step(dt);
  effects.step(dt);
}

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !G.paused && G.started) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// Deterministic captures for screenshots: the same seed always stages the
// same frame, so a screenshot is a render of the game's own code.
function runShot(name) {
  G.started = true;
  hud.hideOverlay();
  hud.hideBuy();
  rounds.state.phase = 'live';
  rounds.state.round = name === 'end' ? 5 : 1;
  rounds.state.scoreV = name === 'end' ? 5 : 0;
  rounds.state.scoreE = name === 'end' ? 3 : 0;
  rounds.state.money = 3250;
  rounds.state.roundTime = name === 'end' ? 12 : 68;
  hud.setScore(rounds.state.scoreV, rounds.state.scoreE);
  hud.setRound(rounds.state.round);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.state.roundTime, false);
  hud.setObjective('Plant the charge at Site A — or eliminate Ember.');
  const R = rounds.state;
  if (name === 'start') {
    body.position.set(-3, 0, 15.5);
    body.yaw = 0.22;
    body.pitch = 0.02;
    settle(10);
    hud.showOverlay('start', 0);
    syncCamera();
  } else if (name === 'play') {
    // Stage a mid-round fight: two Ember defenders in mid, one Vanguard
    // bot pushing with you, then fire at the nearer one.
    body.position.set(-1, 0, 9);
    body.yaw = 0;
    body.pitch = 0;
    const ember = bots.living('ember');
    const van = bots.living('vanguard');
    if (ember[0]) { ember[0].mover.body.position.set(-3.5, 0, 0.5); ember[0].mover.body.yaw = Math.PI; }
    if (ember[1]) { ember[1].mover.body.position.set(3.5, 0, -1.5); ember[1].mover.body.yaw = Math.PI; }
    if (van[0]) { van[0].mover.body.position.set(2.5, 0, 5.5); van[0].mover.body.yaw = 0; }
    settle(24);
    const target = ember[0];
    if (target && target.alive) {
      tmpVec.set(target.mover.body.position.x, target.mover.body.position.y + 1.3, target.mover.body.position.z);
      aimAt(tmpVec);
      shoot(0);
      settle(8);
      aimAt(tmpVec);
      shoot(0);
      settle(1); // keep the tracer and hitmarker alive for the capture
    }
    hud.setAmmo(G.weapon.mag, G.weapon.reserve);
  } else {
    // End of a won round: Ember wiped out, banner up, charge planted at A.
    body.position.set(-8, 0, 0);
    body.yaw = 0.72;
    body.pitch = -0.05;
    const fallen = bots.living('ember');
    for (const bot of fallen) {
      bots.damage(bot, 999, false);
    }
    // One fallen defender in frame, by the site crates, so the win reads.
    if (fallen[0]) {
      fallen[0].mesh.group.position.set(-12.5, 0.25, -7.5);
      fallen[0].mesh.group.rotation.set(-Math.PI / 2, 0.4, 0);
    }
    R.plantedSite = 'A';
    R.fuseTime = 18;
    G.chargePlantedAt = MAP.sites.A;
    G.charge.position.set(MAP.sites.A.x, 0.35, MAP.sites.A.z);
    G.charge.visible = true;
    settle(20);
    hud.setTimer(18, true);
    hud.setObjective('Charge planted at Site A — defend it until it blows.');
    hud.banner('ROUND WON', 'Ember eliminated — the charge at Site A will finish the job.', 60000);
    hud.setScore(5, 3);
  }
  hud.setHealth(G.health);
  hud.setArmor(rounds.state.armor);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start', 0);
  requestAnimationFrame(frame);
}

// A small handle for local play-testing (never used by the game itself):
// read the match state, and drive it without a mouse — teleport the player
// or a bot, and hold/release keys — so a headless run can walk a whole
// round: buy, deploy, plant, fuse, win. The game never calls these.
window.__dustfall = {
  get pos() { return { x: body.position.x, y: body.position.y, z: body.position.z }; },
  get health() { return G.health; },
  get alive() { return G.playerAlive; },
  get phase() { return rounds.state.phase; },
  get round() { return rounds.state.round; },
  get score() { return [rounds.state.scoreV, rounds.state.scoreE]; },
  get money() { return rounds.state.money; },
  get ammo() { return G.weapon ? [G.weapon.mag, G.weapon.reserve] : [0, 0]; },
  get botsAlive() { return { vanguard: bots.living('vanguard').length, ember: bots.living('ember').length }; },
  get planted() { return rounds.state.plantedSite; },
  get fuse() { return rounds.state.fuseTime; },
  get roundTime() { return rounds.state.roundTime; },
  get buyTime() { return rounds.state.buyTime; },
  get keys() { return [...input.keys]; },
  get yaw() { return body.yaw; },
  teleport(x, z) {
    body.position.set(x, 0, z);
    body.velocity.set(0, 0, 0);
    syncCamera();
  },
  teleportBot(id, x, z) {
    const bot = bots.bots.find((b) => b.id === id);
    if (!bot || !bot.alive) return false;
    bot.mover.body.position.set(x, 0, z);
    bot.mover.body.velocity.set(0, 0, 0);
    return true;
  },
  holdKey(code) { input.keys.add(code); },
  releaseKey(code) { input.keys.delete(code); },
  clickPlay() { document.getElementById('play').click(); },
  get botPos() {
    return bots.bots.map((b) => ({
      id: b.id, alive: b.alive, x: +b.mover.body.position.x.toFixed(1),
      z: +b.mover.body.position.z.toFixed(1), state: b.state,
      target: b.target ? b.target.id : null, path: b.path.length,
    }));
  },
};
