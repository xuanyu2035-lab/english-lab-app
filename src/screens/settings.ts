import { validateContentPack } from '../content';
import { isValidDate, todayStr } from '../dates';
import { FAMILIAR_START, getSentenceProgress } from '../schedule';
import { exportBackup, importBackup } from '../backup';
import { autoVoice, englishVoices, onVoicesChanged, speak, ttsSupported, voiceLabel } from '../media';
import { loadState, saveContent, saveProgress, saveSettings, scripts, state } from '../store';
import { SCRIPT_IDS, sentenceId } from '../types';
import type { Progress, ScriptId, Settings } from '../types';
import { feedbackExport } from '../vocab';
import { btn, download, h, mount, toast } from '../ui';
import { SCRIPT_NAME } from './home';
import { go, topbar } from './practice';

const root = () => document.getElementById('app')!;

export function applyTheme() {
  const t = state.settings.theme;
  const el = document.documentElement;
  if (t === 'auto') el.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'morning' : 'night';
  else el.dataset.theme = t;
}

/** File picker + "load sample" for content packs. */
export function importCard(onDone: () => void): HTMLElement {
  const msg = h('div', { class: 'muted small', role: 'status' });
  const doImport = async (raw: unknown) => {
    const v = validateContentPack(raw);
    if (!v.ok) { msg.className = 'bad-text small'; msg.textContent = `导入失败：${v.errors.slice(0, 4).join('；')}`; return; }
    await saveContent(raw);
    toast(`导入成功：${v.summary}`);
    onDone();
  };
  const input = h('input', { type: 'file', accept: '.json,application/json', id: 'content-file', class: 'file-input' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { await doImport(JSON.parse(await f.text())); }
    catch { msg.className = 'bad-text small'; msg.textContent = '这个文件读不出来，请确认选的是 content.json'; }
  });
  return h('div', { class: 'card' },
    h('label', { class: 'btn primary big file-label', for: 'content-file' }, '📂 选择 content.json 导入'), input,
    btn('先载入虚构示例看看', async () => {
      try { await doImport(await (await fetch('./sample-content.json')).json()); }
      catch { msg.className = 'bad-text small'; msg.textContent = '示例载入失败（需要联网打开一次）'; }
    }, 'ghost'),
    msg);
}

function knownSectionsForm(): { node: HTMLElement; checked: () => { id: ScriptId; secNo: number }[] } {
  const sc = scripts();
  const boxes: { id: ScriptId; secNo: number; el: HTMLInputElement }[] = [];
  const groups = SCRIPT_IDS.map((id) => h('div', { class: 'field' },
    h('div', { class: 'label' }, SCRIPT_NAME[id]),
    ...sc![id].sections.map((sec) => {
      const el = h('input', { type: 'checkbox', id: `kn-${id}-${sec.no}` });
      boxes.push({ id, secNo: sec.no, el });
      return h('label', { class: 'check-line', for: `kn-${id}-${sec.no}` }, el, `${sec.no}. ${sec.name}`);
    })));
  return { node: h('div', {}, ...groups), checked: () => boxes.filter((b) => b.el.checked).map(({ id, secNo }) => ({ id, secNo })) };
}

async function applyKnown(list: { id: ScriptId; secNo: number }[]) {
  const sc = scripts()!;
  const sentences: Progress['sentences'] = { ...state.progress.sentences };
  for (const k of list) {
    for (const no of sc[k.id].sections.find((s) => s.no === k.secNo)!.sentence_nos) {
      const sp = getSentenceProgress(state.progress, k.id, no);
      if (sp.n === 0 && sp.level === 1) sentences[sentenceId(k.id, no)] = { ...FAMILIAR_START };
    }
  }
  await saveProgress({ ...state.progress, sentences });
}

function dateField(label: string, value: string | null, id: string) {
  const unknown = h('input', { type: 'checkbox', id: `${id}-unk`, checked: value === null });
  const date = h('input', { type: 'date', id, value: value ?? '', class: 'input' });
  const sync = () => { date.disabled = unknown.checked; };
  unknown.addEventListener('change', sync);
  sync();
  return {
    node: h('div', { class: 'field' }, h('label', { class: 'label', for: id }, label), date,
      h('label', { class: 'check-line', for: `${id}-unk` }, unknown, '还不知道（先按 14 天后倒排）')),
    get: (): string | null => (unknown.checked || !isValidDate(date.value) ? null : date.value),
  };
}

