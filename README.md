# EnglishLab 粤英学习舱

手机 / 平板 / 电脑都能打开的学习网页应用（PWA，可添加到主屏幕、可离线）。
先练**面试自我介绍**和**4104 演讲开头**（背稿），再学**香港校园/职场/BIM 粤英夹杂词库**。

- 本仓库只含程序和一个**虚构**的示例内容包（`public/sample-content.json`）。
- 真正的内容包（`content.json`）是私有的，不在仓库里；在应用的“设置 → 导入内容包”里导入，数据只保存在你自己的设备上。
- 接手 / 修改请先读 [`docs/HANDOFF.md`](docs/HANDOFF.md)；使用方法见 [`docs/使用说明.md`](docs/使用说明.md)。

网址：https://xuanyu2035-lab.github.io/english-lab-app/

## 在本机使用

双击 `打开EnglishLab.cmd`（需要 Node.js），浏览器会打开 http://localhost:4173/ 。`npm run pack` 生成可搬走的 `EnglishLab-便携版/`。

## 开发

```bash
npm install
npm run dev        # 本地开发
npm test           # 单元测试
npm run build      # 构建到 dist/
npm run test:e2e   # Playwright 三种尺寸截图检查（需先 npx playwright install chromium）
```
