/* EyeKart theme toggle: dark mode for the whole site.
 *
 * Navigation here is full page loads (the router sets
 * window.location.href), so the choice must survive across documents:
 * it lives in localStorage under "eyekart-theme". First visit with no
 * saved choice follows the device's prefers-color-scheme.
 *
 * Anti-flash: each panel also carries a tiny inline <script> right
 * after <head> that applies the saved class before first paint. This
 * file re-applies the same decision (same key, same logic) and owns
 * the toggle button, so the two can never disagree.
 */
(function (global) {
  'use strict';

  var KEY = 'eyekart-theme';

  function saved() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function systemDark() {
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolve() {
    var s = saved();
    if (s === 'dark' || s === 'light') return s;
    return systemDark() ? 'dark' : 'light';
  }

  function apply(mode) {
    global.document.documentElement.classList.toggle('dark', mode === 'dark');
    var btn = global.document.getElementById('ek-theme-toggle');
    if (btn) {
      btn.textContent = mode === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = btn.getAttribute('aria-label');
    }
  }

  function mount() {
    var doc = global.document;
    if (doc.getElementById('ek-theme-toggle')) { apply(resolve()); return; }
    var btn = doc.createElement('button');
    btn.id = 'ek-theme-toggle';
    btn.type = 'button';
    btn.className = 'ek-theme-toggle';
    btn.addEventListener('click', function () {
      var next = doc.documentElement.classList.contains('dark') ? 'light' : 'dark';
      try { global.localStorage.setItem(KEY, next); } catch (e) { /* private mode: session-only */ }
      apply(next);
    });
    doc.body.appendChild(btn);
    apply(resolve());
  }

  apply(resolve());
  if (docReady()) mount();
  else global.document.addEventListener('DOMContentLoaded', mount);

  function docReady() {
    return global.document.readyState !== 'loading';
  }
})(typeof window !== 'undefined' ? window : this);
