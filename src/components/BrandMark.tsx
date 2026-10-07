// 品牌区（左上角）：随机可爱颜文字 + 随机 emoji 图标 + 双语金句。
//
// 随机口径（Lynn 2026-10-07）：**每次进入/刷新页面时替换一次**（组件挂载时抽一次），
// 不是每秒跳动 —— 会话内保持稳定，避免视觉噪音；刷新或重新进入即换一批。
import { useMemo } from 'react';

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

export function BrandMark({ compact = false }: { compact?: boolean }) {
  // 挂载时抽一次：刷新/重新进入换一批
  const { kaomoji, icon, quote } = useMemo(
    () => ({ kaomoji: pickRandom(KAOMOJI), icon: pickRandom(ICONS), quote: pickRandom(QUOTES) }),
    []
  );

  return (
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div
        className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-md text-2xl sm:text-3xl shrink-0"
        style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb) / 0.72))' }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h1
          className={`${compact ? 'text-base sm:text-xl' : 'text-lg sm:text-2xl'} font-bold tracking-tight whitespace-nowrap`}
          style={{ color: 'var(--brand)' }}
          title="Lynn's Realm"
        >
          {kaomoji}
        </h1>
        {/* 双语金句：中文为主，英文做对照小字 */}
        <p className="text-[11px] sm:text-xs text-[color:var(--ink-4)] leading-tight truncate max-w-[42vw] sm:max-w-none">
          {quote.zh}
          <span className="mx-1.5 opacity-40">·</span>
          <span className="italic opacity-80">{quote.en}</span>
        </p>
      </div>
    </div>
  );
}
