import type { StudentRecord, ClassStats, LessonConfig, OralRatingConfig } from '@/types';
import { isAbsentRecord, isTransferIn, isTransferRecord, attendanceKind } from '@/lib/attendance';
import { computeCategoryWeakPoints, formatCategoryWeakPoint, isQtStrong } from '@/lib/weakPoints';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { rateOralScore } from '@/lib/oralRating';
import { optionToneLevel } from '@/lib/optionTone';

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
  if (isTransferRecord(record) && !isTransferIn(record)) {
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
【场景引导】🌟 优秀表现：【优秀表现】
🔍 待提升：【待提升】
🛠 下一步：【下一步】【新学员补充】
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
    // 六版人格差异：①亲切日常 ②极简要点 ③专业详实 ④鼓励正向 ⑤复盘推进 ⑥行动约定
    // 2026-10-23：开场统一以「学生短昵称 + 家长好」起句（【昵称】在生成时替换）；去掉机械的"记了两笔"式说法
    openers: [
      '【昵称】家长好，今天的课有几点想跟您说，都写在下面：',
      '【昵称】家长好，第【课次】课的情况如下：',
      '【昵称】家长您好。本课的内容、表现与测评数据，整理在下面。',
      '【昵称】家长好，今天有一处做得挺好，先说这个，再说要留心的：',
      '【昵称】家长您好。这堂课我只看三件事：听进去没有、练对没有、回家能不能接上。',
      '【昵称】家长您好。情况都写清楚了，末尾有一件事想请您帮个忙。',
    ],
    closings: [
      '您在家若看到什么，随时告诉我。',
      '就这些，想细聊随时找我。',
      '需要的话，我可以再整理一份本讲的个性化练习建议。',
      '孩子的点滴进步我都记着，下节课接着来。',
      '这两处我下节课重点看，有变化第一时间告诉您。',
      '这一件事您帮我盯一周，孩子会有看得见的变化。',
    ],
  },
  afterclass: {
    intro: '这一讲在行课中段，重点是前后知识的衔接与错题复盘。\n',
    openers: [
      '【昵称】家长好，课到一半，孩子这段的情况我归拢了几点，说给您：',
      '【昵称】家长好，行课中的进度同步，只说关键的：',
      '【昵称】家长您好。本讲承接上一讲，结合近几次测评的走势，孩子的情况如下：',
      '【昵称】家长好，这段能看出孩子渐渐找到了感觉——先报喜，再说要盯的地方：',
      '【昵称】家长您好。今天我把前面的内容又串了一遍，孩子的衔接情况如下：',
      '【昵称】家长您好。中段最容易松劲，今天跟您对一下节奏，末尾有件事想请您配合。',
    ],
    closings: [
      '中段最怕"以为自己会了"。有疑问随时问我，课上我再带一遍。',
      '关键两条：错题别压着，节奏别断。',
      '这个阶段我更看重基础有没有闭合。进度慢一点没关系，别留窟窿。',
      '这段的进步我看在眼里，保持住。',
      '下次课前让孩子翻一遍本讲笔记，课上我带着回顾。',
      '您在家盯一周，我课上接着带——比单纯加练有用。',
    ],
  },
  comm: {
    intro: '',
    openers: [
      '【昵称】家长好，占用您一分钟，说说孩子最近的状态：',
      '【昵称】家长好，想跟您对一件事：',
      '【昵称】家长您好。孩子近期的表现我整理了几点，也想听听您看到的情况。',
      '【昵称】家长好，孩子最近有两件事我挺高兴，也有一处想提一下：',
      '【昵称】家长您好。这条反馈只说观察到的事实与我的判断，不绕弯子：',
      '【昵称】家长您好。有个情况想先跟您通个气，再一起商量怎么配合：',
    ],
    closings: [
      '您方便的时候，聊几句都行。',
      '不急，先听听您的想法。',
      '方便的话，我给您做一次完整的情况说明。',
      '孩子整体在往上走，保持沟通就好。',
      '我把看到的说清楚，怎么做我们商量着来。',
      '这事您怎么看？我按您的想法调整。',
    ],
  },
};

/**
 * 新学员专用开场/收尾（2026-10-23）：
 * 新学员没有历史数据，用"渐渐找到感觉""照现在的节奏"这类话会与前文冲突，单独给一组中性措辞。
 */
