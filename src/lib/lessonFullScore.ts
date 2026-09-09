// 课次满分（正确率分母）的唯一取值来源：
// Σ 题型满分 + Σ 计入总分的分数型自定义列满分。
// 学情表 / 表扬榜 / 学情报告 / 公示导出的正确率分母一律经由本函数取得，
// 避免各自硬编码（如默认题型 3×100=300）导致口径漂移。
import type { LessonConfig } from '@/types';

export function getLessonFullScore(cfg: LessonConfig | undefined | null): number {
  if (!cfg) return 0;
  const qtTotal = (cfg.questionTypes || []).reduce((sum, qt) => sum + (qt.fullScore || 0), 0);
  const cfTotal = (cfg.customFields || []).reduce(
    (sum, cf) => (cf.kind === 'number' && cf.includeInTotal ? sum + (cf.fullScore || 0) : sum),
    0
  );
  return qtTotal + cfTotal;
}
