// 季度成绩单：把一学期的学情记录聚合成「一张成绩单」需要的指标。
// 纯函数，便于自测；不依赖 React / DOM。

import type { StudentRecord } from '@/types';
import { isReportAssessed } from '@/lib/reportStats';
import { optionToneLevel } from '@/lib/optionTone';

export interface QuarterOption {
  key: string;
  label: string;
  year: number;
  quarter: number;
}

/** 从记录日期里推出可用季度（新到旧） */
export function listQuarters(records: StudentRecord[]): QuarterOption[] {
  const map = new Map<string, QuarterOption>();
  records.forEach(record => {
    const date = String(record.date || '');
    const match = /^(\d{4})-(\d{2})/.exec(date);
    if (!match) return;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || !month) return;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const key = `${year}-Q${quarter}`;
    if (!map.has(key)) map.set(key, { key, label: `${year} 年 第 ${quarter} 季度`, year, quarter });
  });
  return [...map.values()].sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));
}

export function inQuarter(record: StudentRecord, quarter: QuarterOption): boolean {
  const match = /^(\d{4})-(\d{2})/.exec(String(record.date || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year === quarter.year && Math.floor((month - 1) / 3) + 1 === quarter.quarter;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 口语类题型判定：题型名里带「口语 / 朗读 / 口头 / oral / speaking」即视为口语 */
export function isOralQuestionTypeName(name: string): boolean {
  return /口语|朗读|口头|oral|speaking/i.test(String(name || ''));
}

/**
 * 一条记录的口语分。
 *
 * 实际数据里口语是**独立题型**（名称多为「口语得分」），分数是百分制原始分，
 * 题型满分段不可靠（实测有把 29 / 93 / 97 填进满分的），因此只取得分、不做折算。
 * 兼容旧数据：若该记录没有口语题型，但「课后任务」栏直接录了分（listeningScore > 0），
 * 也认作口语（Lynn 2026-10-28：有分的课后任务就属于口语）。
 */
export function oralScoreOf(record: StudentRecord, oralTypeIds?: Set<string>): number | null {
  const scores = record.scores || {};
  const hits = Object.entries(scores)
    .filter(([id]) => (oralTypeIds ? oralTypeIds.has(id) : false))
    .map(([, value]) => Number(value))
    .filter(value => Number.isFinite(value) && value > 0);
  if (hits.length > 0) {
    // 同一课次若有多道口语题，取该课的平均分，避免题目多的课次被放大权重
    const avg = hits.reduce((sum, value) => sum + value, 0) / hits.length;
    return Math.min(100, round1(avg));
  }
  const legacy = Number(record.listeningScore);
  return Number.isFinite(legacy) && legacy > 0 ? Math.min(100, round1(legacy)) : null;
}

/** 作业/课后任务是否算“完成”：优先按语义色档判断，再兜底关键词 */
function isDone(text: string): boolean {
  if (!text) return false;
  // 先排除否定式：「未完成」也含「完成」二字，只靠正向关键词会把未交算成已完成
  if (/未完成|没完成|未交|缺交|未带|未做|没有/.test(text)) return false;
  if (optionToneLevel(text) === 'good') return true;
  return /完成|优秀|按时|已交|很棒/.test(text);
}

export interface StudentQuarterAgg {
  studentName: string;
  assessed: number;
  entryAvg: number;
  entryRate: number;
  hwDone: number;
  hwTotal: number;
  hwRate: number;
  oralAvg: number;
  oralCount: number;
}

/** 单生在指定季度的聚合指标 */
export function aggregateStudent(
  records: StudentRecord[],
  studentName: string,
  quarter: QuarterOption,
  oralTypeIds?: Set<string>,
): StudentQuarterAgg {
  const own = records.filter(r => r.studentName === studentName && inQuarter(r, quarter));
  const assessed = own.filter(r => isReportAssessed(r));
  const entryAvg = assessed.length ? round1(assessed.reduce((s, r) => s + (Number(r.totalScore) || 0), 0) / assessed.length) : 0;
  const entryRate = assessed.length ? round1(assessed.reduce((s, r) => s + (Number(r.correctRate) || 0), 0) / assessed.length) : 0;

  const hwRows = own.filter(r => String(r.homeworkStatus || '').trim());
  const hwDone = hwRows.filter(r => isDone(String(r.homeworkStatus))).length;

  // 口语：优先取「口语得分」题型（真实数据都在这里），再兼容课后任务栏直接录的分
  const oralScores = own
    .map(r => oralScoreOf(r, oralTypeIds))
    .filter((value): value is number => value !== null);
  const oralAvg = oralScores.length ? round1(oralScores.reduce((s, v) => s + v, 0) / oralScores.length) : 0;

  return {
    studentName,
    assessed: assessed.length,
    entryAvg,
    entryRate,
    hwDone,
    hwTotal: hwRows.length,
    hwRate: hwRows.length ? round1((hwDone / hwRows.length) * 100) : 0,
    oralAvg,
    oralCount: oralScores.length,
  };
}

export interface QuarterlyStats extends StudentQuarterAgg {
  className: string;
  teacher: string;
  year: number;
  quarterLabel: string;
  rank: number;
  classSize: number;
  /** 击败的同班比例（按正确率高于自己的同学数计算） */
  beatPct: number;
  /** 口语击败比例（仅在有口语数据的同学中计算） */
  oralBeat: number;
  lessons: number;
}

/** 指定季度、指定学生 + 全班对比 */
export function computeQuarterlyStats(
  records: StudentRecord[],
  students: string[],
  studentName: string,
  quarter: QuarterOption,
  className: string,
  teacher = 'Lynn',
  oralTypeIds?: Set<string>,
): QuarterlyStats {
  const base = aggregateStudent(records, studentName, quarter, oralTypeIds);
  const peers = students.map(name => aggregateStudent(records, name, quarter, oralTypeIds)).filter(p => p.assessed > 0);
  const higher = peers.filter(p => p.entryRate > base.entryRate).length;
  const lower = peers.filter(p => p.entryRate < base.entryRate).length;
  const oralPeers = peers.filter(p => p.oralCount > 0);
  const oralLower = oralPeers.filter(p => p.oralAvg < base.oralAvg).length;
  const lessons = new Set(records.filter(r => r.studentName === studentName && inQuarter(r, quarter)).map(r => r.lessonNumber)).size;

  return {
    ...base,
    className,
    teacher,
    year: quarter.year,
    quarterLabel: quarter.label,
    rank: peers.length ? higher + 1 : 0,
    classSize: peers.length,
    beatPct: peers.length > 1 ? round1((lower / peers.length) * 100) : 0,
    oralBeat: oralPeers.length > 1 ? round1((oralLower / oralPeers.length) * 100) : 0,
    lessons,
  };
}

export const DEFAULT_QUARTERLY_TEMPLATE = [
  '【{student}】同学，在 {teacher} 老师的 {year} 年【{class}】中，',
  '《入门测》平均得分为：【{entryAvg}】分，平均得分率为：【{entryRate}%】',
  '在班上排名第【{rank}】名，打败了同班【{beatPct}%】的同学！！',
  '作业这一块你一共完成了【{hwDone}】个任务，课后任务完成率【{hwRate}%】，',
  '口语平均得分为【{oralAvg}】分，打败了班级【{oralBeat}%】的同学！！',
  '{teacher} 老大为这个【{trait}】的你点赞～～～',
  '希望你继续加油，我们一起迎难而上！💪💪💪',
].join('\n');

export function quarterlyVariables(stats: QuarterlyStats, extra: Record<string, string> = {}): Record<string, string> {
  return {
    student: stats.studentName,
    teacher: stats.teacher,
    year: String(stats.year),
    class: stats.className,
    entryAvg: String(stats.entryAvg),
    entryRate: String(stats.entryRate),
    rank: String(stats.rank),
    beatPct: String(stats.beatPct),
    hwDone: String(stats.hwDone),
    hwRate: String(stats.hwRate),
    // 本季度没有口语记录时不要输出 "0 分"——那会被读成"口语考了 0 分"，
    // 实际含义是"这季度没登记口语"。用破折号，配合页面上的说明一起看。
    oralAvg: stats.oralCount > 0 ? String(stats.oralAvg) : '—',
    oralBeat: stats.oralCount > 0 ? String(stats.oralBeat) : '—',
    lessons: String(stats.lessons),
    className: stats.className,
    ...extra,
  };
}

/**
 * 本季度没有口语成绩时，模板句会渲染成「口语平均得分为—分，打败了班级—%的同学」，
 * 读起来像个残缺的句子。这里把含口语且含破折号的那一行换成一句人话，
 * 其余行原样保留（模板可能把口语与其他内容写在同一行，那种情况不动它）。
 */
export function humanizeEmptyOral(text: string): string {
  if (!text.includes('—')) return text;
  return text.split('\n').map(line => (
    line.includes('口语') && line.includes('—')
      ? '口语这一块，本季度还没有登记成绩，等下季度录入了我再补上。'
      : line
  )).join('\n');
}

/** 极简占位符替换：未知占位符原样保留，避免模板里写错就整段消失 */
export function renderQuarterlyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_\u4e00-\u9fa5]+)\}/g, (all, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : all
  ));
}
