import { kvGet, kvSet } from './db';
import { todayStr } from './dates';
import { validateContentPack } from './content';
import { DEFAULT_REVIEW_OFFSETS } from './schedule';
import { DEFAULT_SETTINGS, emptyProgress } from './types';
import { emptyVocab } from './vocab';
import type { VocabState } from './vocab';
import type { ContentPack, Progress, Settings, Script, ScriptId } from './types';

/** In-memory app state, persisted to IndexedDB after each change. */
export const state = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  progress: emptyProgress() as Progress,
  pack: null as ContentPack | null,
  vocab: emptyVocab() as VocabState,
  loaded: false,
};

export async function loadState(): Promise<void> {
  const [s, p, c, v] = await Promise.all([
    kvGet<Settings>('settings'),
    kvGet<Progress>('progress'),
    kvGet<unknown>('content'),
    kvGet<VocabState>('vocab'),
  ]);
  state.vocab = { ...emptyVocab(), ...(v ?? {}) };
  state.settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!state.settings.setupDate) state.settings.setupDate = todayStr();
  state.progress = { ...emptyProgress(), ...(p ?? {}) };
  if (c) {
    const v = validateContentPack(c);
    if (v.ok) state.pack = v.pack!;
  }
  state.loaded = true;
}
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  state.settings = { ...state.settings, ...patch };
  await kvSet('settings', state.settings);
}
export async function saveProgress(p: Progress): Promise<void> {
  state.progress = p;
  await kvSet('progress', p);
}
export async function saveVocab(v: VocabState): Promise<void> {
  state.vocab = v;
  await kvSet('vocab', v);
}
export async function saveContent(raw: unknown): Promise<void> {
  const v = validateContentPack(raw);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  state.pack = v.pack!;
  await kvSet('content', raw);
}
export const scripts = (): Record<ScriptId, Script> | null =>
  state.pack ? { self_intro: state.pack.real_tasks.self_intro, speech_4104: state.pack.real_tasks.speech_4104 } : null;
export const reviewOffsets = (): number[] => state.pack?.real_tasks.method.spaced_review_days ?? DEFAULT_REVIEW_OFFSETS;
