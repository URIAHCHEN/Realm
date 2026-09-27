// 口语（附加项）档位自动判定 —— 全站唯一实现。
//
// 为什么要独立成模块：
//  · 同一个「口语得分 → 很棒哦👍 / 再加油💪」的判定要在 4 个地方出现
//    （学情表列内徽标、反馈模板参数、公示导出、学情报告档位分布）。
//    按本项目既有教训（口径散在 4 个文件 → 改漏 → 排名恒为 1/1），
//    判定逻辑必须只有一份，接口就是测试面。
//
// 判定规则（用户确认口径：固定分数线定基础档 + 班级相对位置做一级微调）：
//  1. 得分率 pct = 得分 ÷ 该题型满分 × 100（满分取题型自身 fullScore，不硬编码 100）；
//  2. 基础档 = 档位表里第一个满足 pct ≥ min 的档（档位按 min 降序）；
//  3. 相对微调（仅一档，且只在样本足够时启用）：
//       pct ≥ 班均率 + relativeShiftPct → 升一档（封顶最高档）
//       pct ≤ 班均率 − relativeShiftPct → 降一档（保底最低档）
//     班均只统计「已登记」的出勤学员（与 calculateClassStats 的附加项口径一致，
//     否则未登记的空值被当 0 会把班均拉低，进而误判别人）；
//  4. 不判定的情况一律返回 null（展示层显示「—」），避免给出误导评价：
//       · 未登记（scores 里没有该键）——与「真实 0 分」严格区分；
//       · 请假/缺勤学员——其口语分可能是残留值或 0，判成「再加油💪」是错的；
//       · 满分非法（≤0）或开关关闭。
import type { StudentRecord, OralBand, OralRatingConfig } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';

// 档位与配置的类型定义放在 @/types（AppConfig 要引用它），此处仅 re-export 方便调用方一处引入
export type { OralBand, OralRatingConfig };

export const DEFAULT_ORAL_BANDS: OralBand[] = [
  { min: 90, label: '很棒哦👍' },
  { min: 80, label: '不错👏' },
  { min: 70, label: '还有空间🌱' },
  { min: 0, label: '再加油💪' },
];

