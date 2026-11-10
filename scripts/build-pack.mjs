// Builds the private, ready-to-import pack: private/content-full.json
//   = private/content.json (untouched)  +  images (private/images/*.jpg, as data URLs)  +  scenes (private/scenes.json)
// The original items / real_tasks are copied as-is; extras live in separate top-level keys.
//   node scripts/build-pack.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const base = JSON.parse(readFileSync('private/content.json', 'utf8'));
const pack = { ...base };
const ids = new Set(base.items.map((i) => `${i.part}-${i.no}`));

if (existsSync('private/images/credits.json')) {
  const credits = JSON.parse(readFileSync('private/images/credits.json', 'utf8'));
  pack.images = {};
  for (const [id, c] of Object.entries(credits)) {
    const file = `private/images/${id}.jpg`;
    if (!ids.has(id) || !existsSync(file)) continue;
    const buf = readFileSync(file);
    const mime = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
    const name = String(c.title ?? '').replace(/^File:/, '');
    pack.images[id] = {
      src: `data:${mime};base64,${buf.toString('base64')}`,
      credit: `照片：${c.author} · ${c.license} · Wikimedia Commons「${name.slice(0, 60)}」`,
    };
  }
}
if (existsSync('private/scenes.json')) {
  const scenes = JSON.parse(readFileSync('private/scenes.json', 'utf8'));
  pack.scenes = Object.fromEntries(Object.entries(scenes).filter(([id]) => ids.has(id)));
}
writeFileSync('private/content-full.json', JSON.stringify(pack));
console.log(`content-full.json: ${Object.keys(pack.images ?? {}).length} photos, ${Object.keys(pack.scenes ?? {}).length} scene lines, ${(JSON.stringify(pack).length / 1e6).toFixed(2)} MB`);
