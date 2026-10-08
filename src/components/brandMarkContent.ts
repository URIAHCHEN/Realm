// 品牌区共享内容池（颜文字 / 图标 / 金句 / 随机工具）
//
// 独立成文件的原因：BrandMark.tsx 需要只导出组件以满足 react-refresh/only-export-components，
// 而这些常量与工具函数被 BrandMark 与 LoginPage 共用，抽到此处避免 fast-refresh 失效。
//
// 随机口径（Lynn 2026-10-07）：每次进入/刷新页面时替换一次（组件挂载时抽一次），
// 不是每秒跳动 —— 会话内保持稳定，避免视觉噪音；刷新或重新进入即换一批。

/** 颜文字池（替代原来的 "Realm" 字样） */
export const KAOMOJI = [
  "🫓 '͜' 🫓",
  '( ˶ˆ꒳ˆ˵ )',
  'ฅ^•ﻌ•^ฅ',
  'ʕ•ᴥ•ʔ',
  '(´･ω･`)',
  '(*≧ω≦)',
  'ᕕ( ᐛ )ᕗ',
  '(๑•̀ㅂ•́)و✧',
  '૮ ˶ᵔ ᵕ ᵔ˶ ა',
  '( •̀ ω •́ )✧',
  '(๑˃ᴗ˂)ﻭ',
  '₍˄·͈༝·͈˄*₎◞ ̑̑',
  '(≧∇≦)ﾉ',
  '🍞 ˘ ³˘)',
];

/** 图标位 emoji 池 */
export const ICONS = ['🫓', '🍡', '🌸', '🧸', '🍓', '🐣', '🌱', '🍥', '🪷', '🫧', '🎈', '🍀', '🧁', '☕️', '🪄', '🫖'];

/** 双语金句池（中文 + 英文对照） */
export const QUOTES: { zh: string; en: string }[] = [
  { zh: '今日事，今日毕。', en: "Finish today's work today." },
  { zh: '把每节课都当成作品。', en: 'Treat every lesson as a piece of work.' },
  { zh: '进步是攒出来的。', en: 'Progress is compounded.' },
  { zh: '先把小事做好。', en: 'Small things, done well.' },
  { zh: '心之所向，素履以往。', en: 'Where the heart leads, walk on.' },
  { zh: '日日新，又日新。', en: 'Renew each day, and renew again.' },
  { zh: '慢一点，稳一点。', en: 'Slow is smooth; smooth is fast.' },
  { zh: '数据会说话。', en: 'Numbers tell the story.' },
  { zh: '看见每一个孩子。', en: 'See every single student.' },
  { zh: '努力不会白费。', en: 'Effort never goes to waste.' },
  { zh: '先完成，再完善。', en: 'Done first, then better.' },
  { zh: '把复杂留给自己。', en: 'Keep the hard parts to ourselves.' },
  { zh: '让进步看得见。', en: 'Make progress visible.' },
  { zh: '一节课，一点光。', en: 'One lesson, a little more light.' },
];

export const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
