# HANDOFF — 接手须知（给以后的人或 AI）

## 先读什么（按顺序）
1. `README.md`（一分钟看懂是什么）
2. 本文件
3. `docs/QUESTIONS.md`（还没确认的事项）
4. `docs/最终汇报.md`（做到了哪一步、已知问题）
5. 原始任务书（不在仓库里，在 Owner 的 `D:\EnglishLab\EnglishLab_ClaudeCode任务书_v1.md`）

## 它是什么
纯前端 PWA：Vite + TypeScript + 原生 DOM（没有框架），唯一运行时依赖是 `ts-fsrs`（词库复习算法）。
没有服务器、账号、统计、AI 接口、密钥。数据全部在浏览器 IndexedDB 里（进度、设置、内容包、录音）。
**公开仓库只含程序和一个虚构示例（`public/sample-content.json`）；真实内容包在 `private/`，已被 `.gitignore`，永远不提交。**

## 目录
```
src/
  types.ts        数据类型、默认设置、ID 规则（句子 self_intro-<no> / speech_4104-<no>，词条 part-no）
  content.ts      内容包校验（不改任何文字）、挖空/首字母辅助
  schedule.ts     背稿的级别阶梯 L1→L4、复习 0/1/3/6 天、倒计时、冲刺模式
  vocab.ts        词库：FSRS 两键评分、每日上限与顺延、复习题型、粤语小词典分词
  compose.ts      造句：骨架加槽、拼句（纯函数）
  plan.ts         一节课怎么排（30/60/90/120 分钟、冲刺版）
  db.ts store.ts  IndexedDB 封装 / 内存状态（kv：settings、progress、content、vocab）
  backup.ts       导出/导入进度（不含内容包与录音）
  media.ts noise.ts  朗读(Web Speech)、录音(MediaRecorder)、背景声(Web Audio)
  sessionHooks.ts 练习页与“一节课”之间的小桥
  screens/        各页面（home、practice、session、vocab、fixes、compose、reference、extras、settings）
scripts/          make-sample / make-icons / fetch-images / contact-sheet / build-pack / make-pdf / e2e-screenshots
tests/            vitest 单元测试（私有内容相关的测试在 private/ 不存在时自动跳过）
docs/             使用说明（md+pdf）、HANDOFF、QUESTIONS、最终汇报、screenshots（只含虚构示例的截图）
.github/workflows/deploy.yml   推送到 main 后测试、构建并发布到 GitHub Pages
打开EnglishLab.cmd / 打开EnglishLab(手机也能连).cmd   双击启动（scripts/serve.mjs）
EnglishLab-便携版/              npm run pack 生成的可搬走文件夹（已 .gitignore）
```
路由是 `#/...` 哈希路由（见 `src/main.ts`），所以放在任何静态托管的子路径下也不会 404。

## 常用命令
```bash
npm install
npm run dev          # 本地开发
npm test             # 单元测试（含私有内容检查，如果 private/ 在）
npm run build        # tsc 类型检查 + 构建到 dist/
npm run test:e2e     # 先构建，再用 Playwright 在 360×800 / 390×844 / 820×1180 / 1366×768 走全流程并截图
node scripts/e2e-screenshots.mjs --private --no-build   # 用真实内容包跑（截图在 screenshots-private/，已忽略）
```
首次跑 e2e 前：`npx playwright install chromium`。

## 怎么改内容（Owner 不需要改代码）
- 内容包是一个 JSON：`items`、`groups`、`cantonese_glossary`、`cantonese_classifiers`、`bim_flow`、`grammar_fixes`、`real_tasks`。
- 额外两个可选顶层键随内容包走：`images`（词条 ID → `{src: data URL, credit}`）和 `scenes`（词条 ID → 一句核心画面）。
- **只在末尾追加新条目，不改旧编号**（进度按 ID 保存）。**不要让程序改写 Owner 的原文**（稿子的 en/zh/cue/blank_keys、词条文字）。
- 重新生成带图的包：`node scripts/build-pack.mjs` → `private/content-full.json`；到每台设备“设置 → 导入内容包”。
- 配图流程：`scripts/fetch-images.mjs` 只从 Wikimedia Commons 取 CC0 / 公有领域 / CC BY / CC BY-SA 的图，写入 `private/images/` 和 `credits.json`；用 `scripts/contact-sheet.mjs` 生成总览图**人工核对图与词义一致**后再 build。拿不准的不配，记进 QUESTIONS.md。

