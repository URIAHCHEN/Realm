/**
 * 配饰落位表（逐宠物 × 逐阶段校准）
 *
 * 背景：素材里的独立配饰是「整张 1024 画布的插画」，不带锚点信息，
 * 必须按每只宠物、每个成长阶段的头部位置与宽度重新定位，否则整幅错位。
 *
 * 坐标系：宠物图 1024×1024 画布。
 *   PET_FIT[petId][stage] = { cx, cy, w }  —— 脸部中心与头部宽度
 *   SKIN_RULES[skinId] = { w?, h?, dx?, dy?, anchor, z, crop }  —— 相对头部尺寸的比例
 *
 * 这张表由 scripts/pet-fit-sheet.py 可视化校准（红圈套头 + 配饰实拍），
 * 改动后重跑：
 *   python3 scripts/pet-fit-sheet.py <skin> <stage|all>
 * 会输出 /tmp/petcal/fit-<skin>.png 供逐组合核对，不要凭感觉改。
 */
export interface PetHeadFit {
  /** 脸部中心 x（1024 坐标） */
  cx: number;
  /** 脸部中心 y（1024 坐标） */
  cy: number;
  /** 头部宽度（1024 坐标） */
  w: number;
}

export interface SkinRule {
  /** 目标宽度 = 头宽 × w */
  w?: number;
  /** 目标高度 = 头宽 × h（给出时按高度约束，适合长条形配饰） */
  h?: number;
  /** 水平偏移 = 头宽 × dx */
  dx?: number;
  /** 垂直偏移 = 头宽 × dy，配合 anchor 决定贴哪个边 */
  dy?: number;
  /** 垂直锚点：0=顶对齐，0.5=居中，1=底对齐 */
  anchor?: number;
  /** 层级：front 盖在宠物上，behind 压在宠物下 */
  z?: 'front' | 'behind';
  /** 配饰图的有效裁剪框（1024 坐标，alpha>24 的包围盒） */
  crop: [number, number, number, number];
}

/** 每只宠物 4 个成长阶段的头部几何 */
export const PET_FIT: Record<string, PetHeadFit[]> = {
  moss: [
    { cx: 512, cy: 430, w: 360 },
    { cx: 522, cy: 438, w: 360 },
    { cx: 557, cy: 440, w: 360 },
    { cx: 567, cy: 425, w: 360 }
  ],
  ember: [
    { cx: 440, cy: 425, w: 340 },
    { cx: 460, cy: 425, w: 340 },
    { cx: 495, cy: 432, w: 340 },
    { cx: 520, cy: 430, w: 340 }
  ],
  ink: [
    { cx: 480, cy: 385, w: 300 },
    { cx: 490, cy: 390, w: 300 },
    { cx: 525, cy: 440, w: 300 },
    { cx: 540, cy: 445, w: 300 }
  ],
  thunder: [
    { cx: 610, cy: 415, w: 340 },
    { cx: 610, cy: 415, w: 340 },
    { cx: 590, cy: 385, w: 340 },
    { cx: 630, cy: 405, w: 340 }
  ],
  otter: [
    { cx: 535, cy: 415, w: 360 },
    { cx: 545, cy: 405, w: 360 },
    { cx: 580, cy: 370, w: 360 },
    { cx: 595, cy: 355, w: 360 }
  ],
  dream: [
    { cx: 530, cy: 445, w: 320 },
    { cx: 540, cy: 435, w: 320 },
    { cx: 565, cy: 410, w: 320 },
    { cx: 575, cy: 390, w: 320 }
  ]
};

export const SKIN_RULES: Record<string, SkinRule> = {
  noodle: { w: 1.35, dy: 0.15, anchor: 1, crop: [117, 186, 939, 721] },
  melon: { w: 1.12, dy: 0.28, anchor: 1, crop: [215, 165, 830, 803] },
  helmet: { w: 1.15, h: 1.15, dy: 0, anchor: 0.5, crop: [39, 64, 989, 970] },
  doge: { w: 1.2, h: 1.0, dx: 0.06, dy: -0.1, anchor: 0.5, crop: [21, 249, 1003, 760] },
  shades: { w: 0.95, dy: -0.05, anchor: 0.5, crop: [47, 371, 976, 648] },
  fish: { w: 1.05, dx: -0.1, dy: 1.0, anchor: 0.5, crop: [210, 138, 957, 904] },
  drumstick: { w: 0.7, dx: 0.55, dy: 0.9, anchor: 0.5, crop: [214, 120, 896, 852] },
  dino: { w: 1.8, h: 2.05, dy: 0.55, anchor: 0.5, crop: [207, 132, 836, 951] }
};

/**
 * 逐组合微调：头部几何统一之后，仍有个别组合因为配饰本身不对称而偏掉，
 * 用 `${petId}-${skinId}` 单独修正（单位同样是头宽的倍数）。只登记确有必要的那几个。
 */
export const PET_SKIN_TWEAK: Record<string, { dx?: number; dy?: number; s?: number }> = {
  // 霆霆的头部偏右，泡面头的卷发重心偏左，整体再右移一点才不压脸
  'thunder-noodle': { dx: 0.16 },
  // 鱼缸直径大于头部，霆霆身位偏下，整体上提
  'thunder-helmet': { dy: -0.3 },
  // 墨羽颈部较长，鱼缸略上提才包住头
  'ink-helmet': { dy: -0.12 }
};

/** 取某宠物某阶段的头部几何；未知宠物回退到苔苔，未知阶段回退到第 1 阶段 */
export function headFitOf(petId: string, stage: number): PetHeadFit {
  const list = PET_FIT[petId] ?? PET_FIT.moss;
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(stage)));
  return list[index] ?? list[0];
}

/** 合并通用规则与逐组合微调 */
export function skinRuleFor(petId: string, skinId: string): SkinRule | null {
  const base = SKIN_RULES[skinId];
  if (!base) return null;
  const tweak = PET_SKIN_TWEAK[`${petId}-${skinId}`];
  if (!tweak) return base;
  return {
    ...base,
    dx: (base.dx ?? 0) + (tweak.dx ?? 0),
    dy: (base.dy ?? 0) + (tweak.dy ?? 0),
    w: base.w !== undefined ? base.w * (tweak.s ?? 1) : base.w,
    h: base.h !== undefined ? base.h * (tweak.s ?? 1) : base.h
  };
}
