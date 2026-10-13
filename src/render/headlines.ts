/**
 * Desenho dos presets de manchete. Origem (0,0) = canto superior esquerdo da
 * caixa do elemento; `p` ∈ [0,1] é a presença (entrada/saída encenadas).
 *
 * Cores são SEMPRE as da marca (definidas no preset) e todo preset — exceto o
 * texto livre — traz a logo Primeiras Notícias embutida.
 */
import type { TextClip } from '../core/model';
import { clamp, ease, seg } from '../core/animation';
import { FONTS, PN } from '../core/brand';
import { getPreset } from '../core/presets';
import { applyFont, drawLines, fitText, lineX, stripMarkup, type FontSpec } from './text';
import { drawInstagramGlyph, drawLogo, LOGO_RATIO } from './brandAssets';

type C = CanvasRenderingContext2D;

export interface HeadlineArgs {
  w: number;
  h: number;
  /** presença encenada 0..1 */
  p: number;
  /** tempo local em segundos (letreiro, pulsos) */
  t: number;
}

const COND: FontSpec = { family: FONTS.condensed, weight: 800 };
const COND_SEMI: FontSpec = { family: FONTS.condensed, weight: 600, tracking: 0.04 };
const SANS_BLACK: FontSpec = { family: FONTS.sans, weight: 800 };
const SANS_BOLD: FontSpec = { family: FONTS.sans, weight: 700 };
const SANS_MED: FontSpec = { family: FONTS.sans, weight: 500 };
const SERIF_BLACK: FontSpec = { family: FONTS.serif, weight: 900 };
const SERIF_ITALIC: FontSpec = { family: FONTS.serif, weight: 600, style: 'italic' };
const MONO: FontSpec = { family: FONTS.mono, weight: 600, tracking: 0.02 };
const IMPACT: FontSpec = { family: FONTS.impact, weight: 400 };

const LR = LOGO_RATIO.horizontal;
const eo = ease['ease-out'];
const eio = ease['ease-in-out'];

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const f = (v: number) => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function textShadow(ctx: C, size: number, alpha = 0.45) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.04;
}

function noShadow(ctx: C) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Recorte retangular animado. */
function clipReveal(ctx: C, x: number, y: number, w: number, h: number, f: number, from: 'left' | 'center' | 'bottom' = 'left') {
  ctx.beginPath();
  if (from === 'left') ctx.rect(x, y, w * f, h);
  else if (from === 'center') ctx.rect(x + (w * (1 - f)) / 2, y, w * f, h);
  else ctx.rect(x, y + h * (1 - f), w, h * f);
  ctx.clip();
}

/** Linhas sobem de dentro de uma máscara, em cascata. */
function stagger(p: number, start: number, span: number, step: number) {
  return (i: number) => eo(seg(p, start + i * step, start + i * step + span));
}

/** Logo com entrada própria (escala + opacidade). */
function logoAt(ctx: C, x: number, y: number, h: number, f: number) {
  if (f <= 0) return;
  ctx.save();
  ctx.globalAlpha *= f;
  const s = 0.85 + 0.15 * f;
  const w = h * LR;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  drawLogo(ctx, -w / 2, -h / 2, h);
  ctx.restore();
}

/** Fio vertical sutil separando texto e logo dentro de uma placa. */
function divider(ctx: C, x: number, y: number, h: number, f: number) {
  ctx.fillStyle = `rgba(255,255,255,${0.28 * f})`;
  ctx.fillRect(x, y, Math.max(1.5, h * 0.02), h);
}

// ---------------------------------------------------------------------------

