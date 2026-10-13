/**
 * Incrustação da logo nas placas das manchetes.
 *
 * A logo não é um adesivo por cima: ela fica DENTRO da placa, atrás do texto.
 * - usa a versão sobre fundo preto em mesclagem "screen": o preto desaparece e
 *   só a luz azul da marca atravessa a placa, como se estivesse impressa nela;
 * - é grande, ancorada numa borda e "sangra" para fora da placa (recortada por ela);
 * - esmaece em direção ao texto, para nunca disputar a leitura;
 * - um reflexo diagonal percorre a logo na entrada e depois a cada poucos segundos.
 *
 * Como fica presa à placa, cobrir a logo exige cobrir a própria manchete.
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
  /** borda onde a logo se apoia */
  anchor: 'right' | 'left' | 'center';
  /** altura da logo em relação à altura da área (até ~0.9 a logo cabe inteira) */
  scale: number;
  /** opacidade máxima da marca */
  alpha: number;
  /** presença 0..1 (entrada/saída da manchete) */
  p: number;
  /** tempo local (s), para o reflexo periódico */
  t: number;
  /** placa clara: logo em cinza, sem mesclagem screen */
  light?: boolean;
  /** recorte personalizado (ex.: blocos do marcador); padrão = retângulo da área */
  clip?: (ctx: C) => void;
}

const cache = new Map<string, HTMLCanvasElement>();
let glintCanvas: HTMLCanvasElement | null = null;

/** Logo já com a máscara de esmaecimento aplicada (em cache por tamanho/âncora). */
function fadedLogo(lw: number, lh: number, anchor: IncrustOptions['anchor'], light: boolean): HTMLCanvasElement | null {
  const img = brandImage(light ? 'horizontal' : 'watermark');
  if (!img) return null;
  const w = Math.max(1, Math.round(lw));
  const h = Math.max(1, Math.round(lh));
  const key = `${w}x${h}:${anchor}:${light ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (light) g.filter = 'grayscale(1) contrast(1.2)';
  g.drawImage(img, 0, 0, w, h);
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, w, 0);
  if (anchor === 'right') {
    // esmaece só a pontinha do lado do texto: o símbolo PN continua legível
    m.addColorStop(0, 'rgba(0,0,0,0.25)');
    m.addColorStop(0.16, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,1)');
  } else if (anchor === 'left') {
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(0.84, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0.25)');
  } else {
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.25, 'rgba(0,0,0,0.85)');
    m.addColorStop(0.75, 'rgba(0,0,0,0.85)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
  }
  g.fillStyle = m;
  g.fillRect(0, 0, w, h);
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}

/** Posição do reflexo (0..1 atravessando a logo) ou null quando em repouso. */
function glintPhase(p: number, t: number): number | null {
  if (p < 1) return p > 0.35 ? (p - 0.35) / 0.65 : null; // varre durante a entrada
  const period = 6;
  const sweep = 1.2;
  const local = (t + 2) % period;
  return local < sweep ? local / sweep : null;
}

export function incrust(ctx: C, area: IncrustArea, o: IncrustOptions) {
  const f = ease['ease-out'](clamp(o.p, 0, 1));
  if (f <= 0 || area.w <= 1 || area.h <= 1) return;
  const lh = area.h * o.scale;
  const lw = lh * LOGO_RATIO.watermark;
  const logo = fadedLogo(lw, lh, o.anchor, !!o.light);
  if (!logo) return;
  // a logo cabe inteira na placa: margem lateral igual à vertical
  const inset = Math.max(0, (area.h - lh) / 2);
  const lx =
    o.anchor === 'right' ? area.x + area.w - lw - inset : o.anchor === 'left' ? area.x + inset : area.x + (area.w - lw) / 2;
  // leve subida durante a entrada: a marca "emerge" da placa
  const ly = area.y + (area.h - lh) / 2 + (1 - f) * lh * 0.06;

  ctx.save();
  ctx.beginPath();
  if (o.clip) o.clip(ctx);
  else ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.globalCompositeOperation = o.light ? 'source-over' : 'screen';
  ctx.globalAlpha *= o.alpha * f;
  ctx.drawImage(logo, lx, ly, lw, lh);

  const phase = o.light ? null : glintPhase(o.p, o.t);
  if (phase !== null) {
    if (!glintCanvas) glintCanvas = document.createElement('canvas');
    const gc = glintCanvas;
    // reaproveita o canvas (realocar a cada quadro custava ~25 ms) e calcula a luz em
    // meia resolução: é um brilho suave em movimento, a diferença não aparece
    const gw = Math.max(1, Math.round(logo.width / 2));
    const gh = Math.max(1, Math.round(logo.height / 2));
    if (gc.width !== gw || gc.height !== gh) {
      gc.width = gw;
      gc.height = gh;
    }
    const g = gc.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    // faixa opaca preto → azul-claro → preto; multiplicada pela logo, só acende onde a logo brilha
    const cx = -0.3 * gc.width + phase * 1.6 * gc.width;
    const band = g.createLinearGradient(cx - gc.height * 0.5, 0, cx + gc.height * 0.5, gc.height);
    band.addColorStop(0, '#000');
    band.addColorStop(0.5, '#d2ecff');
    band.addColorStop(1, '#000');
    g.fillStyle = band;
    g.fillRect(0, 0, gc.width, gc.height);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(logo, 0, 0, gc.width, gc.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(logo, 0, 0, gc.width, gc.height);
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.6);
    ctx.drawImage(gc, lx, ly, lw, lh);
  }
  ctx.restore();
}
