(function () {
  'use strict';

  // 100–300 dominate; 400–500 moderate; 600–700 rare anomalies
  const COLORS  = ['#E2E0FC','#BCB8F8','#8C85F3','#5247EE','#0F00E7','#0C00BD','#09008F'];
  const WEIGHTS = [      10,       10,        8,        3,        2,        1,        1];
  const PALETTE = COLORS.flatMap((c, i) => Array(WEIGHTS[i]).fill(c));

  const rndColor = () => PALETTE[(Math.random() * PALETTE.length) | 0];

  function shuffle(len) {
    const a = Array.from({ length: len }, (_, i) => i);
    for (let i = len - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  let canvas, ctx;
  let squares = [], sz = 0, cols = 0, rows = 0;
  let rafId = null;
  let transitioning = false;

  function buildGrid() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const target = vw < 640 ? 28 : vw < 1024 ? 38 : 48;
    cols = Math.max(1, Math.round(vw / target));
    sz   = vw / cols;
    rows = Math.ceil(vh / sz);

    const cw = vw;
    const ch = Math.ceil(rows * sz);

    canvas.width  = cw;
    canvas.height = ch;
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';

    squares = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.round(c * sz);
        const y = Math.round(r * sz);
        const w = Math.round((c + 1) * sz) - x;
        const h = Math.round((r + 1) * sz) - y;
        squares.push({ x, y, w, h, color: rndColor(), on: false });
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of squares) {
      if (!s.on) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
  }

  function fillAll() {
    for (const s of squares) { s.on = true; s.color = rndColor(); }
  }

  // Encode grid colors as compact digit string (one digit per square = palette index)
  function saveGridColors() {
    const encoded = squares.map(s => {
      const i = COLORS.indexOf(s.color);
      return i < 0 ? 0 : i;
    }).join('');
    sessionStorage.setItem('px-grid-colors', encoded);
  }

  // Restore exact colors saved from the previous page — makes the grid continuous
  function restoreGridColors() {
    const encoded = sessionStorage.getItem('px-grid-colors');
    sessionStorage.removeItem('px-grid-colors');
    if (!encoded) return false;

    for (let i = 0; i < Math.min(encoded.length, squares.length); i++) {
      squares[i].color = COLORS[+encoded[i]] || rndColor();
      squares[i].on = true;
    }
    // Fill any extra squares (viewport edge case) with random colors
    for (let i = encoded.length; i < squares.length; i++) {
      squares[i].color = rndColor();
      squares[i].on = true;
    }
    return true;
  }

  // ── animation primitives ──────────────────────────────────────────────────

  function animReveal(ms) {
    const order = shuffle(squares.length);
    const total = order.length;
    const t0 = performance.now();
    let ptr = 0;

    return new Promise(resolve => {
      function tick(now) {
        const target = Math.min(total, Math.floor(((now - t0) / ms) * total));
        while (ptr < target) squares[order[ptr++]].on = false;
        render();
        if (ptr < total) rafId = requestAnimationFrame(tick);
        else             { rafId = null; resolve(); }
      }
      rafId = requestAnimationFrame(tick);
    });
  }

  function animCover(ms) {
    for (const s of squares) { s.on = false; s.color = rndColor(); }
    const order = shuffle(squares.length);
    const total = order.length;
    const t0 = performance.now();
    let ptr = 0;

    return new Promise(resolve => {
      function tick(now) {
        const target = Math.min(total, Math.floor(((now - t0) / ms) * total));
        while (ptr < target) squares[order[ptr++]].on = true;
        render();
        if (ptr < total) rafId = requestAnimationFrame(tick);
        else             { rafId = null; resolve(); }
      }
      rafId = requestAnimationFrame(tick);
    });
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ── high-level sequences ──────────────────────────────────────────────────

  async function runPreloader() {
    canvas.style.display = 'block';
    fillAll();
    render();
    await animReveal(2500);
    canvas.style.display = 'none';
  }

  async function runTransitionIn() {
    canvas.style.display = 'block';
    // Restore the exact grid the outgoing page ended with → seamless continuation
    const restored = restoreGridColors();
    if (!restored) fillAll();
    render();
    await animReveal(1500);
    canvas.style.display = 'none';
    transitioning = false;
  }

  async function runTransitionOut(href) {
    if (transitioning) return;
    transitioning = true;

    stop();
    canvas.style.display = 'block';
    await animCover(500);

    // Persist the grid state so the incoming page can start from the same frame
    saveGridColors();
    sessionStorage.setItem('px-transition', '1');
    window.location.href = href;
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  function setupLinks() {
    document.querySelectorAll('[data-transition]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        runTransitionOut(el.getAttribute('href'));
      });
    });
  }

  function init() {
    canvas = document.createElement('canvas');
    ctx    = canvas.getContext('2d');

    Object.assign(canvas.style, {
      position:      'fixed',
      top:           '0',
      left:          '0',
      zIndex:        '9999',
      pointerEvents: 'none',
      display:       'none'
    });

    document.body.appendChild(canvas);
    buildGrid();
    window.addEventListener('resize', () => { stop(); buildGrid(); });
    setupLinks();

    if (sessionStorage.getItem('px-transition')) {
      sessionStorage.removeItem('px-transition');
      runTransitionIn();
    } else {
      runPreloader();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
