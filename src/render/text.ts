/**
 * Layout de texto para canvas: quebra de linha por largura, ajuste automático
 * de corpo e trechos destacados marcados com *asteriscos*.
 */

export interface Run {
  text: string;
  hl: boolean;
}

export interface LaidLine {
  runs: { text: string; hl: boolean; w: number }[];
  width: number;
}

export interface FontSpec {
  family: string;
  weight: number | string;
  style?: 'normal' | 'italic';
  /** espaçamento entre letras em frações do corpo */
  tracking?: number;
}

export const fontString = (f: FontSpec, size: number) =>
  `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${Math.max(1, size).toFixed(2)}px ${f.family}`;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function applyFont(ctx: Ctx, f: FontSpec, size: number) {
  ctx.font = fontString(f, size);
  const c = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${((f.tracking ?? 0) * size).toFixed(2)}px`;
}

/** Divide o texto em palavras, preservando o estado de destaque e quebras manuais. */
export function parseRich(text: string): Run[][] {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  let hl = false;
  return paragraphs.map((para) => {
    const words: Run[] = [];
    let buf = '';
    const flush = () => {
      if (buf) words.push({ text: buf, hl });
      buf = '';
    };
    for (const ch of para) {
      if (ch === '*') {
        flush();
        hl = !hl;
      } else if (ch === ' ' || ch === '\t') {
        flush();
        words.push({ text: ' ', hl });
      } else buf += ch;
    }
    flush();
    return words;
  });
}

export function stripMarkup(text: string): string {
  return text.replace(/\*/g, '');
}

/** Quebra os parágrafos em linhas que cabem em `maxWidth` com a fonte atual do contexto. */
export function wrap(ctx: Ctx, paragraphs: Run[][], maxWidth: number, upper: boolean): LaidLine[] {
  const lines: LaidLine[] = [];
  const space = ctx.measureText(' ').width;
  for (const para of paragraphs) {
    let line: LaidLine = { runs: [], width: 0 };
    let pendingSpace: boolean | null = null; // destaque do espaço pendente
    for (const r of para) {
      if (r.text === ' ') {
        if (line.runs.length) pendingSpace = r.hl;
        continue;
      }
      const t = upper ? r.text.toLocaleUpperCase('pt-BR') : r.text;
      const w = ctx.measureText(t).width;
      const add = (pendingSpace !== null ? space : 0) + w;
      if (line.runs.length && line.width + add > maxWidth) {
        lines.push(line);
        line = { runs: [], width: 0 };
        pendingSpace = null;
      }
      if (pendingSpace !== null && line.runs.length) {
        line.runs.push({ text: ' ', hl: pendingSpace, w: space });
        line.width += space;
      }
      line.runs.push({ text: t, hl: r.hl, w });
      line.width += w;
      pendingSpace = null;
    }
    lines.push(line);
  }
  // remove linhas vazias do fim
  while (lines.length > 1 && lines[lines.length - 1]!.runs.length === 0) lines.pop();
  return lines;
}

export interface FitResult {
  size: number;
  lines: LaidLine[];
  lineHeight: number;
  height: number;
  width: number;
}

/**
 * Maior corpo (≤ maxSize) cujo texto quebrado cabe na caixa maxW × maxH.
 * Busca binária — determinística, então preview e exportação concordam.
 */
export function fitText(
  ctx: Ctx,
  text: string,
  font: FontSpec,
  o: { maxW: number; maxH: number; maxSize: number; minSize?: number; lineHeight: number; upper: boolean; maxLines?: number },
): FitResult {
  const paragraphs = parseRich(text);
  const min = o.minSize ?? 6;
  let lo = min;
  let hi = Math.max(min, o.maxSize);
  let best: FitResult | null = null;
  const measure = (size: number): FitResult => {
    applyFont(ctx, font, size);
    const lines = wrap(ctx, paragraphs, o.maxW, o.upper);
    const lh = size * o.lineHeight;
    const width = lines.reduce((m, l) => Math.max(m, l.width), 0);
    return { size, lines, lineHeight: lh, height: lines.length * lh, width };
  };
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const r = measure(mid);
    const fits = r.height <= o.maxH && r.width <= o.maxW + 0.5 && (!o.maxLines || r.lines.length <= o.maxLines);
    if (fits) {
      best = r;
      lo = mid;
    } else hi = mid;
    if (hi - lo < 0.25) break;
  }
  const result = best ?? measure(min);
  applyFont(ctx, font, result.size);
  return result;
}

/**
 * Desenha linhas já calculadas. `x` é a borda esquerda da área, `y` o topo.
 * `lineAlpha(i)` e `lineOffset(i)` permitem animações por linha.
 */
export function drawLines(
  ctx: Ctx,
  fit: FitResult,
  x: number,
  y: number,
  areaW: number,
  align: 'left' | 'center' | 'right',
  colors: { text: string; highlight: string },
  per?: { alpha?: (i: number) => number; dy?: (i: number) => number; dx?: (i: number) => number },
) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const ascent = fit.size * 0.8;
  const pad = (fit.lineHeight - fit.size) / 2;
  fit.lines.forEach((line, i) => {
    const a = per?.alpha ? per.alpha(i) : 1;
    if (a <= 0) return;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * a;
    let lx = x;
    if (align === 'center') lx = x + (areaW - line.width) / 2;
    else if (align === 'right') lx = x + areaW - line.width;
    lx += per?.dx ? per.dx(i) : 0;
    const ly = y + i * fit.lineHeight + pad + ascent + (per?.dy ? per.dy(i) : 0);
    for (const r of line.runs) {
      ctx.fillStyle = r.hl ? colors.highlight : colors.text;
      if (r.text !== ' ') ctx.fillText(r.text, lx, ly);
      lx += r.w;
    }
    ctx.globalAlpha = prevAlpha;
  });
}

/** Posição X da linha `i` para o alinhamento dado (útil para blocos por linha). */
export function lineX(line: LaidLine, x: number, areaW: number, align: 'left' | 'center' | 'right') {
  if (align === 'center') return x + (areaW - line.width) / 2;
  if (align === 'right') return x + areaW - line.width;
  return x;
}
