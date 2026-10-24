// 学员长期薄弱板块（2026-10-23）
//
// 用途：四个一的「附参考教辅」不再是固定清单，而是按孩子**跨课次**的板块得分率挑资料。
// 口径：只统计非附加项题型、已录入的分数；按板块 Σ得分/Σ满分 算得分率；
//   取「低于 75%」的板块（最多 2 个）；都不低于 75% 时再看最低的一项（<85% 才作为焦点）。
import type { StudentRecord, LessonConfig } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';
import { categoryOf } from '@/lib/qtCategories';

export function longTermWeakCategories(
  records: StudentRecord[],
  lessonConfigs: { [lesson: string]: LessonConfig } | undefined,
  max = 2,
  /** 题型名 → 板块覆盖（与报告/表格同口径） */
  categoryOverrides?: Record<string, string>,
): string[] {
  if (!lessonConfigs) return [];
  const acc = new Map<string, { s: number; f: number }>();
  records.forEach(r => {
    if (isAbsentRecord(r)) return;
    const cfg = lessonConfigs[r.lessonNumber];
    if (!cfg) return;
    (cfg.questionTypes || []).forEach(qt => {
      if (qt.excludeFromTotal) return;
      const v = r.scores?.[qt.id];
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const cat = categoryOf(qt.name, categoryOverrides).name;
      const b = acc.get(cat) || { s: 0, f: 0 };
      b.s += v;
      b.f += Number(qt.fullScore) || 0;
      acc.set(cat, b);
    });
  });
  const rated = [...acc.entries()]
    .filter(([, b]) => b.f > 0)
    .map(([cat, b]) => ({ cat, rate: b.s / b.f }))
    .sort((a, b) => a.rate - b.rate);
  if (rated.length === 0) return [];
  const weak = rated.filter(x => x.rate < 0.75).slice(0, max).map(x => x.cat);
  if (weak.length > 0) return weak;
  return rated[0].rate < 0.85 ? [rated[0].cat] : [];
}
