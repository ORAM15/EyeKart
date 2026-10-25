/* EyeKart photo hero (Lens2Cart-standard rebuild).
 *
 * The homepage hero is a photograph, not a 3D render: a studio portrait
 * plus a featured-frame card. The finish dots below it are driven by the
 * real catalog variants for EK-902 (all KSh 18,500 in catalog-data.js) —
 * this also corrects the old static swatch prices, which claimed
 * KSh 21,500 / 19,800 / 17,900 for finishes that do not exist at those
 * prices in the catalog. Picking a finish updates the label and, when the
 * store API is present, the active variant used by Try On. The dots never
 * fake a new photograph: there is one portrait, and the finish is a
 * selection, not a rendered recolour.
 */
(function (global) {
  function fmt(n) {
    return 'KSh ' + Number(n).toLocaleString('en-KE');
  }

  function init() {
    var svc = global.CatalogService;
    var prod = svc && svc.getBySku ? svc.getBySku('EK-902') : null;
    var nameEl = document.getElementById('hero-finish-name');
    var priceEl = document.getElementById('hero-price');
    var skuEl = document.getElementById('hero-model-sku');
    if (prod) {
      if (skuEl) skuEl.textContent = 'EK-902 · ' + (prod.name || 'Kibera Minimalist Titanium').toUpperCase();
      if (priceEl) priceEl.textContent = fmt(prod.price);
    }
    var dots = document.getElementById('hero-finish-dots');
    if (!dots) return;
    var btns = dots.querySelectorAll('.swatch-btn');
    // Rebuild dots from catalog variants when available, so names, colours
    // and prices can never drift from catalog-data.js again.
    if (prod && Array.isArray(prod.variants) && prod.variants.length) {
      dots.innerHTML = '';
      prod.variants.forEach(function (v, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch-btn w-7 h-7 rounded-full transition-transform hover:scale-110' +
          (i === 1 ? ' ring-2 ring-primary ring-offset-2' : ' ring-1 ring-outline-variant');
        b.style.background = v.colorHex || '#202224';
        b.title = v.name;
        b.setAttribute('data-finish', v.name);
        b.setAttribute('data-price', fmt(v.price != null ? v.price : prod.price));
        dots.appendChild(b);
      });
      btns = dots.querySelectorAll('.swatch-btn');
    }
    function select(btn) {
      btns.forEach(function (x) {
        x.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        x.classList.add('ring-1', 'ring-outline-variant');
      });
      btn.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      btn.classList.remove('ring-1', 'ring-outline-variant');
      var finish = btn.getAttribute('data-finish');
      var price = btn.getAttribute('data-price');
      if (nameEl && finish) nameEl.textContent = finish;
      if (priceEl && price) priceEl.textContent = price;
      // Instant feedback: the featured card crossfades on every swap so
      // the selection feels alive (the photo itself is not faked — there
      // is one portrait, and the finish is a selection, not a recolour).
      var thumb = document.getElementById('hero-frame-img');
      var bar = thumb && thumb.parentElement;
      if (bar) {
        bar.classList.remove('ek-swap-pulse');
        void bar.offsetWidth;
        bar.classList.add('ek-swap-pulse');
      }
      if (global.EyeKartStore && global.EyeKartStore.setActiveVariant && finish) {
        try { global.EyeKartStore.setActiveVariant(finish); } catch (e) {}
      }
    }
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () { select(btn); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
