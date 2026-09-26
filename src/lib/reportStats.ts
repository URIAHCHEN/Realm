// 学情报告的统计层（从 StudentReport 组件中抽离的纯函数）。
//
// 为什么抽出来：这些统计原先写在外层组件的两个 useMemo 里，结果对象是"匿名结构"，
// 内层视图组件各自再声明一份 props 接口 —— 两边靠人肉保持同步，
// 历史上一改统计字段就出现"接口未同步"的编译错误（P1 类问题的根源）。
// 现在：入参明确、返回类型明确（见 reportStats.types.ts 的使用处），
// 组件只负责装配数据与渲染，统计逻辑可被单独断言。
import type { StudentRecord, LessonConfig } from '@/types';
import { attendanceKind, isAbsentRecord } from '@/lib/attendance';
import { optionToneLevel } from '@/lib/optionTone';

export interface OptionalRow { name: string; registered: number; total: number; avg: number }

export interface StudentReportStats {
  totalLessons: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgQuestionTypeScores: { id: string; name: string; avgScore: number; fullScore: number }[];
  learningTrajectory: { lesson: number; score: number; correctRate: number; listeningScore: number }[];
  attendanceStats: { total: number; onTime: number; late: number; absent: number };
  homeworkStats: { excellent: number; good: number; average: number; poor: number };
  attendanceBreakdown: { option: string; count: number }[];
  homeworkBreakdown: { option: string; count: number }[];
  listeningBreakdown: { option: string; count: number }[];
}

export interface ClassReportStats {
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgCorrectRate: number;
  distribution: { label: string; min: number; max: number; color: string; count: number }[];
  questionTypeAvg: { id: string; name: string; avgScore: number; fullScore: number; count: number; correctRate: number }[];
  weakPoints: { id: string; name: string; avgScore: number; fullScore: number; count: number; correctRate: number }[];
  attendanceSummary: { total: number; onTime: number; late: number; absent: number; leave: number; transfer: number };
  homeworkSummary: { total: number; hwTotal: number; qualityTotal: number; excellent: number; good: number; average: number; poor: number; notBring: number };
  attendanceBreakdown: { option: string; count: number }[];
  homeworkBreakdown: { option: string; count: number }[];
  listeningBreakdown: { option: string; count: number }[];
  validCount: number;
}

/** 分数段按正确率分档（各次小测满分不同，绝对分不可比） */
export const SCORE_RANGES = [
  { label: '90% 以上', min: 90, max: 101, color: '#10b981' },
  { label: '80-89%', min: 80, max: 89.999, color: '#3b82f6' },
  { label: '70-79%', min: 70, max: 79.999, color: '#f59e0b' },
  { label: '60-69%', min: 60, max: 69.999, color: '#f97316' },
  { label: '60% 以下', min: 0, max: 59.999, color: '#ef4444' },
];

export interface OptionLists { attendanceOptions: string[]; homeworkOptions: string[]; listeningOptions: string[] }

