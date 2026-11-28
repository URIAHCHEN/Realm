import { attendanceKind, isTransferIn } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { normalizeOralRating, type OralRatingConfig } from '@/lib/oralRating';
import type { LessonConfig, StudentRecord } from '@/types';

/**
 * 去掉状态文案里的表情符号，只留老师能读、家长能懂的文字。
 *
 * 必须整组清干净：一个表情往往由多个码点组成（基座 + 肤色修饰符 + 变体选择符 + 零宽连接符）。
 * 下面每一项都只匹配「一个」码点，而不是一整串组合：
 *   图形象字（基座）、肤色修饰符、国旗字母、变体选择符、默认可忽略的格式字符（含零宽连接符）、按键角标。
 * 只清「图形象形字」会漏掉肤色修饰符——`很棒哦👏🏻` 去掉 👏 后剩一个孤立的 🏻，
 * 没有基座可依附，渲染出来就是一个方块（2026-11-28 家长反馈截图里的乱码）。
 * 这里不使用 \p{Emoji}：它把数字 0-9、#、* 也算作表情，会误删分数里的字符。
 */
const EMOJI_PARTS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Variation_Selector}\p{Default_Ignorable_Code_Point}\u20E3]/gu;
const cleanStatus = (value?: string) => (value ?? '').replace(EMOJI_PARTS, '').trim().replace(/[。！!]+$/, '');

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
function scoredItems(record: StudentRecord, config?: LessonConfig) {
  if (!config) return [];
  return [
    ...(config.questionTypes || []).filter(q => !q.excludeFromTotal).map(q => ({
      name: q.name, max: q.fullScore, score: scoreValue(record.scores?.[q.id]),
    })),
    ...(config.customFields || []).filter(f => f.kind === 'number' && f.includeInTotal).map(f => ({
      name: f.name, max: f.fullScore ?? 0, score: scoreValue(record.customValues?.[f.id]),
    })),
  ];
}

/**
 * 整卷得分率（0-100 的整数）。只有每一项都登记了、且没有超满分，才算「这一课可比」；
 * 缺项时算出来的百分比会和满勤那一次不公平地比较，宁可不说。
 */
