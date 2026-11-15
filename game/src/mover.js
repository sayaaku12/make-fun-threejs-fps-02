// Shared movement: one AABB body (a cylinder approximated by a box) moved
// against the world's box colliders one axis at a time, with acceleration,
// friction, gravity and jump. The player and every bot use the same mover,
// so their feet obey the same map.
import * as THREE from 'three';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.6;
export const CROUCH_EYE = 1.02;
export const WALK_SPEED = 5.4;
export const CROUCH_SPEED = 2.5;
export const GROUND_ACCEL = 46;
export const AIR_ACCEL = 10;
export const FRICTION = 9.5;
export const GRAVITY = 21;
export const JUMP_SPEED = 6.4;

export function createMover(colliders, x, z) {
  const body = {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
  };
  const probe = new THREE.Box3();

  // lift keeps the feet and the crown out of the horizontal tests, so
  // standing on the floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function setCrouch(want) {
    if (want && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!want && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    return eyeTarget;
  }

  // wishX/wishZ are a unit wish direction in world space; speed is the top
  // speed; jump is true on the frame the body wants to leave the ground.
  function step(dt, wishX, wishZ, speed, jump) {
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wishX * speed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
    if (body.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (jump && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  function groundSpeed() {
    return Math.hypot(body.velocity.x, body.velocity.z);
  }

  return { body, step, setCrouch, groundSpeed, overlaps };
}
