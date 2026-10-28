// 伴学萌宠：本地持久化与增量变更（不改动既有 classData / appConfig）
// 存储键独立，避免与学情主数据互相覆盖；云端快照中以可选字段 `pet` 携带。

import {
  BADGES_PER_LEVEL,
  DEFAULT_PET_SETTINGS,
  PET_CATALOG,
  PET_SKINS,
  type ClassPetData,
  type GroupBattle,
  type GroupDef,
  type PetBadgeDef,
  type PetEvent,
  type PetSettings,
  type PetSnapshot,
  type PetState,
  type RaisingRoute,
} from '@/types/pet';
import { adoptPet, isMaxLevel, levelOf, petDefOf } from '@/lib/gamification/rules';
import { createBattle, makeGroups, settleBattle } from '@/lib/gamification/groups';

const PET_KEY = 'petData';

export function defaultPetSnapshot(): PetSnapshot {
  return {
    version: 1,
    settings: {
      ...DEFAULT_PET_SETTINGS,
      rules: { ...DEFAULT_PET_SETTINGS.rules },
      levelTable: [...DEFAULT_PET_SETTINGS.levelTable],
    },
    classes: {},
  };
}

/** 宽松归一化：旧版本/手工改坏的快照也能安全加载 */
export function normalizePetSnapshot(raw: unknown): PetSnapshot {
  const base = defaultPetSnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<PetSnapshot>;

  const settings: PetSettings = {
    enabled: Boolean(value.settings?.enabled),
    classScope: Array.isArray(value.settings?.classScope) ? value.settings!.classScope.filter(Boolean) : [],
    rules: {
      homeworkDone: Number(value.settings?.rules?.homeworkDone) || base.settings.rules.homeworkDone,
      listeningDone: Number(value.settings?.rules?.listeningDone) || base.settings.rules.listeningDone,
      fullScoreBonus: Number(value.settings?.rules?.fullScoreBonus) || base.settings.rules.fullScoreBonus,
    },
    levelTable:
      Array.isArray(value.settings?.levelTable) && value.settings!.levelTable.length >= 2
        ? value.settings!.levelTable.map(n => Math.max(0, Number(n) || 0)).sort((a, b) => a - b)
        : base.settings.levelTable,
  };

  const classes: PetSnapshot['classes'] = {};
  Object.entries(value.classes ?? {}).forEach(([classId, data]) => {
    if (!data || typeof data !== 'object') return;
    const pets: ClassPetData['pets'] = {};
    Object.entries((data as ClassPetData).pets ?? {}).forEach(([student, pet]) => {
      if (!pet || typeof pet !== 'object') return;
      const known = PET_CATALOG.some(p => p.id === (pet as PetState).petId);
      pets[student] = {
        petId: known ? (pet as PetState).petId : PET_CATALOG[0].id,
        level: Math.max(1, Number((pet as PetState).level) || 1),
        exp: Math.max(0, Number((pet as PetState).exp) || 0),
        adoptedAt: String((pet as PetState).adoptedAt ?? new Date().toISOString()),
        badges: Array.isArray((pet as PetState).badges) ? (pet as PetState).badges.filter(Boolean) : [],
        route: (pet as PetState).route === 'building' ? 'building' : 'pet',
        graduated: Array.isArray((pet as PetState).graduated) ? (pet as PetState).graduated : [],
        badgeAwards: (pet as PetState).badgeAwards ?? {},
        badgesSpent: Math.max(0, Number((pet as PetState).badgesSpent) || 0),
        ownedSkins: Array.isArray((pet as PetState).ownedSkins) ? ((pet as PetState).ownedSkins ?? []).filter(Boolean) : [],
        skin: typeof (pet as PetState).skin === 'string' ? (pet as PetState).skin : undefined,
      };
    });
    const rawGroups = (data as ClassPetData).groups;
    const groups = Array.isArray(rawGroups)
      ? rawGroups
          .filter(g => g && Array.isArray(g.members))
          .map((g, index) => ({ id: String(g.id || `g${index + 1}`), name: String(g.name || `${index + 1} 组`), members: g.members.filter(Boolean) }))
      : undefined;

    classes[classId] = {
      pets,
      events: Array.isArray((data as ClassPetData).events) ? (data as ClassPetData).events : [],
      lastAutoLesson: Number((data as ClassPetData).lastAutoLesson) || undefined,
      groups,
      battles: Array.isArray((data as ClassPetData).battles) ? (data as ClassPetData).battles : undefined,
    };
  });

  return { version: 1, settings, classes };
}

export function loadPetSnapshot(): PetSnapshot {
  try {
    const raw = localStorage.getItem(PET_KEY);
    if (!raw) return defaultPetSnapshot();
    return normalizePetSnapshot(JSON.parse(raw));
  } catch {
    return defaultPetSnapshot();
  }
}

