import type { StudentRecord } from '@/types';

export interface StudentActivityContext {
  /** 当前班级名单 */
  roster: ReadonlySet<string>;
  /** 学员加入课次 */
  joinLesson: Record<string, number>;
  /** 学员离班课次（从该课次起不再属于本班） */
  leaveLesson: Record<string, number>;
  /** 每位学员最后一条历史记录所在课次，用于兼容没有离班标记的旧数据 */
  lastLesson: ReadonlyMap<string, number>;
}

export function createStudentActivityContext(
  students: string[],
  joinLesson: Record<string, number> | undefined,
  leaveLesson: Record<string, number> | undefined,
  records: StudentRecord[],
): StudentActivityContext {
  const lastLesson = new Map<string, number>();
  records.forEach(record => {
    const current = lastLesson.get(record.studentName);
    if (current == null || record.lessonNumber > current) {
      lastLesson.set(record.studentName, record.lessonNumber);
    }
  });
  return {
    roster: new Set(students),
    joinLesson: joinLesson || {},
    leaveLesson: leaveLesson || {},
    lastLesson,
  };
}

/**
 * 学员是否在截至 rangeEnd 的公示范围内仍属于本班。
 * - 当前仍在名单：按加入课次判断；
 * - 已离班：有显式离班课次用显式值；旧数据没有标记时，以最后一条记录课次的下一课视为离班。
 */
export function isStudentActiveForRange(
  context: StudentActivityContext,
  studentName: string,
  rangeEnd: number,
): boolean {
  const joinedAt = context.joinLesson[studentName];
  if (joinedAt != null && joinedAt > rangeEnd) return false;

  const explicitLeave = context.leaveLesson[studentName];
  const last = context.lastLesson.get(studentName);
  const inferredLeave = context.roster.has(studentName)
    ? Number.POSITIVE_INFINITY
    : (last == null ? Number.POSITIVE_INFINITY : last + 1);
  const leftAt = explicitLeave ?? inferredLeave;
  return rangeEnd < leftAt;
}

/** 单条记录是否落在该学员的有效在读区间内（排除插班前/离班后的残留记录）。 */
export function isStudentActiveAtLesson(
  context: StudentActivityContext,
  studentName: string,
  lessonNumber: number,
): boolean {
  const joinedAt = context.joinLesson[studentName];
  if (joinedAt != null && lessonNumber < joinedAt) return false;

  const explicitLeave = context.leaveLesson[studentName];
  const last = context.lastLesson.get(studentName);
  const inferredLeave = context.roster.has(studentName)
    ? Number.POSITIVE_INFINITY
    : (last == null ? Number.POSITIVE_INFINITY : last + 1);
  const leftAt = explicitLeave ?? inferredLeave;
  return lessonNumber < leftAt;
}
