import { useEffect, useRef, useState } from 'react';
import type { MediaAsset, TextClip } from '../../core/model';
import { HEADLINE_PRESETS, type PresetCategory } from '../../core/presets';
import { TEMPLATES } from '../../core/templates';
import { createTextClip, createProject } from '../../core/factory';
import { drawHeadline } from '../../render/headlines';
import { ensureFonts } from '../../render/fonts';
import { media as mediaApi } from '../../platform/api';
import { getEditor, useEditor, type Panel } from '../../state/store';
import { addMedia, addShape, addSponsors, addText, applyTemplateCmd } from '../commands';
import { ACCEPT_ATTR, importFiles, onUploads, refreshBrand, type UploadProgress } from '../importer';
import { formatTime } from '../Transport';
import { IconClose, IconPlus, IconTrash, IconUpload } from '../icons';

const TITLES: Record<Panel, string> = {
  media: 'Mídia',
  brand: 'Marca',
  text: 'Manchetes',
  templates: 'Modelos de publicação',
  blur: 'Desfoque',
  elements: 'Elementos',
  audio: 'Áudio',
};

export function SidePanel({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  return (
    <aside className="side-panel" data-testid={`panel-${panel}`}>
      <div className="panel-head">
        <h3>{TITLES[panel]}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar painel">
          <IconClose />
        </button>
      </div>
      <div className="panel-body">
        {panel === 'media' && <MediaPanel kinds={['video', 'image']} />}
        {panel === 'audio' && <MediaPanel kinds={['audio']} />}
        {panel === 'brand' && <BrandPanel />}
        {panel === 'text' && <TextPanel />}
        {panel === 'templates' && <TemplatesPanel />}
        {panel === 'blur' && <BlurPanel />}
        {panel === 'elements' && <ElementsPanel />}
      </div>
    </aside>
  );
}

function useUploads() {
  const [list, setList] = useState<UploadProgress[]>([]);
  useEffect(() => {
    const off = onUploads(setList);
    return () => {
      off();
    };
  }, []);
  return list;
}

function MediaPanel({ kinds }: { kinds: MediaAsset['kind'][] }) {
  const all = useEditor((s) => s.media);
  const uploads = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const list = Object.values(all)
    .filter((m) => !m.brand && kinds.includes(m.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const remove = async (m: MediaAsset) => {
    const used = getEditor().project?.clips.some((c) => ('mediaId' in c && c.mediaId === m.id) || (c.type === 'sponsors' && c.mediaIds.includes(m.id)));
    if (!window.confirm(used ? 'Este arquivo está em uso no projeto. Excluir mesmo assim?' : `Excluir "${m.name}" da biblioteca?`)) return;
    await mediaApi.remove(m.id);
    getEditor().removeMedia(m.id);
  };

  return (
    <>
      <button className="btn wide" onClick={() => input.current?.click()} data-testid="import-btn">
        <IconUpload /> Importar {kinds.includes('audio') && kinds.length === 1 ? 'áudio' : 'vídeo ou imagem'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={kinds.includes('audio') && kinds.length === 1 ? 'audio/*' : ACCEPT_ATTR}
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files, false);
          e.target.value = '';
        }}
        data-testid="file-input"
      />
      <p className="hint">Toque em um item para inserir na agulha, ou arraste para a timeline.</p>
      {uploads.map((u) => (
        <div key={u.name} className="upload-row">
          <span className="ellipsis">{u.name}</span>
          <div className="bar">
            <div style={{ width: `${Math.round(u.progress * 100)}%` }} />
          </div>
        </div>
      ))}
      <div className={kinds.includes('audio') && kinds.length === 1 ? 'audio-list' : 'media-grid'}>
        {list.map((m) => (
          <div
            key={m.id}
            className={`media-item ${m.status}`}
            draggable={m.status === 'ready'}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-pn-media', m.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addMedia(m)}
            title={m.name}
            data-testid="media-item"
          >
            <div className="media-thumb">
              {m.kind === 'image' && <img src={m.url} alt="" loading="lazy" />}
              {m.kind === 'video' && m.thumbs && (
                <span
                  className="thumb-sprite"
                  style={{ backgroundImage: `url(${m.thumbs.url})`, backgroundSize: `${m.thumbs.count * 100}% 100%`, backgroundPosition: `${(Math.min(1, m.thumbs.count - 1) / Math.max(1, m.thumbs.count - 1)) * 100}% 0` }}
                />
              )}
              {m.kind === 'audio' && <span className="audio-glyph">♪</span>}
              {m.status === 'processing' && <span className="media-status">processando…</span>}
              {m.status === 'error' && <span className="media-status err" title={m.error}>erro</span>}
              {m.kind !== 'image' && m.status === 'ready' && <span className="media-dur">{formatTime(m.duration).slice(0, 5)}</span>}
            </div>
            <div className="media-name ellipsis">{m.name}</div>
            <button
              className="media-del"
              aria-label="Excluir"
              onClick={(e) => {
                e.stopPropagation();
                void remove(m);
              }}
            >
              <IconTrash />
            </button>
          </div>
        ))}
      </div>
      {list.length === 0 && uploads.length === 0 && <p className="muted small">Nenhum arquivo ainda.</p>}
    </>
  );
}

function BrandPanel() {
  const all = useEditor((s) => s.media);
  const input = useRef<HTMLInputElement>(null);
  const list = Object.values(all).filter((m) => m.brand);
  return (
    <>
      <p className="hint">
        Logos, selos e molduras da redação. Coloque imagens (PNG com ou sem fundo, JPG) na pasta <code>brand/</code> do projeto ou envie por aqui. Ao inserir, a logo vai para o canto
        superior — arraste e redimensione sobre a marca d'água que precisa cobrir.
      </p>
      <div className="row-gap">
        <button className="btn" onClick={() => input.current?.click()}>
          <IconUpload /> Enviar imagem
        </button>
        <button className="btn ghost" onClick={() => void refreshBrand()}>
          Atualizar lista
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          for (const f of files) {
            try {
              await mediaApi.uploadBrand(f);
            } catch (err) {
              getEditor().notify((err as Error).message, 'error');
            }
          }
          await refreshBrand();
        }}
      />
      <div className="media-grid brand-grid">
        {list.map((m) => (
          <div
            key={m.id}
            className="media-item ready"
            onClick={() => addMedia(m)}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-pn-media', m.id)}
            title={m.name}
          >
            <div className="media-thumb checker">
              <img src={m.url} alt="" />
            </div>
            <div className="media-name ellipsis">{m.name}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const CATS: { id: PresetCategory; label: string }[] = [
  { id: 'manchete', label: 'Manchetes' },
  { id: 'tarja', label: 'Tarjas e GC' },
  { id: 'selo', label: 'Selos' },
  { id: 'texto', label: 'Texto' },
];

function TextPanel() {
  return (
    <>
      <p className="hint">Toque para inserir na agulha. Duplo toque no vídeo edita o texto; use *asteriscos* para destacar.</p>
      {CATS.map((cat) => (
        <section key={cat.id} className="preset-section">
          <h4>{cat.label}</h4>
          <div className="preset-grid">
            {HEADLINE_PRESETS.filter((p) => p.category === cat.id).map((p) => (
              <button key={p.id} className="preset-card" onClick={() => addText(p.id)} title={p.description} data-testid={`preset-${p.id}`}>
                <PresetThumb presetId={p.id} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Miniatura viva do preset, desenhada pelo mesmo código do vídeo final. */
function PresetThumb({ presetId }: { presetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void ensureFonts().then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      const p = createProject('thumb', 'reel');
      const clip: TextClip = createTextClip(p, presetId, 0);
      const W = 280;
      const H = 120;
      const dpr = window.devicePixelRatio || 1;
      c.width = W * dpr;
      c.height = H * dpr;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, W * dpr, H * dpr);
      g.addColorStop(0, '#3b4652');
      g.addColorStop(1, '#1f262e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      const tw = clip.transform.width;
      const th = clip.transform.height;
      const s = Math.min((W * 0.92) / tw, (H * 0.8) / th) * dpr;
      ctx.translate((c.width - tw * s) / 2, (c.height - th * s) / 2);
      ctx.scale(s, s);
      drawHeadline(ctx, clip, { w: tw, h: th, p: 1, t: 1.2 });
    });
    return () => {
      alive = false;
    };
  }, [presetId]);
  return <canvas ref={ref} className="preset-thumb" />;
}

function TemplatesPanel() {
  const all = useEditor((s) => s.media);
  const format = useEditor((s) => s.project?.format ?? 'reel');
  const brand = Object.values(all).filter((m) => m.brand);
  const [logoId, setLogoId] = useState<string>('');
  const logo = brand.find((b) => b.id === logoId);
  return (
    <>
      <p className="hint">Aplica a diagramação completa sobre o vídeo atual: posição do vídeo, manchete, logo e @perfil. Tudo continua editável.</p>
      <label className="field">
        <span>Logo no modelo</span>
        <select className="input" value={logoId} onChange={(e) => setLogoId(e.target.value)}>
          <option value="">Sem logo</option>
          {brand.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="template-list">
        {TEMPLATES.filter((t) => t.formats.includes(format)).map((t) => (
          <button key={t.id} className="template-card" onClick={() => applyTemplateCmd(t.id, logo)} data-testid={`template-${t.id}`}>
            <strong>{t.name}</strong>
            <span className="muted small">{t.description}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function BlurPanel() {
  const tool = useEditor((s) => s.tool);
  // seleciona a referência estável e filtra no render (seletores do zustand não podem criar arrays novos)
  const clips = useEditor((s) => s.project?.clips);
  const blurs = (clips ?? []).filter((c) => c.type === 'blur');
  const set = (t: 'blur-rect' | 'blur-ellipse') => getEditor().set('tool', tool === t ? 'select' : t);
  return (
    <>
      <p className="hint">Escolha a forma e desenhe direto sobre o vídeo. Depois arraste para mover e puxe as alças para ajustar. Para seguir algo em movimento, ative keyframes no ajuste do item.</p>
      <div className="row-gap">
        <button className={`btn ${tool === 'blur-rect' ? 'primary' : ''}`} onClick={() => set('blur-rect')} data-testid="blur-rect">
          ▭ Retângulo
        </button>
        <button className={`btn ${tool === 'blur-ellipse' ? 'primary' : ''}`} onClick={() => set('blur-ellipse')} data-testid="blur-ellipse">
          ◯ Oval
        </button>
      </div>
      {blurs.length > 0 && (
        <div className="list">
          {blurs.map((b) => (
            <button key={b.id} className="list-row" onClick={() => getEditor().select([b.id])}>
              {b.name} · {formatTime(b.start).slice(0, 5)}–{formatTime(b.start + b.duration).slice(0, 5)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ElementsPanel() {
  return (
    <>
      <section className="preset-section">
        <h4>Patrocínio</h4>
        <button className="template-card" onClick={() => addSponsors()}>
          <strong>Oferecimento</strong>
          <span className="muted small">Linha "Oferecimento" com logos dos patrocinadores. Adicione as logos no ajuste do item.</span>
        </button>
      </section>
      <section className="preset-section">
        <h4>Formas</h4>
        <div className="row-gap wrap">
          <button className="btn" onClick={() => addShape('rect')}>
            <IconPlus /> Retângulo
          </button>
          <button className="btn" onClick={() => addShape('scrim-bottom')}>
            <IconPlus /> Sombra inferior
          </button>
          <button className="btn" onClick={() => addShape('scrim-top')}>
            <IconPlus /> Sombra superior
          </button>
        </div>
        <p className="hint">Sombras escurecem a imagem atrás das manchetes para dar leitura.</p>
      </section>
    </>
  );
}
