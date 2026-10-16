// 题型板块归类 · 报告聚合层（2026-10-16）
//
// 背景：一个班的题型可能有十几个（语法选择/单项选择/语法运用/单词默写/笔记默写/语篇填词/…），
// 逐题型画趋势/对比图会"多到看不懂"。用户要求按大类（板块）归类统计。
//
// 重要：**归类规则不在这里，统一复用 lib/weakPoints 的 inferCategory** ——
// 「薄弱项」反馈、学情表弱势徽章、课次配置里的「板块」输入框早已用同一套规则，
// 报告再另起一套就会出现"反馈说语法弱、报告说阅读弱"的分裂。本文件只做三件事：
//   ① 名称 → 板块（人工覆盖 > 关键词规则）  ② 板块 → 图表配色  ③ 板块级加权聚合
import { inferCategoryByName } from '@/lib/weakPoints';

/** 板块配色（与 weakPoints 的分类名对应；自定义板块按名称哈希取调色板） */
const CATEGORY_COLORS: Record<string, string> = {
  听力: '#8b5cf6',
  口语: '#06b6d4',
  完形: '#f59e0b',
  阅读: '#fb7185',
  写作: '#ec4899',
  语法: '#0a84ff',
  词汇: '#10b981',
  其他: '#94a3b8',
};
const FALLBACK_PALETTE = ['#0a84ff', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#fb7185', '#84cc16'];
/** 已知板块（与 weakPoints 规则一致；用于「选择归属」下拉与展示排序，其他固定最后） */
export const KNOWN_CATEGORIES = ['听力', '口语', '完形', '阅读', '写作', '语法', '词汇'];
const CATEGORY_ORDER = KNOWN_CATEGORIES;

export function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

export interface CategoryDef { key: string; name: string; color: string }

/** 取题型归属板块：人工覆盖（appConfig / 课次配置「板块」字段）优先，其次关键词规则，兜底「其他」 */
export function categoryOf(name: string, overrides?: Record<string, string>): CategoryDef {
  const manual = overrides?.[name]?.trim();
  const cat = manual || inferCategoryByName(name);
  return { key: cat, name: cat, color: categoryColor(cat) };
}

/** 未归类（规则只能兜到「其他」、且没有人工指定）的题型名 —— 用于提示登记人选择归属 */
export function unclassifiedNames(names: string[], overrides?: Record<string, string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  names.forEach(raw => {
    const n = (raw || '').trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (!overrides?.[n]?.trim() && inferCategoryByName(n) === '其他') out.push(n);
  });
  return out;
}

export interface CategoryAggItem {
  key: string;
  name: string;
  color: string;
  /** 加权平均得分率（按样本数加权；无样本数时等权） */
  rate: number;
  /** 样本数（课次/记录条数之和） */
  count: number;
  /** 该板块下实际参与统计的题型名 */
  members: string[];
}

/**
 * 把「题型 → 得分率」明细按板块汇总（加权平均）。
 * @param items 每项：题型名 + 得分率 + 样本数（缺省视为 1）
 */
export function aggregateByCategory(
  items: { name: string; rate: number; count?: number }[],
  overrides?: Record<string, string>,
): CategoryAggItem[] {
  const buckets = new Map<string, { def: CategoryDef; sum: number; count: number; members: Set<string> }>();
  items.forEach(it => {
    if (!Number.isFinite(it.rate)) return;
    const def = categoryOf(it.name, overrides);
    const b = buckets.get(def.key) || { def, sum: 0, count: 0, members: new Set<string>() };
    const w = Math.max(1, it.count ?? 1);
    b.sum += it.rate * w;
    b.count += w;
    b.members.add(it.name);
    buckets.set(def.key, b);
  });
  const orderIndex = (k: string) => (k === '其他' ? 999 : Math.max(0, CATEGORY_ORDER.indexOf(k)));
  return [...buckets.values()]
    .map(b => ({
      key: b.def.key,
      name: b.def.name,
      color: b.def.color,
      rate: Math.round((b.sum / b.count) * 10) / 10,
      count: b.count,
      members: [...b.members],
    }))
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key));
}
