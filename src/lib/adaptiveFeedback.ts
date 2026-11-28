import { attendanceKind, isTransferIn } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import type { LessonConfig, StudentRecord } from '@/types';

const cleanStatus = (value?: string) => (value ?? '').replace(/[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D]/gu, '').trim().replace(/[。！!]+$/, '');

function scoreValue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function practiceFor(name: string): string {
  if (/默写|单词|词汇听写|听写/.test(name)) return '把这次写错的词圈出来，今天看中文自默一遍，隔一天再默一次。';
  if (/连词成句|句子排序|词序|句子重组/.test(name)) return '挑一道错题，把词重新排一遍，读通后再检查词序、句首大写和标点。';
  if (/完成句子|句子填空|翻译/.test(name)) return '挑一道错题，先圈出中文提示里的关键词，再把整句补写一遍，核对表达是否完整。';
  if (/选择/.test(name)) return '请孩子挑一道选错的题，圈出题干里的线索，再说说为什么选正确选项。';
  if (/阅读|完形/.test(name)) return '挑一道错题，回原文划出支持正确选项的一句话，再用自己的话讲一遍。';
  return `把「${name}」的一道错题遮住答案重做，再对照答案说一说刚才哪里改了。`;
}

export function buildAdaptiveFeedback(record: StudentRecord, config: LessonConfig, shortName: string): string {
  const attendance = attendanceKind(record.attendance);
  const intro = `${shortName}家长好呀～跟您说说第${record.lessonNumber}课的情况。`;
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

  const items = [
    ...(config.questionTypes || []).filter(q => !q.excludeFromTotal).map(q => ({
      name: q.name, max: q.fullScore, score: scoreValue(record.scores?.[q.id]),
    })),
    ...(config.customFields || []).filter(f => f.kind === 'number' && f.includeInTotal).map(f => ({
      name: f.name, max: f.fullScore ?? 0, score: scoreValue(record.customValues?.[f.id]),
    })),
  ];
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
    sections.push(`【小测】${summary}${strength}${priority}`);
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
