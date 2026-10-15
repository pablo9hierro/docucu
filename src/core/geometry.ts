/** Geometria de manipulação direta: hit-test, alças, redimensionamento, rotação e guias. */
import type { Transform } from './model';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  const r = rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Converte um ponto do quadro para o sistema local (centro do elemento, sem rotação). */
export function toLocal(t: Transform, px: number, py: number) {
  return rotate(px - t.x, py - t.y, -t.rotation);
}

export function hitTest(t: Transform, px: number, py: number, pad = 0): boolean {
  const l = toLocal(t, px, py);
  return Math.abs(l.x) <= t.width / 2 + pad && Math.abs(l.y) <= t.height / 2 + pad;
}

export function corners(t: Transform): { x: number; y: number }[] {
  const hw = t.width / 2;
  const hh = t.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => {
    const r = rotate(x!, y!, t.rotation);
    return { x: t.x + r.x, y: t.y + r.y };
  });
}

/** Vetor unitário (no sistema local) de cada alça. */
export function handleDir(h: Handle): { x: number; y: number } {
  return {
    x: h.includes('e') ? 1 : h.includes('w') ? -1 : 0,
    y: h.includes('s') ? 1 : h.includes('n') ? -1 : 0,
  };
}

export interface ResizeOptions {
  /** cantos mantêm proporção por padrão; Shift inverte */
  keepAspect: boolean;
  /** Alt: redimensiona a partir do centro */
  fromCenter: boolean;
  minSize?: number;
}

/**
 * Redimensiona arrastando uma alça. `dx,dy` é o deslocamento do ponteiro em
 * coordenadas do quadro desde o início do gesto.
 */
export function resizeTransform(start: Transform, handle: Handle, dx: number, dy: number, o: ResizeOptions): Transform {
  const min = o.minSize ?? 8;
  const d = rotate(dx, dy, -start.rotation);
  const dir = handleDir(handle);
  const k = o.fromCenter ? 2 : 1;
  let w = start.width + dir.x * d.x * k;
  let h = start.height + dir.y * d.y * k;
  const isCorner = dir.x !== 0 && dir.y !== 0;
  if (isCorner && o.keepAspect) {
    const ratio = start.width / start.height;
    // projeta o movimento na diagonal para escala uniforme
    const sx = w / start.width;
    const sy = h / start.height;
    const s = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
    w = start.width * s;
    h = w / ratio;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (o.fromCenter) return { ...start, width: w, height: h };
  // mantém fixa a borda/canto oposto
  const shiftLocal = { x: (dir.x * (w - start.width)) / 2, y: (dir.y * (h - start.height)) / 2 };
  const shift = rotate(shiftLocal.x, shiftLocal.y, start.rotation);
  return { ...start, width: w, height: h, x: start.x + shift.x, y: start.y + shift.y };
}

/** Ângulo (graus) do ponteiro em relação ao centro, com imã em múltiplos de 45°. */
export function rotationFromPointer(t: Transform, px: number, py: number, startAngle: number, startRotation: number, snap: boolean) {
  const a = (Math.atan2(py - t.y, px - t.x) * 180) / Math.PI;
  let r = startRotation + (a - startAngle);
  r = ((((r + 180) % 360) + 360) % 360) - 180;
  if (snap) {
    const s = Math.round(r / 45) * 45;
    if (Math.abs(s - r) < 4) r = s;
  }
  return r;
}

export function pointerAngle(t: Transform, px: number, py: number) {
  return (Math.atan2(py - t.y, px - t.x) * 180) / Math.PI;
}

export interface Guide {
  axis: 'x' | 'y';
  pos: number;
}

/**
 * Imanta a posição de um elemento às linhas-guia do quadro (bordas, centro, terços)
 * e às bordas/centros de outros elementos.
 */
export function snapPosition(
  t: Transform,
  frame: { width: number; height: number },
  others: Transform[],
  threshold: number,
): { x: number; y: number; guides: Guide[] } {
  const hw = t.width / 2;
  const hh = t.height / 2;
  const xs = [0, frame.width / 2, frame.width];
  const ys = [0, frame.height / 2, frame.height];
  for (const o of others) {
    xs.push(o.x - o.width / 2, o.x, o.x + o.width / 2);
    ys.push(o.y - o.height / 2, o.y, o.y + o.height / 2);
  }
  const guides: Guide[] = [];
  const snap1 = (pos: number, half: number, lines: number[], axis: 'x' | 'y') => {
    let best = pos;
    let bestD = threshold;
    let line: number | null = null;
    for (const L of lines) {
      for (const off of [-half, 0, half]) {
        const d = Math.abs(pos + off - L);
        if (d < bestD) {
          bestD = d;
          best = L - off;
          line = L;
        }
      }
    }
    if (line !== null) guides.push({ axis, pos: line });
    return best;
  };
  const rotated = Math.abs(t.rotation % 90) > 0.5;
  const x = snap1(t.x, rotated ? 0 : hw, xs, 'x');
  const y = snap1(t.y, rotated ? 0 : hh, ys, 'y');
  return { x, y, guides };
}

/** Retângulo normalizado a partir de dois pontos (para desenhar máscaras). */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number) {
  const x0 = Math.min(ax, bx);
  const y0 = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);
  return { x: x0 + w / 2, y: y0 + h / 2, width: w, height: h };
}

