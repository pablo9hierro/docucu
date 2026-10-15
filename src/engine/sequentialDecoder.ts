/**
 * Decodificação SEQUENCIAL para a exportação.
 *
 * Posicionar um <video> quadro a quadro obriga o aparelho a redecodificar desde
 * o último quadro-chave a cada quadro (muito lento em vídeos de celular). Aqui o
 * MP4 é lido uma única vez (mp4box) e entregue em ordem ao decodificador de
 * hardware (WebCodecs VideoDecoder). O quadro devolvido para o instante t é o
 * mesmo que o <video> mostraria em t — o resultado visual é idêntico.
 *
 * Se o arquivo não for MP4/MOV ou o codec não for suportado, `create` devolve
 * null e a exportação usa o método antigo (posicionar o <video>).
 */
import MP4Box, { type MP4Sample, type MP4VideoTrack } from 'mp4box';

interface Sample {
  data: Uint8Array;
  /** tempo de apresentação em microssegundos */
  ts: number;
  dur: number;
  key: boolean;
}

function description(file: ReturnType<typeof MP4Box.createFile>, track: MP4VideoTrack): Uint8Array | undefined {
  const trak = file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (box) {
      const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // remove o cabeçalho da caixa
    }
  }
  return undefined;
}

/** Rotação gravada pela câmera (matriz do track), em múltiplos de 90°. */
function rotationOf(m: ArrayLike<number>): number {
  const a = (m[0] ?? 65536) / 65536;
  const b = (m[1] ?? 0) / 65536;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90;
  return ((deg % 360) + 360) % 360;
}

function demux(buffer: ArrayBuffer): Promise<{ track: MP4VideoTrack; samples: Sample[]; desc?: Uint8Array } | null> {
  return new Promise((resolve) => {
    const file = MP4Box.createFile();
    let track: MP4VideoTrack | null = null;
    const samples: Sample[] = [];
    file.onError = () => resolve(null);
    file.onReady = (info) => {
      track = info.videoTracks[0] ?? null;
      if (!track) return resolve(null);
      file.setExtractionOptions(track.id, null, { nbSamples: Infinity });
      file.start();
    };
    file.onSamples = (_id, _u, list: MP4Sample[]) => {
      for (const s of list) {
        samples.push({ data: s.data, ts: (s.cts * 1e6) / s.timescale, dur: (s.duration * 1e6) / s.timescale, key: s.is_sync });
      }
    };
    const ab = buffer as ArrayBuffer & { fileStart: number };
    ab.fileStart = 0;
    try {
      file.appendBuffer(ab);
      file.flush();
    } catch {
      return resolve(null);
    }
    if (!track) return resolve(null);
    const t = track as MP4VideoTrack;
    resolve(samples.length ? { track: t, samples, desc: description(file, t) } : null);
  });
}

export class SequentialDecoder {
  private decoder!: VideoDecoder;
  private queue: VideoFrame[] = [];
  private current: VideoFrame | null = null;
  private next = 0;
  private flushed = false;
  private flushing = false;
  private wake: (() => void) | null = null;
  private error: Error | null = null;
  private lastTarget = -Infinity;
  private canvas: HTMLCanvasElement | null = null;
  /** apresentação do 1º quadro: o <video> considera esse instante como 0 */
  private origin: number;

  private constructor(
    private readonly samples: Sample[],
    private readonly config: VideoDecoderConfig,
    private readonly rotation: number,
  ) {
    this.origin = Math.min(...samples.map((s) => s.ts));
    this.createDecoder();
  }

  static async create(url: string): Promise<SequentialDecoder | null> {
    if (typeof VideoDecoder === 'undefined') return null;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const d = await demux(buf);
      if (!d) return null;
      const config: VideoDecoderConfig = {
        codec: d.track.codec.startsWith('vp08') ? 'vp8' : d.track.codec,
        codedWidth: d.track.video.width,
        codedHeight: d.track.video.height,
        description: d.desc,
        hardwareAcceleration: 'no-preference',
      };
      const sup = await VideoDecoder.isConfigSupported(config);
      if (!sup.supported) return null;
      return new SequentialDecoder(d.samples, config, rotationOf(d.track.matrix));
    } catch {
      return null;
    }
  }

  private createDecoder() {
    this.decoder = new VideoDecoder({
      output: (f) => {
        this.queue.push(f);
        this.wake?.();
      },
      error: (e) => {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.wake?.();
      },
    });
    this.decoder.configure(this.config);
  }

  /** Recomeça a decodificação a partir do quadro-chave anterior a `target`. */
  private restart(target: number) {
    if (this.decoder.state !== 'closed') this.decoder.close();
    for (const f of this.queue) f.close();
    this.queue = [];
    this.current?.close();
    this.current = null;
    this.flushed = false;
    this.flushing = false;
    let k = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i]!;
      if (s.key && s.ts <= target) k = i;
    }
    this.next = k;
    this.createDecoder();
  }

  /** Quadro que o <video> mostraria no instante `t` (segundos do arquivo). */
  async frameAt(t: number): Promise<CanvasImageSource | null> {
    const target = this.origin + t * 1e6 + 500; // meio milissegundo de tolerância
    if (target < this.lastTarget - 1000 || this.lastTarget === -Infinity) this.restart(target);
    this.lastTarget = target;
    for (;;) {
      if (this.error) throw this.error;
      // avança pelos quadros já decodificados que pertencem a este instante
      while (this.queue.length && this.queue[0]!.timestamp <= target) {
        this.current?.close();
        this.current = this.queue.shift()!;
      }
      if (this.queue.length) break; // o próximo quadro já é posterior a t
      if (this.flushed && this.decoder.decodeQueueSize === 0 && !this.queue.length) break; // fim do arquivo
      // alimenta o decodificador mantendo uma fila curta
      while (this.next < this.samples.length && this.decoder.decodeQueueSize < 12) {
        const s = this.samples[this.next++]!;
        this.decoder.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.ts, duration: s.dur, data: s.data }));
      }
      if (this.next >= this.samples.length && !this.flushed && !this.flushing) {
        // NÃO espera o flush aqui: o decodificador de hardware só tem alguns quadros
        // disponíveis; se ficarmos parados segurando quadros, ele nunca termina
        // (travava no fim da exportação). Os quadros seguem sendo entregues/liberados.
        const dec = this.decoder;
        this.flushing = true;
        dec
          .flush()
          .then(() => {
            if (dec === this.decoder) this.flushed = true;
          })
          .catch(() => {
            if (dec === this.decoder) this.flushed = true;
          })
          .finally(() => {
            if (dec === this.decoder) this.flushing = false;
            this.wake?.();
          });
      }
      await new Promise<void>((r) => {
        this.wake = r;
        setTimeout(r, 50);
      });
      this.wake = null;
    }
    const frame = this.current ?? this.queue[0] ?? null;
    if (!frame) return null;
    if (!this.rotation) return frame;
    return this.rotated(frame);
  }

  /** Aplica a rotação gravada pela câmera (o <video> faz isso automaticamente). */
  private rotated(frame: VideoFrame): HTMLCanvasElement {
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    const swap = this.rotation === 90 || this.rotation === 270;
    if (!this.canvas) this.canvas = document.createElement('canvas');
    const c = this.canvas;
    c.width = swap ? h : w;
    c.height = swap ? w : h;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.drawImage(frame, -w / 2, -h / 2, w, h);
    return c;
  }

  dispose() {
    if (this.decoder.state !== 'closed') this.decoder.close();
    for (const f of this.queue) f.close();
    this.queue = [];
    this.current?.close();
    this.current = null;
  }
}
