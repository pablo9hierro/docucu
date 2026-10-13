/**
 * Salvar o vídeo final na memória do DISPOSITIVO.
 * - App Android (Capacitor): grava em Documentos/PrimeirasNoticias e permite
 *   compartilhar direto (Instagram, WhatsApp...).
 * - Navegador (PC ou celular): download para a pasta Downloads.
 */
import { Capacitor } from '@capacitor/core';
import type { DeviceStorage } from './types';

const FOLDER = 'PrimeirasNoticias';
const CHUNK = 3 * 1024 * 1024; // múltiplo de 3: base64 sem preenchimento entre pedaços

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

const webStorage: DeviceStorage = {
  async saveVideo(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'pasta Downloads';
  },
};

const nativeStorage: DeviceStorage = {
  async saveVideo(blob, fileName) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    try {
      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
    } catch {
      /* Android 11+ não exige permissão para arquivos criados pelo app */
    }
    const path = `${FOLDER}/${fileName}`;
    for (let off = 0; off < blob.size; off += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
      const data = toBase64(bytes);
      if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
      else await Filesystem.appendFile({ path, data, directory: Directory.Documents });
    }
    return `Documentos/${FOLDER}`;
  },
  async share(fileName) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.getUri({ path: `${FOLDER}/${fileName}`, directory: Directory.Documents });
    await Share.share({ title: fileName, files: [uri], dialogTitle: 'Compartilhar vídeo' });
  },
};

export const deviceStorage: DeviceStorage = Capacitor.isNativePlatform() ? nativeStorage : webStorage;
