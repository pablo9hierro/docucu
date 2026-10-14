/**
 * Botão "voltar" do Android. Cada parte da interface registra o que fazer
 * quando ele é tocado; o registro mais recente (o que está "por cima") é
 * atendido primeiro. Se nada tratar: no editor volta à lista de projetos e,
 * na lista, pergunta se quer sair do app.
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

type Handler = () => boolean;
const stack: { fn: Handler }[] = [];

/** Registra um tratador enquanto `active` for verdadeiro. Retorne true se tratou. */
export function useBackHandler(active: boolean, fn: () => boolean | void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry = { fn: () => ref.current() !== false };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Executa o "voltar": o tratador mais recente primeiro. Retorna true se algo tratou. */
export function runBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.fn()) return true;
  }
  return false;
}

let installed = false;

/** Liga o botão voltar do sistema (só no app nativo). */
export async function installBackButton(fallback: () => void) {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!runBack()) fallback();
  });
}

export async function exitApp() {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
