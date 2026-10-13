/**
 * Molduras da marca. Cada moldura é UM clipe na timeline: desenha o fundo
 * Primeiras Notícias fora da janela do vídeo, a logo, o @perfil e, se tiver,
 * o letreiro. Ao aplicar, os vídeos são enquadrados na janela.
 */
import type { Clip, FrameClip, Project, Transform } from './model';
import { fitCover } from './factory';
import { uid } from './id';
import { newTrack, projectDuration } from './timeline';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameDef {
  id: string;
  name: string;
  description: string;
  /** janela do vídeo em frações do quadro */
  window: Rect;
  /** logo horizontal: centro e largura em frações do quadro */
  logo: { cx: number; cy: number; w: number };
  /** @perfil: centro vertical em fração, ou null */
  handle: number | null;
  ticker: boolean;
}

export const FRAMES: FrameDef[] = [
  {
    id: 'topo',
    name: 'Vídeo no topo',
    description: 'Logo no cabeçalho, vídeo em cima e espaço para a manchete embaixo.',
    window: { x: 0, y: 0.125, w: 1, h: 0.44 },
    logo: { cx: 0.5, cy: 0.064, w: 0.46 },
    handle: 0.958,
    ticker: false,
  },
  {
    id: 'central',
    name: 'Vídeo central',
    description: 'Vídeo no meio, logo em cima e manchete embaixo.',
    window: { x: 0, y: 0.22, w: 1, h: 0.4 },
    logo: { cx: 0.5, cy: 0.11, w: 0.56 },
    handle: 0.958,
    ticker: false,
  },
  {
    id: 'editorial',
    name: 'Janela editorial',
    description: 'Vídeo com margens, como uma página de jornal.',
    window: { x: 0.05, y: 0.16, w: 0.9, h: 0.48 },
    logo: { cx: 0.5, cy: 0.08, w: 0.5 },
    handle: 0.958,
    ticker: false,
  },
  {
    id: 'cheia',
    name: 'Tela cheia',
    description: 'Vídeo ocupando tudo, logo no canto e @perfil.',
    window: { x: 0, y: 0, w: 1, h: 1 },
    logo: { cx: 0.8, cy: 0.075, w: 0.34 },
    handle: 0.958,
    ticker: false,
  },
  {
    id: 'letreiro',
    name: 'Tela cheia com letreiro',
    description: 'Vídeo em tela cheia com letreiro correndo no rodapé.',
    window: { x: 0, y: 0, w: 1, h: 1 },
    logo: { cx: 0.8, cy: 0.075, w: 0.34 },
    handle: null,
    ticker: true,
  },
];

export const DEFAULT_TICKER = 'Acompanhe as principais notícias da Paraíba e do Brasil em primeirasnoticias.com.br';

export function getFrame(id: string): FrameDef {
  return FRAMES.find((f) => f.id === id) ?? FRAMES[0]!;
}

export function frameWindow(def: FrameDef, W: number, H: number) {
  return { x: def.window.x * W, y: def.window.y * H, w: def.window.w * W, h: def.window.h * H };
}

/** Enquadra uma mídia (proporção `ratio`) cobrindo a janela da moldura. */
export function coverWindow(def: FrameDef, W: number, H: number, ratio: number): Transform {
  const win = frameWindow(def, W, H);
  const tr = fitCover(ratio * 1000, 1000, win.w, win.h);
  return { ...tr, x: win.x + win.w / 2, y: win.y + win.h / 2 };
}

export function activeFrame(p: Project): FrameClip | undefined {
  return p.clips.find((c): c is FrameClip => c.type === 'frame');
}

/**
 * Aplica uma moldura: substitui a anterior, cria UM clipe numa trilha logo
 * acima da principal e enquadra os vídeos na janela.
 */
export function applyFrame(input: Project, frameId: string): { project: Project; clipId: string } {
  const def = getFrame(frameId);
  const W = input.width;
  const H = input.height;
  const old = activeFrame(input);
  let tracks = input.tracks;
  let trackId = old?.trackId;
  if (!trackId) {
    const t = newTrack('visual', 'Moldura');
    const mainIdx = tracks.findIndex((x) => x.kind === 'visual');
    tracks = [...tracks.slice(0, mainIdx + 1), t, ...tracks.slice(mainIdx + 1)];
    trackId = t.id;
  }
  const dur = projectDuration(input) || 15;
  const clip: FrameClip = {
    type: 'frame',
    id: uid(),
    trackId,
    name: `Moldura · ${def.name}`,
    start: old?.start ?? 0,
    duration: old ? old.duration : dur,
    transform: { x: W / 2, y: H / 2, width: W, height: H, rotation: 0, opacity: 1 },
    keyframes: [],
    animIn: { type: 'none', duration: 1 },
    animOut: { type: 'none', duration: 1 },
    frame: def.id,
    text: old?.text || DEFAULT_TICKER,
  };
  const clips = input.clips
    .filter((c) => c.type !== 'frame')
    .map((c): Clip => {
      if (c.type !== 'video') return c;
      const ratio = c.transform.width / c.transform.height;
      return { ...c, transform: { ...coverWindow(def, W, H, ratio), opacity: c.transform.opacity }, keyframes: [], backdrop: 'none' };
    });
  return { project: { ...input, tracks, clips: [...clips, clip] }, clipId: clip.id };
}
