import type { QuestionType, StudentRecord } from '@/types';

// 题型 → 板块 归类，用于「按板块判断薄弱项」。
// 判定口径：以「得分率」为单位（板块内 Σ得分 / Σ满分），与班级同板块得分率比较，
// 避免满分较小的题型（如语篇填词、完成句子）因固定「低5分」阈值而漏判。

export interface CategoryWeakPoint {
  /** 板块名（语法 / 词汇 / 阅读 / 完形 / 写作 / 听力 / 口语 / 其他，或自定义） */
  category: string;
  /** 该板块包含的题型名称 */
  questionTypeNames: string[];
  studentScore: number;
  studentFull: number;
  /** 学生板块得分率 0~1 */
  studentRate: number;
  /** 班级板块得分率 0~1 */
  classRate: number;
  /** studentRate - classRate，负值表示低于班级 */
  diffRate: number;
}

// 关键词 → 板块（按数组顺序命中，先具体后宽泛）
// 2026-10-24：补全常见题型，避免"其他"吞掉可归类的题型（会影响报告/反馈的板块统计）
const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  { category: '听力', keywords: ['听力', '听说', '乐听', '听记', '听写句子', '听力理解'] },
  { category: '口语', keywords: ['口语', '朗读', '跟读', '配音', '口头', '复述', '情景对话', '补全对话', '交际'] },
  { category: '完形', keywords: ['完形', 'cloze'] },
  { category: '阅读', keywords: ['阅读', '任务型', '信息匹配', '匹配题', '七选五', '判断', '篇章', '语篇理解', '短文理解'] },
  { category: '写作', keywords: ['写作', '作文', '书面表达', '完成句子', '翻译', '仿写', '摘要', '应用文', '续写', '句型转换'] },
  { category: '语法', keywords: ['语法', '单项', '单选', '选择填空', '词性', '时态', '语态', '从句', '非谓语', '句型', '语法填空', '短文填空', '语篇填词', '介词', '冠词', '代词', '连词', '动词'] },
  { category: '词汇', keywords: ['词汇', '单词', '默写', '填词', '词组', '短语', '首字母', '拼写', '识记', '音标'] },
];

/** 板块预设（课次配置里的下拉建议，不含"其他"） */
export const CATEGORY_PRESETS = ['语法', '词汇', '阅读', '完形', '写作', '听力', '口语'] as const;

/** 仅按名称推断板块（按关键词归类，兜底「其他」）—— 供报告归类层复用 */
export function inferCategoryByName(name: string): string {
  const n = name || '';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => n.includes(k))) return rule.category;
  }
  return '其他';
}

/** 题型是否已明确归类：手动指定优先，其次名称能命中规则；命中不了视为「未归类」 */
export function isCategoryResolved(qt: QuestionType): boolean {
  if (qt.category?.trim()) return true;
  return inferCategoryByName(qt.name || '') !== '其他';
}

/** 解析单个题型的板块：手动 > 名称覆盖表（按题型名） > 关键词 > 其他 */
export function resolveCategory(qt: QuestionType, overrides?: Record<string, string>): string {
  const manual = qt.category?.trim();
  if (manual) return manual;
  const byName = overrides?.[qt.name || ''];
  if (byName?.trim()) return byName.trim();
  return inferCategoryByName(qt.name || '');
}

/** 推断题型所属板块：优先使用手动指定的 category，否则按名称关键词归类，兜底「其他」 */
export function inferCategory(qt: QuestionType, overrides?: Record<string, string>): string {
  return resolveCategory(qt, overrides);
}

// 板块薄弱判定阈值：学生板块得分率低于班级板块得分率超过该百分点即判为薄弱
export const CATEGORY_WEAK_THRESHOLD = 0.10;

/**
 * 按板块聚合计算薄弱项。
 * @param avgScores 各题型班均分（分数值，非得分率），来自 calculateClassStats
 */
export function computeCategoryWeakPoints(
  record: StudentRecord,
  questionTypes: QuestionType[],
  avgScores: { [qtId: string]: number },
  threshold = CATEGORY_WEAK_THRESHOLD,
  /** 各题型的班级有效样本数（可选）：为 0 时该题型无班均可比，直接跳过，避免"和 0 比"产生假差距 */
  registeredCounts?: { [qtId: string]: number },
  /** 题型名 → 板块（appConfig.qtCategoryOverrides），与报告/表格共用同一口径 */
  categoryOverrides?: Record<string, string>
): CategoryWeakPoint[] {
  const groups = new Map<string, { names: string[]; sScore: number; sFull: number; cScore: number; cFull: number }>();

  for (const qt of questionTypes) {
    const own = record.scores?.[qt.id];
    // 2026-10-24 修口径（用户反馈"四个一数据不是当课的"）：
    // 原实现把"本人没有登记这一题型"当成 0 分，分母却加满分 ——
    // 该题型本课没考/中途加入/漏录时，会凭空算出"得分率 40%、低于班均 28 个百分点"。
    // 现在只统计"本人已登记 + 班里有样本"的题型；真实登记 0 分仍按 0 计（那是真弱）。
    if (typeof own !== 'number' || !Number.isFinite(own)) continue;
    if (registeredCounts && (registeredCounts[qt.id] || 0) === 0) continue;
    const cat = resolveCategory(qt, categoryOverrides);
    const g = groups.get(cat) || { names: [], sScore: 0, sFull: 0, cScore: 0, cFull: 0 };
    g.names.push(qt.name);
    g.sScore += own;
    g.sFull += qt.fullScore || 0;
    // 班均缺失时用本人分兜底 → 差距为 0，不误判为弱项
    g.cScore += avgScores?.[qt.id] ?? own;
    g.cFull += qt.fullScore || 0;
    groups.set(cat, g);
  }

  const out: CategoryWeakPoint[] = [];
  for (const [category, g] of groups) {
    if (g.sFull <= 0) continue;
    const studentRate = g.sScore / g.sFull;
    const classRate = g.cFull > 0 ? g.cScore / g.cFull : 0;
    const diffRate = studentRate - classRate;
    if (diffRate < -threshold) {
      out.push({
        category,
        questionTypeNames: g.names,
        studentScore: g.sScore,
        studentFull: g.sFull,
        studentRate,
        classRate,
        diffRate,
      });
    }
  }
  // 差距越大越靠前
  return out.sort((a, b) => a.diffRate - b.diffRate);
}

/** 反馈文案：如「词汇（得分率40%，低于班均28个百分点）」 */
export function formatCategoryWeakPoint(cp: CategoryWeakPoint): string {
  const sPct = Math.round(cp.studentRate * 100);
  const gapPct = Math.round(Math.abs(cp.diffRate) * 100);
  return `${cp.category}（得分率${sPct}%，低于班均${gapPct}个百分点）`;
}

/** 单个题型是否偏低（用于单元格高亮）：按得分率对比班均 */
export function isQtWeak(qt: QuestionType, score: number, avgScore: number, gap = CATEGORY_WEAK_THRESHOLD): boolean {
  if (!qt.fullScore) return score - avgScore < -5;
  return (score - avgScore) / qt.fullScore < -gap;
}
export function isQtStrong(qt: QuestionType, score: number, avgScore: number, gap = CATEGORY_WEAK_THRESHOLD): boolean {
  if (!qt.fullScore) return score - avgScore > 5;
  return (score - avgScore) / qt.fullScore > gap;
}