function faixa(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const grow = eo(seg(p, 0, 0.45));
  const top = h * (1 - grow);
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, shade(s.primary, 0.12));
  g.addColorStop(1, shade(s.primary, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);
  const rule = eio(seg(p, 0.2, 0.6));
  const r1 = Math.max(2, h * 0.012);
  const r2 = Math.max(3, h * 0.022);
  ctx.fillStyle = shade(s.primary, -0.5);
  ctx.fillRect(0, top, w, r1);
  ctx.fillStyle = s.accent;
  ctx.fillRect((w * (1 - rule)) / 2, top + r1, w * rule, r2);
  if (p <= 0.25) return;
  const padX = w * 0.08;
  const areaTop = h * 0.11;
  const areaH = h * 0.54;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top + r1 + r2, w, h);
  ctx.clip();
  const fit = fitText(ctx, c.fields.title, COND, { maxW: w - padX * 2, maxH: areaH, maxSize: h * 0.2 * fs, lineHeight: 1.04, upper: s.uppercase });
  const y0 = areaTop + (areaH - fit.height) / 2;
  const lineIn = stagger(p, 0.35, 0.35, 0.08);
  textShadow(ctx, fit.size, 0.35);
  drawLines(ctx, fit, padX, y0, w - padX * 2, s.align, { text: s.text, highlight: s.highlight }, {
    alpha: lineIn,
    dy: (i) => (1 - lineIn(i)) * fit.lineHeight * 0.6,
  });
  noShadow(ctx);
  // rodapé: fio vermelho curto + logo
  const fp = eo(seg(p, 0.6, 1));
  const lw = w * 0.12 * fp;
  ctx.fillStyle = PN.red;
  ctx.fillRect((w - lw) / 2, h * 0.7, lw, Math.max(2, h * 0.012));
  const lh = h * 0.2;
  logoAt(ctx, (w - lh * LR) / 2, h * 0.75, lh, fp);
  ctx.restore();
}

function urgente(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const barW = Math.max(3, w * 0.008);
  const gap = w * 0.022;
  const tagH = h * 0.26;
  const boxX = barW + gap;
  const boxY = tagH;
  const boxW = w - boxX;
  const boxH = h - tagH;
  const bar = eo(seg(p, 0, 0.3));
  ctx.fillStyle = s.highlight;
  ctx.fillRect(0, h * (1 - bar), barW, h * bar);
  const tp = eo(seg(p, 0.1, 0.45));
  if (c.fields.kicker) {
    applyFont(ctx, COND, tagH * 0.68 * fs);
    const label = c.fields.kicker.toLocaleUpperCase('pt-BR');
    const tw = ctx.measureText(label).width + tagH * 0.5;
    ctx.save();
    clipReveal(ctx, boxX, tagH * 0.08, tw, tagH * 0.84, tp);
    ctx.fillStyle = s.highlight;
    ctx.fillRect(boxX, tagH * 0.08, tw, tagH * 0.84);
    ctx.fillStyle = PN.navy;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, boxX + tagH * 0.25, tagH * 0.54);
    ctx.restore();
  }
  // logo no canto superior direito, alinhada ao selo
  const lh = tagH * 1.05;
  logoAt(ctx, w - lh * LR, -tagH * 0.06, lh, eo(seg(p, 0.3, 0.7)));
  const bp = eio(seg(p, 0.2, 0.6));
  if (bp <= 0) return;
  ctx.save();
  clipReveal(ctx, boxX, boxY, boxW, boxH, bp);
  const g = ctx.createLinearGradient(boxX, 0, boxX + boxW, 0);
  g.addColorStop(0, s.primary);
  g.addColorStop(1, shade(s.primary, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  const pad = boxH * 0.1;
  const fit = fitText(ctx, c.fields.title, SANS_BLACK, { maxW: boxW - pad * 2.2, maxH: boxH - pad * 2, maxSize: boxH * 0.3 * fs, lineHeight: 1.05, upper: s.uppercase });
  const lineIn = stagger(p, 0.4, 0.3, 0.07);
  drawLines(ctx, fit, boxX + pad * 1.1, boxY + (boxH - fit.height) / 2, boxW - pad * 2.2, s.align, { text: s.text, highlight: s.highlight }, {
    alpha: lineIn,
    dx: (i) => (1 - lineIn(i)) * -fit.size,
  });
  ctx.restore();
}

/** Placa com texto à esquerda e logo à direita (tarja lateral, faixa larga, câmera, GC). */
function plateWithLogo(
  ctx: C,
  c: TextClip,
  a: HeadlineArgs,
  o: { x0: number; font: FontSpec; maxSizeK: number; lineHeight: number; logoK: number; fill: () => void; lineDx?: boolean },
) {
  const { w, h, p } = a;
  const s = c.style;
  const pad = h * 0.14;
  const lh = h * o.logoK;
  const lw = lh * LR;
  const textW = w - o.x0 - pad * 3 - lw;
  o.fill();
  const fit = fitText(ctx, c.fields.title, o.font, { maxW: textW, maxH: h - pad * 2, maxSize: h * o.maxSizeK * s.fontScale, lineHeight: o.lineHeight, upper: s.uppercase });
  const lineIn = stagger(p, 0.4, 0.3, 0.07);
  drawLines(ctx, fit, o.x0 + pad, (h - fit.height) / 2, textW, s.align, { text: s.text, highlight: s.highlight }, {
    alpha: lineIn,
    ...(o.lineDx ? { dx: (i: number) => (1 - lineIn(i)) * w * 0.05 } : { dy: (i: number) => (1 - lineIn(i)) * fit.size * 0.5 }),
  });
  const lf = eo(seg(p, 0.5, 0.9));
  divider(ctx, w - pad * 1.5 - lw, h * 0.18, h * 0.64, lf);
  logoAt(ctx, w - pad * 0.8 - lw, (h - lh) / 2, lh, lf);
}

function tarja(ctx: C, c: TextClip, a: HeadlineArgs) {
  const { w, h, p } = a;
  const s = c.style;
  const lineW = Math.max(2, w * 0.006);
  const boxX = w * 0.05;
  ctx.fillStyle = s.text;
  ctx.fillRect(0, -h * 0.25, lineW, h * 1.5 * eo(seg(p, 0, 0.35)));
  const bp = eio(seg(p, 0.15, 0.55));
  if (bp <= 0) return;
  ctx.save();
  clipReveal(ctx, boxX, 0, w - boxX, h, bp);
  plateWithLogo(ctx, c, a, {
    x0: boxX,
    font: COND,
    maxSizeK: 0.36,
    lineHeight: 1.06,
    logoK: 0.5,
    fill: () => {
      const g = ctx.createLinearGradient(boxX, 0, w, 0);
      g.addColorStop(0, shade(s.primary, -0.1));
      g.addColorStop(1, shade(s.primary, 0.12));
      ctx.fillStyle = g;
      ctx.fillRect(boxX, 0, w - boxX, h);
    },
  });
  ctx.restore();
}

function largo(ctx: C, c: TextClip, a: HeadlineArgs) {
  const { w, h, p } = a;
  const s = c.style;
  const open = eio(seg(p, 0, 0.45));
  const bandH = h * open;
  const y = (h - bandH) / 2;
  ctx.fillStyle = withAlpha(s.primary, 0.92);
  ctx.fillRect(0, y, w, bandH);
  const rl = Math.max(2, h * 0.025);
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, y, w * eo(seg(p, 0.25, 0.7)), rl);
  ctx.fillRect(w * (1 - eo(seg(p, 0.25, 0.7))), y + bandH - rl, w, rl);
  if (p < 0.3) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, w, bandH);
  ctx.clip();
  textShadow(ctx, h * 0.3, 0.3);
  plateWithLogo(ctx, c, a, { x0: w * 0.015, font: COND, maxSizeK: 0.3, lineHeight: 1.05, logoK: 0.46, fill: () => undefined, lineDx: true });
  ctx.restore();
}

