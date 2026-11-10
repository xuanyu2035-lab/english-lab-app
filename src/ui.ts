/** Tiny DOM helpers. */
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'value') (el as unknown as HTMLInputElement).value = String(v);
      else if (k === 'checked') (el as unknown as HTMLInputElement).checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}
export const btn = (label: string, onclick: () => void, cls = '') => h('button', { class: `btn ${cls}`.trim(), type: 'button', onclick }, label);

export function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  t.style.top = `${64 + document.querySelectorAll('.toast').length * 60}px`; // several toasts stack instead of overlapping
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
}

export function mount(root: HTMLElement, ...nodes: Node[]) {
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export function progressBar(value: number, max: number): HTMLElement {
  const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value });
  const fill = h('div', { class: 'bar-fill' });
  fill.style.width = `${pct(value, max)}%`;
  bar.append(fill);
  return bar;
}
export function download(name: string, text: string, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
