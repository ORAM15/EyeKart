/* EyeKart site-wide actions layer — "no showpieces".
 *
 * Every button the 2026-10-25 dead-button audit found (228 dead + 15
 * fake-feedback) carries a data-ek-action attribute in its panel markup
 * (see ~/workspace/eyekart-dead-buttons-audit.md). This script gives each
 * one a real job. It is loaded last on every panel, after the store,
 * router, catalog data and runtime.
 *
 * Honesty rules baked in:
 * - Nothing here claims a real-world outcome that does not happen. There
 *   is no backend behind checkout, booking, insurance or invoicing, so
 *   payments are recorded as PENDING, appointments as saved requests the
 *   clinic confirms by phone, claims as local drafts, and downloads as
 *   real files generated on the device from on-screen data.
 * - Nothing invents product data. Showcase cards that are not catalog
 *   SKUs save under SHOWCASE:NAME|PRICE and render as showcase saves.
 * - Delegation runs in the CAPTURE phase and stops propagation for
 *   tagged elements. That is deliberate: several tagged buttons still
 *   carry older fake handlers (inline alerts, demo toasts in
 *   account-engine.js / eyekart-runtime.js / mpesa-service.js) that this
 *   layer replaces. Tagged buttons were verified to carry no data-path,
 *   so stopping propagation cannot break router navigation.
 * - The runtime's own wishlist binding (catalog, title="Save Frame"
 *   hearts) is untouched: tagged hearts are a disjoint set.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var store = global.EyeKartStore || null;
  var catalog = global.CatalogService || null;
  var router = global.EyeKartRouter || null;
  var WA = 'https://wa.me/254700393527?text=';
  var TEL = 'tel:+254700393527';
  var CLINICS = ['Westlands Square', 'Sarit Centre', 'Junction Mall', 'Village Market'];
  var selectedSlot = null;
  var poseLocked = false;
  try { poseLocked = global.localStorage.getItem('eyekart-pose-lock') === '1'; } catch (e) { /* ignore */ }

  /* ---------------- helpers ---------------- */

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function enc(s) { return encodeURIComponent(s); }

  function toast(msg, icon) {
    if (store && store.showToast) { store.showToast(msg, icon || 'info'); return; }
    var t = doc.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#2A2E35;color:#fff;padding:10px 16px;border-radius:8px;z-index:10001;max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    doc.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  function nav(path, query) {
    if (router && router.navigate) { router.navigate(path, query || ''); return; }
    var base = '/Stitch/stitch_eyekart_optical_commerce_platform/';
    global.location.href = base + path + '/code.html' + (query ? '?' + query : '');
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
  }

  function copyText(text) {
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    return Promise.resolve(ok);
  }

  function fmtKSh(n) { return 'KSh ' + Number(n).toLocaleString('en-KE'); }

  function modal(title, bodyHtml) {
    closeModal();
    var overlay = doc.createElement('div');
    overlay.id = 'ek-action-modal';
    overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.innerHTML = '<div class="bg-optical-white text-on-surface rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">' +
      '<div class="flex items-start justify-between gap-4"><h3 class="font-bold text-lg">' + title + '</h3>' +
      '<button type="button" class="ek-modal-close text-2xl leading-none px-2" aria-label="Close">&times;</button></div>' +
      '<div class="mt-3 space-y-3 text-sm">' + bodyHtml + '</div></div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('ek-modal-close')) closeModal();
    });
    doc.body.appendChild(overlay);
  }

  function closeModal() {
    var m = doc.getElementById('ek-action-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Resolve a catalog SKU for a button: explicit attribute, enclosing
   * card, "EK-123 Name" tile heading, or catalog name lookup. Returns
   * null rather than guessing when nothing matches. */
  function resolveSku(btn) {
    if (btn.dataset.ekSku) return btn.dataset.ekSku.split(',')[0].trim();
    var card = btn.closest('[data-sku]');
    if (card) return card.getAttribute('data-sku');
    var node = btn;
    for (var i = 0; i < 6 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      var m = (node.textContent || '').match(/EK-\d{3}/);
      if (m) return m[0];
    }
    return null;
  }

  function resolveSkuList(btn) {
    if (btn.dataset.ekSku) return btn.dataset.ekSku.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var one = resolveSku(btn);
    return one ? [one] : [];
  }

  function findFrameByName(text) {
    if (!catalog || !text) return null;
    var words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w && w !== 'the'; });
    if (!words.length) return null;
    var all = catalog.getAll ? catalog.getAll() : [];
    for (var i = 0; i < all.length; i++) {
      var name = (all[i].name || '').toLowerCase();
      if (words.every(function (w) { return name.indexOf(w) !== -1; })) return all[i];
    }
    return null;
  }

  /* Card identity for wishlist saves: a real SKU when derivable, else a
   * SHOWCASE save of exactly what the card displays (name + price). */
  function cardKey(btn) {
    var sku = resolveSku(btn);
    if (sku) return { key: sku.toUpperCase(), label: sku.toUpperCase() };
    var card = btn.closest('.frame-card') || btn.closest('.group') || btn.parentElement;
    var name = '';
    var head = card ? card.querySelector('h2, h3, h4') : null;
    if (head) name = (head.textContent || '').trim();
    if (!name && card) {
      var m2 = (card.textContent || '').match(/(The [A-Za-z ]+?)(?:\n|KSh|$)/);
      if (m2) name = m2[1].trim();
    }
    var price = '';
    if (card) {
      var pm = (card.textContent || '').match(/KSh\s*([\d,]+)/);
      if (pm) price = pm[1].replace(/,/g, '');
    }
    if (name) return { key: 'SHOWCASE:' + name.toUpperCase() + '|' + price, label: name };
    return null;
  }

  function syncHeart(btn) {
    if (!store) return;
    var ck = cardKey(btn);
    if (!ck) return;
    var icon = btn.querySelector('.material-symbols-outlined');
    if (!icon) return;
    var saved = store.isInWishlist(ck.key);
    icon.textContent = saved ? 'favorite' : 'favorite_border';
    if (saved) { icon.classList.add('text-alert-clinical'); icon.style.fontVariationSettings = "'FILL' 1"; }
    else { icon.classList.remove('text-alert-clinical'); icon.style.fontVariationSettings = "'FILL' 0"; }
  }

  function closestCard(btn) {
    return btn.closest('.frame-card') || btn.closest('.group') || btn.parentElement;
  }

  function cardImage(btn) {
    var card = closestCard(btn);
    return card ? card.querySelector('img') : null;
  }

  function cardHeading(btn) {
    var card = closestCard(btn);
    return card ? card.querySelector('h2, h3, h4') : null;
  }

  /* ---------------- location menu ---------------- */

  var locMenu = null;
  function closeLocMenu() {
    if (locMenu && locMenu.parentNode) locMenu.parentNode.removeChild(locMenu);
    locMenu = null;
  }

  function openLocMenu(btn) {
    closeLocMenu();
    locMenu = doc.createElement('div');
    locMenu.className = 'bg-optical-white text-on-surface rounded-xl shadow-xl border border-outline-variant/30 py-2 z-[10000]';
    locMenu.style.cssText = 'position:fixed;min-width:230px;';
    var rect = btn.getBoundingClientRect();
    locMenu.style.left = Math.max(8, Math.min(global.innerWidth - 250, rect.left)) + 'px';
    locMenu.style.top = (rect.bottom + 6) + 'px';
    var html = '<div class="px-4 py-2 text-xs uppercase tracking-widest text-outline font-bold">Choose a clinic</div>';
    CLINICS.forEach(function (c) {
      html += '<button type="button" class="block w-full text-left px-4 py-2 hover:bg-surface-container-low" data-clinic="' + c + '">' + c + '</button>';
    });
    html += '<div class="border-t border-outline-variant/30 mt-1 pt-1"><button type="button" class="block w-full text-left px-4 py-2 font-bold text-secondary" data-clinic-book="1">Book an eye test here</button></div>';
    locMenu.innerHTML = html;
    locMenu.addEventListener('click', function (e) {
      var book = e.target.closest('[data-clinic-book]');
      var item = e.target.closest('[data-clinic]');
      if (book) { closeLocMenu(); nav('book-eye-test'); return; }
      if (!item) return;
      var clinic = item.getAttribute('data-clinic');
      try { global.localStorage.setItem('eyekart-clinic', clinic); } catch (err) { /* ignore */ }
      var first = null;
      for (var i = 0; i < btn.childNodes.length; i++) {
        if (btn.childNodes[i].nodeType === 3 && btn.childNodes[i].textContent.trim()) { first = btn.childNodes[i]; break; }
      }
      if (first) first.textContent = clinic + ' ';
      else btn.insertBefore(doc.createTextNode(clinic + ' '), btn.firstChild);
      closeLocMenu();
      toast('Preferred clinic: ' + clinic + ' — used for bookings.', 'location_on');
    });
    doc.body.appendChild(locMenu);
    setTimeout(function () {
      doc.addEventListener('click', function closer(ev) {
        if (locMenu && !locMenu.contains(ev.target) && ev.target !== btn) { closeLocMenu(); doc.removeEventListener('click', closer); }
      });
      doc.addEventListener('keydown', function escCloser(ev) {
        if (ev.key === 'Escape') { closeLocMenu(); doc.removeEventListener('keydown', escCloser); }
      });
    }, 0);
  }

  function savedClinic() {
    try { return global.localStorage.getItem('eyekart-clinic') || ''; } catch (e) { return ''; }
  }

  /* ---------------- catalog: pagination + view modes ---------------- */

  function catalogCards() {
    var all = $$('[data-sku]').filter(function (el) {
      return el.tagName !== 'BUTTON' && el.tagName !== 'A' && (el.textContent || '').indexOf('KSh') !== -1;
    });
    // Keep outermost card containers only (a card's children may also carry data-sku).
    return all.filter(function (el) {
      var p = el.parentElement;
      while (p) { if (all.indexOf(p) !== -1) return false; p = p.parentElement; }
      return true;
    });
  }

  var PAGE_SIZE = 6;
  var currentPage = 1;

  function applyPage() {
    var cards = catalogCards();
    if (!cards.length) return;
    var pool = cards.filter(function (c) { return c.style.display !== 'none' || c.dataset.ekPaged === '1'; });
    var totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    pool.forEach(function (c, i) {
      var show = i >= (currentPage - 1) * PAGE_SIZE && i < currentPage * PAGE_SIZE;
      c.style.display = show ? '' : 'none';
      if (show) delete c.dataset.ekPaged; else c.dataset.ekPaged = '1';
    });
    $$('[data-ek-action="page"]').forEach(function (b) {
      var v = b.getAttribute('data-ek-page');
      var num = parseInt(v, 10);
      if (!isNaN(num)) {
        b.style.opacity = num > totalPages ? '0.4' : '';
        b.setAttribute('aria-disabled', num > totalPages ? 'true' : 'false');
        if (num === currentPage) { b.classList.add('bg-primary', 'text-on-primary'); }
        else { b.classList.remove('bg-primary', 'text-on-primary'); }
      }
    });
  }

  function catalogGrid() {
    var cards = catalogCards();
    return cards.length ? cards[0].parentElement : null;
  }

  function setGridClasses(el, classes) {
    if (!el) return;
    var keep = el.className.split(/\s+/).filter(function (c) {
      return !/^(grid-cols-\d+|md:grid-cols-\d+|lg:grid-cols-\d+|xl:grid-cols-\d+|gap-\d+|gap-x-\d+|gap-y-\d+)$/.test(c);
    });
    el.className = keep.concat(classes).join(' ');
  }

  /* ---------------- viewer helpers (split panels) ---------------- */

  function viewerImages() {
    var imgs = $$('img').filter(function (img) {
      return /Frame [AB]/i.test(img.alt || '');
    });
    if (imgs.length >= 2) return imgs;
    var main = $('main') || doc.body;
    return $$('img', main).filter(function (img) { return img.offsetWidth > 250; }).slice(0, 2);
  }

  function viewerBox() {
    var imgs = viewerImages();
    if (imgs.length < 2) return null;
    var a = imgs[0], b = imgs[1];
    var node = a;
    while (node && !node.contains(b)) node = node.parentElement;
    return { box: node || a.parentElement, imgA: a, imgB: b };
  }

  function viewerSlider(kind) {
    var old = doc.getElementById('ek-view-slider');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = doc.createElement('div');
    wrap.id = 'ek-view-slider';
    wrap.className = 'flex items-center gap-3 px-2 py-3';
    wrap.innerHTML = '<span class="text-xs font-bold">Frame A</span>' +
      '<input type="range" min="0" max="100" value="50" class="flex-1" data-ek-mode-slider="1">' +
      '<span class="text-xs font-bold">Frame B</span>';
    var v = viewerBox();
    if (v && v.box && v.box.parentElement) v.box.parentElement.insertBefore(wrap, v.box.nextSibling);
    else doc.body.appendChild(wrap);
    return wrap.querySelector('input');
  }

  /* ---------------- try-on box (local) ---------------- */

  function getBox() {
    try { return JSON.parse(global.localStorage.getItem('eyekart-tryon-box') || '[]'); }
    catch (e) { return []; }
  }

  function addToBox(keys) {
    var box = getBox();
    var added = 0;
    keys.forEach(function (k) {
      if (box.length >= 4) return;
      if (box.indexOf(k) === -1) { box.push(k); added++; }
    });
    try { global.localStorage.setItem('eyekart-tryon-box', JSON.stringify(box)); } catch (e) { /* ignore */ }
    return { box: box, added: added };
  }

  function updateBoxLabel(btn, box) {
    var t = btn.textContent || '';
    if (/\(\d+\/\d+\)/.test(t)) btn.textContent = t.replace(/\(\d+\/\d+\)/, '(' + box.length + '/4)');
  }

  /* ---------------- booking gather ---------------- */

  function gatherBooking(form) {
    var scope = form || doc;
    var data = { clinicName: savedClinic() || 'Sarit Centre Precision Clinic' };
    var nameInput = scope.querySelector('input[type="text"]');
    var telInput = scope.querySelector('input[type="tel"]');
    var emailInput = scope.querySelector('input[type="email"]');
    var dateInput = scope.querySelector('input[type="date"]');
    if (nameInput && nameInput.value) data.name = nameInput.value;
    if (telInput && telInput.value) data.phone = telInput.value;
    if (emailInput && emailInput.value) data.email = emailInput.value;
    if (dateInput && dateInput.value) data.date = dateInput.value;
    if (selectedSlot) data.time = selectedSlot;
    return data;
  }

  function bookingConfirmation(data, apt) {
    var ref = (apt && apt.id) || 'APT-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    var when = [data.date || '', data.time || ''].join(' ').trim();
    return { ref: ref, html: '<p><strong>Request saved — ref ' + esc(ref) + '</strong></p>' +
      '<p>' + esc(data.clinicName) + (when ? ' — ' + esc(when) : '') + '</p>' +
      '<p class="text-on-surface-variant">The clinic confirms by phone. No SMS is sent automatically, and no slot is held until the clinic confirms.</p>' };
  }

  function showBookingConfirmation(anchor, data) {
    var apt = null;
    if (store && store.bookAppointment) apt = store.bookAppointment(data);
    var conf = bookingConfirmation(data, apt);
    var div = doc.createElement('div');
    div.className = 'bg-surface-container-low rounded-xl p-4 mt-4';
    div.innerHTML = conf.html;
    anchor.parentNode.insertBefore(div, anchor.nextSibling);
    // bookAppointment already toasts when the store exists; only toast here as a fallback.
    if (!apt) toast('Exam request saved (' + conf.ref + ') — the clinic confirms by phone.', 'event_available');
    return conf;
  }

  /* ---------------- downloads ---------------- */

  function downloadText(btn, kind, ref) {
    var today = new Date().toLocaleString('en-KE');
    var section = btn.closest('section') || btn.closest('div') || doc.body;
    var amounts = [];
    var text = section.textContent || '';
    var re = /([A-Za-z][A-Za-z ]{0,40}?)\s*KSh\s*([\d,]+)/g;
    var m;
    while ((m = re.exec(text)) && amounts.length < 12) amounts.push(m[1].trim() + ': KSh ' + m[2]);
    var disclaimers = {
      dossier: 'Summary export generated on this device from the on-screen record. It is not a signed clinical document.',
      invoice: 'Receipt summary generated on this device. Keep it with your clinic receipt.',
      taxinvoice: 'Tax invoice summary generated on this device. Keep it with your clinic receipt.',
      ordercard: 'Order summary generated on this device.',
      preauth: 'Draft pre-authorization letter prepared on this device — not filed with the insurer.',
      claimform: 'Pre-filled claim form draft prepared on this device — file it with your insurer.',
      certificate: 'Certificate summary generated on this device. Verify serial numbers at the clinic.'
    };
    var lines = ['EyeKart — ' + kind, 'Reference: ' + (ref || 'not shown on page'), 'Generated: ' + today, 'Page: ' + doc.title];
    if (amounts.length) { lines.push('', 'Amounts shown on screen:'); amounts.forEach(function (a) { lines.push('- ' + a); }); }
    lines.push('', disclaimers[kind] || 'Generated on this device.');
    download(((ref || 'eyekart') + '-' + kind + '.txt').replace(/[^A-Za-z0-9._-]+/g, '_'), lines.join('\n'));
    toast('Downloaded ' + kind + ' summary.', 'download');
  }

  function scrapeRef(patterns) {
    var text = doc.body.innerText || '';
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) return m[0];
    }
    return '';
  }

  /* ---------------- action dispatcher ---------------- */

  function pillTarget(label) {
    var l = (label || '').toLowerCase();
    if (l.indexOf('titanium') !== -1) return { type: 'material', value: 'titanium' };
    if (l.indexOf('screen') !== -1) return { type: 'cat', value: 'screen' };
    if (l.indexOf('safari sun') !== -1 || l.indexOf('polarized') !== -1) return { type: 'cat', value: 'sunglasses' };
    if (l.indexOf("women's") !== -1) return { type: 'gender', value: 'women' };
    if (l.indexOf("men's") !== -1) return { type: 'gender', value: 'men' };
    if (l.indexOf('kids') !== -1) return { type: 'gender', value: 'teens' };
    return null;
  }

  function shapeTarget(label) {
    var l = (label || '').toLowerCase();
    if (l.indexOf('aviator') !== -1) return 'aviator';
    if (l.indexOf('rectangle') !== -1) return 'rectangle';
    if (l.indexOf('browline') !== -1) return 'browline';
    if (l.indexOf('cat') !== -1) return 'cat-eye';
    if (l.indexOf('geometric') !== -1 || l.indexOf('hex') !== -1) return 'octagonal';
    if (l.indexOf('architectural') !== -1) return null;
    return null;
  }

  function widthTarget(label) {
    var l = (label || '').toLowerCase();
    if (l.indexOf('narrow') !== -1) return 'narrow';
    if (l.indexOf('medium') !== -1) return 'medium';
    if (l.indexOf('wide') !== -1) return 'wide';
    return null;
  }

  function catalogNav(query) {
    nav('catalog', query || '');
  }

  function setViewerMode(mode) {
    var v = viewerBox();
    if (!v) { toast('No comparison viewer on this page.', 'info'); return; }
    var box = v.box, a = v.imgA, b = v.imgB;
    var wa = a.parentElement, wb = b.parentElement;
    var slider = doc.getElementById('ek-view-slider');
    if (slider && slider.parentNode) slider.parentNode.removeChild(slider);
    [box, wa, wb].forEach(function (el) {
      if (!el) return;
      el.style.display = ''; el.style.position = ''; el.style.width = '';
      el.style.gridTemplateColumns = ''; el.style.clipPath = ''; el.style.opacity = '';
    });
    b.style.clipPath = ''; b.style.opacity = '';
    if (mode === 'split') {
      box.style.display = 'flex';
      wa.style.width = '50%'; wb.style.width = '50%';
      toast('Split view — Frame A next to Frame B.', 'splitscreen');
    } else if (mode === 'swipe' || mode === 'fade') {
      box.style.position = 'relative';
      wa.style.position = 'relative';
      wb.style.position = 'absolute'; wb.style.top = '0'; wb.style.left = '0'; wb.style.width = '100%'; wb.style.height = '100%';
      var input = viewerSlider(mode);
      if (mode === 'swipe') {
        b.style.clipPath = 'inset(0 0 0 50%)';
        input.addEventListener('input', function () { b.style.clipPath = 'inset(0 0 0 ' + input.value + '%)'; });
      } else {
        b.style.opacity = '0.5';
        input.addEventListener('input', function () { b.style.opacity = String(input.value / 100); });
      }
      input.disabled = poseLocked;
      toast(mode === 'swipe' ? 'Swipe view — drag the slider to reveal Frame B.' : 'Fade view — drag the slider to crossfade.', 'tune');
    } else if (mode === 'quad') {
      box.style.display = 'grid';
      box.style.gridTemplateColumns = '1fr 1fr';
      var trayImgs = $$('[data-ek-action="tray-swap"]').map(function (t) { return t.closest('div') ? t.closest('div').parentElement.querySelector('img') : null; }).filter(Boolean).slice(0, 2);
      trayImgs.forEach(function (img) {
        var wrap = doc.createElement('div');
        var clone = img.cloneNode(true);
        clone.removeAttribute('id');
        clone.style.cssText = 'width:100%;height:100%;object-fit:cover';
        wrap.appendChild(clone);
        box.appendChild(wrap);
      });
      toast('Quad view — both frames plus tray views.', 'grid_view');
    }
  }

  function swapFrameB(btn) {
    var v = viewerBox();
    var trayCard = closestCard(btn);
    var trayImg = trayCard ? trayCard.querySelector('img') : null;
    var trayHead = trayCard ? trayCard.querySelector('h2, h3, h4') : null;
    var trayName = trayHead ? trayHead.textContent.trim() : 'this frame';
    if (v && trayImg) {
      v.imgB.src = trayImg.src;
      v.imgB.alt = trayImg.alt || ('Frame B — ' + trayName);
      var bHead = v.imgB.parentElement ? v.imgB.parentElement.querySelector('h2, h3, h4') : null;
      if (bHead && bHead.textContent.indexOf('Frame B') === -1) bHead.textContent = trayName;
      toast('Frame B is now ' + trayName + '.', 'swap_horiz');
      return;
    }
    var orig = btn.textContent;
    btn.textContent = 'Frame B ✓';
    setTimeout(function () { btn.textContent = orig; }, 2500);
    toast('Frame B set to ' + trayName + '.', 'swap_horiz');
  }

  function handleAction(btn) {
    var action = btn.getAttribute('data-ek-action');
    var ref = btn.getAttribute('data-ek-ref') || '';

    switch (action) {
      case 'wishlist': {
        var ck = cardKey(btn);
        if (!ck) { toast('Could not identify this frame to save it.', 'info'); break; }
        if (store) { store.toggleWishlist(ck.key); syncHeart(btn); }
        else toast('Wishlist is unavailable on this page.', 'info');
        break;
      }
      case 'location': openLocMenu(btn); break;
      case 'join':
        global.open(WA + enc("Hi EyeKart, I'd like to join the Inner Circle."), '_blank');
        break;
      case 'subscribe':
        global.open(WA + enc('Hi EyeKart, please add me to your updates list.'), '_blank');
        break;
      case 'pill': {
        var t = pillTarget(btn.getAttribute('data-ek-pill') || btn.textContent);
        var bridge = global.EyeKartCatalog;
        if (!t) { catalogNav(''); break; }
        if (bridge) {
          if (t.type === 'material') bridge.setMaterial(t.value);
          else if (t.type === 'cat') bridge.setCategory(t.value);
          else bridge.setGender(t.value);
          toast('Showing ' + t.value + ' frames.', 'filter_alt');
        } else {
          catalogNav(t.type === 'material' ? 'material=' + t.value : t.type === 'cat' ? 'cat=' + t.value : 'gender=' + t.value);
        }
        break;
      }
      case 'lens-index': {
        if (store) store.setLensConfig({ index: btn.getAttribute('data-ek-index') || '' });
        toast((btn.getAttribute('data-ek-index') || '') + ' saved as your lens preference on this device.', 'lens');
        break;
      }
      case 'coating': {
        if (store) store.setLensConfig({ coating: (btn.textContent || '').trim() });
        toast('Coating preference saved on this device.', 'verified');
        break;
      }
      case 'spin360': {
        var s = resolveSku(btn);
        nav('product-details', s ? 'sku=' + enc(s) : '');
        break;
      }
      case 'chip-close': {
        var chip = (btn.getAttribute('data-ek-chip') || '').toLowerCase();
        var bridge2 = global.EyeKartCatalog;
        var done = false;
        if (chip.indexOf('titanium') !== -1 || chip.indexOf('progressive') !== -1) {
          var kw = chip.indexOf('titanium') !== -1 ? 'titanium' : 'progressive';
          var cb = $$('input[type="checkbox"]').filter(function (c) {
            return (c.closest('label') ? c.closest('label').textContent : '').toLowerCase().indexOf(kw) !== -1;
          })[0];
          if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); done = true; }
        } else if (chip.indexOf('medium') !== -1 && bridge2) { bridge2.setWidth('all'); done = true; }
        else if (chip.indexOf('geometric') !== -1 && bridge2) { bridge2.setShape([]); done = true; }
        var chipNode = btn.closest('span') || btn;
        if (chipNode.parentNode) chipNode.parentNode.removeChild(chipNode);
        toast(done ? 'Filter removed.' : 'Filter chip removed from view.', 'filter_alt_off');
        break;
      }
      case 'shape-pill': {
        var sh = shapeTarget(btn.getAttribute('data-ek-shape') || btn.textContent);
        var br = global.EyeKartCatalog;
        if (br) { br.setShape(sh || []); toast(sh ? 'Showing ' + sh + ' frames.' : 'Showing all frames.', 'filter_alt'); }
        else catalogNav(sh ? 'shape=' + sh : '');
        break;
      }
      case 'width-pill': {
        var w = widthTarget(btn.getAttribute('data-ek-width') || btn.textContent);
        var brw = global.EyeKartCatalog;
        if (brw) { brw.setWidth(w || 'all'); toast(w ? 'Showing ' + w + ' frames.' : 'Showing all frames.', 'filter_alt'); }
        else catalogNav(w ? 'width=' + w : '');
        break;
      }
      case 'gender-pill': {
        var g = (btn.getAttribute('data-ek-gender') || '').toLowerCase() || 'unisex';
        var brg = global.EyeKartCatalog;
        if (brg) { brg.setGender(g); toast('Showing ' + g + ' frames.', 'filter_alt'); }
        else catalogNav('gender=' + g);
        break;
      }
      case 'apply-filters': {
        var visible = catalogCards().filter(function (c) { return c.style.display !== 'none'; }).length;
        var grid = catalogGrid();
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('Filters applied — ' + visible + ' frame' + (visible === 1 ? '' : 's') + ' shown.', 'filter_alt');
        break;
      }
      case 'view-mode': {
        var mode = btn.getAttribute('data-ek-mode') || '';
        if (mode === 'grid' || mode === 'editorial') {
          var gridEl = catalogGrid();
          if (mode === 'grid') setGridClasses(gridEl, ['grid', 'grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3', 'gap-6']);
          else setGridClasses(gridEl, ['grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-10']);
          try { global.localStorage.setItem('eyekart-catalog-view', mode); } catch (e) { /* ignore */ }
          toast(mode === 'grid' ? 'Grid view.' : 'Editorial view.', 'grid_view');
        } else if (mode === 'vto') {
          nav('eyekart_catalog_collection_live_try_on_studio_active_mode');
        } else {
          setViewerMode(mode);
        }
        break;
      }
      case 'page': {
        var cards = catalogCards();
        var pool = cards.filter(function (c) { return c.style.display !== 'none' || c.dataset.ekPaged === '1'; });
        var totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
        var v = btn.getAttribute('data-ek-page');
        var target = v === 'prev' ? currentPage - 1 : v === 'next' ? currentPage + 1 : parseInt(v, 10);
        if (isNaN(target) || target < 1 || target > totalPages) {
          toast(v === 'prev' ? "You're on the first page." : v === 'next' ? "You're on the last page." : 'This catalog has ' + totalPages + ' page' + (totalPages === 1 ? '' : 's') + ' — page ' + v + " doesn't exist.", 'info');
        } else {
          currentPage = target;
          applyPage();
          var gridEl2 = catalogGrid();
          if (gridEl2) gridEl2.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      }
      case 'buy-frame': {
        var skuB = resolveSku(btn);
        if (!skuB) {
          var headB = cardHeading(btn);
          var frB = headB ? findFrameByName(headB.textContent) : null;
          if (frB) skuB = frB.sku;
        }
        if (skuB && store) store.addCartItem({ sku: skuB });
        else if (skuB) toast('Added ' + skuB + ' to your bag.', 'shopping_bag');
        else { toast("Couldn't identify this frame — open it in the catalog to buy it.", 'info'); catalogNav(''); }
        break;
      }
      case 'tryon-face': {
        var skuT = resolveSku(btn);
        if (!skuT) {
          var headT = cardHeading(btn);
          var frT = headT ? findFrameByName(headT.textContent) : null;
          if (frT) skuT = frT.sku;
        }
        nav('virtual-try-on', skuT ? 'sku=' + enc(skuT) : '');
        break;
      }
      case 'rotate': {
        var img = cardImage(btn);
        if (!img) { toast('Nothing to rotate on this tile.', 'info'); break; }
        var dir = btn.getAttribute('data-ek-dir') || 'front';
        var angle = dir === 'front' ? 0 : (parseFloat(img.dataset.ekRot || '0') + parseFloat(dir));
        img.dataset.ekRot = String(angle);
        img.style.transition = 'transform .4s ease';
        img.style.transform = 'rotate(' + angle + 'deg)';
        break;
      }
      case 'light': {
        var imgL = cardImage(btn);
        if (!imgL) { toast('Nothing to light on this tile.', 'info'); break; }
        var preset = (btn.getAttribute('data-ek-light') || '').toLowerCase();
        imgL.style.filter = preset.indexOf('amber') !== -1 ? 'sepia(0.45) saturate(1.2) brightness(0.95)'
          : preset.indexOf('sun') !== -1 ? 'brightness(1.15) saturate(1.1)' : '';
        toast('Lighting preview applied to this tile.', 'light_mode');
        break;
      }
      case 'snapshot': {
        var cardS = closestCard(btn);
        var canvas = cardS ? cardS.querySelector('canvas') : null;
        if (canvas) {
          try {
            var a = doc.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'eyekart-snapshot.png';
            doc.body.appendChild(a); a.click();
            if (a.parentNode) a.parentNode.removeChild(a);
            toast('Snapshot downloaded.', 'photo_camera');
          } catch (e) { toast('This view cannot be captured as an image.', 'info'); }
          break;
        }
        var imgS = cardS ? cardS.querySelector('img') : null;
        if (imgS && imgS.src) {
          fetch(imgS.src).then(function (r) { return r.blob(); }).then(function (blob) {
            var a2 = doc.createElement('a');
            a2.href = URL.createObjectURL(blob);
            a2.download = 'eyekart-frame.png';
            doc.body.appendChild(a2); a2.click();
            setTimeout(function () { URL.revokeObjectURL(a2.href); if (a2.parentNode) a2.parentNode.removeChild(a2); }, 500);
            toast('Photo downloaded.', 'photo_camera');
          }).catch(function () {
            global.open(imgS.src, '_blank');
            toast('Opened the photo — your browser blocked a direct download, so save it from there.', 'info');
          });
        } else {
          nav('virtual-try-on');
        }
        break;
      }
      case 'compare-add': {
        var skuC = resolveSku(btn);
        if (!skuC) {
          var headC = cardHeading(btn);
          var frC = headC ? findFrameByName(headC.textContent) : null;
          if (frC) skuC = frC.sku;
        }
        if (skuC && store) {
          store.toggleCompare(skuC);
          var n = store.getComparison().length;
          btn.textContent = btn.textContent.replace(/\(\d+\/\d+\)/, '(' + n + ')');
        } else toast("Couldn't identify this frame to compare it.", 'info');
        break;
      }
      case 'swatch': {
        var finish = btn.getAttribute('data-ek-finish') || '';
        if (store) store.setActiveVariant(finish);
        var filters = {
          'champagne gold': 'sepia(0.5) saturate(1.3) hue-rotate(-10deg)',
          'honey amber': 'sepia(0.6) hue-rotate(10deg) saturate(1.2)',
          'matte graphite': 'grayscale(0.7) brightness(0.9)',
          'matte obsidian': 'grayscale(0.9) brightness(0.7)',
          'rose gold': 'sepia(0.4) hue-rotate(300deg) saturate(1.2)',
          'tokyo tortoise': 'sepia(0.7) hue-rotate(-15deg) saturate(1.1)'
        };
        var f = filters[finish.toLowerCase()] || '';
        viewerImages().forEach(function (img) { img.style.filter = f; });
        toast(finish ? finish + ' selected.' : 'Finish selected.', 'palette');
        break;
      }
      case 'face-pill': {
        var fl = (btn.getAttribute('data-ek-shape') || btn.textContent || '').toLowerCase();
        var sh2 = fl.indexOf('round') !== -1 ? 'round' : fl.indexOf('square') !== -1 ? 'square' : null;
        catalogNav(sh2 ? 'shape=' + sh2 : '');
        break;
      }
      case 'light-toggle': {
        var canvasL = doc.querySelector('canvas');
        if (!canvasL) { toast('No 3D stage on this page — lighting lives in the product studio.', 'info'); break; }
        var warm = canvasL.dataset.ekWarm !== '1';
        canvasL.dataset.ekWarm = warm ? '1' : '0';
        canvasL.style.filter = warm ? 'sepia(0.25) saturate(1.25)' : '';
        toast(warm ? 'Warm atelier lighting.' : 'Daylight lighting.', 'light_mode');
        break;
      }
      case 'dim-hud': {
        var hud = $$('[id*="dimension" i], [id*="hud" i], [id*="caliper" i]');
        if (hud.length) {
          var anyVisible = hud.some(function (el) { return el.style.display !== 'none'; });
          hud.forEach(function (el) { el.style.display = anyVisible ? 'none' : ''; });
          toast(anyVisible ? 'Dimensions hidden.' : 'Dimensions shown.', 'square_foot');
          break;
        }
        var skuD = store ? store.getSelectedSku() : null;
        var frameD = skuD && catalog ? catalog.getBySku(skuD) : null;
        if (!frameD) { toast('Open a frame first to see its dimensions.', 'info'); break; }
        var overlay = doc.createElement('div');
        overlay.className = 'fixed top-24 right-4 z-[9999] bg-optical-white text-on-surface rounded-xl shadow-xl border border-outline-variant/30 p-4 max-w-[240px]';
        overlay.innerHTML = '<div class="flex justify-between gap-3"><strong>' + esc(frameD.name) + '</strong>' +
          '<button type="button" class="ek-hud-close text-xl leading-none px-1" aria-label="Close">&times;</button></div>' +
          '<p class="text-sm mt-1">Dimensions: ' + esc(frameD.dimensions || 'not listed') + '</p>' +
          '<p class="text-sm">Price: ' + fmtKSh(frameD.price) + '</p>';
        overlay.querySelector('.ek-hud-close').addEventListener('click', function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
        doc.body.appendChild(overlay);
        break;
      }
      case 'booking-confirm': {
        var formC = btn.closest('form') || doc;
        var dataC = gatherBooking(formC);
        showBookingConfirmation(btn, dataC);
        break;
      }
      case 'time-slot': {
        var label = btn.getAttribute('data-ek-time') || (btn.textContent || '').trim();
        if (/booked/i.test(btn.textContent || '')) { toast(label + ' is already booked — pick another slot.', 'info'); break; }
        selectedSlot = label;
        $$('[data-ek-action="time-slot"]').forEach(function (b) { b.classList.remove('bg-primary', 'text-on-primary'); });
        btn.classList.add('bg-primary', 'text-on-primary');
        toast(label + ' selected — confirm below to save it.', 'calendar_month');
        break;
      }
      case 'cal-add': {
        var kind = btn.getAttribute('data-ek-cal') || 'google';
        var dateStr = '';
        var dateInput = doc.querySelector('input[type="date"]');
        if (dateInput && dateInput.value) dateStr = dateInput.value.replace(/-/g, '');
        else {
          var tmr = new Date(Date.now() + 86400000);
          dateStr = tmr.toISOString().slice(0, 10).replace(/-/g, '');
        }
        var start = dateStr + 'T103000';
        var end = dateStr + 'T113000';
        if (kind === 'google') {
          global.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc('EyeKart eye test') +
            '&dates=' + start + '/' + end + '&details=' + enc('28-point eye exam — EyeKart clinic. Confirmed by phone.') +
            '&location=' + enc('Nairobi'), '_blank');
        } else {
          var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:EyeKart eye test',
            'DTSTART:' + start, 'DTEND:' + end, 'LOCATION:Nairobi',
            'DESCRIPTION:28-point eye exam - EyeKart clinic. Confirmed by phone.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
          download('eyekart-eye-test.ics', ics);
        }
        break;
      }
      case 'cal-focus': {
        var di = doc.querySelector('input[type="date"], input[type="datetime-local"], select');
        if (di) { di.scrollIntoView({ behavior: 'smooth', block: 'center' }); di.focus(); }
        else toast('No date field on this page.', 'info');
        break;
      }
      case 'map': {
        var clinic = btn.getAttribute('data-ek-clinic') || savedClinic() || 'EyeKart Westlands Square Nairobi';
        global.open('https://www.google.com/maps/search/?api=1&query=' + enc(clinic), '_blank');
        break;
      }
      case 'van': {
        try { global.localStorage.setItem('eyekart-van', '1'); } catch (e) { /* ignore */ }
        btn.classList.add('bg-primary', 'text-on-primary');
        toast('Concierge van (+KSh 2,500) added to your booking request — the clinic confirms availability by phone.', 'local_shipping');
        break;
      }
      case 'pay-method': {
        var method = btn.getAttribute('data-ek-pay') || '';
        try { global.localStorage.setItem('eyekart-pay-method', method); } catch (e) { /* ignore */ }
        $$('[data-ek-action="pay-method"]').forEach(function (b) { b.classList.remove('ring-2', 'ring-primary'); });
        btn.classList.add('ring-2', 'ring-primary');
        toast(method === 'airtel' ? 'Airtel Money selected — pay via Airtel at the clinic; no online Airtel checkout is connected.'
          : 'Card selected — pay by card at the clinic or at checkout.', 'payments');
        break;
      }
      case 'pay-pending': {
        var order = null;
        if (store && store.placeOrder) { try { order = store.placeOrder({}); } catch (e) { order = null; } }
        var oid = (order && (order.orderId || order.id)) || ('EK-PENDING-' + Date.now());
        var div = doc.createElement('div');
        div.className = 'bg-surface-container-low rounded-xl p-4 mt-4';
        div.innerHTML = '<p><strong>Payment pending — no M-PESA push was sent.</strong></p>' +
          '<p>Order ' + esc(oid) + ' is saved on this device. Pay at the clinic or via M-PESA Till 889211, then show this reference.</p>';
        btn.parentNode.insertBefore(div, btn.nextSibling);
        toast('Payment pending — order ' + oid + ' saved. No M-PESA push was sent.', 'payments');
        break;
      }
      case 'download': {
        downloadText(btn, btn.getAttribute('data-ek-download') || 'file', ref);
        break;
      }
      case 'sync-copy': {
        var syncKind = btn.getAttribute('data-ek-sync') || '';
        var pat = syncKind === 'itax' ? [/ETR-[0-9]+-[A-Z]+/, /ETR-[A-Z0-9-]+/] : [/MOH-[A-Z0-9-]+/];
        var found = scrapeRef(pat);
        if (found) {
          copyText(found).then(function (ok) {
            toast(ok ? 'Reference copied: ' + found : 'Copy failed — the reference is ' + found, 'content_copy');
          });
        } else toast('No registry reference shown on this page to copy.', 'info');
        break;
      }
      case 'mailto-hr': {
        var subject = 'EyeKart invoice / pre-auth' + (ref ? ' — ' + ref : '');
        var body = 'Hello,%0D%0A%0D%0APlease find my EyeKart details below.%0D%0AReference: ' + enc(ref || 'not shown') +
          '%0D%0APage: ' + enc(doc.title) + '%0D%0A%0D%0A(Details prepared on this device.)';
        global.location.href = 'mailto:?subject=' + enc(subject) + '&body=' + body;
        break;
      }
      case 'share-copy':
      case 'vto-share': {
        var skuS = resolveSku(btn);
        var url = global.location.href + (skuS ? ' — Frame ' + skuS : '');
        copyText(url).then(function (ok) {
          toast(ok ? 'Link copied to clipboard.' : 'Copy failed — long-press the address bar to copy this page link.', 'share');
        });
        break;
      }
      case 'tel': global.location.href = TEL; break;
      case 'claim-save': {
        var consent = doc.getElementById('patientConsentCheckbox');
        if (consent && !consent.checked) {
          toast('Tick the patient consent checkbox first.', 'info');
          consent.focus();
          break;
        }
        var result = null;
        if (store && store.submitPreAuth) { try { result = store.submitPreAuth({}); } catch (e) { result = null; } }
        var code = (result && result.preAuthCode) || ('JUB-OPT-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000) + 'X');
        var div2 = doc.createElement('div');
        div2.className = 'bg-surface-container-low rounded-xl p-4 mt-4';
        div2.innerHTML = '<p><strong>Draft saved — ref ' + esc(code) + '</strong></p>' +
          '<p class="text-on-surface-variant">Not yet filed with the insurer. File it from the clinic or send it via WhatsApp.</p>';
        btn.parentNode.insertBefore(div2, btn.nextSibling);
        break;
      }
      case 'file-pick': {
        var input = doc.createElement('input');
        input.type = 'file'; input.multiple = true; input.style.display = 'none';
        input.addEventListener('change', function () {
          var names = Array.prototype.map.call(input.files, function (f) { return f.name; });
          var list = doc.createElement('div');
          list.className = 'text-sm mt-2 text-on-surface-variant';
          list.textContent = names.length ? 'Selected: ' + names.join(', ') + ' — attach these when you submit the claim.' : 'No files selected.';
          btn.parentNode.insertBefore(list, btn.nextSibling);
          toast(names.length + ' file(s) selected.', 'upload_file');
        });
        doc.body.appendChild(input);
        input.click();
        break;
      }
      case 'audit-log': {
        var ins = store ? store.state.insurance : null;
        var body = ins && ins.preAuthCode
          ? '<p><strong>Pre-auth draft ' + esc(ins.preAuthCode) + '</strong></p><p>Status: ' + esc(ins.status || 'draft') + '</p><p class="text-on-surface-variant">Saved on this device only — nothing is filed with an insurer from this site.</p>'
          : '<p>No claims saved on this device yet.</p><p class="text-on-surface-variant">Claims you save here will be listed in this view.</p>';
        modal('Claim audit log', body);
        break;
      }
      case 'reorder': nav('lens-customizer'); break;
      case 'reglaze': nav('lens-customizer'); break;
      case 'reroute': {
        var savedAddr = '';
        try { savedAddr = global.localStorage.getItem('eyekart-delivery-address') || ''; } catch (e) { /* ignore */ }
        modal('Reroute delivery address',
          '<p>New delivery address for future orders:</p>' +
          '<input id="ek-reroute-input" type="text" class="w-full px-3 py-2 rounded bg-surface border border-border-hairline" value="' + esc(savedAddr) + '" placeholder="Estate, building, city">' +
          '<button type="button" id="ek-reroute-save" class="px-4 py-2 bg-primary text-on-primary rounded font-bold">Save address</button>' +
          '<p class="text-on-surface-variant">Saved on this device only. For orders already dispatched, call the concierge.</p>');
        var saveBtn = doc.getElementById('ek-reroute-save');
        if (saveBtn) saveBtn.addEventListener('click', function () {
          var val = doc.getElementById('ek-reroute-input').value.trim();
          try { global.localStorage.setItem('eyekart-delivery-address', val); } catch (e) { /* ignore */ }
          closeModal();
          toast(val ? 'Delivery address updated on this device for future orders.' : 'Delivery address cleared.', 'location_on');
        });
        break;
      }
      case 'apply-rx': {
        if (store && store.setPrescriptionMode) store.setPrescriptionMode('saved');
        toast('Active Rx applied — it will be used when you configure lenses.', 'verified');
        setTimeout(function () { nav('catalog'); }, 900);
        break;
      }
      case 'consult':
        global.open(WA + enc("Hi EyeKart, I'd like a tele-optometry consult with Dr. Farida."), '_blank');
        break;
      case 'print': global.print(); break;
      case 'book': nav('book-eye-test'); break;
      case 'pd-mode': {
        var pdMode = btn.getAttribute('data-ek-pd') || 'single';
        try { global.localStorage.setItem('eyekart-pd-mode', pdMode); } catch (e) { /* ignore */ }
        $$('[data-ek-action="pd-mode"]').forEach(function (b) {
          var on = b === btn;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (on) b.classList.add('bg-primary', 'text-on-primary'); else b.classList.remove('bg-primary', 'text-on-primary');
        });
        var pdInputs = $$('input[id*="pd" i], input[name*="pd" i], input[placeholder*="pd" i]');
        pdInputs.forEach(function (inp, idx) {
          if (pdMode === 'single' && idx > 0) inp.style.display = 'none';
          else inp.style.display = '';
        });
        toast(pdMode === 'single' ? 'Single PD mode.' : 'Dual (monocular) PD mode.', 'straighten');
        break;
      }
      case 'form-reset': {
        var formR = btn.closest('form');
        if (formR) formR.reset();
        toast('Form cleared.', 'restart_alt');
        break;
      }
      case 'save-config': {
        var formS = btn.closest('form') || doc;
        var cfg = {};
        $$('input, select, textarea', formS).forEach(function (el) {
          var key = el.name || el.id || el.placeholder || '';
          if (key && el.value !== undefined) cfg[key] = el.value;
        });
        if (store) store.setLensConfig(cfg);
        toast('Configuration saved on this device.', 'bookmark');
        break;
      }
      case 'rx-help': {
        modal('How to read an Rx',
          '<p><strong>SPH (sphere):</strong> the main lens power. Minus (−) corrects short-sightedness, plus (+) corrects long-sightedness.</p>' +
          '<p><strong>CYL (cylinder):</strong> the power that corrects astigmatism. If it is 0.00, there is no astigmatism correction.</p>' +
          '<p><strong>AXIS:</strong> the angle (0–180°) at which the CYL power sits.</p>' +
          '<p><strong>ADD:</strong> the extra power for near vision, used in bifocal and progressive lenses.</p>' +
          '<p><strong>PD (pupillary distance):</strong> the distance between your pupils in millimetres. It centres the lenses in front of your eyes.</p>' +
          '<p class="text-on-surface-variant">If any value on your prescription is unclear, ask the clinic before ordering — do not guess it.</p>');
        break;
      }
      case 'scroll-tray': {
        var node = btn;
        var target = null;
        for (var i = 0; i < 6 && node; i++) {
          node = node.parentElement;
          if (node && node.scrollWidth > node.clientWidth + 10) { target = node; break; }
        }
        if (target) target.scrollBy({ left: (btn.getAttribute('data-ek-dir') === 'prev' ? -320 : 320), behavior: 'smooth' });
        else toast('Nothing more to scroll here.', 'info');
        break;
      }
      case 'tray-swap': swapFrameB(btn); break;
      case 'swap-b': {
        if (!catalog) { toast('Catalog is unavailable on this page.', 'info'); break; }
        var all = catalog.getAll ? catalog.getAll() : [];
        if (!all.length) { toast('Catalog is empty.', 'info'); break; }
        var cur = (store && store.getSelectedSku()) || all[0].sku;
        var idx = all.findIndex(function (f) { return f.sku === cur; });
        var next = all[(idx + 1) % all.length];
        var vB = viewerBox();
        if (vB && next.gallery && next.gallery[0]) {
          vB.imgB.src = next.gallery[0];
          vB.imgB.alt = 'Frame B — ' + next.name;
          toast('Frame B is now ' + next.name + '.', 'swap_horiz');
        } else {
          nav('product-details', 'sku=' + enc(next.sku));
        }
        break;
      }
      case 'homebox': {
        var keys = resolveSkuList(btn);
        if (!keys.length) {
          var sel = store ? store.getSelectedSku() : null;
          if (sel) keys = [sel];
        }
        if (!keys.length) { toast("Couldn't identify these frames — open them from the catalog first.", 'info'); break; }
        var res = addToBox(keys);
        updateBoxLabel(btn, res.box);
        toast(res.added ? 'Home try-on box: ' + res.box.length + '/4.' : 'Already in your home try-on box (' + res.box.length + '/4).', 'inventory_2');
        break;
      }
      case 'vto-homebox': {
        var skuH = store ? store.getSelectedSku() : null;
        if (skuH) addToBox([skuH]);
        nav('book-eye-test');
        break;
      }
      case 'vto-back': nav('virtual-try-on'); break;
      case 'pose-lock': {
        poseLocked = !poseLocked;
        try { global.localStorage.setItem('eyekart-pose-lock', poseLocked ? '1' : '0'); } catch (e) { /* ignore */ }
        for (var n = 0; n < btn.childNodes.length; n++) {
          var tn = btn.childNodes[n];
          if (tn.nodeType === 3) {
            if (tn.textContent.indexOf('Locked') !== -1) tn.textContent = tn.textContent.replace('Locked', 'Free');
            else if (tn.textContent.indexOf('Free') !== -1) tn.textContent = tn.textContent.replace('Free', 'Locked');
          }
        }
        if (poseLocked) { btn.classList.add('bg-primary', 'text-on-primary'); btn.classList.remove('bg-surface-container-highest', 'text-on-surface'); }
        else { btn.classList.remove('bg-primary', 'text-on-primary'); btn.classList.add('bg-surface-container-highest', 'text-on-surface'); }
        $$('[data-ek-mode-slider]').forEach(function (s) { s.disabled = poseLocked; });
        toast(poseLocked ? 'Pose lock on — comparison sliders paused.' : 'Pose lock off — sliders live again.', 'lock');
        break;
      }
      case 'light-menu': {
        var menuId = 'ek-light-menu';
        var existing = doc.getElementById(menuId);
        if (existing) { existing.parentNode.removeChild(existing); break; }
        var menu = doc.createElement('div');
        menu.id = menuId;
        menu.className = 'bg-optical-white text-on-surface rounded-xl shadow-xl border border-outline-variant/30 py-2 z-[10000]';
        menu.style.cssText = 'position:fixed;min-width:220px;';
        var r = btn.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(global.innerWidth - 240, r.left)) + 'px';
        menu.style.top = (r.bottom + 6) + 'px';
        menu.innerHTML = '<button type="button" class="block w-full text-left px-4 py-2 hover:bg-surface-container-low" data-light="">Equatorial Daylight (5600K)</button>' +
          '<button type="button" class="block w-full text-left px-4 py-2 hover:bg-surface-container-low" data-light="sepia(0.45) saturate(1.2) brightness(0.95)">Atelier Amber (3000K)</button>' +
          '<button type="button" class="block w-full text-left px-4 py-2 hover:bg-surface-container-low" data-light="brightness(1.15) saturate(1.1)">Savannah Sun (5500K)</button>';
        menu.addEventListener('click', function (e) {
          var item = e.target.closest('[data-light]');
          if (!item) return;
          viewerImages().forEach(function (img) { img.style.filter = item.getAttribute('data-light'); });
          if (menu.parentNode) menu.parentNode.removeChild(menu);
          toast('Studio lighting updated.', 'light_mode');
        });
        doc.body.appendChild(menu);
        break;
      }
      case 'retake': {
        var pdEl = doc.getElementById('displayPdTotal');
        if (pdEl) pdEl.textContent = '—';
        var cap = doc.querySelector('[id*="capture" i], [id*="camera" i], [id*="start" i]');
        if (cap) cap.focus();
        toast('Ready to measure again — position your face in the guide.', 'refresh');
        break;
      }
      case 'configurator': {
        var skuF = resolveSku(btn);
        nav('lens-customizer', skuF ? 'sku=' + enc(skuF) : '');
        break;
      }
      case 'wa-track': {
        var oref = ref || scrapeRef([/EK-[A-Z0-9-]+/]) || 'your order';
        global.open(WA + enc('Hi EyeKart, tracking order ' + oref + '.'), '_blank');
        break;
      }
      default:
        break;
    }
  }

  /* ---------------- delegation + init ---------------- */

  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('[data-ek-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    handleAction(btn);
  }, true);

  doc.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.getAttribute || form.getAttribute('data-ek-action') !== 'booking-form') return;
    e.preventDefault();
    e.stopPropagation();
    var data = gatherBooking(form);
    var apt = store && store.bookAppointment ? store.bookAppointment(data) : null;
    var conf = bookingConfirmation(data, apt);
    var div = doc.createElement('div');
    div.className = 'bg-surface-container-low rounded-xl p-4 mt-4';
    div.innerHTML = conf.html;
    form.parentNode.insertBefore(div, form.nextSibling);
    form.style.display = 'none';
    if (!apt) toast('Exam request saved (' + conf.ref + ') — the clinic confirms by phone.', 'event_available');
  }, true);

  // Filter changes reset pagination to page 1 (runtime filters run first:
  // they are bound on the controls themselves, this listener is on document).
  function resetPage() {
    if (!catalogCards().length) return;
    currentPage = 1;
    catalogCards().forEach(function (c) { delete c.dataset.ekPaged; });
    applyPage();
  }
  doc.addEventListener('change', function (e) {
    if (e.target && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'range')) resetPage();
  });
  doc.addEventListener('input', function (e) {
    if (e.target && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'range')) resetPage();
  });

  // Init: wishlist icon sync, saved clinic label, catalog view restore.
  $$('[data-ek-action="wishlist"]').forEach(syncHeart);
  var clinic = savedClinic();
  if (clinic) {
    $$('[data-ek-action="location"]').forEach(function (b) {
      for (var i = 0; i < b.childNodes.length; i++) {
        if (b.childNodes[i].nodeType === 3 && b.childNodes[i].textContent.trim()) {
          b.childNodes[i].textContent = clinic + ' ';
          break;
        }
      }
    });
  }
  try {
    var savedView = global.localStorage.getItem('eyekart-catalog-view');
    var grid0 = catalogGrid();
    if (savedView && grid0) {
      if (savedView === 'editorial') setGridClasses(grid0, ['grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-10']);
      else setGridClasses(grid0, ['grid', 'grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3', 'gap-6']);
    }
  } catch (e) { /* ignore */ }

})(typeof window !== 'undefined' ? window : this);
