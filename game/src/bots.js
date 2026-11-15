// Bots: the other seven soldiers. Each one is a state machine — HOLD a site,
// PUSH along the waypoint graph toward a site, ENGAGE a visible enemy,
// ROTATE toward a planted charge — with a reaction time, burst fire and
// spread, so they feel like opponents who see and hear, not aimbots.
// Bot-vs-bot and bot-vs-player shots resolve by line of sight plus a hit
// chance (distance, target speed, crouch); the player's own shots use the
// raycaster against the hit meshes this file builds.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { MAP } from './map.js';
import { createMover, STAND_EYE } from './mover.js';
import { WEAPONS } from './weapons.js';

const NAMES = {
  vanguard: ['Rook', 'Sable', 'Ivy'],
  ember: ['Ash', 'Cinder', 'Flint', 'Onyx'],
};
const BOT_SPEED = 4.1;
const REACT_MIN = 0.35;
const REACT_MAX = 0.85;
const BURST_MIN = 3;
const BURST_MAX = 6;
// Where each Ember defender posts up at round start: the two sites, mid
// north and the east lane — so they hold ground instead of camping spawn.
const EMBER_POSTS = [3, 5, 4, 9];

export function createBots(scene, map, rng, hooks) {
  const { colliders, shootables, waypoints } = map;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const bots = [];
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < waypoints.length; i += 1) {
      const dx = waypoints[i].x - x;
      const dz = waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(waypoints.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of waypoints[cur].to) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) { node = prev[node]; path.unshift(node); }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  function buildMesh(team, name) {
    const group = new THREE.Group();
    const teamColor = TEAM[team].color;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM[team].dark), roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a586), roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), bodyMat);
    torso.position.y = 1.06;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
    head.position.y = 1.62;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), darkMat);
    helmet.position.y = 1.8;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), darkMat);
    legL.position.set(-0.16, 0.31, 0);
    const legR = legL.clone();
    legR.position.x = 0.16;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), darkMat);
    gun.position.set(0.28, 1.28, -0.3);
    group.add(torso, head, helmet, legL, legR, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    // A small team-coloured marker above the head, readable at a glance.
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.06, 0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor) }),
    );
    marker.position.y = 2.02;
    group.add(marker);
    scene.add(group);
    return { group, torso, head, gun };
  }

  function spawn(team, index, weaponId) {
    const spawn = team === 'vanguard' ? MAP.vanguardSpawn[index + 1] : MAP.emberSpawn[index];
    const mover = createMover(colliders, spawn.x, spawn.z);
    const mesh = buildMesh(team, NAMES[team][index]);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      mover,
      mesh,
      weaponId,
      def: WEAPONS[weaponId],
      health: 100,
      armor: 0,
      alive: true,
      state: team === 'ember' ? 'hold' : 'push',
      holdNode: team === 'ember' ? EMBER_POSTS[index % EMBER_POSTS.length] : null,
      path: [],
      pathIndex: 0,
      repathAt: 0,
      target: null, // the actor this bot is fighting
      reactAt: 0,
      burstLeft: 0,
      shotAt: 0,
      lastSeen: null,
      stuckAt: 0,
      lastX: spawn.x,
      lastZ: spawn.z,
      aimError: 0,
      deathAt: 0,
    };
    bot.mover.body.yaw = team === 'vanguard' ? Math.PI : 0;
    mesh.group.position.copy(bot.mover.body.position);
    for (const part of [mesh.torso, mesh.head]) {
      part.userData.bot = bot;
      part.userData.part = part === mesh.head ? 'head' : 'body';
      hitMeshes.push(part);
    }
    bots.push(bot);
    return bot;
  }

  function eyeOf(bot) {
    tmpEye.set(bot.mover.body.position.x, bot.mover.body.position.y + bot.mover.body.eye, bot.mover.body.position.z);
    return tmpEye;
  }

  // Line of sight from a bot's eye to a point: true when no wall is in the way.
  function hasSight(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist > 70) return false;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  // Pick the nearest visible enemy actor (the player counts as one).
  // Only enemies inside fight range count: further away the bot keeps
  // walking its plan instead of strafing in place at a distant speck.
  function acquire(bot, actors) {
    const eye = eyeOf(bot);
    let best = null;
    let bestD = Infinity;
    for (const actor of actors) {
      if (!actor.alive || actor.team === bot.team) continue;
      tmpTo.set(actor.pos.x, actor.pos.y + actor.eye, actor.pos.z);
      const d = eye.distanceTo(tmpTo);
      if (d > 24 || d >= bestD) continue;
      // Only notice what is roughly in front, unless it is very close.
      // Forward is (-sin yaw, -cos yaw); facing is its dot with the
      // direction to the target.
      const dx = tmpTo.x - eye.x;
      const dz = tmpTo.z - eye.z;
      const facing = (-Math.sin(bot.mover.body.yaw) * dx - Math.cos(bot.mover.body.yaw) * dz) / d;
      if (d > 6 && facing < 0.2) continue;
      if (!hasSight(eye, tmpTo)) continue;
      best = actor;
      bestD = d;
    }
    return best;
  }

  function setPath(bot, node) {
    const from = nearestNode(bot.mover.body.position.x, bot.mover.body.position.z);
    bot.path = findPath(from, node);
    bot.pathIndex = 0;
  }

  // One burst of fire at the current target: line of sight decides whether
  // the shot can land; distance, movement and crouch decide whether it does.
  function fireBurst(bot, now) {
    const target = bot.target;
    if (!target || !target.alive) return;
    const eye = eyeOf(bot);
    tmpTo.set(target.pos.x, target.pos.y + target.eye * 0.82, target.pos.z);
    const dist = eye.distanceTo(tmpTo);
    if (!hasSight(eye, tmpTo)) { bot.target = null; return; }
    const dir = tmpDir.copy(tmpTo).sub(eye).normalize();
    const spread = 0.02 + dist * 0.0009 + (target.moving ? 0.02 : 0) + (target.crouching ? -0.012 : 0);
    dir.x += (rng() * 2 - 1) * spread;
    dir.y += (rng() * 2 - 1) * spread;
    dir.z += (rng() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(eye, dir);
    raycaster.far = 90;
    const wall = raycaster.intersectObjects(shootables, false)[0];
    const end = wall ? wall.point : tmpTo.clone().addScaledVector(dir, 40);
    hooks.effects.tracer(eye, end, bot.team === 'ember' ? PALETTE.rust : PALETTE.teal);
    hooks.effects.muzzleFlash(eye.clone().addScaledVector(dir, 0.8));
    hooks.audio.distantShot();
    // The shot lands when the aim cone still covers the target: closer and
    // slower targets are hit more often; every hit still has to beat the wall.
    const hitChance = Math.max(0.08, Math.min(0.5, 0.45 - dist * 0.006 - (target.moving ? 0.14 : 0) + (target.crouching ? 0.05 : 0)));
    const hit = rng() < hitChance && (!wall || wall.distance > dist);
    if (hit) {
      const head = rng() < 0.12;
      const falloff = Math.max(0.55, 1 - dist / 140);
      const damage = Math.round(bot.def.damage * (head ? bot.def.headMult * 0.5 : 1) * falloff);
      hooks.onBotHit(target, damage, head, bot);
      if (wall) hooks.effects.burstAt(wall.point, PALETTE.ink, 2);
    } else if (wall) {
      hooks.effects.burstAt(wall.point, PALETTE.sandDark, 2.5);
    }
    bot.shotAt = now;
  }

  function damage(bot, amount, isHead) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, Math.round(amount * 0.5));
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health -= rest;
    hooks.effects.burstAt(
      new THREE.Vector3(bot.mover.body.position.x, bot.mover.body.position.y + 1.3, bot.mover.body.position.z),
      PALETTE.danger, 3,
    );
    if (bot.health <= 0) {
      bot.alive = false;
      bot.deathAt = hooks.now();
      bot.mesh.group.rotation.x = -Math.PI / 2;
      bot.mesh.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function stepBot(bot, dt, now, actors, ctx) {
    if (!bot.alive) return;
    const body = bot.mover.body;
    // A dead bot's mesh stays down for a few seconds, then leaves the scene.
    if (ctx.phase !== 'live') {
      // Between rounds bots stand at their spawn; nothing to do here.
      return;
    }
    const seen = acquire(bot, actors);
    // The actor list is rebuilt every step, so compare targets by id, not
    // by object identity, and refresh the reference to this step's actor.
    if (bot.target) {
      const current = actors.find((a) => a.id === bot.target.id);
      if (!current || !current.alive) bot.target = null;
      else bot.target = current;
    }
    if (seen) {
      if (!bot.target || bot.target.id !== seen.id) {
        bot.target = seen;
        bot.reactAt = now + REACT_MIN + rng() * (REACT_MAX - REACT_MIN);
        bot.burstLeft = 0;
        bot.lastSeen = { x: seen.pos.x, z: seen.pos.z };
      }
      bot.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    } else if (bot.target && now - bot.shotAt > 1.6) {
      bot.target = null;
    }

    let wishX = 0;
    let wishZ = 0;
    let speed = BOT_SPEED;

    if (bot.target) {
      // Face the fight and shoot in bursts once the reaction time passes.
      const t = bot.target;
      const dx = t.pos.x - body.position.x;
      const dz = t.pos.z - body.position.z;
      body.yaw = Math.atan2(-dx, -dz);
      body.pitch = Math.max(-0.5, Math.min(0.5, (t.pos.y + t.eye * 0.8 - (body.position.y + body.eye)) / Math.max(1, Math.hypot(dx, dz))));
      if (now >= bot.reactAt) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(rng() * (BURST_MAX - BURST_MIN + 1));
          bot.reactAt = now + 0.5 + rng() * 0.7;
        }
        if (now - bot.shotAt >= bot.def.rate) {
          fireBurst(bot, now);
          bot.burstLeft -= 1;
        }
      }
      // Strafe a little while fighting so the bot is not a statue — but if
      // the enemy is far away, close the distance instead of standing in
      // the open trading shots across the yard.
      const tdx = t.pos.x - body.position.x;
      const tdz = t.pos.z - body.position.z;
      const tdist = Math.hypot(tdx, tdz);
      if (tdist > 14) {
        wishX = tdx / tdist;
        wishZ = tdz / tdist;
        speed = BOT_SPEED * 0.6;
      } else {
        const strafe = Math.sin(now * 0.9 + bot.id.charCodeAt(0)) > 0 ? 1 : -1;
        const sin = Math.sin(body.yaw);
        const cos = Math.cos(body.yaw);
        wishX = cos * strafe * 0.35;
        wishZ = -sin * strafe * 0.35;
        speed = BOT_SPEED * 0.45;
      }
    } else {
      // No enemy in sight: walk the plan. Defenders hold their post unless
      // the charge is planted; attackers push the called site.
      let dest = null;
      if (bot.team === 'ember') {
        if (ctx.plantedSite) dest = ctx.plantedSite === 'A' ? 3 : 4;
        else if (ctx.roundTimeLeft < 25 && ctx.lastKnownPush) dest = ctx.lastKnownPush;
        else dest = bot.holdNode;
      } else {
        dest = ctx.attackSite === 'A' ? 3 : 4;
      }
      if (bot.path.length === 0 || now >= bot.repathAt) {
        setPath(bot, dest);
        bot.repathAt = now + 4 + rng() * 2;
      }
      const node = waypoints[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
      if (node) {
        const dx = node.x - body.position.x;
        const dz = node.z - body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) {
          bot.pathIndex += 1;
          if (bot.pathIndex >= bot.path.length) {
            bot.path = [];
            if (bot.team === 'ember') bot.holdNode = nearestNode(body.position.x, body.position.z);
          }
        } else {
          wishX = dx / dist;
          wishZ = dz / dist;
          body.yaw = Math.atan2(-wishX, -wishZ);
        }
      }
      // Stuck against a wall: pick a new nearby node.
      if (Math.hypot(body.position.x - bot.lastX, body.position.z - bot.lastZ) < 0.05) {
        bot.stuckAt += dt;
        if (bot.stuckAt > 1.2) {
          bot.stuckAt = 0;
          bot.path = [];
          bot.repathAt = 0;
        }
      } else bot.stuckAt = 0;
      bot.lastX = body.position.x;
      bot.lastZ = body.position.z;
    }

    bot.mover.setCrouch(false);
    bot.mover.step(dt, wishX, wishZ, speed, false);
    bot.mesh.group.position.copy(body.position);
    bot.mesh.group.rotation.y = body.yaw;
    // A walking bob so the bots read as moving, not sliding.
    const moving = bot.mover.groundSpeed() > 0.5;
    bot.mesh.group.position.y = body.position.y + (moving ? Math.abs(Math.sin(now * 9)) * 0.03 : 0);
  }

  function step(dt, now, actors, ctx) {
    for (const bot of bots) stepBot(bot, dt, now, actors, ctx);
  }

  function living(team) {
    return bots.filter((b) => b.alive && b.team === team);
  }

  function resetRound() {
    for (const bot of bots) {
      bot.alive = true;
      bot.health = 100;
      bot.target = null;
      bot.path = [];
      bot.pathIndex = 0;
      bot.burstLeft = 0;
      bot.repathAt = 0;
      const teamBots = bots.filter((b) => b.team === bot.team);
      const idx = teamBots.indexOf(bot);
      const sp = bot.team === 'vanguard' ? MAP.vanguardSpawn[idx + 1] : MAP.emberSpawn[idx];
      bot.mover.body.position.set(sp.x, 0, sp.z);
      bot.mover.body.velocity.set(0, 0, 0);
      bot.mover.body.yaw = bot.team === 'vanguard' ? Math.PI : 0;
      bot.mover.body.pitch = 0;
      bot.mesh.group.rotation.set(0, bot.mover.body.yaw, 0);
      bot.mesh.group.position.copy(bot.mover.body.position);
      bot.holdNode = bot.team === 'ember' ? EMBER_POSTS[idx % EMBER_POSTS.length] : null;
    }
  }

  function dispose() {
    for (const bot of bots) scene.remove(bot.mesh.group);
    bots.length = 0;
    hitMeshes.length = 0;
  }

  return { spawn, step, damage, living, resetRound, dispose, bots, hitMeshes, hasSight };
}
