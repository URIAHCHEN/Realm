import type { StudentRecord, ClassStats, LessonConfig, OralRatingConfig } from '@/types';
import { isAbsentRecord, isTransferIn, isTransferRecord, attendanceKind, isQuizAssessed } from '@/lib/attendance';
import { computeCategoryWeakPoints, formatCategoryWeakPoint, isQtStrong } from '@/lib/weakPoints';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { buildAdaptiveFeedback, completeQuizRate, quizItemsOf, type AdaptiveContext } from '@/lib/adaptiveFeedback';
import { cleanFeedbackStatus, practiceForQuestion } from '@/lib/feedbackPhrases';
import { rateOralScore } from '@/lib/oralRating';
import { optionToneLevel } from '@/lib/optionTone';
import { createStudentActivityContext, isStudentActiveAtLesson, isStudentActiveForRange } from '@/lib/studentEligibility';
import { isCumulativeFullAttendance, isListeningEligible, listeningScoreOf } from '@/lib/leaderboardRules';

// 生成短昵称（三字取后两字，两字取最后一字叠词）
export function generateShortNickname(fullName: string): string {
  if (fullName.length >= 3) {
    return fullName.slice(-2);
  } else if (fullName.length === 2) {
    const lastChar = fullName.slice(-1);
    return lastChar + lastChar;
  }
  return fullName;
}

// 生成个性化私发反馈

/**
 * 动态可选参数：把「本课次表格里的字段」全部变成可用参数。
 *  - 每个题型（含口语得分这类不计入总分的附加项）：【题型名】= 得分，【题型名得分率】= 百分比
 *  - 附加项（口语等）额外给一个【题型名评价】= 自动判定的档位文案（如「很棒哦👍」）
 *  - 每个自定义列：【列名】= 填写内容
 * 与固定参数同名的字段跳过（避免覆盖语义）。
 */
export interface TemplateVar { key: string; desc: string }

const FIXED_VAR_NAMES = new Set([
  '学生昵称', '学生短昵称', '课次', '考勤', '课堂表现', '作业', '课后任务', '乐听说',
  '成绩详情', '总分', '满分', '排名', '正确率', '薄弱项', '作业内容', '学习建议', '表彰类型', '表彰内容',
]);

export function buildDynamicVariables(cfg: LessonConfig | undefined | null): TemplateVar[] {
  if (!cfg) return [];
  const out: TemplateVar[] = [];
  (cfg.questionTypes || []).forEach(qt => {
    const n = (qt.name || '').trim();
    if (!n || FIXED_VAR_NAMES.has(n)) return;
    out.push({ key: `【${n}】`, desc: `${n}：本生得分` });
    out.push({ key: `【${n}得分率】`, desc: `${n}：本生得分率` });
    if (qt.excludeFromTotal) {
      out.push({ key: `【${n}评价】`, desc: `${n}：自动判定档位（如 很棒哦👍）` });
    }
  });
  (cfg.customFields || []).forEach(cf => {
    const n = (cf.name || '').trim();
    if (!n || FIXED_VAR_NAMES.has(n)) return;
    out.push({ key: `【${n}】`, desc: `${n}：${cf.kind === 'number' ? '分数' : '选项内容'}` });
  });
  return out;
}

/**
 * 某行去掉标签（以及老师写的字段名标题）后若再无内容，就整行删掉（避免"口语得分："这种空标签）。
 * fieldName 支持数组：老师写的前缀未必等于题型名 —— 例如题型叫「口语得分」，
 * 但行首常写成「口语评价：」或「口语：」，只按题型名剥会剩下"口语评价："这种空壳。
 */
function dropLineIfLabelOnly(text: string, label: string, value: string, fieldName?: string | string[]): string {
  if (value !== '') return text;
  const names = Array.isArray(fieldName) ? fieldName : (fieldName ? [fieldName] : []);
  return text
    .split('\n')
    .filter(line => {
      if (!line.includes(label)) return true;
      let rest = line.replace(label, '');
      // 行形如「口语得分：【口语得分】」：标题里的字段名也要一起剥掉才算空
      names.forEach(n => { if (n) rest = rest.split(n).join(''); });
      // 2026-10-23 修「空标签残留」：两类都删——
      //  ① 剥掉占位符+字段名后完全没内容；
      //  ② 「纯标签行」：有效文字 ≤6 个字且以冒号/顿号结尾（如「⚠️ 还要盯的：」——4 个字属标签）；
      //  ③ 占位符后面老师写了真实内容（如「（多开口读）」）→ 行尾不是冒号 → 保留
      const plain = rest.replace(/[\s:：|｜·—*（）()、,，-]/g, '');
      if (plain.length === 0) return false;
      if (plain.length <= 6 && /[：:|｜·—-]\s*$/.test(rest)) return false;
      return true;
    })
    .join('\n');
}

/**
 * 变量填充的统一入口（2026-10-17 修「空值占位符字面泄露」）：
 *  · 有值 → 替换占位符；
 *  · 无值 → 先删掉「剥掉占位符与字段名后只剩标点」的行，再把残留占位置换成空串。
 * 背景：原来多个可选变量（课堂表现/作业内容/学习建议…）在无值时直接 .replace(…, '')，
 * 但模板行里带字段名标签（如「薄弱项：【薄弱项】」）时行不会被删 → 家长收到【薄弱项】字面量。
 */
function fillVar(template: string, placeholder: string, value: string, fieldName?: string): string {
  if (value !== '') return template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  return dropLineIfLabelOnly(template, placeholder, '', fieldName)
    .replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
}

