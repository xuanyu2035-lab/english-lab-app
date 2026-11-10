// End-to-end check with Playwright: builds the app, serves it, walks the main flows at
// phone / tablet / desktop sizes, takes screenshots and asserts there is no horizontal overflow
// and no button hanging outside the screen (or too small to tap).
//   node scripts/e2e-screenshots.mjs            → sample (fictional) content → docs/screenshots/
//   node scripts/e2e-screenshots.mjs --private  → private pack              → screenshots-private/ (git-ignored)
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const usePrivate = process.argv.includes('--private');
const privatePack = existsSync('private/content-full.json') ? 'private/content-full.json' : 'private/content.json';
const content = resolve(usePrivate ? privatePack : 'public/sample-content.json');
const outDir = resolve(usePrivate ? 'screenshots-private' : 'docs/screenshots');
if (usePrivate && !existsSync(content)) { console.log('no private content, skipping'); process.exit(0); }
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (!process.argv.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
const PORT = 4179;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const URL = `http://localhost:${PORT}/`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 200)); }

const SIZES = [
  { name: 'phone-360', w: 360, h: 800, mobile: true },
  { name: 'phone-390', w: 390, h: 844, mobile: true },
  { name: 'tablet-820', w: 820, h: 1180, mobile: true },
  { name: 'desktop-1366', w: 1366, h: 768, mobile: false },
];
const failures = [];
const browser = await chromium.launch();

async function check(page, label) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('button, a.btn, label.btn, input, select')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (el.classList.contains('file-input')) continue;
      if (b.left < -1 || b.right > vw + 1) bad.push(`${el.tagName}:${(el.textContent || el.id || '').trim().slice(0, 20)} [${Math.round(b.left)}..${Math.round(b.right)}]`);
      if (el.matches('button, a.btn, label.btn') && !el.classList.contains('gl') && !el.classList.contains('chunk') && b.height < 40) bad.push(`small:${(el.textContent || '').trim().slice(0, 20)} h=${Math.round(b.height)}`);
    }
    // is any primary button covered by another element at its centre?
    for (const el of document.querySelectorAll('button.primary, button.rate')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.bottom < 0 || b.top > innerHeight || el.closest('details:not([open])')) continue;
      const top = document.elementFromPoint(Math.min(b.left + b.width / 2, vw - 1), Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1));
      if (top && top !== el && !el.contains(top) && !top.classList.contains('toast')) bad.push(`covered:${(el.textContent || '').trim().slice(0, 20)} by ${top.tagName}.${top.className}`);
    }
    return { overflow: document.documentElement.scrollWidth - vw, bad };
  });
  if (r.overflow > 1) failures.push(`${label}: horizontal overflow ${r.overflow}px`);
  if (r.bad.length) failures.push(`${label}: ${r.bad.join(' | ')}`);
}

async function shot(page, size, name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${size.name}-${name}.png`, fullPage: false });
  await check(page, `${size.name}/${name}`);
}

const click = (page, name, opts = {}) => page.getByRole('button', { name, ...opts }).click();
const has = async (page, name, opts = {}) => (await page.getByRole('button', { name, ...opts }).count()) > 0;

async function learnWholeSection(page, size, secNo, shootEarly) {
  await page.goto(`${URL}#/script/self_intro/learn/${secNo}`);
  let guard = 0, shotUnderstand = false, shotL2 = false, shotL4 = false, shotChunks = false;
  while (guard++ < 120) {
    if (await page.getByText('这一节练完了').count()) break;
    if (await has(page, /我看懂了/)) {
      if (shootEarly && !shotUnderstand) { await shot(page, size, 'learn-understand'); shotUnderstand = true; }
      await click(page, /我看懂了/);
    } else if (await has(page, /全部读完了/)) {
      const chunks = page.locator('.chunk');
      const n = await chunks.count();
      for (let i = 0; i < n; i++) { await chunks.nth(i).click(); if (i === 0 && shootEarly && !shotChunks) { await shot(page, size, 'learn-chunks'); shotChunks = true; } }
      await click(page, /全部读完了/);
    } else if (await has(page, /记住了/)) {
      await click(page, /记住了/);
    } else {
      const phase = await page.locator('.chip.amber').innerText();
      if (shootEarly && /L2/.test(phase) && !shotL2) { await shot(page, size, 'learn-L2-blanks'); shotL2 = true; }
      if (shootEarly && /L4/.test(phase) && !shotL4) { await shot(page, size, 'learn-L4'); shotL4 = true; }
      if (await has(page, '看答案')) await click(page, '看答案');
      await click(page, '顺', { exact: true });
      await page.waitForTimeout(80);
    }
  }
  if (guard >= 120) throw new Error('learn loop did not finish');
}

