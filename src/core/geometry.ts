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
