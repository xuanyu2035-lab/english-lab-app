import './style.css';
import { initTts } from './media';
import { loadState, scripts, state } from './store';
import { h, mount } from './ui';
import { renderChecklist, renderHard, renderNotes, renderRescue } from './screens/extras';
import { renderHome, renderScript } from './screens/home';
import { renderComposeHub, runCompose } from './screens/compose';
import { renderReference } from './screens/reference';
import { renderFixes } from './screens/fixes';
import { applyLimits, learnNewWords, renderGroup, renderItem, renderVocabHome, reviewWords } from './screens/vocab';
import { renderSession } from './screens/session';
import { chainSection, fullRun, learnSection, reviewSection, topbar } from './screens/practice';
import { applyTheme, renderOnboarding, renderSettings } from './screens/settings';
import type { ScriptId } from './types';

const app = () => document.getElementById('app')!;
const isScript = (s: string): s is ScriptId => s === 'self_intro' || s === 'speech_4104';

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (!state.loaded) return;
  applyTheme();
  const needSetup = !!state.pack && !state.settings.onboarded;
  if (needSetup && parts[0] !== 'settings') return renderOnboarding();
  if (parts[0] === 'settings') return renderSettings();
  if (!scripts()) return renderHome();
  if (parts[0] === 'hard') return renderHard();
  if (parts[0] === 'vocab') {
    if (!parts[1]) return renderVocabHome();
    if (parts[1] === 'learn') return learnNewWords();
    if (parts[1] === 'review') return reviewWords();
    if (parts[1] === 'group') return renderGroup(parts[2]);
    if (parts[1] === 'item') return renderItem(decodeURIComponent(parts.slice(2).join('/')));
  }
  if (parts[0] === 'compose') {
    if (parts[1] === 'slots' || parts[1] === 'arrange' || parts[1] === 'mix') return runCompose(parts[1]);
    return renderComposeHub();
  }
  if (parts[0] === 'fixes') return renderFixes();
  if (parts[0] === 'reference') return renderReference();
  if (parts[0] === 'session') return renderSession(([30, 60, 90, 120].includes(Number(parts[1])) ? Number(parts[1]) : undefined) as 30 | 60 | 90 | 120 | undefined);
  if (parts[0] === 'script' && isScript(parts[1])) {
    const id = parts[1];
    const a = parts[2];
    if (!a) return renderScript(id);
    if (a === 'learn') return learnSection(id, Number(parts[3]));
    if (a === 'chain') return chainSection(id, Number(parts[3]));
    if (a === 'review') return reviewSection(id, Number(parts[3]), Number(parts[4]));
    if (a === 'full') return fullRun(id);
    if (a === 'rescue' && id === 'speech_4104') return renderRescue();
    if (a === 'checklist') return renderChecklist(id);
    if (a === 'notes') return renderNotes(id);
  }
  return renderHome();
}

async function boot() {
  mount(app(), h('div', { class: 'screen' }, '加载中…'));
  try {
    await loadState();
  } catch {
    mount(app(), topbar('EnglishLab', null), h('div', { class: 'screen' }, '这个浏览器不允许保存数据（可能是隐私模式）。请换普通窗口打开。'));
    return;
  }
  initTts();
  applyTheme();
  window.addEventListener('hashchange', route);
  route();
}
void applyLimits;
void boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
}
