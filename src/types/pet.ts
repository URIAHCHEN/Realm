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
  /** 已花费的徽章数（货币；余额 = 升级所得 − 已花费） */
  badgesSpent?: number;
  /** 已拥有的皮肤 id */
  ownedSkins?: string[];
  /** 当前装备的皮肤 id */
  skin?: string;
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

/** 小组：一个班可有多套分组方案，当前生效一套 */
export interface GroupDef {
  id: string;
  name: string;
  members: string[];
}

/** 小组 PK：按课次区间累计双方成员积分 */
export interface GroupBattle {
  id: string;
  groupAId: string;
  groupBId: string;
  fromLesson: number;
  toLesson: number;
  createdAt: string;
  status: 'active' | 'settled';
  result?: {
    aScore: number;
    bScore: number;
    /** null 表示平局 */
    winnerId: string | null;
    settledAt: string;
  };
}

/** 单个班级的宠物数据 */
export interface ClassPetData {
  pets: { [studentName: string]: PetState };
  events: PetEvent[];
  /** 已完成自动结算的最高课次，防止重复计分 */
  lastAutoLesson?: number;
  /** 小组分组（可选，未分组时不影响宠物功能） */
  groups?: GroupDef[];
  /** 小组 PK 战绩 */
  battles?: GroupBattle[];
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
  /** 等级经验门槛（累计值，index=level-1）。对齐原站：8 级，逐级 10/15/20/25/30/35/40 */
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
  // 原站「成长设置」实读：Lv1→2 10 分，之后 15/20/25/30/35/40，满级 8 级
  levelTable: [0, 10, 25, 45, 70, 100, 135, 175],
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


/** 评估指标：对齐原站「加减分规则」的指标库（节选常用项，可在设置里继续扩） */
export interface ScorePreset {
  id: string;
  name: string;
  delta: number;
  category: '学习' | '行为' | '健康' | '其他' | '临时';
}

export const SCORE_PRESETS: ScorePreset[] = [
  { id: 'p01', name: '课堂回答问题积极', delta: 2, category: '学习' },
  { id: 'p02', name: '上课主动回答问题', delta: 1, category: '学习' },
  { id: 'p03', name: '作业按时完成', delta: 2, category: '学习' },
  { id: 'p04', name: '早读认真', delta: 2, category: '学习' },
  { id: 'p05', name: '按时完成背诵任务', delta: 2, category: '学习' },
  { id: 'p06', name: '提前完成学习任务', delta: 2, category: '学习' },
  { id: 'p07', name: '成绩进步', delta: 3, category: '学习' },
  { id: 'p08', name: '成绩前进 5 个名次', delta: 3, category: '学习' },
  { id: 'p09', name: '成绩前进 10 个名次', delta: 5, category: '学习' },
  { id: 'p10', name: '连续一个月作业优秀', delta: 5, category: '学习' },
  { id: 'p11', name: '月考总分达标', delta: 3, category: '学习' },
  { id: 'p12', name: '主动帮助他人', delta: 3, category: '行为' },
  { id: 'p13', name: '课桌周围无垃圾', delta: 2, category: '行为' },
  { id: 'p14', name: '课前准备充分，安静不喧哗', delta: 3, category: '行为' },
  { id: 'p15', name: '主动参加义务劳动', delta: 3, category: '行为' },
  { id: 'p16', name: '主动打扫卫生', delta: 1, category: '行为' },
  { id: 'p17', name: '拾金不昧', delta: 3, category: '行为' },
  { id: 'p18', name: '劝架', delta: 5, category: '行为' },
  { id: 'p19', name: '保持良好个人卫生习惯', delta: 2, category: '健康' },
  { id: 'p20', name: '认真完成课间操、眼保健操', delta: 2, category: '健康' },
  { id: 'n01', name: '上课聊天、喝水、睡觉', delta: -5, category: '学习' },
  { id: 'n02', name: '未按照要求完成学习任务', delta: -2, category: '学习' },
  { id: 'n03', name: '迟交、忘带、未做作业', delta: -5, category: '学习' },
  { id: 'n04', name: '字迹不工整清楚', delta: -2, category: '学习' },
  { id: 'n05', name: '抄袭作业', delta: -3, category: '学习' },
  { id: 'n06', name: '早读不认真', delta: -2, category: '学习' },
  { id: 'n07', name: '上课说话，提醒一次无效', delta: -2, category: '学习' },
  { id: 'n08', name: '做与本课堂无关的事', delta: -2, category: '学习' },
  { id: 'n09', name: '考试提前交卷、不认真检查', delta: -10, category: '学习' },
  { id: 'n10', name: '不遵守考试纪律，作弊或舞弊', delta: -10, category: '学习' },
];

/** 班级共建（海底两万里）：7 站，每站全班累计 100 分 */
export const BUILD_STAGES = [
  '建造潜水艇',
  '珊瑚王国',
  '海底森林',
  '深海遗迹',
  '珍珠海域',
  '极地冰海',
  '鹦鹉螺号与尼摩船长',
] as const;

export const BUILD_STEP_SCORE = 100;


/** 皮肤槽位：头饰 / 脸饰 / 背饰 / 全身 */
export type SkinSlot = 'head' | 'face' | 'back' | 'body';

export interface PetSkin {
  id: string;
  name: string;
  slot: SkinSlot;
  price: number;
  /** 一句话说明，走搞怪路线 */
  blurb: string;
}

/**
 * 搞怪皮肤：全部用 CSS 绘制，不依赖外部图片；后续可用同名图片替换。
 * 定价对齐原站（装扮 1 徽章起步），搞怪款略贵一点。
 */
export const PET_SKINS: PetSkin[] = [
  { id: 'noodle', name: '泡面头', slot: 'head', price: 3, blurb: '昨晚没睡，今早烫了个面' },
  { id: 'melon', name: '西瓜盔', slot: 'head', price: 4, blurb: '夏天限定，防护力为零' },
  { id: 'doge', name: '狗头面具', slot: 'face', price: 5, blurb: '看谁都像在憋笑' },
  { id: 'shades', name: '大佬墨镜', slot: 'face', price: 6, blurb: '戴上就不想写作业' },
  { id: 'fish', name: '咸鱼披风', slot: 'back', price: 7, blurb: '翻身是不可能翻身的' },
  { id: 'drumstick', name: '鸡腿权杖', slot: 'back', price: 8, blurb: '加餐比加分更有说服力' },
  { id: 'helmet', name: '鱼缸头盔', slot: 'head', price: 9, blurb: '隔绝噪音，专心摸鱼' },
  { id: 'dino', name: '恐龙睡衣', slot: 'body', price: 12, blurb: '嗷——但只敢在被窝里嗷' },
];

/** 亲密互动：花 1 枚徽章，换 2 点经验 */
export const PET_INTERACTIONS = [
  { id: 'feed', name: '投喂', exp: 2, price: 1 },
  { id: 'bath', name: '洗澡', exp: 2, price: 1 },
  { id: 'pat', name: '摸头', exp: 2, price: 1 },
] as const;

/** 升级奖励：每升 1 级发 5 枚徽章（与原站「达成奖励徽章」一致） */
export const BADGES_PER_LEVEL = 5;
