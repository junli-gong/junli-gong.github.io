/* ══════════════════════════════════════════════════════════════
   Tiled GEMM wavefront
   ──────────────────────────────────────────────────────────────
   A block-tiled output matrix, drawn as a lattice of small tiles.
   Tiles complete along anti-diagonals — the order a wavefront
   schedule would finish them — and the front advances as the
   reader scrolls. A handful of tiles are routed "off-device" and
   drawn hollow; the cursor warms whatever tiles it passes over.
   ══════════════════════════════════════════════════════════════ */

(function () {
  var host = document.querySelector('.field');
  if (!host) return;

  var cv = document.createElement('canvas');
  host.appendChild(cv);
  var ctx = cv.getContext('2d', { alpha: true });

  var calm  = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hover = matchMedia('(hover: hover)').matches;

  /* ── lattice ────────────────────────────────────────────── */
  var COLS = 22, ROWS = 34;          // tiles across / down the visible field
  var CELL = 0, PAD = 0, OX = 0, OY = 0;
  var W = 0, H = 0, dpr = 1;

  /* deterministic pseudo-random per tile, so the pattern is stable */
  function hash(i, j) {
    var n = (i * 73856093) ^ (j * 19349663);
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  /* ── wavefront progress ─────────────────────────────────── */
  var progress = 0.08;               // fraction of anti-diagonals completed
  var DIAGS = COLS + ROWS - 1;

  /* ── cursor warmth ──────────────────────────────────────── */
  var cx = -1e4, cy = -1e4, warm = 0;
  var tcx = -1e4, tcy = -1e4, twarm = 0;

  /* ── draw ───────────────────────────────────────────────── */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    var front = progress * DIAGS;

    for (var j = 0; j < ROWS; j++) {
      for (var i = 0; i < COLS; i++) {
        var x = OX + i * (CELL + PAD), y = OY + j * (CELL + PAD);
        var d = i + j;                          // anti-diagonal index
        var r = hash(i, j);
        var done = d < front;                   // behind the front: computed
        var edge = Math.abs(d - front) < 1.2;   // on the front: in flight
        var remote = r > 0.86;                  // a few tiles live on another device

        /* base lattice: faint outline for every tile */
        ctx.strokeStyle = 'rgba(138,28,46,0.16)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

        if (done) {
          /* completed tiles: filled, fading a little with distance behind the front */
          var back = Math.min(1, (front - d) / 14);
          var a = remote ? 0 : 0.30 - 0.16 * back + 0.10 * r;
          if (a > 0) {
            ctx.fillStyle = 'rgba(138,28,46,' + a.toFixed(3) + ')';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          }
          if (remote) {
            /* off-device tile: hollow with a heavier outline */
            ctx.strokeStyle = 'rgba(138,28,46,0.42)';
            ctx.lineWidth = 1.1;
            ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
          }
        }

        if (edge) {
          /* the wavefront itself: a brighter frame */
          ctx.strokeStyle = 'rgba(138,28,46,0.62)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        }

        /* cursor warmth: a soft radial bump around the pointer */
        if (warm > 0.01) {
          var ddx = (x + CELL / 2) - cx, ddy = (y + CELL / 2) - cy;
          var g = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * 90 * 90)) * warm;
          if (g > 0.02) {
            ctx.fillStyle = 'rgba(176,69,90,' + (0.34 * g).toFixed(3) + ')';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          }
        }
      }
    }

    /* the front as a thin anti-diagonal line across the lattice */
    var s = CELL + PAD;
    var fx0 = OX + (front) * s, fy0 = OY;
    var fx1 = OX,               fy1 = OY + (front) * s;
    ctx.strokeStyle = 'rgba(138,28,46,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(fx0, fy0);
    ctx.lineTo(fx1, fy1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── loop ───────────────────────────────────────────────── */
  var running = false;

  function frame() {
    var moved = false;
    cx   += (tcx - cx) * 0.12;
    cy   += (tcy - cy) * 0.12;
    warm += (twarm - warm) * 0.08;
    if (Math.abs(tcx - cx) > 0.5 || Math.abs(tcy - cy) > 0.5 || Math.abs(twarm - warm) > 0.004) moved = true;
    draw();
    if (moved) requestAnimationFrame(frame);
    else running = false;
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

  function resize() {
    var r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* size the lattice so it overfills the field slightly and sits flush right */
    var s = Math.ceil(Math.max(W / COLS, H / ROWS) * 1.04);
    PAD = Math.max(3, Math.round(s * 0.22));
    CELL = s - PAD;
    OX = W - COLS * s + PAD;   // flush to the right edge (the visible side)
    OY = -Math.round(s * 0.4);
    draw();
  }

  function scroll() {
    var max = document.documentElement.scrollHeight - innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    var target = 0.08 + 0.92 * p;
    if (Math.abs(target - progress) < 0.002) return;
    progress = target;
    if (!running) draw();
  }

  if (hover && !calm) {
    addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      tcx = e.clientX - r.left;
      tcy = e.clientY - r.top;
      twarm = 1;
      kick();
    }, { passive: true });
    addEventListener('pointerleave', function () { twarm = 0; kick(); }, { passive: true });
  }

  addEventListener('resize', resize, { passive: true });
  addEventListener('scroll', scroll, { passive: true });

  if (calm) progress = 1;
  resize();
  scroll();
})();
