/**
 * EyeKart Product Studio (True 3D WebGL Viewer Architecture & 2D CSS Fallback)
 * Integrates Three.js WebGL rendering, OrbitControls, dynamic lighting presets,
 * and canonical product state mapping while preserving the Stitch visual freeze.
 * 
 * Technical Reality Classifications:
 * - "REAL WEBGL 3D PRODUCT VIEWER" (When a verified GLB model is loaded & rendered)
 * - "WEBGL 3D VIEWER — ASSET REQUIRED" (When WebGL architecture is ready but 3D model is missing/404)
 * - "2D / CSS PRODUCT ROTATION FALLBACK" (When WebGL is unavailable on the device)
 */
(function (global) {
  'use strict';

  class Studio3D {
    constructor() {
      this.currentAngle = 0;
      this.isBlueprintActive = false;
      this.currentLighting = 'studio';
      this.classification = '2D / CSS PRODUCT ROTATION FALLBACK';
      this.webglSupported = false;
      this.hasLoaded3DModel = false;
      this.isThreeReady = false;

      // Three.js instances
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;
      this.ambientLight = null;
      this.keyLight = null;
      this.fillLight = null;
      this.currentModel = null;
      this.animationFrameId = null;
    }

    async init() {
      console.info('[EyeKart 3D Studio] Initializing Product Studio Viewer Engine...');
      const DOM = (global.EyeKartDOMMap && global.EyeKartDOMMap.productStudio) || {};

      // 1. Detect WebGL support in browser
      this._checkWebGLSupport();

      // 2. Parse SKU from URL or store with fallback to EK-902
      let activeSku = 'EK-902';
      let hasUrlSku = false;
      let activeVariant = null;
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const urlSku = params.get('sku');
        if (urlSku) {
          activeSku = urlSku.replace(/[^A-Za-z0-9\-_]/g, '').trim() || 'EK-902';
          hasUrlSku = true;
        }
        const urlVariant = params.get('variant');
        if (urlVariant) {
          activeVariant = decodeURIComponent(urlVariant).trim();
        }
      }
      if (!hasUrlSku && global.EyeKartStore) {
        activeSku = global.EyeKartStore.getSelectedSku() || 'EK-902';
      }
      if (!activeVariant && global.EyeKartStore) {
        activeVariant = global.EyeKartStore.getActiveVariant();
      }

      // Resolve frame from catalog
      const frameData = global.CatalogService ? global.CatalogService.getBySku(activeSku) : null;
      if (frameData && global.EyeKartStore) {
        global.EyeKartStore.setSelectedSku(frameData.sku);
        const variantMatches = frameData.variants && frameData.variants.some(v => v.name === activeVariant);
        if (!variantMatches && frameData.variants && frameData.variants.length > 0) {
          activeVariant = frameData.variants[0].name;
        }
        if (activeVariant) {
          global.EyeKartStore.setActiveVariant(activeVariant);
        }
      }

      // 3. Bind standard DOM data (titles, pricing, micro-metrics, fit modal)
      this._bindSkuData(frameData);
      this._bindColorwayButtons(frameData, DOM);
      this._bindAngleButtons(DOM);
      this._bindLightingButtons(DOM);
      this._bindBlueprintButtons(DOM);
      this._bindActionButtons(frameData, DOM);

      // 4. Initialize WebGL 3D Viewer if on 3D Studio page
      const viewerStage = document.getElementById('viewerStage');
      if (viewerStage && this.webglSupported) {
        try {
          await this._loadThreeDependencies();
          if (this.isThreeReady) {
            this._initThreeScene(viewerStage);
            await this._loadFrameModel(frameData);
          }
        } catch (err) {
          console.warn('[EyeKart 3D Studio] WebGL initialization failed, maintaining 2D fallback:', err);
          this.classification = '2D / CSS PRODUCT ROTATION FALLBACK';
        }
      } else if (!this.webglSupported) {
        this.classification = '2D / CSS PRODUCT ROTATION FALLBACK';
      }
    }

    _checkWebGLSupport() {
      try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        this.webglSupported = !!(window.WebGLRenderingContext && gl);
      } catch (e) {
        this.webglSupported = false;
      }
    }

    _loadThreeDependencies() {
      if (typeof window.THREE !== 'undefined' && typeof window.THREE.OrbitControls !== 'undefined' && typeof window.THREE.GLTFLoader !== 'undefined') {
        this.isThreeReady = true;
        return Promise.resolve(true);
      }

      return new Promise((resolve) => {
        const loadScript = (src) => {
          return new Promise((res) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => res(true);
            s.onerror = () => {
              console.warn(`[EyeKart 3D Studio] Failed to load 3D dependency: ${src}`);
              res(false);
            };
            document.head.appendChild(s);
          });
        };

        // Sequential dependency loading
        loadScript('/assets/vendor/three.min.js')
          .then((threeOk) => {
            if (!threeOk || typeof window.THREE === 'undefined') return false;
            return Promise.all([
              loadScript('/assets/vendor/OrbitControls.js'),
              loadScript('/assets/vendor/GLTFLoader.js')
            ]);
          })
          .then(() => {
            this.isThreeReady = typeof window.THREE !== 'undefined';
            resolve(this.isThreeReady);
          })
          .catch(() => {
            this.isThreeReady = false;
            resolve(false);
          });
      });
    }

    _initThreeScene(stageContainer) {
      if (!this.isThreeReady || typeof window.THREE === 'undefined') return;

      const displayContainer = document.getElementById('frameDisplayContainer') || document.getElementById('rotationArea') || stageContainer;

      // Ensure canvas element exists non-destructively
      let canvas = document.getElementById('three-viewer-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'three-viewer-canvas';
        canvas.className = 'absolute inset-0 w-full h-full pointer-events-auto';
        canvas.style.display = 'none'; // Hidden until verified 3D model is loaded
        canvas.style.zIndex = '5';
        displayContainer.appendChild(canvas);
      }

      const THREE = window.THREE;
      const width = displayContainer.clientWidth || 600;
      const height = displayContainer.clientHeight || 400;

      // 1. Scene
      this.scene = new THREE.Scene();

      // 2. Camera
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.set(0, 0, 4.5);

      // 3. Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      // 4. Lighting Rig (Presets: Studio, Golden, Clinical)
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      this.scene.add(this.ambientLight);

      this.keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
      this.keyLight.position.set(5, 8, 10);
      this.scene.add(this.keyLight);

      this.fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
      this.fillLight.position.set(-5, -2, -5);
      this.scene.add(this.fillLight);

      this.setLightingPreset(this.currentLighting);

      // 5. OrbitControls
      if (typeof THREE.OrbitControls !== 'undefined') {
        this.controls = new THREE.OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.3;
        this.controls.minPolarAngle = Math.PI / 6;
        this.controls.minDistance = 1.2;
        this.controls.maxDistance = 8.0;
        this.controls.enablePan = false;
      }

      // 6. Responsive Resize Observer
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (!this.renderer || !this.camera) return;
          const w = displayContainer.clientWidth || 600;
          const h = displayContainer.clientHeight || 400;
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(w, h);
        });
        ro.observe(displayContainer);
      }

      // 7. Render Loop
      const animate = () => {
        this.animationFrameId = requestAnimationFrame(animate);
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      };
      animate();
    }

    async _loadFrameModel(frame) {
      if (!frame || !this.scene) {
        this.classification = 'WEBGL 3D VIEWER — ASSET REQUIRED';
        return;
      }

      const modelUrl = frame.asset3D && frame.asset3D.modelUrl ? frame.asset3D.modelUrl : null;
      if (!modelUrl) {
        this._activateAssetRequiredFallback(frame, 'No modelUrl defined in product catalog');
        return;
      }

      // Test whether model file actually exists (prevents silent 404 acceptance)
      try {
        const check = await fetch(modelUrl, { method: 'HEAD' });
        if (!check.ok) {
          this._activateAssetRequiredFallback(frame, `HTTP ${check.status} (File not found on server)`);
          return;
        }

        // If file exists, load via GLTFLoader
        if (typeof window.THREE.GLTFLoader === 'undefined') {
          this._activateAssetRequiredFallback(frame, 'GLTFLoader not available');
          return;
        }

        const loader = new window.THREE.GLTFLoader();
        loader.load(
          modelUrl,
          (gltf) => {
            // Validate geometry and mesh existence
            let meshCount = 0;
            gltf.scene.traverse((child) => {
              if (child.isMesh && child.geometry) {
                meshCount++;
              }
            });

            const box = new window.THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new window.THREE.Vector3());

            if (meshCount === 0 || box.isEmpty() || size.length() === 0) {
              this._activateAssetRequiredFallback(frame, 'Loaded 3D asset contains zero valid mesh geometry');
              return;
            }

            // Real 3D model validated successfully!
            if (this.currentModel) this.scene.remove(this.currentModel);
            this.currentModel = gltf.scene;

            // Center model
            const center = box.getCenter(new window.THREE.Vector3());
            this.currentModel.position.sub(center);
            this.scene.add(this.currentModel);

            this.hasLoaded3DModel = true;
            this.classification = 'REAL WEBGL 3D PRODUCT VIEWER';

            // Reveal WebGL canvas, suppress 2D image
            const canvas = document.getElementById('three-viewer-canvas');
            const mainImg = document.getElementById('mainFrameImage');
            if (canvas) canvas.style.display = 'block';
            if (mainImg) mainImg.style.display = 'none';

            console.info(`[EyeKart 3D Studio] Real WebGL 3D Model loaded successfully for ${frame.sku} (${meshCount} meshes). Classification: REAL WEBGL 3D PRODUCT VIEWER`);
          },
          undefined,
          (err) => {
            this._activateAssetRequiredFallback(frame, `GLTF parse error: ${err.message}`);
          }
        );
      } catch (err) {
        this._activateAssetRequiredFallback(frame, `Network fetch failed: ${err.message}`);
      }
    }

    _activateAssetRequiredFallback(frame, reason) {
      const canvas = document.getElementById('three-viewer-canvas');
      const mainImg = document.getElementById('mainFrameImage');
      const THREE = window.THREE;

      // If Three.js and ProceduralEyewearModel are available, mount procedural 3D model!
      if (this.scene && THREE && global.ProceduralEyewearModel) {
        if (this.currentModel) this.scene.remove(this.currentModel);

        const initialVariant = global.EyeKartStore ? global.EyeKartStore.getActiveVariant() : 'Obsidian Black';
        const initialColor = this._resolveVariantHex(initialVariant);
        this.currentModel = global.ProceduralEyewearModel.create(THREE, initialColor);
        this.currentModel.scale.set(1.4, 1.4, 1.4);
        this.scene.add(this.currentModel);

        this.hasLoaded3DModel = true;
        this.classification = 'INTERACTIVE PROCEDURAL 3D DEMO — GLB PIPELINE READY';

        if (canvas) canvas.style.display = 'block';
        if (mainImg) mainImg.style.display = 'none';

        this._mountStudioStatusBadge('Procedural 3D Model • Real GLB Pipeline Ready');
        console.info(`[EyeKart 3D Studio] Verified GLB file not found (${reason}). Procedural 3D Eyewear loaded. Classification: INTERACTIVE PROCEDURAL 3D DEMO`);
        return;
      }

      this.hasLoaded3DModel = false;
      this.classification = 'WEBGL 3D VIEWER — ASSET REQUIRED';

      // Keep canvas hidden, ensure 2D photographic display is active
      if (canvas) canvas.style.display = 'none';
      if (mainImg) {
        mainImg.style.display = 'block';
        mainImg.style.opacity = '1';
      }

      console.info(`[EyeKart 3D Studio] WebGL viewer architecture initialized. Verified 3D GLB asset for ${frame ? frame.sku : 'EK-902'} is unavailable (${reason}). Active Classification: WEBGL 3D VIEWER — ASSET REQUIRED. 2D photographic fallback preserved.`);
    }

    _resolveVariantHex(name) {
      const map = {
        'Obsidian Black': 0x202224,
        'Matte Obsidian Black': 0x202224,
        'Brushed Champagne Titanium': 0xE5D7B7,
        'Champagne Gold': 0xE5C158,
        'Raw Brushed Platinum': 0xD1D5DB,
        'Matte Platinum': 0xD5D8DC,
        'Havana Tortoise': 0x6B3E11,
        'Havana Tortoise & Rose Titanium': 0x6B3E11,
        'Forest Acacia': 0x1B4332,
        'Midnight Navy': 0x1E293B
      };
      return map[name] || 0x202224;
    }

    _mountStudioStatusBadge(text) {
      const container = document.getElementById('rotationArea') || document.getElementById('viewerStage');
      if (!container) return;
      let badge = document.getElementById('studio-3d-status-pill');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'studio-3d-status-pill';
        badge.className = 'absolute top-3 right-3 z-20 eyekart-status-pill shadow-sm';
        container.appendChild(badge);
      }
      badge.innerHTML = `<span class="material-symbols-outlined text-[13px] text-cyan-accent">tune</span><span>${text}</span>`;
    }

    setLightingPreset(preset) {
      this.currentLighting = preset;
      if (!this.keyLight || !this.ambientLight) return;

      const THREE = window.THREE;
      if (!THREE) return;

      if (preset === 'studio') {
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 1.2;
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.9;
      } else if (preset === 'golden') {
        this.keyLight.color.setHex(0xffe0b2);
        this.keyLight.intensity = 1.35;
        this.ambientLight.color.setHex(0xfff3e0);
        this.ambientLight.intensity = 0.95;
      } else if (preset === 'clinical') {
        this.keyLight.color.setHex(0xe8f4ff);
        this.keyLight.intensity = 1.25;
        this.ambientLight.color.setHex(0xf0f8ff);
        this.ambientLight.intensity = 0.85;
      }
    }

    setAngle(angle) {
      this.currentAngle = angle;

      // 1. If real 3D model is active in scene, orbit camera around model
      if (this.hasLoaded3DModel && this.camera) {
        const rad = (angle * Math.PI) / 180;
        const radius = 4.5;
        this.camera.position.x = radius * Math.sin(rad);
        this.camera.position.z = radius * Math.cos(rad);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.update();
      } else {
        // 2. Fallback / Asset Required: Apply smooth 2D CSS rotation transform
        const targetCanvas = document.getElementById('mainFrameImage') || document.querySelector('#viewerStage img');
        if (targetCanvas) {
          targetCanvas.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
          targetCanvas.style.transform = `rotateY(${angle}deg)`;
        }
      }

      const hudAngle = document.getElementById('rotationAngleDisplay');
      if (hudAngle) {
        hudAngle.textContent = `ROTATION: ${angle}° VIEW`;
      }
    }

    _bindSkuData(frame) {
      if (!frame) return;

      // EK-902 SOURCE CONFLICT SAFEGUARD:
      // If activeSku is EK-902 and the page is the native Stitch 3D studio, preserve the
      // approved frozen Stitch HTML (which natively displays promotional KSh 14,800 and compare-at KSh 17,500).
      if (frame.sku === 'EK-902') {
        const nativeH1 = document.querySelector('h1');
        if (nativeH1 && nativeH1.textContent.includes('Hexagonal')) {
          return;
        }
      }

      // 1. Dynamic Title
      const titleEl = document.querySelector('h1, #active-frame-title');
      if (titleEl) {
        titleEl.textContent = frame.name;
      }

      // 2. Dynamic Series / SKU Badge
      const badgeEls = Array.from(document.querySelectorAll('span')).filter(el => 
        el.textContent.includes('EYEKART ATELIER') && (el.textContent.includes('EK-') || el.textContent.includes('SERIES'))
      );
      badgeEls.forEach(el => {
        el.textContent = `EYEKART ATELIER • ${frame.collection || 'NAIROBI PRECISION'} ${frame.sku}`;
      });

      // 3. Price Display
      const priceEls = document.querySelectorAll('.price-tag, [data-price-display], .font-display-lg');
      priceEls.forEach(el => {
        if (el.textContent.includes('KSh') || el.classList.contains('price-tag')) {
          el.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(frame.price) : `KSh ${Number(frame.price).toLocaleString('en-KE')}`;
        }
      });

      // 4. Compare At Price
      if (frame.compareAtPrice) {
        const compareEls = Array.from(document.querySelectorAll('span, p, del')).filter(el => 
          el.textContent.includes('KSh') && (el.textContent.includes('17,') || el.classList.contains('line-through') || el.closest('.line-through'))
        );
        compareEls.forEach(el => {
          el.textContent = `KSh ${Number(frame.compareAtPrice).toLocaleString('en-KE')}`;
        });
      }

      // 5. Material / Finish Badges
      const materialBadges = Array.from(document.querySelectorAll('span')).filter(el => 
        el.textContent.includes('Beta-Ti') || el.textContent.includes('Titanium') || el.textContent.includes('Acetate') || el.textContent.includes('Polymer')
      );
      materialBadges.forEach(el => {
        if (el.classList.contains('rounded')) {
          el.textContent = frame.material.length > 25 ? frame.material.slice(0, 22) + '...' : frame.material;
        }
      });

      // 6. Main Image for 2D Fallback
      const mainImg = document.getElementById('mainFrameImage') || document.querySelector('#viewerStage img');
      if (mainImg && frame.gallery && frame.gallery[0]) {
        mainImg.src = frame.gallery[0];
        mainImg.alt = `${frame.sku} ${frame.name}`;
      }

      // 7. Dynamic Metric Cells (Width, Bridge, Temple, Weight)
      const metricBoxes = document.querySelectorAll('.grid-cols-4 .bg-surface.p-2.rounded, .grid-cols-4 .bg-surface');
      metricBoxes.forEach(box => {
        const label = box.querySelector('.font-label-sm')?.textContent?.trim() || '';
        const valEl = box.querySelector('.font-data-metric');
        if (!valEl) return;
        if (label.includes('Lens Width')) {
          valEl.textContent = `${frame.lensWidth} mm`;
        } else if (label.includes('Bridge')) {
          valEl.textContent = `${frame.bridge} mm`;
        } else if (label.includes('Temple')) {
          valEl.textContent = `${frame.temple} mm`;
        } else if (label.includes('Weight')) {
          valEl.textContent = frame.weight;
        }
      });

      // 8. Micro-Schematic Blueprint Vector SVG
      const blueprintSvg = document.querySelector('svg[viewbox="0 0 300 120"], svg[viewBox="0 0 300 120"], .bg-surface-cream svg');
      if (blueprintSvg) {
        const svgTexts = blueprintSvg.querySelectorAll('text');
        svgTexts.forEach(txt => {
          const fill = txt.getAttribute('fill');
          if (fill === '#006781') {
            txt.textContent = `${frame.lensWidth} mm`;
          } else if (fill === '#00A859') {
            txt.textContent = `${frame.bridge} mm`;
          } else if (fill === '#DC2626') {
            txt.textContent = `${frame.lensHeight} mm`;
          }
        });
      }

      // Blueprint table rows below SVG
      const totalWidth = frame.frameTotalWidth || (frame.lensWidth * 2 + frame.bridge + 16);
      const bpSpecs = document.querySelectorAll('.border-b.border-outline-variant\\/20, .flex.justify-between.py-1');
      bpSpecs.forEach(spec => {
        const spanLabel = spec.querySelector('.text-on-surface-variant')?.textContent?.trim() || '';
        const boldVal = spec.querySelector('.font-bold');
        if (!boldVal) return;
        if (spanLabel.includes('Pantoscopic')) {
          boldVal.textContent = frame.pantoscopicAngle ? `${frame.pantoscopicAngle} (Calibrated for screen & distance)` : '8.5° (Calibrated for screen & distance)';
        } else if (spanLabel.includes('Base Curve')) {
          boldVal.textContent = frame.baseCurve ? `${frame.baseCurve} Low-Curvature Planar` : '4.0 Low-Curvature Planar';
        } else if (spanLabel.includes('Total Width')) {
          boldVal.textContent = `${totalWidth} mm`;
        }
      });

      // 9. Face Fit Measurement Modal (#fitModal)
      const fitModal = document.getElementById('fitModal');
      if (fitModal) {
        const fitTitle = fitModal.querySelector('h3.font-title-md');
        if (fitTitle) {
          fitTitle.textContent = `Facial Fit Guide • ${frame.name} (${totalWidth}mm Width)`;
        }

        const monoDim = fitModal.querySelector('.font-mono');
        if (monoDim) {
          monoDim.textContent = `${frame.lensWidth} ▢ ${frame.bridge} ${frame.temple}`;
        }

        const fitP = fitModal.querySelector('.p-3\\.5 p, p');
        if (fitP && fitP.textContent.includes('impeccable fit')) {
          fitP.innerHTML = `Look at the inner temple arm of your existing comfortable eyeglasses. You will see numbers such as <span class="font-mono font-bold text-primary">${frame.lensWidth} ▢ ${frame.bridge} ${frame.temple}</span>. If your numbers are within 2mm of this frame, the ${frame.sku} will provide an impeccable fit.`;
        }

        if (frame.recommendedFaceShapes && Array.isArray(frame.recommendedFaceShapes) && frame.recommendedFaceShapes.length > 0) {
          const shapesGrid = fitModal.querySelector('.grid.grid-cols-3');
          if (shapesGrid) {
            shapesGrid.innerHTML = frame.recommendedFaceShapes.map(shape => `
              <div class="p-2.5 bg-surface rounded-lg">
                <span class="font-data-metric text-data-metric text-secondary block capitalize">${shape}</span>
                <span class="font-label-sm text-[10px] text-on-surface-variant">Recommended Fit</span>
              </div>
            `).join('');
          }
        }
      }
    }

    _bindColorwayButtons(frame, dom) {
      const origSetColorway = global.setColorway;
      global.setColorway = (colorName, btn) => {
        if (typeof origSetColorway === 'function') {
          origSetColorway(colorName, btn);
        } else {
          const nameEl = document.getElementById('selectedColorName');
          if (nameEl) nameEl.textContent = colorName;
          document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('ring-2', 'ring-primary'));
          if (btn) btn.classList.add('ring-2', 'ring-primary');
        }
        if (global.EyeKartStore) {
          global.EyeKartStore.setActiveVariant(colorName);
        }
        if (this.currentModel && typeof this.currentModel.updateFinishColor === 'function') {
          this.currentModel.updateFinishColor(this._resolveVariantHex(colorName));
        }
      };

      const colorBtns = document.querySelectorAll(dom.colorButtons || '.color-btn');
      colorBtns.forEach(btn => {
        if (btn.__eyekart_bound) return;
        btn.__eyekart_bound = true;
        btn.addEventListener('click', () => {
          const match = btn.getAttribute('onclick')?.match(/setColorway\s*\(\s*['"]([^'"]+)['"]/);
          const colorName = match ? match[1] : (btn.getAttribute('data-color') || btn.getAttribute('title'));
          if (colorName && global.EyeKartStore) {
            global.EyeKartStore.setActiveVariant(colorName);
          }
          if (colorName && this.currentModel && typeof this.currentModel.updateFinishColor === 'function') {
            this.currentModel.updateFinishColor(this._resolveVariantHex(colorName));
          }
        });
      });

      const activeVariant = global.EyeKartStore ? global.EyeKartStore.getActiveVariant() : null;
      if (activeVariant) {
        const nameEl = document.getElementById('selectedColorName');
        if (nameEl) nameEl.textContent = activeVariant;
        colorBtns.forEach(btn => {
          const match = btn.getAttribute('onclick')?.match(/setColorway\s*\(\s*['"]([^'"]+)['"]/);
          if (match && match[1] === activeVariant) {
            btn.classList.add('ring-2', 'ring-primary');
          }
        });
      }
    }

    _bindAngleButtons(dom) {
      const origSwitchAngle = global.switchAngle;
      global.switchAngle = (type, degrees, btn) => {
        this.setAngle(degrees);
        if (typeof origSwitchAngle === 'function') {
          origSwitchAngle(type, degrees, btn);
        }
      };

      const angleButtons = document.querySelectorAll(dom.angleButtons || 'button[onclick*="switchAngle"]');
      angleButtons.forEach(btn => {
        if (btn.__eyekart_bound) return;
        btn.__eyekart_bound = true;
        btn.addEventListener('click', () => {
          const match = btn.getAttribute('onclick')?.match(/switchAngle\s*\(\s*['"]([^'"]+)['"]\s*,\s*([0-9]+)/);
          if (match) {
            this.setAngle(parseInt(match[2], 10));
          }
        });
      });
    }

    _bindLightingButtons(dom) {
      const origSetStudioLight = global.setStudioLight;
      global.setStudioLight = (preset) => {
        this.setLightingPreset(preset);
        if (typeof origSetStudioLight === 'function') {
          origSetStudioLight(preset);
        }
      };

      const lights = [
        { btn: document.querySelector(dom.lightStudio || '#lightStudio'), mode: 'studio' },
        { btn: document.querySelector(dom.lightGolden || '#lightGolden'), mode: 'golden' },
        { btn: document.querySelector(dom.lightClinical || '#lightClinical'), mode: 'clinical' }
      ];

      lights.forEach(({ btn, mode }) => {
        if (btn && !btn.__eyekart_bound) {
          btn.__eyekart_bound = true;
          btn.addEventListener('click', () => {
            this.setLightingPreset(mode);
          });
        }
      });
    }

    _bindBlueprintButtons(dom) {
      const bpBtn = document.querySelector(dom.blueprintBtn || '#blueprintBtn');
      const bpOverlay = document.querySelector(dom.blueprintOverlay || '#blueprintReticle');

      if (bpBtn && !bpBtn.__eyekart_bound) {
        bpBtn.__eyekart_bound = true;
        bpBtn.addEventListener('click', () => {
          this.isBlueprintActive = !this.isBlueprintActive;
          if (bpOverlay) {
            bpOverlay.classList.toggle('hidden', !this.isBlueprintActive);
          }
        });
      }
    }

    _bindActionButtons(frame, dom) {
      const configLinks = document.querySelectorAll(dom.configureLensLink || 'main a[data-path="lens-customizer"], a[data-path="lens-customizer"]');
      configLinks.forEach(configLink => {
        if (configLink.__eyekart_studio_lens_bound) return;
        configLink.__eyekart_studio_lens_bound = true;
        configLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const sku = frame ? frame.sku : (global.EyeKartStore ? global.EyeKartStore.getSelectedSku() : 'EK-902');
          const variant = global.EyeKartStore ? global.EyeKartStore.getActiveVariant() : (document.getElementById('selectedColorName')?.textContent?.trim() || '');
          let query = `sku=${encodeURIComponent(sku)}`;
          if (variant) query += `&variant=${encodeURIComponent(variant)}`;
          if (global.EyeKartRouter) {
            global.EyeKartRouter.navigate('lens-customizer', query);
          }
        }, true);
      });

      const handleBuyFrameOnly = () => {
        if (global.EyeKartStore) {
          const currentSku = global.EyeKartStore.getSelectedSku() || (frame ? frame.sku : 'EK-902');
          const activeFrame = (frame && frame.sku === currentSku) ? frame : (global.CatalogService?.getBySku(currentSku) || frame);
          if (activeFrame) {
            const currentVariant = global.EyeKartStore.getActiveVariant() || 
              (document.getElementById('selectedColorName')?.textContent?.trim()) || 
              (activeFrame.variants && activeFrame.variants[0]?.name) || 
              "Standard Frame Only";

            const price = activeFrame.price;

            global.EyeKartStore.addCartItem({
              sku: activeFrame.sku,
              name: activeFrame.name,
              variant: currentVariant,
              lensConfig: null,
              framePrice: price,
              totalPrice: price,
              qty: 1
            });
            if (global.EyeKartStore.showToast) {
              global.EyeKartStore.showToast(`Frame only (${activeFrame.sku} • ${currentVariant}) added to Optical Bag`, 'shopping_bag');
            }
          }
        }
      };

      global.buyFrameOnly = handleBuyFrameOnly;

      const buyFrameBtns = document.querySelectorAll(dom.buyFrameOnlyButton || 'button[onclick*="buyFrameOnly"]');
      buyFrameBtns.forEach(buyFrameBtn => {
        if (buyFrameBtn.__eyekart_studio_buy_bound) return;
        buyFrameBtn.__eyekart_studio_buy_bound = true;
        buyFrameBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          handleBuyFrameOnly();
        }, true);
      });
    }
  }

  const studioInstance = new Studio3D();
  global.EyeKart3DStudio = studioInstance;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
