/**
 * Carimbo da marca nas placas das manchetes.
 *
 * Só o SÍMBOLO "pn" (sem o nome), como um carimbo no canto inferior direito da
 * placa: fica atrás do texto, pega apenas a ponta das letras e "sangra" para
 * fora da placa (recortado por ela), levemente girado.
 * - versão escura em mesclagem "screen": o preto some e só a luz azul aparece;
 * - esmaece no lado voltado para o texto, para não misturar com as letras;
 * - um reflexo diagonal passa pelo símbolo na entrada e a cada poucos segundos.
 *
 * Como fica preso à placa, cobrir a marca exige cobrir a própria manchete.
 */
import { clamp, ease } from '../core/animation';
import { brandImage, LOGO_RATIO } from './brandAssets';

type C = CanvasRenderingContext2D;

export interface IncrustArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IncrustOptions {
  /** mantido por compatibilidade; o carimbo sempre vai ao canto inferior direito */
  anchor: 'right' | 'left' | 'center';
  /** mantido por compatibilidade (o tamanho do carimbo é calculado pela placa) */
  scale: number;
  /** opacidade base */
  alpha: number;
  /** presença 0..1 (entrada/saída da manchete) */
  p: number;
  /** tempo local (s), para o reflexo periódico */
  t: number;
  /** placa clara: carimbo em cinza */
  light?: boolean;
  /** 'stamp' (padrão) = símbolo como carimbo; 'banner' = logo horizontal inteira à direita (usado no GC) */
  mode?: 'stamp' | 'banner';
  /** recorte personalizado (ex.: blocos do marcador); padrão = retângulo da área */
  clip?: (ctx: C) => void;
}

/** multiplicador global da opacidade do carimbo */
const BOOST = 1.65;
/** proporção do símbolo recortado (pn-symbol-watermark.jpg) */
const SYMBOL_RATIO = 612 / 508;
/** inclinação do carimbo (graus) */
const TILT = -12;

const cache = new Map<string, HTMLCanvasElement>();
let glintCanvas: HTMLCanvasElement | null = null;

/** Símbolo recortado no anel oval, com esmaecimento para o lado do texto (em cache). */
function stampImage(w: number, h: number, light: boolean): HTMLCanvasElement | null {
  const img = brandImage('symbol');
  if (!img) return null;
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const key = `${cw}x${ch}:${light ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  // máscara oval inclinada acompanhando o anel (descarta restos da placa da logo)
  g.save();
  g.beginPath();
  g.ellipse(cw * 0.5, ch * 0.5, cw * 0.495, ch * 0.455, (-14 * Math.PI) / 180, 0, Math.PI * 2);
  g.clip();
  if (light) g.filter = 'grayscale(1) invert(1)';
  g.drawImage(img, 0, 0, cw, ch);
  g.restore();
  g.filter = 'none';
  // esmaece do canto superior esquerdo (lado do texto) para o inferior direito
  g.globalCompositeOperation = light ? 'source-over' : 'destination-in';
  const m = g.createLinearGradient(0, 0, cw, ch);
  if (light) {
    // placa clara: clareia o lado do texto misturando com branco
    m.addColorStop(0, 'rgba(255,255,255,0.75)');
    m.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, cw, ch);
  } else {
    m.addColorStop(0, 'rgba(0,0,0,0.25)');
    m.addColorStop(0.5, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = m;
    g.fillRect(0, 0, cw, ch);
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}

/** Posição do reflexo (0..1 atravessando o símbolo) ou null quando em repouso. */
function glintPhase(p: number, t: number): number | null {
  if (p < 1) return p > 0.35 ? (p - 0.35) / 0.65 : null; // varre durante a entrada
  const period = 6;
  const sweep = 1.2;
  const local = (t + 2) % period;
  return local < sweep ? local / sweep : null;
}

/** Logo horizontal inteira, ancorada à direita dentro da placa, esmaecendo só na ponta do lado do texto. */
function bannerImage(w: number, h: number): HTMLCanvasElement | null {
  const img = brandImage('watermark');
  if (!img) return null;
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const key = `banner:${cw}x${ch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, cw, ch);
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, cw, 0);
  m.addColorStop(0, 'rgba(0,0,0,0.25)');
  m.addColorStop(0.16, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = m;
  g.fillRect(0, 0, cw, ch);
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}

function drawBanner(ctx: C, area: IncrustArea, o: IncrustOptions, f: number) {
  const lh = area.h * o.scale;
  const lw = lh * LOGO_RATIO.watermark;
  const logo = bannerImage(lw, lh);
  if (!logo) return;
  const inset = Math.max(0, (area.h - lh) / 2);
  const lx = area.x + area.w - lw - inset;
  const ly = area.y + (area.h - lh) / 2 + (1 - f) * lh * 0.06;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha *= Math.min(0.62, o.alpha * BOOST) * f;
  ctx.drawImage(logo, lx, ly, lw, lh);
  ctx.restore();
}

export function incrust(ctx: C, area: IncrustArea, o: IncrustOptions) {
  const f = ease['ease-out'](clamp(o.p, 0, 1));
  if (f <= 0 || area.w <= 1 || area.h <= 1) return;
  if (o.mode === 'banner') return drawBanner(ctx, area, o, f);
  // tamanho do carimbo: proporcional à altura da placa, sem passar de ~1/3 da largura
  const sh = Math.min(area.h * 1.05, (area.w * 0.34) / SYMBOL_RATIO);
  const sw = sh * SYMBOL_RATIO;
  const stamp = stampImage(sw, sh, !!o.light);
  if (!stamp) return;
  // canto inferior direito, sangrando ~18% para fora da placa
  const cx = area.x + area.w - sw * 0.32;
  const cy = area.y + area.h - sh * 0.3 + (1 - f) * sh * 0.08;

  ctx.save();
  ctx.beginPath();
  if (o.clip) o.clip(ctx);
  else ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((TILT * Math.PI) / 180);
  ctx.globalCompositeOperation = o.light ? 'multiply' : 'screen';
  ctx.globalAlpha *= Math.min(0.62, o.alpha * BOOST) * f;
  ctx.drawImage(stamp, -sw / 2, -sh / 2, sw, sh);

  const phase = o.light ? null : glintPhase(o.p, o.t);
  if (phase !== null) {
    if (!glintCanvas) glintCanvas = document.createElement('canvas');
    const gc = glintCanvas;
    // meia resolução e canvas reaproveitado: brilho suave, custo baixo
    const gw = Math.max(1, Math.round(stamp.width / 2));
    const gh = Math.max(1, Math.round(stamp.height / 2));
    if (gc.width !== gw || gc.height !== gh) {
      gc.width = gw;
      gc.height = gh;
    }
    const g = gc.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    // faixa opaca preto → azul-claro → preto; multiplicada pelo símbolo, só acende onde ele brilha
    const bx = -0.3 * gw + phase * 1.6 * gw;
    const band = g.createLinearGradient(bx - gh * 0.5, 0, bx + gh * 0.5, gh);
    band.addColorStop(0, '#000');
    band.addColorStop(0.5, '#d2ecff');
    band.addColorStop(1, '#000');
    g.fillStyle = band;
    g.fillRect(0, 0, gw, gh);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(stamp, 0, 0, gw, gh);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(stamp, 0, 0, gw, gh);
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.6);
    ctx.drawImage(gc, -sw / 2, -sh / 2, sw, sh);
  }
  ctx.restore();
}
