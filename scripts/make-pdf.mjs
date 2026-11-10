// Renders docs/*.md to PDF (large, calm type for easy reading) with Playwright's Chromium.
//   node scripts/make-pdf.mjs                → docs/使用说明.pdf and docs/最终汇报.pdf
//   node scripts/make-pdf.mjs docs/foo.md    → one file
import { chromium } from 'playwright';
import { marked } from 'marked';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['docs/使用说明.md', 'docs/最终汇报.md'];
const css = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif; font-size: 13.5pt; line-height: 1.75; color: #222; }
  h1 { font-size: 24pt; margin: 0 0 8pt; } h2 { font-size: 17pt; margin: 18pt 0 6pt; border-bottom: 2px solid #B5651D; padding-bottom: 3pt; color: #8a4a10; }
  h3 { font-size: 14.5pt; margin: 12pt 0 4pt; } li { margin: 4pt 0; } a { color: #8a4a10; }
  code { background: #f1ece2; padding: 0 4px; border-radius: 3px; font-size: 12pt; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #ccc; padding: 4pt 6pt; font-size: 12pt; text-align: left; }
  blockquote { border-left: 4px solid #B5651D; margin: 8pt 0; padding: 2pt 10pt; background: #faf5ec; }
`;
const browser = await chromium.launch();
for (const f of files) {
  if (!existsSync(f)) { console.log('skip (missing)', f); continue; }
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${marked.parse(readFileSync(f, 'utf8'))}</body>`;
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: resolve(f.replace(/\.md$/, '.pdf')), format: 'A4', printBackground: true });
  await page.close();
  console.log('wrote', f.replace(/\.md$/, '.pdf'));
}
await browser.close();