function settingsForm(first: boolean, onSave: () => void) {
  const s = state.settings;
  const iv = dateField('面试日期', s.interviewDate, 'f-interview');
  const pr = dateField('4104 展示日期', s.presentDate, 'f-present');
  let minutes = s.minutes;
  const minRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '每次练多久' });
  const drawMin = () => minRow.replaceChildren(...([30, 60, 90, 120] as const).map((m) => {
    const b = h('button', { class: `seg-btn ${m === minutes ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(m === minutes) }, `${m} 分钟`);
    b.addEventListener('click', () => { minutes = m; drawMin(); });
    return b;
  }));
  drawMin();
  const known = knownSectionsForm();
  const theme = h('select', { id: 'f-theme', class: 'input' },
    h('option', { value: 'night' }, '夜读（深色，默认）'), h('option', { value: 'morning' }, '晨读（浅色）'), h('option', { value: 'auto' }, '跟随系统'));
  theme.value = s.theme;
  const fl = h('input', { type: 'checkbox', id: 'f-fl', checked: s.firstLetterHint });
  const noise = h('select', { id: 'f-noise', class: 'input' },
    h('option', { value: 'off' }, '关'), h('option', { value: 'brown' }, '棕噪音（低沉）'), h('option', { value: 'white' }, '白噪音（沙沙声）'));
  noise.value = s.noise;
  const imm = h('input', { type: 'checkbox', id: 'f-imm', checked: s.immersive });
  const newPer = h('input', { type: 'number', id: 'f-newper', class: 'input', min: 1, max: 50, value: String(s.newWordsPerDay) });
  const revPer = h('input', { type: 'number', id: 'f-revper', class: 'input', min: 5, max: 200, value: String(s.reviewsPerDay) });
  const form = h('div', {},
    iv.node, pr.node,
    h('div', { class: 'field' }, h('div', { class: 'label' }, '每次能练多久'), minRow),
    h('div', { class: 'field' }, h('div', { class: 'label' }, '哪些小节已经比较熟？（勾选的会从 L3 开始练，默认都不熟）'), known.node),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-theme' }, '外观'), theme),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'check-line', for: 'f-fl' }, fl, '打开 L2.5 首字母提示（默认关闭）')),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'check-line', for: 'f-imm' }, imm, '上课时默认使用沉浸模式（全屏）')),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-noise' }, '背景声'), noise),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-newper' }, '每天新词上限（默认 10）'), newPer),
    first ? null : h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-revper' }, '每天复习上限（默认 40，超出顺延，不累积）'), revPer),
    btn(first ? '开始使用' : '保存设置', async () => {
      await saveSettings({
        interviewDate: iv.get(), presentDate: pr.get(), minutes: minutes as Settings['minutes'], onboarded: true,
        setupDate: state.settings.setupDate || todayStr(),
        ...(first ? {} : {
          theme: theme.value as Settings['theme'], firstLetterHint: fl.checked,
          immersive: imm.checked, noise: noise.value as Settings['noise'],
          newWordsPerDay: Math.min(50, Math.max(1, Math.round(Number(newPer.value)) || 10)),
          reviewsPerDay: Math.min(200, Math.max(5, Math.round(Number(revPer.value)) || 40)),
        }),
      });
      await applyKnown(known.checked());
      applyTheme();
      toast('已保存');
      onSave();
    }, 'primary big'));
  return form;
}

const SAMPLE_LINE = 'Hello, my name is Sam. It is nice to meet you.';
/** 声音：列出这台设备所有英文声音，逐个试听、选一个；语速、每句重复次数。改了立刻保存。 */
export function voiceCard(): HTMLElement {
  const box = h('div', { class: 'card voice-card' });
  const list = h('div', { class: 'voice-list' });
  const preview = (v?: SpeechSynthesisVoice) => speak(SAMPLE_LINE, 'en', { voice: v, times: 1 });
  const drawList = () => {
    const vs = englishVoices();
    const auto = autoVoice();
    const cur = state.settings.voiceURI;
    const row = (label: string, sub: string, chosen: boolean, onPick: () => void, v?: SpeechSynthesisVoice) =>
      h('div', { class: `voice-row ${chosen ? 'on' : ''}` },
        h('div', { class: 'voice-name' }, h('b', {}, label), sub ? h('div', { class: 'muted small' }, sub) : null),
        h('div', { class: 'row-wrap tight' },
          btn('▶ 试听', () => preview(v), 'ghost'),
          h('button', { class: `btn ${chosen ? 'primary' : 'ghost'}`, type: 'button', 'aria-pressed': String(chosen), onclick: onPick }, chosen ? '✓ 正在用' : '用这个')));
    const pick = async (uri: string | null) => { await saveSettings({ voiceURI: uri }); drawList(); toast(uri ? '已选好这个声音' : '已改回自动选择'); };
    list.replaceChildren(
      row('自动（推荐）', auto ? `现在会用：${voiceLabel(auto)}` : '这台设备上没找到英文声音', cur === null || !vs.some((v) => v.voiceURI === cur), () => void pick(null), auto),
      ...vs.map((v) => row(v.name, `${v.lang.replace('_', '-')}${/^en[-_]US$/i.test(v.lang) ? ' · 美式' : /^en[-_]GB$/i.test(v.lang) ? ' · 英式' : ''}${/natural|neural|enhanced|premium/i.test(v.name) ? ' · 更自然' : ''}`,
        cur === v.voiceURI, () => void pick(v.voiceURI), v)));
    if (!vs.length) list.append(h('p', { class: 'muted small' }, '这台设备暂时没有英文声音（或还在加载）。可以看“帮助”里怎么下载。'));
  };
  const rateVal = h('b', {}, state.settings.speechRate.toFixed(2) + ' 倍');
  const rate = h('input', { type: 'range', id: 'f-rate', min: '0.6', max: '1.2', step: '0.05', value: String(state.settings.speechRate), class: 'range' });
  rate.addEventListener('input', () => { rateVal.textContent = Number(rate.value).toFixed(2) + ' 倍'; });
  rate.addEventListener('change', () => { void saveSettings({ speechRate: Number(rate.value) }).then(() => preview()); });
  const rep = h('select', { id: 'f-repeat', class: 'input' }, [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, n === 1 ? '读 1 遍' : `读 ${n} 遍`)));
  rep.value = String(state.settings.repeatCount);
  rep.addEventListener('change', () => void saveSettings({ repeatCount: Number(rep.value) }));
  if (!ttsSupported()) { box.append(h('p', { class: 'muted small' }, '这个浏览器不支持朗读，所以没有声音设置。')); return box; }
  drawList();
  onVoicesChanged(() => { if (list.isConnected) drawList(); });
  box.append(
    h('p', { class: 'muted small' }, '默认用美式英语，并优先选名字带 Natural / Neural / Enhanced / Premium 的声音。下面是这台设备上所有英文声音，每个都能试听。'),
    list,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-rate' }, '语速：', rateVal, '（0.6 慢 – 1.2 快）'), rate),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-repeat' }, '每句重复次数'), rep),
    h('a', { class: 'btn ghost', href: '#/help' }, '❓ 怎么下载更自然的美式声音'));
  return box;
}

/** 导出耳朵复核反馈清单，给 Owner 去修内容。 */
function feedbackCard(): HTMLElement {
  const n = Object.keys(state.vocab.feedback).length;
  return h('div', {},
    h('h3', {}, '耳朵复核反馈'),
    h('div', { class: 'card' },
      h('p', { class: 'muted small' }, `已记录 ${n} 条（我听过 / 没听过 / 说法不对）。导出后可交给 GPT 或 Claude 去改 content.json。`),
      btn('⬇ 导出反馈清单', () => download(`englishlab-反馈清单-${todayStr()}.json`, JSON.stringify(feedbackExport(state.pack!, state.vocab), null, 1)), 'primary big')));
}

/** 导出 / 导入进度：跨设备用一个文件搬运（V1 不做自动同步）。 */
function backupCard(): HTMLElement {
  const msg = h('div', { class: 'muted small', role: 'status' });
  const input = h('input', { type: 'file', accept: '.json,application/json', id: 'backup-file', class: 'file-input' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await importBackup(JSON.parse(await f.text()));
      await loadState();
      toast('进度已导入');
      go('/');
    } catch (e) {
      msg.className = 'bad-text small';
      msg.textContent = `导入失败：${e instanceof Error ? e.message : '文件读不出来'}`;
    }
  });
  return h('div', {},
    h('h3', {}, '进度备份 / 换设备'),
    h('p', { class: 'muted small' }, '导出一个文件，用云盘或微信传到另一台设备，再在那里“导入进度”。导入会替换这台设备上的进度（内容包不受影响）。'),
    h('div', { class: 'card' },
      btn('⬇ 导出进度', async () => {
        const b = await exportBackup();
        download(`englishlab-进度-${todayStr()}.json`, JSON.stringify(b));
        msg.className = 'muted small';
        msg.textContent = '已导出。';
      }, 'primary big'),
      h('label', { class: 'btn ghost big file-label', for: 'backup-file' }, '⬆ 导入进度'), input, msg));
}

export function renderOnboarding() {
  mount(root(), topbar('第一次打开：先设置几件事', null),
    h('div', { class: 'screen narrow' },
      h('p', { class: 'muted' }, '三个问题，之后都可以在“设置”里改。日期不知道也没关系。'),
      settingsForm(true, () => go('/'))));
}

export function renderSettings() {
  const hasPack = !!state.pack;
  mount(root(), topbar('设置', '/'),
    h('div', { class: 'screen narrow' },
      h('h3', {}, '声音'),
      voiceCard(),
      hasPack ? settingsForm(false, () => go('/')) : null,
      h('h3', {}, '内容包'),
      h('p', { class: 'muted small' }, hasPack ? `当前内容：${state.pack!.meta?.title ?? '已导入'}。重新导入会保留学习进度（按句子编号对应）。` : '还没有内容包。'),
      importCard(() => go('/')),
      hasPack ? feedbackCard() : null,
      backupCard(),
      h('h3', {}, '关于'),
      h('p', { class: 'muted small' }, '所有数据（进度、录音）只保存在这台设备的浏览器里，不上传。')));
}
