/* EyeKart collection try-on (Lens2Cart-standard rebuild).
 *
 * Lens2Cart's best try-on idea is not its live camera — it is the
 * collection flow: one face photo, previewed across the whole catalog,
 * with the photo staying in the browser. EyeKart can do that with its
 * own engine, no third-party widget: the VTO singleton already draws
 * per-SKU frames from face landmarks (_drawEyewear) and already detects
 * landmarks in still images (detectImage). This module reuses exactly
 * that drawing code — it saves the singleton's live state, sets the
 * still-photo geometry (same eye-midpoint / inter-eye / roll / yaw-proxy
 * formulas as the video loop), draws one canvas per SKU, then restores
 * the singleton untouched. Nothing is uploaded anywhere: the photo is
 * read with FileReader and landmarks run in local WASM.
 */
(function (global) {
  var VTO_PATH = '../eyekart_live_camera_virtual_try_on_vto_studio/code.html';

  function fmt(n) { return 'KSh ' + Number(n).toLocaleString('en-KE'); }

  function el(html) {
    var t = document.createElement('div');
    t.innerHTML = html.trim();
    return t.firstChild;
  }

  /* ---------------- card enhancer: Try On + real-data-only discounts ---- */
  function enhanceCards() {
    var svc = global.CatalogService;
    document.querySelectorAll('[data-sku]').forEach(function (card) {
      if (card.querySelector('.ek-tryon-btn')) return;
      var sku = card.getAttribute('data-sku');
      var prod = svc && svc.getBySku ? svc.getBySku(sku) : null;
      var btnRow = card.querySelector('.grid.grid-cols-2');
      var btn = el('<a class="ek-tryon-btn w-full mt-2 py-2 bg-graphite hover:bg-primary text-on-primary font-label-sm text-label-sm rounded text-center transition-colors block" href="' + VTO_PATH + '?sku=' + encodeURIComponent(sku) + '">Try On</a>');
      if (btnRow && btnRow.parentNode) btnRow.parentNode.insertBefore(btn, btnRow.nextSibling);
      else card.appendChild(btn);
      // Discount ribbon + struck price ONLY when the catalog carries a
      // real compare-at price for this SKU. No invented discounts.
      if (prod && typeof prod.compareAtPrice === 'number' && prod.compareAtPrice > prod.price) {
        var pct = Math.round((1 - prod.price / prod.compareAtPrice) * 100);
        var priceEl = null;
        card.querySelectorAll('span').forEach(function (s) {
          if (!priceEl && s.textContent.indexOf('KSh') !== -1) priceEl = s;
        });
        if (priceEl) {
          var struck = document.createElement('span');
          struck.className = 'font-body-sm text-body-sm text-outline line-through ml-2';
          struck.textContent = fmt(prod.compareAtPrice);
          priceEl.parentNode.insertBefore(struck, priceEl.nextSibling);
        }
        var imgWrap = card.querySelector('.relative');
        if (imgWrap) {
          imgWrap.appendChild(el('<span class="absolute top-3 left-3 bg-red-600 text-white font-label-sm text-label-sm font-bold px-2 py-0.5 rounded">' + pct + '% OFF</span>'));
        }
      }
    });
  }

  /* ---------------- collection photo try-on ---------------- */
  var landmarkerReady = null;
  function ensureLandmarker() {
    if (landmarkerReady) return landmarkerReady;
    landmarkerReady = (async function () {
      var vto = global.EyeKartVTO;
      if (!vto || typeof vto._initMediaPipe !== 'function') throw new Error('VTO engine unavailable');
      await vto._initMediaPipe();
      var waited = 0;
      while (!vto.faceLandmarker && waited < 20000) {
        await new Promise(function (r) { setTimeout(r, 250); });
        waited += 250;
      }
      if (!vto.faceLandmarker) throw new Error('Face model did not load');
      return vto;
    })();
    return landmarkerReady;
  }

  function geometryFromLandmarks(l) {
    // Same formulas as the VTO video loop, on raw normalized coords
    // (no cover-map: there is no camera element in still-photo mode).
    function pt(p) { return p || { x: 0.5, y: 0.5 }; }
    var right = pt(l[468] || { x: (l[33].x + l[133].x) / 2, y: (l[33].y + l[133].y) / 2 });
    var left = pt(l[473] || { x: (l[362].x + l[263].x) / 2, y: (l[362].y + l[263].y) / 2 });
    var eyeMidX = (right.x + left.x) / 2;
    var eyeMidY = (right.y + left.y) / 2;
    var noseX = l[1] ? l[1].x : eyeMidX;
    return { right: right, left: left, eyeMidX: eyeMidX, eyeMidY: eyeMidY, noseX: noseX };
  }

  function drawTile(vto, img, prod, geo, cw) {
    var scale = cw / img.naturalWidth;
    var ch = Math.round(img.naturalHeight * scale);
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    // Still-photo geometry in pixel space.
    var dx = (geo.left.x - geo.right.x) * cw;
    var dy = (geo.left.y - geo.right.y) * ch;
    var interEyeDist = Math.hypot(dx, dy);
    var rollRad = Math.atan2(dy, dx);
    var saved = {
      smoothed: Object.assign({}, vto.smoothed),
      pose: Object.assign({}, vto.pose),
      activeSku: vto.activeSku,
      activeVariant: vto.activeVariant,
      isMirrored: vto.isMirrored,
      isBareFaceActive: vto.isBareFaceActive
    };
    try {
      vto.smoothed = { midX: geo.eyeMidX, midY: geo.eyeMidY, interEyeDist: interEyeDist, rollRad: rollRad, scale: 1.0, initialized: true };
      var eyeSpan = Math.max(1e-6, geo.left.x - geo.right.x);
      vto.pose = { yawRad: 0, pitchRad: 0, rollRad: rollRad, yawProxy: 0, source: 'photo' };
      vto.pose.yawProxy = Math.max(-0.6, Math.min(0.6, (geo.noseX - geo.eyeMidX) / eyeSpan));
      vto.pose.yawRad = vto.pose.yawProxy * 1.15;
      vto.activeSku = prod.sku;
      vto.activeVariant = (prod.variants && prod.variants[0] && prod.variants[0].name) || prod.finish || '';
      vto.isMirrored = false;
      vto.isBareFaceActive = false;
      vto._drawEyewear(ctx, cw, ch);
    } catch (e) {
      /* A single failed frame must not kill the grid. */
    }
    vto.smoothed = saved.smoothed;
    vto.pose = saved.pose;
    vto.activeSku = saved.activeSku;
    vto.activeVariant = saved.activeVariant;
    vto.isMirrored = saved.isMirrored;
    vto.isBareFaceActive = saved.isBareFaceActive;
    return canvas;
  }

  function openModal() {
    var old = document.getElementById('ek-collection-tryon-modal');
    if (old) old.remove();
    var modal = el(
      '<div id="ek-collection-tryon-modal" style="position:fixed;inset:0;z-index:100;background:rgba(11,28,48,0.72);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;">' +
      '<div style="background:#fff;border-radius:16px;max-width:1060px;width:100%;padding:24px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><h2 style="font-size:22px;font-weight:700;">See yourself in every frame</h2>' +
      '<button id="ek-ct-close" style="font-size:22px;line-height:1;padding:4px 10px;">×</button></div>' +
      '<p style="color:#555;margin:6px 0 16px;">Upload one clear front-facing photo. Your photo stays in this browser — it is never uploaded to a server — and every EyeKart frame is drawn on it below.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
      '<label style="background:#0b1c30;color:#fff;padding:10px 16px;border-radius:8px;cursor:pointer;">Upload photo<input id="ek-ct-file" type="file" accept="image/*" style="display:none;"></label>' +
      '<button id="ek-ct-portrait" style="background:#eef2f7;padding:10px 16px;border-radius:8px;">Use studio portrait</button>' +
      '<span id="ek-ct-status" style="color:#555;"></span></div>' +
      '<div id="ek-ct-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:20px;"></div>' +
      '</div></div>');
    document.body.appendChild(modal);
    modal.querySelector('#ek-ct-close').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });

    function runOnImage(img) {
      var status = modal.querySelector('#ek-ct-status');
      var grid = modal.querySelector('#ek-ct-grid');
      status.textContent = 'Finding your face…';
      grid.innerHTML = '';
      ensureLandmarker().then(function (vto) {
        return vto.detectImage(img).then(function (results) {
          var landmarks = results && results.faceLandmarks && results.faceLandmarks[0];
          if (!landmarks || landmarks.length < 468) {
            status.textContent = 'No face found. Try a clear, front-facing, well-lit photo.';
            return;
          }
          var geo = geometryFromLandmarks(landmarks);
          var svc = global.CatalogService;
          var products = (svc && svc.getAll ? svc.getAll() : []).filter(function (p) { return p && p.sku; });
          if (!products.length) { status.textContent = 'Catalog unavailable.'; return; }
          status.textContent = 'Showing ' + products.length + ' frames on your photo.';
          products.forEach(function (prod) {
            var tile = document.createElement('div');
            tile.style.cssText = 'border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;';
            var canvas = drawTile(vto, img, prod, geo, 440);
            canvas.style.cssText = 'width:100%;display:block;';
            tile.appendChild(canvas);
            var meta = document.createElement('div');
            meta.style.cssText = 'padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;';
            meta.innerHTML = '<span><b>' + prod.sku + '</b> · ' + (prod.name || '') + '<br><span style="color:#555;">' + fmt(prod.price) + '</span></span>' +
              '<a href="' + VTO_PATH + '?sku=' + encodeURIComponent(prod.sku) + '" style="background:#0b1c30;color:#fff;padding:8px 12px;border-radius:8px;white-space:nowrap;">Try live</a>';
            tile.appendChild(meta);
            grid.appendChild(tile);
          });
        });
      }).catch(function (err) {
        status.textContent = 'Could not run try-on: ' + (err && err.message ? err.message : 'unknown error');
      });
    }

    modal.querySelector('#ek-ct-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { runOnImage(img); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    modal.querySelector('#ek-ct-portrait').addEventListener('click', function () {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { runOnImage(img); };
      img.onerror = function () { modal.querySelector('#ek-ct-status').textContent = 'Studio portrait unavailable.'; };
      img.src = '/assets/img/hero-model.jpg';
    });
  }

  function injectBanner() {
    if (document.getElementById('ek-collection-tryon-banner')) return;
    var main = document.querySelector('main') || document.body;
    var banner = el(
      '<section id="ek-collection-tryon-banner" style="max-width:80rem;margin:0 auto;padding:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:#0b1c30;color:#fff;border-radius:12px;padding:16px 20px;">' +
      '<div><b style="font-size:17px;">See yourself in every frame ⭐</b><br><span style="opacity:0.85;">One photo, the whole catalog. Your photo stays in your browser only.</span></div>' +
      '<button id="ek-ct-open" style="background:#fff;color:#0b1c30;font-weight:700;padding:10px 18px;border-radius:8px;">Virtual Try On View</button>' +
      '</div></section>');
    main.insertBefore(banner, main.firstChild);
    banner.querySelector('#ek-ct-open').addEventListener('click', openModal);
  }

  function init() {
    if (!document.querySelector('[data-sku]')) return; // catalog pages only
    enhanceCards();
    injectBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
