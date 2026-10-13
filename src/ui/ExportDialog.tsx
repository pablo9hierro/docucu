import { useEffect, useRef, useState } from 'react';
import { projectDuration } from '../core/timeline';
import { getEditor, useEditor } from '../state/store';
import { runExport, type ExportProgress } from '../engine/exporter';
import { exportsApi, type ExportInfo } from '../platform/api';
import { stopPlayback } from './commands';
import { formatTime } from './Transport';
import { IconClose, IconFolder } from './icons';

const QUALITY = [
  { id: 'high', label: 'Alta', crf: 16 },
  { id: 'std', label: 'Padrão', crf: 19 },
  { id: 'light', label: 'Leve', crf: 24 },
] as const;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project)!;
  const duration = projectDuration(project);
  const [res, setRes] = useState<'full' | 'hd'>('full');
  const [quality, setQuality] = useState<(typeof QUALITY)[number]['id']>('std');
  const [fps, setFps] = useState<number>(project.fps);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<{ id: string; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportInfo[]>([]);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(0);

  useEffect(() => {
    exportsApi.list(project.id).then((l) => setHistory(l.filter((x) => x.status === 'done').slice(0, 5)), () => undefined);
  }, [project.id, result]);

  const scale = res === 'full' ? 1 : 720 / Math.min(project.width, project.height);
  const width = Math.round((project.width * scale) / 2) * 2;
  const height = Math.round((project.height * scale) / 2) * 2;

  const start = async () => {
    stopPlayback();
    setError(null);
    setResult(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    started.current = performance.now();
    try {
      const r = await runExport(
        project,
        getEditor().media,
        { width, height, fps, duration, crf: QUALITY.find((q) => q.id === quality)!.crf },
        setProgress,
        ctrl.signal,
      );
      setResult(r);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      setProgress(null);
    } finally {
      abort.current = null;
    }
  };

  const busy = !!abort.current && !result && !error;
  const pct = progress ? (progress.phase === 'encoding' ? 99 : progress.total ? Math.floor((progress.frame / progress.total) * 98) : 0) : 0;
  const eta = progress && progress.fps > 0 ? (progress.total - progress.frame) / progress.fps : null;

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-label="Exportar vídeo" data-testid="export-dialog">
        <div className="modal-head">
          <h3>Exportar vídeo</h3>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Fechar">
            <IconClose />
          </button>
        </div>

        {duration <= 0 ? (
          <p className="muted">A timeline está vazia.</p>
        ) : (
          <>
            {!busy && !result && (
              <div className="export-form">
                <div className="field">
                  <span>Resolução</span>
                  <div className="seg">
                    <button className={res === 'full' ? 'on' : ''} onClick={() => setRes('full')}>
                      {project.width}×{project.height}
                    </button>
                    <button className={res === 'hd' ? 'on' : ''} onClick={() => setRes('hd')}>
                      {Math.round((project.width * (720 / Math.min(project.width, project.height))) / 2) * 2}×
                      {Math.round((project.height * (720 / Math.min(project.width, project.height))) / 2) * 2}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <span>Qualidade</span>
                  <div className="seg">
                    {QUALITY.map((q) => (
                      <button key={q.id} className={quality === q.id ? 'on' : ''} onClick={() => setQuality(q.id)}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Quadros por segundo</span>
                  <div className="seg">
                    {[24, 25, 30, 60].map((f) => (
                      <button key={f} className={fps === f ? 'on' : ''} onClick={() => setFps(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="muted small">
                  MP4 · H.264 + AAC · {formatTime(duration, fps)} · {Math.round(duration * fps)} quadros. Renderizado no seu computador com o mesmo motor do preview.
                </p>
                {error && <p className="error-text">{error}</p>}
                <button className="btn primary wide" onClick={() => void start()} data-testid="start-export">
                  Exportar MP4
                </button>
              </div>
            )}

            {busy && progress && (
              <div className="export-progress">
                <div className="bar big">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="row-between">
                  <span>
                    {progress.phase === 'preparing' && 'Preparando mídia…'}
                    {progress.phase === 'rendering' && `Quadro ${progress.frame} de ${progress.total}`}
                    {progress.phase === 'encoding' && 'Mixando áudio e finalizando…'}
                  </span>
                  <span className="muted">
                    {pct}%{eta !== null && progress.phase === 'rendering' ? ` · ~${Math.ceil(eta)} s` : ''}
                  </span>
                </div>
                <button className="btn" onClick={() => abort.current?.abort()}>
                  Cancelar
                </button>
              </div>
            )}

            {result && (
              <div className="export-done" data-testid="export-done">
                <video src={exportsApi.fileUrl(result.id, true)} controls playsInline className="export-video" />
                <p className="small">
                  Pronto: <strong>{result.file}</strong> · {((performance.now() - started.current) / 1000).toFixed(0)} s
                </p>
                <div className="row-gap">
                  <a className="btn primary" href={exportsApi.fileUrl(result.id)} download>
                    Baixar
                  </a>
                  <button className="btn" onClick={() => void exportsApi.reveal(result.id)}>
                    <IconFolder /> Mostrar na pasta
                  </button>
                  <button className="btn ghost" onClick={() => setResult(null)}>
                    Nova exportação
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {history.length > 0 && !busy && (
          <div className="export-history">
            <h4>Exportações anteriores</h4>
            {history.map((h) => (
              <div key={h.id} className="list-row">
                <span className="ellipsis">{h.fileName}</span>
                <a className="btn sm ghost" href={exportsApi.fileUrl(h.id)} download>
                  Baixar
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
