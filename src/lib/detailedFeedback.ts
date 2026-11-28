// 「四个一」详细版保持两段，方便直接发送或导出到教师精灵。
import type { StudentRecord, LessonConfig, ClassStats } from '@/types';
import { isQuizAssessed } from '@/lib/attendance';
import { buildAdaptiveFeedback, quizItemsOf } from '@/lib/adaptiveFeedback';
import { cleanFeedbackStatus, practiceForQuestion } from '@/lib/feedbackPhrases';
import { optionToneLevel } from '@/lib/optionTone';

const TIER_TOP = 0.9;
const TIER_MID = 0.75;
const WEAK_THRESHOLD = 0.85;

interface Item {
  name: string;
  score: number;
  full: number;
  rate: number;
  diff: number;
  diffRate: number;
}

export interface DetailedFeedback {
  text1: string;
  text2: string;
  meta: { tier: 'top' | 'mid' | 'low'; best?: Item; weak?: Item; gain?: number };
}

const RECHECK = [
  '练完请孩子说说这次改了哪一步。要是还有地方讲不清，随手圈出来发我看看。',
  '下次遇到同类题，请孩子先自己说说第一步做什么。要是还会卡住，把那一步圈出来就好。',
  '等孩子把这道题弄明白，再换个相似的例子试试，看看这个做法还能不能用上。',
];

const MAINTAIN = [
  '可以挑一道做对的题，让孩子给您讲一遍。能讲清用的是什么办法，换道题也更容易认出来。',
  '挑一道做对的题，请孩子说说他是从哪儿看出答案的。下次遇到类似的题，先从那一步找线索。',
  '复习的时候不用整张卷子重来。找一道有代表性的题，合上答案说一遍自己的思路就好。',
];

export function buildDetailedFeedback(
  record: StudentRecord,
  cfg: LessonConfig,
  stats: ClassStats,
  nickname: string,
  variant = 0,
  classSize?: number,
): DetailedFeedback {
  if (!isQuizAssessed(record, cfg)) {
    return {
      text1: buildAdaptiveFeedback(record, cfg, nickname),
      text2: '',
      meta: { tier: 'low' },
    };
  }

  const configured = quizItemsOf(record, cfg);
  const items = configured.flatMap((item): Item[] => {
    const { questionTypeId, name, max: full, score } = item;
    if (!Number.isFinite(full) || full <= 0 || score === undefined || score > full) return [];
    const hasClassAverage = questionTypeId && (stats.registeredCounts?.[questionTypeId] ?? 1) > 0;
    const avg = hasClassAverage ? (stats.avgScores?.[questionTypeId] ?? score) : score;
    return [{ name, score, full, rate: score / full, diff: score - avg, diffRate: (score - avg) / full }];
  });

  const total = items.reduce((sum, item) => sum + item.score, 0);
  const full = items.reduce((sum, item) => sum + item.full, 0);
  const complete = items.length > 0 && items.length === configured.length;
  const rate = complete ? total / full : 0;
  const tier = rate >= TIER_TOP ? 'top' : rate >= TIER_MID ? 'mid' : 'low';
  const rank = Number.isInteger(record.rank) && record.rank > 0 ? record.rank : 0;
  const rankText = rank > 0
    ? (classSize !== undefined && classSize >= rank ? `，班上${classSize}位有小测成绩的孩子里排第${rank}名` : `，班级第${rank}名`)
    : '';
  const format = (item: Item) => `${item.name}${item.score}/${item.full}分`;
  const opener = complete
    ? `${nickname}这次小测拿到${Number(total.toFixed(8))}/${full}分，得分率${Math.round(rate * 100)}%${rankText}。`
    : items.length
      ? `${nickname}这次小测先看已经有分数的几项，${items.map(format).join('、')}。`
      : `${nickname}这节课暂时没有小测分数。`;

  const perfect = items.filter(item => item.score === item.full);
  const best = [...items].sort((a, b) => b.diffRate - a.diffRate)[0];
  const classroom = cleanFeedbackStatus(record.homeworkStatus);
  const homeworkTone = optionToneLevel(classroom);
  const taskTone = optionToneLevel(cleanFeedbackStatus(record.listeningStatus));
  const strengths: string[] = [];
  if (perfect.length > 0) {
    strengths.push(`${perfect.slice(0, 3).map(item => item.name).join('、')}这次${perfect.length > 1 ? '都' : ''}拿了满分，做得挺稳的。`);
  } else if (best?.diffRate > 0.005) {
    strengths.push(`${format(best)}，比班里平均高${Number(best.diff.toFixed(1))}分，这一项发挥得不错。`);
  }
  if (homeworkTone === 'good' && taskTone === 'good') strengths.push('课堂练习和课后任务这次都做完了。');
  else if (homeworkTone === 'good') strengths.push('这次的课堂练习做完了。');
  else if (taskTone === 'good') strengths.push('课后任务这次也完成了。');

  const weak = items.filter(item => item.rate < WEAK_THRESHOLD && item.diffRate < -0.005)
    .sort((a, b) => a.diffRate - b.diffRate)[0];
  const missed = items.filter(item => item.score < item.full)
    .sort((a, b) => (b.full - b.score) - (a.full - a.score))[0];
  const focus = weak ?? missed;
  const issue = weak
    ? `这次可以先回看${format(weak)}，比班里平均低${Math.round(-weak.diffRate * 100)}个百分点。咱们拿一道原题看看，是题意没看懂，还是做到某一步时出了错。`
    : focus
      ? `可以回头看看${format(focus)}，先把其中一道错题订正清楚。`
      : '';
  const needsHomework = homeworkTone === 'bad' || homeworkTone === 'warn';
  const task = needsHomework ? `课堂练习这次是「${classroom}」。` : '';
  const index = ((variant % RECHECK.length) + RECHECK.length) % RECHECK.length;
  const text2 = focus
    ? `${practiceForQuestion(focus.name)}${RECHECK[index]}`
    : needsHomework
      ? '麻烦您和孩子约个时间，先把这次的课堂练习做完或订正。还有哪道题不明白，可以圈起来问我。'
      : complete
        ? MAINTAIN[index]
        : '课后可以请孩子挑一道课上的例题，说说自己记住了哪个做法。有哪一步讲不顺，再一起看那一步。';

  return {
    text1: [opener, strengths.join(''), issue, task].filter(Boolean).join('\n'),
    text2,
    meta: { tier, best, weak, gain: weak ? Math.max(1, Math.round((1 - weak.rate) * weak.full * 0.6)) : undefined },
  };
}
