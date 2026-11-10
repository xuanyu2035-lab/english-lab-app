/** Plain-language help page: how the app works, and how to get a more natural American voice on each device. */
import { topbar } from './practice';
import { h, mount } from '../ui';

const root = () => document.getElementById('app')!;

/** One block per device, also used in docs/使用说明.md (keep the two in step). */
export const VOICE_HELP: { title: string; steps: string[] }[] = [
  {
    title: 'iPad / iPhone（Safari）',
    steps: [
      '打开 设置 → 辅助功能 → 朗读内容 → 声音 → 英语。',
      '选 “English (United States)”（美国英语），在里面找名字后面带 “增强版 / Enhanced” 或 “高级 / Premium” 的声音（比如 Ava、Samantha、Evan），点它右边的下载图标，等它下载完。',
      '回到 EnglishLab：设置 → 声音，列表里会出现新下载的声音，点“试听”，满意就点“用这个”。',
    ],
  },
  {
    title: '安卓手机 / 平板（Chrome）',
    steps: [
      '打开 设置 → 系统（或“更多设置”）→ 语言和输入 → 文字转语音（TTS）输出。',
      '“首选引擎”选 “Google 语音服务（Speech Services by Google）”，点旁边的齿轮 → 安装语音数据 → English (United States) / 英语（美国），下载你喜欢的美式声音。',
      '回到 Chrome 里的 EnglishLab，关掉再重新打开一次；设置 → 声音 里就会看到新的声音，试听后选一个。菜单名字在不同品牌手机上会略有不同。',
    ],
  },
  {
    title: 'Windows 电脑',
    steps: [
      '最推荐：用 Microsoft Edge 浏览器打开 EnglishLab。Edge 自带一批名字里带 “Natural” 的美式在线声音（例如 Aria、Jenny、Guy），听起来最自然；需要联网。',
      '想用 Chrome 或不联网：打开 设置 → 时间和语言 → 语音 → 管理语音（或“添加语音”）→ 选 English (United States) 下载。',
      '回到 EnglishLab：设置 → 声音 → 试听几个，选一个“美国英语（en-US）”的。没有 Natural 的声音时，用名字里带 US English 的也可以。',
    ],
  },
];

export function renderHelp() {
  mount(root(), topbar('帮助', '/more'),
    h('div', { class: 'screen narrow' },
      h('h3', {}, '怎么用（很简单）'),
      h('div', { class: 'card' },
        h('ul', { class: 'help-list' },
          h('li', {}, '首页只有两篇稿子：自我介绍、4104 演讲。点进去，想练哪一节、哪一句都由你选。'),
          h('li', {}, '每一句、每一节都可以直接跳到任意一级：全文、挖空、只看线索、什么都不看。'),
          h('li', {}, '觉得某一句或某一节已经会了，点“我会了”：先做一次“什么都不看”的测试，说得出来就记为已会，以后少复习；说不出来就退回去练。'),
          h('li', {}, '朗读、录音、休息、总结都可以跳过。“今日推荐”只是建议。'),
          h('li', {}, '词库、造句、一节课、设置都在右上角“更多”里。'))),
      h('h3', {}, '让声音更自然（美式英语）'),
      h('p', { class: 'muted small' }, '应用默认用美式英语（en-US），并自动优先选名字里带 Natural、Neural、Enhanced、Premium 的声音。声音是设备自带的，装得越好听越自然。到 设置 → 声音 可以逐个试听并选一个，还能调语速（0.6–1.2 倍）和每句重复次数。'),
      ...VOICE_HELP.map((d) => h('div', { class: 'card' }, h('div', { class: 'card-title' }, d.title),
        h('ol', { class: 'help-list' }, d.steps.map((s) => h('li', {}, s))))),
      h('p', { class: 'muted small' }, '没有声音或列表是空的？先点一下页面里的“🔊 听”，再回设置刷新；如果还是没有，说明这台设备没有装英文声音，按上面的步骤下载一个。')));
}