/**
 * 附加项评价参数（【口语得分评价】）的行首候选写法。
 * 老师可能写「口语评价：」「口语：」「口语得分档位：」——都得能在无判定时整行删掉，
 * 否则家长会收到一行只有前缀没有内容的空壳。
 */
function ratingFieldNameCandidates(qtName: string): string[] {
  const short = qtName.replace(/(得分|成绩|分数)$/g, '');
  return [
    `${qtName}评价`, `${short}评价`, `${qtName}档位`, `${short}档位`,
    qtName, short, '评价', '档位', '等级',
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);
}

/**
 * 把题型分数写成模板参数，并清掉"未登记 → 只剩标签"的行。
 * 未登记（scores 里没有该键）与真实 0 分区分开：0 分会照实写 0。
 *
 * @param ratingByQtId 附加项（口语等）的自动判定档位，键为题型 id。
 *   未登记 / 请假缺勤时不应有对应项 —— 此时【X评价】按空值处理并删掉只剩标签的行，
 *   绝不写出「再加油💪」这类误导家长的评价。
 */
export function applyScoreVariables(
  template: string,
  record: StudentRecord,
  cfg: LessonConfig | undefined | null,
  ratingByQtId?: Record<string, string>
): string {
  let out = template;
  (cfg?.questionTypes || []).forEach(qt => {
    const n = (qt.name || '').trim();
    if (!n || FIXED_VAR_NAMES.has(n)) return;
    const raw = record.scores?.[qt.id];
    const has = typeof raw === 'number';
    const scoreText = has ? String(raw) : '';
    const rateText = has && qt.fullScore > 0 ? `${Math.round((raw / qt.fullScore) * 1000) / 10}` : '';
    const scoreLabel = `【${n}】`;
    const rateLabel = `【${n}得分率】`;
    // 注意顺序：必须在"占位符还在"的时候判断该行是否只剩标签 ——
    // 先替换成空串再判断，行里已经没有占位符，判断必然失效（断言抓出来的）
    out = dropLineIfLabelOnly(out, scoreLabel, scoreText, n);
    out = dropLineIfLabelOnly(out, rateLabel, rateText, n);
    out = out.replace(new RegExp(escapeRegExp(scoreLabel), 'g'), scoreText);
    out = out.replace(new RegExp(escapeRegExp(rateLabel), 'g'), rateText);

    // 附加项档位评价（如【口语得分评价】→ 很棒哦👍）
    if (qt.excludeFromTotal) {
      const ratingLabel = `【${n}评价】`;
      const ratingText = (ratingByQtId?.[qt.id] || '').trim();
      out = dropLineIfLabelOnly(out, ratingLabel, ratingText, ratingFieldNameCandidates(n));
      out = out.replace(new RegExp(escapeRegExp(ratingLabel), 'g'), ratingText);
    }
  });
  return out;
}

/** 正则转义（题型名可能含 * ( ) 等字符） */
function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 附加项（口语等）的档位判定表：题型 id → 档位文案。
 * 私发反馈与「四个一」共用这一份，保证两条生成路径给出的评价完全一致。
 * 未登记 / 请假缺勤的记录不会出现在表里（消费方据此删掉只剩标签的行）。
 */
export function buildRatingByQtId(
  record: StudentRecord,
  lessonConfig: LessonConfig | undefined | null,
  stats: ClassStats,
  oralCfg?: OralRatingConfig
): Record<string, string> {
  const out: Record<string, string> = {};
  (lessonConfig?.questionTypes || []).forEach(qt => {
    if (!qt.excludeFromTotal) return;
    const r = rateOralScore(
      record.scores?.[qt.id],
      qt.fullScore,
      stats.avgScores[qt.id] || 0,
      stats.registeredCounts?.[qt.id] || 0,
      isAbsentRecord(record),
      oralCfg
    );
    if (r) out[qt.id] = r.label;
  });
  return out;
}

export function generatePrivateFeedback(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  nickname: string,
  templateOverride?: string,
  oralCfg?: OralRatingConfig,
  extraVars?: Record<string, string>,
  adaptive?: Omit<AdaptiveContext, 'oralRating'>,
): string {
  if (lessonConfig.privateFeedbackMode === 'template') {
    return generatePersonalFeedback(record, lessonConfig, stats, nickname, templateOverride, oralCfg, extraVars);
  }
  const name = nickname === record.studentName ? generateShortNickname(nickname) : nickname;
  // 口语档位沿用上面同一个 oralCfg；历史记录与各课配置由调用方给，给不到就只看本课
  return buildAdaptiveFeedback(record, lessonConfig, name, { ...adaptive, oralRating: oralCfg });
}

