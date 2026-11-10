/** Text-to-speech (Web Speech) and self-recording (MediaRecorder). Both are optional: buttons hide if unsupported. */
import { recGet, recPut } from './db';

let voices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}
export function initTts(onChange?: () => void) {
  if (!ttsSupported()) return;
  const load = () => {
    voices = speechSynthesis.getVoices();
    if (voices.length) voicesLoaded = true;
    onChange?.();
  };
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}
/** True when we can probably speak this language (unknown until voices have loaded → optimistic). */
export function canSpeak(lang: 'en' | 'yue'): boolean {
  if (!ttsSupported()) return false;
  if (!voicesLoaded) return true;
  return lang === 'en' ? voices.some((v) => /^en/i.test(v.lang)) : voices.some((v) => /^zh[-_]HK|yue/i.test(v.lang));
}
function pickVoice(lang: 'en' | 'yue'): SpeechSynthesisVoice | undefined {
  if (lang === 'yue') return voices.find((v) => /^zh[-_]HK|yue/i.test(v.lang));
  return voices.find((v) => /^en[-_]GB/i.test(v.lang)) ?? voices.find((v) => /^en[-_]US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
}
export function speak(text: string, lang: 'en' | 'yue' = 'en', rate = 0.9) {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/_{3,}/g, ' ... '));
  const v = pickVoice(lang);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'en' ? 'en-GB' : 'zh-HK';
  u.rate = rate;
  speechSynthesis.speak(u);
}
export function stopSpeaking() { if (ttsSupported()) speechSynthesis.cancel(); }

// ---------- recording ----------
export function recordSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}
export interface Recorder { stop(): Promise<Blob> }
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.start();
  return {
    stop: () => new Promise<Blob>((resolve) => {
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
      };
      mr.stop();
    }),
  };
}
export const saveRecording = (id: string, blob: Blob) => recPut(id, blob);
export const loadRecording = (id: string) => recGet(id);