/** 个人报告统计 */
export function computeStudentReportStats(
  studentRecords: StudentRecord[],
  lessonConfigs: { [lesson: string]: LessonConfig },
  opts: OptionLists,
): StudentReportStats | null {
  const { attendanceOptions, homeworkOptions, listeningOptions } = opts;
  if (studentRecords.length === 0) return null;

    if (studentRecords.length === 0) return null;

    const totalLessons = studentRecords.length;
    const avgScore = studentRecords.reduce((sum, r) => sum + r.totalScore, 0) / totalLessons;
    const maxScore = Math.max(...studentRecords.map(r => r.totalScore));
    const minScore = Math.min(...studentRecords.map(r => r.totalScore));
    
    const questionTypeScores: { [key: string]: { total: number; count: number; name: string; fullScore: number } } = {};
    
    studentRecords.forEach(record => {
      const config = lessonConfigs[record.lessonNumber];
      if (config) {
        // 附加项（口语等）不属于小测科目，不参与题型均分/正确率统计
        config.questionTypes.filter(qt => !qt.excludeFromTotal).forEach(qt => {
          if (!questionTypeScores[qt.id]) {
            questionTypeScores[qt.id] = { total: 0, count: 0, name: qt.name, fullScore: qt.fullScore || 0 };
          }
          if (record.scores[qt.id] !== undefined) {
            questionTypeScores[qt.id].total += record.scores[qt.id];
            questionTypeScores[qt.id].count++;
          }
          questionTypeScores[qt.id].fullScore = Math.max(questionTypeScores[qt.id].fullScore, qt.fullScore || 0);
        });
      }
    });

    const avgQuestionTypeScores = Object.entries(questionTypeScores).map(([id, data]) => ({
      id,
      name: data.name,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      fullScore: data.fullScore
    }));

    const learningTrajectory = studentRecords.map(r => ({
      lesson: r.lessonNumber,
      score: r.totalScore,
      correctRate: r.correctRate,
      listeningScore: r.listeningScore
    }));

    const studentAttKinds = studentRecords.map(r => attendanceKind(r.attendance));
    const attendanceStats = {
      total: studentRecords.length,
      onTime: studentAttKinds.filter(k => k === 'onTime').length,
      late: studentAttKinds.filter(k => k === 'late').length,
      absent: studentAttKinds.filter(k => k === 'absent' || k === 'leave').length
    };

    // 按语义分级统计（兼容任意选项文案：完成✅/超赞完成 都算优秀）
    const homeworkStats = {
      excellent: studentRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'good').length,
      good: studentRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'good').length,
      average: studentRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'warn').length,
      poor: studentRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'bad').length
    };
    const optionCounts = (opts: string[], pick: (r: typeof studentRecords[number]) => string | undefined) =>
      opts.map(opt => ({ option: opt, count: studentRecords.filter(r => pick(r) === opt).length }))
        .filter(x => x.count > 0 || opts.length <= 6);
    const attendanceBreakdown = optionCounts(attendanceOptions, r => r.attendance);
    const homeworkBreakdown = optionCounts(homeworkOptions, r => r.homeworkStatus);
    const listeningBreakdown = optionCounts(listeningOptions, r => r.listeningStatus);

    return {
      totalLessons,
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      avgQuestionTypeScores,
      learningTrajectory,
      attendanceStats,
      homeworkStats,
      attendanceBreakdown,
      homeworkBreakdown,
      listeningBreakdown,
    };
}

