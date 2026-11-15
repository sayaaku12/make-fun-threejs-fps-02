// Effects: tracers, muzzle flashes, impact sparks and explosions, all from
// pre-allocated pools so the hot loop makes no new objects. A tracer is a
// stretched box between two points; a burst is a handful of points that fly
// out and fade. Everything here is cosmetic: it never decides a hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_BURSTS = 16;
const SPARKS_PER_BURST = 10;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  const bursts = [];
  for (let i = 0; i < MAX_BURSTS; i += 1) {
    const positions = new Float32Array(SPARKS_PER_BURST * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: new THREE.Color(PALETTE.accent), size: 0.14, transparent: true, opacity: 0,
    }));
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    bursts.push({ points, positions, velocities: new Float32Array(SPARKS_PER_BURST * 3), life: 0 });
  }
  let burstCursor = 0;

  const flash = new THREE.PointLight(new THREE.Color(0xffc46b), 0, 9, 2);
  scene.add(flash);
  let flashLife = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function tracer(from, to, color = PALETTE.accent) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    tmpA.copy(from);
    tmpB.copy(to);
    const length = tmpA.distanceTo(tmpB);
    slot.mesh.position.copy(tmpA).lerp(tmpB, 0.5);
    slot.mesh.lookAt(tmpB);
    slot.mesh.scale.set(1, 1, Math.max(0.1, length));
    slot.mesh.material.color.set(color);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
    slot.life = 0.09;
  }

  function burstAt(point, color = PALETTE.accent, speed = 4) {
    const slot = bursts[burstCursor];
    burstCursor = (burstCursor + 1) % MAX_BURSTS;
    for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
      slot.positions[i * 3] = point.x;
      slot.positions[i * 3 + 1] = point.y;
      slot.positions[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const v = speed * (0.4 + Math.random() * 0.8);
      slot.velocities[i * 3] = Math.cos(a) * Math.cos(b) * v;
      slot.velocities[i * 3 + 1] = Math.sin(b) * v + speed * 0.3;
      slot.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(b) * v;
    }
    slot.points.geometry.attributes.position.needsUpdate = true;
    slot.points.material.color.set(color);
    slot.points.material.opacity = 1;
    slot.points.visible = true;
    slot.life = 0.45;
  }

  function muzzleFlash(point) {
    flash.position.copy(point);
    flash.intensity = 26;
    flashLife = 0.05;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
    }
    for (const b of bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.points.visible = false; continue; }
      for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
        b.velocities[i * 3 + 1] -= 12 * dt;
        b.positions[i * 3] += b.velocities[i * 3] * dt;
        b.positions[i * 3 + 1] += b.velocities[i * 3 + 1] * dt;
        b.positions[i * 3 + 2] += b.velocities[i * 3 + 2] * dt;
        if (b.positions[i * 3 + 1] < 0.03) b.positions[i * 3 + 1] = 0.03;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      b.points.material.opacity = Math.max(0, b.life / 0.45);
    }
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flash.intensity = 0;
    }
  }

  return { tracer, burstAt, muzzleFlash, step };
}
