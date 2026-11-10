import { blankify, firstLetters, sectionSentences, sentencesUpTo } from '../content';
import { todayStr } from '../dates';
import { canSpeak, loadRecording, recordSupported, saveRecording, speak, startRecording } from '../media';
import {
  applyRating, completeReview, getSectionProgress, getSentenceProgress, markLearnedIfDone,
} from '../schedule';
import { saveProgress, state, scripts } from '../store';
import { sectionKey, sentenceId } from '../types';
import type { Progress, Rating, Script, ScriptId, Sentence } from '../types';
import { hooks } from '../sessionHooks';
import { btn, h, mount, progressBar } from '../ui';

const root = () => document.getElementById('app')!;
export const go = (hash: string) => {
  if (location.hash === `#${hash}` || (hash === '/' && location.hash === '')) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};

export function topbar(title: string, backHash: string | null, right?: Node): HTMLElement {
  if (hooks.active) {
    const timer = h('span', { class: 'session-timer', 'aria-label': '本段剩余时间' }, hooks.remaining());
    const quit = h('button', { class: 'back quit', type: 'button', 'aria-label': '结束这节课', onclick: () => hooks.quit() }, '✕ 结束');
    return h('header', { class: 'topbar' },
      hooks.immersive ? h('span') : (backHash ? h('a', { class: 'back', href: `#${backHash}` }, '← 返回') : h('span')),
      h('div', { class: 'topbar-title' }, title),
      h('div', { class: 'topbar-right' }, timer, quit));
  }
  return h('header', { class: 'topbar' },
    backHash ? h('a', { class: 'back', href: `#${backHash}`, 'aria-label': '返回' }, '← 返回') : h('span'),
    h('div', { class: 'topbar-title' }, title),
    right ?? h('span'));
}
/** Leave an activity: continue the lesson if one is running, otherwise go to the given page. */
export const exitTo = (hash: string) => { if (hooks.active) hooks.advance(); else go(hash); };

// ---------- 出声练工具：听 / 录音 / 回放 ----------
export function audioTools(id: string, text: string): HTMLElement {
  const wrap = h('div', { class: 'audio-tools' });
  if (canSpeak('en')) wrap.append(btn('🔊 听', () => speak(text, 'en'), 'ghost'));
  if (recordSupported()) {
    let rec: Awaited<ReturnType<typeof startRecording>> | null = null;
    const recBtn = h('button', { class: 'btn ghost', type: 'button' }, '🎙 录音');
    const playBtn = h('button', { class: 'btn ghost', type: 'button', disabled: true }, '▶ 回放');
    const msg = h('span', { class: 'muted small' });
    let url: string | null = null;
    const setBlob = (b: Blob) => { if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); playBtn.disabled = false; };
    loadRecording(id).then((b) => { if (b) setBlob(b); }).catch(() => undefined);
    recBtn.addEventListener('click', async () => {
      if (!rec) {
        try {
          rec = await startRecording();
          recBtn.textContent = '⏹ 停止';
          recBtn.classList.add('recording');
          msg.textContent = '正在录音，大声读出来…';
        } catch {
          msg.textContent = '无法使用麦克风（可能没有允许权限）';
        }
      } else {
        const blob = await rec.stop();
        rec = null;
        recBtn.textContent = '🎙 重录';
        recBtn.classList.remove('recording');
        msg.textContent = '录好了，点“回放”听听自己';
        setBlob(blob);
        saveRecording(id, blob).catch(() => undefined);
      }
    });
    playBtn.addEventListener('click', () => { if (url) void new Audio(url).play(); });
    wrap.append(recBtn, playBtn, msg);
  }
  return wrap;
}

const RATING_LABELS: [Rating, string, string][] = [
  ['smooth', '顺', 'good'],
  ['stuck', '卡了一下', 'mid'],
  ['blank', '说不出来', 'bad'],
];
function ratingRow(onRate: (r: Rating) => void, disabled = false): HTMLElement {
  const row = h('div', { class: 'rating-row' });
  for (const [r, label, cls] of RATING_LABELS) {
    const b = btn(label, () => onRate(r), `rate ${cls}`);
    if (disabled) b.setAttribute('disabled', '');
    row.append(b);
  }
  return row;
}

