/**
 * Caixas de diálogo do app (confirmação e entrada de texto), no lugar de
 * window.confirm/prompt. Uso: `if (await confirmDialog({...})) ...`.
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useBackHandler } from '../platform/backButton';

interface ConfirmReq {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

interface PromptReq {
  kind: 'prompt';
  title: string;
  label?: string;
  value: string;
  confirmLabel?: string;
  resolve: (v: string | null) => void;
}

type Req = ConfirmReq | PromptReq;

const useDialogs = create<{ queue: Req[] }>(() => ({ queue: [] }));

function push(r: Req) {
  useDialogs.setState((s) => ({ queue: [...s.queue, r] }));
}
function pop() {
  useDialogs.setState((s) => ({ queue: s.queue.slice(1) }));
}

export function confirmDialog(o: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => push({ ...o, kind: 'confirm', resolve }));
}

export function promptDialog(o: Omit<PromptReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => push({ ...o, kind: 'prompt', resolve }));
}

export function DialogHost() {
  const req = useDialogs((s) => s.queue[0]);
  if (!req) return null;
  return <Dialog key={req.title + req.kind} req={req} />;
}

function Dialog({ req }: { req: Req }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? req.value : '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = (ok: boolean) => {
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok && value.trim() ? value.trim() : null);
    pop();
  };

  // botão voltar do celular = Cancelar
  useBackHandler(true, () => close(false));

  useEffect(() => {
    if (req.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else okRef.current?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-back dialog-back" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <form
        className={`dialog ${req.kind === 'confirm' && req.danger ? 'danger' : ''}`}
        role="alertdialog"
        aria-labelledby="dlg-title"
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
        data-testid="dialog"
      >
        <h3 id="dlg-title">{req.title}</h3>
        {req.kind === 'confirm' && req.message && <p className="dialog-msg">{req.message}</p>}
        {req.kind === 'prompt' && (
          <label className="field">
            {req.label && <span>{req.label}</span>}
            <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => close(false)}>
            Cancelar
          </button>
          <button ref={okRef} type="submit" className={`btn ${req.kind === 'confirm' && req.danger ? 'danger' : 'primary'}`} data-testid="dialog-ok">
            {req.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </form>
    </div>
  );
}