export function generatePersonalFeedback(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  nickname: string,
  templateOverride?: string,
  /** 口语等附加项的档位判定配置；缺省用默认档位 */
  oralCfg?: OralRatingConfig,
  /** 扩展变量（如 【学习建议】），由调用方按生成口径计算后注入 */
  extraVars?: Record<string, string>
): string {
  const shortNickname = generateShortNickname(nickname);
  // 句内只保留文字（去掉选项里的 emoji/符号）：家长消息里"孩子请假🏫"读着别扭
  const spokenAttendance = (record.attendance || '').replace(/[^\u4e00-\u9fa5A-Za-z]/g, '') || '未到课';
  if (isAbsentRecord(record)) {
    return `${shortNickname}家长您好！\n\n第${record.lessonNumber}课孩子${spokenAttendance}，未参加本讲测评；落下的内容与补课安排，我会另行跟您同步。`;
  }
  if (isTransferRecord(record) && !isTransferIn(record, lessonConfig)) {
    // 调出（无小测数据）：本次课的小测在原班级完成，本班只记录考勤/作业/口头表现
    const hw = record.homeworkStatus ? `本班这边记到的作业情况是「${record.homeworkStatus}」。` : '';
    return `${shortNickname}家长您好！\n\n第${record.lessonNumber}课孩子${spokenAttendance}，本讲测评在原班级完成，成绩以原班级为准。${hw}\n有需要协调的随时找我。`;
  }
  const weakPoints = computeCategoryWeakPoints(record, lessonConfig.questionTypes, stats.avgScores, undefined, stats.registeredCounts);
  const baseTemplate = (templateOverride != null ? templateOverride : lessonConfig.feedbackTemplate) || '';
  let template = baseTemplate;

  // 附加项（口语等）的自动档位：与学情表徽标同一份实现，保证「表里看到的」和「发给家长的」一致。
  // 班均只含已登记值（stats.avgScores 口径），样本量取 registeredCounts —— 人数太少时
  // rateOralScore 内部会自动只用固定分数线，不做相对微调。
  const ratingByQtId = buildRatingByQtId(record, lessonConfig, stats, oralCfg);
  
  // 构建成绩详情（区分「未登记」与「真实 0 分」：未登记的题型不写 0/满分，
  // 避免家长以为孩子考了 0 分——与 applyScoreVariables 的口径保持一致，2026-10-17 修正）
  const scoreDetails = lessonConfig.questionTypes.map(qt => {
    const raw = record.scores[qt.id];
    const avgScore = stats.avgScores[qt.id] || 0;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return `• ${qt.name}：本次未登记`;
    }
    const score = raw;
    const diff = score - avgScore;
    const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    return `• ${qt.name}：${score}/${qt.fullScore}分（班均${avgScore.toFixed(1)}，${diffText}）`;
  }).join('\n');
  
  // 计算满分（统一来源：题型满分 + 计入总分的自定义列满分）
  const fullScore = getLessonFullScore(lessonConfig);
  
  
  // 课堂表现缺失时删掉该行（避免留下"🙋 课堂表现："这种空标签）—— 用统一的 dropLineIfLabelOnly，
  // 字段名标签（"课堂表现"）也要一起剥掉才算空，否则行删不掉、占位符原样漏给家长
  template = dropLineIfLabelOnly(template, '【课堂表现】', (record.classPerformance || '').trim(), '课堂表现');

  // 薄弱项（2026-10-23 用户口径更新）：有弱项 → 列板块；无弱项 → **整行不显示**
  //（"要盯的地方"这行连同标签一起删掉，复制的内容里不出现薄弱项字样；四个一的"待提升"仍有兜底句）
  template = fillVar(template, '【薄弱项】', weakPoints.length > 0 ? weakPoints.map(formatCategoryWeakPoint).join('、') : '', '薄弱项');
  
  // 自定义列：占位符替换 + 未使用的自动追加
  const customFields = lessonConfig.customFields || [];
  const customVals = record.customValues || {};
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const customDisplay = (kind: 'select' | 'number', id: string): string => {
    const v = customVals[id];
    if (v === '' || v == null) return '';
    return kind === 'number' ? `${v}分` : String(v);
  };
  const rawTemplate = baseTemplate;
  customFields.forEach(cf => {
    const label = '【' + cf.name + '】';
    const text = customDisplay(cf.kind, cf.id);
    template = dropLineIfLabelOnly(template, label, text, cf.name);   // 先判断（占位符仍在）
    template = template.replace(new RegExp(escRe(label), 'g'), text);
  });
  // 题型（含口语得分等附加项）也作为可用参数；附加项额外支持【X评价】档位
  template = applyScoreVariables(template, record, lessonConfig, ratingByQtId);

  // 可选变量：空值时删「空壳行」而不是留字面占位符（2026-10-17）
  template = fillVar(template, '【作业内容】', lessonConfig.homeworkText || '', '作业内容');
  template = fillVar(template, '【学习建议】', extraVars?.['【学习建议】'] ?? '', '学习建议');
  template = fillVar(template, '【作业】', record.homeworkStatus || '', '作业');
  const listeningText = Number(record.listeningScore) > 0
    ? `${record.listeningScore}分`
    : (record.listeningStatus && record.listeningStatus !== '具体分数' ? record.listeningStatus : '');
  template = fillVar(template, '【课后任务】', listeningText, '课后任务');
  template = fillVar(template, '【乐听说】', listeningText, '乐听说');

  // 替换模板变量
  // 2026-10-23 用户口径：学生称呼统一用短昵称（如 诗钰）；「全名」参数不再区分
  //（【学生昵称】与【学生短昵称】均解析为短昵称，老模板不受影响）
  let feedback = template
    .replace(/【学生昵称】/g, shortNickname)
    .replace(/【学生短昵称】/g, shortNickname)
    .replace(/【课次】/g, record.lessonNumber.toString())
    .replace(/【考勤】/g, record.attendance || '')
    .replace(/【课堂表现】/g, record.classPerformance || '')
    .replace(/【作业】/g, record.homeworkStatus || '')
    .replace(/【课后任务】|【乐听说】/g, Number(record.listeningScore) > 0
      ? `${record.listeningScore}分`
      : (record.listeningStatus && record.listeningStatus !== '具体分数' ? record.listeningStatus : ''))
    .replace(/【成绩详情】/g, scoreDetails)
    .replace(/【总分】/g, record.totalScore.toString())
    .replace(/【满分】/g, fullScore.toString())
    .replace(/【排名】/g, record.rank.toString())
    .replace(/【正确率】/g, record.correctRate.toString())
    .replace(/【作业内容】/g, lessonConfig.homeworkText)
    .replace(/【学习建议】/g, extraVars?.['【学习建议】'] ?? '');

  // 删行可能留下连续空行 → 折叠为一个空行（排版整齐）
  feedback = feedback.replace(/\n{3,}/g, '\n\n');

  // 模板未引用、但已填写的自定义列 → 末尾自动附上，保证“直接可用”
  const leftover = customFields.filter(cf => {
    const v = customVals[cf.id];
    return (v !== '' && v != null) && !rawTemplate.includes('【' + cf.name + '】');
  });
  if (leftover.length > 0) {
    feedback += '\n\n' + leftover.map(cf => `📋 ${cf.name}：${customDisplay(cf.kind, cf.id)}`).join('\n');
  }

  return feedback;
}

