import type { ContentPack, Script, ScriptId, Sentence, Section } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  pack?: ContentPack;
  summary?: string;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const itemId = (part: string, no: number) => `${part}-${no}`;

function checkScript(name: string, s: unknown, errors: string[], warnings: string[]) {
  if (!isObj(s)) { errors.push(`${name}：缺少这份稿子`); return; }
  const sents = s.sentences, secs = s.sections;
  if (!Array.isArray(sents) || sents.length === 0) { errors.push(`${name}：没有句子`); return; }
  if (!Array.isArray(secs) || secs.length === 0) { errors.push(`${name}：没有小节`); return; }
  const nos = new Set<number>();
  for (const x of sents as Record<string, unknown>[]) {
    const tag = `${name} 第 ${x?.no} 句`;
    if (typeof x?.no !== 'number') { errors.push(`${name}：有句子没有编号`); continue; }
    if (nos.has(x.no)) errors.push(`${tag}：编号重复`);
    nos.add(x.no);
    if (!isStr(x.en) || !isStr(x.zh)) errors.push(`${tag}：缺少英文或中文`);
    if (!Array.isArray(x.chunks)) errors.push(`${tag}：缺少 chunks`);
    if (!isStr(x.cue)) errors.push(`${tag}：缺少 cue`);
    if (!Array.isArray(x.blank_keys)) errors.push(`${tag}：缺少 blank_keys`);
    if (typeof x.section_no !== 'number') errors.push(`${tag}：缺少 section_no`);
    if (Array.isArray(x.chunks) && isStr(x.en)) {
      const joined = (x.chunks as { en: string }[]).map((c) => c.en).join(' ');
      if (joined !== x.en) warnings.push(`${tag}：chunks 拼起来和原句不完全一致（不修改，仅提醒）`);
    }
    if (Array.isArray(x.blank_keys) && isStr(x.en)) {
      for (const k of x.blank_keys as string[]) {
        if (!x.en.toLowerCase().includes(String(k).toLowerCase())) warnings.push(`${tag}：挖空词 "${k}" 在句子里找不到`);
      }
    }
  }
  const secNos = new Set<number>();
  for (const sec of secs as Record<string, unknown>[]) {
    if (typeof sec.no !== 'number' || !isStr(sec.name) || !Array.isArray(sec.sentence_nos)) {
      errors.push(`${name}：小节格式不对`); continue;
    }
    secNos.add(sec.no);
    for (const n of sec.sentence_nos as number[]) if (!nos.has(n)) errors.push(`${name} 小节 ${sec.no}：引用了不存在的第 ${n} 句`);
  }
  for (const x of sents as Record<string, unknown>[]) {
    if (typeof x.section_no === 'number' && !secNos.has(x.section_no)) errors.push(`${name} 第 ${x.no} 句：小节 ${x.section_no} 不存在`);
  }
}

