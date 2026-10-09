// 全站图表统一主题（2026-10-09）—— 目标是「极为详细 + 确保可读性」
//
// 起因：各图表此前各写各的 tick / tooltip / 配色，出现三类问题：
//  ① 字号偏小（10px）与颜色偏淡，暗色/浅色下都吃力；
//  ② SVG 文字未显式声明字体，导出或跨环境时可能回退到衬线/默认字体（"字体错误"现象）；
//  ③ 缺少数值单位与达标参考线，信息量不足。
// 这里收敛成一份主题：所有图表共用同一套字体声明、刻度、网格、tooltip、图例、参考线与配色。
import type { CSSProperties } from 'react';

/** 统一字体栈：与全站一致；显式写进 SVG 文字，避免导出/克隆时回退到衬线字体 */
export const CHART_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", system-ui, "Microsoft YaHei", sans-serif';

/** 轴刻度（常规）/ 紧凑（雷达、双轴密集场景）*/
export const AXIS_TICK = { fontSize: 12, fill: '#64748b', fontFamily: CHART_FONT_FAMILY } as const;
export const AXIS_TICK_SM = { fontSize: 11, fill: '#64748b', fontFamily: CHART_FONT_FAMILY } as const;
export const AXIS_TICK_XS = { fontSize: 10.5, fill: '#94a3b8', fontFamily: CHART_FONT_FAMILY } as const;

/** 网格：只留横线、更淡，避免与数据线抢视觉 */
export const GRID = { strokeDasharray: '3 3', stroke: '#eef2f7', vertical: false } as const;

/** tooltip：白底、圆角、柔和阴影；数值用等宽数字便于比较 */
export const TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  fontSize: 13,
  fontFamily: CHART_FONT_FAMILY,
  padding: '8px 12px',
};
export const TOOLTIP_LABEL: CSSProperties = { color: '#334155', fontWeight: 600, marginBottom: 4 };
export const TOOLTIP_ITEM: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

/** 图例：小图标、留白一致 */
export const LEGEND_STYLE = { fontSize: 12, fontFamily: CHART_FONT_FAMILY, paddingTop: 6 } as const;
export const LEGEND_STYLE_SM = { fontSize: 11, fontFamily: CHART_FONT_FAMILY, paddingTop: 4 } as const;

/** 语义色（与全站 optionTone / 设计令牌同源） */
export const CHART_BRAND = 'rgb(var(--brand-rgb) / 0.92)';
export const CHART_BRAND_SOFT = 'rgb(var(--brand-rgb) / 0.55)';
export const CHART_GOOD = '#10b981';    // 优秀 / 达标
export const CHART_WARN = '#f59e0b';    // 及格线 / 注意
export const CHART_BAD = '#ef4444';     // 需补
export const CHART_NEUTRAL = '#cbd5e1'; // 班级最高 / 中性参考
export const CHART_MUTED = '#94a3b8';   // 均值等辅助线
export const CHART_SERIES = ['#0a84ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

/** 参考线：优秀 85 / 及格 60 / 班均（虚线 + 带标签） */
export const REF_EXCELLENT = { y: 85, stroke: CHART_GOOD, strokeDasharray: '4 4' } as const;
export const REF_PASS = { y: 60, stroke: CHART_WARN, strokeDasharray: '4 4' } as const;
export function refLabel(text: string, fill: string, position: 'insideTopRight' | 'insideBottomRight' | 'insideLeft' | 'top' | 'bottom' = 'insideTopRight') {
  return { value: text, fontSize: 10.5, fill, position, fontFamily: CHART_FONT_FAMILY };
}

/** 数值格式化：百分比（保留 1 位、整数不显示 .0 的冗余） */
export const fmtPct = (v: number | string): string => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 10) / 10}%`;
};
/** 分数格式化：附满分 */
export const fmtScore = (v: number | string, full?: number): string =>
  `${Math.round((typeof v === 'number' ? v : Number(v)) * 10) / 10}${full ? `/${full}` : ''} 分`;
