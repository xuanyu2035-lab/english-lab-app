import { todayStr } from '../dates';
import { canSpeak, speak } from '../media';
import { hooks } from '../sessionHooks';
import { saveSettings, saveVocab, state } from '../store';
import type { Item } from '../types';
import { btn, h, mount, progressBar } from '../ui';
import {
  choiceOptions, clozeSentence, glossarySegments, groupProgress, idOf, introducedCount, itemById, newLeft, nextNewItems, rateWord, reviewLeft,
  reviewMode, reviewQueue, dueEntries, VERDICT_LABEL,
} from '../vocab';
import type { Grade, Verdict } from '../vocab';
import { exitTo, go, topbar } from './practice';

const root = () => document.getElementById('app')!;
const pack = () => state.pack!;
const PART_NAME: Record<string, string> = { school: '学校', workplace: '职场', bim: 'BIM' };

// ---------- card pieces ----------
function trustBadges(it: Item): HTMLElement {
  return h('div', { class: 'chip-row' },
    it.verified ? h('span', { class: 'chip good' }, '✔ 已核对') : h('span', { class: 'chip warn' }, '示范句，未逐条核对'),
    it.example_from_dictionary ? h('span', { class: 'chip warn' }, '例句来自粵典，仅个人使用') : null);
}
function picture(it: Item): HTMLElement | null {
  const id = idOf(it);
  const img = pack().images?.[id];
  if (img) {
    return h('figure', { class: 'pic' }, h('img', { src: img.src, alt: it.en, loading: 'lazy' }), h('figcaption', { class: 'muted small' }, img.credit));
  }
  const scene = pack().scenes?.[id];
  return scene ? h('div', { class: 'scene' }, h('div', { class: 'muted small' }, '核心画面'), h('div', {}, scene)) : null;
}
/** Cantonese example where known Cantonese words can be tapped for their Mandarin meaning. */
function yueLine(text: string): HTMLElement {
  const pop = h('div', { class: 'gl-pop muted small', role: 'status' });
  const line = h('div', { class: 'yue' });
  for (const seg of glossarySegments(text, pack().cantonese_glossary)) {
    if (seg.zh) {
      const b = h('button', { class: 'gl', type: 'button', 'aria-label': `${seg.text} 的意思` }, seg.text);
      b.addEventListener('click', () => { pop.textContent = `${seg.text} ＝ ${seg.zh}`; });
      line.append(b);
    } else line.append(seg.text);
  }
  return h('div', {}, line, pop);
}
function feedbackBox(it: Item): HTMLElement {
  const id = idOf(it);
  const cur = state.vocab.feedback[id];
  const note = h('input', { class: 'input', type: 'text', placeholder: '想说什么就写一句（可不写）', value: cur?.note ?? '', 'aria-label': '备注' });
  const row = h('div', { class: 'row-wrap' });
  let verdict: Verdict | undefined = cur?.verdict;
  const save = () => {
    if (!verdict) return;
    void saveVocab({ ...state.vocab, feedback: { ...state.vocab.feedback, [id]: { verdict, note: note.value, at: todayStr() } } });
  };
  const draw = () => row.replaceChildren(...(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => {
    const b = h('button', { class: `btn ghost small-btn ${verdict === v ? 'on' : ''}`, type: 'button', 'aria-pressed': String(verdict === v) }, VERDICT_LABEL[v]);
    b.addEventListener('click', () => { verdict = v; draw(); save(); });
    return b;
  }));
  draw();
  note.addEventListener('change', save);
  return h('div', { class: 'feedback' }, h('div', { class: 'muted small' }, '耳朵复核：这个说法你在香港听过吗？（只存在这台设备上）'), row, note);
}
function meaningBlock(it: Item): HTMLElement {
  const box = h('div', { class: 'meaning' }, h('div', { class: 'zh strong' }, it.zh));
  if (it.type === 'sentence' && it.example_en) {
    box.append(h('div', { class: 'en-mid' }, it.example_en), h('div', { class: 'zh' }, it.example_zh ?? ''));
  } else if (it.example_yue_mixed) {
    box.append(yueLine(it.example_yue_mixed));
    if (canSpeak('yue')) box.append(btn('🔊 粤语', () => speak(it.example_yue_mixed ?? '', 'yue'), 'ghost'));
    box.append(h('div', { class: 'zh' }, it.example_zh ?? ''));
  }
  if (it.note) box.append(h('div', { class: 'note' }, `💡 ${it.note}`));
  return box;
}
function wordHeader(it: Item): HTMLElement {
  return h('div', {}, trustBadges(it), picture(it), h('div', { class: 'en-big' }, it.en),
    canSpeak('en') ? h('div', { class: 'audio-tools' }, btn('🔊 听', () => speak(it.en, 'en'), 'ghost')) : null);
}