export function savePetSnapshot(snapshot: PetSnapshot): void {
  try {
    localStorage.setItem(PET_KEY, JSON.stringify(snapshot));
  } catch {
    // 配额超限时静默：学情数据优先，宠物数据可重建
  }
}

function ensureClass(snapshot: PetSnapshot, classId: string): ClassPetData {
  return snapshot.classes[classId] ?? { pets: {}, events: [] };
}

/** 领养 / 换宠物（满级毕业后重领时调用） */
export function adoptForStudent(
  snapshot: PetSnapshot,
  classId: string,
  studentName: string,
  petId: string,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const prev = cls.pets[studentName];
  const keepGraduated = prev?.graduated ?? [];
  const next: PetState = prev && !isMaxLevel(prev, snapshot.settings)
    ? { ...prev, petId }
    : { ...adoptPet(petId, nowISO), graduated: keepGraduated };

  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: { ...cls, pets: { ...cls.pets, [studentName]: next } },
    },
  };
}

/** 人工加减分（写事件 + 重算该学生） */
export function addManualScore(
  snapshot: PetSnapshot,
  classId: string,
  studentName: string,
  delta: number,
  reason: string,
  nowISO = new Date().toISOString(),
  lessonNumber?: number,
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet) return snapshot;

  const event: PetEvent = {
    id: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    studentName,
    delta,
    lessonNumber,
    reason: reason.trim() || (delta >= 0 ? '课堂加分' : '扣分修正'),
    source: 'manual',
    createdAt: nowISO,
  };
  const events = [...cls.events, event];
  const exp = Math.max(0, events.reduce((sum, e) => (e.studentName === studentName ? sum + e.delta : sum), 0));
  const level = levelOf(exp, snapshot.settings.levelTable);

  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: {
        ...cls,
        events,
        pets: { ...cls.pets, [studentName]: { ...pet, exp, level } },
      },
    },
  };
}

/** 批量加分：一次提交，同一 batchId，可整批撤回 */
export function addScoresBatch(
  snapshot: PetSnapshot,
  classId: string,
  studentNames: string[],
  delta: number,
  reason: string,
  nowISO = new Date().toISOString(),
  lessonNumber?: number,
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const batchId = `batch:${Date.now()}`;
  const events = [...cls.events];
  const pets = { ...cls.pets };

  studentNames.forEach(name => {
    const pet = pets[name];
    if (!pet) return;
    events.push({
      id: `${batchId}:${name}`,
      studentName: name,
      lessonNumber,
      delta,
      reason,
      source: 'manual',
      batchId,
      createdAt: nowISO,
    });
    const exp = Math.max(0, events.reduce((sum, e) => (e.studentName === name ? sum + e.delta : sum), 0));
    pets[name] = { ...pet, exp, level: levelOf(exp, snapshot.settings.levelTable) };
  });

  return { ...snapshot, classes: { ...snapshot.classes, [classId]: { ...cls, events, pets } } };
}

/** 撤销某条事件（写反向事件，保留审计痕迹） */
export function undoEvent(
  snapshot: PetSnapshot,
  classId: string,
  eventId: string,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const target = cls.events.find(e => e.id === eventId);
  if (!target) return snapshot;
  return addManualScore(snapshot, classId, target.studentName, -target.delta, `撤回：${target.reason}`, nowISO);
}

/** 毕业：满级后可重领（pet）或转社区建设（building） */
export function graduatePet(
  snapshot: PetSnapshot,
  classId: string,
  studentName: string,
  route: RaisingRoute,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet) return snapshot;

  const graduated = [...pet.graduated, { petId: pet.petId, level: pet.level, at: nowISO }];
  const next: PetState = route === 'building'
    ? { ...pet, route: 'building', graduated }
    : { ...adoptPet(PET_CATALOG[0].id, nowISO), graduated };

  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: { ...cls, pets: { ...cls.pets, [studentName]: next } },
    },
  };
}

/** 手动授予徽章（协作 / 领航） */
export function awardBadge(
  snapshot: PetSnapshot,
  classId: string,
  studentName: string,
  badge: PetBadgeDef,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet || pet.badges.includes(badge.id)) return snapshot;
  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: {
        ...cls,
        pets: {
          ...cls.pets,
          [studentName]: {
            ...pet,
            badges: [...pet.badges, badge.id],
            badgeAwards: { ...(pet.badgeAwards ?? {}), [badge.id]: nowISO },
          },
        },
      },
    },
  };
}

/** 更新设置（灰度开关 / 班级范围 / 规则权重） */
export function updateSettings(snapshot: PetSnapshot, patch: Partial<PetSettings>): PetSnapshot {
  return { ...snapshot, settings: { ...snapshot.settings, ...patch } };
}

