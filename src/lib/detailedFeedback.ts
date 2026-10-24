// 详细版个性化反馈（四段式）· 2026-10-24
//
// 口径来源：《realm-个性化反馈改造方案》+ 第6课教师精灵样例表。
// 与「四个一（精简版）」并存：精简版走 generateFourInOne，详细版走本文件。
//
// 四段：① 定位（分数/名次/段位）② 亮点（按形态分支）③ 要盯的一处（按性质分支）④ 下一步 + 鼓励
// 关键纪律：
//  - 课堂练习 = homeworkStatus，课后任务 = listeningStatus（realm 字段映射）
//  - 课堂练习「正确率低」时不夸表现；作业未完成时不夸作业
//  - 弱项必须同时满足「未达标」+「确实低于班均」，避免"80% 却说低于班均 28 个百分点"
//  - 未登记题型不参与（与 computeCategoryWeakPoints 同口径）

import type { StudentRecord, LessonConfig, ClassStats, QuestionType } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';
import { optionToneLevel } from '@/lib/optionTone';
import { inferCategory } from '@/lib/weakPoints';

// ---------- 阈值 ----------
const TIER_TOP = 0.9;
const TIER_MID = 0.75;
const WEAK_THRESHOLD = 0.85;   // 低于 85% 才算弱
const BLANK_RATE = 0.15;
const CLASS_HARD = 0.55;

// ---------- 归因库：错在哪个动作 ----------
const CAUSE_HINT: Record<string, string> = {
  词汇: '拼写和词性还没记牢',
  单词: '拼写和词性还没记牢',
  默写: '句子的细节（时态、单复数、拼写）没逐词核对',
  翻译: '整句结构没先搭好就逐词翻',
  阅读: '定位到了句子，但没和选项逐项对比',
  阅读理解: '定位到了句子，但没和选项逐项对比',
  阅读填空: '空的位置（段首/段中/段尾）没先判断，找不到复现词',
  七选五: '空的位置（段首/段中/段尾）没先判断，找不到复现词',
  信息匹配: '只找了关键词，没核对整句意思是否一致',
  语篇填词: '词形没改完（时态、单复数、词性）',
  语法填空: '给了词没变形式、没给词没填虚词',
  完形填空: '只看了本句，没接上上下文的线索',
  完形: '只看了本句，没接上上下文的线索',
  语法选择: '先凭语感选，没先判断考点',
  单项选择: '题干的关键词没划出来就选了',
  单选: '题干的关键词没划出来就选了',
  完成句子: '句子骨架没先划出来',
  连词成句: '主谓语序没先定',
  写作: '提纲没先列，边写边想',
  书面表达: '提纲没先列，边写边想',
  听力: '没先看题干，边听边忘',
  口语: '开口前没先理一遍要点',
};

/** 归因（找不到具体题型时给通用动作描述） */
export function causeHintFor(name: string): string {
  if (CAUSE_HINT[name]) return CAUSE_HINT[name];
  const cat = inferCategory({ id: '', name, fullScore: 0, order: 0 } as QuestionType);
  return CAUSE_HINT[cat] ?? '这一步的顺序没走完';
}

