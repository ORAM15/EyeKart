#!/usr/bin/env node
/**
 * EyeKart — GLB Validator
 * Parses every assets/models/*.glb, checks the same things three-studio.js
 * checks at runtime (mesh count > 0, non-empty bounding box) plus:
 * bounding-box width vs the catalog frameTotalWidth at scene scale (±4%),
 * and minimum mesh/primitive sanity. Exits non-zero on any failure.
 *
 * Usage: node tools/validate-glb.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MM = 1 / 52.3;

const catalogSrc = await readFile(path.join(repoRoot, 'assets/js/catalog-data.js'), 'utf8');
const sandbox = {};
new Function('global', catalogSrc)(sandbox);
const byFile = {};
for (const f of sandbox.EyeKartCatalog) byFile[f.asset3D.modelUrl.split('/').pop()] = f;

const dir = path.join(repoRoot, 'assets/models');
const files = (await readdir(dir)).filter(f => f.endsWith('.glb')).sort();
let failures = 0;
console.log(`Validating ${files.length} GLB files in assets/models/`);
for (const file of files) {
  const buf = await readFile(path.join(dir, file));
  const problems = [];
  if (buf.readUInt32LE(0) !== 0x46546c67) problems.push('bad glTF magic');
  if (buf.readUInt32LE(8) !== buf.length) problems.push('header length mismatch');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/g, '').trimEnd());
  let meshCount = 0, primCount = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes || []) {
    meshCount++; primCount += mesh.primitives.length;
    for (const prim of mesh.primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      if (acc.min && acc.max) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], acc.min[k]); max[k] = Math.max(max[k], acc.max[k]); }
    }
  }
  if (meshCount === 0) problems.push('zero meshes (three-studio would reject)');
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size.some(v => !isFinite(v) || v <= 0)) problems.push('empty bounding box (three-studio would reject)');
  const frame = byFile[file];
  let widthNote = '';
  if (frame) {
    const totalWmm = frame.frameTotalWidth || (2 * frame.lensWidth + frame.bridge + 12);
    const expected = totalWmm * MM;
    const err = Math.abs(size[0] - expected) / expected;
    widthNote = ` width=${size[0].toFixed(2)}u vs catalog ${expected.toFixed(2)}u (${(err * 100).toFixed(1)}% err)`;
    if (err > 0.04) problems.push(`bbox width off by ${(err * 100).toFixed(1)}%`);
  }
  const dims = `${size[0].toFixed(2)} x ${size[1].toFixed(2)} x ${size[2].toFixed(2)} units`;
  if (problems.length) { failures++; console.log(`  FAIL ${file}: ${problems.join('; ')}`); }
  else console.log(`  OK   ${file}  ${(buf.length / 1024).toFixed(1)} KB  meshes=${meshCount} prims=${primCount}  bbox ${dims}${widthNote}`);
}
const missing = Object.keys(byFile).filter(f => !files.includes(f));
if (missing.length) { failures++; console.log(`  FAIL missing files for catalog SKUs: ${missing.join(', ')}`); }
console.log(failures ? `\n${failures} failure(s)` : '\nAll GLB assets valid.');
process.exit(failures ? 1 : 0);
