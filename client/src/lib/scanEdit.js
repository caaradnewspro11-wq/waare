// Canvas helpers for editing text inside a scanned page.
//  1. analyzeLine / bestMatch: find the font (family, bold, italic) and size that best overlay the original line
//  2. replaceText: erase the old words with the surrounding paper colour and draw the new text in the matched style

export const FONTS = [
  { name: 'Arial', stack: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, "Liberation Serif", serif' },
  { name: 'Courier New', stack: '"Courier New", Courier, "Liberation Mono", monospace' },
  { name: 'Georgia', stack: 'Georgia, "DejaVu Serif", serif' },
  { name: 'Verdana', stack: 'Verdana, "DejaVu Sans", sans-serif' },
  { name: 'Tahoma', stack: 'Tahoma, "DejaVu Sans", sans-serif' },
  { name: 'Trebuchet MS', stack: '"Trebuchet MS", "DejaVu Sans", sans-serif' },
];
export const fontByName = (n) => FONTS.find((f) => f.name === n) || FONTS[0];
export const fontCss = (font, bold, italic, size) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font.stack}`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function clipRect(r, W, H) {
  const x0 = clamp(Math.floor(r.x), 0, W), y0 = clamp(Math.floor(r.y), 0, H);
  const x1 = clamp(Math.ceil(r.x + r.w), 0, W), y1 = clamp(Math.ceil(r.y + r.h), 0, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Most common colour (bins of 8 levels per channel) = the paper colour
function dominant(data) {
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const e = bins.get(k); if (e) { e[0]++; e[1] += data[i]; e[2] += data[i + 1]; e[3] += data[i + 2]; } else bins.set(k, [1, data[i], data[i + 1], data[i + 2]]);
  }
  let best = null; for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
  return best ? [best[1] / best[0], best[2] / best[0], best[3] / best[0]] : [255, 255, 255];
}

function noiseSigma(datas, base) {
  const bl = lum(...base); let n = 0, s = 0, s2 = 0;
  for (const d of datas) for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]); if (Math.abs(l - bl) < 30) { n++; s += l; s2 += l * l; } }
  if (n < 20) return 0;
  const m = s / n; return clamp(Math.sqrt(Math.max(0, s2 / n - m * m)), 0, 12);
}

// Paper colour just left and right of a box (so shading/gradients carry across) + paper grain
export function estimateBackground(ctx, box, W, H) {
  const strip = (x, y, w, h) => { const r = clipRect({ x, y, w, h }, W, H); return r.w > 0 && r.h > 0 ? ctx.getImageData(r.x, r.y, r.w, r.h).data : null; };
  const L = strip(box.x - 7, box.y, 6, box.h), R = strip(box.x + box.w + 1, box.y, 6, box.h);
  const T = !L && !R ? strip(box.x, box.y - 7, box.w, 6) : null;
  const dl = L && dominant(L), dr = R && dominant(R), dt = T && dominant(T);
  const left = dl || dr || dt || [255, 255, 255], right = dr || dl || dt || [255, 255, 255];
  const sigma = noiseSigma([L, R, T].filter(Boolean), [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2]);
  return { left, right, sigma };
}

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function fillBackground(ctx, rect, bg) {
  if (rect.w <= 0 || rect.h <= 0) return;
  const img = ctx.createImageData(rect.w, rect.h), d = img.data;
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    const t = rect.w > 1 ? x / (rect.w - 1) : 0, n = bg.sigma ? gauss() * bg.sigma : 0, i = (y * rect.w + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = clamp(bg.left[c] + (bg.right[c] - bg.left[c]) * t + n, 0, 255);
    d[i + 3] = 255;
  }
  ctx.putImageData(img, rect.x, rect.y);
}

// Colour of the text itself: the strongest-contrast pixels
export function estimateInk(data, bg) {
  const bl = lum(...bg); let max = 0;
  for (let i = 0; i < data.length; i += 4) max = Math.max(max, Math.abs(lum(data[i], data[i + 1], data[i + 2]) - bl));
  if (max < 40) return bl > 128 ? [0, 0, 0] : [255, 255, 255];
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) if (Math.abs(lum(data[i], data[i + 1], data[i + 2]) - bl) >= max * 0.8) { n++; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [r / n, g / n, b / n];
}

function inkMask(data, w, h, bg) {
  const bl = lum(...bg); let max = 0; const diff = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) { diff[p] = Math.abs(lum(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) - bl); if (diff[p] > max) max = diff[p]; }
  const thr = Math.max(30, max * 0.45), mask = new Uint8Array(w * h);
  let minx = w, maxx = -1, miny = h, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (diff[y * w + x] > thr) { mask[y * w + x] = 1; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  return { mask, bbox: { minx, maxx, miny, maxy }, ok: maxx > minx && maxy > miny };
}

// ---------- font matching ----------
export function analyzeLine(ctx, W, H, line) {
  const pad = 4, rect = clipRect({ x: line.x - pad, y: line.y - pad, w: line.w + pad * 2, h: line.h + pad * 2 }, W, H);
  const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
  const bg = dominant(data), target = inkMask(data, rect.w, rect.h, bg);
  const off = document.createElement('canvas'); off.width = rect.w; off.height = rect.h;
  return { rect, bg, color: estimateInk(data, bg), target, off, octx: off.getContext('2d', { willReadFrequently: true }) };
}

// Fit one candidate to the original line: choose the size that matches the ink width, centre it vertically, then score by overlap (IoU)
export function evaluate(an, text, cand) {
  const { target, octx, rect } = an; if (!target.ok || !text.trim()) return null;
  const font = fontByName(cand.fontName), w = rect.w, h = rect.h, bb = target.bbox;
  octx.font = fontCss(font, cand.bold, cand.italic, 100);
  const m100 = octx.measureText(text), inkW100 = m100.actualBoundingBoxLeft + m100.actualBoundingBoxRight;
  if (!(inkW100 > 0)) return null;
  const size = (100 * (bb.maxx - bb.minx + 1)) / inkW100;
  if (size < 4 || size > 500) return null;
  octx.font = fontCss(font, cand.bold, cand.italic, size);
  const m = octx.measureText(text), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  const baseY = (bb.miny + bb.maxy) / 2 + (asc - desc) / 2, x = bb.minx + m.actualBoundingBoxLeft;
  octx.canvas.width = w; octx.canvas.height = h;
  octx.fillStyle = '#fff'; octx.fillRect(0, 0, w, h); octx.fillStyle = '#000'; octx.font = fontCss(font, cand.bold, cand.italic, size);
  octx.fillText(text, x, baseY);
  const px = octx.getImageData(0, 0, w, h).data, mine = new Uint8Array(w * h); let mineCount = 0;
  for (let p = 0; p < w * h; p++) if (px[p * 4] < 128) { mine[p] = 1; mineCount++; }
  let targetCount = 0; for (let p = 0; p < w * h; p++) targetCount += target.mask[p];
  let best = 0, bestDy = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    let inter = 0;
    for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y++) { const row = y * w, src = (y - dy) * w;
      for (let xx = Math.max(0, dx); xx < Math.min(w, w + dx); xx++) inter += mine[src + xx - dx] & target.mask[row + xx]; }
    const iou = inter / (mineCount + targetCount - inter || 1);
    if (iou > best) { best = iou; bestDy = dy; }
  }
  return { ...cand, size, baselineY: rect.y + baseY + bestDy, score: best };
}

export function bestMatch(an, text) {
  let best = null;
  for (const f of FONTS) for (const bold of [false, true]) for (const italic of [false, true]) {
    const r = evaluate(an, text, { fontName: f.name, bold, italic });
    if (r && (!best || r.score > best.score)) best = r;
  }
  return best;
}

// ---------- replace text ----------
// sel:    {x0,y0,x1,y1} union of the selected word boxes
// limits: where the neighbouring words end (left) / start (right)
// tail:   optional {x0,x1,y0,y1} box of ALL words after the selection; with move=true they are shifted so the new text fits
export function replaceText(ctx, W, H, { sel, limits, tail = null, move = false, text, style, align = 'left', shrink = false, soften = true }) {
  const hh = sel.y1 - sel.y0, pad = Math.max(2, Math.round(hh * 0.14));
  const ex0 = Math.max(sel.x0 - pad, Math.floor((limits.left + sel.x0) / 2)), ex1 = Math.min(sel.x1 + pad, Math.ceil((sel.x1 + limits.right) / 2));
  let erase = clipRect({ x: ex0, y: sel.y0 - pad, w: ex1 - ex0, h: hh + pad * 2 }, W, H);

  const font = fontByName(style.fontName); let size = style.size;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  ctx.font = fontCss(font, style.bold, style.italic, size);
  let m = ctx.measureText(text), inkW = text ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : 0;
  const boxW = sel.x1 - sel.x0;
  if (text && shrink && inkW > boxW) { size = size * (boxW / inkW); ctx.font = fontCss(font, style.bold, style.italic, size); m = ctx.measureText(text); inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight; }
  const inkLeft = align === 'right' ? sel.x1 - inkW : align === 'center' ? sel.x0 + (boxW - inkW) / 2 : sel.x0;
  const newRect = { x: inkLeft, y: style.baselineY - (text ? m.actualBoundingBoxAscent : 0), w: inkW, h: text ? m.actualBoundingBoxAscent + m.actualBoundingBoxDescent : 0 };

  // Move the rest of the line so the original spacing is kept (only for left-aligned text)
  let delta = 0, noRoom = false, tailRect = null;
  if (move && tail && align === 'left') {
    const gap = tail.x0 - sel.x1, wanted = (text ? inkLeft + inkW + Math.max(gap, hh * 0.25) : sel.x0) - tail.x0;
    if (Math.abs(wanted) >= 2) {
      if (tail.x1 + wanted + 6 <= W && tail.x0 + wanted >= 0) delta = Math.round(wanted); else noRoom = true;
    }
    if (delta) {
      const tp = Math.max(1, Math.floor(gap * 0.4));
      tailRect = clipRect({ x: tail.x0 - tp, y: Math.min(tail.y0, sel.y0) - pad, w: tail.x1 - tail.x0 + tp + pad, h: Math.max(tail.y1, sel.y1) - Math.min(tail.y0, sel.y0) + pad * 2 }, W, H);
      const x1 = Math.max(erase.x + erase.w, tailRect.x + tailRect.w), y0 = Math.min(erase.y, tailRect.y), y1 = Math.max(erase.y + erase.h, tailRect.y + tailRect.h);
      erase = clipRect({ x: erase.x, y: y0, w: x1 - erase.x, h: y1 - y0 }, W, H);
    }
  }

  const bg = estimateBackground(ctx, erase, W, H);
  const orig = ctx.getImageData(clamp(sel.x0, 0, W - 1), clamp(sel.y0, 0, H - 1), Math.max(1, Math.min(W - sel.x0, sel.x1 - sel.x0)), Math.max(1, Math.min(H - sel.y0, hh))).data;
  const color = style.color || rgbToHex(estimateInk(orig, [(bg.left[0] + bg.right[0]) / 2, (bg.left[1] + bg.right[1]) / 2, (bg.left[2] + bg.right[2]) / 2]));

  const parts = [erase, newRect]; if (tailRect) parts.push({ ...tailRect, x: tailRect.x + delta });
  const ux0 = Math.min(...parts.map((r) => r.x)), uy0 = Math.min(...parts.map((r) => r.y)), ux1 = Math.max(...parts.map((r) => r.x + r.w)), uy1 = Math.max(...parts.map((r) => r.y + r.h));
  const undoRect = clipRect({ x: ux0 - 3, y: uy0 - 3, w: ux1 - ux0 + 6, h: uy1 - uy0 + 6 }, W, H);
  const undo = { x: undoRect.x, y: undoRect.y, img: ctx.getImageData(undoRect.x, undoRect.y, undoRect.w, undoRect.h) };
  const tailImg = tailRect ? ctx.getImageData(tailRect.x, tailRect.y, tailRect.w, tailRect.h) : null;

  fillBackground(ctx, erase, bg);
  if (tailImg) ctx.putImageData(tailImg, tailRect.x + delta, tailRect.y);
  if (text) {
    if (soften && 'filter' in ctx) ctx.filter = 'blur(0.4px)';
    ctx.fillStyle = color; ctx.fillText(text, inkLeft + m.actualBoundingBoxLeft, style.baselineY);
  }
  ctx.restore();
  const overflow = !!text && !delta && (inkLeft < limits.left + 1 || inkLeft + inkW > limits.right - 1);
  return { undo, inkW, size, color, delta, noRoom, overflow, word: text ? { text, x: Math.round(inkLeft), y: sel.y0, w: Math.round(inkW), h: hh, conf: 100, edited: true } : null };
}
