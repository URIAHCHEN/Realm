// 「伴学萌宠」积分与养成：类型定义
// 说明：全部为增量类型，不改动既有 StudentRecord / Class / AppConfig 的语义。
// 数据落点：localStorage `petData` + 云端快照的可选字段 `pet`（旧快照缺该字段时按空处理）。

/** 宠物外形阶段：0 幼体 / 1 成长 / 2 少年 / 3 守护 */
export type PetStage = 0 | 1 | 2 | 3;

/** 养成形态：宠物 or 建设社区（满级毕业后可选） */
export type RaisingRoute = 'pet' | 'building';

export interface PetDef {
  id: string;
  name: string;
  tagline: string;
  /** 主色（HSL 三分量字符串，直接注入 style） */
  hue: string;
  /** 四阶段名称，与 PetStage 一一对应 */
  stages: [string, string, string, string];
}

/** 单个学生的宠物状态 */
export interface PetState {
  petId: string;
  level: number;
  exp: number;
  adoptedAt: string;
  /** 已获得的徽章 id */
  badges: string[];
  route: RaisingRoute;
  /** 已毕业的宠物记录（满级后可重领） */
  graduated: { petId: string; level: number; at: string }[];
  /** 手动授予的徽章时间（用于展示） */
  badgeAwards?: { [badgeId: string]: string };
}

/** 积分流水：append-only，撤回用反向事件表达 */
export interface PetEvent {
  id: string;
  studentName: string;
  lessonNumber?: number;
  delta: number;
  reason: string;
  source: 'auto' | 'manual' | 'undo';
  batchId?: string;
  createdAt: string;
}

/** 单个班级的宠物数据 */
export interface ClassPetData {
  pets: { [studentName: string]: PetState };
  events: PetEvent[];
  /** 已完成自动结算的最高课次，防止重复计分 */
  lastAutoLesson?: number;
}

/** 徽章定义 */
export interface PetBadgeDef {
  id: string;
  name: string;
  /** 语义说明：老师看到的判定口径 */
  rule: string;
  /** auto 自动判定；manual 由老师授予 */
  mode: 'auto' | 'manual';
  icon: 'speak' | 'help' | 'persist' | 'leap' | 'order' | 'lead';
}

export interface PetSettings {
  /** 灰度开关：仅控制「伴学萌宠」tab 的可见能力，不影响其他 tab */
  enabled: boolean;
  /** 灰度范围：空数组=全部班级；否则仅这些班级可用 */
  classScope: string[];
  /** 自动计分规则（老师可在 tab 内调整） */
  rules: {
    homeworkDone: number;
    listeningDone: number;
    fullScoreBonus: number;
  };
  /** 等级经验门槛（累计值，index=level-1） */
  levelTable: number[];
}

export interface PetSnapshot {
  version: 1;
  settings: PetSettings;
  classes: { [classId: string]: ClassPetData };
}

export const DEFAULT_PET_SETTINGS: PetSettings = {
  enabled: false,
  classScope: [],
  rules: { homeworkDone: 5, listeningDone: 5, fullScoreBonus: 10 },
  levelTable: [0, 20, 50, 100, 170, 260, 380, 530, 720, 950],
};

/** 徽章语义（2026-10-28 调整：全部改为教师日常口径，去掉了空泛的“互助/整洁”） */
export const PET_BADGES: PetBadgeDef[] = [
  { id: 'speak', name: '表达之星', rule: '课堂表现正向满 3 次', mode: 'auto', icon: 'speak' },
  { id: 'persist', name: '坚持之星', rule: '连续 3 课次完成作业', mode: 'auto', icon: 'persist' },
  { id: 'leap', name: '跃迁之星', rule: '拿到一次满分加成', mode: 'auto', icon: 'leap' },
  { id: 'order', name: '秩序之星', rule: '连续 3 课次全勤', mode: 'auto', icon: 'order' },
  { id: 'help', name: '协作之星', rule: '老师手动授予：小组互助', mode: 'manual', icon: 'help' },
  { id: 'lead', name: '领航之星', rule: '老师手动授予：长期领跑', mode: 'manual', icon: 'lead' },
];

export const PET_CATALOG: PetDef[] = [
  { id: 'moss', name: '苔苔', tagline: '慢一点，也在长', hue: '162 38% 34%', stages: ['苔芽', '小苔兽', '苔背行者', '苔原守护'] },
  { id: 'ember', name: '焰尾', tagline: '热起来就别停', hue: '28 72% 46%', stages: ['火种', '小焰狐', '焰尾行者', '长明守卫'] },
  { id: 'ink', name: '墨羽', tagline: '把想法写下来', hue: '222 30% 38%', stages: ['墨点', '小墨鸟', '墨羽信使', '砚台守望'] },
  { id: 'lamp', name: '灯仔', tagline: '给晚归的人留盏灯', hue: '44 70% 44%', stages: ['灯芯', '小灯灵', '提灯行者', '灯塔守望'] },
];
