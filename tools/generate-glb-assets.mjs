#!/usr/bin/env node
/**
 * EyeKart — Parametric GLB Asset Generator (Asset Pipeline, Phase 1)
 *
 * Generates REAL .glb models for every SKU in assets/js/catalog-data.js,
 * written to exactly the URLs the catalog already references
 * (assets/models/<sku>.glb), so the existing GLTFLoader pipeline in
 * three-studio.js and eyekart-cinematic-3d.js loads them with no URL changes.
 *
 * Honesty / provenance:
 * - All dimensions come from catalog-data.js (lensWidth, lensHeight, bridge,
 *   temple, frameTotalWidth, shape, material, first-variant colorHex).
 * - SKUs missing frameTotalWidth use 2*lensWidth + bridge + 12mm endpieces
 *   and are flagged `frameTotalWidthSource: "derived"` in the GLB extras
 *   and in the printed report. Nothing is silently invented.
 * - These are parametric presentation models built from catalog dimensions,
 *   NOT CAD scans of physical frames. Do not describe them as digital twins.
 *
 * Scene scale (matches existing studio/hero scenes):
 *   1 unit = 52.3 mm  → a 136 mm frame is ~2.6 units wide, centred at origin,
 *   front facing +Z, temples extending -Z, Y up (glTF convention).
 *
 * Usage: node tools/generate-glb-assets.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MM = 1 / 52.3; // scene units per mm

// ---------------------------------------------------------------- catalog ---
const catalogSrc = await readFile(path.join(repoRoot, 'assets/js/catalog-data.js'), 'utf8');
const sandbox = {};
new Function('global', catalogSrc)(sandbox);
const catalog = sandbox.EyeKartCatalog;
if (!Array.isArray(catalog) || !catalog.length) throw new Error('Catalog failed to load');

// ------------------------------------------------------------ vector math ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------------- geometries ---
// Each geometry: { positions:[], normals:[], indices:[] } in world space.
function computeNormals(g) {
  g.normals = new Array(g.positions.length).fill(0);
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = [g.indices[i], g.indices[i + 1], g.indices[i + 2]];
    const pA = g.positions.slice(a * 3, a * 3 + 3), pB = g.positions.slice(b * 3, b * 3 + 3), pC = g.positions.slice(c * 3, c * 3 + 3);
    const n = cross(sub(pB, pA), sub(pC, pA));
    for (const v of [a, b, c]) { g.normals[v * 3] += n[0]; g.normals[v * 3 + 1] += n[1]; g.normals[v * 3 + 2] += n[2]; }
  }
  for (let i = 0; i < g.normals.length; i += 3) {
    const n = norm([g.normals[i], g.normals[i + 1], g.normals[i + 2]]);
    [g.normals[i], g.normals[i + 1], g.normals[i + 2]] = n;
  }
  return g;
}

/** Tube along a 3D path with parallel-transport frames. radii: number or per-point array. */
function tube(points, radii, { radial = 10, closed = false, capEnds = true } = {}) {
  const pts = points.map(p => [...p]);
  const N = pts.length;
  const radiusAt = i => (Array.isArray(radii) ? radii[i] : radii);
  const tangents = [];
  for (let i = 0; i < N; i++) {
    const pPrev = pts[(i - 1 + N) % N], pNext = pts[(i + 1) % N];
    if (closed) tangents.push(norm(sub(pNext, pPrev)));
    else if (i === 0) tangents.push(norm(sub(pts[1], pts[0])));
    else if (i === N - 1) tangents.push(norm(sub(pts[N - 1], pts[N - 2])));
    else tangents.push(norm(sub(pNext, pPrev)));
  }
  let normal = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  normal = norm(sub(normal, mul(tangents[0], dot(normal, tangents[0]))));
  const g = { positions: [], normals: [], indices: [] };
  const ringStart = [];
  for (let i = 0; i < N; i++) {
    const t = tangents[i];
    normal = norm(sub(normal, mul(t, dot(normal, t))));
    const binormal = norm(cross(t, normal));
    ringStart.push(g.positions.length / 3);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dir = add(mul(normal, Math.cos(a)), mul(binormal, Math.sin(a)));
      const v = add(pts[i], mul(dir, radiusAt(i)));
      g.positions.push(...v); g.normals.push(...dir);
    }
  }
  const ringVerts = radial + 1;
  const lastRing = closed ? N : N - 1;
  for (let i = 0; i < lastRing; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < radial; j++) {
      const a = ringStart[i] + j, b = ringStart[i2] + j;
      g.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (!closed && capEnds) {
    for (const [ringIdx, flip] of [[0, -1], [N - 1, 1]]) {
      const centreIdx = g.positions.length / 3;
      g.positions.push(...pts[ringIdx]); g.normals.push(...mul(tangents[ringIdx], flip));
      for (let j = 0; j < radial; j++) {
        const a = ringStart[ringIdx] + j;
        if (flip < 0) g.indices.push(centreIdx, a + 1, a); else g.indices.push(centreIdx, a, a + 1);
      }
    }
  }
  return g;
}