function serif(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const a = eo(seg(p, 0, 0.4));
  const barH = h * 0.06;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(0, (1 - a) * h * 0.15);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(s.primary, 0.08));
  g.addColorStop(1, shade(s.primary, -0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h - barH);
  ctx.restore();
  const segs = [shade(s.primary, -0.3), s.primary, PN.blue, s.accent, PN.white];
  const sw = w / segs.length;
  segs.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * sw, h - barH, sw * eo(seg(p, 0.2 + i * 0.07, 0.45 + i * 0.07)), barH);
  });
  // logo sobre a borda superior da placa
  const lh = h * 0.24;
  logoAt(ctx, (w - lh * LR) / 2, -lh * 0.5, lh, eo(seg(p, 0.3, 0.7)));
  if (p < 0.3) return;
  const padX = w * 0.06;
  const top = lh * 0.55;
  const fit = fitText(ctx, c.fields.title, SERIF_BLACK, { maxW: w - padX * 2, maxH: (h - barH - top) * 0.88, maxSize: h * 0.2 * fs, lineHeight: 1.02, upper: s.uppercase });
  textShadow(ctx, fit.size, 0.35);
  drawLines(ctx, fit, padX, top + (h - barH - top - fit.height) / 2, w - padX * 2, s.align, { text: s.text, highlight: s.highlight }, {
    alpha: stagger(p, 0.35, 0.35, 0.08),
  });
  noShadow(ctx);
}

