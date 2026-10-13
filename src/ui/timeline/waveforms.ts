import { media } from '../../platform/api';

const cache = new Map<string, Promise<{ perSec: number; peaks: number[] }>>();

export function getWaveform(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = media.waveform(url).catch(() => ({ perSec: 50, peaks: [] }));
    cache.set(url, p);
  }
  return p;
}