// 「四个一」默认模板与可用占位符（可在反馈工作台旁边直接改写；留空即用此默认结构）
// 参考教辅推荐（家长常问「该买什么资料」，这里给一份精选清单）
// 原则：只留最值得买的、按需自选；听说练习与难度调节各并成一行，不堆砌。
// 教辅目录（2026-10-23）：从"固定清单"改为"按学员长期弱项挑"，避免给家长推无关资料
const MATERIAL_ITEMS: Record<string, string> = {
  语法: '语法：《哈佛英语》语法专项（初中全一册，不分年级）',
  完形: '完形：《哈佛英语》完形填空（按年级选）',
  阅读: '阅读：《英语时文阅读》（期刊，题材新、贴近时事）',
  写作: '写作：《新东方中考英语满分作文》',
  词汇: '词汇：先把校本词汇表默写过关（可配合【单词短语默写表】）',
  听力: '听说：每天跟读校本课文 10 分钟，想加练再用《蓝皮英语》听力',
  口语: '口语：每天跟读 10 分钟，录一段发给老师听',
};

/** 按学员的长期薄弱板块生成教辅推荐（最多 3 条；没有明显弱项时给"先吃透课内"的建议） */
export function buildMaterialsBlock(weakCategories: string[] = []): string {
  const picks = weakCategories.map(c => MATERIAL_ITEMS[c]).filter(Boolean).slice(0, 3);
  if (picks.length === 0) {
    return '📚 参考教辅：先把课内材料吃透——课本、校本练习和错题本，比多买一本更管用。';
  }
  return ['📚 参考教辅（按孩子的薄弱处挑，不必都买）：', ...picks.map(l => `· ${l}`)]
    .join('\n');
}

/** 兼容历史引用（旧版固定清单） */
export const FOUR_IN_ONE_MATERIALS = [
  '📚 参考教辅：先把课内材料吃透——课本、校本练习和错题本，比多买一本更管用。',
].join('\n');

export const DEFAULT_FOUR_IN_ONE_TEMPLATE =
`【第【课次】课 · 【昵称】】
【开场】
【优秀表现】
【待提升】
【下一步】【新学员补充】
【参考教辅】
【结尾】`;

export const FOUR_IN_ONE_VARIABLES: { key: string; desc: string }[] = [
  { key: '【课次】', desc: '当前课次' },
  { key: '【昵称】', desc: '学生昵称' },
  { key: '【开场】', desc: '开场语，随「换一版措辞」轮换' },
  { key: '【场景引导】', desc: '按课次阶段自动带的一句引导语' },
  { key: '【优秀表现】', desc: '自动：本讲亮点' },
  { key: '【待提升】', desc: '自动：薄弱板块 / 作业 / 考勤' },
  { key: '【下一步】', desc: '自动：巩固动作' },
  { key: '【学习建议】', desc: '自动：三句式学习建议（精简版，可直接发家长）' },
  { key: '【素材】', desc: '课堂照片 / 视频链接' },
  { key: '【新学员补充】', desc: '勾选「新学员」时自动补一句，否则留空' },
  { key: '【参考教辅】', desc: '教辅推荐清单（3 行），可通过「附参考教辅」开关整块隐藏' },
  { key: '【结尾】', desc: '按场景轮换的收尾语 / 行动召唤' },
];

