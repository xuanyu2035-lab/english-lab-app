@echo off
chcp 65001 >nul
title EnglishLab（手机也能连）- 关闭这个窗口就会停止
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "dist\index.html" goto run

echo 第一次使用：正在准备程序，需要几分钟，请等一下...
if not exist "node_modules" call npm install
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail

:run
echo.
echo 提示：Windows 可能会弹出“防火墙”窗口，选“专用网络 / 允许”才能让手机连上。
echo 手机和这台电脑要连同一个 Wi-Fi。
echo.
node scripts\serve.mjs dist 4173 --lan
goto end

:nonode
echo 这台电脑还没有安装 Node.js。
echo 请先安装 Node.js（LTS 版本，https://nodejs.org ），装好后再双击这个文件。
goto end

:fail
echo 准备程序时出错了，请把上面的文字截图给帮你的人。

:end
pause