/** 是否对该班级开放（灰度） */
export function isEnabledForClass(snapshot: PetSnapshot, classId: string): boolean {
  if (!snapshot.settings.enabled) return false;
  const scope = snapshot.settings.classScope;
  return scope.length === 0 || scope.includes(classId);
}

export { petDefOf };


/** 保存分组（自动均分或随机） */
export function resetGroups(
  snapshot: PetSnapshot,
  classId: string,
  students: string[],
  count: number,
  mode: 'auto' | 'random' = 'auto',
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  return {
    ...snapshot,
    classes: { ...snapshot.classes, [classId]: { ...cls, groups: makeGroups(students, count, mode) } },
  };
}

/** 更新分组（手工改名/改动成员时使用） */
export function saveGroups(snapshot: PetSnapshot, classId: string, groups: GroupDef[]): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  return { ...snapshot, classes: { ...snapshot.classes, [classId]: { ...cls, groups } } };
}

/** 发起小组 PK（默认当前课次单课对战） */
export function startBattle(
  snapshot: PetSnapshot,
  classId: string,
  groupAId: string,
  groupBId: string,
  fromLesson: number,
  toLesson: number,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const battle = createBattle(groupAId, groupBId, fromLesson, toLesson, nowISO);
  return {
    ...snapshot,
    classes: { ...snapshot.classes, [classId]: { ...cls, battles: [...(cls.battles ?? []), battle] } },
  };
}

/** 揭晓结果：按区间事件结算并写回战绩 */
export function revealBattle(
  snapshot: PetSnapshot,
  classId: string,
  battleId: string,
  nowISO = new Date().toISOString(),
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const battles = cls.battles ?? [];
  const battle = battles.find(b => b.id === battleId);
  if (!battle) return snapshot;
  const settled = settleBattle(battle, cls.events, cls.groups ?? [], nowISO);
  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: { ...cls, battles: battles.map(b => (b.id === battleId ? settled : b)) },
    },
  };
}

export type { GroupBattle, GroupDef };


/** 徽章余额：升级所得（每级 5 枚）减去已花费 */
export function badgeBalance(state: PetState): number {
  return Math.max(0, (Math.max(1, state.level) - 1) * BADGES_PER_LEVEL - (state.badgesSpent ?? 0));
}

/** 购买皮肤：余额不足原样返回；成功后自动装备 */
export function buySkin(snapshot: PetSnapshot, classId: string, studentName: string, skinId: string): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  const skin = PET_SKINS.find(item => item.id === skinId);
  if (!pet || !skin) return snapshot;
  const owned = pet.ownedSkins ?? [];
  if (owned.includes(skinId)) {
    return equipSkin(snapshot, classId, studentName, skinId);
  }
  if (badgeBalance(pet) < skin.price) return snapshot;

  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: {
        ...cls,
        pets: {
          ...cls.pets,
          [studentName]: {
            ...pet,
            badgesSpent: (pet.badgesSpent ?? 0) + skin.price,
            ownedSkins: [...owned, skinId],
            skin: skinId,
          },
        },
      },
    },
  };
}

/** 装备/卸下皮肤 */
export function equipSkin(snapshot: PetSnapshot, classId: string, studentName: string, skinId: string): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet || !(pet.ownedSkins ?? []).includes(skinId)) return snapshot;
  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: {
        ...cls,
        pets: { ...cls.pets, [studentName]: { ...pet, skin: pet.skin === skinId ? undefined : skinId } },
      },
    },
  };
}

/** 亲密互动：花徽章换经验（写一条 manual 事件，便于撤回与对账） */
export function interactWithPet(
  snapshot: PetSnapshot,
  classId: string,
  studentName: string,
  kind: 'feed' | 'bath' | 'pat',
  nowISO = new Date().toISOString(),
  lessonNumber?: number,
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet) return snapshot;
  const config = { feed: { exp: 2, price: 1, name: '投喂' }, bath: { exp: 2, price: 1, name: '洗澡' }, pat: { exp: 2, price: 1, name: '摸头' } }[kind];
  if (badgeBalance(pet) < config.price) return snapshot;

  const event = {
    id: `interact:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    studentName,
    lessonNumber,
    delta: config.exp,
    reason: `亲密互动 · ${config.name}`,
    source: 'manual' as const,
    createdAt: nowISO,
  };
  const events = [...cls.events, event];
  const exp = Math.max(0, events.reduce((sum, item) => (item.studentName === studentName ? sum + item.delta : sum), 0));
  return {
    ...snapshot,
    classes: {
      ...snapshot.classes,
      [classId]: {
        ...cls,
        events,
        pets: {
          ...cls.pets,
          [studentName]: {
            ...pet,
            exp,
            level: levelOf(exp, snapshot.settings.levelTable),
            badgesSpent: (pet.badgesSpent ?? 0) + config.price,
          },
        },
      },
    },
  };
}
