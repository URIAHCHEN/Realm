// 考勤口径统一：请假/缺勤学员不参与总分与平均分统计
// 说明：使用「包含」匹配而非全等，兼容自定义考勤选项（如"请假（病假）"）
import type { StudentRecord } from '@/types';

export function isAbsentRecord(r: StudentRecord): boolean {
  const att = r.attendance || '';
  return att.includes('请假') || att.includes('缺勤');
}
