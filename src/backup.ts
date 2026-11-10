/** Export / import of progress (everything in the kv store except the content pack and recordings). */
import { kvAll, kvDel, kvSet } from './db';

export const BACKUP_APP = 'english-lab';
export const BACKUP_VERSION = 1;
const EXCLUDE = new Set(['content']);

export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function buildBackup(kv: Record<string, unknown>, now: Date = new Date()): Backup {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(kv)) if (!EXCLUDE.has(k)) data[k] = v;
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}
export async function exportBackup(): Promise<Backup> {
  return buildBackup(await kvAll());
}
export function parseBackup(raw: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: '这不是进度文件' };
  const b = raw as Partial<Backup>;
  if (b.app !== BACKUP_APP) return { ok: false, error: '这不是 EnglishLab 的进度文件' };
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return { ok: false, error: '进度文件版本太新，请先更新应用' };
  if (typeof b.data !== 'object' || b.data === null) return { ok: false, error: '进度文件里没有数据' };
  return { ok: true, backup: b as Backup };
}
/** Replace all progress with the backup's data (content pack is left alone). */
export async function importBackup(raw: unknown): Promise<void> {
  const p = parseBackup(raw);
  if (!p.ok) throw new Error(p.error);
  const current = await kvAll();
  for (const k of Object.keys(current)) if (!EXCLUDE.has(k)) await kvDel(k);
  for (const [k, v] of Object.entries(p.backup.data)) if (!EXCLUDE.has(k)) await kvSet(k, v);
}