export type CropEdge = 'l' | 't' | 'r' | 'b';
export interface CropValue {
  l: number;
  t: number;
  r: number;
  b: number;
}
export const NO_CROP: CropValue = { l: 0, t: 0, r: 0, b: 0 };
const MIN_VISIBLE = 0.05;

/**
 * Arrasta uma borda de corte. `d` = deslocamento do ponteiro ao longo do eixo
 * local da borda (x para l/r, y para t/b), em pixels do quadro. A parte que
 * continua visível fica parada no lugar; só a borda arrastada se move.
 */
export function dragCrop(tr: Transform, crop: CropValue, edge: CropEdge, d: number): { transform: Transform; crop: CropValue } {
  const fw = tr.width / Math.max(MIN_VISIBLE, 1 - crop.l - crop.r); // largura da mídia inteira
  const fh = tr.height / Math.max(MIN_VISIBLE, 1 - crop.t - crop.b);
  const c = { ...crop };
  let dw = 0; // variação de largura (positivo = cresce)
  let dh = 0;
  let sx = 0; // deslocamento do centro no eixo local
  let sy = 0;
  if (edge === 'l') {
    c.l = clampN(crop.l + d / fw, 0, 1 - crop.r - MIN_VISIBLE);
    dw = -(c.l - crop.l) * fw;
    sx = -dw / 2;
  } else if (edge === 'r') {
    c.r = clampN(crop.r - d / fw, 0, 1 - crop.l - MIN_VISIBLE);
    dw = (crop.r - c.r) * fw;
    sx = dw / 2;
  } else if (edge === 't') {
    c.t = clampN(crop.t + d / fh, 0, 1 - crop.b - MIN_VISIBLE);
    dh = -(c.t - crop.t) * fh;
    sy = -dh / 2;
  } else {
    c.b = clampN(crop.b - d / fh, 0, 1 - crop.t - MIN_VISIBLE);
    dh = (crop.b - c.b) * fh;
    sy = dh / 2;
  }
  const shift = rotate(sx, sy, tr.rotation);
  return {
    crop: c,
    transform: { ...tr, width: tr.width + dw, height: tr.height + dh, x: tr.x + shift.x, y: tr.y + shift.y },
  };
}

/** Remove o corte devolvendo a mídia inteira, sem mover o que já estava visível. */
export function removeCrop(tr: Transform, crop: CropValue): Transform {
  const fw = tr.width / Math.max(MIN_VISIBLE, 1 - crop.l - crop.r);
  const fh = tr.height / Math.max(MIN_VISIBLE, 1 - crop.t - crop.b);
  // centro da mídia inteira em relação ao centro da parte visível (eixo local)
  const sx = ((crop.r - crop.l) * fw) / 2;
  const sy = ((crop.b - crop.t) * fh) / 2;
  const shift = rotate(sx, sy, tr.rotation);
  return { ...tr, width: fw, height: fh, x: tr.x + shift.x, y: tr.y + shift.y };
}

/** Retângulo (no eixo local) da mídia inteira, relativo ao centro da parte visível. */
export function fullMediaRect(tr: Transform, crop: CropValue) {
  const fw = tr.width / Math.max(MIN_VISIBLE, 1 - crop.l - crop.r);
  const fh = tr.height / Math.max(MIN_VISIBLE, 1 - crop.t - crop.b);
  return { x: -tr.width / 2 - crop.l * fw, y: -tr.height / 2 - crop.t * fh, w: fw, h: fh };
}

function clampN(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
