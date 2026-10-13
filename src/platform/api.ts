/**
 * Adaptadores de plataforma. A UI conhece apenas estas interfaces; hoje elas
 * falam com o backend Node local por HTTP. No futuro app Android, basta outra
 * implementação (ex.: plugin nativo via Capacitor) com a mesma assinatura.
 */
import type { MediaAsset, Project } from '../core/model';

export interface ProjectSummary {
  id: string;
  name: string;
  format: Project['format'];
  thumb: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  duration: number;
  crf: number;
}

export interface ExportInfo {
  id: string;
  projectId: string;
  status: 'rendering' | 'mixing' | 'done' | 'error' | 'cancelled';
  progress: number;
  fileName: string | null;
  filePath: string | null;
  error: string | null;
  settings: ExportSettings;
  createdAt: string;
  finishedAt: string | null;
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project>;
  create(p: Project): Promise<void>;
  save(p: Project, thumb?: string | null): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface MediaService {
  list(): Promise<MediaAsset[]>;
  get(id: string): Promise<MediaAsset>;
  upload(file: File, onProgress?: (f: number) => void): Promise<MediaAsset>;
  remove(id: string): Promise<void>;
  brand(): Promise<MediaAsset[]>;
  uploadBrand(file: File): Promise<void>;
  waveform(url: string): Promise<{ perSec: number; peaks: number[] }>;
}

export interface ExportService {
  start(p: Project, s: ExportSettings): Promise<{ id: string; totalFrames: number }>;
  pushFrames(id: string, frames: Blob[]): Promise<void>;
  finish(id: string): Promise<{ file: string }>;
  cancel(id: string): Promise<void>;
  get(id: string): Promise<ExportInfo>;
  list(projectId?: string): Promise<ExportInfo[]>;
  fileUrl(id: string, inline?: boolean): string;
  /** baixa o vídeo final do processador (para entregar ao dispositivo) */
  fetchFile(id: string): Promise<Blob>;
  /** apaga a cópia interna depois da entrega */
  discard(id: string): Promise<void>;
}

/**
 * Armazenamento do DISPOSITIVO (não do app). No navegador do PC ou do Android,
 * salvar dispara o download para a pasta Downloads do aparelho. No futuro app
 * nativo, esta interface grava direto na galeria/Downloads (MediaStore).
 */
export interface DeviceStorage {
  saveVideo(blob: Blob, fileName: string): Promise<void>;
}

export const deviceStorage: DeviceStorage = {
  async saveVideo(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // libera a memória do navegador depois que o download começou
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Sem conexão com o servidor local. Ele está rodando? (npm run dev)');
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const projects: ProjectStore = {
  list: () => req('/api/projects'),
  get: (id) => req(`/api/projects/${id}`),
  create: async (p) => {
    await req('/api/projects', jsonInit('POST', p));
  },
  save: async (p, thumb) => {
    await req(`/api/projects/${p.id}`, jsonInit('PUT', { project: p, thumb }));
  },
  remove: async (id) => {
    await req(`/api/projects/${id}`, { method: 'DELETE' });
  },
};

/** Upload com progresso (XHR, porque fetch não reporta progresso de envio). */
function uploadXhr<T>(url: string, file: File, onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      try {
        const body = JSON.parse(x.responseText || '{}') as T & { error?: string };
        if (x.status >= 200 && x.status < 300) resolve(body);
        else reject(new Error(body.error ?? `Falha no envio (${x.status})`));
      } catch {
        reject(new Error(`Falha no envio (${x.status})`));
      }
    };
    x.onerror = () => reject(new Error('Sem conexão com o servidor local.'));
    x.send(file);
  });
}

export const media: MediaService = {
  list: () => req('/api/media'),
  get: (id) => req(`/api/media/${id}`),
  upload: (file, onProgress) => uploadXhr(`/api/media?name=${encodeURIComponent(file.name)}`, file, onProgress),
  remove: async (id) => {
    await req(`/api/media/${id}`, { method: 'DELETE' });
  },
  brand: () => req('/api/brand'),
  uploadBrand: async (file) => {
    await uploadXhr(`/api/brand?name=${encodeURIComponent(file.name)}`, file);
  },
  waveform: (url) => req(url),
};

export const exportsApi: ExportService = {
  start: (p, s) => req('/api/exports', jsonInit('POST', { project: p, settings: s })),
  pushFrames: async (id, frames) => {
    const body = new Blob(frames, { type: 'application/octet-stream' });
    await req(`/api/exports/${id}/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Frame-Count': String(frames.length) },
      body,
    });
  },
  finish: (id) => req(`/api/exports/${id}/finish`, { method: 'POST' }),
  cancel: async (id) => {
    await req(`/api/exports/${id}`, { method: 'DELETE' });
  },
  get: (id) => req(`/api/exports/${id}`),
  list: (projectId) => req(`/api/exports${projectId ? `?projectId=${projectId}` : ''}`),
  fileUrl: (id, inline) => `/api/exports/${id}/file${inline ? '?inline=1' : ''}`,
  fetchFile: async (id) => {
    const res = await fetch(`/api/exports/${id}/file?inline=1`);
    if (!res.ok) throw new Error('Não foi possível obter o vídeo exportado.');
    return res.blob();
  },
  discard: async (id) => {
    await req(`/api/exports/${id}/file`, { method: 'DELETE' });
  },
};

export async function health(): Promise<{ ok: boolean; ffmpeg: string | null; error: string | null }> {
  return req('/api/health');
}