function box(cx, cy, cz, w, h, d, ry = 0) {
  const x = w / 2, y = h / 2, z = d / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  ];
  const g = { positions: [], normals: [], indices: [] };
  const cosr = Math.cos(ry), sinr = Math.sin(ry);
  for (const f of faces) {
    const base = g.positions.length / 3;
    for (const v of f.v) {
      const [vx, vy, vz] = v;
      g.positions.push(cx + vx * cosr - vz * sinr, cy + vy, cz + vx * sinr + vz * cosr);
      const n = f.n; g.normals.push(n[0] * cosr - n[2] * sinr, n[1], n[0] * sinr + n[2] * cosr);
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}

function sphere(cx, cy, cz, r, sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8) {
  const g = { positions: [], normals: [], indices: [] };
  for (let iy = 0; iy <= hSeg; iy++) {
    const phi = (iy / hSeg) * Math.PI;
    for (let ix = 0; ix <= wSeg; ix++) {
      const theta = (ix / wSeg) * Math.PI * 2;
      const p = [Math.sin(phi) * Math.cos(theta) * r * sx, Math.cos(phi) * r * sy, Math.sin(phi) * Math.sin(theta) * r * sz];
      g.positions.push(cx + p[0], cy + p[1], cz + p[2]);
      g.normals.push(...norm([p[0] / (sx * sx), p[1] / (sy * sy), p[2] / (sz * sz)]));
    }
  }
  for (let iy = 0; iy < hSeg; iy++) for (let ix = 0; ix < wSeg; ix++) {
    const a = iy * (wSeg + 1) + ix, b = a + wSeg + 1;
    g.indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return g;
}

/** Flat lens disc filling a closed 2D outline, with a subtle convex centre. */
function lensFromOutline(outline, cx, cy) {
  const g = { positions: [], normals: [], indices: [] };
  const centreIdx = 0;
  g.positions.push(cx, cy, 0.012);
  for (const [x, y] of outline) g.positions.push(cx + x, cy + y, 0);
  for (let i = 0; i < outline.length; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % outline.length);
    g.indices.push(centreIdx, a, b);
  }
  return computeNormals(g);
}

// ------------------------------------------------------------- outlines -----
function catmullClosed(ctrl, samplesPerSeg = 8) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < samplesPerSeg; j++) {
      const t = j / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}
function superellipse(rx, ry, exp, seg = 64) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const px = rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / exp);
    const py = ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / exp);
    out.push([px, py]);
  }
  return out;
}
function ellipseOutline(rx, ry, seg = 64) {
  return Array.from({ length: seg }, (_, i) => { const t = (i / seg) * Math.PI * 2; return [Math.cos(t) * rx, Math.sin(t) * ry]; });
}
function outlineFor(shape, rx, ry) {
  switch (shape) {
    case 'round': return ellipseOutline(rx, ry);
    case 'octagonal': {
      const c = [[1, .45], [.45, 1], [-.45, 1], [-1, .45], [-1, -.45], [-.45, -1], [.45, -1], [1, -.45]].map(([x, y]) => [x * rx, y * ry]);
      return catmullClosed(c, 6);
    }
    case 'aviator': {
      const c = [[0, 1], [.62, .92], [1, .45], [.95, -.25], [.55, -.85], [0, -1], [-.55, -.85], [-.95, -.25], [-1, .45], [-.62, .92]].map(([x, y]) => [x * rx, y * ry]);
      return catmullClosed(c, 7);
    }
    case 'cat-eye': {
      const c = [[0, .92], [.55, .88], [1.02, 1.08], [1, .25], [.7, -.7], [0, -.95], [-.7, -.7], [-1, .25], [-1.02, 1.08], [-.55, .88]].map(([x, y]) => [x * rx, y * ry]);
      return catmullClosed(c, 7);
    }
    case 'square': return superellipse(rx, ry, 4.2);
    case 'rectangle': return superellipse(rx, ry, 3.4);
    case 'browline': return superellipse(rx, ry, 3.6);
    default: return superellipse(rx, ry, 3.2); // rimless / semi-rimless base
  }
}

