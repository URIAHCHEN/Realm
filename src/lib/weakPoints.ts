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
const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  { category: '听力', keywords: ['听力', '听说', '乐听'] },
  { category: '口语', keywords: ['口语', '朗读', '跟读', '对话', '配音'] },
  { category: '完形', keywords: ['完形', 'cloze', 'Cloze'] },
  { category: '阅读', keywords: ['阅读', '任务型', '信息匹配', '判断'] },
  { category: '写作', keywords: ['写作', '作文', '书面表达', '完成句子', '翻译', '仿写', '摘要', '解答'] },
  { category: '语法', keywords: ['语法', '单项', '单选', '选择填空', '词性', '时态'] },
  { category: '词汇', keywords: ['词汇', '单词', '默写', '填词', '词组', '短语', '首字母', '拼写'] },
];

/** 推断题型所属板块：优先使用手动指定的 category，否则按名称关键词归类，兜底「其他」 */
export function inferCategory(qt: QuestionType): string {
  const custom = qt.category?.trim();
  if (custom) return custom;
  const name = qt.name || '';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => name.includes(k))) return rule.category;
  }
  return '其他';
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
  threshold = CATEGORY_WEAK_THRESHOLD
): CategoryWeakPoint[] {
  const groups = new Map<string, { names: string[]; sScore: number; sFull: number; cScore: number; cFull: number }>();

  for (const qt of questionTypes) {
    const cat = inferCategory(qt);
    const g = groups.get(cat) || { names: [], sScore: 0, sFull: 0, cScore: 0, cFull: 0 };
    g.names.push(qt.name);
    g.sScore += record.scores?.[qt.id] || 0;
    g.sFull += qt.fullScore || 0;
    g.cScore += avgScores?.[qt.id] || 0;
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