function camera(ctx: C, c: TextClip, { w, h, p, t }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const bp = eio(seg(p, 0, 0.2));
  ctx.fillStyle = s.primary;
  ctx.fillRect(0, h * (1 - bp) * 0.5, w, h * bp);
  if (p < 0.2) return;
  const pad = h * 0.14;
  const lh = h * 0.52;
  const lw = lh * LR;
  const areaW = w - pad * 3 - lw;
  const full = stripMarkup(c.fields.title);
  const fit = fitText(ctx, full, MONO, { maxW: areaW, maxH: h - pad * 2, maxSize: h * 0.36 * fs, lineHeight: 1.2, upper: s.uppercase });
  const total = fit.lines.reduce((n, l) => n + l.runs.reduce((m, r) => m + r.text.length, 0), 0);
  let budget = Math.floor(total * seg(p, 0.2, 1));
  const typing = budget < total;
  const y0 = (h - fit.height) / 2;
  ctx.fillStyle = s.text;
  ctx.textBaseline = 'alphabetic';
  let cursor = { x: 0, y: 0 };
  fit.lines.forEach((line, i) => {
    let x = lineX(line, pad, areaW, s.align);
    const y = y0 + i * fit.lineHeight + (fit.lineHeight - fit.size) / 2 + fit.size * 0.8;
    for (const r of line.runs) {
      if (budget <= 0) break;
      const part = r.text.slice(0, budget);
      budget -= part.length;
      ctx.fillText(part, x, y);
      x += part.length === r.text.length ? r.w : ctx.measureText(part).width;
      cursor = { x, y };
    }
  });
  if (typing && Math.floor(t * 3) % 2 === 0) ctx.fillRect(cursor.x + fit.size * 0.08, cursor.y - fit.size * 0.75, fit.size * 0.55, fit.size * 0.85);
  const lf = eo(seg(p, 0.25, 0.6));
  divider(ctx, w - pad * 1.5 - lw, h * 0.2, h * 0.6, lf);
  logoAt(ctx, w - pad * 0.8 - lw, (h - lh) / 2, lh, lf);
}

function marcador(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const padX = h * 0.06;
  const logoH = h * 0.2;
  const areaH = h - logoH * 1.2;
  const fit = fitText(ctx, c.fields.title, COND, { maxW: w - padX * 2, maxH: areaH, maxSize: h * 0.26 * fs, lineHeight: 1.18, upper: s.uppercase });
  const y0 = (areaH - fit.height) / 2;
  const n = fit.lines.length;
  fit.lines.forEach((line, i) => {
    const bf = eio(seg(p, i * (0.5 / n), i * (0.5 / n) + 0.35));
    const tf = eo(seg(p, 0.2 + i * (0.5 / n), 0.55 + i * (0.5 / n)));
    const lx = lineX(line, padX, w - padX * 2, s.align);
    const by = y0 + i * fit.lineHeight;
    const bw = line.width + padX * 2;
    const bh = fit.lineHeight * 0.98;
    ctx.save();
    clipReveal(ctx, lx - padX, by, bw, bh, bf);
    ctx.fillStyle = s.primary;
    ctx.fillRect(lx - padX, by, bw, bh);
    ctx.globalAlpha *= tf;
    let x = lx;
    const ty = by + (bh - fit.size) / 2 + fit.size * 0.82;
    for (const r of line.runs) {
      ctx.fillStyle = r.hl ? s.highlight : s.text;
      if (r.text !== ' ') ctx.fillText(r.text, x, ty);
      x += r.w;
    }
    ctx.restore();
  });
  const lw = logoH * LR;
  const lx = s.align === 'left' ? 0 : s.align === 'right' ? w - lw : (w - lw) / 2;
  logoAt(ctx, lx, y0 + fit.height + logoH * 0.2, logoH, eo(seg(p, 0.55, 0.95)));
}

