// Dev helper: renders private/images/*.jpg into one labelled contact sheet (private/images/_sheet.png) for visual review.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = 'private/images';
const files = readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f) && !f.startsWith('_')).sort();
const cells = files.map((f) => {
  const b = readFileSync(`${dir}/${f}`).toString('base64');
  return `<div style="width:300px;margin:4px;font:14px sans-serif"><img src="data:image/jpeg;base64,${b}" style="width:300px;height:200px;object-fit:contain;background:#222"><div>${f}</div></div>`;
}).join('');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.setContent(`<body style="margin:0;background:#fff;display:flex;flex-wrap:wrap;width:1280px">${cells}</body>`);
await p.screenshot({ path: resolve(dir, '_sheet.png'), fullPage: true });
await b.close();
console.log(files.length, 'images');
