/**
 * EyeKart Universe 3D — Full-Page Scroll-Driven 3D Experience
 * ============================================================
 * Pattern (the one used by award-winning product sites and modern eyewear
 * flagships): ONE pinned, full-viewport WebGL canvas lives above the page
 * for the ENTIRE scroll. A real GLB frame travels a choreographed journey
 * across every section — changing model, side, scale and camera distance
 * as chapters change — while the DOM itself gets 3D reveals (perspective
 * rotateX entrances) and gentle parallax. Scrolling the page IS the 3D
 * experience, not just the hero.
 *
 * This replaces the hero-only cinematic mount on the homepage (the old
 * engine yields when this file is loaded — see eyekart-cinematic-3d.js).
 *
 * Behaviour / safety:
 * - Homepage only (activates when #hero-frame-wrapper exists). On SPA
 *   navigation away, the stage fades out; on return it rebuilds chapters.
 * - pointer-events: none — the stage never blocks clicks, text or forms.
 * - Reduced motion, no-WebGL, or small-height landscape: does not mount
 *   3D; DOM reveals still apply. Static page remains fully usable.
 * - Models are the parametric catalog GLBs in assets/models/ (Phase 1
 *   asset pipeline). Missing model -> procedural fallback, honestly.
 * - No scroll hijacking: native scroll, damped sampling (scrub-like).
 */