function chapeu(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const hasS = !!c.fields.subtitle;
  const kH = h * 0.27;
  const sH = hasS ? h * 0.27 : 0;
  const mH = h - kH - sH;
  const mp = eio(seg(p, 0, 0.45));
  ctx.save();
  clipReveal(ctx, 0, kH, w, mH, mp);
  ctx.fillStyle = s.primary;
  ctx.fillRect(0, kH, w, mH);
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, kH, Math.max(4, w * 0.012), mH);
  const pad = mH * 0.16;
  const fit = fitText(ctx, c.fields.title, SANS_BOLD, { maxW: w - pad * 3, maxH: mH - pad * 1.4, maxSize: mH * 0.58 * fs, lineHeight: 1.08, upper: s.uppercase });
  ctx.globalAlpha *= eo(seg(p, 0.35, 0.75));
  drawLines(ctx, fit, pad * 1.8, kH + (mH - fit.height) / 2, w - pad * 3, s.align, { text: s.text, highlight: s.accent });
  ctx.restore();
  if (c.fields.kicker) {
    const kp = eo(seg(p, 0.2, 0.55));
    applyFont(ctx, COND, kH * 0.62 * fs);
    const label = c.fields.kicker.toLocaleUpperCase('pt-BR');
    const kw = ctx.measureText(label).width + kH * 0.8;
    ctx.save();
    clipReveal(ctx, 0, 0, kw, kH, kp, 'bottom');
    ctx.fillStyle = s.accent;
    ctx.fillRect(0, 0, kw, kH);
    ctx.fillStyle = PN.white;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, kH * 0.4, kH * 0.55);
    ctx.restore();
  }
  const lh = kH * 1.1;
  logoAt(ctx, w - lh * LR, -kH * 0.12, lh, eo(seg(p, 0.3, 0.7)));
  if (hasS) {
    const sp = eio(seg(p, 0.4, 0.8));
    ctx.save();
    clipReveal(ctx, 0, kH + mH, w * 0.92, sH, sp);
    ctx.fillStyle = PN.navy;
    ctx.fillRect(0, kH + mH, w * 0.92, sH);
    applyFont(ctx, SANS_MED, sH * 0.52 * fs);
    ctx.fillStyle = PN.white;
    ctx.textBaseline = 'middle';
    ctx.fillText(c.fields.subtitle, sH * 0.5 + w * 0.012, kH + mH + sH * 0.53, w * 0.92 - sH);
    ctx.restore();
  }
}

function nome(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const barW = Math.max(4, w * 0.018);
  const bar = eo(seg(p, 0, 0.3));
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, h * (1 - bar), barW, h * bar);
  const bp = eio(seg(p, 0.15, 0.55));
  ctx.save();
  clipReveal(ctx, barW, 0, w - barW, h, bp);
  const g = ctx.createLinearGradient(barW, 0, w, 0);
  g.addColorStop(0, s.primary);
  g.addColorStop(1, shade(s.primary, 0.1));
  ctx.fillStyle = g;
  ctx.fillRect(barW, 0, w - barW, h);
  const pad = h * 0.18;
  const lh = h * 0.56;
  const lw = lh * LR;
  const textW = w - barW - pad * 3.5 - lw;
  const ta = eo(seg(p, 0.4, 0.8));
  ctx.save();
  ctx.globalAlpha *= ta;
  ctx.textBaseline = 'middle';
  applyFont(ctx, SANS_BOLD, h * (c.fields.subtitle ? 0.36 : 0.48) * fs);
  ctx.fillStyle = s.text;
  ctx.fillText(c.fields.title, barW + pad, h * (c.fields.subtitle ? 0.36 : 0.52), textW);
  if (c.fields.subtitle) {
    applyFont(ctx, SANS_MED, h * 0.24 * fs);
    ctx.fillStyle = s.accent;
    ctx.fillText(c.fields.subtitle, barW + pad, h * 0.72, textW);
  }
  ctx.restore();
  divider(ctx, w - pad * 1.6 - lw, h * 0.2, h * 0.6, ta);
  logoAt(ctx, w - pad * 0.8 - lw, (h - lh) / 2, lh, ta);
  ctx.restore();
}

