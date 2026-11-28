import { attendanceKind, isTransferIn } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { normalizeOralRating, type OralRatingConfig } from '@/lib/oralRating';
import type { LessonConfig, StudentRecord } from '@/types';
import { cleanFeedbackStatus, practiceForQuestion } from '@/lib/feedbackPhrases';

export interface AdaptiveContext {
  /** 该生在本班的所有记录（含本课）；用来和之前几次小测比，判断进步或退步 */
  history?: StudentRecord[];
  /** 各课次配置；算历史课的满分时要用那一课自己的配置 */
  lessonConfigs?: { [lesson: string]: LessonConfig };
  /** 各课次班级得分率中位数（buildClassMedianRates 的结果）；用来抵消卷子难度的起伏 */
  classMedian?: Record<string, number>;
  /** 口语等附加项的档位设置；缺省用默认档位 */
  oralRating?: Partial<OralRatingConfig> | null;
}

function scoreValue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** 一行里的计分项：题型 + 计入总分的数值型自定义列，不含「口语得分」这类附加项 */
export function quizItemsOf(record: StudentRecord, config?: LessonConfig) {
  if (!config) return [];
  return [
    ...(config.questionTypes || []).filter(q => !q.excludeFromTotal).map(q => ({
      questionTypeId: q.id, name: q.name, max: q.fullScore, score: scoreValue(record.scores?.[q.id]),
    })),
    ...(config.customFields || []).filter(f => f.kind === 'number' && f.includeInTotal).map(f => ({
      questionTypeId: undefined, name: f.name, max: f.fullScore ?? 0, score: scoreValue(record.customValues?.[f.id]),
    })),
  ];
}

/**
 * 整卷得分率（0-100 的整数）。只有每一项都登记了、且没有超满分，才算「这一课可比」；
 * 缺项时算出来的百分比会和满勤那一次不公平地比较，宁可不说。
 */
export function completeQuizRate(record: StudentRecord, config?: LessonConfig): number | undefined {
  const items = quizItemsOf(record, config);
  if (!items.length) return;
  let total = 0;
  let full = 0;
  for (const { max, score } of items) {
    if (!(max > 0) || score === undefined || score > max) return;
    total += score;
    full += max;
  }
  return full > 0 ? Math.round(total / full * 100) : undefined;
}

/** 口语这类附加项的档位文案。分数按百分制看（实际数据里该题型的满分栏不可靠，见 quarterlyStats） */
function bandLabel(score: number, config?: AdaptiveContext['oralRating']): string {
  const bands = normalizeOralRating(config).bands;
  return (bands.find(b => score >= b.min) ?? bands[bands.length - 1])?.label ?? '';
}

