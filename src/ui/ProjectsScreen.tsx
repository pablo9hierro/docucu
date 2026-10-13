import { useEffect, useState } from 'react';
import { FORMATS, type FormatId } from '../core/model';
import { createProject } from '../core/factory';
import { uid } from '../core/id';
import { projects, type ProjectSummary } from '../platform/api';
import { useEditor } from '../state/store';
import { IconDots, IconPlus } from './icons';

const FORMAT_ORDER: FormatId[] = ['reel', 'feed45', 'feed11', 'wide'];

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function ProjectsScreen() {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const notify = useEditor((s) => s.notify);

  const refresh = () =>
    projects
      .list()
      .then(setList)
      .catch((e: Error) => {
        setList([]);
        notify(e.message, 'error');
      });

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (format: FormatId) => {
    const n = name.trim() || `Matéria ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const p = createProject(n, format);
    try {
      await projects.create(p);
      location.hash = `#/p/${p.id}`;
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const duplicate = async (id: string) => {
    const p = await projects.get(id);
    const copy = { ...p, id: uid(), name: `${p.name} (cópia)` };
    await projects.create(copy);
    setMenu(null);
    void refresh();
  };

  const rename = async (s: ProjectSummary) => {
    const p = await projects.get(s.id);
    const n = window.prompt('Novo nome do projeto', p.name);
    setMenu(null);
    if (!n?.trim()) return;
    await projects.save({ ...p, name: n.trim() });
    void refresh();
  };

  const remove = async (id: string) => {
    setMenu(null);
    if (!window.confirm('Excluir este projeto? Os arquivos de mídia continuam na biblioteca.')) return;
    await projects.remove(id);
    void refresh();
  };

  return (
    <div className="home" onClick={() => setMenu(null)}>
      <header className="home-top">
        <div className="wordmark">
          <span className="wm-a">Primeiras Notícias</span>
          <span className="wm-b">Studio</span>
        </div>
        <span className="home-local">Local · seus arquivos não saem deste computador</span>
      </header>

      <section className="home-new">
        <div className="home-new-head">
          <h2>Novo projeto</h2>
          <input
            className="input"
            placeholder="Nome da matéria (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="format-row">
          {FORMAT_ORDER.map((f) => {
            const fm = FORMATS[f];
            const ratio = fm.width / fm.height;
            return (
              <button key={f} className="format-card" onClick={() => void create(f)} data-testid={`new-${f}`}>
                <span className="format-box">
                  <span className="format-shape" style={{ width: Math.round(ratio < 1 ? 60 * ratio : 60), height: Math.round(ratio < 1 ? 60 : 60 / ratio) }}>
                    <IconPlus />
                  </span>
                </span>
                <span className="format-label">{fm.label}</span>
                <span className="format-res">
                  {fm.width}×{fm.height}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-list">
        <h2>Recentes</h2>
        {list === null ? (
          <p className="muted">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="muted">Nenhum projeto ainda. Escolha um formato acima para começar.</p>
        ) : (
          <div className="project-grid">
            {list.map((p) => (
              <div key={p.id} className="project-card">
                <a href={`#/p/${p.id}`} className="project-thumb" data-format={p.format}>
                  {p.thumb ? <img src={p.thumb} alt="" /> : <span className="muted">sem prévia</span>}
                </a>
                <div className="project-meta">
                  <a href={`#/p/${p.id}`} className="project-name" title={p.name}>
                    {p.name}
                  </a>
                  <span className="muted small">
                    {FORMATS[p.format]?.short ?? p.format} · {timeAgo(p.updatedAt)}
                  </span>
                </div>
                <button
                  className="icon-btn project-menu-btn"
                  aria-label="Opções"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenu(menu === p.id ? null : p.id);
                  }}
                >
                  <IconDots />
                </button>
                {menu === p.id && (
                  <div className="menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => void rename(p)}>Renomear</button>
                    <button onClick={() => void duplicate(p.id)}>Duplicar</button>
                    <button className="danger" onClick={() => void remove(p.id)}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