// 三类场景各自的话术包：开场（6 版）、结尾（3-4 版）、场景引导语
type FourInOnePack = { openers: string[]; closings: string[]; intro: string };
export const FOUR_IN_ONE_PACKS: Record<'daily' | 'afterclass' | 'comm', FourInOnePack> = {
  daily: {
    intro: '',
    openers: [
      '【昵称】家长好呀～跟您说说孩子第【课次】课的情况。',
      '【昵称】家长好，第【课次】课有几处值得跟您说说。',
      '【昵称】家长您好，跟您同步一下第【课次】课的学习情况。',
      '【昵称】家长好呀，给您发一下第【课次】课的反馈。',
      '【昵称】家长好，咱们一起看看孩子第【课次】课的情况。',
      '【昵称】家长好呀～第【课次】课孩子学得怎么样，我跟您具体说说。',
    ],
    closings: [
      '有问题随时问我哦～',
      '孩子练的时候碰到问题，发我看看就好。',
      '有哪一处您想了解得更细，随时找我聊。',
      '有什么拿不准的，您让孩子过来问我就好。',
      '孩子在家练得怎么样，您方便时也可以跟我说说。',
      '先从这一小步来，有疑问随时找我哦。',
    ],
  },
  afterclass: {
    intro: '这节课可以先挑一处订正，再看同类题能不能自己做对。\n',
    openers: [
      '【昵称】家长好呀～课上到第【课次】节了，跟您说说这一节值得留意的地方。',
      '【昵称】家长好，发您第【课次】课的情况，咱们看看接下来怎么练。',
      '【昵称】家长您好，第【课次】课的情况想跟您对一下。',
      '【昵称】家长好呀～跟您聊聊孩子这节课的表现和课后的安排。',
      '【昵称】家长好，咱们用第【课次】课的表现看看下一步先抓哪里。',
      '【昵称】家长好呀，跟您简单说说孩子第【课次】课的情况。',
    ],
    closings: [
      '练的时候可以让孩子讲讲怎么想的，讲到卡住的地方，随时发我看看。',
      '先练这一处，有问题咱们再一起看。',
      '您方便时也可以跟我说说，孩子在家做起来顺不顺。',
      '订正时有哪一步想不明白，留着来问我就好。',
      '家里先试这一个做法，有需要我再和您一起看。',
      '这次先把这一小步弄明白，孩子有疑问随时来找我。',
    ],
  },
  comm: {
    intro: '',
    openers: [
      '【昵称】家长好呀～想跟您聊聊孩子第【课次】课的情况，也听听您在家看到的。',
      '【昵称】家长好，想跟您对一下第【课次】课的表现，看看家里怎么配合更顺手。',
      '【昵称】家长您好，有几处课上的情况想跟您说说，咱们一起看看。',
      '【昵称】家长好呀，想结合第【课次】课跟您聊聊孩子接下来怎么练。',
      '【昵称】家长好，跟您说说我看到的第【课次】课的情况。',
      '【昵称】家长好呀～想跟您商量一下，第【课次】课之后孩子在家可以怎么练。',
    ],
    closings: [
      '您在家观察到什么，也可以直接跟我说。',
      '这一步在家做起来如果有困难，您跟我说，咱们一起想办法。',
      '您方便的时候回我就好，也想听听孩子自己的想法。',
      '咱们可以先跟孩子约定一件能做到的小事，试了再一起看。',
      '孩子愿意的话，也可以让他把最拿不准的一题发给我。',
      '您觉得家里怎么安排比较合适，咱们可以一起对一下。',
    ],
  },
};

export const FOUR_IN_ONE_NEW_STUDENT_PACK = {
  openers: [
    '【昵称】家长好呀～孩子刚加入，先跟您说说这一节课的情况。',
    '【昵称】家长您好，先说说孩子这堂课做得怎么样。',
    '【昵称】家长好呀，跟您说说孩子这节课我留意到的地方。',
  ],
  closings: [
    '刚开始，咱们先从这一小步来。有什么情况随时沟通哦。',
    '先让孩子把课后怎么练弄清楚，有问题随时来问我。',
    '刚起步慢一点没关系，先把这次的练习做扎实。',
  ],
};

export const FOUR_IN_ONE_VARIANT_COUNT = 6;
export const FOUR_IN_ONE_SCENARIOS: { key: 'daily' | 'afterclass' | 'comm'; label: string }[] = [
  { key: 'daily', label: '首课&日常' },
  { key: 'afterclass', label: '行课中' },
  { key: 'comm', label: '沟通' },
];

