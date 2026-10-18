/**
 * 图表入场动画统一参数（2026-10-18）
 * Recharts 默认 animationDuration=1500ms —— 在这类"随时切换课次/学生"的产品界面里显得拖沓，
 * 切 Tab 时图表还在慢慢长出来。统一收敛到 550ms + ease-out（先快后缓，落点稳），
 * 既保留"数据在长出来"的连续感，又不会挡住阅读。
 */
export const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 550,
  animationEasing: 'ease-out' as const,
};
