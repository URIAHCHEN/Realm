// 选项语义着色：把「考勤 / 课堂练习 / 课后任务 / 课堂表现」等选项文本映射成一组语义色。
//
// 为什么按关键词而不是按固定文本判断：
//  · 选项文案由老师自行配置（准时👍 / 完成✅ …），且历史数据里还有 v1 旧文案（按时出勤 / 圆满完成）
//  · 硬编码选项名会导致"改了文案颜色就失效"、"新选项没有颜色"（历史 bug）
// 关键词法对任何配置都成立：好 = 绿，需注意 = 琥珀，负面 = 玫红，请假/调课 = 蓝。

export interface Tone {
  fg: string;
  bg: string;
  border: string;
}

const TONES: Record<'good' | 'warn' | 'bad' | 'info' | 'muted', Tone> = {
  good: { fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
  warn: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  bad: { fg: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
  info: { fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  muted: { fg: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
};

export function optionTone(value: string | undefined | null): Tone {
  const v = (value || '').trim();
  if (!v) return TONES.muted;
  if (/请假|调课/.test(v)) return TONES.info;
  if (/缺勤|未完成|未做完|没带/.test(v)) return TONES.bad;
  if (/迟到|补发|按要求|不过关|欠缺|走神|内向|需要|留意/.test(v)) return TONES.warn;
  if (/完成|准时|很棒|优秀|认真|积极|超赞|圆满|参与|细心|进步/.test(v)) return TONES.good;
  return TONES.muted;
}

/** 表格内 Select 触发器用的 Tailwind 类（与语义色一致） */
export function optionToneClass(value: string | undefined | null): string {
  const t = optionTone(value);
  if (t === TONES.good) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (t === TONES.warn) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (t === TONES.bad) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (t === TONES.info) return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-white text-slate-600';
}

/** 导出的海报里用的行内样式（html2canvas 不支持 Tailwind 类） */
export function optionToneStyle(value: string | undefined | null): string {
  const t = optionTone(value);
  return `color:${t.fg};font-weight:600`;
}

export type ToneLevel = 'good' | 'warn' | 'bad' | 'info' | 'muted';

/** 语义分级：用于「作业优秀率」这类需要按语义聚合的统计（不再逐个硬编码选项文案） */
export function optionToneLevel(value: string | undefined | null): ToneLevel {
  const t = optionTone(value);
  if (t === TONES.good) return 'good';
  if (t === TONES.warn) return 'warn';
  if (t === TONES.bad) return 'bad';
  if (t === TONES.info) return 'info';
  return 'muted';
}
