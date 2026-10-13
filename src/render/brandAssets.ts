/**
 * Logos oficiais embutidas no app (não dependem da pasta brand/). São usadas
 * pelas manchetes e molduras — ficam "impregnadas" no gráfico.
 */
import horizontalUrl from '../assets/pn-logo-horizontal.png';
import normalUrl from '../assets/pn-logo-normal.png';

export type BrandLogo = 'horizontal' | 'normal';

export const LOGO_RATIO: Record<BrandLogo, number> = { horizontal: 2143 / 709, normal: 1214 / 1058 };

const urls: Record<BrandLogo, string> = { horizontal: horizontalUrl, normal: normalUrl };
const imgs: Partial<Record<BrandLogo, HTMLImageElement>> = {};
const listeners = new Set<() => void>();
let ready: Promise<void> | null = null;

function load(k: BrandLogo): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgs[k] = img;
      listeners.forEach((l) => l());
      resolve();
    };
    img.onerror = () => resolve();
    img.src = urls[k];
  });
}

export function ensureBrandAssets(): Promise<void> {
  if (!ready) ready = Promise.all([load('horizontal'), load('normal')]).then(() => undefined);
  return ready;
}

export function brandImage(k: BrandLogo): HTMLImageElement | null {
  if (!ready && typeof document !== 'undefined') void ensureBrandAssets();
  return imgs[k] ?? null;
}

export function onBrandLoaded(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type C = CanvasRenderingContext2D;

/** Desenha a logo horizontal com altura `h` a partir de (x, y). Retorna a largura ocupada. */
export function drawLogo(ctx: C, x: number, y: number, h: number, kind: BrandLogo = 'horizontal'): number {
  const w = h * LOGO_RATIO[kind];
  const img = brandImage(kind);
  if (!img) return w;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = h * 0.12;
  ctx.shadowOffsetY = h * 0.03;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  return w;
}

/** Símbolo do Instagram (contorno arredondado + lente + ponto) com o degradê característico. */
export function drawInstagramGlyph(ctx: C, x: number, y: number, s: number) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y + s, x + s, y);
  g.addColorStop(0, '#FEDA75');
  g.addColorStop(0.3, '#FA7E1E');
  g.addColorStop(0.55, '#D62976');
  g.addColorStop(0.8, '#962FBF');
  g.addColorStop(1, '#4F5BD5');
  const lw = s * 0.1;
  ctx.strokeStyle = g;
  ctx.fillStyle = g;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x + lw / 2, y + lw / 2, s - lw, s - lw, s * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s * 0.76, y + s * 0.24, s * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
