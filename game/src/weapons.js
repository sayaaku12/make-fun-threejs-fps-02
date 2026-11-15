// Weapons: five guns and one grenade, each with its own damage, fire rate,
// spread, recoil and price. A gun is a plain data table plus a small state
// machine (mag, reserve, cooldown, reload timer); the firing code lives in
// main.js, which owns the raycast, so this file never touches the scene.
export const WEAPONS = {
  pistol: {
    name: 'P-9 Sidearm', price: 0, damage: 34, headMult: 3.2, rate: 0.16,
    magSize: 12, reserveMax: 48, spread: 0.011, moveSpread: 0.028,
    recoil: 0.011, auto: false, pellets: 1, range: 60, speed: 1.0,
  },
  smg: {
    name: 'VK-9 Raptor', price: 1500, damage: 22, headMult: 3.0, rate: 0.075,
    magSize: 28, reserveMax: 112, spread: 0.016, moveSpread: 0.034,
    recoil: 0.008, auto: true, pellets: 1, range: 55, speed: 1.04,
  },
  rifle: {
    name: 'AR-77 Dune', price: 2700, damage: 36, headMult: 3.4, rate: 0.115,
    magSize: 30, reserveMax: 90, spread: 0.008, moveSpread: 0.03,
    recoil: 0.014, auto: true, pellets: 1, range: 80, speed: 0.96,
  },
  shotgun: {
    name: 'SG-12 Breacher', price: 1200, damage: 13, headMult: 2.2, rate: 0.85,
    magSize: 6, reserveMax: 24, spread: 0.055, moveSpread: 0.07,
    recoil: 0.05, auto: false, pellets: 8, range: 22, speed: 0.92,
  },
  sniper: {
    name: 'LW-50 Longshot', price: 4750, damage: 105, headMult: 3.8, rate: 1.25,
    magSize: 5, reserveMax: 15, spread: 0.001, moveSpread: 0.09,
    recoil: 0.06, auto: false, pellets: 1, range: 120, speed: 0.88,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // half of incoming damage goes to armour first

export function createWeaponState(id) {
  const def = WEAPONS[id];
  return {
    id, def,
    mag: def.magSize,
    reserve: def.reserveMax,
    cooldown: 0,
    reloading: 0,
    reloadTime: id === 'sniper' || id === 'shotgun' ? 2.6 : 1.9,
    bloom: 0, // spread growth while firing, decays when still
  };
}

export function weaponSpread(state, moving, crouching) {
  const d = state.def;
  let spread = d.spread + state.bloom;
  if (moving) spread += d.moveSpread;
  if (crouching) spread *= 0.6;
  return spread;
}

export function stepWeapon(state, dt) {
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.bloom = Math.max(0, state.bloom - dt * 0.02);
  if (state.reloading > 0) {
    state.reloading -= dt;
    if (state.reloading <= 0) {
      const need = state.def.magSize - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
    }
  }
}

export function tryFire(state) {
  if (state.cooldown > 0 || state.reloading > 0) return false;
  if (state.mag <= 0) return false;
  state.mag -= 1;
  state.cooldown = state.def.rate;
  state.bloom = Math.min(0.03, state.bloom + state.def.spread * 0.55);
  return true;
}

export function startReload(state) {
  if (state.reloading > 0 || state.mag >= state.def.magSize || state.reserve <= 0) return false;
  state.reloading = state.reloadTime;
  return true;
}