// ---------- 动作库：下一步练什么 ----------
const ACTION_BY_NAME: Record<string, string> = {
  词汇: '把本讲词表过两遍，重点练拼写和词性，错词单独抄一页；下次课前听写一遍',
  单词: '把本讲词表过两遍，重点练拼写和词性，错词单独抄一页；下次课前听写一遍',
  默写: '先整句读两遍再动笔，写完逐词对一遍时态、单复数和拼写',
  翻译: '先把中文拆成「谁—做什么—怎么样」，再定英文主干，最后补时态和固定搭配',
  单选: '每题在题干里划出决定答案的那个词，四个选项逐个排除后再选',
  单项选择: '每题在题干里划出决定答案的那个词，四个选项逐个排除后再选',
  语法选择: '先判断考点（时态/非谓语/介词），再排除干扰项，别凭语感选',
  阅读: '题干关键词先划出来，回文定位到句，再对比选项差异',
  阅读理解: '题干关键词先划出来，回文定位到句，再对比选项差异',
  阅读填空: '先看空的位置判断句子功能，再找复现词和指代词',
  七选五: '先看空的位置判断句子功能，再找复现词和指代词',
  信息匹配: '先划题干关键词，再逐段核对整句意思，别只看同词',
  语篇填词: '首字母定范围 → 看空前后定词性 → 最后定时态、单复数、比较级',
  语法填空: '先看有没有给词：给了词就变形式，没给词就填虚词',
  完形填空: '先通读一遍抓主线，再回填，注意上下句的提示词',
  完形: '先通读一遍抓主线，再回填，注意上下句的提示词',
  完成句子: '先划句子骨架（主谓宾），再填所缺成分，写完读一遍通不通',
  连词成句: '先找主语和谓语，再排状语位置，做完朗读一遍确认语序',
  写作: '动笔前先列三行提纲（开头—要点—结尾），写完留两分钟查时态和拼写',
  书面表达: '动笔前先列三行提纲（开头—要点—结尾），写完留两分钟查时态和拼写',
  听力: '听前先扫题干和选项，听的时候只抓关键信息，别逐词翻译',
  口语: '开口前先用三个关键词理一遍要点，再连成句子',
};

export function actionFor(name: string): string {
  if (ACTION_BY_NAME[name]) return ACTION_BY_NAME[name];
  const cat = inferCategory({ id: '', name, fullScore: 0, order: 0 } as QuestionType);
  return ACTION_BY_NAME[cat] ?? '把这一步拆成小动作，一次只改一个，练三次形成习惯';
}

// ---------- 鼓励库：三档 × 3 句 ----------
const ENCOURAGE_TOP = [
  '这个分数不是运气——该拿的分基本都拿到了，方法是对的。',
  '能稳定在这个位置，说明课上的东西是真听进去了，不只是刷题刷出来的。',
  '这一档分数在班里是标杆，接下来可以往「更难的题也不丢分」上走。',
];
const ENCOURAGE_MID = [
  '进步是看得见的，只是还没到爆发点，再稳两次就上去了。',
  '这个位置最容易再往上跳一档，因为地基已经在了，缺的是把某一项补稳。',
  '整体状态在往上走，接下来把最弱那一项解决，分数会更整齐。',
];
const ENCOURAGE_LOW = [
  '分数低不等于学不会，很多时候只是某几个动作没形成习惯。',
  '这次能拿到这些分，说明基础不是空的，缺的是把会做的做对。',
  '不用急着全面补，先把一件事做扎实，下一次就能看到变化。',
];

function encourageFor(tier: 'top' | 'mid' | 'low', variant: number): string {
  const pool = tier === 'top' ? ENCOURAGE_TOP : tier === 'mid' ? ENCOURAGE_MID : ENCOURAGE_LOW;
  return pool[((variant % pool.length) + pool.length) % pool.length];
}

// ---------- 数据整理 ----------
interface Item {
  name: string;
  score: number;
  full: number;
  rate: number;
  avg: number;
  classRate: number;
  diff: number;      // 分数差（本人 - 班均）
  diffRate: number;  // 得分率差
}

function zoneOf(rank: number, total: number): string {
  if (!rank) return '';
  if (rank === 1) return '全班第一';
  if (rank <= 3) return '班级前三';
  const pos = rank / Math.max(1, total);
  if (pos <= 0.4) return '班级前段';
  if (pos <= 0.7) return '班级中段';
  return '班级后段';
}

export interface DetailedFeedback {
  text1: string;
  text2: string;
  meta: { tier: 'top' | 'mid' | 'low'; best?: Item; weak?: Item; gain?: number };
}

/**
 * 生成详细版四段式反馈。
 * @param classSize 班级参评人数（用于名次段位；缺省用 rank 自身兜底）
 */
