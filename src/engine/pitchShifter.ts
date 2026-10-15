/**
 * Troca de tom em tempo real (Web Audio), sem mudar a velocidade — usada no
 * disfarce de voz (aguda/grave). Técnica clássica de linhas de atraso moduladas
 * por rampas, com cruzamento suave entre duas vozes ("Jungle", Chris Wilson).
 * Funciona igual no AudioContext do preview e no OfflineAudioContext da exportação.
 */
const DELAY = 0.1;
const FADE = 0.05;
const BUFFER = 0.1;

function fadeBuffer(ctx: BaseAudioContext): AudioBuffer {
  const l1 = Math.round(BUFFER * ctx.sampleRate);
  const l2 = Math.round((BUFFER - 2 * FADE) * ctx.sampleRate);
  const buf = ctx.createBuffer(1, l1 + l2, ctx.sampleRate);
  const p = buf.getChannelData(0);
  const fl = FADE * ctx.sampleRate;
  const i2 = l1 - fl;
  for (let i = 0; i < l1; i++) p[i] = i < fl ? Math.sqrt(i / fl) : i >= i2 ? Math.sqrt(1 - (i - i2) / fl) : 1;
  return buf;
}

function rampBuffer(ctx: BaseAudioContext, up: boolean): AudioBuffer {
  const l1 = Math.round(BUFFER * ctx.sampleRate);
  const l2 = Math.round((BUFFER - 2 * FADE) * ctx.sampleRate);
  const len = l1 + l2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const p = buf.getChannelData(0);
  for (let i = 0; i < l1; i++) p[i] = up ? (l1 - i) / len : i / l1;
  return buf;
}

export interface PitchShifter {
  input: AudioNode;
  output: AudioNode;
  dispose(): void;
}

/**
 * Cria o trocador de tom. `ratio` > 1 deixa a voz aguda; < 1, grave.
 * `startAt` = instante (no relógio do contexto) em que as rampas começam.
 */
export function createPitchShifter(ctx: BaseAudioContext, ratio: number, startAt = ctx.currentTime): PitchShifter {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const up = ratio > 1;
  // a rampa varre 0,5·DELAY·depth de atraso a cada BUFFER (0,1 s):
  // tom = 1 ± 0,5·depth  →  depth = 2·|tom − 1|
  const depth = Math.min(1, Math.abs(ratio - 1) * 2);
  const ramp = rampBuffer(ctx, up);
  const fade = fadeBuffer(ctx);
  const srcs: AudioBufferSourceNode[] = [];
  const mk = (buffer: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    srcs.push(s);
    return s;
  };
  const mod1 = mk(ramp);
  const mod2 = mk(ramp);
  const modGain1 = ctx.createGain();
  const modGain2 = ctx.createGain();
  modGain1.gain.value = 0.5 * DELAY * depth;
  modGain2.gain.value = 0.5 * DELAY * depth;
  const delay1 = ctx.createDelay(1);
  const delay2 = ctx.createDelay(1);
  mod1.connect(modGain1).connect(delay1.delayTime);
  mod2.connect(modGain2).connect(delay2.delayTime);
  const fade1 = mk(fade);
  const fade2 = mk(fade);
  const mix1 = ctx.createGain();
  const mix2 = ctx.createGain();
  mix1.gain.value = 0;
  mix2.gain.value = 0;
  fade1.connect(mix1.gain);
  fade2.connect(mix2.gain);
  input.connect(delay1).connect(mix1).connect(output);
  input.connect(delay2).connect(mix2).connect(output);
  const t = Math.max(startAt, ctx.currentTime) + 0.01;
  const t2 = t + BUFFER - FADE;
  mod1.start(t);
  fade1.start(t);
  mod2.start(t2);
  fade2.start(t2);
  return {
    input,
    output,
    dispose() {
      for (const s of srcs) {
        try {
          s.stop();
        } catch {
          /* já parado */
        }
        s.disconnect();
      }
      input.disconnect();
      output.disconnect();
    },
  };
}