function completeRate(record: StudentRecord, config?: LessonConfig): number | undefined {
  const items = scoredItems(record, config);
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

function practiceFor(name: string): string {
  if (/默写|单词|词汇听写|听写/.test(name)) return '把这次写错的词圈出来，今天看中文自默一遍，隔一天再默一次。';
  if (/连词成句|句子排序|词序|句子重组/.test(name)) return '挑一道错题，把词重新排一遍，读通后再检查词序、句首大写和标点。';
  if (/完成句子|句子填空|翻译/.test(name)) return '挑一道错题，先圈出中文提示里的关键词，再把整句补写一遍，核对表达是否完整。';
  if (/选择/.test(name)) return '请孩子挑一道选错的题，圈出题干里的线索，再说说为什么选正确选项。';
  if (/阅读|完形/.test(name)) return '挑一道错题，回原文划出支持正确选项的一句话，再用自己的话讲一遍。';
  return `把「${name}」的一道错题遮住答案重做，再对照答案说一说刚才哪里改了。`;
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
    const rate = completeRate(record, lessonConfigs?.[record.lessonNumber]);
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
    .map(r => ({ lesson: r.lessonNumber, rate: completeRate(r, context.lessonConfigs?.[r.lessonNumber]), median: medianOf(r.lessonNumber) }))
    .filter((x): x is { lesson: number; rate: number; median: number } => x.rate !== undefined && x.median !== undefined)
    .sort((a, b) => a.lesson - b.lesson)
    .slice(-2)
    .map(x => x.rate - x.median);
  const series = [...earlier, current - currentMedian];
  if (series.length < 3) return '';
  const first = series[1] - series[0];
  const second = series[2] - series[1];
  if (first >= TREND_MIN && second >= TREND_MIN) return '最近三次小测，在班里的位置一次比一次靠前，这个势头很好。';
  if (first <= -TREND_MIN && second <= -TREND_MIN) {
    // 只提醒真正需要留意的。已经考得不错的孩子，位置回落多半是别人追了上来，
    // 这时说「找找卡在哪」会让家长对着一张 98 分的卷子发愁。
    if (current >= SOLID_RATE) return '';
    return '最近三次小测，在班里的位置一次比一次靠后，咱们一起找找卡在哪。';
  }
  return '';
}

export function buildAdaptiveFeedback(record: StudentRecord, config: LessonConfig, shortName: string, context: AdaptiveContext = {}): string {
  const attendance = attendanceKind(record.attendance);
  const day = lessonDay(record.date);
  const intro = `${shortName}家长好呀～跟您说说第${record.lessonNumber}课${day ? `（${day}）` : ''}的情况。`;
  if (attendance === 'leave' || attendance === 'absent') {
    const status = attendance === 'leave' ? '请假了' : '没有到课';
    return `${intro}\n\n孩子这节课${status}，本课没有测评成绩。如需确认补课或练习安排，随时找我～`;
  }

  const sections: string[] = [];
  const transferIn = isTransferIn(record, config);
  const attendanceText = {
    onTime: '这节课准时到课。',
    late: '这节课有迟到，下次咱们尽量提前一点到。',
    transfer: transferIn ? '这节课调入，本班有小测记录。' : '这节课登记了调课，本班没有小测成绩。',
    unknown: '',
  }[attendance];
  if (attendanceText) sections.push(`【考勤】${attendanceText}`);
  const classroom = cleanStatus(record.homeworkStatus);
  if (classroom) {
    const text = /^(完成|圆满完成|超赞完成)$/.test(classroom) ? '课堂练习已完成。' : `课堂练习登记为「${classroom}」。`;
    sections.push(`【课堂练习】${text}`);
  }
  const performance = cleanStatus(record.classPerformance);
  if (performance) sections.push(`【课堂表现】本课登记为「${performance}」。`);

  const items = scoredItems(record, config);
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
      : `目前可核对的分项有${scored.map(format).join('、')}。`;
    const strength = complete && weakest.length === 0
      ? '这次每一项都拿到了满分，继续保持～'
      : complete && positives.length
        ? `${positives.slice(0, 3).map(q => q.lost === 0 ? `${q.name}拿到满分` : format(q)).join('，')}，${positives.length === 1 ? '这项' : '这几项'}做得稳。`
        : '';
    const focus = weakest[0];
    const second = weakest[1];
    const priority = complete && focus
      ? `可以先回看${format(focus)}，这项失了${focus.lost}分${second && (second.rate <= .6 || second.lost === focus.lost) ? `；${format(second)}也值得订正` : ''}。`
      : '';
    const trend = complete && fullScore ? trendLine(record, Math.round(total / fullScore * 100), context) : '';
    sections.push(`【小测】${summary}${strength}${priority}${trend}`);
  }

  // 附加项（口语得分等）：不计入小测总分，所以前面的强弱项分析看不到它。
  // 但只要这节课登记了，家长就该知道——这是真实数据里登记最多的成绩之一。
  for (const q of (config.questionTypes || []).filter(q => q.excludeFromTotal)) {
    const score = scoreValue(record.scores?.[q.id]);
    if (score === undefined) continue;
    const label = bandLabel(score, context.oralRating);
    sections.push(`【${q.name}】这次登记了${score}分${label ? `，${label}` : ''}。`);
  }
  // 选项型自定义列（老师自己加的列）：有值就带上，用老师填的原话
  for (const field of (config.customFields || []).filter(f => f.kind === 'select')) {
    const value = record.customValues?.[field.id];
    const text = typeof value === 'string' ? cleanStatus(value) : '';
    if (text) sections.push(`【${field.name}】这次是「${text}」。`);
  }

  const task = cleanStatus(record.listeningStatus);
  const unfinished = /未(完成|做完|提交|交|做)|漏交|没(完成|做完|交|做)|待补/.test(task);
  const needsCheck = /正确率.{0,2}(低|偏低)|要检查|需.{0,3}(订正|检查)|不过关/.test(task);
  if (unfinished) sections.push('【课后任务】还有任务没完成，麻烦您和孩子确认一下补做时间。');
  else if (needsCheck) sections.push('【课后任务】这次需要再检查一遍，可以让孩子先自己订正，再核对答案。');
  else if (task === '具体分数') {
    const score = scoreValue(record.listeningScore);
    if (score !== undefined) sections.push(`【课后任务】这次登记了${score}分。`);
  } else if (/^(很棒|很棒哦|优秀|完成|圆满完成|超赞完成)$/.test(task)) {
    sections.push(task.startsWith('很棒') || /优秀|超赞/.test(task)
      ? '【课后任务】这次完成得很棒，值得表扬。'
      : '【课后任务】这次已完成。');
  } else if (task) {
    sections.push(`【课后任务】这次的登记是「${task}」。`);
  }

  if (weakest[0] && (!unfinished || weakest[0].lost >= 2)) {
    sections.push(`【小建议】${practiceFor(weakest[0].name)}`);
  } else if (!weakest.length && scored.length === items.length && scored.length > 0 && !unfinished && !needsCheck) {
    sections.push('【小建议】下次课前可以选一道这次做对的题，请孩子讲讲自己的解题思路。');
  }
  if (!sections.length) return `${intro}\n\n这次的学情还在整理，有问题随时问我～`;
  return [intro, sections.join('\n'), '有问题随时问我哦～'].join('\n\n');
}
