#!/usr/bin/env node
/**
 * EyeKart — GLB Loader Validation (runtime-equivalent)
 * Loads every assets/models/*.glb with the repo's OWN vendored Three.js
 * (r128) + vendored GLTFLoader.js — the exact code three-studio.js runs in
 * the browser — and applies the same acceptance checks as the studio:
 * meshes > 0 and a non-empty bounding box. Exits non-zero on any failure.
 *
 * Usage: node tools/validate-glb-loader.cjs
 */
'use strict';
global.self = global;
global.window = global;
const THREE = require('../assets/vendor/three.min.js');
global.THREE = THREE;
window.THREE = THREE;
require('../assets/vendor/GLTFLoader.js');

const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'assets', 'models');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort();

let failures = 0, pending = files.length;
console.log(`Loader-validating ${files.length} GLB files with vendored Three.js r${THREE.REVISION} + GLTFLoader`);
for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  new THREE.GLTFLoader().parse(ab, '',
    (gltf) => {
      let meshes = 0;
      gltf.scene.traverse(c => { if (c.isMesh) meshes++; });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const s = box.getSize(new THREE.Vector3());
      const ok = meshes > 0 && !box.isEmpty() && s.length() > 0;
      if (!ok) failures++;
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${file}  meshes=${meshes} bbox=${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)}`);
      if (--pending === 0) { console.log(failures ? `\n${failures} failure(s)` : '\nAll GLB assets load with the production loader.'); process.exit(failures ? 1 : 0); }
    },
    (err) => {
      failures++;
      console.log(`  FAIL ${file}  parse error: ${(err && err.message) || err}`);
      if (--pending === 0) { console.log(`\n${failures} failure(s)`); process.exit(1); }
    });
}