export const FOUR_IN_ONE_NEW_STUDENT_PACK = {
  openers: [
    '【昵称】家长好，孩子刚加入不久，这堂课的情况我记在下面：',
    '【昵称】家长您好。先说说孩子这堂课的表现：',
    '【昵称】家长好，这堂课我留意了几个地方，跟您说说：',
  ],
  closings: [
    '孩子还在适应期，有任何情况我们随时沟通。',
    '先按这个节奏来，过几节课我们再一起看变化。',
    '刚起步不用急，把习惯立起来最重要。',
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
  if (isAbsentRecord(record)) {
    return `【第${record.lessonNumber}课 · ${nickname}】\n孩子这堂课${record.attendance}，没有参与本讲的测评。落下的内容和补课安排我会单独跟您同步，也欢迎您随时跟我说说孩子的情况～`;
  }
  const shortNickname = generateShortNickname(nickname);
  const pack = FOUR_IN_ONE_PACKS[scenarioKey] || FOUR_IN_ONE_PACKS.daily;
  const n = FOUR_IN_ONE_VARIANT_COUNT;
  const v = ((variant % n) + n) % n;
  // 开场与结尾一一配套：第 N 版用第 N 条开场 + 第 N 条结尾，保证同一版的语气/详略一致
  // 新学员单独一组（不含"渐渐找到感觉""照现在的节奏"这类需要历史数据才能说的话，避免与其他话术冲突）
  const openerPool = isNewStudent ? FOUR_IN_ONE_NEW_STUDENT_PACK.openers : pack.openers;
  const closingPool = isNewStudent ? FOUR_IN_ONE_NEW_STUDENT_PACK.closings : pack.closings;
  const opener = openerPool[v % openerPool.length];
  const closing = closingPool[v % closingPool.length];

  const strong = lessonConfig.questionTypes
    // 未登记的题型不参与强项判定（不能把「没登记」当成 0 分去比班均）
    .filter(qt => typeof record.scores[qt.id] === 'number' && Number.isFinite(record.scores[qt.id]))
    .map(qt => ({ qt, name: qt.name, s: record.scores[qt.id], avg: stats.avgScores[qt.id] || 0, full: qt.fullScore }))
    .filter(x => x.avg > 0 && isQtStrong(x.qt, x.s, x.avg))
    .sort((a, b) => (b.s - b.avg) - (a.s - a.avg));
  const weak = computeCategoryWeakPoints(record, lessonConfig.questionTypes, stats.avgScores, undefined, stats.registeredCounts);
  // 作业好/坏按语义色调判定（修复 P0：原硬编码 '超赞完成'/'未完成'/'没带' 为 v1 旧值，
  // 现行选项已迁移为 完成✅/未完成❌/按要求❗ → 恒 false，家长话术错档）
  const hwTone = optionToneLevel(record.homeworkStatus);
  const homeworkGood = hwTone === 'good';
  const homeworkBad = hwTone === 'bad';
  const attendKind = attendanceKind(record.attendance);
  const attendBad = attendKind === 'absent' ? '缺勤' : attendKind === 'late' ? '迟到' : attendKind === 'leave' ? '请假' : '';

  // 亮点：同一档位备两种说法，随「换一版措辞」轮换，避免每位家长收到同一句
  const pick = <T,>(pair: [T, T]): T => pair[v % 2];
  let praise: string;
  if (strong.length) {
    const s0 = strong[0];
    const gap = Math.max(0, Math.round(s0.s - s0.avg));
    praise = pick([
      `${s0.name}这次很亮眼——${s0.s}/${s0.full}，比班级平均高出 ${gap} 分`,
      `${s0.name}是这次的强项，${s0.s}/${s0.full}，高出班均 ${gap} 分，看得出是真会了`,
    ]);
  } else if (record.correctRate >= 90) {
    praise = pick([
      `入门测正确率 ${record.correctRate}%，整张卷子掌握得比较扎实`,
      `这次正确率 ${record.correctRate}%，整体很稳，没有明显短板`,
    ]);
  } else if (homeworkGood) {
    praise = pick(['书面作业完成质量很高', '书面作业做得认真，完成质量很高']);
  } else {
    praise = pick(['课堂状态稳定，能跟上节奏', '这堂课跟得比较稳，课堂状态在线']);
  }

  const issueParts: string[] = [];
  if (weak.length) {
    const w0 = weak[0];
    const rate = Math.round(w0.studentRate * 100);
    const gap = Math.max(0, Math.round(Math.abs(w0.diffRate) * 100));
    issueParts.push(pick([
      `${w0.category}是最值得再补的一块：得分率 ${rate}%，比班级平均低 ${gap} 个百分点`,
      `${w0.category}这块可以再抓一抓——得分率 ${rate}%，低于班均 ${gap} 个百分点`,
    ]));
  }
  if (homeworkBad) issueParts.push(`书面作业${record.homeworkStatus}`);
  if (attendBad) issueParts.push(`本课${attendBad}`);
  // 没有弱项、作业和考勤也都正常时，不写"没发现明显薄弱处"这类凑数句（用户反馈"很没必要"）
  const issue = issueParts.join('；');

  const nextAction = weak.length
    ? `针对${weak[0].category}板块（${weak[0].questionTypeNames.join('、')}）练几道同类题，错题收进错题本；有余力让孩子把思路讲给您听，胜过再做十道`
    : homeworkBad
      ? '今晚把这次的作业补齐并订正，下次课带来我看看'
      : attendBad
        ? '课后回看本讲的笔记和回放，落下的内容补上，不清楚的地方随时问我'
        : isNewStudent
          ? '先按这个节奏来：课后任务按计划完成，错题当场弄懂'
          : '照现在的节奏走：课后任务按计划完成，错题及时过一遍';
  // 2026-10-23：模板行已有「🛠 下一步：」标签，plan 不再另加一句式标签前缀（否则双重标签）
  const planLead = scenarioKey === 'afterclass' ? '这阶段重点抓一下——' : scenarioKey === 'comm' ? '最想请您配合的是——' : '';
  const plan = `${planLead}${nextAction}`;

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
  out = out.replace(/\n{3,}/g, '\n\n').trimEnd();
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
  const byStudent = new Map<string, StudentRecord[]>();
  all.forEach(r => {
    const arr = byStudent.get(r.studentName);
    if (arr) arr.push(r); else byStudent.set(r.studentName, [r]);
  });
  
  let praiseContent = '';
  
  if ((praiseType === 'entrance' || praiseType === 'comprehensive') && included('entrance')) {
    // 入门测风云榜（请假/缺勤学员不计入）
    // 默认表彰前三名；同分并列一并纳入；表彰总人数控制在 6 人以内
    const scored = records
      .filter(r => r.totalScore > 0 && !isAbsentRecord(r))
      .sort((a, b) => b.totalScore - a.totalScore);
    const topN = Math.max(1, Math.min(20, opts?.entranceTopN ?? opts?.topN ?? 3));
    const distinctScores = Array.from(new Set(scored.map(r => r.totalScore)));
    const cutoffScore = distinctScores[topN - 1];
    const tiered = cutoffScore != null ? scored.filter(r => r.totalScore >= cutoffScore) : scored;
    const rankedStudents = tiered.slice(0, topN * 2);
    const medalFor = (score: number): string => {
      const rk = distinctScores.indexOf(score) + 1;
      return rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : `${rk}️⃣`;
    };

    if (rankedStudents.length > 0) {
      praiseContent += '🏆【入门测风云榜】\n';
      rankedStudents.forEach(r => {
        const nickname = getNickname(r.studentName);
        praiseContent += `${medalFor(r.totalScore)} ${nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if ((praiseType === 'listening' || praiseType === 'comprehensive') && included('listening')) {
    // 课后任务排名（口径 2026-10-08 三修）：老师既没有"听力打卡/具体分数"字面量，
    // 也常常只填定性状态不填数值分（很棒哦👏 / 完成✅）；前两版要求数值分>0 → 真实数据仍空。
    // 现在：有数值分按分排；无数值分回退到"课后任务登记为正向状态"的学员，
    // 同分（含都无分）按总分降序兜底，保证有登记就有名单。
    const NEG = /未完成|未交|未做|未带|没带|没做|请假|缺勤|缺席|迟到|补交|不合格|未参与/;
    const scoreOf = (r: StudentRecord) => Number(r.listeningScore) || 0;
    const positiveStatus = (r: StudentRecord) => !!r.listeningStatus && !NEG.test(String(r.listeningStatus));
    const listeningRanked = records
      .filter(r => !isAbsentRecord(r) && (scoreOf(r) > 0 || positiveStatus(r)))
      .sort((a, b) => (scoreOf(b) - scoreOf(a)) || (Number(b.totalScore) - Number(a.totalScore)))
      .slice(0, Math.max(1, Math.min(20, opts?.listeningTopN ?? opts?.topN ?? 5)));
    
    if (listeningRanked.length > 0) {
      praiseContent += '🎙️【课后任务达人】\n';
      const rankIcons = ['🏆', '🥈', '🥉', '📌', '📌', '📌', '📌', '📌'];
      listeningRanked.forEach((r, i) => {
        const nickname = getNickname(r.studentName);
        const tail = scoreOf(r) > 0
          ? `${scoreOf(r)}分`
          : (r.listeningStatus && r.listeningStatus !== '具体分数' ? String(r.listeningStatus) : '完成');
        praiseContent += `${rankIcons[i]} ${nickname}：${tail}\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if (praiseType === 'comprehensive') {
    // 作业优秀
    const homeworkExcellent = included('homework') ? records
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
        .filter(([, recs]) => {
          const kinds = recs.map(r => attendanceKind(r.attendance)).filter(k => k !== 'unknown');
          return kinds.length > 0 && kinds.every(k => k === 'onTime');
        })
        .map(([name]) => getNickname(name))
      : [];
    
    if (allPresent.length > 0) {
      praiseContent += `✅【全勤之星】\n`;
      praiseContent += allPresent.join('、');
      praiseContent += '\n\n';
    }
    
    // 稳步前进（2026-10-24 修口径）：与本生此前几次的平均比，提升最多者；
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
      praiseContent += `📈【稳步前进】\n`;
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
