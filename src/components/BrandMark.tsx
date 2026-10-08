// 品牌区（左上角）：随机可爱颜文字 + 随机 emoji 图标 + 双语金句。
//
// 随机口径（Lynn 2026-10-07）：**每次进入/刷新页面时替换一次**（组件挂载时抽一次），
// 不是每秒跳动 —— 会话内保持稳定，避免视觉噪音；刷新或重新进入即换一批。
//
// 内容池（KAOMOJI / ICONS / QUOTES / pickRandom）已抽到 brandMarkContent.ts，
// 以满足 react-refresh/only-export-components（本文件只导出组件）。
import { useMemo } from 'react';
import { KAOMOJI, ICONS, QUOTES, pickRandom } from './brandMarkContent';

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