// ---------- 词库首页 ----------
export function renderVocabHome() {
  const p = pack();
  const today = todayStr();
  const s = state.settings;
  const dueN = dueEntries(state.vocab, new Date()).length;
  const todayRev = reviewQueue(state.vocab, new Date(), today, s.reviewsPerDay).length;
  const nLeft = Math.min(newLeft(state.vocab, today, s.newWordsPerDay), nextNewItems(p, state.vocab, 9999).length);
  const parts = ['school', 'workplace', 'bim'];
  const groupCards = parts.map((part) => {
    const gs = p.groups.filter((g) => g.part === part);
    if (!gs.length) return null;
    return h('div', {}, h('h3', {}, PART_NAME[part] ?? part),
      ...gs.map((g) => {
        const gp = groupProgress(p, state.vocab, g.id);
        return h('a', { class: 'card link-card', href: `#/vocab/group/${g.id}` },
          h('div', { class: 'card-title' }, g.title), h('div', { class: 'muted small' }, `已学 ${gp.seen} / ${gp.total}`), progressBar(gp.seen, gp.total));
      }));
  });
  mount(root(), topbar('学词', '/'),
    h('div', { class: 'screen' },
      h('div', { class: 'card' },
        h('div', { class: 'muted' }, `已学 ${introducedCount(state.vocab)} / ${p.items.length} 个`),
        progressBar(introducedCount(state.vocab), p.items.length),
        h('div', { class: 'row-wrap' },
          btn(`学新词（今天还能学 ${nLeft} 个）`, () => go('/vocab/learn'), 'primary'),
          btn(`复习（今天 ${todayRev} 张${dueN > todayRev ? '，其余顺延' : ''}）`, () => go('/vocab/review'), 'ghost'),
          btn('错 → 对卡片', () => go('/fixes'), 'ghost'),
          btn('参考：量词、BIM 流程、粤语小词典', () => go('/reference'), 'ghost'))),
      ...groupCards));
}

export function renderGroup(groupId: string) {
  const p = pack();
  const g = p.groups.find((x) => x.id === groupId);
  if (!g) return go('/vocab');
  const items = p.items.filter((i) => i.group === groupId).sort((a, b) => a.no - b.no);
  mount(root(), topbar(g.title, '/vocab'),
    h('div', { class: 'screen narrow' },
      h('div', { class: 'card' }, h('div', { class: 'muted' }, g.intro)),
      ...items.map((it) => h('a', { class: 'card link-card row-between', href: `#/vocab/item/${idOf(it)}` },
        h('div', {}, h('div', { class: 'card-title' }, it.en), h('div', { class: 'muted small' }, it.zh)),
        h('span', { class: `status ${state.vocab.srs[idOf(it)] ? 'solid' : ''}` }, state.vocab.srs[idOf(it)] ? '学过' : '没学')))));
}

export function renderItem(id: string) {
  const it = itemById(pack(), id);
  if (!it) return go('/vocab');
  mount(root(), topbar(it.en, `/vocab/group/${it.group}`),
    h('div', { class: 'screen narrow' }, h('div', { class: 'card focus' }, wordHeader(it), meaningBlock(it), feedbackBox(it))));
}

// ---------- 学新词 ----------
export function learnNewWords() {
  const p = pack();
  const s = state.settings;
  const today = todayStr();
  const queue = nextNewItems(p, state.vocab, newLeft(state.vocab, today, s.newWordsPerDay));
  let i = 0, learned = 0;
  const finish = () => {
    const left = newLeft(state.vocab, today, s.newWordsPerDay);
    mount(root(), topbar('学新词', '/vocab'),
      h('div', { class: 'screen narrow' }, h('div', { class: 'card focus center' },
        h('div', { class: 'big-emoji' }, learned ? '🌱' : '👌'),
        h('h2', {}, learned ? `今天学了 ${learned} 个新词` : '今天没有新词要学了'),
        h('p', { class: 'muted' }, left === 0 ? `今天的新词上限（${s.newWordsPerDay} 个）到了，明天再来；可在设置里改。` : '这一批学完了。'),
        btn(hooks.active ? '继续 →' : '回到学词', () => exitTo('/vocab'), 'primary big'))));
  };
  const showIntro = (it: Item, then: () => void) => {
    const g = p.groups.find((x) => x.id === it.group)!;
    mount(root(), topbar('新的一组', '/vocab'),
      h('div', { class: 'screen narrow' }, h('div', { class: 'card focus' },
        h('div', { class: 'chip amber' }, PART_NAME[g.part] ?? g.part), h('h2', {}, g.title), h('p', {}, g.intro),
        btn('开始这一组 →', () => {
          void saveVocab({ ...state.vocab, introSeen: { ...state.vocab.introSeen, [g.id]: true } }).then(then);
        }, 'primary big'))));
  };
  const card = () => {
    if (i >= queue.length) return finish();
    const it = queue[i];
    if (!state.vocab.introSeen[it.group]) return showIntro(it, card);
    let revealed = false;
    const draw = () => {
      const body = h('div', { class: 'card focus' }, wordHeader(it));
      if (!revealed) {
        body.append(h('p', { class: 'muted' }, '先想一想：你见过这个词吗？意思是什么？'), btn('看意思', () => { revealed = true; draw(); }, 'primary big'));
      } else {
        body.append(meaningBlock(it), feedbackBox(it), h('div', { class: 'muted small center' }, '记住了就点“记住了”，没把握点“还不熟”（会很快再出现）'),
          h('div', { class: 'rating-row two' }, btn('记住了', () => rate('good'), 'rate good'), btn('还不熟', () => rate('again'), 'rate bad')));
      }
      mount(root(), topbar('学新词', '/vocab'), h('div', { class: 'screen narrow' },
        h('div', { class: 'muted small' }, `第 ${i + 1} / ${queue.length} 个`), progressBar(i, queue.length), body));
    };
    let done = false;
    const rate = (g: Grade) => {
      if (done) return;
      done = true;
      void saveVocab(rateWord(state.vocab, idOf(it), g, new Date(), today)).then(() => {
        learned++; i++;
        if (hooks.active && hooks.timeUp()) return finish();
        card();
      });
    };
    draw();
  };
  if (!queue.length) return finish();
  card();
}

