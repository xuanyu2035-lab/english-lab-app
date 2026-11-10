// Dev-time helper: downloads real photos for concrete vocabulary words from Wikimedia Commons
// (only CC0 / public domain / CC BY / CC BY-SA), resizes via Commons' thumbnail service (width 640),
// and records the source, author and licence of every image.
// Output goes to private/images/ (git-ignored; images travel with the private content pack).
//   node scripts/fetch-images.mjs            (needs network; safe to re-run, skips existing files)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const OUT = 'private/images';
mkdirSync(OUT, { recursive: true });
const UA = 'EnglishLab-personal-study-app/1.0 (educational, non-commercial)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?|CC BY(-SA)? \d(\.\d)? [A-Za-z]+)/i;

// item id (part-no) → search words, kept in private/image-wanted.json (it names the Owner's vocabulary, so it is not in the repo).
// Only things you can SEE; abstract words get a "scene" sentence instead.
import { readFileSync as read } from 'node:fs';
const WANTED = JSON.parse(read('private/image-wanted.json', 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

async function search(q) {
  const u = new URL(API);
  Object.entries({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '12',
    gsrsearch: `${q} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640',
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  let res;
  for (let a = 0; a < 5; a++) {
    res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.status !== 429) break;
    await sleep(8000 * (a + 1));
  }
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
}

const credits = existsSync(`${OUT}/credits.json`) ? JSON.parse(readFileSync(`${OUT}/credits.json`, 'utf8')) : {};
const candidates = {};
for (const [id, q] of Object.entries(WANTED)) {
  if (credits[id] && existsSync(`${OUT}/${id}.jpg`)) continue;
  try {
    const pages = await search(q);
    const good = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime) || ii.width < 500) continue;
      const md = ii.extmetadata ?? {};
      const lic = strip(md.LicenseShortName?.value);
      if (!OK_LICENSE.test(lic)) continue;
      if (/nsfw|nude|sex/i.test(strip(md.Categories?.value) + p.title)) continue;
      good.push({
        title: p.title, thumb: ii.thumburl, page: ii.descriptionurl, original: ii.url, license: lic,
        license_url: strip(md.LicenseUrl?.value), author: strip(md.Artist?.value) || 'unknown',
      });
    }
    candidates[id] = good.slice(0, 4);
    const pick = good[0];
    if (!pick) { console.log(`✗ ${id} "${q}": no usable licensed photo`); continue; }
    const img = await fetch(pick.thumb, { headers: { 'User-Agent': UA } });
    if (!img.ok) { console.log(`✗ ${id} download ${img.status}`); continue; }
    writeFileSync(`${OUT}/${id}.jpg`, Buffer.from(await img.arrayBuffer()));
    credits[id] = { query: q, title: pick.title, source: pick.page, author: pick.author, license: pick.license, license_url: pick.license_url, original: pick.original };
    console.log(`✓ ${id} "${q}" → ${pick.title} [${pick.license}]`);
  } catch (e) {
    console.log(`✗ ${id} ${e.message}`);
  }
  await sleep(2500);
}
writeFileSync(`${OUT}/credits.json`, JSON.stringify(credits, null, 1));
writeFileSync(`${OUT}/candidates.json`, JSON.stringify(candidates, null, 1));
console.log(`done: ${Object.keys(credits).length} images`);
