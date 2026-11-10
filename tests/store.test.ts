import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kvGet, kvSet, recGet, recPut, resetDbHandle } from '../src/db';
import { loadState, saveContent, saveProgress, saveSettings, state } from '../src/store';
import { emptyProgress } from '../src/types';

const sample = JSON.parse(readFileSync('public/sample-content.json', 'utf8'));

describe('IndexedDB persistence', () => {
  beforeEach(() => { resetDbHandle(); (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory(); });
  it('kv round trip', async () => {
    await kvSet('a', { x: 1 });
    expect(await kvGet('a')).toEqual({ x: 1 });
  });
  it('recordings store blobs', async () => {
    await recPut('r1', new Blob(['hello']));
    expect(await recGet('r1')).toBeDefined();
  });
  it('content, settings and progress survive a reload; progress kept on re-import', async () => {
    await loadState();
    await saveContent(sample);
    await saveSettings({ minutes: 90, interviewDate: '2026-12-01', onboarded: true });
    await saveProgress({ ...emptyProgress(), sentences: { 'self_intro-1': { level: 3, passedL4: false, n: 2 } } });
    await saveContent(sample); // re-import
    state.pack = null; state.progress = emptyProgress();
    await loadState();
    expect(state.pack!.real_tasks.self_intro.sentences).toHaveLength(4);
    expect(state.settings.minutes).toBe(90);
    expect(state.progress.sentences['self_intro-1'].level).toBe(3);
  });
  it('rejects an invalid pack without touching the stored one', async () => {
    await loadState();
    await saveContent(sample);
    await expect(saveContent({ real_tasks: {} })).rejects.toThrow();
    expect(state.pack).not.toBeNull();
  });
});
