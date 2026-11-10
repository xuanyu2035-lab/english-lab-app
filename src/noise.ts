/** Background sound generated live with Web Audio (no audio files). */
let ctx: AudioContext | null = null;
let src: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

export function noiseSupported(): boolean {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}
function makeBuffer(c: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return buf;
}
export function stopNoise() {
  try { src?.stop(); } catch { /* already stopped */ }
  src?.disconnect(); gain?.disconnect();
  src = null; gain = null;
}
export function startNoise(kind: 'off' | 'white' | 'brown', volume = 0.12) {
  stopNoise();
  if (kind === 'off' || !noiseSupported()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    src = ctx.createBufferSource();
    src.buffer = makeBuffer(ctx, kind);
    src.loop = true;
    gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch { /* sound is optional */ }
}
export const noiseRunning = () => src !== null;