/** Step through whatever screen is showing until the lesson summary appears. */
async function runLesson(page, size, { fastForwardAfter = null } = {}) {
  let guard = 0, shotRest = false, shotMid = false, ff = false;
  while (guard++ < 900) {
    if (await page.getByText('这节课到这里结束').count()) return true;
    if (await has(page, /跳过休息/)) {
      if (!shotRest) { await shot(page, size, '22-session-rest'); shotRest = true; }
      await click(page, /跳过休息/);
    } else if (await has(page, /开始这一组/)) await click(page, /开始这一组/);
    else if (await has(page, /我看懂了/)) await click(page, /我看懂了/);
    else if (await has(page, /全部读完了/)) {
      const chunks = page.locator('.chunk'); const n = await chunks.count();
      for (let i = 0; i < n; i++) await chunks.nth(i).click();
      await click(page, /全部读完了/);
    } else if (await has(page, '看意思')) await click(page, '看意思');
    else if (await has(page, /^记住了/)) await click(page, /^记住了/);
    else if (await page.locator('.choice:not([disabled])').count()) await page.locator('.choice:not([disabled])').first().click();
    else if (await has(page, /下一个 →|下一张 →|下一句 →|^完成$/)) await click(page, /下一个 →|下一张 →|下一句 →|^完成$/);
    else if (await has(page, '看答案')) {
      if (!shotMid) { await shot(page, size, '21-session-immersive'); shotMid = true; }
      if (fastForwardAfter !== null && !ff && guard > fastForwardAfter) { ff = true; await page.clock.fastForward('20:00'); }
      await click(page, '看答案');
    } else if (await has(page, '顺', { exact: true })) await click(page, '顺', { exact: true });
    else if (await has(page, '记得', { exact: true })) await click(page, '记得', { exact: true });
    else if (await has(page, /继续 →/)) await click(page, /继续 →/);
    else await page.waitForTimeout(80);
    await page.waitForTimeout(50);
  }
  throw new Error('lesson did not reach the summary');
}

