// 题型统计 · 聚合与溯源（2026-10-25）
//
// 背景（用户截图反馈）：学情报告的「各题型」里，"语法选择/完形填空/阅读理解"会重复出现，
// 同一题型在同一个学生身上出现两三次。
//
// 根因：课次配置是按课次各存一份的，同一题型在第 1 课叫「语法选择」、第 3 课还是「语法选择」，
// 但两课的题库条目 id 不同。旧统计以 `qt.id` 作为聚合键 —— 于是同一题型被拆成多条，
// 既重复展示，又让「知识表现」的板块分母把同一题型算了两次（得分率被拉偏）。
//
// 现在：以「题型名称」为聚合键（去空白、忽略大小写的归一化），并保留每一课的明细用于溯源：
//   · 报告卡片显示「第 1 课 / 第 3 课」，老师能直接看出这条结论来自哪些课次；
//   · 同一课次里若登记了两条同名题型（误加），会先按条合并再计入，不会重复计样本。
//
// 抽成纯函数的原因：个人报告与班级报告原先各写一套聚合，改一处漏一处；
// 现在两边共用同一份实现，可被 selfcheck 直接断言。
import type { StudentRecord, LessonConfig } from '@/types';

/** 题型名称归一化：全角/半角空格、大小写差异不产生新条目 */
export function questionTypeKey(name: string): string {
  return String(name ?? '')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

/** 一条「某课次某题型」的样本（同一课次同名题型已合并为一条） */
export interface QuestionTypeSample {
  lesson: number;
  key: string;
  id: string;
  name: string;
  score: number;
  full: number;
}

export interface QuestionTypeLessonStat {
  lesson: number;
  avgScore: number;
  fullScore: number;
  correctRate: number;
  /** 该课次内的样本数（通常 1 条记录 = 1 次） */
  count: number;
}

export interface QuestionTypeStat {
  /** 首次出现的题型 id（保留兼容；查找请用 name） */
  id: string;
  name: string;
  /** 每个课次的平均得分（跨课次合并后的口径） */
  avgScore: number;
  /** 每个课次的平均满分（各课满分不一致时用于展示"均 X 分"） */
  fullScore: number;
  /** 样本数（记录数） */
  count: number;
  /** 总得分 ÷ 总满分：跨课次加权，不取各课得分率的简单平均 */
  correctRate: number;
  /** 出现过的课次（升序）——用于卡片溯源 */
  lessons: number[];
  /** 每课明细——用于溯源提示 */
  byLesson: QuestionTypeLessonStat[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const rateOf = (score: number, full: number) => (full > 0 ? Math.round((score / full) * 1000) / 10 : 0);

/**
 * 把一条记录拆成题型样本。
 * 同一课次内同名题型（重复登记）先合并：得分与满分相加、只记 1 个样本，
 * 否则同一次测评会被算成两次，均分反而被稀释。
 */
export function questionTypeSamplesOf(record: StudentRecord, config?: LessonConfig): QuestionTypeSample[] {
  if (!config) return [];
  const perName = new Map<string, QuestionTypeSample>();
  config.questionTypes
    .filter(qt => !qt.excludeFromTotal)
    .forEach(qt => {
      const raw = record.scores?.[qt.id];
      if (raw == null || String(raw).trim() === '') return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      const key = questionTypeKey(qt.name) || qt.id;
      const existing = perName.get(key);
      const full = Number(qt.fullScore) || 0;
      if (existing) {
        existing.score += value;
        existing.full += full;
      } else {
        perName.set(key, {
          lesson: record.lessonNumber,
          key,
          id: qt.id,
          name: String(qt.name ?? '').trim() || qt.id,
          score: value,
          full,
        });
      }
    });
  return [...perName.values()];
}

/** 把样本按题型名称归并，并保留课次溯源 */
export function aggregateQuestionTypeSamples(samples: QuestionTypeSample[]): QuestionTypeStat[] {
  const map = new Map<string, {
    id: string;
    name: string;
    score: number;
    full: number;
    count: number;
    byLesson: Map<number, { score: number; full: number; count: number }>;
  }>();

  samples.forEach(sample => {
    if (!sample.key) return;
    let bucket = map.get(sample.key);
    if (!bucket) {
      bucket = { id: sample.id, name: sample.name, score: 0, full: 0, count: 0, byLesson: new Map() };
      map.set(sample.key, bucket);
    }
    bucket.score += sample.score;
    bucket.full += sample.full;
    bucket.count += 1;
    const lesson = bucket.byLesson.get(sample.lesson) || { score: 0, full: 0, count: 0 };
    lesson.score += sample.score;
    lesson.full += sample.full;
    lesson.count += 1;
    bucket.byLesson.set(sample.lesson, lesson);
  });

  return [...map.values()].map(bucket => {
    const lessons = [...bucket.byLesson.keys()].sort((a, b) => a - b);
    const byLesson = lessons.map(lesson => {
      const item = bucket.byLesson.get(lesson)!;
      return {
        lesson,
        avgScore: item.count > 0 ? round1(item.score / item.count) : 0,
        fullScore: item.count > 0 ? round1(item.full / item.count) : 0,
        correctRate: rateOf(item.score, item.full),
        count: item.count,
      };
    });
    return {
      id: bucket.id,
      name: bucket.name,
      avgScore: bucket.count > 0 ? round1(bucket.score / bucket.count) : 0,
      fullScore: bucket.count > 0 ? round1(bucket.full / bucket.count) : 0,
      count: bucket.count,
      correctRate: rateOf(bucket.score, bucket.full),
      lessons,
      byLesson,
    };
  });
}

/** 便捷入口：一批记录 → 已归并的题型统计 */
export function collectQuestionTypeStats(
  records: StudentRecord[],
  lessonConfigs: { [lesson: string]: LessonConfig },
): QuestionTypeStat[] {
  return aggregateQuestionTypeSamples(
    records.flatMap(record => questionTypeSamplesOf(record, lessonConfigs[record.lessonNumber])),
  );
}
