import type { StudentRecord } from '@/types';
import { attendanceKind } from '@/lib/attendance';

/** 全勤：范围内至少有一条记录，且每条已记录考勤均为按时。 */
export function isFullAttendance(records: StudentRecord[]): boolean {
  return records.length > 0 && records.every(record => attendanceKind(record.attendance) === 'onTime');
}