export const DEFAULT_ORAL_RATING: OralRatingConfig = {
  enabled: true,
  bands: DEFAULT_ORAL_BANDS.map(b => ({ ...b })),
  relativeShiftPct: 10,
  minRegisteredForRelative: 3,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 编辑态配置：补齐缺字段、夹取非法阈值，但**不重排档位顺序**。
 * 配置界面里老师边改阈值边排序会导致行在指针下面乱跳，所以编辑时保持原顺序，
 * 保存/运行时再由 normalizeOralRating 统一排序。
 */
export function oralRatingForEditing(cfg?: Partial<OralRatingConfig> | null): OralRatingConfig {
  const d = DEFAULT_ORAL_RATING;
  const rawBands = Array.isArray(cfg?.bands) && cfg!.bands.length > 0 ? cfg!.bands : d.bands;
  const bands = rawBands
    .filter(b => b && typeof b.label === 'string' && Number.isFinite(b.min))
    .map(b => ({ min: Math.max(0, Math.min(100, Number(b.min))), label: String(b.label ?? '') }));

  const shift = Number.isFinite(cfg?.relativeShiftPct)
    ? Math.max(0, Math.min(100, Number(cfg!.relativeShiftPct)))
    : d.relativeShiftPct;
  const minReg = Number.isFinite(cfg?.minRegisteredForRelative)
    ? Math.max(1, Math.round(Number(cfg!.minRegisteredForRelative)))
    : d.minRegisteredForRelative;

  return {
    enabled: cfg?.enabled !== false,
    bands: bands.length > 0 ? bands : d.bands.map(b => ({ ...b })),
    relativeShiftPct: shift,
    minRegisteredForRelative: minReg,
  };
}

/**
 * 归一化配置（运行态）：云端旧快照/手工改坏的 localStorage 都可能缺字段或给非法值，
 * 一律回退到默认并按阈值降序排列，保证判定函数拿到的永远是可用配置
 * （不炸、不出现空档位表、档位顺序与"从高到低"的判定逻辑一致）。
 */
export function normalizeOralRating(cfg?: Partial<OralRatingConfig> | null): OralRatingConfig {
  const edited = oralRatingForEditing(cfg);
  // 降序；同阈值保留先出现的（稳定排序，避免配置顺序被无谓打乱）
  const bands = edited.bands
    .filter(b => b.label.trim() !== '')
    .sort((a, b) => b.min - a.min);
  return { ...edited, bands: bands.length > 0 ? bands : DEFAULT_ORAL_RATING.bands.map(b => ({ ...b })) };
}

export interface OralRating {
  /** 最终档位文案（含微调） */
  label: string;
  /** 固定线算出的基础档文案（用于解释「为什么是这个档」） */
  baseLabel: string;
  /** 最终档位下标（0 = 最好档）；配色等展示逻辑据此推导，不必各自重算 */
  bandIndex: number;
  /** 相对班均的微调方向 */
  shift: 'up' | 'down' | 'none';
  /** 本人得分率（0–100，1 位小数） */
  pct: number;
  /** 班均得分率（0–100，1 位小数）；样本不足时为 0 */
  classAvgPct: number;
  /** 班均原始分（与学情表 tooltip 的「班均」同口径，1 位小数） */
  classAvg: number;
  /** 已登记人数 */
  registered: number;
}

/** 档位下标：第一个满足 pct ≥ min 的档；都不满足则落到最低档 */
function bandIndexOf(pct: number, bands: OralBand[]): number {
  for (let i = 0; i < bands.length; i++) {
    if (pct >= bands[i].min) return i;
  }
  return bands.length - 1;
}

/**
 * 单个分数判定（纯函数，selfcheck 的主要测试面）。
 * @param raw        本人得分；undefined/null = 未登记
 * @param fullScore  该题型满分（口语一般 100，但按配置取，不硬编码）
 * @param classAvg   班均原始分（只含已登记的出勤学员）
 * @param registered 已登记人数
 * @param absent     是否请假/缺勤（true 则不判定）
 */
export function rateOralScore(
  raw: number | undefined | null,
  fullScore: number,
  classAvg: number,
  registered: number,
  absent: boolean,
  config?: Partial<OralRatingConfig> | null
): OralRating | null {
  const cfg = normalizeOralRating(config);
  if (!cfg.enabled) return null;
  if (absent) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (!Number.isFinite(fullScore) || fullScore <= 0) return null;

  // 得分率夹在 0–100：异常大值/负值不该产生"超满分档"或崩溃
  const pct = round1(Math.max(0, Math.min(100, (raw / fullScore) * 100)));
  const baseIdx = bandIndexOf(pct, cfg.bands);

  // relativeShiftPct = 0 视为「关闭相对微调」（与配置界面的说明一致）；
  // 否则 0 会变成"任何偏离都调档"，与老师设 0 的意图相反
  const canRelative = cfg.relativeShiftPct > 0 && registered >= cfg.minRegisteredForRelative && classAvg > 0;
  const classAvgPct = canRelative ? round1(Math.max(0, Math.min(100, (classAvg / fullScore) * 100))) : 0;

  let idx = baseIdx;
  let shift: OralRating['shift'] = 'none';
  if (canRelative) {
    if (pct >= classAvgPct + cfg.relativeShiftPct && baseIdx > 0) {
      idx = baseIdx - 1;   // 升一档（bands 降序，下标更小 = 更好）
      shift = 'up';
    } else if (pct <= classAvgPct - cfg.relativeShiftPct && baseIdx < cfg.bands.length - 1) {
      idx = baseIdx + 1;   // 降一档
      shift = 'down';
    }
  }

  return {
    label: cfg.bands[idx].label,
    baseLabel: cfg.bands[baseIdx].label,
    bandIndex: idx,
    shift,
    pct,
    classAvgPct,
    classAvg: round1(classAvg),
    registered,
  };
}

/**
 * 档位配色（学情表徽标 / 报告 / 公示共用）。
 * 按「档位下标在档位表中的相对位置」取色，而不是写死文案匹配 ——
 * 老师改了档位文案或增删档位，配色依然从好到差自然过渡。
 */
export function oralToneClass(r: OralRating, config?: Partial<OralRatingConfig> | null): string {
  const cfg = normalizeOralRating(config);
  const n = cfg.bands.length;
  if (n <= 1) return 'bg-slate-100 text-slate-600 border-slate-200';
  const i = Math.max(0, Math.min(n - 1, r.bandIndex));
  const ratio = i / (n - 1);           // 0 = 最好档，1 = 最差档
  if (ratio <= 0.001) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (ratio >= 0.999) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (ratio <= 0.5) return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

/** 判定表的键：一条记录 × 一个题型 */
export const oralKey = (recordId: string, qtId: string) => `${recordId}|${qtId}`;

/**
 * 批量判定：为「一批全班记录 × 一组附加项题型 id」建判定表。
 *
 * 按课次分组算班均——附加项并非每课都登记，且同一口语列在不同课次可能有不同
 * 题型 id，跨课次混算会得到错误班均。相对微调因此始终对「本课次」的班级上下文。
 *
 * @param classRecords 全班所有课次的记录（用于算各课次班均）
 * @param qtIds        要判定的附加项题型 id 集合
 * @param fullScoreOf  题型 id → 满分
 */
export function buildOralRatings(
  classRecords: StudentRecord[],
  qtIds: string[],
  fullScoreOf: (qtId: string) => number,
  config?: Partial<OralRatingConfig> | null
): Map<string, OralRating> {
  const out = new Map<string, OralRating>();
  const cfg = normalizeOralRating(config);
  if (!cfg.enabled || qtIds.length === 0) return out;

  const byLesson = new Map<number, StudentRecord[]>();
  classRecords.forEach(r => {
    const list = byLesson.get(r.lessonNumber);
    if (list) list.push(r); else byLesson.set(r.lessonNumber, [r]);
  });

  byLesson.forEach(recs => {
    const present = recs.filter(r => !isAbsentRecord(r));
    qtIds.forEach(qtId => {
      const fullScore = fullScoreOf(qtId);
      // 班均只取「已登记」的出勤学员，与 calculateClassStats 的附加项口径完全一致
      const registered = present
        .map(r => r.scores?.[qtId])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const classAvg = registered.length > 0
        ? round1(registered.reduce((a, b) => a + b, 0) / registered.length)
        : 0;

      recs.forEach(r => {
        const rating = rateOralScore(r.scores?.[qtId], fullScore, classAvg, registered.length, isAbsentRecord(r), cfg);
        if (rating) out.set(oralKey(r.id, qtId), rating);
      });
    });
  });

  return out;
}

/**
 * 档位配色的十六进制版：公示导出是独立 HTML（引不到 Tailwind 类），只能用内联样式。
 * 与 oralToneClass 同一套「按档位相对位置取色」的规则，两处观感保持一致。
 */
export function oralToneColor(r: OralRating, config?: Partial<OralRatingConfig> | null): { bg: string; text: string; border: string } {
  const cfg = normalizeOralRating(config);
  const n = cfg.bands.length;
  const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, r.bandIndex));
  const ratio = n <= 1 ? 0.5 : i / (n - 1);
  if (ratio <= 0.001) return { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' };   // emerald
  if (ratio >= 0.999) return { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' };   // rose
  if (ratio <= 0.5) return { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' };     // sky
  return { bg: '#fffbeb', text: '#b45309', border: '#fde68a' };                       // amber
}

/** 档位分布（学情报告用）：按档位表顺序输出 label → 次数，含 0 次的档以便对比 */
export function oralDistribution(
  ratings: Iterable<OralRating>,
  config?: Partial<OralRatingConfig> | null
): { label: string; count: number }[] {
  const cfg = normalizeOralRating(config);
  const counts = new Map<string, number>();
  cfg.bands.forEach(b => counts.set(b.label, 0));
  Array.from(ratings).forEach(r => {
    // 判定表可能来自旧配置（档位被改过），未知文案单列一档而不是丢弃
    counts.set(r.label, (counts.get(r.label) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

/** 判定说明（tooltip / 报告脚注用）：把「为什么是这个档」讲清楚 */
export function explainRating(r: OralRating, config?: Partial<OralRatingConfig> | null): string {
  const cfg = normalizeOralRating(config);
  const base = `得分率 ${r.pct}% → ${r.baseLabel}`;
  if (r.shift === 'none') {
    // classAvgPct 为 0 表示本次判定没有启用相对微调（样本不足 / 阈值设 0 / 无班均）
    if (r.classAvgPct > 0) return `${base}；班均 ${r.classAvg} 分（${r.classAvgPct}%），在班均 ±${cfg.relativeShiftPct} 个百分点内，不调档`;
    if (cfg.relativeShiftPct <= 0) return `${base}；已关闭相对微调（阈值设为 0），只按固定分数线判定`;
    return `${base}；已登记 ${r.registered} 人（少于 ${cfg.minRegisteredForRelative} 人），只按固定分数线判定`;
  }
  const dir = r.shift === 'up' ? '升' : '降';
  return `${base}；班均 ${r.classAvg} 分（${r.classAvgPct}%），偏离超过 ${cfg.relativeShiftPct} 个百分点 → ${dir}一档为「${r.label}」`;
}