function aoVivo(ctx: C, c: TextClip, { h, p, t }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  applyFont(ctx, COND, h * 0.6 * fs);
  const label = (c.fields.kicker || 'Ao vivo').toLocaleUpperCase('pt-BR');
  const dot = h * 0.22;
  const lw = h * 0.35 + dot * 2 + ctx.measureText(label).width + h * 0.35;
  ctx.save();
  clipReveal(ctx, 0, 0, lw, h, eo(seg(p, 0, 0.5)));
  ctx.fillStyle = s.primary;
  ctx.fillRect(0, 0, lw, h);
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2));
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.beginPath();
  ctx.arc(h * 0.35 + dot, h / 2, dot, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PN.white;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, h * 0.35 + dot * 2 + h * 0.2, h * 0.54);
  ctx.restore();
  let x = lw;
  if (c.fields.title) {
    applyFont(ctx, COND_SEMI, h * 0.52 * fs);
    const loc = s.uppercase ? c.fields.title.toLocaleUpperCase('pt-BR') : c.fields.title;
    const locW = ctx.measureText(loc).width + h * 0.7;
    ctx.save();
    clipReveal(ctx, lw, 0, locW, h, eo(seg(p, 0.35, 0.85)));
    ctx.fillStyle = withAlpha(s.accent, 0.94);
    ctx.fillRect(lw, 0, locW, h);
    ctx.fillStyle = PN.white;
    ctx.textBaseline = 'middle';
    ctx.fillText(loc, lw + h * 0.35, h * 0.54);
    ctx.restore();
    x += locW;
  }
  const lh = h * 1.15;
  logoAt(ctx, x + h * 0.25, (h - lh) / 2, lh, eo(seg(p, 0.5, 0.95)));
}

function letreiro(ctx: C, c: TextClip, { w, h, p, t }: HeadlineArgs) {
  const s = c.style;
  ctx.save();
  clipReveal(ctx, 0, 0, w, h, eio(seg(p, 0, 0.4)), 'bottom');
  drawTicker(ctx, w, h, c.fields.title, t, { kicker: c.fields.kicker, uppercase: s.uppercase, fontScale: s.fontScale });
  ctx.restore();
}

/** Letreiro com bloco da logo à esquerda — usado pelo preset e pela moldura. */
export function drawTicker(
  ctx: C,
  w: number,
  h: number,
  text: string,
  t: number,
  o: { kicker?: string; uppercase?: boolean; fontScale?: number } = {},
) {
  const fs = o.fontScale ?? 1;
  ctx.fillStyle = PN.navy;
  ctx.fillRect(0, 0, w, h);
  // bloco da logo
  const lh = h * 0.86;
  const logoBlock = lh * LR + h * 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(PN.deep, 0.1));
  g.addColorStop(1, PN.navy);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, logoBlock, h);
  drawLogo(ctx, h * 0.25, (h - lh) / 2, lh);
  let x0 = logoBlock;
  if (o.kicker) {
    applyFont(ctx, COND, h * 0.56 * fs);
    const label = o.kicker.toLocaleUpperCase('pt-BR');
    const kw = ctx.measureText(label).width + h * 0.9;
    ctx.fillStyle = PN.bright;
    ctx.fillRect(x0, 0, kw, h);
    ctx.fillStyle = PN.white;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, x0 + h * 0.45, h * 0.54);
    x0 += kw;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w - x0, h);
  ctx.clip();
  applyFont(ctx, COND_SEMI, h * 0.52 * fs);
  const body = (o.uppercase === false ? text : text.toLocaleUpperCase('pt-BR')) + '   •   ';
  const bw = Math.max(1, ctx.measureText(body).width);
  const offset = (t * h * 2.6) % bw;
  ctx.fillStyle = PN.white;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let x = x0 + h * 0.4 - offset; x < w; x += bw) ctx.fillText(body, x, h * 0.54);
  ctx.restore();
  ctx.fillStyle = PN.sky;
  ctx.fillRect(0, 0, w, Math.max(2, h * 0.05));
}

