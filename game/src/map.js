// EMBER YARD: an original dusk-desert yard built for three lanes of play.
// Vanguard spawns south, Ember spawns north. Site A sits in the west yard
// behind stacked crates; Site B in the east yard by the rusted silo; a
// covered mid lane joins them, with a watchtower over the middle. Every
// box is a collider and a surface bullets stop on; the waypoint graph at
// the bottom is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  halfX: 22,
  halfZ: 18,
  roundTime: 100, // seconds a round lasts before the defenders win on time
  buyTime: 14, // seconds of buy phase between rounds
  plantTime: 3.5, // seconds holding E to plant the charge
  defuseTime: 5, // seconds holding E to defuse it
  fuseTime: 35, // seconds from plant to detonation
  vanguardSpawn: [
    { x: -6, z: 14 }, { x: -2, z: 15 }, { x: 2, z: 15 }, { x: 6, z: 14 },
  ],
  emberSpawn: [
    { x: -8, z: -14 }, { x: -3, z: -15 }, { x: 3, z: -15 }, { x: 8, z: -14 },
  ],
  sites: {
    A: { x: -16, z: -11, r: 4.2 },
    B: { x: 16, z: -11, r: 4.2 },
  },
};

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.94,
      metalness: name === 'rust' || name === 'rustDark' ? 0.25 : 0.02,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, mat, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = Math.max(rTop, rBottom);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - half, y - h / 2, z - half),
      new THREE.Vector3(x + half, y + h / 2, z + half),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: sand with a darker worn strip down the middle lane.
  box(44.8, 0.4, 36.8, 0, -0.2, 0, 'sand');
  box(6, 0.06, 36.8, 0, 0.03, 0, 'sandDark', false);
  box(44.8, 0.06, 5, 0, 0.03, -11, 'sandDark', false);

  // Perimeter: high walls with a darker cap, open to the dusk sky.
  box(0.6, 5.2, 36.8, -22.3, 2.6, 0, 'concrete');
  box(0.6, 5.2, 36.8, 22.3, 2.6, 0, 'concrete');
  box(44.8, 5.2, 0.6, 0, 2.6, -18.3, 'concrete');
  box(44.8, 5.2, 0.6, 0, 2.6, 18.3, 'concrete');
  box(0.8, 0.5, 36.8, -22.3, 5.4, 0, 'wallTop', false);
  box(0.8, 0.5, 36.8, 22.3, 5.4, 0, 'wallTop', false);
  box(44.8, 0.5, 0.8, 0, 5.4, -18.3, 'wallTop', false);
  box(44.8, 0.5, 0.8, 0, 5.4, 18.3, 'wallTop', false);

  // Site A (west yard): a crate fort around the plant zone.
  box(4.4, 1.2, 1.4, -16, 0.6, -7.4, 'crate');
  box(1.4, 1.2, 4.4, -19.2, 0.6, -11, 'crate');
  box(1.4, 2.4, 1.4, -13.4, 1.2, -13.4, 'crateDark');
  box(1.2, 1.2, 1.2, -15.2, 0.6, -13.2, 'crate');
  box(1.2, 2.4, 1.2, -16.4, 1.2, -12.4, 'crateDark');
  box(2.6, 0.9, 1.2, -18.4, 0.45, -7.6, 'crate');

  // Site B (east yard): the rusted silo and a low wall.
  cylinder(2.1, 2.4, 6.4, 17.5, 3.2, -13.5, 'rust', 16);
  cylinder(2.5, 2.5, 0.5, 17.5, 6.6, -13.5, 'rustDark', 16);
  box(5.2, 1.1, 1.2, 14.6, 0.55, -6.2, 'concrete');
  box(1.2, 1.1, 3.4, 12.6, 0.55, -10.6, 'concrete');
  box(1.2, 2.2, 1.2, 19.4, 1.1, -8.2, 'crate');
  box(1.2, 1.2, 1.2, 13.8, 0.6, -13.6, 'crateDark');

  // Mid: a covered lane with a watchtower over it and barrels for cover.
  box(2.2, 2.6, 2.2, 0, 1.3, -2, 'concreteDark');
  box(5.4, 0.5, 5.4, 0, 2.85, -2, 'concrete');
  box(0.5, 2.6, 0.5, -2.4, 1.3, -2, 'concreteDark');
  box(0.5, 2.6, 0.5, 2.4, 1.3, -2, 'concreteDark');
  cylinder(0.7, 0.7, 1.1, -4.6, 0.55, 2.5, 'rust');
  cylinder(0.7, 0.7, 1.1, 4.6, 0.55, 2.5, 'rust');
  cylinder(0.7, 0.7, 1.1, -7.5, 0.55, -9, 'rust');
  cylinder(0.7, 0.7, 1.1, 7.5, 0.55, -9, 'rust');
  box(2.6, 1.1, 1.2, -9.5, 0.55, 4.5, 'crate');
  box(1.2, 1.1, 2.6, 9.5, 0.55, -4.5, 'crate');
  box(1.6, 0.8, 1.6, -11.5, 0.4, -2, 'crateDark');
  box(1.6, 0.8, 1.6, 11.5, 0.4, 2, 'crateDark');

  // South spawn cover: low walls so the opening seconds are not a firing line.
  // (Kept clear of the centre lane, so spawn always has a way out.)
  box(3.4, 1.2, 1.0, -10.5, 0.6, 10.5, 'concrete');
  box(3.4, 1.2, 1.0, 10.5, 0.6, 10.5, 'concrete');

  // North spawn cover.
  box(3.4, 1.2, 1.0, -8, 0.6, -10.5, 'concrete');
  box(3.4, 1.2, 1.0, 8, 0.6, -10.5, 'concrete');

  // Site markers: a glowing floor plate and a pole with a pennant, so each
  // site reads at a glance from across the yard. The plate is not a collider.
  function siteMarker(site, mat) {
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(site.r, site.r, 0.08, 28),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[mat]), emissive: new THREE.Color(PALETTE[mat]),
        emissiveIntensity: 0.35, roughness: 0.7, transparent: true, opacity: 0.5,
      }),
    );
    plate.position.set(site.x, 0.06, site.z);
    plate.receiveShadow = true;
    group.add(plate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8), mats.concreteDark);
    pole.position.set(site.x, 2.2, site.z);
    pole.castShadow = true;
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.05), mats[mat]);
    flag.position.set(site.x + 0.8, 4.0, site.z);
    flag.castShadow = true;
    group.add(flag);
  }
  siteMarker(MAP.sites.A, 'teal');
  siteMarker(MAP.sites.B, 'rust');

  // Dusk light: a low warm sun from the west, a cool violet fill, and a
  // sky/ground gradient, with lamps glowing over each site.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.wallTop), new THREE.Color(PALETTE.sandDark), 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 2.4);
  sun.position.set(-26, 12, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x8a7bd8), 0.5);
  fill.position.set(18, 14, 16);
  scene.add(fill);
  for (const site of Object.values(MAP.sites)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.8);
    lamp.position.set(site.x, 4.6, site.z);
    scene.add(lamp);
  }

  // Waypoints: the graph bots walk. Each node lists its neighbours by index;
  // every edge is a straight, walkable line — checked against the crates,
  // walls and barrels above — so a bot never has to push through cover.
  // (The tower blocks the middle of mid, so the centre lane goes around it
  // through the west/east mid nodes; the sites hang off their own lanes.)
  const WAYPOINTS = [
    { x: -6, z: 14, to: [1, 10] }, // 0 vanguard west
    { x: 0, z: 14.5, to: [0, 2, 8] }, // 1 vanguard centre
    { x: 6, z: 14, to: [1, 11] }, // 2 vanguard east
    { x: -16.5, z: -9.5, to: [7] }, // 3 site A
    { x: 14.5, z: -10, to: [9] }, // 4 site B
    { x: 0, z: -8, to: [7, 9, 13] }, // 5 mid north
    { x: 0, z: 2, to: [8, 10, 11] }, // 6 mid tower
    { x: -10, z: -6, to: [3, 5, 10] }, // 7 west lane
    { x: 0, z: 8, to: [1, 6] }, // 8 mid south
    { x: 10, z: -6, to: [4, 5, 11] }, // 9 east lane
    { x: -7, z: 6, to: [0, 6, 7] }, // 10 west mid
    { x: 7, z: 6, to: [2, 6, 9] }, // 11 east mid
    { x: -8, z: -14, to: [13] }, // 12 ember west
    { x: 0, z: -14.5, to: [5, 12, 14] }, // 13 ember centre
    { x: 8, z: -14, to: [13] }, // 14 ember east
  ];
  // Neighbour lists above are one-way by construction; make them symmetric.
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    for (const j of WAYPOINTS[i].to) {
      if (!WAYPOINTS[j].to.includes(i)) WAYPOINTS[j].to.push(i);
    }
  }

  return { colliders, shootables, group, waypoints: WAYPOINTS };
}