async function freshPage(size, { clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (clock) await page.clock.install();
  await page.goto(URL);
  await page.waitForSelector('#app .screen');
  await page.setInputFiles('#content-file', content);
  await page.waitForSelector('text=第一次打开');
  await click(page, '开始使用');
  await page.waitForSelector('text=开始今天的课');
  return { ctx, page, errors };
}

async function sessionFlow(size, minutes, fastForwardAfter) {
  const { ctx, page, errors } = await freshPage(size, { clock: true });
  await page.getByRole('radio', { name: `${minutes} 分钟` }).click();
  await shot(page, size, '20-home-start');
  await click(page, /开始今天的课/);
  await page.waitForSelector('text=今天的安排');
  await shot(page, size, '20-session-plan');
  await click(page, /开始 ▶/);
  try { await runLesson(page, size, { fastForwardAfter }); } catch (e) { console.log('LESSON FAIL', await page.evaluate(() => document.body.innerText.slice(0, 400))); throw e; }
  await shot(page, size, '23-session-summary');
  if (!(await page.getByText('今天学会了什么').count())) failures.push(`${size.name}: no summary card`);
  if (await page.evaluate(() => document.body.classList.contains('immersive'))) failures.push(`${size.name}: immersive class left on after lesson`);
  if (errors.length) failures.push(`${size.name}: session page errors ${errors.join(';')}`);
  await ctx.close();
}

/** Vocabulary: learn new words, ear-check feedback, glossary tap, photos/credits, review (say + choose), 错→对, reference, backup. */
async function vocabFlow(size) {
  const { ctx, page, errors } = await freshPage(size, { clock: true });
  await page.goto(`${URL}#/vocab`);
  await page.waitForSelector('text=学新词');
  await shot(page, size, '30-vocab-home');
  await click(page, /学新词/);
  await page.waitForSelector('text=开始这一组');
  await shot(page, size, '31-vocab-group-intro');
  await click(page, /开始这一组/);
  await page.getByRole('button', { name: '看意思' }).waitFor();
  let learned = 0, shotWord = false, shotMeaning = false, sawCredit = false, sawScene = false, tappedGloss = false;
  for (let g = 0; g < 80; g++) {
    if (await page.getByText(/今天学了|今天没有新词/).count()) break;
    if (await has(page, /开始这一组/)) { await click(page, /开始这一组/); await page.getByRole('button', { name: '看意思' }).waitFor(); continue; }
    if (await has(page, '看意思')) {
      if (!shotWord) { await shot(page, size, '32-vocab-new-word'); shotWord = true; }
      if (await page.locator('figcaption').count()) sawCredit = true;
      await click(page, '看意思');
      if (!shotMeaning) { await shot(page, size, '33-vocab-meaning'); shotMeaning = true; }
      if (await page.locator('.scene').count()) sawScene = true;
      if (await page.locator('.gl-pop').count() && !tappedGloss && await page.locator('.gl').count()) {
        await page.locator('.gl').first().click();
        const txt = await page.locator('.gl-pop').first().innerText();
        if (!/＝/.test(txt)) failures.push(`${size.name}: glossary tap showed no meaning`);
        tappedGloss = true;
      }
      if (learned === 0) { await click(page, '我听过'); await page.getByPlaceholder('想说什么就写一句').fill('测试备注'); await page.getByPlaceholder('想说什么就写一句').blur(); }
      if (await page.getByText(/示范句，未逐条核对|已核对/).count() === 0) failures.push(`${size.name}: trust badge missing`);
      await click(page, /^记住了/);
      learned++;
      await page.waitForTimeout(120);
    } else await page.waitForTimeout(80);
  }
  if (learned === 0) failures.push(`${size.name}: learned no words`);
  await shot(page, size, '34-vocab-learn-done');
  // trust badges: dictionary example label appears somewhere in the pack
  await page.goto(`${URL}#/vocab`);
  await page.waitForSelector('text=已学');
  if (!sawCredit && !usePrivate) failures.push(`${size.name}: photo credit line never shown`);
  void sawScene;

  // review: fast-forward 2 hours so every card is due
  await page.clock.fastForward('02:00:00');
  await page.goto(`${URL}#/vocab/review`);
  let reviewed = 0, sawChoose = false, sawSay = false, shotReview = false;
  for (let g = 0; g < 200; g++) {
    if (await page.getByText(/复习完成|现在没有要复习/).count()) break;
    if (await page.locator('.choice:not([disabled])').count()) {
      sawChoose = true;
      if (!shotReview) { await shot(page, size, '35-vocab-review-choose'); shotReview = true; }
      await page.locator('.choice:not([disabled])').first().click();
      await click(page, /下一个 →/);
      reviewed++;
    } else if (await has(page, '看答案')) {
      sawSay = true;
      await shot(page, size, '36-vocab-review-say').catch(() => undefined);
      await click(page, '看答案');
      await click(page, '记得', { exact: true });
      reviewed++;
    } else await page.waitForTimeout(80);
  }
  if (reviewed === 0) failures.push(`${size.name}: reviewed nothing`);
  if (!sawChoose && !sawSay) failures.push(`${size.name}: no review prompt seen`);
  await shot(page, size, '37-vocab-review-done');

  // a group page and a single word page with feedback
  await page.goto(`${URL}#/vocab/group/g1`);
  await page.waitForSelector('.card');
  await shot(page, size, '38-vocab-group');
  await page.locator('a.link-card').first().click();
  await page.waitForSelector('.feedback');
  await shot(page, size, '39-vocab-item');

  // 造句: slots + arrange
  await page.goto(`${URL}#/compose`);
  await page.waitForSelector('text=骨架加槽');
  await shot(page, size, '44-compose-hub');
  await page.goto(`${URL}#/compose/slots`);
  await page.waitForSelector('.slot');
  await shot(page, size, '45-compose-slot');
  for (let g = 0; g < 80; g++) {
    if (await page.getByText('这一组练完了').count()) break;
    if (await has(page, /下一句 →/)) await click(page, /下一句 →/);
    else if (await page.locator('.choice:not([disabled])').count()) await page.locator('.choice:not([disabled])').first().click();
    else await page.waitForTimeout(60);
    await page.waitForTimeout(40);
  }
  await page.goto(`${URL}#/compose/arrange`);
  await page.waitForSelector('.answer-line');
  await shot(page, size, '46-compose-arrange');
  const n = await page.locator('.chunks .chunk').count();
  for (let pos = 0; pos < n; pos++) {
    const bank = page.locator('.chunks .chunk:not([disabled])');
    const m = await bank.count();
    let placed = false;
    for (let k = 0; k < m && !placed; k++) {
      await page.locator('.chunks .chunk:not([disabled])').nth(k).click();
      await click(page, '检查').catch(() => undefined);
      const last = page.locator('.answer-line .chunk').last();
      if ((await last.getAttribute('class'))?.includes('ok') || await page.locator('.right-text').count()) placed = true;
      else await last.click();
    }
    if (!placed) failures.push(`${size.name}: could not solve arrange puzzle at position ${pos}`);
  }
  if (!(await page.locator('.right-text').count())) failures.push(`${size.name}: arrange puzzle not marked solved`);
  await shot(page, size, '47-compose-arrange-solved');
  // 错 → 对
  await page.goto(`${URL}#/fixes`);
  await page.waitForSelector('text=这句英文有问题');
  await click(page, '看答案');
  await shot(page, size, '40-fixes');
  // reference
  await page.goto(`${URL}#/reference`);
  await page.waitForSelector('text=量词');
  await shot(page, size, '41-reference');

  // settings: feedback export + progress export/import round trip
  await page.goto(`${URL}#/settings`);
  await page.waitForSelector('text=耳朵复核反馈');
  await shot(page, size, '42-settings-full');
  const [fbDl] = await Promise.all([page.waitForEvent('download'), click(page, /导出反馈清单/)]);
  const fbPath = `${outDir}/_fb-${size.name}.json`;
  await fbDl.saveAs(fbPath);
  const fb = JSON.parse((await import('node:fs')).readFileSync(fbPath, 'utf8'));
  if (!fb.length || fb[0].verdict !== 'heard' || fb[0].note !== '测试备注') failures.push(`${size.name}: feedback export wrong ${JSON.stringify(fb[0])}`);
  rmSync(fbPath);
  const [dl] = await Promise.all([page.waitForEvent('download'), click(page, /导出进度/)]);
  const bPath = `${outDir}/_backup-${size.name}.json`;
  await dl.saveAs(bPath);
  const before = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('englishlab'); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv').get('vocab'); t.onsuccess = () => res(JSON.stringify(t.result)); }; }));
  // wipe progress on this "device", then import the file back
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('englishlab'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').delete('vocab'); t.objectStore('kv').delete('progress'); t.oncomplete = () => res(true); }; }));
  await page.setInputFiles('#backup-file', bPath);
  await page.waitForSelector('text=今天要做的事');
  const after = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('englishlab'); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv').get('vocab'); t.onsuccess = () => res(JSON.stringify(t.result)); }; }));
  if (before !== after) failures.push(`${size.name}: progress export/import round trip changed the data`);
  rmSync(bPath);
  await page.goto(`${URL}#/`);
  await page.waitForSelector('text=粤英夹杂词库');
  await shot(page, size, '43-home-with-vocab');
  if (errors.length) failures.push(`${size.name}: vocab page errors ${errors.join(';')}`);
  await ctx.close();
}

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h }, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1, acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('#app .screen');
  await shot(page, size, '01-no-content');

  await page.setInputFiles('#content-file', content);
  await page.waitForSelector('text=第一次打开');
  await shot(page, size, '02-onboarding');
  await click(page, '开始使用');
  await page.waitForSelector('text=开始今天的课');
  await shot(page, size, '03-home');

  await page.goto(`${URL}#/script/self_intro`);
  await page.waitForSelector('.sec-list');
  await shot(page, size, '04-script-self-intro');

  await learnWholeSection(page, size, 1, true);
  await shot(page, size, '05-section-done');
  await click(page, /接着连说/);
  await page.waitForSelector('.recall-body');
  await shot(page, size, '06-chain');

  await page.goto(`${URL}#/script/speech_4104`);
  await page.waitForSelector('.sec-list');
  await shot(page, size, '07-script-4104');
  await page.goto(`${URL}#/script/speech_4104/rescue`);
  await page.waitForSelector('.rescue, .screen');
  await shot(page, size, '08-rescue');
  await page.goto(`${URL}#/script/self_intro/checklist`);
  await page.waitForSelector('.screen');
  await shot(page, size, '09-checklist');
  await page.goto(`${URL}#/hard`);
  await page.waitForSelector('.en-huge');
  await shot(page, size, '10-hard-words');
  await page.goto(`${URL}#/settings`);
  await page.waitForSelector('text=内容包');
  await shot(page, size, '11-settings');

  // progress persists across reload
  await page.goto(`${URL}#/script/self_intro`);
  await page.reload();
  await page.waitForSelector('.sec-list');
  if (!(await page.getByText('会了', { exact: true }).count())) failures.push(`${size.name}: progress not kept after reload`);

  if (size.name === 'desktop-1366') {
    // offline: service worker must have cached the app
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.waitForTimeout(800);
    await page.reload();
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('.screen', { timeout: 8000 }).catch(() => failures.push('offline reload failed'));
    await shot(page, size, '12-offline');
    await ctx.setOffline(false);
  }
  if (errors.length) failures.push(`${size.name}: page errors ${errors.join(' ; ')}`);
  await ctx.close();
  await vocabFlow(size);
  await sessionFlow(size, 30, null);
  if (size.name === 'desktop-1366') await sessionFlow({ ...size, name: 'desktop-1366-ff' }, 60, 4);
}
await browser.close();
server.kill();
void writeFileSync;
if (failures.length) { console.error('E2E FAILURES:\n' + failures.join('\n')); process.exit(1); }
console.log(`E2E OK — screenshots in ${outDir}`);