/** Validate and normalise an imported content pack. Never changes any text. */
export function validateContentPack(raw: unknown): ValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['这不是一个有效的内容包文件（不是 JSON 对象）'], warnings };
  const rt = raw.real_tasks;
  if (!isObj(rt)) return { ok: false, errors: ['内容包里没有 real_tasks（背稿内容）'], warnings };
  checkScript('自我介绍', rt.self_intro, errors, warnings);
  checkScript('4104 演讲', rt.speech_4104, errors, warnings);
  if (!isObj(rt.method) || !Array.isArray((rt.method as Record<string, unknown>).spaced_review_days)) {
    warnings.push('缺少 method.spaced_review_days，使用默认 0/1/3/6 天');
  }
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  if (!Array.isArray(raw.items)) warnings.push('内容包没有 items（词库为空）');
  const ids = new Set<string>();
  for (const it of items) {
    if (!isStr(it.part) || typeof it.no !== 'number' || !isStr(it.en) || !isStr(it.zh)) { errors.push(`词条格式不对：${JSON.stringify(it).slice(0, 60)}`); continue; }
    const id = itemId(it.part, it.no);
    if (ids.has(id)) errors.push(`词条 ID 重复：${id}`);
    ids.add(id);
  }
  if (errors.length) return { ok: false, errors, warnings };
  const method = isObj(rt.method) ? (rt.method as Record<string, unknown>) : {};
  const pack: ContentPack = {
    ...(raw as unknown as ContentPack),
    items: items as unknown as ContentPack['items'],
    groups: Array.isArray(raw.groups) ? (raw.groups as ContentPack['groups']) : [],
    cantonese_glossary: Array.isArray(raw.cantonese_glossary) ? (raw.cantonese_glossary as ContentPack['cantonese_glossary']) : [],
    cantonese_classifiers: Array.isArray(raw.cantonese_classifiers) ? (raw.cantonese_classifiers as ContentPack['cantonese_classifiers']) : [],
    bim_flow: Array.isArray(raw.bim_flow) ? (raw.bim_flow as ContentPack['bim_flow']) : [],
    grammar_fixes: Array.isArray(raw.grammar_fixes) ? (raw.grammar_fixes as ContentPack['grammar_fixes']) : [],
    real_tasks: {
      ...(rt as unknown as ContentPack['real_tasks']),
      method: {
        steps: [], levels_self_intro: [], ...(method as object),
        spaced_review_days: Array.isArray(method.spaced_review_days) ? (method.spaced_review_days as number[]) : [0, 1, 3, 6],
      } as ContentPack['real_tasks']['method'],
      hard_words_for_read_aloud: Array.isArray(rt.hard_words_for_read_aloud) ? (rt.hard_words_for_read_aloud as string[]) : [],
    },
  };
  const si = pack.real_tasks.self_intro.sentences.length, sp = pack.real_tasks.speech_4104.sentences.length;
  const summary = `自我介绍 ${si} 句、4104 演讲 ${sp} 句、词库 ${items.length} 条`;
  return { ok: true, errors, warnings, pack, summary };
}

export const getScript = (pack: ContentPack, id: ScriptId): Script => pack.real_tasks[id];
export function sectionSentences(script: Script, sec: Section | number): Sentence[] {
  const no = typeof sec === 'number' ? sec : sec.no;
  const s = script.sections.find((x) => x.no === no);
  if (!s) return [];
  return s.sentence_nos.map((n) => script.sentences.find((x) => x.no === n)).filter((x): x is Sentence => !!x);
}
/** Sentences from the very first one up to and including section `upTo`. */
export function sentencesUpTo(script: Script, upTo: number): Sentence[] {
  return script.sections.filter((s) => s.no <= upTo).flatMap((s) => sectionSentences(script, s));
}

// ---------- blanking helpers ----------
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
export interface Seg { text: string; blank: boolean }
/** Split a sentence into word segments; words (or phrases) listed in `keys` are marked blank. */
export function blankify(en: string, keys: string[]): Seg[] {
  const words = en.split(/(\s+)/); // keep whitespace tokens
  const idx: number[] = [];
  words.forEach((w, i) => { if (!/^\s+$/.test(w) && w !== '') idx.push(i); });
  const blank = new Set<number>();
  for (const key of keys) {
    const kw = key.split(/\s+/).map(norm).filter(Boolean);
    if (!kw.length) continue;
    for (let a = 0; a + kw.length <= idx.length; a++) {
      if (kw.every((k, j) => norm(words[idx[a + j]]) === k)) kw.forEach((_, j) => blank.add(idx[a + j]));
    }
  }
  return words.map((t, i) => ({ text: t, blank: blank.has(i) }));
}
/** First-letter hint (optional L2.5, off by default). */
export function firstLetters(en: string): string {
  return en.split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w) || !w) return w;
    const m = w.match(/^([^A-Za-z0-9]*)([A-Za-z0-9])([A-Za-z0-9']*)(.*)$/);
    if (!m) return w;
    return m[1] + m[2] + '_'.repeat(Math.max(0, m[3].length)) + m[4];
  }).join('');
}