(function (global) {
  'use strict';

  // Signal the hero-only cinematic engine to yield on this page.
  global.__EYEKART_UNIVERSE__ = true;

  // ------------------------------------------------------------------ math --
  // Pure, DOM-free journey math (exported for Node smoke tests).
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * Keyframes: [{ at, x, y, z, rotX, rotY, scale, model }] — `at` is the
   * scrollY where the chapter is fully in pose. sampleJourney interpolates
   * between the surrounding keyframes with smoothstep easing.
   */
  function sampleJourney(keyframes, scrollY) {
    if (!keyframes.length) return null;
    if (scrollY <= keyframes[0].at) return { ...keyframes[0], activeIndex: 0, blend: 0 };
    const last = keyframes[keyframes.length - 1];
    if (scrollY >= last.at) return { ...last, activeIndex: keyframes.length - 1, blend: 0 };
    let i = 0;
    while (i < keyframes.length - 2 && keyframes[i + 1].at < scrollY) i++;
    const a = keyframes[i], b = keyframes[i + 1];
    const t = smooth((scrollY - a.at) / Math.max(1, b.at - a.at));
    return {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
      rotX: lerp(a.rotX, b.rotX, t), rotY: lerp(a.rotY, b.rotY, t),
      scale: lerp(a.scale, b.scale, t),
      model: t < 0.5 ? a.model : b.model,
      activeIndex: t < 0.5 ? i : i + 1,
      blend: t,
    };
  }
  global.EyeKartUniverseMath = { sampleJourney, smooth, lerp, clamp01 };

  // -------------------------------------------------------------- chapters --
  // One chapter per homepage <section>, in document order. Model + label
  // are presentation choices; geometry (side/depth) alternates so the
  // frame visibly travels across the page.
  const CHAPTER_PLAN = [
    { sku: 'EK-902', label: 'Hero — Kibera Titanium' },
    { sku: 'EK-804', label: 'Fit Intelligence — Westlands Octagonal' },
    { sku: 'EK-915', label: 'Craft — Safari Aviator' },
    { sku: 'EK-612', label: 'Collection — Cat-Eye' },
    { sku: 'EK-505', label: 'Atelier — Browline' },
    { sku: 'EK-001', label: 'Clinical — Grand Rift Horn' },
    { sku: 'EK-420', label: 'Book & Care — Square' },
    { sku: 'EK-007', label: 'Finale — Rimless Minimal' },
  ];

  class EyeKartUniverse3D {
    constructor() {
      this.active = false;
      this.renderer = null; this.scene = null; this.camera = null;
      this.models = new Map();       // sku -> THREE.Group (normalised)
      this.journeyGroup = null;      // holds current model, gets journey transform
      this.currentSku = null;
      this.keyframes = [];
      this.chapterEls = [];
      this.scrollY = 0; this.targetScrollY = 0;
      this.mouse = { x: 0, y: 0 }; this.mouseSm = { x: 0, y: 0 };
      this.raf = null; this.lastChapter = -1;
      this.reducedMotion = false;
    }

    async init() {
      if (this.active) return;
      this.reducedMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._applyDomReveals(); // DOM 3D motion applies even without WebGL
      if (this.reducedMotion) { console.info('[EyeKart Universe] Reduced motion — DOM reveals only.'); return; }
      if (!document.getElementById('hero-frame-wrapper')) return; // homepage only
      if (!this._hasWebGL()) { console.warn('[EyeKart Universe] WebGL unavailable — static page preserved.'); return; }
      const threeReady = await this._ensureThree();
      if (!threeReady) return;

      this._injectChrome();
      this._initScene();
      this._buildChapters();
      this._bindScroll();
      await this._loadModel(CHAPTER_PLAN[0].sku); // hero model first
      if (!this.models.get(CHAPTER_PLAN[0].sku)) {
        // Both GLB and procedural fallback failed — restore the static
        // hero photo rather than leaving a blank hero.
        const heroImg = document.getElementById('hero-frame-img');
        if (heroImg) heroImg.style.opacity = '1';
        console.warn('[EyeKart Universe] No hero model available — static hero restored.');
        return;
      }
      this._applyJourney(0, true);
      this.active = true;
      this._startLoop();
      // Preload the rest of the journey in the background
      CHAPTER_PLAN.slice(1).forEach(p => this._loadModel(p.sku));
      console.info('[EyeKart Universe] Full-page scroll 3D active. Chapters:', this.keyframes.length);
    }

    _hasWebGL() {
      try {
        const c = document.createElement('canvas');
        return !!(global.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (e) { return false; }
    }

    _ensureThree() {
      if (typeof global.THREE !== 'undefined' && typeof global.THREE.GLTFLoader !== 'undefined') return Promise.resolve(true);
      const load = (src) => new Promise((res) => {
        const s = document.createElement('script');
        s.src = src; s.async = false;
        s.onload = () => res(true); s.onerror = () => res(false);
        document.head.appendChild(s);
      });
      return (async () => {
        if (typeof global.THREE === 'undefined') { if (!await load('/assets/vendor/three.min.js')) return false; }
        if (typeof global.THREE.GLTFLoader === 'undefined') await load('/assets/vendor/GLTFLoader.js');
        return typeof global.THREE !== 'undefined';
      })();
    }

    // ------------------------------------------------------------ chrome ---
    _injectChrome() {
      if (!document.getElementById('eyekart-universe-css')) {
        const css = document.createElement('style');
        css.id = 'eyekart-universe-css';
        css.textContent = `
          #eyekart-universe-canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:30;pointer-events:none;}
          #eyekart-universe-progress{position:fixed;top:0;left:0;height:3px;width:100%;z-index:60;transform-origin:0 50%;transform:scaleX(0);
            background:linear-gradient(90deg,#06b6d4,#0b1c30);pointer-events:none;}
          #eyekart-universe-hud{position:fixed;left:14px;bottom:14px;z-index:40;pointer-events:none;display:flex;align-items:center;gap:8px;
            background:rgba(11,28,48,.82);color:#eaf6ff;border-radius:999px;padding:7px 14px;font:600 11px/1.3 system-ui,sans-serif;
            letter-spacing:.04em;backdrop-filter:blur(6px);box-shadow:0 4px 18px rgba(0,0,0,.25);opacity:0;transition:opacity .5s;}
          #eyekart-universe-hud.on{opacity:1}
          #eyekart-universe-hud .dot{width:7px;height:7px;border-radius:50%;background:#06b6d4;box-shadow:0 0 8px #06b6d4;}
          .universe-reveal{opacity:0;transform:perspective(1000px) rotateX(9deg) translateY(38px);transform-origin:50% 0%;
            transition:opacity .9s ease,transform .95s cubic-bezier(.19,1,.22,1);}
          .universe-reveal.in{opacity:1;transform:perspective(1000px) rotateX(0deg) translateY(0);}
          @media (max-width:768px){#eyekart-universe-hud{display:none}}
        `;
        document.head.appendChild(css);
      }
      if (!document.getElementById('eyekart-universe-canvas')) {
        const canvas = document.createElement('canvas');
        canvas.id = 'eyekart-universe-canvas';
        document.body.appendChild(canvas);
        this.canvas = canvas;
      } else this.canvas = document.getElementById('eyekart-universe-canvas');
      if (!document.getElementById('eyekart-universe-progress')) {
        const bar = document.createElement('div');
        bar.id = 'eyekart-universe-progress';
        document.body.appendChild(bar);
      }
      if (!document.getElementById('eyekart-universe-hud')) {
        const hud = document.createElement('div');
        hud.id = 'eyekart-universe-hud';
        hud.innerHTML = '<span class="dot"></span><span id="eyekart-universe-hud-text">3D Universe</span>';
        document.body.appendChild(hud);
      }
      // Hide the static hero photo: the flying GLB takes its place.
      const heroImg = document.getElementById('hero-frame-img');
      if (heroImg) heroImg.style.opacity = '0';
    }

    // -------------------------------------------------------------- scene --
    _initScene() {
      const THREE = global.THREE;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
      this.camera.position.set(0, 0, 7.2);
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setSize(innerWidth, innerHeight);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));

      this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const key = new THREE.DirectionalLight(0xfffaed, 1.5); key.position.set(4, 6, 6); this.scene.add(key);
      const fill = new THREE.DirectionalLight(0xd9efff, 0.55); fill.position.set(-5, -2, 3); this.scene.add(fill);
      const rim = new THREE.DirectionalLight(0x06b6d4, 1.0); rim.position.set(0, -4, -4); this.scene.add(rim);

      this.journeyGroup = new THREE.Group();
      this.scene.add(this.journeyGroup);

      // Atmosphere: concentric optical rings + light motes (as in hero engine)
      const ringMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.14 });
      this.rings = new THREE.Group();
      [2.4, 3.4, 4.6].forEach(r => {
        const pts = [];
        for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
        this.rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
      });
      this.rings.position.z = -2.2;
      this.scene.add(this.rings);
      const n = 60, pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i += 3) { pos[i] = (Math.random() - .5) * 14; pos[i + 1] = (Math.random() - .5) * 8; pos[i + 2] = (Math.random() - .5) * 3 - 1; }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x8fdfff, size: 0.05, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
      this.scene.add(this.particles);

      addEventListener('resize', () => {
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(innerWidth, innerHeight);
        this._buildChapters();
      });
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(this.raf); });
      this.canvas.addEventListener('webglcontextrestored', () => { this.active = false; this.models.clear(); this.init(); });
    }

    async _loadModel(sku) {
      if (this.models.has(sku)) return this.models.get(sku);
      const THREE = global.THREE;
      const url = `/assets/models/${sku.toLowerCase().replace('-', '')}.glb`;
      const group = await new Promise((resolve) => {
        const done = (g) => resolve(g);
        try {
          new THREE.GLTFLoader().load(url, (gltf) => {
            let meshes = 0;
            gltf.scene.traverse(c => { if (c.isMesh && c.geometry) meshes++; });
            const box = new THREE.Box3().setFromObject(gltf.scene);
            if (!meshes || box.isEmpty()) return done(null);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            gltf.scene.position.sub(center);
            const g = new THREE.Group();
            g.add(gltf.scene);
            const k = 2.9 / Math.max(size.x, 0.001);
            g.scale.set(k, k, k);
            g.visible = false;
            done(g);
          }, undefined, () => done(null));
        } catch (e) { done(null); }
      });
      let finalGroup = group;
      if (!finalGroup && global.ProceduralEyewearModel) {
        finalGroup = global.ProceduralEyewearModel.create(THREE, 0x202224);
        finalGroup.scale.set(1.15, 1.15, 1.15);
        finalGroup.visible = false;
      }
      if (finalGroup) { this.models.set(sku, finalGroup); this.journeyGroup.add(finalGroup); }
      return finalGroup;
    }

    // ----------------------------------------------------------- chapters --
    _buildChapters() {
      const sections = Array.from(document.querySelectorAll('main section'));
      this.chapterEls = sections;
      const vw = innerWidth, vh = innerHeight;
      const wide = vw >= 1024;
      const sideX = wide ? 2.35 : 1.15;         // how far the frame travels sideways
      const baseScale = vw < 640 ? 0.62 : (wide ? 1.0 : 0.8);
      this.keyframes = sections.map((el, i) => {
        const plan = CHAPTER_PLAN[Math.min(i, CHAPTER_PLAN.length - 1)];
        const top = el.getBoundingClientRect().top + (global.scrollY || 0);
        const side = i === 0 ? 0.85 : (i % 2 === 0 ? -sideX : sideX); // hero: right-of-centre
        return {
          at: Math.max(0, top - vh * 0.45),
          x: wide ? side : side * 0.55,
          y: i === 0 ? 0.1 : (i % 3 === 0 ? 0.55 : -0.15),
          z: i === 0 ? 0.4 : (i % 2 === 0 ? -0.6 : 0.2),
          rotX: 0.10 + (i % 3) * 0.07,
          rotY: -0.5 + i * 0.55,
          scale: baseScale * (i === 0 ? 1.12 : 1),
          model: plan.sku,
          label: plan.label,
        };
      });
      // Continuous full-page spin: cumulative rotation added on top of keyframes
      this.maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    }

    _bindScroll() {
      const onScroll = () => { this.targetScrollY = global.scrollY || 0; };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      addEventListener('mousemove', (e) => {
        this.mouse.x = (e.clientX / innerWidth - 0.5) * 2;
        this.mouse.y = (e.clientY / innerHeight - 0.5) * 2;
      }, { passive: true });
      // SPA routers swap <main> content — rebuild chapters when that happens
      const main = document.querySelector('main');
      if (main && global.MutationObserver) {
        new MutationObserver(() => {
          const onHome = !!document.getElementById('hero-frame-wrapper');
          if (this.canvas) this.canvas.style.display = onHome ? 'block' : 'none';
          const hud = document.getElementById('eyekart-universe-hud');
          if (hud) hud.classList.toggle('on', onHome);
          if (onHome) this._buildChapters();
        }).observe(main, { childList: true });
      }
    }

    // -------------------------------------------------------- DOM reveals --
    _applyDomReveals() {
      if (this._revealsDone) return;
      this._revealsDone = true;
      const targets = document.querySelectorAll('main section > div, main section .grid > *, main section form');
      if (!('IntersectionObserver' in global)) { targets.forEach(t => t.classList.add('in')); return; }
      if (!document.getElementById('eyekart-universe-css')) {
        const css = document.createElement('style');
        css.id = 'eyekart-universe-css';
        css.textContent = `.universe-reveal{opacity:0;transform:perspective(1000px) rotateX(9deg) translateY(38px);transform-origin:50% 0%;transition:opacity .9s ease,transform .95s cubic-bezier(.19,1,.22,1);}.universe-reveal.in{opacity:1;transform:perspective(1000px) rotateX(0deg) translateY(0);}`;
        document.head.appendChild(css);
      }
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      targets.forEach((t, i) => {
        if (t.closest && t.closest('header')) return;
        t.classList.add('universe-reveal');
        t.style.transitionDelay = `${Math.min((i % 4) * 70, 210)}ms`;
        io.observe(t);
      });
    }

    // --------------------------------------------------------------- loop ---
    _applyJourney(ms, snap) {
      const state = sampleJourney(this.keyframes, this.scrollY);
      if (!state) return;
      const totalSpin = (this.scrollY / Math.max(1, this.maxScroll)) * Math.PI * 3; // 1.5 extra turns across the page
      const g = this.journeyGroup;
      g.position.set(state.x + this.mouseSm.x * 0.22, state.y - this.mouseSm.y * 0.14, state.z);
      g.rotation.set(state.rotX + this.mouseSm.y * 0.08, state.rotY + totalSpin + this.mouseSm.x * 0.18, 0.03 * Math.sin(ms / 2400));
      const s = state.scale * (1 + 0.02 * Math.sin(ms / 1600));
      g.scale.set(s, s, s);
      // model swap on chapter change
      if (state.model !== this.currentSku) {
        const prev = this.currentSku && this.models.get(this.currentSku);
        if (prev) prev.visible = false;
        this.currentSku = state.model;
        const next = this.models.get(state.model);
        if (next) next.visible = true;
        else this._loadModel(state.model).then(m => { if (m && this.currentSku === state.model) m.visible = true; });
        // chapter HUD
        const kf = this.keyframes[state.activeIndex];
        const hud = document.getElementById('eyekart-universe-hud');
        const txt = document.getElementById('eyekart-universe-hud-text');
        if (hud && txt && kf) { txt.textContent = `3D Universe • ${kf.label}`; hud.classList.add('on'); }
        this.lastChapter = state.activeIndex;
      }
      const bar = document.getElementById('eyekart-universe-progress');
      if (bar) bar.style.transform = `scaleX(${this.scrollY / Math.max(1, this.maxScroll)})`;
    }

    _startLoop() {
      const tick = (ms) => {
        this.raf = requestAnimationFrame(tick);
        if (document.hidden) return;
        // scrub-like damping toward the real scroll position
        this.scrollY += (this.targetScrollY - this.scrollY) * 0.085;
        if (Math.abs(this.targetScrollY - this.scrollY) < 0.05) this.scrollY = this.targetScrollY;
        this.mouseSm.x += (this.mouse.x - this.mouseSm.x) * 0.05;
        this.mouseSm.y += (this.mouse.y - this.mouseSm.y) * 0.05;
        this._applyJourney(ms || 0);
        if (this.rings) this.rings.rotation.z = (ms || 0) * 0.00003;
        if (this.particles) this.particles.rotation.y = (ms || 0) * 0.000012;
        this.renderer.render(this.scene, this.camera);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  const universe = new EyeKartUniverse3D();
  global.EyeKartUniverse3D = universe;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => universe.init());
  else universe.init();
})(typeof window !== 'undefined' ? window : this);