// ---------- 学习阶段 ----------
export type Phase = 'understand' | 'chunks' | 'cue' | 'L1' | 'L2' | 'L25' | 'L3' | 'L4';
const LEVEL_OF: Partial<Record<Phase, number>> = { L1: 1, L2: 2, L25: 2, L3: 3, L4: 4 };
const PHASE_LABEL: Record<Phase, string> = {
  understand: '① 先看懂', chunks: '② 分块读', cue: '③ 抓线索',
  L1: 'L1 看全文，读出声', L2: 'L2 关键词挖空', L25: 'L2.5 首字母提示', L3: 'L3 只看线索', L4: 'L4 什么都不看',
};
/** Ordered phases that exist for this sentence. */
export function phasesFor(s: Sentence, firstLetterHint: boolean): Phase[] {
  const p: Phase[] = ['understand', 'chunks', 'cue', 'L1'];
  if (s.blank_keys.length > 0) p.push('L2');
  if (firstLetterHint) p.push('L25');
  p.push('L3', 'L4');
  return p;
}
/** Phase to start with, from the sentence's saved level. */
export function startPhase(s: Sentence, level: number, n: number, firstLetterHint: boolean): Phase {
  const phases = phasesFor(s, firstLetterHint);
  if (level <= 1 && n === 0) return 'understand';
  const want: Phase = level >= 4 ? 'L4' : level === 3 ? 'L3' : level === 2 ? 'L2' : 'L1';
  if (phases.includes(want)) return want;
  // level 2 but no blanks → first available phase after L1
  return phases.find((ph) => (LEVEL_OF[ph] ?? 0) >= level) ?? 'L3';
}

function sentenceHeader(s: Sentence, label: string, idx: number, total: number, showSection = true): HTMLElement {
  return h('div', { class: 'sent-head' },
    h('div', { class: 'chip-row' },
      showSection ? h('span', { class: 'chip' }, `小节 ${s.section_no} · ${s.section}`) : null,
      h('span', { class: 'chip amber' }, label)),
    h('div', { class: 'muted small' }, `第 ${s.no} 句（本轮 ${idx + 1} / ${total}）`),
    progressBar(idx, total));
}

function understandCard(s: Sentence, script: Script, onNext: () => void): HTMLElement {
  const sec = script.sections.find((x) => x.no === s.section_no);
  return h('div', { class: 'card focus' },
    h('div', { class: 'en-big' }, s.en),
    h('div', { class: 'zh' }, s.zh),
    sec ? h('div', { class: 'muted small' }, `这一节：${sec.meaning}`) : null,
    s.note ? h('div', { class: 'note' }, `💡 ${s.note}`) : null,
    audioTools(sentenceId(scriptOf(script), s.no), s.en),
    btn('我看懂了 →', onNext, 'primary big'));
}
function scriptOf(script: Script): ScriptId {
  const sc = scripts();
  return sc && sc.speech_4104 === script ? 'speech_4104' : 'self_intro';
}
function chunksCard(s: Sentence, onNext: () => void): HTMLElement {
  let lit = 0;
  const row = h('div', { class: 'chunks' });
  const zhLine = h('div', { class: 'zh' }, '点下面的块，一块一块读');
  const nextBtn = h('button', { class: 'btn primary big', type: 'button', disabled: true }, '全部读完了 →');
  nextBtn.addEventListener('click', onNext);
  const render = () => {
    row.replaceChildren(...s.chunks.map((c, i) => {
      const b = h('button', { class: `chunk ${i < lit ? 'lit' : ''}`, type: 'button', 'aria-pressed': String(i < lit) }, c.en);
      b.addEventListener('click', () => {
        if (i >= lit) lit = i + 1;
        zhLine.textContent = c.zh;
        if (canSpeak('en')) speak(c.en, 'en');
        if (lit >= s.chunks.length) nextBtn.removeAttribute('disabled');
        render();
      });
      return b;
    }));
  };
  render();
  return h('div', { class: 'card focus' }, row, zhLine,
    h('div', { class: 'muted small' }, '每点一块会朗读那一块；也可以自己先读再点。'),
    btn('整句再听一遍', () => speak(s.en, 'en'), 'ghost'), nextBtn);
}
function cueCard(s: Sentence, onNext: () => void): HTMLElement {
  return h('div', { class: 'card focus' },
    h('div', { class: 'muted' }, '记住这个“线索”，它会带你想起整句：'),
    h('div', { class: 'cue-big' }, s.cue),
    h('div', { class: 'en-dim' }, s.en),
    h('div', { class: 'zh' }, s.zh),
    canSpeak('en') ? h('div', { class: 'audio-tools' }, btn('🔊 听', () => speak(s.en, 'en'), 'ghost')) : null,
    btn('记住了 →', onNext, 'primary big'));
}

