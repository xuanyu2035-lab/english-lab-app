/** Text-to-speech (Web Speech) and self-recording (MediaRecorder). Both are optional: buttons hide if unsupported. */
import { recGet, recPut } from './db';

let voices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;
const listeners = new Set<() => void>();

/** Where the speech options come from (set once by main.ts so this file does not depend on the store). */
export interface SpeechConfig { voiceURI: string | null; speechRate: number; repeatCount: number }
let getConfig: () => SpeechConfig = () => ({ voiceURI: null, speechRate: 0.9, repeatCount: 1 });
export function configureSpeech(fn: () => SpeechConfig) { getConfig = fn; }

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}
export function initTts(onChange?: () => void) {
  if (!ttsSupported()) return;
  if (onChange) listeners.add(onChange);
  const load = () => {
    voices = speechSynthesis.getVoices();
    if (voices.length) voicesLoaded = true;
    listeners.forEach((f) => f());
  };
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}
/** Be told when the voice list (re)loads. Returns an unsubscribe function. */
export function onVoicesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** True when we can probably speak this language (unknown until voices have loaded → optimistic). */
export function canSpeak(lang: 'en' | 'yue'): boolean {
  if (!ttsSupported()) return false;
  if (!voicesLoaded) return true;
  return lang === 'en' ? voices.some((v) => /^en/i.test(v.lang)) : voices.some((v) => /^zh[-_]HK|yue/i.test(v.lang));
}

// ---------- English voice choice (pure, tested) ----------
export interface VoiceLike { name: string; lang: string; voiceURI: string; localService?: boolean; default?: boolean }
const NICE = /natural|neural|enhanced|premium/i;
const isUS = (v: VoiceLike) => /^en[-_]US$/i.test(v.lang);
const isGB = (v: VoiceLike) => /^en[-_]GB$/i.test(v.lang);
const isEnglish = (v: VoiceLike) => /^en([-_]|$)/i.test(v.lang);

/** Lower is better: US + natural-sounding first, then US, then other non-British English, British last. */
export function voiceScore(v: VoiceLike): number {
  const nice = NICE.test(v.name) ? 0 : 1;
  if (isUS(v)) return nice;           // 0 US nice · 1 US plain
  if (isGB(v)) return 6 + nice;       // British only if nothing else
  return 2 + nice * 2;                // other English (en-AU, en-IN…) behind US
}
export function listEnglishVoices<T extends VoiceLike>(all: T[]): T[] {
  return all.filter(isEnglish).map((v, i) => ({ v, i })).sort((a, b) => voiceScore(a.v) - voiceScore(b.v) || a.i - b.i).map((x) => x.v);
}
/** The saved choice if it still exists on this device, otherwise the best automatic pick. */
export function chooseEnglishVoice<T extends VoiceLike>(all: T[], voiceURI: string | null): T | undefined {
  if (voiceURI) { const m = all.find((v) => v.voiceURI === voiceURI && isEnglish(v)); if (m) return m; }
  return listEnglishVoices(all)[0];
}
export const autoVoice = (): SpeechSynthesisVoice | undefined => chooseEnglishVoice(voices, null);
export const englishVoices = (): SpeechSynthesisVoice[] => listEnglishVoices(voices);
export const voiceLabel = (v: VoiceLike) => `${v.name}（${v.lang.replace('_', '-')}）`;

function pickVoice(lang: 'en' | 'yue'): SpeechSynthesisVoice | undefined {
  if (lang === 'yue') return voices.find((v) => /^zh[-_]HK|yue/i.test(v.lang));
  return chooseEnglishVoice(voices, getConfig().voiceURI);
}

export interface SpeakOpts { rate?: number; times?: number; voice?: SpeechSynthesisVoice }
export function speak(text: string, lang: 'en' | 'yue' = 'en', opts: SpeakOpts = {}) {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  const cfg = getConfig();
  const v = opts.voice ?? pickVoice(lang);
  const rate = Math.min(1.2, Math.max(0.6, opts.rate ?? (lang === 'en' ? cfg.speechRate : 0.9)));
  const times = Math.min(5, Math.max(1, Math.round(opts.times ?? 1)));
  for (let i = 0; i < times; i++) {
    const u = new SpeechSynthesisUtterance(text.replace(/_{3,}/g, ' ... '));
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'en' ? 'en-US' : 'zh-HK';
    u.rate = rate;
    speechSynthesis.speak(u);
  }
}
/** Read a whole sentence aloud using the "每句重复次数" setting. */
export const speakSentence = (text: string) => speak(text, 'en', { times: getConfig().repeatCount });
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
