/* ConnectDaDots — Game Maker prototype: image → dots + segments → template JSON.
 *
 * Vanilla JS, no dependencies. Tuned for clean icon / emoji-style sources (the
 * common case). Pipeline:
 *   greyscale → binarize (Otsu, alpha-aware) → edges (morphological gradient)
 *   → Zhang–Suen thinning (1px skeleton) → skeleton graph trace (strokes between
 *   junctions/endpoints) → RDP simplify → per-segment line/bézier classify+fit
 *   → junction-snap (coincident dots) → unit-space normalise → template JSON.
 *
 * Coordinate contract (MUST match the app, derived from generateJSON/buildConfig):
 *   unit = (pixel − imageCenter) × 2 / max(W, H)
 * so the exported dots overlay the SAME image the app renders with scaledToFit.
 */
window.Detector = (function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const idx = (x, y, W) => y * W + x;

  function toGray(imgData) {
    const { data, width: W, height: H } = imgData;
    const gray = new Float32Array(W * H);
    const alpha = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      alpha[p] = data[i + 3];
    }
    return { gray, alpha, W, H };
  }

  // Otsu threshold over the gray histogram.
  function otsu(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
    const total = gray.length;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, max = 0, thr = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (wB === 0) continue;
      const wF = total - wB; if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) { max = between; thr = t; }
    }
    return thr;
  }

  // Foreground mask: 1 = ink/shape. Transparent pixels are background. Auto-detect
  // whether the subject is dark-on-light or light-on-dark by border sampling.
  function binarize({ gray, alpha, W, H }) {
    const thr = otsu(gray);
    // sample border luminance to guess background brightness
    let border = 0, n = 0;
    for (let x = 0; x < W; x++) { border += gray[idx(x, 0, W)] + gray[idx(x, H - 1, W)]; n += 2; }
    for (let y = 0; y < H; y++) { border += gray[idx(0, y, W)] + gray[idx(W - 1, y, W)]; n += 2; }
    const bgBright = (border / n) > thr;   // light background → subject is darker
    const fg = new Uint8Array(W * H);
    for (let p = 0; p < fg.length; p++) {
      if (alpha[p] < 32) { fg[p] = 0; continue; }   // transparent = background
      fg[p] = bgBright ? (gray[p] < thr ? 1 : 0) : (gray[p] >= thr ? 1 : 0);
    }
    return fg;
  }

  // Morphological gradient (dilate − erode) → outline of filled regions AND the
  // internal lines, so both filled shapes and stroke-art reduce to edges.
  function edges(fg, W, H) {
    const out = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const c = fg[idx(x, y, W)];
        let mn = 1, mx = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const v = fg[idx(x + dx, y + dy, W)];
            if (v < mn) mn = v; if (v > mx) mx = v;
          }
        out[idx(x, y, W)] = (mx - mn) > 0 ? 1 : 0;
        // keep thin strokes that are already 1px wide (no gradient inside)
        if (!out[idx(x, y, W)] && c) out[idx(x, y, W)] = isThinPixel(fg, x, y, W) ? 1 : 0;
      }
    }
    return out;
  }
  function isThinPixel(fg, x, y, W) {
    // a foreground pixel with a background neighbour 4-dir → on a thin line/edge
    return !(fg[idx(x - 1, y, W)] && fg[idx(x + 1, y, W)] &&
             fg[idx(x, y - 1, W)] && fg[idx(x, y + 1, W)]);
  }

  // ── Zhang–Suen thinning → 1px skeleton ──────────────────────────────────
  function thin(src, W, H) {
    const img = Uint8Array.from(src);
    const P = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : img[idx(x, y, W)];
    let changed = true;
    const toClear = [];
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        toClear.length = 0;
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            if (!img[idx(x, y, W)]) continue;
            const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y),
                  p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1),
                  p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let A = 0; for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6 || A !== 1) continue;
            if (step === 0) {
              if (p2 * p4 * p6 !== 0) continue;
              if (p4 * p6 * p8 !== 0) continue;
            } else {
              if (p2 * p4 * p8 !== 0) continue;
              if (p2 * p6 * p8 !== 0) continue;
            }
            toClear.push(idx(x, y, W));
          }
        }
        if (toClear.length) { changed = true; for (const i of toClear) img[i] = 0; }
      }
    }
    return img;
  }

  // ── Skeleton → graph of strokes ─────────────────────────────────────────
  // Nodes = endpoints (1 neighbour) or junctions (≥3). Strokes = pixel polylines
  // between nodes. Also captures pure loops (no nodes).
  function neighbours(skel, x, y, W, H) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && skel[idx(nx, ny, W)]) out.push([nx, ny]);
      }
    return out;
  }

  function traceGraph(skel, W, H) {
    const deg = new Uint8Array(W * H);
    const pts = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (skel[idx(x, y, W)]) { deg[idx(x, y, W)] = neighbours(skel, x, y, W, H).length; pts.push([x, y]); }

    const isNode = (x, y) => { const d = deg[idx(x, y, W)]; return d === 1 || d >= 3; };
    const visitedEdge = new Set();   // "x,y->nx,ny" directed pixel steps
    const key = (x, y) => x + ',' + y;
    const strokes = [];

    function walk(sx, sy, nx, ny) {
      const path = [[sx, sy]];
      let px = sx, py = sy, cx = nx, cy = ny;
      const stepKey = (a, b, c, d) => a + ',' + b + '>' + c + ',' + d;
      if (visitedEdge.has(stepKey(px, py, cx, cy))) return null;
      while (true) {
        visitedEdge.add(stepKey(px, py, cx, cy));
        visitedEdge.add(stepKey(cx, cy, px, py));
        path.push([cx, cy]);
        if (isNode(cx, cy)) break;
        const nbrs = neighbours(skel, cx, cy, W, H).filter(([a, b]) => !(a === px && b === py));
        if (nbrs.length !== 1) break;       // dead end or unexpected branch
        px = cx; py = cy; [cx, cy] = nbrs[0];
        if (cx === sx && cy === sy) { path.push([cx, cy]); break; }  // closed
      }
      return path;
    }

    // strokes from nodes
    for (const [x, y] of pts) {
      if (!isNode(x, y)) continue;
      for (const [nx, ny] of neighbours(skel, x, y, W, H)) {
        const p = walk(x, y, nx, ny);
        if (p && p.length >= 2) strokes.push(p);
      }
    }
    // pure loops (all degree-2, no node touched)
    for (const [x, y] of pts) {
      const nbrs = neighbours(skel, x, y, W, H);
      if (nbrs.length === 2 && !nbrs.some(([a, b]) => visitedEdge.has(x + ',' + y + '>' + a + ',' + b))) {
        const p = walk(x, y, nbrs[0][0], nbrs[0][1]);
        if (p && p.length >= 3) strokes.push(p);
      }
    }
    return strokes;
  }

  // ── Ramer–Douglas–Peucker ───────────────────────────────────────────────
  function rdp(points, eps) {
    if (points.length < 3) return points.slice();
    const out = [];
    const stack = [[0, points.length - 1]];
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    while (stack.length) {
      const [s, e] = stack.pop();
      let dmax = 0, index = -1;
      for (let i = s + 1; i < e; i++) {
        const d = perpDist(points[i], points[s], points[e]);
        if (d > dmax) { dmax = d; index = i; }
      }
      if (dmax > eps && index !== -1) { keep[index] = 1; stack.push([s, index], [index, e]); }
    }
    for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
    return out;
  }
  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
  }

  // ── line vs bézier classification + fit (through the sub-path midpoint, to
  //    match the app's controlPoints(from:to:through:)) ─────────────────────
  function fitSegments(stroke, vertices, lineTol) {
    // map each kept vertex to its index in the original stroke
    const vIdx = vertices.map((v) => stroke.findIndex((p) => p[0] === v[0] && p[1] === v[1]));
    const segs = [];
    for (let k = 0; k < vertices.length - 1; k++) {
      const a = vertices[k], b = vertices[k + 1];
      const i0 = vIdx[k], i1 = vIdx[k + 1];
      const sub = (i0 >= 0 && i1 > i0) ? stroke.slice(i0, i1 + 1) : [a, b];
      let dmax = 0, mid = sub[(sub.length / 2) | 0];
      for (const p of sub) { const d = perpDist(p, a, b); if (d > dmax) { dmax = d; mid = p; } }
      if (dmax <= lineTol) {
        segs.push({ type: 'line', a, b });
      } else {
        const [c1, c2] = bezierThrough(a, b, mid);
        segs.push({ type: 'bezier', a, b, c1, c2 });
      }
    }
    return segs;
  }
  // cubic bézier from a→b passing through m at t=0.5 (mirrors the app's
  // BezierMath.controlPoints(from:to:through:)). B(0.5)=(a+3c1+3c2+b)/8=m
  // ⇒ c1+c2 = (8m − a − b)/3. Distribute symmetrically around the chord thirds.
  function bezierThrough(a, b, m) {
    const Sx = (8 * m[0] - a[0] - b[0]) / 3, Sy = (8 * m[1] - a[1] - b[1]) / 3;
    const t1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
    const t2 = [a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3];
    const dx = (Sx - (t1[0] + t2[0])) / 2, dy = (Sy - (t1[1] + t2[1])) / 2;
    return [[t1[0] + dx, t1[1] + dy], [t2[0] + dx, t2[1] + dy]];
  }

  // ── junction snap: cluster nearby segment endpoints to a shared coordinate ─
  function snapJunctions(allSegs, tol) {
    const nodes = [];   // {x,y, refs:[{seg,end}]}
    const find = (p) => {
      for (const nd of nodes) if (Math.hypot(nd.x - p[0], nd.y - p[1]) <= tol) return nd;
      const nd = { x: p[0], y: p[1], pts: [] }; nodes.push(nd); return nd;
    };
    for (const s of allSegs) { s._na = find(s.a); s._nb = find(s.b); s._na.pts.push(s.a); s._nb.pts.push(s.b); }
    for (const nd of nodes) {
      nd.x = nd.pts.reduce((a, p) => a + p[0], 0) / nd.pts.length;
      nd.y = nd.pts.reduce((a, p) => a + p[1], 0) / nd.pts.length;
    }
    for (const s of allSegs) { s.a = [s._na.x, s._na.y]; s.b = [s._nb.x, s._nb.y]; }
    return nodes;
  }

  // ── assemble template JSON (unit space) ─────────────────────────────────
  function assemble(allSegs, W, H, opts) {
    const k = 2 / Math.max(W, H), cx = W / 2, cy = H / 2;
    const U = (p) => [round3((p[0] - cx) * k), round3((p[1] - cy) * k)];
    const dots = [];
    // Dedupe dots by unit coordinate so connected segments REUSE one index (and
    // junction-snapped meeting points become a single shared dot) — otherwise each
    // segment would emit its own pair of dots and the path would be disconnected.
    const seen = new Map();
    const dotIndex = (p) => {
      const u = U(p), key = u[0] + ',' + u[1];
      if (seen.has(key)) return seen.get(key);
      dots.push(u); const i = dots.length - 1; seen.set(key, i); return i;
    };
    const segments = [];
    for (const s of allSegs) {
      const from = dotIndex(s.a), to = dotIndex(s.b);
      if (s.type === 'bezier') {
        const c1 = U(s.c1), c2 = U(s.c2);
        segments.push({ from, to, type: 'bezier', control1: { x: c1[0], y: c1[1] }, control2: { x: c2[0], y: c2[1] } });
      } else {
        segments.push({ from, to, type: 'line' });
      }
    }
    return {
      name: opts.name || 'Untitled',
      icon: opts.icon || '',
      description: opts.description || '',
      gameMode: opts.gameMode || 'easy',
      imageOpacity: opts.imageOpacity ?? 0.2,
      dotDiameter: opts.dotDiameter ?? 12.0,
      strokeThickness: opts.strokeThickness ?? 6.0,
      freeUndos: opts.freeUndos ?? 5,
      unitDots: dots,
      bezierSegments: segments,
    };
  }

  // ── public: run the whole pipeline on an ImageData ──────────────────────
  function detect(imgData, params) {
    const p = Object.assign({ rdpEps: 2.5, lineTol: 1.6, snapTol: 5, maxDots: 51 }, params || {});
    const g = toGray(imgData);
    const fg = binarize(g);
    const ed = edges(fg, g.W, g.H);
    const sk = thin(ed, g.W, g.H);
    let strokes = traceGraph(sk, g.W, g.H);

    let allSegs = [];
    for (const stroke of strokes) {
      const verts = rdp(stroke, p.rdpEps);
      if (verts.length < 2) continue;
      allSegs.push(...fitSegments(stroke, verts, p.lineTol));
    }
    const nodes = snapJunctions(allSegs, p.snapTol);
    const tpl = assemble(allSegs, g.W, g.H, p);

    return {
      template: tpl,
      stats: { strokes: strokes.length, segments: allSegs.length, dots: tpl.unitDots.length, junctions: nodes.length },
      debug: { fg, edges: ed, skeleton: sk, W: g.W, H: g.H },
    };
  }

  return { detect, toGray, binarize, edges, thin, traceGraph, rdp };
})();