function blanksNode(s: Sentence): HTMLElement {
  const box = h('div', { class: 'en-big' });
  for (const seg of blankify(s.en, s.blank_keys)) {
    if (seg.blank) {
      const t = seg.text.replace(/[^A-Za-z0-9']/g, '');
      const b = h('span', { class: 'blank', 'aria-label': '挖空的词' }, ' '.repeat(Math.max(3, Math.min(t.length, 12))));
      box.append(b, seg.text.replace(/[A-Za-z0-9']/g, ''));
    } else box.append(seg.text);
  }
  return box;
}

/** A retrieval card for one level (L1..L4). */
export function recallCard(opts: {
  sentence: Sentence; phase: 'L1' | 'L2' | 'L25' | 'L3' | 'L4'; scriptId: ScriptId; onRate: (r: Rating) => void;
}): HTMLElement {
  const { sentence: s, phase } = opts;
  let revealed = phase === 'L1';
  let rated = false;
  const rateOnce = (r: Rating) => { if (rated) return; rated = true; opts.onRate(r); };
  const body = h('div', { class: 'recall-body' });
  const answer = h('div', { class: 'answer' },
    h('div', { class: 'en-big' }, s.en), h('div', { class: 'zh' }, s.zh),
    s.note ? h('div', { class: 'note' }, `💡 ${s.note}`) : null);
  let hint: HTMLElement | null = null;
  const ratings = h('div', { class: 'rating-wrap' });
  const draw = () => {
    body.replaceChildren();
    if (phase === 'L1') body.append(h('div', { class: 'en-big' }, s.en), h('div', { class: 'zh' }, s.zh), ...(s.note ? [h('div', { class: 'note' }, `💡 ${s.note}`)] : []));
    else if (revealed) body.append(answer);
    else if (phase === 'L2') body.append(blanksNode(s), h('div', { class: 'zh' }, s.zh));
    else if (phase === 'L25') body.append(h('div', { class: 'en-big mono' }, firstLetters(s.en)), h('div', { class: 'zh' }, s.zh));
    else if (phase === 'L3') body.append(h('div', { class: 'cue-big' }, s.cue), h('div', { class: 'muted small' }, '只看线索，把整句说出来'));
    else {
      body.append(h('div', { class: 'blank-note' }, `第 ${s.no} 句`), h('div', { class: 'muted' }, '什么都不看，把这一句说出来'));
      if (hint) body.append(hint);
    }
    ratings.replaceChildren(revealed
      ? h('div', {}, h('div', { class: 'muted small center' }, '刚才你说得怎么样？'), ratingRow(rateOnce))
      : h('div', { class: 'row-center' },
        btn('看答案', () => { revealed = true; draw(); }, 'primary big'),
        phase === 'L4' && !hint ? btn('给我线索', () => { hint = h('div', { class: 'cue-big small' }, s.cue); draw(); }, 'ghost') : null));
  };
  draw();
  return h('div', { class: 'card focus' }, body, audioTools(sentenceId(opts.scriptId, s.no), s.en), ratings);
}

// ---------- 学一节 ----------
export function learnSection(scriptId: ScriptId, secNo: number) {
  const scr = scripts()![scriptId];
  const sents = sectionSentences(scr, secNo);
  const sec = scr.sections.find((x) => x.no === secNo);
  if (!sec || !sents.length) { go('/'); return; }
  const back = `/script/${scriptId}`;
  let idx = 0;
  let phase: Phase;
  const fl = () => state.settings.firstLetterHint;
  const init = (i: number) => {
    const sp = getSentenceProgress(state.progress, scriptId, sents[i].no);
    phase = startPhase(sents[i], sp.level, sp.n, fl());
  };
  // start at the first sentence that has not passed L4
  idx = Math.max(0, sents.findIndex((s) => !getSentenceProgress(state.progress, scriptId, s.no).passedL4));
  init(idx);
  const finishedSentenceAt = () => sents.every((s) => getSentenceProgress(state.progress, scriptId, s.no).passedL4);

  const save = async (p: Progress) => { await saveProgress(p); };
  const rate = async (r: Rating) => {
    const s = sents[idx];
    const level = LEVEL_OF[phase] ?? 1;
    const before = getSentenceProgress(state.progress, scriptId, s.no);
    let p: Progress = { ...state.progress, sentences: { ...state.progress.sentences, [sentenceId(scriptId, s.no)]: applyRating(before, level, r) } };
    const phases = phasesFor(s, fl());
    const at = phases.indexOf(phase);
    if (r === 'smooth') {
      if (phase === 'L4') {
        p = markLearnedIfDone(p, scriptId, scr, secNo, todayStr());
        await save(p);
        if (finishedSentenceAt()) return sectionDone();
        if (hooks.active && hooks.timeUp()) return hooks.advance();
        const after = sents.findIndex((x, i) => i > idx && !getSentenceProgress(state.progress, scriptId, x.no).passedL4);
        idx = after !== -1 ? after : sents.findIndex((x) => !getSentenceProgress(state.progress, scriptId, x.no).passedL4);
        init(idx);
        return render();
      }
      phase = phases[at + 1];
    } else if (r === 'blank') {
      phase = phase === 'L1' ? 'chunks' : phases[Math.max(0, at - 1)];
    }
    await save(p);
    if (hooks.active && hooks.timeUp()) return hooks.advance();
    render();
  };
  const sectionDone = () => {
    const sp = getSectionProgress(state.progress, scriptId, secNo);
    mount(root(), topbar(`小节 ${secNo} · ${sec.name}`, back),
      h('div', { class: 'screen' },
        h('div', { class: 'card focus center' },
          h('div', { class: 'big-emoji' }, '✅'),
          h('h2', {}, '这一节练完了！'),
          h('p', { class: 'muted' }, `“${sec.name}”里的 ${sents.length} 句都做到了“什么都不看也说得出来”。`),
          h('p', {}, sp.learnedDay ? `复习安排：${reviewText(sp.learnedDay)}` : ''),
          hooks.active ? btn('继续 →', () => hooks.advance(), 'primary big') : null,
          btn('接着连说（从第 1 句连到这里）', () => go(`/script/${scriptId}/chain/${secNo}`), hooks.active ? 'ghost' : 'primary big'),
          hooks.active ? null : btn('回到小节列表', () => go(back), 'ghost'))));
  };
  const render = () => {
    const s = sents[idx];
    const label = PHASE_LABEL[phase];
    let card: HTMLElement;
    const advance = () => { const ph = phasesFor(s, fl()); phase = ph[ph.indexOf(phase) + 1]; render(); };
    if (phase === 'understand') card = understandCard(s, scr, advance);
    else if (phase === 'chunks') card = chunksCard(s, advance);
    else if (phase === 'cue') card = cueCard(s, advance);
    else card = recallCard({ sentence: s, phase: phase as 'L1', scriptId, onRate: rate });
    mount(root(), topbar(`小节 ${secNo} · ${sec.name}`, back),
      h('div', { class: 'screen narrow' }, sentenceHeader(s, label, idx, sents.length), card));
  };
  render();
}

function reviewText(learnedDay: string): string {
  return `学会日 ${learnedDay}，之后第 1、2、4、7 天各复习一次（App 会提醒）`;
}

// ---------- 连说 / 复习 / 全文连说 ----------
export interface ChainOpts {
  scriptId: ScriptId;
  title: string;
  sentences: Sentence[];
  passes: ('cue' | 'none')[];
  backHash: string;
  onDone?: (p: Progress) => Progress;
  doneText?: string;
}
export function applyChainRating(progress: Progress, scriptId: ScriptId, s: Sentence, mode: 'cue' | 'none', r: Rating): Progress {
  const id = sentenceId(scriptId, s.no);
  const sp = getSentenceProgress(progress, scriptId, s.no);
  let next = { ...sp, last: r, n: sp.n + 1 };
  if (r === 'blank') next = { ...next, level: 3, passedL4: false };
  else if (r === 'smooth' && mode === 'none') next = { ...next, level: 4, passedL4: true };
  return { ...progress, sentences: { ...progress.sentences, [id]: next } };
}
export function chainRun(o: ChainOpts) {
  const tasks = o.passes.flatMap((mode) => o.sentences.map((s) => ({ s, mode })));
  const tally = { smooth: 0, stuck: 0, blank: 0 };
  const trouble = new Map<number, Sentence>();
  let i = 0;
  const finish = async () => {
    let p = state.progress;
    if (o.onDone) p = o.onDone(p);
    await saveProgress(p);
    mount(root(), topbar(o.title, o.backHash),
      h('div', { class: 'screen narrow' },
        h('div', { class: 'card focus center' },
          h('div', { class: 'big-emoji' }, trouble.size ? '💪' : '🎉'),
          h('h2', {}, o.doneText ?? '这一轮完成了'),
          h('p', {}, `顺 ${tally.smooth} · 卡了一下 ${tally.stuck} · 说不出来 ${tally.blank}`),
          trouble.size ? h('div', { class: 'trouble' }, h('div', { class: 'muted small' }, '这些句子还不稳，下次多练：'),
            ...[...trouble.values()].map((s) => h('div', { class: 'trouble-row' }, `第 ${s.no} 句  ${s.cue}`))) : h('p', { class: 'good-text' }, '全部都很顺！'),
          btn(hooks.active ? '继续 →' : '回去', () => exitTo(o.backHash), 'primary big'))));
  };
  const render = () => {
    if (i >= tasks.length) { void finish(); return; }
    const { s, mode } = tasks[i];
    const label = mode === 'cue' ? '连说 · 只看线索' : '连说 · 什么都不看';
    const card = recallCard({
      sentence: s, phase: mode === 'cue' ? 'L3' : 'L4', scriptId: o.scriptId,
      onRate: async (r) => {
        tally[r]++;
        if (r !== 'smooth') trouble.set(s.no, s);
        await saveProgress(applyChainRating(state.progress, o.scriptId, s, mode, r));
        i++;
        if (hooks.active && hooks.timeUp()) { await finish(); return; }
        render();
      },
    });
    mount(root(), topbar(o.title, o.backHash),
      h('div', { class: 'screen narrow' },
        h('div', { class: 'sent-head' },
          h('div', { class: 'chip-row' }, h('span', { class: 'chip' }, `小节 ${s.section_no} · ${s.section}`), h('span', { class: 'chip amber' }, label)),
          h('div', { class: 'muted small' }, `第 ${i + 1} / ${tasks.length} 步`), progressBar(i, tasks.length)),
        card));
  };
  render();
}

export function chainSection(scriptId: ScriptId, upTo: number) {
  const scr = scripts()![scriptId];
  const today = todayStr();
  chainRun({
    scriptId, title: `连说：第 1 节到第 ${upTo} 节`, sentences: sentencesUpTo(scr, upTo), passes: ['cue', 'none'],
    backHash: `/script/${scriptId}`,
    onDone: (p) => {
      const key = sectionKey(scriptId, upTo);
      const sec = getSectionProgress(p, scriptId, upTo);
      return { ...p, sections: { ...p.sections, [key]: { ...sec, chainDay: today } } };
    },
  });
}
export function fullRun(scriptId: ScriptId) {
  const scr = scripts()![scriptId];
  const today = todayStr();
  chainRun({
    scriptId, title: `全文连说：${scr.title}`, sentences: scr.sentences, passes: ['cue', 'none'],
    backHash: `/script/${scriptId}`, doneText: '全文连说完成',
    onDone: (p) => ({ ...p, fullRuns: { ...p.fullRuns, [scriptId]: [...new Set([...(p.fullRuns[scriptId] ?? []), today])] } }),
  });
}
export function reviewSection(scriptId: ScriptId, secNo: number, offset: number) {
  const scr = scripts()![scriptId];
  const today = todayStr();
  chainRun({
    scriptId, title: `复习：小节 ${secNo}`, sentences: sectionSentences(scr, secNo), passes: ['none'],
    backHash: `/script/${scriptId}`, doneText: '这一节的复习完成',
    onDone: (p) => completeReview(p, scriptId, secNo, offset, today),
  });
}
