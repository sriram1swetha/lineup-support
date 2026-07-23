/* ConnectDaDots — Game Maker: image → dots + segments → template JSON.
 *
 * v2 — contour-first, on OpenCV.js (robust denoise + threshold + findContours +
 * area filtering that kills photo/texture noise). Tuned for clean art first;
 * real photos will add a subject-isolation (SAM) pre-step later.
 *
 * Pipeline: RGBA→gray → GaussianBlur (denoise) → Otsu threshold → open (despeckle)
 *   → findContours → DROP tiny contours by area/length → approxPolyDP (dots)
 *   → per-edge line vs cubic-Bézier (fit through the sub-arc midpoint)
 *   → dedup dots → template JSON, auto-simplified to stay under the dot cap.
 *
 * Coordinate contract (matches the app): unit = (pixel − center) × 2 / max(W,H).
 * Requires a ready global `cv` (OpenCV.js) — the page gates Detect until then.
 */
window.Detector = (function () {
  'use strict';
  const round3 = (v) => Math.round(v * 1000) / 1000;

  // ── geometry helpers ────────────────────────────────────────────────────
  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
  }
  // cubic bézier a→b through m at t=0.5 (mirrors app's controlPoints(from:to:through:))
  function bezierThrough(a, b, m) {
    const Sx = (8 * m[0] - a[0] - b[0]) / 3, Sy = (8 * m[1] - a[1] - b[1]) / 3;
    const t1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
    const t2 = [a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3];
    const dx = (Sx - (t1[0] + t2[0])) / 2, dy = (Sy - (t1[1] + t2[1])) / 2;
    return [[t1[0] + dx, t1[1] + dy], [t2[0] + dx, t2[1] + dy]];
  }

  // ── contour extraction with area filtering ──────────────────────────────
  // Returns [{ verts:[[x,y]…], orig:[[x,y]…], closed:true }] plus debug mats.
  function extractContours(imgData, p) {
    const src = cv.matFromImageData(imgData);
    const gray = new cv.Mat(), bin = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const b = Math.max(1, p.blur | 1);
    if (b >= 3) cv.GaussianBlur(gray, gray, new cv.Size(b, b), 0);
    // Otsu; INV so a dark subject on a light background becomes white foreground.
    cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    // if the "foreground" is most of the frame, the subject was light → invert back
    if (cv.countNonZero(bin) > 0.5 * bin.rows * bin.cols) cv.bitwise_not(bin, bin);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k);   // despeckle

    const contours = new cv.MatVector(), hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);

    const area = imgData.width * imgData.height;
    const minArea = p.minAreaFrac * area;
    const minLen = p.minAreaFrac * (imgData.width + imgData.height) * 4;
    const out = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const a = cv.contourArea(c), per = cv.arcLength(c, true);
      if (a < minArea && per < minLen) { c.delete(); continue; }   // noise → drop
      const orig = [];
      for (let j = 0; j < c.rows; j++) orig.push([c.data32S[j * 2], c.data32S[j * 2 + 1]]);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, Math.max(1, p.approxEps * per), true);
      const verts = [];
      for (let j = 0; j < approx.rows; j++) verts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
      approx.delete(); c.delete();
      if (verts.length >= 2) out.push({ verts, orig, closed: true });
    }
    const debug = { W: imgData.width, H: imgData.height, binary: matToMask(bin) };
    src.delete(); gray.delete(); bin.delete(); k.delete(); contours.delete(); hierarchy.delete();
    return { paths: out, debug };
  }

  function matToMask(mat) {
    const m = new Uint8Array(mat.rows * mat.cols);
    for (let i = 0; i < m.length; i++) m[i] = mat.data[i] ? 1 : 0;
    return m;
  }

  // ── classify each contour edge as line vs bézier, fit curves ────────────
  function fitPath(path, lineTolPx) {
    const { verts, orig, closed } = path;
    // index of each vert within the original contour points
    const vIdx = verts.map((v) => nearestIndex(orig, v));
    const n = verts.length, segs = [];
    const edgeCount = closed ? n : n - 1;
    for (let k = 0; k < edgeCount; k++) {
      const a = verts[k], b = verts[(k + 1) % n];
      let i0 = vIdx[k], i1 = vIdx[(k + 1) % n];
      const sub = subArc(orig, i0, i1, closed);
      let dmax = 0, mid = sub[(sub.length / 2) | 0] || a;
      for (const pt of sub) { const d = perpDist(pt, a, b); if (d > dmax) { dmax = d; mid = pt; } }
      if (dmax <= lineTolPx) segs.push({ type: 'line', a, b });
      else { const [c1, c2] = bezierThrough(a, b, mid); segs.push({ type: 'bezier', a, b, c1, c2 }); }
    }
    return segs;
  }
  function nearestIndex(pts, q) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - q[0]) ** 2 + (pts[i][1] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  function subArc(pts, i0, i1, closed) {
    if (i1 >= i0) return pts.slice(i0, i1 + 1);
    if (closed) return pts.slice(i0).concat(pts.slice(0, i1 + 1));
    return pts.slice(i1, i0 + 1).reverse();
  }

  // ── assemble template (unit space, deduped dots) ────────────────────────
  function assemble(allSegs, W, H, opts) {
    const k = 2 / Math.max(W, H), cx = W / 2, cy = H / 2;
    const U = (p) => [round3((p[0] - cx) * k), round3((p[1] - cy) * k)];
    const dots = [], seen = new Map();
    const dotIndex = (p) => { const u = U(p), key = u[0] + ',' + u[1]; if (seen.has(key)) return seen.get(key); dots.push(u); seen.set(key, dots.length - 1); return dots.length - 1; };
    const segments = [];
    for (const s of allSegs) {
      const from = dotIndex(s.a), to = dotIndex(s.b);
      if (from === to) continue;                       // skip degenerate
      if (s.type === 'bezier') {
        const c1 = U(s.c1), c2 = U(s.c2);
        segments.push({ from, to, type: 'bezier', control1: { x: c1[0], y: c1[1] }, control2: { x: c2[0], y: c2[1] } });
      } else segments.push({ from, to, type: 'line' });
    }
    return {
      name: opts.name || 'Untitled', icon: opts.icon || '', description: opts.description || '',
      gameMode: opts.gameMode || 'easy', imageOpacity: opts.imageOpacity ?? 0.2,
      dotDiameter: opts.dotDiameter ?? 12.0, strokeThickness: opts.strokeThickness ?? 6.0,
      freeUndos: opts.freeUndos ?? 5, unitDots: dots, bezierSegments: segments,
    };
  }

  // ── public: run pipeline; auto-simplify to stay under the dot cap ───────
  function detect(imgData, params) {
    const p = Object.assign({ blur: 3, minAreaFrac: 0.003, approxEps: 0.012, lineTol: 2.0, maxDots: 51 }, params || {});
    const { paths, debug } = extractContours(imgData, p);

    function build(eps) {
      let segs = [];
      for (const path of paths) {
        const scaled = { ...path, verts: reApprox(path, eps) };
        segs = segs.concat(fitPath(scaled, p.lineTol));
      }
      return assemble(segs, debug.W, debug.H, p);
    }
    // re-run approx per path at a given relative eps (cheap: on stored orig)
    function reApprox(path, eps) {
      const per = arcLen(path.orig, true);
      return douglasPeucker(path.orig, Math.max(1, eps * per), true);
    }

    let eps = p.approxEps, tpl = build(eps), guard = 0;
    while (tpl.unitDots.length > p.maxDots && guard++ < 8) { eps *= 1.4; tpl = build(eps); }
    const flagged = tpl.unitDots.length > p.maxDots;

    return {
      template: tpl,
      stats: { paths: paths.length, segments: tpl.bezierSegments.length, dots: tpl.unitDots.length, cappedAt: p.maxDots, flagged },
      debug,
    };
  }

  // pure-JS RDP for the cap auto-tune (avoids re-entering OpenCV per iteration)
  function douglasPeucker(points, eps, closed) {
    if (points.length < 3) return points.slice();
    const pts = closed ? points.concat([points[0]]) : points;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop(); let dmax = 0, idx = -1;
      for (let i = s + 1; i < e; i++) { const d = perpDist(pts[i], pts[s], pts[e]); if (d > dmax) { dmax = d; idx = i; } }
      if (dmax > eps && idx !== -1) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    const out = [];
    for (let i = 0; i < pts.length - (closed ? 1 : 0); i++) if (keep[i]) out.push(pts[i]);
    return out;
  }
  function arcLen(pts, closed) {
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed && pts.length > 1) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return L;
  }

  return { detect };
})();
