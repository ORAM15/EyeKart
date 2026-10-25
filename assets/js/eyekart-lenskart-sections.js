/* EyeKart Lenskart-oriented discovery sections (homepage only).
 *
 * Patterns borrowed from lenskart.com, adapted to EyeKart's real data:
 *  - "Find your shape": shape tiles derived from catalog-data.js shapes
 *    (counts are real; tiles link to the catalog page).
 *  - "Material stories": material families derived by keyword from the
 *    catalog's own material strings. No thickness figures are claimed:
 *    Lenskart publishes thicknesses (e.g. Titanium TI - 0.6 MM) for its
 *    own materials; EyeKart's catalog carries no such measurements, so
 *    none are shown here.
 *  - "Try @ Home": promotes EyeKart's EXISTING in-home offer (footer:
 *    "Select 4 frames for complimentary Nairobi In-Home Fitting") and
 *    the 28-point eye exam booking. No Lenskart numbers (7 frames,
 *    150+ frames) are copied — those are theirs, not EyeKart's.
 */
(function (global) {
  var SHAPE_NAMES = {
    'round': 'Round', 'octagonal': 'Octagonal', 'aviator': 'Aviator',
    'browline': 'Browline', 'square': 'Square', 'cat-eye': 'Cat Eye',
    'rimless': 'Rimless', 'rectangle': 'Rectangle',
    'semi-rimless': 'Semi-Rimless', 'wayfarer': 'Wayfarer',
    'geometric': 'Geometric', 'clubmaster': 'Clubmaster'
  };

  function familyOf(material) {
    var m = (material || '').toLowerCase();
    if (m.indexOf('titanium') !== -1) return 'Titanium';
    if (m.indexOf('acetate') !== -1 || m.indexOf('mazzucchelli') !== -1) return 'Acetate';
    if (m.indexOf('horn') !== -1) return 'Horn';
    if (m.indexOf('nylon') !== -1) return 'Nylon';
    if (m.indexOf('polymer') !== -1 || m.indexOf('tr90') !== -1) return 'Memory Polymer';
    if (m.indexOf('steel') !== -1 || m.indexOf('stainless') !== -1) return 'Stainless Steel';
    return 'Atelier Blends';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function sectionHtml(eyebrow, title, sub, inner) {
    return '<section class="w-full py-16 ek-warm"><div class="max-w-7xl mx-auto px-gutter">' +
      '<p class="ek-eyebrow">' + eyebrow + '</p>' +
      '<h2 class="ek-display" style="font-size:clamp(32px,5vw,54px);font-weight:700;margin:8px 0;">' + title + '</h2>' +
      '<p style="color:#555;max-width:640px;">' + sub + '</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:24px;">' + inner + '</div>' +
      '</div></section>';
  }

  function init() {
    var svc = global.CatalogService;
    if (!svc || !svc.getAll) return;
    var hero = document.querySelector('main section');
    if (!hero || document.getElementById('ek-shape-section')) return;
    var products = svc.getAll().filter(function (p) { return p && p.sku; });
    if (!products.length) return;

    // Shapes with real counts.
    var shapes = {};
    products.forEach(function (p) {
      if (p.shape) shapes[p.shape] = (shapes[p.shape] || 0) + 1;
    });
    var shapeTiles = Object.keys(shapes).sort().map(function (shape) {
      var label = SHAPE_NAMES[shape] || shape;
      return '<a data-path="eyeglasses-collection" href="#" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 16px;display:block;">' +
        '<span style="font-family:Georgia,serif;font-size:22px;font-weight:700;">' + esc(label) + '</span>' +
        '<span style="display:block;color:#666;margin-top:4px;">' + shapes[shape] + ' frame' + (shapes[shape] === 1 ? '' : 's') + ' · Explore →</span></a>';
    }).join('');

    // Material families with a real example line each.
    var mats = {};
    products.forEach(function (p) {
      var fam = familyOf(p.material);
      if (!mats[fam]) mats[fam] = { count: 0, example: p.material || '' };
      mats[fam].count += 1;
    });
    var matTiles = Object.keys(mats).sort().map(function (fam) {
      return '<a data-path="eyeglasses-collection" href="#" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 16px;display:block;">' +
        '<span style="font-family:Georgia,serif;font-size:22px;font-weight:700;">' + esc(fam) + '</span>' +
        '<span style="display:block;color:#666;margin-top:4px;">' + mats[fam].count + ' frame' + (mats[fam].count === 1 ? '' : 's') + '</span>' +
        '<span style="display:block;color:#888;font-size:13px;margin-top:6px;">' + esc(mats[fam].example) + '</span></a>';
    }).join('');

    var tryAtHome =
      '<section id="ek-try-at-home" class="w-full py-16" style="scroll-margin-top:140px;background:#0b1c30;color:#fff;"><div class="max-w-7xl mx-auto px-gutter">' +
      '<p class="ek-eyebrow" style="color:#9fb3c8;">Try @ Home</p>' +
      '<h2 class="ek-display" style="font-size:clamp(32px,5vw,54px);font-weight:700;margin:8px 0;">We come to you.</h2>' +
      '<p style="color:#cbd5e1;max-width:640px;">The eye test and the fitting, at your home or office in Nairobi — no clinic trip required.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:24px;">' +
      '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:22px;"><h3 style="font-family:Georgia,serif;font-size:22px;">Free Eye Test</h3>' +
      '<p style="color:#cbd5e1;margin-top:8px;">Book the 28-point optical exam at home, performed by EyeKart clinicians.</p>' +
      '<a data-path="book-eye-test" href="#" style="display:inline-block;margin-top:14px;background:#fff;color:#0b1c30;font-weight:700;padding:10px 18px;border-radius:8px;">Book Appointment →</a></div>' +
      '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:22px;"><h3 style="font-family:Georgia,serif;font-size:22px;">Try Before You Buy</h3>' +
      '<p style="color:#cbd5e1;margin-top:8px;">Select 4 frames for complimentary Nairobi in-home fitting, and choose with them on your own face.</p>' +
      '<a data-path="eyeglasses-collection" href="#" style="display:inline-block;margin-top:14px;background:#fff;color:#0b1c30;font-weight:700;padding:10px 18px;border-radius:8px;">Choose Your 4 Frames →</a></div>' +
      '</div></div></section>';

    var wrap = document.createElement('div');
    wrap.innerHTML =
      sectionHtml('Find Your Shape', 'Find your shape.', 'Not sure where to start? Narrow by the silhouette that suits your face — every count below is a real frame in the catalog.', shapeTiles) +
      sectionHtml('Material Stories', 'Material stories.', 'What a frame is made of decides how it feels all day. These are the material families EyeKart actually stocks.', matTiles) +
      tryAtHome;
    hero.parentNode.insertBefore(wrap, hero.nextSibling);

    // Header nav entry for the new section (plain anchor: the SPA router
    // only intercepts [data-path] links, so this scrolls normally).
    var navRow = document.querySelector('header nav + div, header .flex.items-center.gap-5');
    if (navRow && !document.getElementById('ek-try-at-home-link')) {
      var a = document.createElement('a');
      a.id = 'ek-try-at-home-link';
      a.href = '#ek-try-at-home';
      a.className = 'flex items-center gap-1.5 font-label-md text-label-md text-secondary hover:text-cyan-accent transition-colors';
      a.innerHTML = '<span class="material-symbols-outlined text-[18px]">home</span><span>Try @ Home</span>';
      navRow.insertBefore(a, navRow.firstChild);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
