// DUSTFALL palette: a dusk desert yard — warm sand and rust against a violet
// dusk sky, with one cool teal for the player's own team. Every colour the
// game draws comes from here, so the scene reads as one place.
export const PALETTE = {
  sky: '#2b2438', // dusk violet, scene background and fog
  canvas: '#241f30',
  sand: '#c8a06a', // sun-baked ground
  sandDark: '#a9834f',
  rust: '#b4552d', // Ember team, rusted metal
  rustDark: '#7e3a20',
  teal: '#2e8b8b', // Vanguard team, player accent
  tealDark: '#1f5f5f',
  concrete: '#8d8578',
  concreteDark: '#6b6455',
  crate: '#9a7b4f',
  crateDark: '#6e5736',
  ink: '#efe8dc', // HUD text, tracer white
  muted: '#a89a86',
  accent: '#f0a830', // money, warnings, hitmarker
  danger: '#e5484d', // damage, enemy health
  health: '#7dc383',
  wallTop: '#4a3f52',
};

export const TEAM = {
  vanguard: { name: 'Vanguard', color: PALETTE.teal, dark: PALETTE.tealDark },
  ember: { name: 'Ember', color: PALETTE.rust, dark: PALETTE.rustDark },
};
