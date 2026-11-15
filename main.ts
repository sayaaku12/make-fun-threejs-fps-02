// DUSTFALL — a three.js tactical FPS entry for threejs-fps-02 (Node 22,
// standard library only). The game is this directory's game/ folder: plain
// static files the browser loads as ES modules, three.js 0.187.0 from an
// import map, no build step, no network request. This program hands it in:
// it copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// three.js 0.187.0, byte for byte as the kit ships it (npm's
// build/three.module.js and build/three.core.js, renamed). The gate refuses
// any other version, so fail fast here with the file's name instead of a
// silent gate row later.
const VENDOR_HASHES = {
  'vendor/three/three.core.min.js': '613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578',
  'vendor/three/three.module.min.js': 'ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b',
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += 1;
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
  }
  return n;
}

function dirBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all: game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
const gameFiles = countFiles(join(here, 'game'));
const gameBytes = dirBytes(join(here, 'game'));
const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
}
for (const name of shots) {
  const size = statSync(join(here, 'screenshots', name)).size;
  if (size > 262144) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
}
if (gameFiles > 993) throw new Error(`game/ has ${gameFiles} files, over the 993 cap`);
if (gameBytes > 50331648) throw new Error(`game/ is ${gameBytes} bytes, over the 48 MiB cap`);
for (const [rel, expected] of Object.entries(VENDOR_HASHES)) {
  const actual = createHash('sha256').update(readFileSync(join(here, 'game', rel))).digest('hex');
  if (actual !== expected) throw new Error(`game/${rel} is not three.js 0.187.0 (sha256 ${actual})`);
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// Read the dossier back and check it is the shape the gate expects before
// calling the run done: a corrupt or over-cap dossier is refused outright.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
if (typeof dossier.cover !== 'number' || !Array.isArray(dossier.images) || typeof dossier.text !== 'string') {
  throw new Error('dossier.json is missing cover/images/text');
}
if (dossier.images.length !== shots.length) {
  throw new Error(`dossier holds ${dossier.images.length} images, screenshots/ has ${shots.length}`);
}
const textBytes = Buffer.byteLength(dossier.text, 'utf8');
if (textBytes > 163840) throw new Error(`dossier text is ${textBytes} bytes, over the 160 KiB cap`);

console.log(`DUSTFALL entry written to ${out}: game/ ${gameFiles} files, ${gameBytes} bytes; screenshots/ ${shots.length} files.`);
console.log(`dossier.json verified: ${dossier.images.length} images, text ${textBytes} bytes, ${Buffer.byteLength(JSON.stringify(dossier), 'utf8')} bytes total.`);