// “四个一”反馈（可直接发送版）：按首课/行课中/沟通场景区分，每场景 6 版措辞
export function generateFourInOne(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  nickname: string,
  isNewStudent = false,
  candidateLinks: string[] = [],
  variant = 0,
  templateOverride?: string,
  scenarioKey: 'daily' | 'afterclass' | 'comm' = 'daily',
  /** 是否附「参考教辅」清单（关闭时整行移除） */
  withMaterials = true,
  /** 口语等附加项的档位判定配置；缺省用默认档位 */
  oralCfg?: OralRatingConfig,
  /** 扩展变量（如 【学习建议】），由调用方按生成口径计算后注入 */
  extraVars?: Record<string, string>,
  /** 学员长期薄弱板块（用于定制教辅推荐；缺省时给通用建议） */
  longTermWeak: string[] = []
): string {
  const shortNickname = nickname === record.studentName ? generateShortNickname(nickname) : nickname;
  if (!isQuizAssessed(record, lessonConfig)) {
    return buildAdaptiveFeedback(record, lessonConfig, shortNickname, { oralRating: oralCfg });
  }
  const pack = FOUR_IN_ONE_PACKS[scenarioKey];
  const v = ((variant % FOUR_IN_ONE_VARIANT_COUNT) + FOUR_IN_ONE_VARIANT_COUNT) % FOUR_IN_ONE_VARIANT_COUNT;
  const phrasePack = isNewStudent ? FOUR_IN_ONE_NEW_STUDENT_PACK : pack;
  const opener = phrasePack.openers[v % phrasePack.openers.length];
  const closing = phrasePack.closings[v % phrasePack.closings.length];

  const strong = lessonConfig.questionTypes
    .filter(qt => Number.isFinite(record.scores?.[qt.id]))
    .map(qt => ({ qt, score: record.scores[qt.id], avg: stats.avgScores[qt.id] || 0 }))
    .filter(x => x.avg > 0 && x.score <= x.qt.fullScore && isQtStrong(x.qt, x.score, x.avg))
    .sort((a, b) => (b.score - b.avg) - (a.score - a.avg))[0];
  const weak = computeCategoryWeakPoints(record, lessonConfig.questionTypes.filter(qt => !qt.excludeFromTotal), stats.avgScores, undefined, stats.registeredCounts)[0];
  const classroom = cleanFeedbackStatus(record.homeworkStatus);
  const homeworkGood = optionToneLevel(classroom) === 'good';
  const homeworkBad = optionToneLevel(classroom) === 'bad';
  const dayRate = completeQuizRate(record, lessonConfig);
  const misses = quizItemsOf(record, lessonConfig)
    .flatMap(q => q.score !== undefined && q.score < q.max ? [{ name: q.name, lost: q.max - q.score }] : [])
    .sort((a, b) => b.lost - a.lost);

  let praise = '';
  if (strong) {
    const { qt, score, avg } = strong;
    const gap = Number((score - avg).toFixed(1));
    praise = score === qt.fullScore
      ? `${qt.name}这次拿了满分，这一项做得挺稳。`
      : `${qt.name}这次是${score}/${qt.fullScore}分，比班里平均高${gap}分。`;
  } else if (dayRate !== undefined && dayRate >= 90) {
    praise = `这次小测得分率${dayRate}%，整体发挥挺稳。`;
  } else if (homeworkGood) {
    praise = '这次的课堂练习做完了，课上这一环有跟上。';
  }

  const issueParts: string[] = [];
  if (weak) {
    const rate = Math.round(weak.studentRate * 100);
    const gap = Math.round(Math.abs(weak.diffRate) * 100);
    issueParts.push(`${weak.category}这块可以先回头看看，这次得分率是${rate}%，比班里平均低${gap}个百分点。`);
  }
  if (homeworkBad) issueParts.push(`课堂练习这次是「${classroom}」。`);
  if (attendanceKind(record.attendance) === 'late') issueParts.push('这节课到得晚了一点，下次咱们尽量提早几分钟。');
  const issue = issueParts.join('');

  const question = misses.find(item => weak?.questionTypeNames.includes(item.name))?.name ?? misses[0]?.name;
  const plan = question
    ? practiceForQuestion(question)
    : homeworkBad
      ? '麻烦您和孩子约个时间，先把这次没做完的课堂练习补齐，卡住的题可以圈出来问我。'
      : dayRate !== undefined
        ? '有空可以挑一道这次做对的题，请孩子讲一下自己的思路。能说清楚，下次遇到类似题就有办法了。'
        : '课后可以请孩子自己挑一道课上的例题，说说他记住了哪个做法。';

  const raw = (templateOverride != null ? templateOverride : lessonConfig.fourInOneTemplate);
  const base = (raw && raw.trim()) ? raw : DEFAULT_FOUR_IN_ONE_TEMPLATE;
  // 兼容历史模板：剔除「🎬 课堂照片/视频」整行
  const tpl = base
    .split('\n')
    .filter(l => !l.includes('课堂照片/视频'))
    // 关闭教辅清单：先摘掉占位符本身，再丢弃「只剩标签」的空行（如「📚 参考教辅：」）；
    // 同一行若还有「下一步」等其他内容则保留，不会误删
    .map(l => (withMaterials ? l : l.replace(/【参考教辅】/g, '')))
    .filter(l => {
      if (withMaterials) return true;
      const stripped = l.replace(/[\s:：📚🎧💡|｜·—\-*]/gu, '');
      return stripped.length > 0;
    })
    .join('\n');

  // 题型（含口语得分等附加项）与自定义列同样可作为参数；附加项支持【X评价】档位
  let fourTpl = applyScoreVariables(tpl, record, lessonConfig, buildRatingByQtId(record, lessonConfig, stats, oralCfg));
  (lessonConfig?.customFields || []).forEach(cf => {
    const v = record.customValues?.[cf.id];
    const text = (v === '' || v == null) ? '' : (cf.kind === 'number' ? `${v}分` : String(v));
    fourTpl = dropLineIfLabelOnly(fourTpl, '【' + cf.name + '】', text, cf.name);
    fourTpl = fourTpl.replace(new RegExp('【' + escapeRegExp(cf.name) + '】', 'g'), text);
  });

  // 兜底：关闭"附参考教辅"时，除了摘掉占位符，还要清掉**已被内联进模板的教辅文本**
  // （用户反馈：取消勾选后复制仍带出教辅 —— 因为模板/草稿里已写死了那段文字）
  if (!withMaterials) {
    const matLines = FOUR_IN_ONE_MATERIALS.split('\n').map(l => l.trim()).filter(Boolean);
    fourTpl = fourTpl
      .split('\n')
      .filter(l => {
        const t = l.trim();
        if (!t) return true;
        if (/参考教辅/.test(t)) return false;                       // 标题行（📚 参考教辅…）
        return !matLines.some(m => t.includes(m.slice(0, Math.min(14, m.length))));
      })
      .join('\n');
  }

  // 先替换"成员级"占位符（待提升/学习建议为空时整行删），再插入开场/结尾
  fourTpl = dropLineIfLabelOnly(fourTpl, '【优秀表现】', praise, ['优秀表现', '做得好的地方']);
  fourTpl = dropLineIfLabelOnly(fourTpl, '【待提升】', issue, '待提升');
  fourTpl = dropLineIfLabelOnly(fourTpl, '【学习建议】', extraVars?.['【学习建议】'] ?? '', '学习建议');

  let out = fourTpl
    .replace(/【场景】/g, '')
    .replace(/【开场】/g, opener)
    .replace(/【场景引导】/g, pack.intro)
    .replace(/【优秀表现】/g, praise)
    .replace(/【待提升】/g, issue)
    .replace(/【下一步】/g, plan)
    .replace(/【素材】/g, candidateLinks[0] || '见附件')
    .replace(/【结尾】/g, closing)
    // 新学员的表达已由专用开场/收尾承担，这里不再追加一句（否则"刚加入"重复、语气打架）
    .replace(/【新学员补充】/g, '')
    .replace(/【参考教辅】/g, withMaterials ? `\n${buildMaterialsBlock(longTermWeak)}` : '')
    .replace(/【学习建议】/g, extraVars?.['【学习建议】'] ?? '');

  // 关键修复（2026-10-23）：开场/结尾文本自身也带【课次】【昵称】占位符 ——
  // 必须在插入之后再扫一遍，否则"第【课次】课"会原样漏给家长（用户截图：四个一里课次不生效）
  out = out
    .replace(/【课次】/g, String(record.lessonNumber))
    .replace(/【昵称】/g, shortNickname);

  if (!withMaterials) {
    out = out.split('\n').filter(l => !/参考教辅|^\s*(📚|🎧|💡)|^\s*·\s/.test(l.trim())).join('\n');
  }
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

// 生成班群表彰
export function generatePraise(
  lessonNumber: number,
  records: StudentRecord[],
  lessonConfig: LessonConfig,
  stats: ClassStats,
  getNickname: (name: string) => string,
  praiseType: 'entrance' | 'listening' | 'comprehensive' = 'comprehensive',
  /** 指定模板内容（多模板管理时传入所选模板），缺省用 lessonConfig.praiseTemplateByType / praiseTemplate */
  templateOverride?: string,
  /** 跨课次数据与参数（2026-10-24）：全勤按全课次判定、进步按自身提升算，名额/板块可调 */
  opts?: {
    allRecords?: StudentRecord[];
    /** 兼容位：单一名额（不区分板块时使用） */
    topN?: number;
    entranceTopN?: number;
    listeningTopN?: number;
    sections?: { entrance?: boolean; listening?: boolean; homework?: boolean; allPresent?: boolean; progress?: boolean };
    /** 班级名单与在读区间：离班学员的历史记录不能进入本课及之后的公示 */
    students?: string[];
    studentJoinLesson?: Record<string, number>;
    studentLeaveLesson?: Record<string, number>;
  }
): string {
  // 兜底：旧备份 / 部分云同步可能缺 praiseTemplate，不能让它 undefined.replace 崩掉
  const FALLBACK_PRAISE_TEMPLATE = `🏆 第【课次】课【表彰类型】\n\n【表彰内容】\n\n上面这几位，这节课的功夫是实打实的。没上榜的也别急，下节课接着来。`;
  void stats; // 进步之星改为"与自身历史比"，不再依赖班均；保留入参以兼容调用方
  const byType = lessonConfig.praiseTemplateByType?.[praiseType];
  const template = templateOverride ?? byType ?? lessonConfig.praiseTemplate ?? FALLBACK_PRAISE_TEMPLATE;
  const sections = opts?.sections ?? {};
  const included = (k: 'entrance' | 'listening' | 'homework' | 'allPresent' | 'progress') => sections[k] !== false;
  const all = opts?.allRecords ?? records;
  const activity = createStudentActivityContext(
    opts?.students ?? [],
    opts?.studentJoinLesson,
    opts?.studentLeaveLesson,
    all,
  );
  const eligibleCurrent = records.filter(r =>
    isStudentActiveForRange(activity, r.studentName, lessonNumber)
    && isStudentActiveAtLesson(activity, r.studentName, r.lessonNumber)
  );
  const byStudent = new Map<string, StudentRecord[]>();
  all
    .filter(r =>
      r.lessonNumber <= lessonNumber
      && isStudentActiveForRange(activity, r.studentName, lessonNumber)
      && isStudentActiveAtLesson(activity, r.studentName, r.lessonNumber)
    )
    .forEach(r => {
      const arr = byStudent.get(r.studentName);
      if (arr) arr.push(r); else byStudent.set(r.studentName, [r]);
    });
  
  let praiseContent = '';
  
  if ((praiseType === 'entrance' || praiseType === 'comprehensive') && included('entrance')) {
    // 入门测风云榜（请假/缺勤学员不计入）
    // 默认表彰前三档；同分并列一并纳入；人数上限随 topN 配置变化。
    const scored = eligibleCurrent
      .filter(r => r.totalScore > 0 && !isAbsentRecord(r))
      .sort((a, b) => b.correctRate - a.correctRate || b.totalScore - a.totalScore);
    const topN = Math.max(1, Math.min(20, opts?.entranceTopN ?? opts?.topN ?? 3));
    // 与榜单页一致：先按正确率比较，满分不同的课次不直接比原始分。
    const distinctRates = Array.from(new Set(scored.map(r => r.correctRate)));
    const cutoffRate = distinctRates[topN - 1];
    const tiered = cutoffRate != null ? scored.filter(r => r.correctRate >= cutoffRate) : scored;
    const rankedStudents = tiered.slice(0, topN * 2);
    const medalFor = (correctRate: number): string => {
      const rk = distinctRates.indexOf(correctRate) + 1;
      return rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : `${rk}️⃣`;
    };

    if (rankedStudents.length > 0) {
      praiseContent += '🏆【入门测风云榜】\n';
      rankedStudents.forEach(r => {
        const nickname = getNickname(r.studentName);
        praiseContent += `${medalFor(r.correctRate)} ${nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if ((praiseType === 'listening' || praiseType === 'comprehensive') && included('listening')) {
    // 课后任务排名（口径 2026-10-08 三修）：老师既没有"听力打卡/具体分数"字面量，
    // 也常常只填定性状态不填数值分（很棒哦👏 / 完成✅）；前两版要求数值分>0 → 真实数据仍空。
    // 现在：有数值分按分排；无数值分回退到"课后任务登记为正向状态"的学员，
    // 同分（含都无分）按总分降序兜底，保证有登记就有名单。
    const listeningRanked = eligibleCurrent
      .filter(isListeningEligible)
      .sort((a, b) => listeningScoreOf(b) - listeningScoreOf(a) || Number(b.totalScore) - Number(a.totalScore))
      .slice(0, Math.max(1, Math.min(20, opts?.listeningTopN ?? opts?.topN ?? 5)));
    
    if (listeningRanked.length > 0) {
      praiseContent += '🎙️【课后任务达人】\n';
      const rankIcons = ['🏆', '🥈', '🥉', '📌', '📌', '📌', '📌', '📌'];
      listeningRanked.forEach((r, i) => {
        const nickname = getNickname(r.studentName);
        const score = listeningScoreOf(r);
        const tail = score > 0
          ? `${score}分`
          : (r.listeningStatus && r.listeningStatus !== '具体分数' ? String(r.listeningStatus) : '完成');
        praiseContent += `${rankIcons[i]} ${nickname}：${tail}\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if (praiseType === 'comprehensive') {
    // 作业优秀
    const homeworkExcellent = included('homework') ? eligibleCurrent
      .filter(r => optionToneLevel(r.homeworkStatus) === 'good' && !isAbsentRecord(r))
      .map(r => getNickname(r.studentName)) : [];
    
    if (homeworkExcellent.length > 0) {
      praiseContent += `📚【作业超赞】\n`;
      praiseContent += homeworkExcellent.join('、');
      praiseContent += '\n\n';
    }
    
    // 全勤之星（2026-10-24 修口径）：按**全部课次**判定 —— 任何一次请假/迟到/缺勤/调课都不算全勤；
    // 原来只看本课，导致"之前请过假也算全勤"（用户反馈）
    const allPresent = included('allPresent')
      ? [...byStudent.entries()]
        .filter(([, recs]) => isCumulativeFullAttendance(recs, lessonNumber))
        .map(([name]) => getNickname(name))
      : [];
    
    if (allPresent.length > 0) {
      praiseContent += `✅【全勤之星】\n`;
      praiseContent += allPresent.join('、');
      praiseContent += '\n\n';
    }
    
    // 进步之星（2026-10-24 修口径）：与本生此前几次的平均比，提升最多者；
    // 原实现是"与班均差距最小"，那不是进步，会选到中等生（用户质疑后修正）。
    const progressStudents = included('progress')
      ? [...byStudent.entries()]
        .map(([name, recs]) => {
          const cur = recs.find(r => r.lessonNumber === lessonNumber);
          if (!cur || isAbsentRecord(cur) || !(cur.totalScore > 0)) return null;
          const prev = recs.filter(r => r.lessonNumber !== lessonNumber && !isAbsentRecord(r) && r.totalScore > 0);
          if (prev.length === 0) return null;
          const base = prev.reduce((a, b) => a + Number(b.totalScore), 0) / prev.length;
          return { name, nickname: getNickname(name), delta: Number(cur.totalScore) - base };
        })
        .filter((x): x is { name: string; nickname: string; delta: number } => !!x && x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3)
      : [];
    
    if (progressStudents.length > 0) {
      praiseContent += `📈【进步之星】\n`;
      praiseContent += progressStudents.map(s => s.nickname).join('、');
      praiseContent += '\n\n';
    }
  }
  
  // 替换模板变量
  const praise = template
    .replace(/【课次】/g, lessonNumber.toString())
    .replace(/【表彰类型】/g, praiseType === 'entrance' ? '入门测' : praiseType === 'listening' ? '课后任务' : '综合')
    .replace(/【表彰内容】/g, praiseContent);
  
  return praise;
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('复制失败:', err);
    return false;
  }
}

// 导出CSV
export function exportToCSV(
  records: StudentRecord[],
  lessonConfig: LessonConfig,
  _className: string,
  _lessonNumber: number
): string {
  const customFields = lessonConfig.customFields || [];
  const headers = ['学生姓名', '课次', '学习轨迹', '考勤', '课堂表现', '书面作业', '课后任务', ...lessonConfig.questionTypes.map(qt => qt.name), ...customFields.map(cf => cf.name), '总分', '正确率', '排名'];

  // RFC4180 转义：单元格含逗号 / 引号 / 换行时用双引号包裹并转义内部引号。
  // 考勤、课堂表现、自定义列里出现「,」很常见，不转义会让整行列错位（2026-10-17 修正）。
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  let csv = headers.map(esc).join(',') + '\n';
  
  records.forEach(record => {
    const row = [
      record.studentName,
      `第${record.lessonNumber}课`,
      record.seasons.join(''),
      record.attendance,
      record.classPerformance || '',
      record.homeworkStatus,
      record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus,
      ...lessonConfig.questionTypes.map(qt => record.scores[qt.id] || 0),
      ...customFields.map(cf => { const v = (record.customValues || {})[cf.id]; return (v === '' || v == null) ? '' : v; }),
      record.totalScore,
      `${record.correctRate}%`,
      `第${record.rank}名`
    ];
    csv += row.map(esc).join(',') + '\n';
  });
  
  return '\ufeff' + csv;
}

// 下载HTML文件
export function downloadHTML(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// 下载CSV文件
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** CSV 单元格转义（RFC4180）：含逗号/引号/换行时用双引号包裹并把内部引号转义 */
export function csvCell(v: unknown): string {
  const t = v == null ? '' : String(v);
  return /[,"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

/** 导出文件名清洗：去掉各系统的路径/非法字符，避免下载失败或产生怪文件名 */
export function sanitizeFileName(name: string, fallback = '导出'): string {
  const t = (name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim();
  return t || fallback;
}
