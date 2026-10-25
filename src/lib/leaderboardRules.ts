import type { StudentRecord } from '@/types';
import { attendanceKind, isAbsentRecord } from '@/lib/attendance';

/** 全勤：范围内至少有一条记录，且每条已记录考勤均为按时。 */
export function isFullAttendance(records: StudentRecord[]): boolean {
  return records.length > 0 && records.every(record => attendanceKind(record.attendance) === 'onTime');
}

/** 累计全勤：截至目标课次必须仍有记录，且全部历史考勤均为按时。 */
export function isCumulativeFullAttendance(records: StudentRecord[], lessonNumber: number): boolean {
  return records.some(record => record.lessonNumber === lessonNumber) && isFullAttendance(records);
}

const NEGATIVE_LISTENING_STATUS = /未完成|未交|未做|未带|没带|没做|请假|缺勤|缺席|迟到|补交|不合格|未参与/;

/** 课后任务是否形成可表彰记录：数值分或正向定性状态都算。 */
export function isListeningEligible(record: StudentRecord): boolean {
  if (isAbsentRecord(record)) return false;
  if (Number(record.listeningScore) > 0) return true;
  const status = String(record.listeningStatus || '').trim();
  return !!status && !NEGATIVE_LISTENING_STATUS.test(status);
}

export function listeningScoreOf(record: StudentRecord): number {
  return Number(record.listeningScore) || 0;
}

export interface RankableScore {
  studentName: string;
  totalScore: number;
  correctRate: number;
}

/** 竞争排名：按正确率降序，同率并列并跳过已占位次；满分不同的课次不直接比较原始分。 */
export function rankForLeaderboard<T extends RankableScore>(records: T[], limit = 10): (T & { rank: number; awardRank: number })[] {
  const sorted = [...records].sort((a, b) =>
    b.correctRate - a.correctRate
    || b.totalScore - a.totalScore
    || a.studentName.localeCompare(b.studentName, 'zh-CN'));
  let lastRate: number | null = null;
  let lastRank = 0;
  let awardRank = 0;
  return sorted.map((record, index) => {
    const rank = lastRate !== null && record.correctRate === lastRate ? lastRank : index + 1;
    if (record.correctRate !== lastRate) awardRank++;
    lastRate = record.correctRate;
    lastRank = rank;
    // rank 用于数字名次（并列后跳号）；awardRank 用于金银铜（按不同成绩档位，不跳档）。
    return { ...record, rank, awardRank };
  }).slice(0, Math.max(0, limit));
}

export const FENGYUN_LIMIT = 8;

/** 风云榜按成绩档位分组；调用方只取金、银、铜前三档。 */
export function groupFengyunAwards<T extends { rank: number; awardRank?: number }>(
  records: T[],
): { awardRank: number; entries: T[] }[] {
  const groups = new Map<number, T[]>();
  records.forEach(record => {
    const awardRank = record.awardRank ?? record.rank;
    const entries = groups.get(awardRank) || [];
    entries.push(record);
    groups.set(awardRank, entries);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([awardRank, entries]) => ({ awardRank, entries }));
}

export const FENGYUN_NAMES_PER_ROW = 4;

/** 仅取前三档；同档超过 4 个姓名时向下续行，续行不重复奖牌、不显示数字名次。 */
export function buildFengyunRows<T extends { rank: number; awardRank?: number }>(
  records: T[],
): { awardRank: number; entries: T[]; continuation: boolean }[] {
  return groupFengyunAwards(records).filter(group => group.awardRank <= 3).flatMap(group => {
    const rows: { awardRank: number; entries: T[]; continuation: boolean }[] = [];
    for (let index = 0; index < group.entries.length; index += FENGYUN_NAMES_PER_ROW) {
      rows.push({
        awardRank: group.awardRank,
        entries: group.entries.slice(index, index + FENGYUN_NAMES_PER_ROW),
        continuation: index > 0,
      });
    }
    return rows;
  });
}