function citacao(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const a = eo(seg(p, 0, 0.4));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = withAlpha(s.primary, 0.9);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, Math.max(4, w * 0.012), h * eo(seg(p, 0.1, 0.5)));
  ctx.restore();
  const pad = Math.min(w, h) * 0.12;
  const qs = h * 0.42;
  const qa = eo(seg(p, 0.2, 0.5));
  ctx.save();
  ctx.globalAlpha *= qa;
  applyFont(ctx, SERIF_BLACK, qs);
  ctx.fillStyle = s.accent;
  ctx.textBaseline = 'top';
  ctx.fillText('“', pad, pad * 0.2 + (1 - qa) * qs * 0.3);
  ctx.restore();
  const footH = h * 0.17;
  const tx = pad + qs * 0.5;
  const fit = fitText(ctx, c.fields.title, SERIF_ITALIC, { maxW: w - tx - pad, maxH: h - pad * 1.6 - footH, maxSize: h * 0.2 * fs, lineHeight: 1.15, upper: s.uppercase });
  const lineIn = stagger(p, 0.3, 0.3, 0.07);
  drawLines(ctx, fit, tx, pad * 0.8 + (h - pad * 1.6 - footH - fit.height) / 2, w - tx - pad, s.align, { text: s.text, highlight: s.highlight }, {
    alpha: lineIn,
    dy: (i) => (1 - lineIn(i)) * fit.size * 0.4,
  });
  const fp = eo(seg(p, 0.6, 1));
  const lh = footH * 0.9;
  const lw = lh * LR;
  if (c.fields.subtitle) {
    ctx.save();
    ctx.globalAlpha *= fp;
    applyFont(ctx, COND_SEMI, footH * 0.5 * fs);
    ctx.fillStyle = s.accent;
    ctx.textBaseline = 'middle';
    ctx.fillText(`— ${c.fields.subtitle}`.toLocaleUpperCase('pt-BR'), tx, h - pad * 0.5 - footH / 2, w - tx - pad - lw - pad);
    ctx.restore();
  }
  logoAt(ctx, w - pad * 0.6 - lw, h - pad * 0.5 - footH / 2 - lh / 2, lh, fp);
}

function numero(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  const s = c.style;
  const fs = s.fontScale;
  const logoH = h * 0.16;
  const capH = c.fields.subtitle ? h * 0.22 : 0;
  const numH = h - capH - logoH * 1.25;
  const raw = c.fields.title;
  const m = /^(\D*)([\d.,]+)(.*)$/.exec(raw);
  let shown = raw;
  if (m) {
    const digits = m[2]!;
    const value = parseFloat(digits.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(value)) {
      const decimals = digits.includes(',') ? digits.split(',')[1]!.length : 0;
      const cur = value * eo(seg(p, 0.15, 0.85));
      shown = `${m[1]}${cur.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`;
    }
  }
  const fit = fitText(ctx, raw, IMPACT, { maxW: w * 0.96, maxH: numH, maxSize: numH * 0.95 * fs, lineHeight: 1, upper: false, maxLines: 1 });
  const ax = s.align === 'left' ? 0 : s.align === 'right' ? w : w / 2;
  ctx.save();
  ctx.globalAlpha *= eo(seg(p, 0, 0.3));
  applyFont(ctx, IMPACT, fit.size);
  ctx.textBaseline = 'middle';
  ctx.textAlign = s.align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fit.size * 0.06;
  ctx.strokeStyle = s.primary;
  ctx.strokeText(shown, ax, numH * 0.52);
  ctx.fillStyle = s.accent;
  ctx.fillText(shown, ax, numH * 0.52);
  ctx.restore();
  if (capH) {
    applyFont(ctx, COND_SEMI, capH * 0.6 * fs);
    const cap = c.fields.subtitle.toLocaleUpperCase('pt-BR');
    const cw = Math.min(w, ctx.measureText(cap).width + capH * 0.8);
    const cx = s.align === 'left' ? 0 : s.align === 'right' ? w - cw : (w - cw) / 2;
    ctx.save();
    clipReveal(ctx, cx, numH, cw, capH, eio(seg(p, 0.4, 0.8)), 'center');
    ctx.fillStyle = s.primary;
    ctx.fillRect(cx, numH, cw, capH);
    ctx.fillStyle = s.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(cap, cx + cw / 2, numH + capH * 0.54, cw - capH * 0.4);
    ctx.restore();
  }
  const lw = logoH * LR;
  const lx = s.align === 'left' ? 0 : s.align === 'right' ? w - lw : (w - lw) / 2;
  logoAt(ctx, lx, numH + capH + logoH * 0.25, logoH, eo(seg(p, 0.6, 1)));
}

