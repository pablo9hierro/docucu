/** Tipos mínimos do mp4box.js (0.5.x) usados pelo decodificador sequencial. */
declare module 'mp4box' {
  export interface MP4Sample {
    number: number;
    is_sync: boolean;
    cts: number;
    dts: number;
    duration: number;
    timescale: number;
    data: Uint8Array;
  }
  export interface MP4VideoTrack {
    id: number;
    codec: string;
    timescale: number;
    nb_samples: number;
    matrix: ArrayLike<number>;
    video: { width: number; height: number };
  }
  export interface MP4Info {
    videoTracks: MP4VideoTrack[];
  }
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }
  export interface MP4Box {
    write(stream: DataStream): void;
  }
  export interface MP4File {
    onReady: (info: MP4Info) => void;
    onError: (e: string) => void;
    onSamples: (id: number, user: unknown, samples: MP4Sample[]) => void;
    appendBuffer(data: MP4ArrayBuffer): number;
    start(): void;
    flush(): void;
    setExtractionOptions(id: number, user?: unknown, options?: { nbSamples?: number }): void;
    getTrackById(id: number): {
      mdia: { minf: { stbl: { stsd: { entries: Array<Record<string, MP4Box | undefined>> } } } };
    };
  }
  export class DataStream {
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
    static BIG_ENDIAN: boolean;
    buffer: ArrayBuffer;
  }
  export function createFile(): MP4File;
  const MP4Box: { createFile: typeof createFile; DataStream: typeof DataStream };
  export default MP4Box;
}
