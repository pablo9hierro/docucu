/**
 * Dicas de botões. No computador aparecem ao passar o mouse; no celular, ao
 * segurar o dedo sobre o botão (o toque longo não dispara o clique).
 * Fonte do texto: data-tip › title › aria-label. O `title` nativo é convertido
 * para data-tip para não aparecer a dica cinza padrão do navegador.
 */
import { useEffect, useState } from 'react';

const SELECTOR = '[data-tip],[title],button[aria-label],a[aria-label]';
const HOVER_DELAY = 450;
const HOLD_DELAY = 420;

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

function tipText(el: HTMLElement): string | null {
  const title = el.getAttribute('title');
  if (title) {
    el.setAttribute('data-tip', title);
    el.removeAttribute('title');
  }
  return el.getAttribute('data-tip') || el.getAttribute('aria-label');
}

function targetOf(n: EventTarget | null): HTMLElement | null {
  const el = (n as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
  if (!el || el.closest('.stage-overlay, .tl-lane')) return null;
  return el;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let hideTimer: number | undefined;
    let current: HTMLElement | null = null;
    let suppressClick = false;
    let start: { x: number; y: number } | null = null;

    const show = (el: HTMLElement) => {
      const text = tipText(el);
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 56;
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = targetOf(e.target);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      tipText(el); // remove o title nativo já na primeira passagem
      timer = window.setTimeout(() => current === el && show(el), HOVER_DELAY);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        hide();
        return;
      }
      const el = targetOf(e.target);
      if (!el) return;
      start = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer);
      timer = window.setTimeout(() => {
        show(el);
        suppressClick = true;
        navigator.vibrate?.(8);
      }, HOLD_DELAY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) window.clearTimeout(timer);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start = null;
      window.clearTimeout(timer);
      hideTimer = window.setTimeout(() => setTip(null), 1400);
    };
    const click = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    };
    const menu = (e: Event) => {
      if (targetOf(e.target)) e.preventDefault();
    };

    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', menu);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', menu);
      window.removeEventListener('scroll', hide, true);
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!tip) return null;
  // mantém a dica dentro da tela
  const x = Math.min(window.innerWidth - 12, Math.max(12, tip.x));
  return (
    <div className={`tooltip ${tip.below ? 'below' : ''}`} style={{ left: x, top: tip.y }} role="tooltip" data-testid="tooltip">
      {tip.text}
    </div>
  );
}
