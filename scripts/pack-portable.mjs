// Builds the app and packs a movable folder:  D:\EnglishLab\EnglishLab-便携版\
//   app\            ← the built website (static files; contains NO personal content)
//   serve.mjs       ← tiny local server (needs Node.js on the other computer)
//   打开EnglishLab.cmd / 打开EnglishLab(手机也能连).cmd
//   先读我.txt
//   node scripts/pack-portable.mjs [--no-build]
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.argv.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
if (!existsSync('dist/index.html')) throw new Error('dist/ not found — build failed?');
const out = resolve('EnglishLab-便携版');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist', `${out}/app`, { recursive: true });
cpSync('scripts/serve.mjs', `${out}/serve.mjs`);

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const launcher = (lan) => crlf(`@echo off
chcp 65001 >nul
title EnglishLab${lan ? '（手机也能连）' : ''} - 关闭这个窗口就会停止
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
${lan ? 'echo 提示：Windows 可能会弹出“防火墙”窗口，选“专用网络 / 允许”。手机和电脑要连同一个 Wi-Fi。\necho.\n' : ''}node serve.mjs app 4173${lan ? ' --lan' : ''}
goto end
:nonode
echo 这台电脑还没有安装 Node.js。
echo 请先安装 Node.js（LTS 版本，https://nodejs.org ），装好后再双击这个文件。
:end
pause
`);
writeFileSync(`${out}/打开EnglishLab.cmd`, launcher(false));
writeFileSync(`${out}/打开EnglishLab(手机也能连).cmd`, launcher(true));
writeFileSync(`${out}/先读我.txt`, crlf(`EnglishLab 便携版
==================

这个文件夹可以整个复制到别的电脑、U 盘或云盘。

1. 在电脑上用：双击「打开EnglishLab.cmd」（电脑要装 Node.js，https://nodejs.org ，选 LTS 版本）。
   浏览器会自动打开 http://localhost:4173/ 。关闭黑色窗口 = 停止。
2. 手机/平板在同一个 Wi-Fi 下临时看：双击「打开EnglishLab(手机也能连).cmd」，
   窗口里会显示手机要输入的地址。
3. 想长期在 iPad/手机上用（可添加到主屏幕、可离线、可录音）：
   需要把 app 文件夹放到一个 https 网址上，详见 EnglishLab\\docs\\最终汇报.md 里的“以后想在 iPad 和手机上用”。

重要：
- app 文件夹里只有程序，没有你的稿子和词库。你的内容包（content-full.json）要在每台设备的
  “设置 → 导入内容包”里自己导入；不要把内容包放进 app 文件夹，也不要上传到公开的地方。
- 学习进度保存在浏览器里（地址 http://localhost:4173），换浏览器或换电脑要用“设置 → 导出/导入进度”搬。
`));
const n = readdirSync(`${out}/app`).length;
console.log(`便携版已生成：${out}（app 里 ${n} 项）`);
