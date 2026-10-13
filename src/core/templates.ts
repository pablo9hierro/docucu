/**
 * Modelos de publicação: aplicam de uma vez a diagramação típica de um Reels
 * jornalístico (posição do vídeo + manchete + logo da marca + assinatura).
 */
import type { Clip, MediaAsset, Project, VideoClip } from './model';
import { createImageClip, createTextClip, fitContain, fitCover } from './factory';
import { placeClip, projectDuration } from './timeline';
import { PN } from './brand';

export interface PublishTemplate {
  id: string;
  name: string;
  description: string;
  formats: Project['format'][];
}

export const TEMPLATES: PublishTemplate[] = [
  {
    id: 'reels-faixa',
    name: 'Vídeo no topo + Faixa PN',
    description: 'Vídeo na parte superior com fundo desfocado e faixa de manchete no rodapé.',
    formats: ['reel', 'feed45'],
  },
  {
    id: 'reels-urgente',
    name: 'Tela cheia + Urgente',
    description: 'Vídeo em tela cheia, selo URGENTE com manchete e @perfil.',
    formats: ['reel', 'feed45', 'feed11'],
  },
  {
    id: 'reels-tarja',
    name: 'Vídeo central + Tarja lateral',
    description: 'Vídeo centralizado sobre fundo navy e tarja logo abaixo.',
    formats: ['reel', 'feed45'],
  },
  {
    id: 'feed-serif',
    name: 'Editorial serifado',
    description: 'Vídeo entre a marca no topo e a manchete serifada.',
    formats: ['feed45', 'feed11', 'reel'],
  },
];

export interface TemplateOptions {
  /** imagem da marca (logo) para posicionar no modelo; opcional */
  logo?: MediaAsset;
}

export function applyTemplate(
  input: Project,
  templateId: string,
  opts: TemplateOptions = {},
): { project: Project; addedIds: string[] } {
  let p: Project = { ...input, clips: input.clips.map((c) => ({ ...c }) as Clip) };
  const W = p.width;
  const H = p.height;
  const dur = projectDuration(p) || 8;
  const added: string[] = [];
  const add = (c: Clip) => {
    c.start = 0;
    c.duration = dur;
    p = placeClip(p, c);
    added.push(c.id);
  };
  const setVideos = (fn: (v: VideoClip) => Partial<VideoClip>) => {
    p = { ...p, clips: p.clips.map((c) => (c.type === 'video' ? ({ ...c, ...fn(c), keyframes: [] } as Clip) : c)) };
  };
  const ratioOf = (v: VideoClip) => v.transform.width / v.transform.height;
  /** posiciona a logo dentro de uma caixa (centro cx,cy; tamanho máx bw×bh) */
  const logo = (cx: number, cy: number, bw: number, bh: number) => {
    if (!opts.logo) return;
    const l = createImageClip(p, opts.logo, 0);
    const box = fitContain(opts.logo.width || 1, opts.logo.height || 1, bw, bh);
    l.transform = { ...box, x: cx, y: cy };
    add(l);
  };
  const corner = () => {
    const bw = W * 0.28;
    const bh = H * 0.12;
    const m = W * 0.05;
    logo(W - m - bw / 2, m * (H > W ? 2.4 : 1) + bh / 2, bw, bh);
  };

  switch (templateId) {
    case 'reels-faixa': {
      const bandH = H * 0.3;
      setVideos((v) => {
        const tr = fitContain(ratioOf(v) * 1000, 1000, W, H - bandH);
        return { transform: { ...tr, y: (H - bandH) / 2 + H * 0.02 }, backdrop: 'blur' };
      });
      const t = createTextClip(p, 'pn-faixa', 0);
      t.transform = { ...t.transform, x: W / 2, y: H - bandH / 2, width: W, height: bandH };
      add(t);
      corner();
      break;
    }
    case 'reels-urgente': {
      setVideos((v) => ({ transform: fitCover(ratioOf(v) * 1000, 1000, W, H), backdrop: 'none' }));
      const t = createTextClip(p, 'pn-urgente', 0);
      t.transform = { ...t.transform, y: H * 0.66 };
      add(t);
      corner();
      const h = createTextClip(p, 'pn-perfil', 0);
      h.transform = { ...h.transform, y: H * 0.8 };
      add(h);
      break;
    }
    case 'reels-tarja': {
      setVideos((v) => {
        const tr = fitContain(ratioOf(v) * 1000, 1000, W, H * 0.5);
        return { transform: { ...tr, y: H * 0.36 }, backdrop: 'color', backdropColor: PN.navy };
      });
      const vh = p.clips.find((c): c is VideoClip => c.type === 'video')?.transform.height ?? H * 0.32;
      const t = createTextClip(p, 'pn-tarja', 0);
      t.transform = { ...t.transform, y: H * 0.36 + vh / 2 + t.transform.height / 2 + H * 0.03 };
      add(t);
      logo(W / 2, H * 0.1, W * 0.4, H * 0.1);
      add(createTextClip(p, 'pn-perfil', 0));
      break;
    }
    case 'feed-serif': {
      const top = H * 0.13;
      const bottom = H * 0.3;
      setVideos((v) => {
        const tr = fitContain(ratioOf(v) * 1000, 1000, W, H - top - bottom);
        return { transform: { ...tr, y: top + (H - top - bottom) / 2 }, backdrop: 'color', backdropColor: PN.navy };
      });
      logo(W / 2, top / 2, W * 0.6, top * 0.8);
      const t = createTextClip(p, 'pn-serif', 0);
      t.transform = { ...t.transform, x: W / 2, y: H - bottom / 2, width: W, height: bottom };
      add(t);
      break;
    }
  }
  return { project: p, addedIds: added };
}
