// 选项匹配工具：把「表格里导入的文本」对齐到「系统里配置的选项」。
//
// 背景：考勤/课堂表现/作业/课后任务这些列存的是「选项文本」，而界面用 Radix Select 展示。
// Radix Select 只有当 value 与某个 SelectItem 完全相等时才显示文字，否则只显示占位符 ——
// 于是「导入的表格里写的是"认真积极"，系统选项是"认真积极， 继续保持呀🤗"」这类
// 空格/标点/表情差异，会让数据看起来"没导进来"。
//
// 因此统一约定：写入前先用 matchOption 归一化到配置项；展示时再用它兜底，
// 保证旧数据与手工粘贴的文本都能正常显示。

/** 去掉表情、标点、空白，只保留中文/英文/数字，用于宽松比较 */
export function normalizeOptionText(v?: string | null): string {
  return (v || '').replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
}

/**
 * 在 options 中找到与 value 对应的配置项：
 * 1) 完全相同 → 直接返回
 * 2) 去表情/标点/空白后相同 → 返回该项
 * 3) 互为包含（如「认真积极」↔「认真积极， 继续保持呀🤗」）→ 返回最接近的一项
 * 找不到则返回 undefined（调用方决定是否原样保留）
 */
export function matchOption(value: string | undefined | null, options: string[]): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;
  if (options.includes(raw)) return raw;

  const nv = normalizeOptionText(raw);
  if (!nv) return undefined;

  const exact = options.find(o => normalizeOptionText(o) === nv);
  if (exact) return exact;

  // 互为包含：要求「较短一方」至少 3 个字，避免 2 字短词被长选项吞掉
  // （例：「保持」不应命中「认真积极， 继续保持呀🤗」，但「认真积极」可以）
  const hits = options
    .map(o => ({ o, n: normalizeOptionText(o) }))
    .filter(({ n }) => Math.min(n.length, nv.length) >= 3 && (n.includes(nv) || nv.includes(n)))
    // 命中项中取规范化后最短的（与原文本最接近），长度相同则取最长公共前缀更长的
    .sort((a, b) => (a.n.length - b.n.length) || (b.n.indexOf(nv) - a.n.indexOf(nv)) || a.n.localeCompare(b.n));
  return hits[0]?.o;
}

/**
 * 展示用解析：返回可用于 Select 的取值 + 是否需要额外渲染一条「原样值」选项。
 * - 命中配置项 → value 用配置项（显示正常，含表情）
 * - 未命中但有原值 → value 用原值，并把原值作为额外选项渲染出来，避免"看不见"
 */
export function resolveOptionForDisplay(
  value: string | undefined | null,
  options: string[]
): { value: string; raw?: string } {
  const raw = (value || '').trim();
  if (!raw) return { value: '' };
  if (options.includes(raw)) return { value: raw };
  const matched = matchOption(raw, options);
  if (matched) return { value: matched };
  return { value: raw, raw };
}

// ── 历史数据清理：旧版（v1/v2）选项 → 现行选项 ──
// 这些值已被新版选项集废弃，但仍可能存在于历史记录或旧导入数据中；
// 它们会导致下拉框"显示成幽灵值、但选项里选不中"，因此加载时统一迁移。
const LEGACY_ALIASES: Record<string, string> = {
  // 考勤
  '按时出勤': '准时👍',
  '迟到': '迟到❗',
  '请假': '请假🏫',
  '调课': '调课👩',
  // 作业
  '超赞完成': '完成✅',
  '圆满完成': '完成✅',
  '没带': '按要求❗',
  // 课堂表现（旧四项 → 现行选项，语义最接近的一项）
  '专注高效': '认真上课， 积极参与棒👍',
  '积极互动': '认真积极， 继续保持呀🤗',
};

/** 把单个选项文本迁移到现行选项；无可迁移时原样返回 */
export function migrateLegacyOption(value: string | undefined | null): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return value == null ? undefined : raw;
  return LEGACY_ALIASES[raw] ?? raw;
}
