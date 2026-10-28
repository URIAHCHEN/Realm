// 伴学萌宠：本地持久化与增量变更（不改动既有 classData / appConfig）
// 存储键独立，避免与学情主数据互相覆盖；云端快照中以可选字段 `pet` 携带。

import {
  DEFAULT_PET_SETTINGS,
  PET_CATALOG,
  type ClassPetData,
  type PetBadgeDef,
  type PetEvent,
  type PetSettings,
  type PetSnapshot,
  type PetState,
  type RaisingRoute,
} from '@/types/pet';
import { adoptPet, isMaxLevel, levelOf, petDefOf } from '@/lib/gamification/rules';

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
      };
    });
    classes[classId] = {
      pets,
      events: Array.isArray((data as ClassPetData).events) ? (data as ClassPetData).events : [],
      lastAutoLesson: Number((data as ClassPetData).lastAutoLesson) || undefined,
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
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet) return snapshot;

  const event: PetEvent = {
    id: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    studentName,
    delta,
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
