export type ScriptId = 'self_intro' | 'speech_4104';
export const SCRIPT_IDS: ScriptId[] = ['self_intro', 'speech_4104'];

export interface Chunk { en: string; zh: string }
export interface Sentence {
  no: number;
  section_no: number;
  section: string;
  en: string;
  zh: string;
  chunks: Chunk[];
  cue: string;
  blank_keys: string[];
  note?: string;
  skeleton_step?: number;
  skeleton_label?: string;
}
export interface Section { no: number; name: string; meaning: string; sentence_nos: number[] }
export interface VocabRef { en: string; zh: string }
export interface Script {
  title: string;
  goal: string;
  used_for: string;
  sections: Section[];
  sentences: Sentence[];
  vocab?: VocabRef[];
  preps?: { phrase: string; word: string; idea: string }[];
  grammar?: { pattern: string; plain: string }[];
  confirm_with_user?: { where: string; what: string; action: string }[];
  skeleton_steps?: Record<string, string>;
  numbers?: { written: string; spoken: string; where: string }[];
  fallback_simple_words?: { script: string; say_instead: string; note: string }[];
}
export interface RealTasks {
  method: { steps: string[]; spaced_review_days: number[]; levels_self_intro?: string[] };
  self_intro: Script;
  speech_4104: Script;
  hard_words_for_read_aloud: string[];
}
export interface Item {
  no: number;
  group: string;
  part: string;
  type: 'word' | 'sentence' | string;
  en: string;
  zh: string;
  verified: boolean;
  note?: string;
  example_yue_mixed?: string;
  example_zh?: string;
  example_en?: string;
  example_from_dictionary?: boolean;
}
export interface Group { id: string; part: string; title: string; intro: string; item_type: string }
export interface ContentPack {
  meta?: { title?: string; built?: string; [k: string]: unknown };
  parts?: Record<string, string>;
  groups: Group[];
  items: Item[];
  cantonese_glossary: { yue: string; zh: string }[];
  cantonese_classifiers: { classifier: string; used_for: string; example: string }[];
  bim_flow: { stage: string; what: string; terms: string }[];
  grammar_fixes: { wrong: string; right: string; why: string }[];
  real_tasks: RealTasks;
  /** optional extras that travel with the content pack (built by scripts/build-pack.mjs) */
  images?: Record<string, { src: string; credit: string }>;
  scenes?: Record<string, string>;
}

export type Rating = 'smooth' | 'stuck' | 'blank';

export interface SentenceProgress {
  level: number; // 1..4 : the level to practise next
  passedL4: boolean;
  last?: Rating;
  n: number; // number of ratings
}
export interface SectionProgress {
  learnedDay?: string; // YYYY-MM-DD when every sentence first passed L4
  reviews: Record<string, string>; // offset -> date done
  known?: boolean; // marked "I know it" and passed the no-peek test: fewer reviews
  chainDay?: string;
}
export interface Progress {
  sentences: Record<string, SentenceProgress>;
  sections: Record<string, SectionProgress>;
  fullRuns: Record<string, string[]>;
  checklist: Record<string, boolean>;
}
export interface Settings {
  interviewDate: string | null; // null = "还不知道"
  presentDate: string | null;
  setupDate: string; // the day settings were first saved (for default 14-day countdown)
  minutes: 30 | 60 | 90 | 120;
  theme: 'night' | 'morning' | 'auto';
  firstLetterHint: boolean; // L2.5, default off
  noise: 'off' | 'white' | 'brown'; // background sound
  immersive: boolean; // immersive mode during a session
  onboarded: boolean;
  newWordsPerDay: number;
  reviewsPerDay: number;
  /** chosen English voice (voiceURI); null = automatic (US English, prefers Natural/Neural/Enhanced/Premium) */
  voiceURI: string | null;
  speechRate: number; // 0.6 .. 1.2
  repeatCount: number; // times each sentence is read aloud, 1 .. 5
}
export const DEFAULT_SETTINGS: Settings = {
  interviewDate: null,
  presentDate: null,
  setupDate: '',
  minutes: 60,
  theme: 'night',
  firstLetterHint: false,
  noise: 'off',
  immersive: true,
  onboarded: false,
  newWordsPerDay: 10,
  reviewsPerDay: 40,
  voiceURI: null,
  speechRate: 0.9,
  repeatCount: 1,
};
export const emptyProgress = (): Progress => ({ sentences: {}, sections: {}, fullRuns: {}, checklist: {} });

export const sentenceId = (script: ScriptId, no: number) => `${script}-${no}`;
export const sectionKey = (script: ScriptId, no: number) => `${script}:s${no}`;