/** `2026-11-22` → `11月22日`；日期缺失或格式不对就不带 */
function lessonDay(date?: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date || '');
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${month}月${day}日`;
}

/**
 * 相对班级的位置，一次变化至少这么多个百分点才算「挪动」。
 *
 * 口径依据「学情分析报告·初中」技能（class-analysis-junior）：判断进退要看位置变化而不是绝对分，
 * 因为每次卷子难度不同。技能给的显著阈值是相对上次的 ±10%；这里换算成「相对班级位置的百分点差」后，
 * 按真实数据校准——单次变化达到 5 的占六成多，属正常波动，所以再加一道「连续两次同向」才认定。
 */
const TREND_MIN = 5;
/** 算班中位至少要有这么多人，人太少的中位数说明不了什么 */
const MIN_CLASS_SIZE = 5;
/**
 * 得分率到了这个数就算「掌握得不错」。
 * 取自同一技能的五分段法（≥85% 优秀、70-84 良好、60-69 及格、40-59 待及格、<40 不及格）。
 * 对已经达到优秀的孩子，名次在前列里来回挪动是正常现象，不值得单独提醒家长。
 */
const SOLID_RATE = 85;

/**
 * 各课次的班级得分率中位数。
 * 只算在课、且整卷每一项都登记了的记录；一门课小测的难易会整体抬高或压低全班的分，
 * 所以「个人比上次高了多少」里混着卷子难度的起伏，要拿班级中位数把它扣掉。
 */
export function buildClassMedianRates(
  records: StudentRecord[],
  lessonConfigs?: { [lesson: string]: LessonConfig },
): Record<string, number> {
  const byLesson = new Map<number, number[]>();
  for (const record of records) {
    const kind = attendanceKind(record.attendance);
    if (kind === 'leave' || kind === 'absent') continue;
    const rate = completeQuizRate(record, lessonConfigs?.[record.lessonNumber]);
    if (rate === undefined) continue;
    byLesson.set(record.lessonNumber, [...(byLesson.get(record.lessonNumber) || []), rate]);
  }
  const result: Record<string, number> = {};
  for (const [lesson, rates] of byLesson) {
    if (rates.length < MIN_CLASS_SIZE) continue;
    rates.sort((a, b) => a - b);
    const mid = rates.length >> 1;
    result[lesson] = rates.length % 2 ? rates[mid] : Math.round((rates[mid - 1] + rates[mid]) / 2);
  }
  return result;
}

/**
 * 只在「最近三次有效小测，在班里的位置连续往同一个方向挪」时才下判断。
 *
 * 为什么不比上一次：拿真实数据算过，单次相对位置变化有六成超过 5 个百分点——
 * 这是课与课之间的正常波动，逐条说出来等于把噪音当信号，还会让家长虚惊或空欢喜。
 * 连续两次同向的只占 4%，这一小部分才值得说一句。
 */
function trendLine(record: StudentRecord, current: number | undefined, context: AdaptiveContext): string {
  if (current === undefined || !context.history?.length || !context.classMedian) return '';
  const medianOf = (lesson: number) => context.classMedian?.[lesson];
  const currentMedian = medianOf(record.lessonNumber);
  if (currentMedian === undefined) return '';
  const earlier = context.history
    .filter(r => r.studentName === record.studentName && r.lessonNumber < record.lessonNumber)
    .filter(r => !['leave', 'absent'].includes(attendanceKind(r.attendance)))
    .map(r => ({ lesson: r.lessonNumber, rate: completeQuizRate(r, context.lessonConfigs?.[r.lessonNumber]), median: medianOf(r.lessonNumber) }))
    .filter((x): x is { lesson: number; rate: number; median: number } => x.rate !== undefined && x.median !== undefined)
    .sort((a, b) => a.lesson - b.lesson)
    .slice(-2)
    .map(x => x.rate - x.median);
  const series = [...earlier, current - currentMedian];
  if (series.length < 3) return '';
  const first = series[1] - series[0];
  const second = series[2] - series[1];
  if (first >= TREND_MIN && second >= TREND_MIN) return '把孩子这三次小测放到各自的班级表现里看，一次比一次有起色，这点挺值得肯定的。';
  if (first <= -TREND_MIN && second <= -TREND_MIN) {
    // 只提醒真正需要留意的。已经考得不错的孩子，位置回落多半是别人追了上来，
    // 这时说「找找卡在哪」会让家长对着一张 98 分的卷子发愁。
    if (current >= SOLID_RATE) return '';
    return '和每次班级的整体表现对照，孩子最近三次小测有些回落。咱们先从这次失分比较多的地方入手。';
  }
  return '';
}

export function buildAdaptiveFeedback(record: StudentRecord, config: LessonConfig, shortName: string, context: AdaptiveContext = {}): string {
  const attendance = attendanceKind(record.attendance);
  const day = lessonDay(record.date);
  const intro = `${shortName}家长好呀～跟您说说第${record.lessonNumber}课${day ? `（${day}）` : ''}的情况。`;
  if (attendance === 'leave' || attendance === 'absent') {
    const status = attendance === 'leave' ? '请假了' : '没有到课';
    return `${intro}\n\n孩子这节课${status}，这次小测就先不算进来。要是想对一下补课或练习怎么安排，随时找我哦～`;
  }

  const sections: string[] = [];
  const transferIn = isTransferIn(record, config);
  const attendanceText = {
    onTime: '这节课准时到课。',
    late: '这节课到得晚了一点，下次咱们尽量提早几分钟。',
    transfer: transferIn ? '孩子这节课调到我们班，小测也一起做了。' : '孩子这节课调课，本班没有小测成绩。',
    unknown: '',
  }[attendance];
  if (attendanceText) sections.push(`【考勤】${attendanceText}`);
  const classroom = cleanFeedbackStatus(record.homeworkStatus);
  if (classroom) {
    const text = /^(很棒哦?|优秀|超赞完成)$/.test(classroom)
      ? '课堂练习做得挺好，这点继续保持哦。'
      : /^(完成|圆满完成)$/.test(classroom) ? '这次的课堂练习做完了。' : `「${classroom}」。`;
    sections.push(`【课堂练习】${text}`);
  }
  const performance = cleanFeedbackStatus(record.classPerformance);
  if (performance) sections.push(`【课堂表现】${performance}。`);

  const items = quizItemsOf(record, config);
  const scored = items.flatMap(({ name, max, score }) =>
    Number.isFinite(max) && max > 0 && score !== undefined && score <= max
      ? [{ name, max, score, lost: Number((max - score).toFixed(8)), rate: score / max }] : [],
  );
  const fullScore = getLessonFullScore(config);
  const weakest = [...scored].filter(q => q.lost > 0)
    .sort((a, b) => b.lost - a.lost || a.rate - b.rate);
  if ((attendance !== 'transfer' || transferIn) && scored.length > 0) {
    const complete = scored.length === items.length && Number.isFinite(fullScore) && fullScore > 0;
    const total = Number(scored.reduce((sum, q) => sum + q.score, 0).toFixed(8));
    const positives = [...scored].filter(q => q.rate >= .9).sort((a, b) => b.rate - a.rate);
    const format = (q: (typeof scored)[number]) => `${q.name}${q.score}/${q.max}分`;
    const rank = Number.isInteger(record.rank) && record.rank > 0 ? `，班级第${record.rank}名` : '';
    const summary = complete
      ? `这次小测满分${fullScore}分，${shortName}拿到${total}分，得分率${Math.round(total / fullScore * 100)}%${rank}。`
      : `有分数的几项是${scored.map(format).join('、')}。`;
    const strength = complete && weakest.length === 0
      ? '这次各项都是满分，挺稳的👏'
      : complete && positives.length
        ? `做得比较稳的是${positives.slice(0, 3).map(q => q.lost === 0 ? `${q.name}（满分）` : format(q)).join('、')}。`
        : '';
    const focus = weakest[0];
    const second = weakest[1];
    const priority = complete && focus
      ? (weakest.length === 1 && focus.lost <= 1
        ? `差的${focus.lost}分在${format(focus)}，把这一处订正清楚就行。`
        : `先看${format(focus)}，这项丢了${focus.lost}分。${second && (second.rate <= .6 || second.lost === focus.lost) ? `${format(second)}也可以回头看看。` : ''}`)
      : '';
    const trend = complete && fullScore ? trendLine(record, Math.round(total / fullScore * 100), context) : '';
    sections.push(`【小测】${summary}${strength}${priority}${trend}`);
  }

  // 附加项（口语得分等）：不计入小测总分，所以前面的强弱项分析看不到它。
  // 但只要这节课登记了，家长就该知道——这是真实数据里登记最多的成绩之一。
  for (const q of (config.questionTypes || []).filter(q => q.excludeFromTotal)) {
    const score = scoreValue(record.scores?.[q.id]);
    if (score === undefined) continue;
    const oral = /口语|朗读|跟读|演讲/.test(q.name);
    const label = oral ? cleanFeedbackStatus(bandLabel(score, context.oralRating)) : '';
    const denom = !oral && q.fullScore > 0 ? `/${q.fullScore}` : '';
    sections.push(`【${q.name}】这次${score}${denom}分${label ? `，${label}` : ''}。`);
  }
  // 选项型自定义列（老师自己加的列）：有值就带上，用老师填的原话
  for (const field of (config.customFields || []).filter(f => f.kind === 'select')) {
    const value = record.customValues?.[field.id];
    const text = typeof value === 'string' ? cleanFeedbackStatus(value) : '';
    if (text) sections.push(`【${field.name}】${text}。`);
  }

  const task = cleanFeedbackStatus(record.listeningStatus);
  const unfinished = /未(完成|做完|提交|交|做)|漏交|没(完成|做完|交|做)|待补/.test(task);
  const needsCheck = /正确率.{0,2}(低|偏低)|要检查|需.{0,3}(订正|检查)|不过关/.test(task);
  if (unfinished) sections.push('【课后任务】这次还没做完，麻烦您和孩子约个补做时间，先把这次的任务补齐哦。');
  else if (needsCheck) {
    const concern = /正确率.{0,2}(低|偏低)/.test(task) ? '这次正确率还可以再提一提。' : '这次的任务还要回头检查一下。';
    sections.push(`【课后任务】${concern}麻烦您提醒孩子先自己订正，再对答案看看漏了哪一步。`);
  }
  else if (task === '具体分数') {
    const score = scoreValue(record.listeningScore);
    if (score !== undefined) sections.push(`【课后任务】这次拿到${score}分。`);
  } else if (/^(很棒|很棒哦|优秀|完成|圆满完成|超赞完成)$/.test(task)) {
    sections.push(task.startsWith('很棒') || /优秀|超赞/.test(task)
      ? '【课后任务】这次做得挺好，继续保持这个节奏哦。'
      : '【课后任务】这次也做完啦。');
  } else if (task) {
    sections.push(`【课后任务】${task}。`);
  }

  if (weakest[0] && (!unfinished || weakest[0].lost >= 2)) {
    sections.push(`【小建议】${practiceForQuestion(weakest[0].name)}`);
  } else if (!weakest.length && scored.length === items.length && scored.length > 0 && !unfinished && !needsCheck) {
    sections.push('【小建议】有空可以挑一道做对的题，请孩子讲讲用了什么办法。能讲清楚，下次遇到相似题就有思路了。');
  }
  if (!sections.length) return `${intro}\n\n这节课暂时没有可以反馈的记录。有问题随时问我哦～`;
  const closing = weakest.length
    ? '订正时哪一步没想通，随时发我看看哦～'
    : '有问题随时问我哦～';
  return [intro, sections.join('\n'), closing].join('\n\n');
}
