/**
 * Logos usadas nas molduras: a horizontal (cabeçalho) e a redonda (marca grande
 * que passa no fundo). O usuário escolhe qual imagem é a padrão de cada tipo;
 * a escolha fica salva no aparelho e vale para todas as molduras.
 */
import type { MediaAsset } from '../core/model';
import { setLogoOverride } from '../render/brandAssets';
import horizontalUrl from '../assets/pn-logo-horizontal.png';
import roundUrl from '../assets/pn-logo-round.png';

export type FrameLogoKind = 'horizontal' | 'round';
export const BUILTIN = 'builtin';
export const BUILTIN_URL: Record<FrameLogoKind, string> = { horizontal: horizontalUrl, round: roundUrl };

const key = (k: FrameLogoKind) => `pn-frame-logo-${k}`;

export function getFrameLogo(kind: FrameLogoKind): string {
  try {
    return localStorage.getItem(key(kind)) || BUILTIN;
  } catch {
    return BUILTIN;
  }
}

function urlFor(id: string, media: Record<string, MediaAsset>): string | null {
  if (id === BUILTIN) return null;
  return media[id]?.url ?? null;
}

/** Aplica as logos escolhidas (chamado ao abrir o editor e ao trocar a padrão). */
export function applyFrameLogos(media: Record<string, MediaAsset>) {
  for (const kind of ['horizontal', 'round'] as const) {
    void setLogoOverride(kind, urlFor(getFrameLogo(kind), media));
  }
}

export function setFrameLogo(kind: FrameLogoKind, id: string, media: Record<string, MediaAsset>) {
  try {
    localStorage.setItem(key(kind), id);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  void setLogoOverride(kind, urlFor(id, media));
}
