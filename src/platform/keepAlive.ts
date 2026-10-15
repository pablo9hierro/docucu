/**
 * Mantém a exportação rodando com o app/aba em segundo plano.
 * - Android: serviço em primeiro plano (notificação) via plugin nativo KeepAlive.
 * - Navegador: Web Lock (o Chrome não congela abas que seguram um lock) e
 *   Wake Lock de tela quando disponível.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface KeepAlivePlugin {
  start(o: { title: string }): Promise<void>;
  stop(): Promise<void>;
}
const Native = registerPlugin<KeepAlivePlugin>('KeepAlive');

export interface KeepAliveHandle {
  release(): void;
}

export function keepAlive(title = 'Exportando vídeo'): KeepAliveHandle {
  let released = false;
  let unlock: (() => void) | null = null;
  let wake: { release(): Promise<void> } | null = null;

  if (Capacitor.isNativePlatform()) void Native.start({ title }).catch(() => undefined);

  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) {
      void locks
        .request('pn-export', () => new Promise<void>((resolve) => (released ? resolve() : (unlock = resolve))))
        .catch(() => undefined);
    }
  } catch {
    /* sem Web Locks */
  }
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    void wl
      ?.request('screen')
      .then((l) => (released ? void l.release() : (wake = l)))
      .catch(() => undefined);
  } catch {
    /* sem Wake Lock */
  }

  return {
    release() {
      if (released) return;
      released = true;
      unlock?.();
      void wake?.release().catch(() => undefined);
      if (Capacitor.isNativePlatform()) void Native.stop().catch(() => undefined);
    },
  };
}
