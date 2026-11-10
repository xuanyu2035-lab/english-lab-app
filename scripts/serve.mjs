// Tiny dependency-free static server for the built app (used by the double-click launcher).
//   node scripts/serve.mjs [folder=dist] [port=4173] [--lan] [--no-open]
// The port is fixed on purpose: browser data (progress, imported content) belongs to the address
// http://localhost:4173 — a different port would look like an empty app.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const root = resolve(args[0] ?? 'dist');
const port = Number(args[1] ?? 4173);
const lan = flags.has('--lan');
const open = !flags.has('--no-open') && !process.env.ENGLISHLAB_NO_OPEN;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('forbidden'); return; }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
    const ext = extname(file);
    const noCache = /(^|[\\/])(sw\.js|index\.html|registerSW\.js|manifest\.webmanifest)$/.test(file);
    res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': noCache ? 'no-cache' : 'public, max-age=3600' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500).end('error');
  }
});

function openBrowser(url) {
  if (!open) return;
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    // already running? then just open the browser
    try {
      const txt = await (await fetch(`http://localhost:${port}/`)).text();
      if (txt.includes('EnglishLab')) { console.log(`EnglishLab 已经在运行：http://localhost:${port}/`); openBrowser(`http://localhost:${port}/`); process.exit(0); }
    } catch { /* fall through */ }
    console.error(`端口 ${port} 被别的程序占用了。请关掉占用它的程序后再试（换端口会让学习进度“看起来丢失”，所以这里不自动换）。`);
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});

server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log('============================================');
  console.log(' EnglishLab 已启动');
  console.log(` 本机地址： ${url}`);
  if (lan) {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    ips.forEach((ip) => console.log(` 手机/平板（同一个 Wi-Fi）： http://${ip}:${port}/`));
  }
  console.log(' 关闭这个窗口，就会停止 EnglishLab（学习进度保存在浏览器里，不会丢）。');
  console.log('============================================');
  openBrowser(url);
});