// ---------------------------------------------------------------- colors ----
function srgbHexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255), 1];
}

// ------------------------------------------------------------ frame build ---
function buildFrame(frame) {
  const derivedWidth = !frame.frameTotalWidth;
  const totalWmm = frame.frameTotalWidth || (2 * frame.lensWidth + frame.bridge + 12);
  const lensRx = (frame.lensWidth / 2) * MM, lensRy = (frame.lensHeight / 2) * MM;
  const eyeCx = ((frame.lensWidth + frame.bridge) / 2) * MM;
  const hingeX = (totalWmm / 2) * MM;
  const shape = frame.shape;
  const meshes = []; // {name, material, geometry}
  const push = (name, material, geometry) => meshes.push({ name, material, geometry });

  const outline = outlineFor(shape, lensRx, lensRy);
  const rimless = shape === 'rimless', semi = shape === 'semi-rimless';

  for (const side of [-1, 1]) {
    const cx = side * eyeCx;
    // Lens
    push(side < 0 ? 'Lens_L' : 'Lens_R', 1, lensFromOutline(outline.map(([x, y]) => [x * 0.97, y * 0.97]), cx, 0));
    // Rim
    if (!rimless) {
      if (semi) {
        const top = outline.filter(([, y]) => y >= -lensRy * 0.05).sort((a, b) => a[0] - b[0]);
        if (top.length > 3) push(side < 0 ? 'RimTop_L' : 'RimTop_R', 0, tube(top.map(([x, y]) => [cx + x, y, 0]), 1.1 * MM * 1.4, { radial: 8 }));
      } else {
        push(side < 0 ? 'Rim_L' : 'Rim_R', 0, tube(outline.map(([x, y]) => [cx + x, y, 0]), 1.5 * MM, { radial: 10, closed: true }));
      }
    }
    // Brow bar for browline / aviator
    if (shape === 'browline' || shape === 'aviator') {
      const barPts = [[-0.95, 0.92], [-0.4, 1.04], [0, 1.08], [0.4, 1.04], [0.95, 0.92]].map(([x, y]) => [cx + x * lensRx, y * lensRy, 0.012]);
      push(side < 0 ? 'BrowBar_L' : 'BrowBar_R', 0, tube(barPts, 2.1 * MM, { radial: 8 }));
    }
    // Hinge + endpiece block
    push(side < 0 ? 'Hinge_L' : 'Hinge_R', 2, box(side * hingeX, lensRy * 0.48, -0.012, 3.2 * MM, 3.4 * MM, 4.2 * MM));
    // Nose pad
    push(side < 0 ? 'NosePad_L' : 'NosePad_R', 3, sphere(side * (frame.bridge / 2 + 2.2) * MM, -lensRy * 0.28, -0.035, 4.4 * MM, 0.42, 0.68, 0.2));
    // Temple arm (tube, front -> back -Z, ear hook at the end)
    const L = frame.temple * MM, hy = lensRy * 0.48, hx = side * hingeX;
    const armPts = [
      [hx, hy, -0.01],
      [hx * 0.995, hy, -L * 0.38],
      [hx * 0.985, hy - 0.008, -L * 0.68],
      [hx * 0.975, hy - lensRy * 0.10, -L * 0.86],
      [hx * 0.968, hy - lensRy * 0.52, -L * 0.985],
    ];
    push(side < 0 ? 'Temple_L' : 'Temple_R', 0, tube(armPts.slice(0, 3), [1.35 * MM, 1.25 * MM, 1.15 * MM], { radial: 8 }));
    push(side < 0 ? 'TempleTip_L' : 'TempleTip_R', 4, tube(armPts.slice(2), [1.5 * MM, 1.6 * MM, 1.35 * MM], { radial: 8 }));
  }
  // Bridge
  const bPts = [[-eyeCx + lensRx * 0.86, lensRy * 0.40, 0.004], [-(frame.bridge / 4) * MM, lensRy * 0.66, 0.016], [0, lensRy * 0.72, 0.02], [(frame.bridge / 4) * MM, lensRy * 0.66, 0.016], [eyeCx - lensRx * 0.86, lensRy * 0.40, 0.004]];
  push('Bridge', 0, tube(bPts, 1.35 * MM, { radial: 8 }));

  // Materials
  const variant = (frame.variants && frame.variants[0]) || {};
  const base = srgbHexToLinear(variant.colorHex || '#202224');
  const matText = (frame.material || '').toLowerCase();
  const isMetal = /titanium|metal|steel|aluminium|aluminum/.test(matText);
  const frameMat = { name: 'FrameMaterial', pbrMetallicRoughness: { baseColorFactor: base, metallicFactor: isMetal ? 0.9 : 0.08, roughnessFactor: isMetal ? 0.27 : 0.42 } };
  const tipColor = base.map((v, i) => (i < 3 ? v * 0.55 : 1));
  const materials = [
    frameMat,
    { name: 'LensMaterial', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.98, 1.0, 0.28], metallicFactor: 0, roughnessFactor: 0.06 }, alphaMode: 'BLEND', doubleSided: true },
    { name: 'AccentMaterial', pbrMetallicRoughness: { baseColorFactor: [0.83, 0.55, 0.12, 1], metallicFactor: 0.95, roughnessFactor: 0.18 } },
    { name: 'PadMaterial', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.65], metallicFactor: 0, roughnessFactor: 0.4 }, alphaMode: 'BLEND' },
    { name: 'TempleTipMaterial', pbrMetallicRoughness: { baseColorFactor: tipColor, metallicFactor: 0.05, roughnessFactor: 0.5 } },
  ];
  return { meshes, materials, meta: { totalWmm, derivedWidth } };
}

