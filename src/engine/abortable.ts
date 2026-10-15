/**
 * Ajuda o "Cancelar" a responder na hora: qualquer espera da exportação
 * (busca de quadro, flush do codificador, rede) é interrompida pelo sinal.
 */
export const abortError = () => new DOMException('Exportação cancelada', 'AbortError');

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

export function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.aborted ? abortError() : e);
      },
    );
  });
}

/**
 * Espera a fila do codificador baixar. Usa o evento "dequeue" (não depende de
 * timers, que o navegador desacelera com o app em segundo plano).
 */
export function waitQueue(enc: { encodeQueueSize: number; addEventListener(t: 'dequeue', f: () => void): void; removeEventListener(t: 'dequeue', f: () => void): void }, max: number, signal: AbortSignal): Promise<void> {
  if (enc.encodeQueueSize <= max) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      enc.removeEventListener('dequeue', check);
      signal.removeEventListener('abort', onAbort);
      clearInterval(timer);
    };
    const check = () => {
      if (enc.encodeQueueSize <= max) {
        done();
        resolve();
      }
    };
    const onAbort = () => {
      done();
      reject(abortError());
    };
    enc.addEventListener('dequeue', check);
    signal.addEventListener('abort', onAbort, { once: true });
    // rede de segurança para navegadores sem o evento "dequeue"
    const timer = setInterval(check, 20);
  });
}
