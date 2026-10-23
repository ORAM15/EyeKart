/* ============================================================================
   EyeKart Motion 3D — scroll-unfold reveals + pointer-parallax tilt cards
   ----------------------------------------------------------------------------
   Pattern reference (from lens2cart.com's own source, inspected 2026-10-23):
   their "3D" feel comes from card sections built with
     perspective: 900px, transform-style: preserve-3d,
     transform: rotateX(var(--parallax-rotate-x)) rotateY(var(--parallax-rotate-y))
                translate3d(0, var(--parallax-lift), 0),
     layered children at translateZ(18px), ~320ms cubic transitions,
   disabled under (prefers-reduced-motion) and (hover: none).
   This engine implements the same class of effect with EyeKart's own code,
   and adds the scroll "unfold" the shopper sees while travelling the page:
   cards start folded (rotateX(-26deg), origin top) and unfold flat as they
   enter the viewport, staggered per grid row.
   Works on any page; no WebGL required; degrades to a static page.
   ============================================================================ */
(function (global) {
  'use strict';

  const TILT_DEG = 7;          // max card tilt, degrees (theirs is subtle too)
  const FOLD_DEG = -26;        // unfold start angle
  const LIFT_PX = -3;          // hover lift (matches their --parallax-lift)

  const CSS = `
    .ek-3d {
      transform: perspective(900px)
                 rotateX(calc(var(--fold-rx, 0deg) + var(--tilt-rx, 0deg)))
                 rotateY(var(--tilt-ry, 0deg))
                 translateY(calc(var(--fold-ty, 0px) + var(--lift-ty, 0px)));
      transform-style: preserve-3d;
      transition: transform 520ms cubic-bezier(.2, .75, .25, 1), box-shadow 320ms ease;
      will-change: transform;
    }
    .ek-3d.ek-folded { --fold-rx: ${FOLD_DEG}deg; --fold-ty: 26px; opacity: 0; }
    .ek-3d.ek-in { --fold-rx: 0deg; --fold-ty: 0px; opacity: 1;
      transition: transform 850ms cubic-bezier(.2, .7, .2, 1), opacity 600ms ease; }
    .ek-3d .ek-layer-img { transform: translateZ(22px); transform-style: preserve-3d; }
    .ek-3d.ek-tilting { box-shadow: 0 24px 44px rgba(10, 20, 35, 0.16); }
    @media (prefers-reduced-motion: reduce) {
      .ek-3d { transition: none; --fold-rx: 0deg; --fold-ty: 0px; opacity: 1; }
    }
  `;

  class EyeKartMotion3D {
    constructor() {
      this.reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.canHover = !!(global.matchMedia && global.matchMedia('(hover: hover) and (pointer: fine)').matches);
      this.observed = new WeakSet();
    }

    init() {
      const doc = global.document;
      if (!doc || doc.getElementById('ek-motion-3d-css')) return;
      const style = doc.createElement('style');
      style.id = 'ek-motion-3d-css';
      style.textContent = CSS;
      doc.head.appendChild(style);
      this._scan();
      // SPA panels re-render content; pick up new cards as they appear.
      if (global.MutationObserver) {
        let queued = false;
        new MutationObserver(() => {
          if (queued) return; queued = true;
          requestAnimationFrame(() => { queued = false; this._scan(); });
        }).observe(doc.body, { childList: true, subtree: true });
      }
    }

    _targets() {
      const doc = global.document;
      const set = new Set();
      doc.querySelectorAll('[data-sku]').forEach(el => {
        // product cards: sized containers that hold an image
        if (el.querySelector && el.querySelector('img') && el.offsetHeight > 80) set.add(el);
      });
      doc.querySelectorAll('main .grid > *, main section .grid > *').forEach(el => {
        if (el.querySelector && el.querySelector('img') && el.offsetHeight > 80 && !el.closest('header')) set.add(el);
      });
      return Array.from(set);
    }

    _scan() {
      const io = ('IntersectionObserver' in global) && !this.reduced
        ? new IntersectionObserver(entries => {
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              const el = e.target;
              const idx = Number(el.dataset.ekIdx || 0);
              el.style.transitionDelay = `${Math.min((idx % 6) * 60, 300)}ms`;
              el.classList.add('ek-in');
              io.unobserve(el);
            });
          }, { threshold: 0.12 })
        : null;

      this._targets().forEach((el, i) => {
        if (this.observed.has(el)) return;
        this.observed.add(el);
        el.dataset.ekIdx = i;
        el.classList.add('ek-3d');
        const img = el.querySelector('img');
        if (img) img.classList.add('ek-layer-img');
        if (this.reduced || !io) { el.classList.add('ek-in'); }
        else { el.classList.add('ek-folded'); io.observe(el); }
        if (this.canHover && !this.reduced) this._bindTilt(el);
      });
    }

    _bindTilt(el) {
      let raf = null;
      const inner = el; // vars live on the card itself
      const setVars = (rx, ry, lift) => {
        inner.style.setProperty('--tilt-rx', rx.toFixed(2) + 'deg');
        inner.style.setProperty('--tilt-ry', ry.toFixed(2) + 'deg');
        inner.style.setProperty('--lift-ty', lift + 'px');
      };
      el.addEventListener('pointermove', (ev) => {
        if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const x = ((ev.clientX - r.left) / r.width - 0.5) * 2;
        const y = ((ev.clientY - r.top) / r.height - 0.5) * 2;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.classList.add('ek-tilting');
          setVars(-y * TILT_DEG, x * TILT_DEG, LIFT_PX);
        });
      });
      const reset = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { el.classList.remove('ek-tilting'); setVars(0, 0, 0); });
      };
      el.addEventListener('pointerleave', reset);
      el.addEventListener('pointercancel', reset);
    }
  }

  const motion = new EyeKartMotion3D();
  global.EyeKartMotion3D = motion;
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => motion.init());
    } else motion.init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
