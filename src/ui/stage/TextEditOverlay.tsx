/** Editor de texto ancorado ao elemento: o canvas continua mostrando o resultado real ao vivo. */
import { useEffect, useRef } from 'react';
import type { TextClip, Transform } from '../../core/model';
import { getPreset } from '../../core/presets';
import { patchClip } from '../../core/edit';
import { getEditor } from '../../state/store';

export function TextEditOverlay({ clip, tr, scale }: { clip: TextClip; tr: Transform; scale: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preset = getPreset(clip.preset);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const bottom = (tr.y + tr.height / 2) * scale;
  const frameH = (getEditor().project?.height ?? 0) * scale;
  const below = bottom + 120 < frameH;
  const style = below
    ? { top: bottom + 8 }
    : { top: Math.max(4, (tr.y - tr.height / 2) * scale - 128) };

  const setField = (key: keyof TextClip['fields'], value: string) =>
    getEditor().apply((p) => patchClip(p, clip.id, { fields: { ...clip.fields, [key]: value } } as Partial<TextClip>), `text-${clip.id}-${key}`);

  const close = () => getEditor().set('editingTextId', null);

  return (
    <div className="text-edit" style={style} onPointerDown={(e) => e.stopPropagation()}>
      {preset.uses.includes('kicker') && (
        <input className="input" value={clip.fields.kicker} placeholder="Chapéu / selo" onChange={(e) => setField('kicker', e.target.value)} onKeyDown={(e) => e.key === 'Escape' && close()} />
      )}
      <textarea
        ref={ref}
        className="input"
        rows={3}
        value={clip.fields.title}
        onChange={(e) => setField('title', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) close();
        }}
        data-testid="text-edit-title"
      />
      {preset.uses.includes('subtitle') && (
        <input className="input" value={clip.fields.subtitle} placeholder="Linha de apoio" onChange={(e) => setField('subtitle', e.target.value)} onKeyDown={(e) => e.key === 'Escape' && close()} />
      )}
      <div className="text-edit-foot">
        <span className="muted small">*trecho* = destaque · Ctrl+Enter conclui</span>
        <button className="btn sm" onClick={close}>
          Concluir
        </button>
      </div>
    </div>
  );
}
