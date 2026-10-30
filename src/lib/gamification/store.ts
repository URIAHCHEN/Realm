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
import { adoptPet, applyExpPolicy, isMaxLevel, levelOf, petDefOf } from '@/lib/gamification/rules';
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
    autoScope: value.settings?.autoScope === 'sinceEnable' ? 'sinceEnable' : 'all',
    enabledAt: typeof value.settings?.enabledAt === 'string' ? value.settings.enabledAt : undefined,
    allowNegativeExp: Boolean(value.settings?.allowNegativeExp),
    allowDeduction: value.settings?.allowDeduction !== false,
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
      // 关键：未知 id 原样保留（旧版 lamp 或未来新增），绝不静默替换成目录第一项
      const rawId = String((pet as PetState).petId ?? '').trim();
      pets[student] = {
        petId: rawId || PET_CATALOG[0].id,
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
  options: { force?: boolean } = {},
): PetSnapshot {
  const cls = ensureClass(snapshot, classId);
  const pet = cls.pets[studentName];
  if (!pet) return snapshot;
  // 扣分总开关：撤回（force）不受限，否则负分一律拒绝
  if (delta < 0 && !snapshot.settings.allowDeduction && !options.force) return snapshot;

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
  const exp = applyExpPolicy(events.reduce((sum, e) => (e.studentName === studentName ? sum + e.delta : sum), 0), snapshot.settings);
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
  // 毫秒时间戳会撞车：同一毫秒内的两次提交必须产生不同批次，否则事件 id 相同会被合并覆盖
  const batchId = `batch:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const events = [...cls.events];
  const pets = { ...cls.pets };

  if (delta < 0 && !snapshot.settings.allowDeduction) return snapshot;

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
    const exp = applyExpPolicy(events.reduce((sum, e) => (e.studentName === name ? sum + e.delta : sum), 0), snapshot.settings);
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
  return addManualScore(snapshot, classId, target.studentName, -target.delta, `撤回：${target.reason}`, nowISO, target.lessonNumber, { force: true });
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
  const next = { ...snapshot.settings, ...patch };
  // 首次开启时记录启用时刻，供 autoScope='sinceEnable' 作为分界
  if (patch.enabled === true && !next.enabledAt) next.enabledAt = new Date().toISOString();
  return { ...snapshot, settings: next };
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
  const exp = applyExpPolicy(events.reduce((sum, item) => (item.studentName === studentName ? sum + item.delta : sum), 0), snapshot.settings);
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


/**
 * 云端快照回写宠物数据时的合并规则（对应新版实施说明第 3 条）：
 * - 云端没有 pet 字段（旧客户端推送）→ 保留本地，绝不覆盖；
 * - 云端有 pet 字段 → 以云端为准（多端以最后写入者胜出，与主快照一致）。
 * 抽成纯函数便于 selfcheck 直接断言，避免只在 App 里"看起来对"。
 */
export function mergeIncomingPet(local: PetSnapshot, incoming: unknown): PetSnapshot {
  if (!incoming || typeof incoming !== 'object') return local;
  const remote = normalizePetSnapshot(incoming);

  // 业务合并规则（CAS 只保证"谁先写"，这里保证"事件不丢"）：
  // 同一班级的事件按 id 取并集，宠物字段以远端为准；经验按并集事件重算。
  const classes: PetSnapshot['classes'] = { ...remote.classes };
  Object.entries(local.classes).forEach(([classId, localCls]) => {
    const remoteCls = remote.classes[classId];
    if (!remoteCls) { classes[classId] = localCls; return; }

    const byId = new Map<string, PetEvent>();
    [...localCls.events, ...remoteCls.events].forEach(event => byId.set(event.id, event));
    const events = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    const pets = { ...localCls.pets, ...remoteCls.pets };
    Object.keys(pets).forEach(name => {
      const raw = events.reduce((sum, event) => (event.studentName === name ? sum + event.delta : sum), 0);
      const exp = applyExpPolicy(raw, remote.settings);
      pets[name] = { ...pets[name], exp, level: levelOf(exp, remote.settings.levelTable) };
    });

    classes[classId] = { ...remoteCls, pets, events };
  });

  return { ...remote, classes };
}