/** Logo + símbolo do Instagram + @primeirasnoticias_ — também usado pelas molduras. */
export function drawHandle(ctx: C, w: number, h: number, align: 'left' | 'center' | 'right', f = 1) {
  const lh = h * 0.86;
  const lw = lh * LR;
  const gs = h * 0.56;
  applyFont(ctx, SANS_BOLD, h * 0.5);
  const tw = ctx.measureText(PN.handle).width;
  const pad = h * 0.3;
  const total = pad + lw + pad * 1.2 + gs + h * 0.22 + tw + pad;
  const x0 = align === 'left' ? 0 : align === 'right' ? w - total : (w - total) / 2;
  ctx.save();
  ctx.globalAlpha *= f;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, withAlpha(PN.deep, 0.94));
  g.addColorStop(1, withAlpha(PN.navy, 0.94));
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, total, h);
  ctx.fillStyle = PN.sky;
  ctx.fillRect(x0, h - Math.max(2, h * 0.06), total, Math.max(2, h * 0.06));
  drawLogo(ctx, x0 + pad, (h - lh) / 2, lh);
  let x = x0 + pad + lw + pad * 0.6;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x, h * 0.22, Math.max(1.5, h * 0.03), h * 0.56);
  x += pad * 0.6;
  drawInstagramGlyph(ctx, x, (h - gs) / 2, gs);
  x += gs + h * 0.22;
  ctx.fillStyle = PN.white;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  applyFont(ctx, SANS_BOLD, h * 0.5);
  ctx.fillText(PN.handle, x, h * 0.53);
  ctx.restore();
}

function perfil(ctx: C, c: TextClip, { w, h, p }: HeadlineArgs) {
  drawHandle(ctx, w, h, c.style.align, eo(seg(p, 0, 1)));
}

function credito(ctx: C, c: TextClip, { w, h }: HeadlineArgs) {
  const s = c.style;
  const lh = h * 1.1;
  const lw = lh * LR;
  applyFont(ctx, COND_SEMI, h * 0.78 * s.fontScale);
  const label = c.fields.kicker ? `${c.fields.kicker}: ${c.fields.title}` : c.fields.title;
  const text = s.uppercase ? label.toLocaleUpperCase('pt-BR') : label;
  const tw = Math.min(ctx.measureText(text).width, w - lw - h * 0.4);
  const total = tw + h * 0.4 + lw;
  const x0 = s.align === 'left' ? 0 : s.align === 'right' ? w - total : (w - total) / 2;
  textShadow(ctx, h, 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0, h * 0.52, tw);
  noShadow(ctx);
  drawLogo(ctx, x0 + tw + h * 0.4, (h - lh) / 2, lh);
}

function plain(ctx: C, c: TextClip, { w, h }: HeadlineArgs) {
  const s = c.style;
  const fit = fitText(ctx, c.fields.title, SANS_BLACK, { maxW: w, maxH: h, maxSize: h * 0.9 * s.fontScale, lineHeight: 1.1, upper: s.uppercase });
  const y0 = (h - fit.height) / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fit.size * 0.14;
  ctx.strokeStyle = PN.navy;
  ctx.textBaseline = 'alphabetic';
  fit.lines.forEach((line, i) => {
    let x = lineX(line, 0, w, s.align);
    const y = y0 + i * fit.lineHeight + (fit.lineHeight - fit.size) / 2 + fit.size * 0.8;
    for (const r of line.runs) {
      if (r.text !== ' ') ctx.strokeText(r.text, x, y);
      x += r.w;
    }
  });
  textShadow(ctx, fit.size, 0.4);
  drawLines(ctx, fit, 0, y0, w, s.align, { text: PN.white, highlight: PN.yellow });
  noShadow(ctx);
}

const DRAWERS: Record<string, (ctx: C, c: TextClip, a: HeadlineArgs) => void> = {
  'pn-faixa': faixa,
  'pn-urgente': urgente,
  'pn-tarja': tarja,
  'pn-largo': largo,
  'pn-serif': serif,
  'pn-camera': camera,
  'pn-marcador': marcador,
  'pn-chapeu': chapeu,
  'pn-nome': nome,
  'pn-aovivo': aoVivo,
  'pn-letreiro': letreiro,
  'pn-citacao': citacao,
  'pn-numero': numero,
  'pn-perfil': perfil,
  'pn-credito': credito,
  plain,
};

export function drawHeadline(ctx: C, c: TextClip, a: HeadlineArgs) {
  const fn = DRAWERS[c.preset] ?? plain;
  // cores sempre as da marca; o usuário controla só alinhamento, caixa alta e corpo
  const pr = getPreset(c.preset);
  const style = { ...pr.style, align: c.style.align, uppercase: c.style.uppercase, fontScale: c.style.fontScale };
  ctx.save();
  fn(ctx, { ...c, style }, a);
  ctx.restore();
}
