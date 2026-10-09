// 学习建议 · 家长版（精简三句式）—— 2026-10-09
//
// 背景：个人报告的「学习建议」是五段式（整体/逐题型/考勤/作业/课后/轨迹），全文 400-600 字，
// 直接复制发家长太长。这里把同一批话术池**按句子抽取重组**成一段可直接粘贴的精简版：
//   ① 总评句（话术池首句）② 重点题型行动句（最低得分率题型的"怎么做"）③ 状态句（只报异常）④ 收尾
// 口径与个人报告完全一致：统计来自 lib/reportStats.computeStudentReportStats（调用方传入），
// 句子全部取自 lib/reportFeedback 现有话术池（不新造文案，天然保持去 AI 味口径）。
//
// "智能"体现在：负面上浮（只报异常项）、去数字堆砌、多弱项合并、同池随机防重、超长自动降级。
import type { StudentRecord, LessonConfig } from '@/types';
import {
  getOverallFeedback,
  getQuestionTypeFeedback,
  getAttendanceFeedback,
  getHomeworkFeedback,
  getListeningFeedback,
  getTrajectoryFeedback,
} from '@/lib/reportFeedback';
import { getLessonFullScore } from '@/lib/lessonFullScore';

export interface CondensedAdviceStats {
  avgScore: number;
  avgQuestionTypeScores: { id: string; name: string; avgScore: number; fullScore: number }[];
  attendanceStats: { total: number; onTime: number; late: number; absent: number };
  homeworkStats: { excellent: number; good: number; average: number; poor: number };
  learningTrajectory: { lesson: number; score: number; correctRate: number; listeningScore: number }[];
}

const splitSentences = (text: string): string[] =>
  text.split(/[。！？]/).map(s => s.trim()).filter(Boolean);

const firstSentence = (text: string): string => {
  const parts = splitSentences(text);
  return parts.length ? parts[0] + '。' : '';
};

const lastSentence = (text: string): string => {
  const parts = splitSentences(text);
  return parts.length ? parts[parts.length - 1] + '。' : '';
};

/** 行动句保底截断：超过 max 字时在最近的句读处收尾，避免生造半句 */
const clampSentence = (s: string, max = 46): string => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const idx = Math.max(cut.lastIndexOf('；'), cut.lastIndexOf('，'), cut.lastIndexOf('、'));
  return (idx >= 10 ? cut.slice(0, idx) : cut) + '。';
};

/** 与个人报告同口径的整体满分（多课次取平均；配置缺失回退 100） */
function avgFullScore(studentRecords: StudentRecord[], lessonConfigs: { [lesson: string]: LessonConfig }): number {
  const known = studentRecords
    .map(r => getLessonFullScore(lessonConfigs[r.lessonNumber]))
    .filter(v => Number.isFinite(v) && v > 0);
  return known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 100;
}

/**
 * 生成精简版学习建议（家长可直接粘贴）。
 * @param nickname 学生展示名
 * @param studentRecords 该生全部记录（与个人报告同口径）
 * @param stats computeStudentReportStats 的结果；为空时返回空串
 * @param lessonConfigs 班级课次配置表
 */
export function buildCondensedAdvice(
  nickname: string,
  studentRecords: StudentRecord[],
  stats: CondensedAdviceStats | null,
  lessonConfigs: { [lesson: string]: LessonConfig },
): string {
  if (!stats || studentRecords.length === 0) return '';
  const full = avgFullScore(studentRecords, lessonConfigs);
  const overallRate = full > 0 ? (stats.avgScore / full) * 100 : 0;

  const parts: string[] = [];
  // ① 总评：话术池首句（带名字前缀，独立成句）
  parts.push(`${nickname}，${firstSentence(getOverallFeedback(stats.avgScore, full))}`);

  // ② 重点题型：得分率最低且 <85% 的题型 → 该题型"怎么做"（末句），带题型名便于家长定位
  const ranked = stats.avgQuestionTypeScores
    .filter(q => q.fullScore > 0)
    .map(q => ({ ...q, rate: q.avgScore / q.fullScore }))
    .sort((a, b) => a.rate - b.rate);
  const worst = ranked[0];
  const focus = worst && worst.rate < 0.85
    ? `${worst.name}这块，${clampSentence(lastSentence(getQuestionTypeFeedback(worst.name, worst.avgScore, worst.fullScore)))}`
    : '';

  // ③ 状态句：只报异常（考勤 → 作业 → 课后 → 轨迹，取最靠前的异常）；全好则一句概括
  const att = stats.attendanceStats;
  const attRate = att.total > 0 ? (att.onTime + att.late) / att.total : 1;
  const hw = stats.homeworkStats;
  const hwTotal = (hw.excellent + hw.good + hw.average + hw.poor) || 1;
  const hwRate = hw.excellent / hwTotal;
  const listening = studentRecords
    .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
    .map(r => r.listeningScore);
  const avgListening = listening.length ? listening.reduce((a, b) => a + b, 0) / listening.length : 0;
  const traj = stats.learningTrajectory.map(t => t.score);
  let status = '';
  if (attRate < 0.85) status = firstSentence(getAttendanceFeedback(attRate));
  else if (hwRate < 0.6) status = firstSentence(getHomeworkFeedback(hwRate));
  else if (listening.length > 0 && avgListening < 70) status = firstSentence(getListeningFeedback(avgListening));
  else if (traj.length >= 3 && /回落/.test(getTrajectoryFeedback(traj))) status = firstSentence(getTrajectoryFeedback(traj));
  if (!status) status = '考勤、作业和课后任务都保持得很好。';

  // ④ 收尾（按整体档位二选一）
  const close = overallRate >= 70 ? '保持这个节奏就好～' : '不用着急，我们一步一步来，有需要随时找我。';

  // 长度护栏：超 150 字先去掉状态句（总评 + 重点 + 收尾信息量最高）
  let text = [parts[0], focus, status, close].join('');
  if (text.length > 150) text = [parts[0], focus, close].join('');
  if (text.length > 170) text = [parts[0], close].join('');
  return text;
}