// ---------- 复习（提取为主）----------
export function reviewWords() {
  const p = pack();
  const s = state.settings;
  const today = todayStr();
  const queue = reviewQueue(state.vocab, new Date(), today, s.reviewsPerDay);
  let i = 0, right = 0, wrong = 0;
  const finish = () => {
    const waiting = dueEntries(state.vocab, new Date()).length;
    mount(root(), topbar('复习', '/vocab'),
      h('div', { class: 'screen narrow' }, h('div', { class: 'card focus center' },
        h('div', { class: 'big-emoji' }, queue.length ? '✅' : '🎉'),
        h('h2', {}, queue.length ? '复习完成' : '现在没有要复习的词'),
        queue.length ? h('p', {}, `记得 ${right} · 忘了 ${wrong}`) : null,
        waiting > 0 && reviewLeft(state.vocab, today, s.reviewsPerDay) === 0 ? h('p', { class: 'muted' }, `今天的复习上限（${s.reviewsPerDay} 张）到了，其余的明天接着复习。`) : null,
        btn(hooks.active ? '继续 →' : '回到学词', () => exitTo('/vocab'), 'primary big'))));
  };
  const next = () => {
    if (i >= queue.length) return finish();
    const id = queue[i];
    const it = itemById(p, id);
    if (!it) { i++; return next(); }
    const entry = state.vocab.srs[id];
    const mode = reviewMode(p, it, entry.card.reps ?? 0);
    const cloze = clozeSentence(it);
    const head = h('div', {}, h('div', { class: 'muted small' }, `${i + 1} / ${queue.length} · ${mode === 'choose' ? '选出英文' : '想一想，说出英文'}`), progressBar(i, queue.length));
    let done = false;
    const rate = (g: Grade) => {
      if (done) return;
      done = true;
      if (g === 'good') right++; else wrong++;
      void saveVocab(rateWord(state.vocab, id, g, new Date(), today)).then(() => {
        i++;
        if (hooks.active && hooks.timeUp()) return finish();
        next();
      });
    };
    const prompt = h('div', {}, it.type === 'sentence' ? h('div', { class: 'muted small' }, '这句英文怎么说？') : null,
      h('div', { class: 'zh strong big' }, it.zh), cloze ? h('div', { class: 'yue-plain' }, cloze) : null);
    if (mode === 'say') {
      let revealed = false;
      const draw = () => {
        const card = h('div', { class: 'card focus' }, prompt);
        if (!revealed) card.append(btn('看答案', () => { revealed = true; draw(); }, 'primary big'));
        else card.append(h('div', { class: 'en-big' }, it.en), ...(canSpeak('en') ? [btn('🔊 听', () => speak(it.en, 'en'), 'ghost')] : []), meaningBlock(it),
          h('div', { class: 'rating-row two' }, btn('记得', () => rate('good'), 'rate good'), btn('忘了', () => rate('again'), 'rate bad')));
        mount(root(), topbar('复习', '/vocab'), h('div', { class: 'screen narrow' }, head, card));
      };
      draw();
    } else {
      const opts = choiceOptions(p, it, `${today}${i}`);
      const card = h('div', { class: 'card focus' }, prompt);
      const list = h('div', { class: 'choices' });
      let answered = false;
      opts.forEach((o) => {
        const b = h('button', { class: 'btn choice', type: 'button' }, o.en);
        b.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const ok = idOf(o) === id;
          b.classList.add(ok ? 'right' : 'wrong');
          list.querySelectorAll('button').forEach((x) => { if (x.textContent === it.en) x.classList.add('right'); (x as HTMLButtonElement).disabled = true; });
          card.append(meaningBlock(it), btn('下一个 →', () => rate(ok ? 'good' : 'again'), 'primary big'));
        });
        list.append(b);
      });
      card.append(list);
      mount(root(), topbar('复习', '/vocab'), h('div', { class: 'screen narrow' }, head, card));
    }
  };
  if (!queue.length) return finish();
  next();
}

export function applyLimits(newPerDay: number, reviewsPerDay: number) {
  void saveSettings({ newWordsPerDay: newPerDay, reviewsPerDay });
}