export function buildDetailedFeedback(
  record: StudentRecord,
  cfg: LessonConfig,
  stats: ClassStats,
  nickname: string,
  variant = 0,
  classSize?: number,
): DetailedFeedback {
  if (isAbsentRecord(record)) {
    const short = nickname;
    return {
      text1: `${short}这次${record.attendance}，没有参与本讲测评。落下的内容我单独跟他补，测评这块不用着急。`,
      text2: '下一步：等孩子回来，我先把本讲的核心内容过一遍，再安排一次针对性的练习；家长这边不用额外加量。',
      meta: { tier: 'low' },
    };
  }

  const qts = (cfg.questionTypes || []).filter(qt => !qt.excludeFromTotal);
  const items: Item[] = qts
    .map(qt => {
      const score = record.scores?.[qt.id];
      if (typeof score !== 'number' || !Number.isFinite(score)) return null;
      const full = Number(qt.fullScore) || 0;
      if (full <= 0) return null;
      const avg = stats.avgScores?.[qt.id] ?? score;
      return {
        name: qt.name,
        score,
        full,
        rate: score / full,
        avg,
        classRate: avg / full,
        diff: score - avg,
        diffRate: (score - avg) / full,
      };
    })
    .filter((x): x is Item => !!x);

  const fullSum = items.reduce((a, b) => a + b.full, 0);
  const scoreSum = items.reduce((a, b) => a + b.score, 0);
  const rate = fullSum > 0 ? scoreSum / fullSum : 0;
  const tier: 'top' | 'mid' | 'low' = rate >= TIER_TOP ? 'top' : rate >= TIER_MID ? 'mid' : 'low';
  const size = classSize && classSize > 0 ? classSize : Math.max(record.rank || 1, 1);
  const zone = zoneOf(record.rank || 0, size);

  // ① 定位
  const pct = Math.round(rate * 100);
  const rankText = record.rank ? `班级第 ${record.rank} 名${zone ? `（${zone}）` : ''}` : '班级排名未出';
  const opener = `${nickname}这次 ${Math.round(scoreSum * 10) / 10}/${Math.round(fullSum * 10) / 10}（${pct}%），${rankText}。`;

  // ② 亮点
  const perfect = items.filter(i => i.rate >= 0.999);
  const above = items.filter(i => i.diffRate > 0.005 && i.rate < 0.999);
  const best = [...items].sort((a, b) => b.diff - a.diff)[0];
  const homeworkGood = optionToneLevel(record.homeworkStatus) === 'good';
  const listeningGood = optionToneLevel(record.listeningStatus) === 'good';
  let praise = '';
  if (perfect.length >= 2) {
    const names = perfect.slice(0, 5).map(i => i.name).join('、');
    const detail = perfect.slice(0, 2).map(i => `${i.name} ${i.score}/${i.full}`).join('、');
    praise = `最值得说的是${names}这几块全部拿满——${detail}。满分不是靠临场反应，是知识已经形成了稳定的手感，这一块后面可以少花时间。`;
  } else if (perfect.length === 1) {
    const p0 = perfect[0];
    const extra = above.sort((a, b) => b.diff - a.diff)[0];
    praise = `${p0.name}拿了满分（${p0.score}/${p0.full}），这是最扎实的一块。`;
    if (extra) praise += `另外${extra.name}也高出班均 ${Math.round(extra.diff * 10) / 10} 分，说明会的不止一处。`;
  } else if (best && best.diff >= 1.5) {
    praise = `${best.name}是这次最稳的一块，${best.score}/${best.full}，比班均高 ${Math.round(best.diff * 10) / 10} 分。这一项能稳住，说明平时练的量和方向都对，不是碰巧做对。`;
  } else if (above.length > 0) {
    const a0 = above.sort((a, b) => b.diff - a.diff)[0];
    praise = `${a0.name}在班均之上（${a0.score}/${a0.full}），${above.length} 个板块高于班均，基础是有的。`;
  } else if (homeworkGood) {
    praise = '这次作业完成质量不错，态度上没问题——这一点比单次分数更重要，先把它保持住。';
  } else {
    praise = '这堂课跟得比较稳，该动笔的时候没落下，只是分数还没反映出来。';
  }
  // 习惯补充（后段学生不写，避免"分数低还夸习惯"的违和）
  if (tier !== 'low') {
    if (homeworkGood && listeningGood) {
      praise += ' 课堂练习和课后任务都给到了「很棒」，课上跟得住、课下能落地——这套习惯比一次高分更值钱。';
    } else if (listeningGood) {
      praise += ' 课后任务完成得很扎实，课下的功夫没落下，这一点比单次分数更值得肯定。';
    } else if (homeworkGood) {
      praise += ' 课堂练习完成得很好，课上跟得住，说明听讲是有效的。';
    }
  }

  // ③ 要盯的一处
  const weak = items
    .filter(i => i.rate < WEAK_THRESHOLD && i.diffRate < -0.005)
    .sort((a, b) => a.diffRate - b.diffRate)[0];
  let issue = '';
  if (!weak) {
    issue = tier === 'top'
      ? '目前没有明显短板，各板块都在班均之上。接下来不是补漏，而是把会做的做更快、更稳，把时间省给难题。'
      : '这次没有明显的弱项，各板块比较均衡，说明基础面是完整的，下一步是提速度。';
  } else {
    const gapPct = Math.round(Math.abs(weak.diffRate) * 100);
    const weakRate = Math.round(weak.rate * 100);
    const classRate = Math.round(weak.classRate * 100);
    const cause = causeHintFor(weak.name);
    if (weak.rate < BLANK_RATE) {
      issue = `最需要补的是${weak.name}：${weak.score}/${weak.full}，这一项基本是空白。好消息是空白项的提分空间最大——它考的是固定步骤，把「${cause}」这一步学会，分数立刻就能拿到。`;
    } else if (weak.classRate < CLASS_HARD && weak.rate < CLASS_HARD) {
      issue = `要说需要再抓的，是${weak.name}（${weak.score}/${weak.full}）。这次这一项全班都不高（班均 ${classRate}%），不是他一个人的问题——题目对这一步的要求比较细，孩子做到了大部分，卡在最后收口上。`;
    } else if (weak.rate < 0.6) {
      issue = `要盯的是${weak.name}：${weak.score}/${weak.full}，得分率 ${weakRate}%，比班均低 ${gapPct} 个百分点。不是不会，问题出在「${cause}」，属于练几次就能稳下来的类型。`;
    } else {
      issue = `还有空间的是${weak.name}：${weak.score}/${weak.full}，比班均低 ${gapPct} 个点。差距不算大，但这是最容易再涨的一块——扣分点很具体：「${cause}」，把这一步改过来，这几分的性价比最高。`;
    }
  }

  // ④ 下一步 + 鼓励
  const encourage = encourageFor(tier, variant);
  let text2: string;
  if (!weak) {
    text2 = `下一步：保持现在的节奏，课后任务按时交、错题当天过一遍，下节课我给他加一点难度，看看能不能把速度也提上来。 ${encourage}`;
  } else {
    const action = actionFor(weak.name);
    const steps = action.split('；').filter(Boolean);
    const gain = Math.max(1, Math.round((1 - weak.rate) * weak.full * 0.6));
    const plan = weak.rate < 0.45 && steps.length > 1
      ? `${weak.name}先只做第一步——${steps[0]}。这一步稳了，再往下加。`
      : steps.length > 1
        ? `${weak.name}分两步走：${steps[0]}；${steps[1]}。`
        : `${weak.name}就练这一件事：${steps[0]}。`;
    text2 = `下一步：${plan} 这一项补起来大概能多拿 ${gain} 分左右，下次课我先看这里的变化。 ${encourage}`;
  }

  return {
    text1: `${opener}\n${praise}\n${issue}`,
    text2,
    meta: { tier, best, weak, gain: weak ? Math.max(1, Math.round((1 - weak.rate) * weak.full * 0.6)) : undefined },
  };
}
