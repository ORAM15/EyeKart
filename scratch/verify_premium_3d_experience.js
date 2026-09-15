/**
 * EyeKart Premium 3D Visual Experience Upgrade CDP Verification Suite
 * Uses native Microsoft Edge with Chrome DevTools Protocol (CDP) and WebSocket
 */
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9288;
const PROFILE_DIR = path.join(os.tmpdir(), 'edge_verify_3d_' + Date.now());

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.msgId = 1;
    this.callbacks = new Map();
    this.consoleErrors = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        if (!text.includes('getUserMedia') &&
            !text.includes('Permission') &&
            !text.includes('NotFoundError') &&
            !text.includes('TensorFlow Lite') &&
            !text.includes('XNNPACK delegate')) {
          this.consoleErrors.push(text);
        }
      }
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        cb(msg);
      }
    };

    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const payload = JSON.stringify({ id, method, params });
      this.callbacks.set(id, (msg) => {
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      });
      this.ws.send(payload);
    });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await sleep(1500);
  }

  async evaluate(codeOrExpr) {
    const trimmed = codeOrExpr.trim();
    const res = await this.send('Runtime.evaluate', {
      expression: trimmed,
      returnByValue: true,
      awaitPromise: true
    });
    if (res && res.exceptionDetails) {
      console.error('CDP Eval Exception:', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
      return null;
    }
    return res && res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

async function main() {
  console.log('========================================================================');
  console.log('  EYEKART PREMIUM 3D VISUAL EXPERIENCE — CDP BROWSER VERIFICATION');
  console.log('========================================================================\n');

  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const edgeProcess = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  await sleep(1800);

  let versionInfo;
  try {
    versionInfo = await httpGetJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  } catch (err) {
    console.error('Failed to connect to Edge debug port:', err);
    process.exit(1);
  }

  const targets = await httpGetJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('edge:') && !t.url.startsWith('chrome-extension:')) || targets[0];
  const cdp = new CdpConnection(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  const results = [];
  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${title} ${extra}`);
      results.push({ title, status: 'PASS', extra });
    } else {
      console.error(`  ✗ [FAIL] ${title} ${extra}`);
      results.push({ title, status: 'FAIL', extra });
    }
  }

  try {
    // ----------------------------------------------------------------------
    // JOURNEY 1: Homepage Cinematic 3D Environment & Scroll Choreography
    // ----------------------------------------------------------------------
    console.log('[1/4] Auditing Homepage 3D WebGL Canvas & Procedural Eyewear...');
    await cdp.navigate('http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html');

    // Wait until 3D engine completes initialization
    await cdp.evaluate(`
      new Promise((resolve) => {
        if (window.EyeKartCinematic3D && window.EyeKartCinematic3D.isInitialized) return resolve(true);
        const iv = setInterval(() => {
          if (window.EyeKartCinematic3D && window.EyeKartCinematic3D.isInitialized) {
            clearInterval(iv);
            resolve(true);
          }
        }, 100);
        setTimeout(() => { clearInterval(iv); resolve(false); }, 4000);
      })
    `);

    const canvasMounted = await cdp.evaluate(`
      (function() {
        const c = document.getElementById('hero-3d-webgl-canvas');
        return !!c && c.tagName === 'CANVAS';
      })()
    `);
    assert('Hero WebGL Canvas Mounted', canvasMounted, '#hero-3d-webgl-canvas present');

    const engineInfo = await cdp.evaluate(`
      (function() {
        const e = window.EyeKartCinematic3D;
        if (!e) return { exists: false };
        return {
          exists: true,
          initialized: e.isInitialized,
          hasScene: !!e.scene,
          hasCamera: !!e.camera,
          hasModel: !!e.frameModel,
          isProcedural: e.frameModel?.userData?.isProcedural === true
        };
      })()
    `);
    assert('EyeKartCinematic3D Engine Initialized', engineInfo && engineInfo.exists && engineInfo.initialized, 'Scene + Camera + Render loop operational');
    assert('Procedural Luxury Eyewear Model Active', engineInfo && engineInfo.hasModel && engineInfo.isProcedural, 'Titanium rims, bridge filigree & refractive lenses');

    const badgeText = await cdp.evaluate(`
      document.getElementById('hero-3d-status-badge')?.textContent.trim() || ''
    `);
    assert('Honest 3D Model Status Pill Visible', badgeText.includes('Interactive 3D'), `"${badgeText}"`);

    // Test Swatch 3D colorway sync
    const initialHex = await cdp.evaluate(`
      window.EyeKartCinematic3D.frameModel?.userData?.titaniumMaterial?.color?.getHex()
    `);
    await cdp.evaluate(`
      document.querySelector('.swatch-btn[data-finish="Brushed Savannah Gold"]')?.click()
    `);
    await sleep(200);
    const updatedHex = await cdp.evaluate(`
      window.EyeKartCinematic3D.frameModel?.userData?.titaniumMaterial?.color?.getHex()
    `);
    assert('Swatch Real-Time 3D Material Sync', updatedHex === 0xD4AF37, `Obsidian (0x${initialHex ? initialHex.toString(16) : '?'}) -> Gold (0x${updatedHex ? updatedHex.toString(16) : '?'})`);

    // Test Lighting Toggle
    const initLighting = await cdp.evaluate(`document.getElementById('hero-lighting-tag')?.textContent`);
    await cdp.evaluate(`document.getElementById('btn-lighting-toggle')?.click()`);
    const newLighting = await cdp.evaluate(`document.getElementById('hero-lighting-tag')?.textContent`);
    assert('Lighting Preset Switching Operates', initLighting !== newLighting, `Active: ${newLighting}`);

    // Test Scroll Choreography
    await cdp.evaluate(`window.scrollTo(0, 900)`);
    await sleep(900);
    const scrollState = await cdp.evaluate(`
      (function() {
        return {
          scrollY: window.scrollY,
          targetP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.targetScrollProgress : 0,
          lerpedP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.scrollProgress : 0
        };
      })()
    `);
    assert('5-Phase Scroll Choreography Responds to Scroll', scrollState.targetP > 0.4 && scrollState.lerpedP > 0.3, `Target: ${(scrollState.targetP * 100).toFixed(1)}% | Lerped: ${(scrollState.lerpedP * 100).toFixed(1)}%`);

    await cdp.evaluate(`window.scrollTo(0, 0)`);
    await sleep(900);
    const restoredScrollState = await cdp.evaluate(`
      (function() {
        return {
          scrollY: window.scrollY,
          targetP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.targetScrollProgress : 0,
          lerpedP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.scrollProgress : 0
        };
      })()
    `);
    assert('Reversible Scroll Animation Returns to Frontal Pose', restoredScrollState.targetP === 0 && restoredScrollState.lerpedP < 0.1, `Restored to Target: 0.0% | Lerped: ${(restoredScrollState.lerpedP * 100).toFixed(1)}%`);

    // 3D Tilt on Product Cards
    const tiltCardsCount = await cdp.evaluate(`
      document.querySelectorAll('.eyekart-tilt-card').length
    `);
    const sheenCount = await cdp.evaluate(`
      document.querySelectorAll('.eyekart-card-sheen').length
    `);
    assert('Product Card 3D Tilt & Specular Sheen Attached', tiltCardsCount >= 4 && sheenCount >= 4, `${tiltCardsCount} cards upgraded with 3D tilt`);

    // ----------------------------------------------------------------------
    // JOURNEY 2: 3D Product Detail Studio Upgrade
    // ----------------------------------------------------------------------
    console.log('\n[2/4] Auditing 3D Product Detail Studio...');
    await cdp.navigate('http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_3d_product_detail_studio/code.html');

    const studioStatus = await cdp.evaluate(`
      (function() {
        const s = window.EyeKart3DStudio;
        if (!s) return { exists: false };
        return {
          exists: true,
          hasModel: !!s.currentModel,
          classification: s.classification,
          hasControls: !!s.controls,
          badgeText: document.getElementById('studio-3d-status-pill')?.textContent.trim() || ''
        };
      })()
    `);
    assert('3D Studio Renders Procedural Eyewear in WebGL', studioStatus.hasModel, `Classification: ${studioStatus.classification}`);
    assert('3D Studio OrbitControls Active', studioStatus.hasControls, 'Smooth 360° orbit, pitch & zoom');
    assert('Honest 3D Studio Badge Displayed', studioStatus.badgeText.includes('Procedural 3D Model'), `"${studioStatus.badgeText}"`);

    // Angle buttons orbit camera
    await cdp.evaluate(`window.switchAngle('perspective', 45, null)`);
    await sleep(200);
    const camX = await cdp.evaluate(`window.EyeKart3DStudio?.camera?.position?.x || 0`);
    assert('Studio Angle Buttons Orbit Three.js Camera', Math.abs(camX) > 0.5, `Camera X: ${camX.toFixed(2)}`);

    // Colorway swatches update studio 3D model
    await cdp.evaluate(`
      const swatch = document.querySelector('.color-btn[onclick*="Champagne"]');
      if (swatch) swatch.click();
    `);
    await sleep(200);
    const studioModelColor = await cdp.evaluate(`
      window.EyeKart3DStudio.currentModel?.userData?.titaniumMaterial?.color?.getHex()
    `);
    assert('Studio Colorway Swatch Syncs with 3D Finish', studioModelColor === 0xE5C158 || studioModelColor === 0xE5D7B7, `Color: 0x${studioModelColor.toString(16)}`);

    // ----------------------------------------------------------------------
    // JOURNEY 3: Virtual Try-On (VTO) Presentation
    // ----------------------------------------------------------------------
    console.log('\n[3/4] Auditing Virtual Try-On (VTO) Presentation...');
    await cdp.navigate('http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_live_camera_virtual_try_on_vto_studio/code.html');

    const vtoInfo = await cdp.evaluate(`
      (function() {
        const v = window.EyeKartVTO;
        if (!v) return { exists: false };
        return {
          exists: true,
          hasOverlay: !!v.overlayCanvas,
          hasFlash: !!document.getElementById('vto-snapshot-flash'),
          activeSku: v.activeSku
        };
      })()
    `);
    assert('VTO Dynamic Eyewear Overlay Canvas Active', vtoInfo.hasOverlay, 'MediaPipe real-time alignment pipeline');
    assert('VTO Shutter Flash Element Mounted', vtoInfo.hasFlash, '#vto-snapshot-flash ready for photo capture');

    // ----------------------------------------------------------------------
    // JOURNEY 4: Core Commerce & Console Health
    // ----------------------------------------------------------------------
    console.log('\n[4/4] Auditing Core Commerce & Console Health...');
    await cdp.navigate('http://127.0.0.1:3000/');

    // Test Cart addition using authentic addCartItem
    const countBefore = await cdp.evaluate(`window.EyeKartStore?.getCartCount() || 0`);
    await cdp.evaluate(`
      window.EyeKartStore?.addCartItem({ sku: 'EK-804', framePrice: 13800, name: 'The Westlands Octagonal' })
    `);
    const countAfter = await cdp.evaluate(`window.EyeKartStore?.getCartCount() || 0`);
    assert('Core Commerce Cart Addition Functional', countAfter === countBefore + 1, `Cart count: ${countBefore} -> ${countAfter}`);

    // Check Console Errors
    const errors = cdp.consoleErrors;
    assert('Zero Fatal Console Errors', errors.length === 0, errors.length > 0 ? `Errors: ${errors.join(', ')}` : 'Clean console log');

  } catch (err) {
    console.error('CDP Audit Execution Error:', err);
  } finally {
    cdp.close();
    edgeProcess.kill();
    try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log('\n========================================================================');
  console.log(`CDP VERIFICATION SUMMARY: ${passed}/${total} ASSERTIONS PASSED`);
  console.log('========================================================================');

  process.exit(passed === total ? 0 : 1);
}

main();
