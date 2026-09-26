// 课次统计（deep module）：所有「班级口径」计算的唯一来源。
//
// 为什么值得独立成模块：
//  · 学情表（班均/班最低最高圆点）、学情报告（班级统计/低分名单/组合图）、
//    学生分析弹窗（入门测趋势的班级最高/平均/排名）此前各自实现了一遍口径，
//    导致同一个问题要在 4 个文件里改 4 遍，而且极易改漏——
//    真事：分析弹窗误用了「该生自己的记录」当全班记录，排名恒为 1/1。
//  · 把口径收进纯函数后，接口就是测试面：一条断言即可覆盖「排名=个人名次/当次班级人数」。
//
// 口径约定（与学情表/报告保持一致）：
//  1. 请假/缺勤（isAbsentRecord）不计入任何成绩类统计；
//  2. 正确率 = 得分 ÷ 该课次满分（满分见 lib/lessonFullScore，已排除口语等附加项）；
//  3. 排名按正确率降序；同分同名次（并列取最小名次）。
import type { StudentRecord } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';

export interface LessonClassSnapshot {
  lessonNumber: number;
  /** 当次有效人数（不含请假/缺勤） */
  size: number;
  avgRate: number;
  maxRate: number;
  minRate: number;
  /** recordId → 名次（1-based，并列同名次） */
  rankById: Map<string, number>;
}

export interface StudentLessonRow {
  lessonNumber: number;
  /** 本人正确率 */
  rate: number;
  classAvgRate: number;
  classMaxRate: number;
  classMinRate: number;
  /** 本人名次（1-based）；不在当次名单内时为 0 */
  rank: number;
  /** 当次班级人数 */
  size: number;
  /** 「个人名次 / 班级人数」的展示文本 */
  rankText: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 某课次的班级快照：有效人数、平均/最高/最低正确率、各人名次 */
export function classSnapshotOfLesson(records: StudentRecord[], lessonNumber: number): LessonClassSnapshot {
  const present = records.filter(r => r.lessonNumber === lessonNumber && !isAbsentRecord(r));
  const rankById = new Map<string, number>();
  if (present.length === 0) {
    return { lessonNumber, size: 0, avgRate: 0, maxRate: 0, minRate: 0, rankById };
  }

  const rates = present.map(r => r.correctRate);
  const sorted = [...present].sort((a, b) => b.correctRate - a.correctRate);
  // 并列同名次：与上一名正确率相同则沿用其名次
  let lastRate: number | null = null;
  let lastRank = 0;
  sorted.forEach((r, i) => {
    const rank = lastRate !== null && r.correctRate === lastRate ? lastRank : i + 1;
    rankById.set(r.id, rank);
    lastRate = r.correctRate;
    lastRank = rank;
  });

  return {
    lessonNumber,
    size: present.length,
    avgRate: round1(rates.reduce((a, b) => a + b, 0) / rates.length),
    maxRate: Math.max(...rates),
    minRate: Math.min(...rates),
    rankById,
  };
}

/** 某个学生某课次的「个人 / 班级」对比行（入门测趋势表格的一行） */
export function studentLessonRow(
  studentRecord: StudentRecord,
  classRecords: StudentRecord[]
): StudentLessonRow {
  const snap = classSnapshotOfLesson(classRecords, studentRecord.lessonNumber);
  const rank = snap.rankById.get(studentRecord.id) ?? 0;
  return {
    lessonNumber: studentRecord.lessonNumber,
    rate: studentRecord.correctRate,
    classAvgRate: snap.avgRate,
    classMaxRate: snap.maxRate,
    classMinRate: snap.minRate,
    rank,
    size: snap.size,
    rankText: formatRank(rank, snap.size),
  };
}

/** 入门测趋势：按课次升序输出该生每课次的班级对比行 */
export function studentLessonTrend(
  studentRecords: StudentRecord[],
  classRecords: StudentRecord[]
): StudentLessonRow[] {
  return [...studentRecords]
    .sort((a, b) => a.lessonNumber - b.lessonNumber)
    .map(r => studentLessonRow(r, classRecords));
}

/** 排名展示：「个人名次 / 当次班级人数」，如 12/28；缺数据时给出可读占位 */
export function formatRank(rank: number, size: number): string {
  if (!size || !rank) return '—';
  return `${rank}/${size}`;
}

/** 全班在若干课次上的快照（班级报告组合图用） */
export function classSnapshots(records: StudentRecord[]): LessonClassSnapshot[] {
  const lessons = Array.from(new Set(records.filter(r => !isAbsentRecord(r)).map(r => r.lessonNumber))).sort((a, b) => a - b);
  return lessons.map(ln => classSnapshotOfLesson(records, ln));
}

/** 达标人数（正确率 ≥ 阈值），用于班级组合图的辅助信息 */
export function passCountOfLesson(records: StudentRecord[], lessonNumber: number, threshold = 80): number {
  return records.filter(r => r.lessonNumber === lessonNumber && !isAbsentRecord(r) && r.correctRate >= threshold).length;
}
