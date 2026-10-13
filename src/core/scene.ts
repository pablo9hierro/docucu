/**
 * Avaliação determinística da cena em um instante. Preview e exportação
 * chamam exatamente esta função — é ela que garante o WYSIWYG.
 */
import type { Clip, Project, Transform, VisualClip } from './model';
import { isVisual } from './model';
import { animState, combineAnim, inOutProgress, transformAt, type AnimState } from './animation';
import { clipEnd } from './timeline';

export interface SceneItem {
  clip: VisualClip;
  /** tempo relativo ao início do clipe */
  localT: number;
  /** transformação após keyframes (sem animação) — usada pelos controles de edição */
  transform: Transform;
  /** estado da animação genérica combinada (entrada × saída) */
  anim: AnimState;
  /** progresso das animações encenadas (presets de manchete) */
  inP: number;
  outP: number;
  /** tempo no arquivo de origem para vídeo */
  mediaTime: number;
}

export function isActiveAt(c: Clip, t: number): boolean {
  return t >= c.start && t < clipEnd(c);
}

/** Itens visuais ativos em `t`, ordenados do fundo para a frente. */
export function evaluateScene(p: Project, t: number): SceneItem[] {
  const items: SceneItem[] = [];
  p.tracks.forEach((track) => {
    if (track.kind !== 'visual' || track.hidden) return;
    for (const c of p.clips) {
      if (c.trackId !== track.id || !isVisual(c) || !isActiveAt(c, t)) continue;
      items.push(evaluateClip(c, t));
    }
  });
  return items;
}

export function evaluateClip(c: VisualClip, t: number): SceneItem {
  const localT = Math.max(0, t - c.start);
  const transform = transformAt(c.transform, c.keyframes, localT);
  const { inP, outP } = inOutProgress(localT, c.duration, c.animIn, c.animOut);
  const size = { w: transform.width, h: transform.height };
  const anim = combineAnim(animState(c.animIn.type, inP, size), animState(c.animOut.type, outP, size));
  const mediaTime = c.type === 'video' ? c.sourceIn + localT * c.speed : 0;
  return { clip: c, localT, transform, anim, inP, outP, mediaTime };
}

/** Lista de tempos de quadro para exportação. */
export function frameTimes(duration: number, fps: number): number[] {
  const n = Math.max(1, Math.round(duration * fps));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i / fps;
  return out;
}
