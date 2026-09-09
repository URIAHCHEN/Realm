// 考勤口径统一：请假/缺勤学员不参与总分与平均分统计
// 说明：使用「关键词包含」匹配而非全等，兼容自定义考勤选项与附带 emoji 的选项（如"准时👍"、"缺勤😷"）
import type { StudentRecord } from '@/types';

export type AttendanceKind = 'onTime' | 'late' | 'absent' | 'leave' | 'transfer' | 'unknown';

/** 去掉 emoji / 符号 / 空白，仅保留中英文与数字后再做关键词判断 */
export function normalizeAttendance(att: string | undefined | null): string {
  return (att || '').replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
}

/** 考勤归类：准时/按时→onTime，迟到→late，缺勤→absent，请假→leave，调课→transfer */
export function attendanceKind(att: string | undefined | null): AttendanceKind {
  const s = normalizeAttendance(att);
  if (!s) return 'unknown';
  // 「未到校/无故缺勤」这类含「未/缺」的自定义项按缺勤处理
  if (s.includes('迟到')) return 'late';
  if (s.includes('调课')) return 'transfer';
  if (s.includes('请假')) return 'leave';
  if (s.includes('缺勤') || s.includes('缺课') || s.includes('未到校') || s.includes('没来') || s.includes('未到')) return 'absent';
  if (s.includes('准时') || s.includes('按时') || s.includes('出勤') || s.includes('到课') || s.includes('全勤')) return 'onTime';
  return 'unknown';
}

/** 是否视为出勤（按时/迟到都算到场）；调课/请假/缺勤不算 */
export function isPresentAttendance(att: string | undefined | null): boolean {
  const k = attendanceKind(att);
  return k === 'onTime' || k === 'late';
}

/** 出勤率（%）：(按时+迟到) / 总记录；调课记录不计入分母 */
export function attendanceRateOf(attList: (string | undefined | null)[]): number {
  const kinds = attList.map(attendanceKind);
  const denom = kinds.filter(k => k !== 'transfer' && k !== 'unknown').length;
  if (denom === 0) return 0;
  const present = kinds.filter(k => k === 'onTime' || k === 'late').length;
  return Math.round(present / denom * 100);
}

export function isAbsentRecord(r: StudentRecord): boolean {
  const k = attendanceKind(r.attendance);
  return k === 'absent' || k === 'leave';
}
