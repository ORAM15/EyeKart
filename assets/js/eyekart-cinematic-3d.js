/**
 * EyeKart Cinematic 3D Engine & Scroll-Driven Choreographer
 * Native Three.js WebGL Architecture • Procedural Luxury Eyewear Model • 60fps Scroll Progress
 * Absolute Honesty & Zero-Drift Visual Preservation Layer
 */
(function (global) {
  'use strict';

  // --- 1. Procedural Luxury Eyewear Model Generator ---
  class ProceduralEyewearModel {
    /**
     * Builds a mathematically accurate, luxury optical frame in Three.js.
     * Features: Japanese beta-titanium rims, dual bridge filigree, silicone nose pads,
     * 5-barrel spring hinges, ergonomic acetate temple tips, and physical refractive lenses.
     */
    static create(THREE, finishColorHex = 0x202224) {
      const group = new THREE.Group();
      group.name = 'ProceduralEyewear';

      // Physical Titanium Material
      const titaniumMaterial = new THREE.MeshStandardMaterial({
        color: finishColorHex,
        metalness: 0.88,
        roughness: 0.22,
        envMapIntensity: 1.2
      });

      // Secondary Accent (Polished Gold Screws / Filigree)
      const accentMaterial = new THREE.MeshStandardMaterial({
        color: 0xD4AF37,
        metalness: 0.95,
        roughness: 0.15
      });

      // Silicone Nose Pad Material
      const siliconeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        roughness: 0.3,
        transmission: 0.6
      });

      // High-Index Refractive Glass Lens Material with AR Sheen
      const lensMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xf5fbff,
        transparent: true,
        opacity: 0.45,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.92,
        ior: 1.54,
        reflectivity: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08
      });

      // Helper: Create Hexagonal / Soft Geometric Rim Path
      function createHexRimCurve(radiusX, radiusY) {
        const points = [];
        const segments = 6;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2 + (Math.PI / 6);
          const x = Math.cos(theta) * radiusX;
          const y = Math.sin(theta) * radiusY;
          points.push(new THREE.Vector3(x, y, 0));
        }
        return new THREE.CatmullRomCurve3(points, true);
      }

      const rimRadiusX = 0.56;
      const rimRadiusY = 0.48;
      const eyeSpacing = 0.74; // Half-distance from bridge to eye center

      // Left Eye Rim & Lens
      const leftCurve = createHexRimCurve(rimRadiusX, rimRadiusY);
      const leftRimGeo = new THREE.TubeGeometry(leftCurve, 48, 0.024, 10, true);
      const leftRimMesh = new THREE.Mesh(leftRimGeo, titaniumMaterial);
      leftRimMesh.position.set(-eyeSpacing, 0, 0);
      group.add(leftRimMesh);

      const leftLensGeo = new THREE.CylinderGeometry(rimRadiusX * 0.96, rimRadiusX * 0.96, 0.015, 32);
      leftLensGeo.rotateX(Math.PI / 2);
      leftLensGeo.scale(1, rimRadiusY / rimRadiusX, 1);
      const leftLensMesh = new THREE.Mesh(leftLensGeo, lensMaterial);
      leftLensMesh.position.set(-eyeSpacing, 0, 0);
      group.add(leftLensMesh);

      // Right Eye Rim & Lens
      const rightCurve = createHexRimCurve(rimRadiusX, rimRadiusY);
      const rightRimGeo = new THREE.TubeGeometry(rightCurve, 48, 0.024, 10, true);
      const rightRimMesh = new THREE.Mesh(rightRimGeo, titaniumMaterial);
      rightRimMesh.position.set(eyeSpacing, 0, 0);
      group.add(rightRimMesh);

      const rightLensGeo = new THREE.CylinderGeometry(rimRadiusX * 0.96, rimRadiusX * 0.96, 0.015, 32);
      rightLensGeo.rotateX(Math.PI / 2);
      rightLensGeo.scale(1, rimRadiusY / rimRadiusX, 1);
      const rightLensMesh = new THREE.Mesh(rightLensGeo, lensMaterial);
      rightLensMesh.position.set(eyeSpacing, 0, 0);
      group.add(rightLensMesh);

      // Central Architectural Double Bridge
      // Top arched brow bar
      const browBridgeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-eyeSpacing + rimRadiusX * 0.82, rimRadiusY * 0.65, 0.02),
        new THREE.Vector3(0, rimRadiusY * 0.75, 0.06),
        new THREE.Vector3(eyeSpacing - rimRadiusX * 0.82, rimRadiusY * 0.65, 0.02)
      ]);
      const browBridgeGeo = new THREE.TubeGeometry(browBridgeCurve, 20, 0.018, 8, false);
      const browBridgeMesh = new THREE.Mesh(browBridgeGeo, titaniumMaterial);
      group.add(browBridgeMesh);

      // Lower keyhole bridge
      const lowerBridgeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-eyeSpacing + rimRadiusX * 0.90, 0.06, 0.01),
        new THREE.Vector3(-0.08, 0.15, 0.04),
        new THREE.Vector3(0, 0.18, 0.05),
        new THREE.Vector3(0.08, 0.15, 0.04),
        new THREE.Vector3(eyeSpacing - rimRadiusX * 0.90, 0.06, 0.01)
      ]);
      const lowerBridgeGeo = new THREE.TubeGeometry(lowerBridgeCurve, 20, 0.018, 8, false);
      const lowerBridgeMesh = new THREE.Mesh(lowerBridgeGeo, titaniumMaterial);
      group.add(lowerBridgeMesh);

      // Nose Pad Arms & Silicone Cushions
      [-1, 1].forEach((side) => {
        const padArmCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * (eyeSpacing - rimRadiusX * 0.85), 0.04, -0.01),
          new THREE.Vector3(side * 0.18, -0.08, -0.10),
          new THREE.Vector3(side * 0.16, -0.16, -0.15)
        ]);
        const padArmGeo = new THREE.TubeGeometry(padArmCurve, 12, 0.012, 6, false);
        const padArmMesh = new THREE.Mesh(padArmGeo, accentMaterial);
        group.add(padArmMesh);

        const padPillowGeo = new THREE.BoxGeometry(0.07, 0.13, 0.035);
        const padPillowMesh = new THREE.Mesh(padPillowGeo, siliconeMaterial);
        padPillowMesh.position.set(side * 0.16, -0.16, -0.15);
        padPillowMesh.rotation.set(0.2, side * -0.3, side * 0.2);
        group.add(padPillowMesh);
      });

      // Left & Right 5-Barrel Hinges and Temples
      [-1, 1].forEach((side) => {
        const hingeX = side * (eyeSpacing + rimRadiusX * 0.92);
        const hingeY = rimRadiusY * 0.45;

        // Micro Hinge Block with Pin
        const hingeGeo = new THREE.BoxGeometry(0.05, 0.06, 0.07);
        const hingeMesh = new THREE.Mesh(hingeGeo, accentMaterial);
        hingeMesh.position.set(hingeX, hingeY, -0.04);
        group.add(hingeMesh);

        // Slim Titanium Temple Arm extending backwards
        const templeCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(hingeX, hingeY, -0.06),
          new THREE.Vector3(side * (eyeSpacing + rimRadiusX * 0.88), hingeY * 0.9, -1.0),
          new THREE.Vector3(side * (eyeSpacing + rimRadiusX * 0.84), hingeY * 0.4, -1.5),
          new THREE.Vector3(side * (eyeSpacing + rimRadiusX * 0.80), -0.22, -1.85) // Ergonomic ear hook
        ]);
        const templeGeo = new THREE.TubeGeometry(templeCurve, 36, 0.018, 8, false);
        const templeMesh = new THREE.Mesh(templeGeo, titaniumMaterial);
        group.add(templeMesh);

        // Acetate Comfort Ear Tip on Temple
        const tipCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * (eyeSpacing + rimRadiusX * 0.84), hingeY * 0.4, -1.45),
          new THREE.Vector3(side * (eyeSpacing + rimRadiusX * 0.80), -0.22, -1.85)
        ]);
        const tipGeo = new THREE.TubeGeometry(tipCurve, 16, 0.026, 8, false);
        const tipMesh = new THREE.Mesh(tipGeo, titaniumMaterial);
        group.add(tipMesh);
      });

      // Attach public helper to update frame finish colorway dynamically
      group.updateFinishColor = (newHex) => {
        titaniumMaterial.color.setHex(newHex);
      };

      // Store references
      group.userData = {
        titaniumMaterial,
        accentMaterial,
        siliconeMaterial,
        lensMaterial,
        isProcedural: true
      };

      return group;
    }
  }

  // --- 2. Master Cinematic 3D Stage Controller ---
  class EyeKartCinematic3D {
    constructor() {
      this.isInitialized = false;
      this.container = null;
      this.canvas = null;
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.frameModel = null;
      this.particles = null;
      this.opticalRings = null;
      this.animFrameId = null;

      // Interaction & Mouse tracking
      this.targetMouse = { x: 0, y: 0 };
      this.currentMouse = { x: 0, y: 0 };
      this.scrollProgress = 0;
      this.targetScrollProgress = 0;
      this.isReducedMotion = false;
      this.isIntersecting = true;

      // Lighting Presets
      this.lights = {
        ambient: null,
        key: null,
        fill: null,
        rim: null
      };
    }

    async init() {
      if (this.isInitialized) return;

      console.info('[EyeKart 3D] Bootstrapping Cinematic 3D Visual Engine...');

      // Check reduced motion preference
      if (typeof window !== 'undefined' && window.matchMedia) {
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }

      // Check WebGL availability
      if (!this._hasWebGLSupport()) {
        console.warn('[EyeKart 3D] WebGL not supported on client device; maintaining 2D fallback.');
        return;
      }

      // Load Three.js vendor library if not already loaded
      const threeReady = await this._ensureThreeLoaded();
      if (!threeReady || typeof window.THREE === 'undefined') {
        console.warn('[EyeKart 3D] Three.js library unavailable; skipping 3D canvas mount.');
        return;
      }

      // Target hero container
      const heroFrameWrapper = document.getElementById('hero-frame-wrapper');
      if (!heroFrameWrapper) {
        // Not on homepage or hero not present
        return;
      }

      this._mountHeroStage(heroFrameWrapper);
      this._initScene();
      this._initLighting();
      this._initEyewear();
      this._initOpticalAtmosphere();
      this._bindInteractions();
      this._bindScrollTracker();
      this._bindProductCardTilt();

      // Start render animation loop
      this._startLoop();

      this.isInitialized = true;
      console.info('[EyeKart 3D] Cinematic 3D Engine successfully mounted and operational.');
    }

    _hasWebGLSupport() {
      try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (e) {
        return false;
      }
    }

    _ensureThreeLoaded() {
      if (typeof window.THREE !== 'undefined') return Promise.resolve(true);

      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/assets/vendor/three.min.js';
        script.async = false;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
    }

    _mountHeroStage(wrapper) {
      this.container = wrapper;

      // Hide static 2D hero image gracefully while keeping it available for fallback
      const staticImg = document.getElementById('hero-frame-img');
      if (staticImg) {
        staticImg.style.display = 'none';
      }

      // Create WebGL canvas container
      let stage = document.getElementById('eyekart-hero-canvas-stage');
      if (!stage) {
        stage = document.createElement('div');
        stage.id = 'eyekart-hero-canvas-stage';
        wrapper.appendChild(stage);
      }

      let canvas = document.getElementById('hero-3d-webgl-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'hero-3d-webgl-canvas';
        stage.appendChild(canvas);
      }
      this.canvas = canvas;

      // Add honest 3D status badge
      let badge = document.getElementById('hero-3d-status-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'hero-3d-status-badge';
        badge.className = 'absolute top-3 left-3 z-20 eyekart-status-pill shadow-sm';
        badge.innerHTML = '<span class="material-symbols-outlined text-[13px] text-cyan-accent animate-pulse">view_in_ar</span><span>Interactive 3D • Titanium Beta</span>';
        stage.appendChild(badge);
      }
    }

    _initScene() {
      const THREE = window.THREE;
      const width = this.container.clientWidth || 440;
      const height = Math.min(width * 0.82, 380);

      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      this.camera.position.set(0, 0, 4.4);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      // Resize observer
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (!this.renderer || !this.camera || !this.container) return;
          const w = this.container.clientWidth || 440;
          const h = Math.min(w * 0.82, 380);
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(w, h);
        });
        ro.observe(this.container);
      }

      // Intersection observer to pause loop off-screen
      if (typeof IntersectionObserver !== 'undefined') {
        const io = new IntersectionObserver((entries) => {
          this.isIntersecting = entries[0].isIntersecting;
        }, { threshold: 0.05 });
        io.observe(this.container);
      }
    }

    _initLighting() {
      const THREE = window.THREE;

      // Balanced Equatorial Studio Lighting
      this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.85);
      this.scene.add(this.lights.ambient);

      // Key light (warm high sun)
      this.lights.key = new THREE.DirectionalLight(0xfffaed, 1.4);
      this.lights.key.position.set(4, 6, 6);
      this.scene.add(this.lights.key);

      // Fill light (soft ambient blue)
      this.lights.fill = new THREE.DirectionalLight(0xd9efff, 0.6);
      this.lights.fill.position.set(-5, -2, 3);
      this.scene.add(this.lights.fill);

      // Optical rim specular light (cyan Nairobi accent)
      this.lights.rim = new THREE.DirectionalLight(0x06b6d4, 0.9);
      this.lights.rim.position.set(0, -4, -4);
      this.scene.add(this.lights.rim);
    }

    _initEyewear() {
      const THREE = window.THREE;
      // Default to Obsidian Black (0x202224)
      this.frameModel = ProceduralEyewearModel.create(THREE, 0x202224);
      this.frameModel.scale.set(1.4, 1.4, 1.4);
      this.frameModel.position.set(0, 0, 0);
      this.scene.add(this.frameModel);
    }

    _initOpticalAtmosphere() {
      const THREE = window.THREE;

      // Subtle Optical Concentric Rings
      const ringGroup = new THREE.Group();
      ringGroup.position.set(0, 0, -1.5);

      const ringMaterial = new THREE.LineBasicMaterial({
        color: 0x06B6D4,
        transparent: true,
        opacity: 0.16
      });

      [1.4, 2.2, 3.1].forEach((r) => {
        const ringGeo = new THREE.BufferGeometry();
        const pts = [];
        const segs = 64;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
        }
        ringGeo.setFromPoints(pts);
        const line = new THREE.Line(ringGeo, ringMaterial);
        ringGroup.add(line);
      });

      this.opticalRings = ringGroup;
      this.scene.add(this.opticalRings);

      // Subtle Floating Optical Light Motes (Dust Particles)
      const particleCount = 45;
      const pGeo = new THREE.BufferGeometry();
      const pPositions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount * 3; i += 3) {
        pPositions[i] = (Math.random() - 0.5) * 8;
        pPositions[i + 1] = (Math.random() - 0.5) * 5;
        pPositions[i + 2] = (Math.random() - 0.5) * 4;
      }

      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

      const pMat = new THREE.PointsMaterial({
        color: 0x8fdfff,
        size: 0.04,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
      });

      this.particles = new THREE.Points(pGeo, pMat);
      this.scene.add(this.particles);
    }

    _bindInteractions() {
      // Mouse move tilt on hero stage
      const stage = document.getElementById('eyekart-hero-canvas-stage');
      if (stage) {
        stage.addEventListener('mousemove', (e) => {
          const rect = stage.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          this.targetMouse.x = x * 2;
          this.targetMouse.y = y * 2;
        });

        stage.addEventListener('mouseleave', () => {
          this.targetMouse.x = 0;
          this.targetMouse.y = 0;
        });

        // Touch drag interaction for mobile
        let touchStartX = 0;
        stage.addEventListener('touchstart', (e) => {
          if (e.touches.length > 0) touchStartX = e.touches[0].clientX;
        }, { passive: true });

        stage.addEventListener('touchmove', (e) => {
          if (e.touches.length > 0) {
            const deltaX = (e.touches[0].clientX - touchStartX) / window.innerWidth;
            this.targetMouse.x = deltaX * 3;
          }
        }, { passive: true });

        stage.addEventListener('touchend', () => {
          this.targetMouse.x = 0;
        }, { passive: true });
      }

      // Swatch Finish Buttons Real-Time 3D Material Sync
      const swatches = document.querySelectorAll('.swatch-btn, [data-finish]');
      const colorMap = {
        'Obsidian Black': 0x202224,
        'Brushed Savannah Gold': 0xD4AF37,
        'Amber Rift Tortoise': 0x6B3E11,
        'Frosted Smoke Quartz': 0x475569
      };

      swatches.forEach(btn => {
        btn.addEventListener('click', () => {
          const finish = btn.getAttribute('data-finish') || 'Obsidian Black';
          const hex = colorMap[finish] || 0x202224;
          if (this.frameModel && typeof this.frameModel.updateFinishColor === 'function') {
            this.frameModel.updateFinishColor(hex);
          }
        });
      });

      // Lighting Preset Toggle Button
      const lightingBtn = document.getElementById('btn-lighting-toggle');
      const lightingTag = document.getElementById('hero-lighting-tag');
      let currentPreset = 'daylight';

      if (lightingBtn) {
        lightingBtn.addEventListener('click', () => {
          if (currentPreset === 'daylight') {
            currentPreset = 'golden';
            if (lightingTag) lightingTag.textContent = 'Golden Hour (3200K)';
            this._setLightingPreset(0xffd79e, 1.5, 0xffeed4);
          } else if (currentPreset === 'golden') {
            currentPreset = 'clinical';
            if (lightingTag) lightingTag.textContent = 'Clinical High-CRI (6500K)';
            this._setLightingPreset(0xf0f5ff, 1.6, 0xffffff);
          } else {
            currentPreset = 'daylight';
            if (lightingTag) lightingTag.textContent = 'Equatorial Daylight (5400K)';
            this._setLightingPreset(0xfffaed, 1.4, 0xffffff);
          }
        });
      }
    }

    _setLightingPreset(keyColor, keyIntensity, ambientColor) {
      if (this.lights.key) {
        this.lights.key.color.setHex(keyColor);
        this.lights.key.intensity = keyIntensity;
      }
      if (this.lights.ambient) {
        this.lights.ambient.color.setHex(ambientColor);
      }
    }

    _bindScrollTracker() {
      const updateScroll = () => {
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const maxScroll = 1600;
        const rawProgress = Math.min(Math.max(scrollY / maxScroll, 0), 1);
        this.targetScrollProgress = rawProgress;
      };

      window.addEventListener('scroll', updateScroll, { passive: true });
      this.updateScroll = updateScroll;
      this.setScrollProgress = (val) => {
        this.targetScrollProgress = Math.min(Math.max(val, 0), 1);
      };
    }

    _bindProductCardTilt() {
      // 3D Perspective Tilt for all optical cards
      const cards = document.querySelectorAll('.group.bg-optical-white, .eyekart-tilt-card');

      cards.forEach(card => {
        card.classList.add('eyekart-tilt-card');

        // Append specular sheen element if missing
        if (!card.querySelector('.eyekart-card-sheen')) {
          const sheen = document.createElement('div');
          sheen.className = 'eyekart-card-sheen';
          card.appendChild(sheen);
        }

        card.addEventListener('mousemove', (e) => {
          if (this.isReducedMotion) return;
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;

          const rotateX = ((y - centerY) / centerY) * -7; // Max ±7 degrees
          const rotateY = ((x - centerX) / centerX) * 7;

          card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
          card.style.setProperty('--mouse-x', `${(x / rect.width * 100).toFixed(1)}%`);
          card.style.setProperty('--mouse-y', `${(y / rect.height * 100).toFixed(1)}%`);
        });

        card.addEventListener('mouseleave', () => {
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        });
      });
    }

    _startLoop() {
      const clock = new window.THREE.Clock();

      const animate = () => {
        this.animFrameId = requestAnimationFrame(animate);

        // 1. Smooth interpolation of mouse tracking (damping factor 0.08)
        this.currentMouse.x += (this.targetMouse.x - this.currentMouse.x) * 0.08;
        this.currentMouse.y += (this.targetMouse.y - this.currentMouse.y) * 0.08;

        // 2. Smooth interpolation of scroll progress (damping factor 0.07)
        this.scrollProgress += (this.targetScrollProgress - this.scrollProgress) * 0.07;

        // Skip WebGL render if tab hidden or scrolled past story threshold
        if ((typeof document !== 'undefined' && document.hidden) || (!this.isIntersecting && this.scrollProgress > 0.95)) {
          return;
        }

        const elapsedTime = clock.getElapsedTime();

        // 3. Scroll-Driven 5-Phase Choreography
        if (this.frameModel) {
          const p = this.scrollProgress;

          // Organic zero-gravity floating oscillation
          const floatOffset = this.isReducedMotion ? 0 : Math.sin(elapsedTime * 1.8) * 0.04;
          const floatRotation = this.isReducedMotion ? 0 : Math.cos(elapsedTime * 1.2) * 0.03;

          let targetRotY = 0;
          let targetRotX = 0;
          let targetPosEndZ = 0;

          if (p < 0.20) {
            // Phase 1 (0% – 20%): Frontal optical composition
            const t = p / 0.20;
            targetRotY = t * 0.35;
            targetRotX = 0.08;
            targetPosEndZ = 0;
          } else if (p < 0.50) {
            // Phase 2 (20% – 50%): Reveal beta-titanium profile & temple hinge
            const t = (p - 0.20) / 0.30;
            targetRotY = 0.35 + t * 0.85; // Rotates to ~1.2 rad (~68 degrees)
            targetRotX = 0.08 + t * 0.15;
            targetPosEndZ = t * 0.6; // Camera zooms in on frame
          } else if (p < 0.75) {
            // Phase 3 (50% – 75%): Macro view on anti-reflective lens refraction
            const t = (p - 0.50) / 0.25;
            targetRotY = 1.2 - t * 0.7; // Rotates smoothly back
            targetRotX = 0.23 - t * 0.12;
            targetPosEndZ = 0.6 - t * 0.2;
          } else {
            // Phase 4 & 5 (75% – 100%): 3/4 perspective transitioning into catalog
            const t = (p - 0.75) / 0.25;
            targetRotY = 0.5 + t * 0.4;
            targetRotX = 0.11;
            targetPosEndZ = 0.4 - t * 0.4;
          }

          // Apply mouse cursor tilt
          this.frameModel.rotation.y = targetRotY + (this.currentMouse.x * 0.45) + floatRotation;
          this.frameModel.rotation.x = targetRotX - (this.currentMouse.y * 0.35);
          this.frameModel.position.y = floatOffset;
          this.frameModel.position.z = targetPosEndZ;
        }

        // 4. Atmosphere rotation
        if (this.opticalRings && !this.isReducedMotion) {
          this.opticalRings.rotation.z = elapsedTime * 0.04;
        }

        if (this.particles && !this.isReducedMotion) {
          this.particles.rotation.y = elapsedTime * 0.02;
        }

        // 5. Render Scene
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      };

      animate();
    }

    destroy() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      if (this.renderer) {
        this.renderer.dispose();
      }
      this.isInitialized = false;
    }
  }

  // Export to global scope
  global.ProceduralEyewearModel = ProceduralEyewearModel;
  global.EyeKartCinematic3D = new EyeKartCinematic3D();

})(typeof window !== 'undefined' ? window : this);
