// 伴学萌宠：积分推导与养成计算的纯函数层
// 设计约束：
//   1) 只读既有 Class / StudentRecord，不修改任何既有字段；
//   2) 事件 append-only，撤回用反向事件表达；
//   3) 事件 id 由「记录 id + 来源」派生，重复结算天然幂等；
//   4) 不依赖 DOM / 网络，便于 selfcheck 直接断言。

import type { Class, StudentRecord } from '@/types';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { attendanceKind, isAbsentRecord } from '@/lib/attendance';
import {
  DEFAULT_PET_SETTINGS,
  PET_BADGES,
  PET_CATALOG,
  PET_LEGACY,
  type ClassPetData,
  type PetEvent,
  type PetSettings,
  type PetStage,
  type PetState,
} from '@/types/pet';

/** 负向状态词：命中即视为「未完成」，与表扬榜口径保持一致 */
const NEGATIVE_STATUS = /未完成|未交|未做|未带|没带|没做|请假|缺勤|缺席|迟到|补交|不合格|未参与/;
/** 课堂表现的负向词（用于表达之星判定） */
const NEGATIVE_PERFORMANCE = /走神|说话|违纪|未参与|不专注|睡觉|玩手机/;

export function isPositiveStatus(value: string | undefined | null): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return !NEGATIVE_STATUS.test(text);
}

/** 等级：返回 1..maxLevel；经验表为累计门槛 */
export function levelOf(exp: number, table: number[]): number {
  const safe = Math.max(0, Number(exp) || 0);
  let level = 1;
  for (let i = 0; i < table.length; i++) {
    if (safe >= table[i]) level = i + 1;
    else break;
  }
  return Math.min(level, table.length);
}

export interface ExpProgress {
  level: number;
  isMax: boolean;
  current: number;
  need: number;
  percent: number;
}

/** 当前等级内的经验进度（满级时 percent=100） */
export function expProgress(exp: number, table: number[]): ExpProgress {
  const level = levelOf(exp, table);
  const isMax = level >= table.length;
  if (isMax) return { level, isMax, current: exp, need: 0, percent: 100 };
  const floor = table[level - 1] ?? 0;
  const ceil = table[level] ?? floor + 1;
  const current = Math.max(0, exp - floor);
  const need = Math.max(1, ceil - floor);
  return { level, isMax, current, need, percent: Math.min(100, Math.round((current / need) * 100)) };
}

/** 等级 → 外形阶段：1-2 幼体 / 3-4 成长 / 5-6 少年 / 7-8 守护（对齐原站 8 级） */
export function stageOf(level: number): PetStage {
  if (level >= 7) return 3;
  if (level >= 5) return 2;
  if (level >= 3) return 1;
  return 0;
}

export type PetStatus = 'normal' | 'hungry' | 'sick' | 'egg';

/**
 * 宠物状态（对齐原站「宠物状态」配置）：
 * - Lv.1 且经验 ≤ -10 → 变回蛋
 * - Lv.1 且经验 < 0 → 生病
 * - 超过 48 小时没有任何积分事件 → 饥饿
 */
export function petStatusOf(state: PetState, lastEventISO?: string, nowMs = Date.now()): PetStatus {
  if (state.level <= 1 && state.exp <= -10) return 'egg';
  if (state.level <= 1 && state.exp < 0) return 'sick';
  if (lastEventISO) {
    const last = Date.parse(lastEventISO);
    if (Number.isFinite(last) && nowMs - last > 48 * 3600 * 1000) return 'hungry';
  }
  return 'normal';
}

/** 宠物定义：先查可领养目录，再查旧版保留；都查不到时给一个中性的占位定义，绝不改写原 id */
export function petDefOf(petId: string) {
  return PET_CATALOG.find(pet => pet.id === petId)
    ?? PET_LEGACY.find(pet => pet.id === petId)
    ?? { id: petId, name: '未知宠物', tagline: '数据保留中', hue: '0 0% 45%', stages: ['未知', '未知', '未知', '未知'] as [string, string, string, string] };
}

/** 单条记录可产生的自动积分事件（幂等 id） */
export function autoEventsForRecord(
  record: StudentRecord,
  cls: Class,
  settings: PetSettings,
  nowISO: string,
): PetEvent[] {
  if (isAbsentRecord(record)) return [];
  const events: PetEvent[] = [];
  const base = { studentName: record.studentName, lessonNumber: record.lessonNumber, source: 'auto' as const, createdAt: nowISO };

  // 作业完成 +5
  if (isPositiveStatus(record.homeworkStatus)) {
    events.push({
      ...base,
      id: `${record.id}:homework`,
      delta: settings.rules.homeworkDone,
      reason: `第${record.lessonNumber}课作业完成`,
    });
  }

  // 课后任务完成 +5（有分数或正向状态都算）
  const listeningText = String(record.listeningStatus ?? '').trim();
  if (Number(record.listeningScore) > 0 || isPositiveStatus(listeningText)) {
    events.push({
      ...base,
      id: `${record.id}:listening`,
      delta: settings.rules.listeningDone,
      reason: `第${record.lessonNumber}课课后任务完成`,
    });
  }

  // 满分额外 +10（以课次真实满分为分母，避免硬编码）
  const full = getLessonFullScore(cls.lessonConfigs?.[String(record.lessonNumber)]);
  if (full > 0 && Number(record.totalScore) >= full) {
    events.push({
      ...base,
      id: `${record.id}:full`,
      delta: settings.rules.fullScoreBonus,
      reason: `第${record.lessonNumber}课满分加成`,
    });
  }

  return events;
}

