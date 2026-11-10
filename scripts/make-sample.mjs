// Generates public/sample-content.json — a small FICTIONAL pack for the public repo (no private content).
import { writeFileSync } from 'node:fs';
const S = (no, section_no, section, en, zh, chunks, cue, blank_keys = [], extra = {}) => ({ no, section_no, section, en, zh, chunks: chunks.map(([e, z]) => ({ en: e, zh: z })), cue, blank_keys, ...extra });
const pack = {
  meta: { title: '示例内容包（虚构，仅用于试用）', built: '2026-01-01', counts: { total: 6 } },
  parts: { school: '学校', workplace: '职场', bim: 'BIM' },
  groups: [
    { id: 'g1', part: 'school', title: '一、示例：课堂', intro: '这是虚构示例组：课堂上的词。', item_type: 'word' },
    { id: 'g2', part: 'workplace', title: '二、示例：办公室', intro: '这是虚构示例组：办公室里的词。', item_type: 'word' },
    { id: 'g3', part: 'workplace', title: '三、示例：常用句', intro: '这是虚构示例组：邮件常用句。', item_type: 'sentence' },
  ],
  items: [
    ...[['apple', '苹果', true], ['river', '河', false], ['window', '窗', false], ['garden', '花园', true], ['bridge', '桥', false]].map(([en, zh, verified], i) => (
      { no: i + 1, group: 'g1', part: 'school', type: 'word', en, zh, verified, note: i === 0 ? '示例备注' : '', example_yue_mixed: `我哋見到一個 ${en}。`, example_zh: `我们看到一个${zh}。` })),
    ...[['chair', '椅子'], ['lamp', '灯'], ['basket', '篮子'], ['ticket', '票'], ['mirror', '镜子']].map(([en, zh], i) => (
      { no: 101 + i, group: 'g2', part: 'workplace', type: 'word', en, zh, verified: false, note: '', example_yue_mixed: `呢個 ${en} 好靚。`, example_zh: `这个${zh}很漂亮。`, example_from_dictionary: i === 0 })),
    { no: 201, group: 'g3', part: 'workplace', type: 'sentence', en: 'Dear friend,', zh: '开头：写给朋友时用', verified: false, note: '', example_en: 'Dear friend, I hope you are well.', example_zh: '亲爱的朋友，希望你一切都好。' },
    { no: 202, group: 'g3', part: 'workplace', type: 'sentence', en: 'Warm wishes,', zh: '结尾：写给朋友的结束语', verified: false, note: '', example_en: 'Warm wishes, Sam', example_zh: '祝福你，Sam' },
  ],
  images: { 'school-1': { src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23345"/><text x="160" y="100" font-size="40" fill="%23fd8" text-anchor="middle">示例图</text></svg>', credit: '示例图（虚构，仅用于演示出处显示）' } },
  scenes: { 'school-5': '一座连着河两岸的桥。' },
  cantonese_glossary: [{ yue: '我哋', zh: '我们' }],
  cantonese_classifiers: [{ classifier: '隻', used_for: '小动物', example: '一隻貓' }],
  bim_flow: [{ stage: '1 示例', what: '示例步骤', terms: 'ABC' }],
  grammar_fixes: [{ wrong: 'He go to school.', right: 'He goes to school.', why: '主语是 he / she / it 时，动词要加 s' }],
  real_tasks: {
    _readme: '虚构示例',
    method: { steps: ['1 先看懂', '2 分块读', '3 抓线索', '4 拿走提示', '5 出声练'], spaced_review_days: [0, 1, 3, 6] },
    self_intro: {
      title: '示例自我介绍（虚构）', goal: 'verbatim', used_for: '示例', skeleton_steps: { 1: '打招呼', 2: '说名字' },
      sections: [{ no: 1, name: '开场', meaning: '打招呼', sentence_nos: [1, 2] }, { no: 2, name: '我是谁', meaning: '名字和学校', sentence_nos: [3, 4] }],
      sentences: [
        S(1, 1, '开场', 'Hello there.', '你好呀。', [['Hello there.', '你好呀。']], 'Hello'),
        S(2, 1, '开场', 'It is nice to meet you all.', '很高兴见到大家。', [['It is nice', '很高兴'], ['to meet', '见到'], ['you all.', '大家。']], 'nice … meet', ['nice', 'meet']),
        S(3, 2, '我是谁', 'I am Sam Example.', '我是 Sam Example。', [['I am', '我是'], ['Sam Example.', 'Sam Example。']], 'I am', ['am']),
        S(4, 2, '我是谁', 'I study at a small college.', '我在一所小学院读书。', [['I study', '我读书'], ['at a small college.', '在一所小学院。']], 'study … college', ['study', 'college']),
      ],
      vocab: [{ en: 'college', zh: '学院' }], preps: [{ phrase: 'at a small college', word: 'at', idea: '一个点（学校）' }], grammar: [],
      confirm_with_user: [{ where: '第 3 句', what: '名字', action: '确认名字拼写。' }],
    },
    speech_4104: {
      title: '示例演讲（虚构）', goal: 'as_much_as_possible', used_for: '示例',
      sections: [{ no: 1, name: '开场', meaning: '打招呼', sentence_nos: [1, 2] }, { no: 2, name: '主题', meaning: '讲主题', sentence_nos: [3, 4] }],
      sentences: [
        S(1, 1, '开场', 'Hello, friends.', '朋友们好。', [['Hello,', '你好，'], ['friends.', '朋友们。']], 'Hello, friends'),
        S(2, 1, '开场', 'Today we will talk about paper boats.', '今天我们讲纸船。', [['Today we will talk', '今天我们讲'], ['about paper boats.', '纸船。']], 'talk … boats'),
        S(3, 2, '主题', 'Many rivers are quiet in the morning.', '很多河流早上很安静。', [['Many rivers', '很多河流'], ['are quiet in the morning.', '早上很安静。']], 'rivers … quiet', [], { note: '示例备注' }),
        S(4, 2, '主题', 'Could we race them for fun?', '我们能不能让它们比赛玩玩？', [['Could we race', '我们能不能让…比赛'], ['them for fun?', '它们，玩玩？']], 'Could … fun'),
      ],
      numbers: [{ written: '12 minutes', spoken: 'twelve minutes', where: '示例' }],
      fallback_simple_words: [{ script: 'enormous', say_instead: 'big', note: '示例' }], vocab: [], preps: [], grammar: [], confirm_with_user: [],
    },
    hard_words_for_read_aloud: ['Example', 'garden', 'bridge'],
  },
};
writeFileSync(new URL('../public/sample-content.json', import.meta.url), JSON.stringify(pack, null, 1));
console.log('sample written');