/** 班级报告统计 */
export function computeClassReportStats(
  classReportRecords: StudentRecord[],
  lessonConfigs: { [lesson: string]: LessonConfig },
  opts: OptionLists,
): ClassReportStats | null {
  const { attendanceOptions, homeworkOptions, listeningOptions } = opts;
  if (classReportRecords.length === 0) return null;

    if (classReportRecords.length === 0) return null;

    // 统计口径：请假/缺勤学员不参与任何成绩类统计（平均分/正确率/题型均分与正确率/分数段分布）
    const scoredRecords = classReportRecords.filter(r => !isAbsentRecord(r));
    const validRecords = scoredRecords.filter(r => r.totalScore > 0);
    const avgScore = validRecords.length > 0
      ? validRecords.reduce((sum, r) => sum + r.totalScore, 0) / validRecords.length
      : 0;
    const maxScore = validRecords.length > 0 ? Math.max(...validRecords.map(r => r.totalScore)) : 0;
    const minScore = validRecords.length > 0 ? Math.min(...validRecords.map(r => r.totalScore)) : 0;
    const avgCorrectRate = validRecords.length > 0
      ? validRecords.reduce((sum, r) => sum + r.correctRate, 0) / validRecords.length
      : 0;

    // 分数段分布
    // 按正确率分档（见 SCORE_RANGES 注释）
    const distribution = SCORE_RANGES.map(range => ({
      ...range,
      count: validRecords.filter(r => r.correctRate >= range.min && r.correctRate <= range.max).length
    }));

    // 各题型平均分（仅到课学员；请假学员的 0 分不计入分子与分母）
    const questionTypeScores: { [key: string]: { total: number; count: number; name: string; fullScore: number } } = {};
    scoredRecords.forEach(record => {
      const config = lessonConfigs[record.lessonNumber];
      if (config) {
        // 附加项（口语等）不属于小测科目，不参与题型均分/薄弱 Top3
        config.questionTypes.filter(qt => !qt.excludeFromTotal).forEach(qt => {
          if (!questionTypeScores[qt.id]) {
            questionTypeScores[qt.id] = { total: 0, count: 0, name: qt.name, fullScore: qt.fullScore };
          }
          if (record.scores[qt.id] !== undefined) {
            questionTypeScores[qt.id].total += record.scores[qt.id];
            questionTypeScores[qt.id].count++;
          }
        });
      }
    });

    const questionTypeAvg = Object.entries(questionTypeScores).map(([id, data]) => ({
      id,
      name: data.name,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      fullScore: data.fullScore,
      count: data.count,
      correctRate: data.fullScore > 0 && data.count > 0
        ? Math.round(((data.total / data.count) / data.fullScore) * 100 * 10) / 10
        : 0
    }));

    // 薄弱题型 Top3
    const weakPoints = [...questionTypeAvg]
      .filter(qt => qt.count > 0)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 3);

    // 出勤概况（关键词归类，忽略 emoji 后缀）
    const classAttKinds = classReportRecords.map(r => attendanceKind(r.attendance));
    const attendanceSummary = {
      total: classReportRecords.length,
      onTime: classAttKinds.filter(k => k === 'onTime').length,
      late: classAttKinds.filter(k => k === 'late').length,
      absent: classAttKinds.filter(k => k === 'absent').length,
      leave: classAttKinds.filter(k => k === 'leave').length,
      transfer: classAttKinds.filter(k => k === 'transfer').length
    };

    // 作业/课堂练习概况：全部按「语义分级」聚合，不再硬编码 v1 选项文案；
    // 「优秀」并入课后任务表现（老师反馈的优秀率要能反映课堂练习 + 课后任务）
    const hasHomeworkOption = (v?: string) => !!v && v.trim() !== '' && v !== '具体分数';
    const hwRecords = classReportRecords.filter(r => hasHomeworkOption(r.homeworkStatus));
    const listeningRecords = classReportRecords.filter(r => hasHomeworkOption(r.listeningStatus));
    const qualityPool = [...hwRecords, ...listeningRecords.filter(r => !hwRecords.includes(r))];
    const homeworkSummary = {
      total: classReportRecords.length,
      hwTotal: hwRecords.length,
      /** 质量类统计的分母：填过课堂练习或课后任务的记录数（去重） */
      qualityTotal: qualityPool.length,
      excellent: qualityPool.filter(r =>
        optionToneLevel(r.homeworkStatus) === 'good'
        || (hasHomeworkOption(r.listeningStatus) && optionToneLevel(r.listeningStatus) === 'good')).length,
      good: hwRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'good').length,
      average: hwRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'warn').length,
      poor: hwRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'bad').length,
      notBring: hwRecords.filter(r => optionToneLevel(r.homeworkStatus) === 'bad').length,
    };

    // 动态维度：以「当前配置里出现过的选项」为准统计，选项改文案后无需改代码
    const classOptionCounts = (opts: string[], pick: (r: typeof classReportRecords[number]) => string | undefined) =>
      opts.map(opt => ({ option: opt, count: classReportRecords.filter(r => pick(r) === opt).length }));
    const attendanceBreakdown = classOptionCounts(attendanceOptions, r => r.attendance);
    const homeworkBreakdown = classOptionCounts(homeworkOptions, r => r.homeworkStatus);
    const listeningBreakdown = classOptionCounts(listeningOptions, r => r.listeningStatus);

    return {
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      avgCorrectRate: Math.round(avgCorrectRate * 10) / 10,
      distribution,
      questionTypeAvg,
      weakPoints,
      attendanceSummary,
      homeworkSummary,
      attendanceBreakdown,
      homeworkBreakdown,
      listeningBreakdown,
      validCount: validRecords.length
    };
}

/** 按正确率把班级切成高/低两段（各 27%），人数过少时对半处理 */
export function splitSegments(rates: number[]): { highCount: number; lowCount: number } {
  const n = rates.length;
  if (!n) return { highCount: 0, lowCount: 0 };
  const highCount = Math.max(1, Math.round(n * 0.27));
  const lowCount = Math.max(1, Math.round(n * 0.27));
  if (highCount + lowCount > n) return { highCount: Math.ceil(n / 2), lowCount: Math.floor(n / 2) };
  return { highCount, lowCount };
}