// -------------------------------------------------------------- GLB write ---
function writeGLB(frame, built) {
  const binChunks = [];
  const bufferViews = [], accessors = [], glMeshes = [], nodes = [];
  let byteOffset = 0;
  const pushBuffer = (arr, Type, target) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    binChunks.push(buf); if (pad) binChunks.push(Buffer.alloc(pad));
    const viewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, ...(target ? { target } : {}) });
    byteOffset += buf.length + pad;
    return viewIdx;
  };
  built.meshes.forEach((m, i) => {
    const pos = new Float32Array(m.geometry.positions);
    const nor = new Float32Array(m.geometry.normals);
    const idx = new Uint32Array(m.geometry.indices);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < pos.length; v += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[v + k]); max[k] = Math.max(max[k], pos[v + k]); }
    const posView = pushBuffer(pos, Float32Array, 34962);
    const norView = pushBuffer(nor, Float32Array, 34962);
    const idxView = pushBuffer(idx, Uint32Array, 34963);
    const base = accessors.length;
    accessors.push(
      { bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: idxView, componentType: 5125, count: idx.length, type: 'SCALAR' },
    );
    glMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, indices: base + 2, material: m.material }] });
    nodes.push({ name: m.name, mesh: i });
  });
  const bin = Buffer.concat(binChunks);
  const gltf = {
    asset: {
      version: '2.0', generator: 'EyeKart parametric GLB generator (tools/generate-glb-assets.mjs)',
      extras: {
        sku: frame.sku, name: frame.name,
        dimensionSource: 'assets/js/catalog-data.js',
        dimensionsMm: { lensWidth: frame.lensWidth, lensHeight: frame.lensHeight, bridge: frame.bridge, temple: frame.temple, frameTotalWidth: built.meta.totalWmm },
        frameTotalWidthSource: built.meta.derivedWidth ? 'derived: 2*lensWidth + bridge + 12mm endpieces (catalog value missing)' : 'catalog',
        sceneScale: '1 unit = 52.3mm; front faces +Z; temples extend -Z',
        note: 'Parametric presentation model from catalog dimensions. Not a CAD scan / digital twin of the physical frame.',
      },
    },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: glMeshes,
    materials: built.materials, accessors, bufferViews, buffers: [{ byteLength: bin.length }],
  };
  const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length;
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonBuf.length + jsonPad, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHead, jsonBuf, Buffer.alloc(jsonPad, 0x20), binHead, bin]);
}

// ------------------------------------------------------------------ main ----
const outDir = path.join(repoRoot, 'assets/models');
await mkdir(outDir, { recursive: true });
console.log(`Generating ${catalog.length} GLB assets → assets/models/`);
for (const frame of catalog) {
  const built = buildFrame(frame);
  const glb = writeGLB(frame, built);
  const file = frame.asset3D.modelUrl.split('/').pop();
  await writeFile(path.join(outDir, file), glb);
  console.log(`  ${file}  ${(glb.length / 1024).toFixed(1)} KB  meshes=${built.meshes.length}  shape=${frame.shape}  totalWidth=${built.meta.totalWmm}mm${built.meta.derivedWidth ? ' (derived)' : ''}`);
}
console.log('Done. Run tools/validate-glb.mjs to verify.');