## 运行与发布
- **线上**：公开仓库 `english-lab-app`，推送到 `main` 后由 GitHub Actions（`.github/workflows/deploy.yml`）自动 `npm ci` → `npm test` → `npm run build` → 发布 `dist/` 到 GitHub Pages：https://xuanyu2035-lab.github.io/english-lab-app/ 。第一次需要在仓库 Settings → Pages 把 Source 设为 “GitHub Actions”。
- **本机**：双击 `打开EnglishLab.cmd` → `scripts/serve.mjs` 用固定端口 4173 提供 `dist/`（端口固定，因为浏览器数据绑定“地址”）。没有 `dist/` 时会先 `npm install` + `npm run build`。`打开EnglishLab(手机也能连).cmd` 带 `--lan`，同一个 Wi-Fi 下手机可连（非 https，iPad 上不能离线/录音）。
- **可搬走的构建**：`npm run pack` → `EnglishLab-便携版/`（`app/` 只含程序，无个人内容，已 .gitignore）。
- `vite.config.ts` 里 `base: './'`、哈希路由，放在任何静态托管的子路径下都能用。
- **隐私约定（重要）**：这个仓库是公开的，**只能**含程序和虚构示例。真实稿子、词库、照片、拆解记忆本 PDF、内容包、待确认细节，一律放在本机 `private/`（已 .gitignore），**不能提交**，也不要在文档、测试、示例里引用它们的原文。提交作者用 GitHub 的 noreply 隐私邮箱，不要用个人邮箱。

## 设计上的约定（别随手改）
- 背稿完全按 Owner 的方法：先看懂 → 分块读 → 抓线索 → 拿走提示 L1–L4 → 出声练（自评“顺/卡了一下/说不出来”，不打分）。L2.5 首字母提示默认关，需 Owner 批准后才在设置里打开。4104 没有 blank_keys，L2 自动跳过，不自己编挖空词。
- 稿子复习 = 学会后的 0/1/3/6 天；词库 = FSRS 两键（记得/忘了）；每日上限（新 10 / 复习 40）超出顺延，**不做“欠债”提醒**。
- 视觉：夜读/晨读两套配色见 `src/style.css` 顶部变量；按钮最小 48px；动画只有淡入淡出，系统开启“减少动画”时关闭。
- 无账号、无统计、无外部请求（唯一联网是首次加载程序本身）。

## 已知限制
见 `docs/最终汇报.md` 的“已知问题”。

## 第二轮改动（自由选择 + 美式声音）
- 首页只放两篇稿子；其余入口在 `src/screens/more.ts`（#/more），帮助页 `src/screens/help.ts`（#/help）。
- 学一节：路由 `#/script/<id>/learn/<节>/<起始句号>/<级别>`（后两项可省略；级别 understand|L1|L2|L3|L4）。跳级条、“我会了”（`knowTest`，复用 chainRun 的 testMode）都在 `screens/practice.ts`。
- “我会了”通过且整节首次学会 → `SectionProgress.known = true`，复习只剩 offsets 的最后两项（`schedule.offsetsFor`）。
- 声音：`media.ts` 的 `voiceScore/listEnglishVoices/chooseEnglishVoice`（美式优先，Natural/Neural/Enhanced/Premium 优先，英式最后）；设置项 `voiceURI / speechRate / repeatCount`；`main.ts` 里 `configureSpeech` 接上设置。整句朗读用 `speakSentence`（按重复次数）。
- 测试：`tests/freedom.test.ts`；e2e 的 `freedomFlow / voiceFlow`（用假的语音引擎）。
