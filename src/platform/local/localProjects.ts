/** Projetos salvos na memória local do aparelho (IndexedDB). */
import type { Project } from '../../core/model';
import { ProjectSchema } from '../../core/model';
import type { ProjectStore, ProjectSummary } from '../types';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

interface StoredProject {
  project: Project;
  thumb: string | null;
  createdAt: string;
  updatedAt: string;
}

export const localProjects: ProjectStore = {
  async list() {
    const all = await idbAll<StoredProject>('projects');
    return all
      .map(
        (r): ProjectSummary => ({
          id: r.project.id,
          name: r.project.name,
          format: r.project.format,
          thumb: r.thumb,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    const r = await idbGet<StoredProject>('projects', id);
    if (!r) throw new Error('Projeto não encontrado.');
    return ProjectSchema.parse(r.project);
  },
  async create(p) {
    const now = new Date().toISOString();
    await idbPut('projects', p.id, { project: ProjectSchema.parse(p), thumb: null, createdAt: now, updatedAt: now });
  },
  async save(p, thumb) {
    const prev = await idbGet<StoredProject>('projects', p.id);
    const now = new Date().toISOString();
    await idbPut('projects', p.id, {
      project: ProjectSchema.parse(p),
      thumb: thumb ?? prev?.thumb ?? null,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
  },
  async remove(id) {
    await idbDelete('projects', id);
  },
};
