/* Round-trip renderer: draws a template JSON (unitDots + line/bézier segments)
 * back onto a canvas, in the SAME unit-space convention the app uses, so you can
 * visually confirm the detected dots/curves overlay the source image.
 *
 *   pixel = center + unit × (max(W, H) / 2)      // inverse of the exporter
 */
window.Renderer = (function () {
  'use strict';

  function unitToPx(u, W, H) {
    const s = Math.max(W, H) / 2;
    return [W / 2 + u[0] * s, H / 2 + u[1] * s];
  }

  // Draw onto ctx sized W×H. `template` = { unitDots, bezierSegments }.
  function render(ctx, template, W, H, opts) {
    opts = opts || {};
    const dots = template.unitDots.map((u) => unitToPx(u, W, H));
    const segs = template.bezierSegments || [];

    // ── segments ──
    ctx.lineWidth = opts.lineWidth || 2.5;
    ctx.strokeStyle = opts.stroke || '#1e88e5';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of segs) {
      const a = dots[s.from], b = dots[s.to];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      if (s.type === 'bezier' && s.control1 && s.control2) {
        const c1 = unitToPx([s.control1.x, s.control1.y], W, H);
        const c2 = unitToPx([s.control2.x, s.control2.y], W, H);
        ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]);
      } else {
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }

    // ── dots (+ numbers) ──
    const r = opts.dotRadius || 6;
    ctx.font = `${Math.max(9, r * 1.4)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    dots.forEach((p, i) => {
      ctx.beginPath();
      ctx.fillStyle = opts.dotFill || '#e53935';
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      if (opts.numbers !== false) {
        ctx.fillStyle = '#fff';
        ctx.fillText(String(i + 1), p[0], p[1]);
      }
    });
  }

  // Render a debug mask (Uint8 0/1) into an offscreen-style canvas context.
  function renderMask(ctx, mask, W, H, color) {
    const img = ctx.createImageData(W, H);
    const [r, g, b] = color || [30, 136, 229];
    for (let p = 0; p < mask.length; p++) {
      const o = p * 4;
      if (mask[p]) { img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
      else { img.data[o + 3] = 0; }
    }
    ctx.putImageData(img, 0, 0);
  }

  return { render, renderMask, unitToPx };
})();
