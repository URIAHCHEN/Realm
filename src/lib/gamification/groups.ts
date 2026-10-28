// 小组 PK：分组、区间计分与结算（纯函数，可被 selfcheck 直接断言）
// 计分口径：小组得分 = 组内成员在 [fromLesson, toLesson] 区间内产生的积分事件之和。
// 这与原站「按成员积分累计、同分平局」的做法一致；不做人数归一，避免“人少占便宜”。

import { BUILD_STAGES, BUILD_STEP_SCORE, type GroupBattle, type GroupDef, type PetEvent } from '@/types/pet';

/** 把学生按人数尽量均分；mode=random 时打乱顺序 */
export function makeGroups(
  students: string[],
  count: number,
  mode: 'auto' | 'random' = 'auto',
  rng: () => number = Math.random,
): GroupDef[] {
  const members = [...students];
  if (mode === 'random') {
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [members[i], members[j]] = [members[j], members[i]];
    }
  }
  const size = Math.max(1, Math.ceil(members.length / Math.max(1, count)));
  const groups: GroupDef[] = [];
  for (let i = 0; i < count; i++) {
    const slice = members.slice(i * size, (i + 1) * size);
    if (!slice.length) break;
    groups.push({ id: `g${i + 1}`, name: `${i + 1} 组`, members: slice });
  }
  return groups;
}

/** 组内成员的积分合计（区间为闭区间；缺课次的事件不计入指定区间） */
export function groupScore(
  events: PetEvent[],
  group: GroupDef,
  fromLesson: number,
  toLesson: number,
): number {
  const set = new Set(group.members);
  return events.reduce((sum, event) => {
    if (!set.has(event.studentName)) return sum;
    const lesson = Number(event.lessonNumber);
    if (!Number.isFinite(lesson) || lesson < fromLesson || lesson > toLesson) return sum;
    return sum + event.delta;
  }, 0);
}

/** 组内个人贡献榜（用于 PK 详情） */
export function groupContributors(
  events: PetEvent[],
  group: GroupDef,
  fromLesson: number,
  toLesson: number,
): { studentName: string; score: number }[] {
  const totals = new Map<string, number>();
  group.members.forEach(name => totals.set(name, 0));
  events.forEach(event => {
    if (!totals.has(event.studentName)) return;
    const lesson = Number(event.lessonNumber);
    if (!Number.isFinite(lesson) || lesson < fromLesson || lesson > toLesson) return;
    totals.set(event.studentName, (totals.get(event.studentName) ?? 0) + event.delta);
  });
  return [...totals.entries()]
    .map(([studentName, score]) => ({ studentName, score }))
    .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName, 'zh-CN'));
}

export function createBattle(
  groupAId: string,
  groupBId: string,
  fromLesson: number,
  toLesson: number,
  nowISO = new Date().toISOString(),
): GroupBattle {
  return {
    id: `battle:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    groupAId,
    groupBId,
    fromLesson,
    toLesson,
    createdAt: nowISO,
    status: 'active',
  };
}

/** 结算：同一时间点重复调用结果一致 */
export function settleBattle(
  battle: GroupBattle,
  events: PetEvent[],
  groups: GroupDef[],
  nowISO = new Date().toISOString(),
): GroupBattle {
  const a = groups.find(g => g.id === battle.groupAId);
  const b = groups.find(g => g.id === battle.groupBId);
  if (!a || !b) return battle;
  const aScore = groupScore(events, a, battle.fromLesson, battle.toLesson);
  const bScore = groupScore(events, b, battle.fromLesson, battle.toLesson);
  return {
    ...battle,
    status: 'settled',
    result: {
      aScore,
      bScore,
      winnerId: aScore === bScore ? null : aScore > bScore ? a.id : b.id,
      settledAt: nowISO,
    },
  };
}

/** 进行中的对战（同一小组不重复开战） */
export function activeBattleOf(battles: GroupBattle[] | undefined, groupId: string): GroupBattle | undefined {
  return (battles ?? []).find(b => b.status === 'active' && (b.groupAId === groupId || b.groupBId === groupId));
}


/** 班级共建进度：全班净积分决定第几站，站内按 100 分推进 */
export function buildProgress(events: PetEvent[]): {
  total: number;
  stageIndex: number;
  stageName: string;
  stageScore: number;
  stageNeed: number;
  isFinal: boolean;
} {
  const total = events.reduce((sum, event) => sum + event.delta, 0);
  const safe = Math.max(0, total);
  const stageIndex = Math.min(BUILD_STAGES.length - 1, Math.floor(safe / BUILD_STEP_SCORE));
  return {
    total,
    stageIndex,
    stageName: BUILD_STAGES[stageIndex],
    stageScore: safe - stageIndex * BUILD_STEP_SCORE,
    stageNeed: BUILD_STEP_SCORE,
    isFinal: stageIndex === BUILD_STAGES.length - 1,
  };
}
