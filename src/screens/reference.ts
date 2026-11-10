/** Reference pages: Cantonese glossary, classifiers (量词), BIM flow. Display only. */
import { state } from '../store';
import { h, mount } from '../ui';
import { topbar } from './practice';

export function renderReference() {
  const p = state.pack!;
  const sect = (title: string, rows: Node[]) => rows.length ? h('div', {}, h('h3', {}, title), h('div', { class: 'card' }, rows)) : null;
  mount(document.getElementById('app')!, topbar('参考', '/'),
    h('div', { class: 'screen narrow' },
      sect('量词（粤语怎么数东西）', p.cantonese_classifiers.map((c) =>
        h('div', { class: 'line' }, h('b', { class: 'amber' }, c.classifier), `  ${c.used_for}`, h('div', { class: 'muted' }, c.example)))),
      sect('BIM 流程表', p.bim_flow.map((b) =>
        h('div', { class: 'line' }, h('b', {}, b.stage), h('div', {}, b.what), h('div', { class: 'muted small' }, b.terms)))),
      sect('粤语小词典（例句里点粤语字也能看）', p.cantonese_glossary.map((g) =>
        h('div', { class: 'line' }, h('b', { class: 'amber' }, g.yue), `  ＝  ${g.zh}`)))));
}
