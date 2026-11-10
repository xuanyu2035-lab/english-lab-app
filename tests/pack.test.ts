import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateContentPack } from '../src/content';

const hasFull = existsSync('private/content-full.json') && existsSync('private/content.json');

describe.skipIf(!hasFull)('private pack with photos and scenes (private/content-full.json)', () => {
  const full = hasFull ? JSON.parse(readFileSync('private/content-full.json', 'utf8')) : null;
  const base = hasFull ? JSON.parse(readFileSync('private/content.json', 'utf8')) : null;
  const ids = new Set<string>(hasFull ? base.items.map((i: { part: string; no: number }) => `${i.part}-${i.no}`) : []);
  it('is a valid pack and leaves the original items and scripts untouched', () => {
    const v = validateContentPack(full);
    expect(v.errors).toEqual([]);
    expect(full.items).toEqual(base.items);
    expect(full.real_tasks).toEqual(base.real_tasks);
  });
  it('every photo belongs to a real item and shows its source, author and licence', () => {
    const entries = Object.entries(full.images) as [string, { src: string; credit: string }][];
    expect(entries.length).toBeGreaterThanOrEqual(15);
    for (const [id, img] of entries) {
      expect(ids.has(id)).toBe(true);
      expect(img.src.startsWith('data:image/')).toBe(true);
      expect(img.credit).toMatch(/CC0|CC BY|Public domain/i);
      expect(img.credit).toContain('Wikimedia Commons');
    }
  });
  it('every credits.json record has a source link and an allowed licence', () => {
    const credits = JSON.parse(readFileSync('private/images/credits.json', 'utf8')) as Record<string, { source: string; license: string; author: string }>;
    for (const c of Object.values(credits)) {
      expect(c.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(c.license).toMatch(/^(CC0|Public domain|CC BY)/i);
      expect(c.author.length).toBeGreaterThan(0);
    }
  });
  it('scene lines only point at real items', () => {
    for (const id of Object.keys(full.scenes)) expect(ids.has(id)).toBe(true);
  });
  it('the private folder is git-ignored', () => {
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^private\/$/m);
  });
});