/** 从事件汇总某学生的经验 */
export function expOfEvents(events: PetEvent[], studentName: string): number {
  return events.reduce((sum, e) => (e.studentName === studentName ? sum + e.delta : sum), 0);
}

/** 自动徽章判定（只增不减） */
export function autoBadgesFor(
  records: StudentRecord[],
  events: PetEvent[],
  studentName: string,
  owned: string[],
): string[] {
  const mine = records
    .filter(r => r.studentName === studentName && !isAbsentRecord(r))
    .sort((a, b) => a.lessonNumber - b.lessonNumber);
  const next = new Set(owned);

  const positivePerformances = mine.filter(r => {
    const v = String(r.classPerformance ?? '').trim();
    return v && !NEGATIVE_PERFORMANCE.test(v);
  }).length;
  if (positivePerformances >= 3) next.add('speak');

  // 连续 3 课次作业完成
  let streak = 0;
  for (const r of mine) {
    if (isPositiveStatus(r.homeworkStatus)) {
      streak++;
      if (streak >= 3) { next.add('persist'); break; }
    } else {
      streak = 0;
    }
  }

  // 满分加成
  if (events.some(e => e.studentName === studentName && e.id.endsWith(':full'))) next.add('leap');

  // 连续 3 课次全勤
  let attendStreak = 0;
  for (const r of mine) {
    if (attendanceKind(r.attendance) === 'onTime') {
      attendStreak++;
      if (attendStreak >= 3) { next.add('order'); break; }
    } else {
      attendStreak = 0;
    }
  }

  // 只保留已定义徽章
  return PET_BADGES.filter(b => next.has(b.id)).map(b => b.id);
}

/** 经验策略：默认按 0 下限展示/写回；allowNegativeExp=true 时保留负值 */
export function applyExpPolicy(raw: number, settings: PetSettings): number {
  return settings.allowNegativeExp ? raw : Math.max(0, raw);
}

/** 该记录是否参与自动结算（对应 autoScope 口径） */
export function includeRecordByScope(record: StudentRecord, settings: PetSettings): boolean {
  if (settings.autoScope !== 'sinceEnable') return true;
  if (!settings.enabledAt) return true;
  const at = Date.parse(settings.enabledAt);
  const date = Date.parse(String(record.date ?? ''));
  if (!Number.isFinite(at) || !Number.isFinite(date)) return true; // 数据不全时不擅自丢分
  return date >= at;
}

/** 结算：把新记录折算成事件并更新宠物（幂等，可反复调用） */
export function settleClassPets(
  cls: Class,
  prev: ClassPetData | undefined,
  settings: PetSettings,
  nowISO: string,
): ClassPetData {
  const existing = prev?.events ?? [];
  const known = new Set(existing.map(e => e.id));
  const added: PetEvent[] = [];

  for (const record of cls.records ?? []) {
    if (!includeRecordByScope(record, settings)) continue;
    for (const event of autoEventsForRecord(record, cls, settings, nowISO)) {
      if (!known.has(event.id)) {
        known.add(event.id);
        added.push(event);
      }
    }
  }

  const events = added.length ? [...existing, ...added] : existing;
  const pets: ClassPetData['pets'] = { ...(prev?.pets ?? {}) };

  for (const studentName of cls.students ?? []) {
    const old = pets[studentName];
    if (!old) continue; // 未领养的不计算
    const exp = applyExpPolicy(expOfEvents(events, studentName), settings);
    const level = levelOf(exp, settings.levelTable);
    const badges = autoBadgesFor(cls.records ?? [], events, studentName, old.badges ?? []);
    pets[studentName] = { ...old, exp, level, badges };
  }

  return { pets, events, lastAutoLesson: maxLesson(cls) };
}

function maxLesson(cls: Class): number {
  return (cls.records ?? []).reduce((max, r) => Math.max(max, Number(r.lessonNumber) || 0), 0);
}

/** 领养：生成初始状态 */
export function adoptPet(petId: string, nowISO: string): PetState {
  return { petId, level: 1, exp: 0, adoptedAt: nowISO, badges: [], route: 'pet', graduated: [] };
}

/** 满级判断 */
export function isMaxLevel(state: PetState, settings: PetSettings): boolean {
  return state.level >= settings.levelTable.length;
}

export function defaultSettings(): PetSettings {
  return { ...DEFAULT_PET_SETTINGS, rules: { ...DEFAULT_PET_SETTINGS.rules }, levelTable: [...DEFAULT_PET_SETTINGS.levelTable] };
}


/**
 * 未经 0 下限裁剪的经验总额（= 流水代数和）。
 * 经验展示用的是 max(0, rawExp)，因此出现负分时会与流水对不上；
 * 对账、导出与审计一律用本函数，避免把下限当成"数据丢失"。
 */
export function rawExpOf(events: PetEvent[], studentName: string): number {
  return events.reduce((sum, event) => (event.studentName === studentName ? sum + event.delta : sum), 0);
}
