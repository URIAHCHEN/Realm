// 伴学萌宠 Tab：宠物卡片 + 成长榜 + 徽章
// 约束：只读既有 Class 数据；所有写操作通过回调交给上层（App）落库，组件本身无副作用。

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  PET_BADGES, PET_CATALOG, PET_SKINS, PET_INTERACTIONS, SCORE_PRESETS, BUILD_STAGES,
  type PetBadgeDef, type PetSettings, type PetSnapshot, type ScorePreset,
} from '@/types/pet';
import { activeBattleOf, buildProgress, groupContributors, groupScore } from '@/lib/gamification/groups';
import { expProgress, isMaxLevel, petDefOf, petStatusOf, stageOf } from '@/lib/gamification/rules';
import { badgeBalance, isEnabledForClass } from '@/lib/gamification/store';
import { hasSizedAssets, hasWornImage, petStageSources, skinSources, wornSources } from '@/lib/gamification/petAssets';
import { SKIN_RULES, headFitOf, skinRuleFor } from '@/lib/gamification/petFit';
import type { Class } from '@/types';

interface PetGardenProps {
  cls: Class;
  snapshot: PetSnapshot;
  onAdopt: (studentName: string, petId: string) => void;
  onScore: (studentName: string, delta: number, reason: string) => void;
  onGraduate: (studentName: string, route: 'pet' | 'building') => void;
  onAward: (studentName: string, badge: PetBadgeDef) => void;
  onUndo: (eventId: string) => void;
  onSettings: (patch: Partial<PetSettings>) => void;
  /** 当前课次：用于小组 PK 的默认区间 */
  lessonNumber: number;
  onResetGroups: (count: number, mode: 'auto' | 'random') => void;
  onStartBattle: (groupAId: string, groupBId: string, fromLesson: number, toLesson: number) => void;
  onRevealBattle: (battleId: string) => void;
  onBatchScore: (studentNames: string[], delta: number, reason: string) => void;
  onBuySkin: (studentName: string, skinId: string) => void;
  onEquipSkin: (studentName: string, skinId: string) => void;
  onInteract: (studentName: string, kind: 'feed' | 'bath' | 'pat') => void;
}

const QUICK_SCORES = [
  { delta: 1, reason: '课堂表现' },
  { delta: 3, reason: '小组协作' },
  { delta: 5, reason: '额外坚持' },
];

/** 极简纸艺风格头像：纯 CSS 绘制，不依赖图片资源 */
/**
 * 配饰层定位：把配饰图按「头部几何」重新摆到宠物图同一坐标系里。
 * 全部按 1024 画布计算，再换算成百分比，因此任意尺寸的头像都能用同一套数值。
 */
function skinLayerStyle(petId: string, stage: number, skinId: string) {
  const rule = skinRuleFor(petId, skinId);
  if (!rule) return null;
  const fit = headFitOf(petId, stage);
  const [x0, y0, x1, y1] = rule.crop;
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW <= 0 || cropH <= 0) return null;

  let targetW: number;
  let targetH: number;
  if (rule.h) {
    targetH = fit.w * rule.h;
    targetW = (targetH * cropW) / cropH;
  } else {
    targetW = fit.w * (rule.w ?? 1);
    targetH = (targetW * cropH) / cropW;
  }

  const centerX = fit.cx + fit.w * (rule.dx ?? 0);
  const centerY = fit.cy + fit.w * (rule.dy ?? 0);
  const left = centerX - targetW / 2;
  const top = centerY - targetH * (rule.anchor ?? 0.5);

  const pct = (value: number) => `${(value / 1024) * 100}%`;
  return {
    box: {
      left: pct(left),
      top: pct(top),
      width: pct(targetW),
      height: pct(targetH),
      zIndex: rule.z === 'behind' ? 0 : 2
    } as React.CSSProperties,
    // 裁剪框内的内容放大到铺满外层
    image: {
      width: `${(1024 / cropW) * 100}%`,
      height: `${(1024 / cropH) * 100}%`,
      left: `${(-x0 / cropW) * 100}%`,
      top: `${(-y0 / cropH) * 100}%`
    } as React.CSSProperties
  };
}

/** 整套服装：只能靠官方成品图，叠层一定会露出原来的身体 */
const FULL_SUIT_SKINS = new Set(['dino']);

/** 该皮肤是否能用在指定宠物上：有成品图直接可用，其余走通用叠层 */
function canWear(skinId: string, petId: string): boolean {
  if (hasWornImage(skinId, petId)) return true;
  if (FULL_SUIT_SKINS.has(skinId)) return false;
  return Boolean(SKIN_RULES[skinId]);
}

export function PetAvatar({ petId, level, size = 64, skin }: { petId: string; level: number; size?: number; skin?: string }) {
  const def = petDefOf(petId);
  const stage = stageOf(level);
  const ear = 8 + stage * 4;
  const hasBodySkin = skin === 'dino';
  const base = petStageSources(petId, stage);
  // 整套服装（恐龙睡衣）必须用官方成品图：它要盖住全身，叠层会露出原来的身体
  const worn = skin === 'dino' ? wornSources(skin, petId) : {};
  const sized = hasSizedAssets();
  const chosen = worn.large || worn.small ? worn : base;
  const layer = chosen === base && skin ? skinLayerStyle(petId, stage, skin) : null;
  const skinSrc = skin && layer ? skinSources(skin) : {};

  // 有图时直接用成品图；缺图回退到下面的 CSS 绘制
  if (chosen.large || chosen.small) {
    const srcSet = sized && chosen.small && chosen.large ? `${chosen.small} 128w, ${chosen.large} 256w` : undefined;
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
        <img
          src={chosen.large ?? chosen.small}
          srcSet={srcSet}
          sizes={`${size}px`}
          width={size}
          height={size}
          alt=""
          className="relative h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
        {layer && (skinSrc.large || skinSrc.small) && (
          <div className="absolute overflow-hidden" style={layer.box}>
            <img
              src={skinSrc.large ?? skinSrc.small}
              alt=""
              className="absolute max-w-none"
              style={layer.image}
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: `hsl(${def.hue} / 0.12)` }}
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[45%]"
        style={{
          width: size * (0.5 + stage * 0.05),
          height: size * (0.55 + stage * 0.04),
          background: `hsl(${def.hue})`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: ear, height: ear, top: size * 0.12, left: size * 0.28, background: `hsl(${def.hue} / 0.85)` }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: ear, height: ear, top: size * 0.12, right: size * 0.28, background: `hsl(${def.hue} / 0.85)` }}
      />
      <div className="absolute left-[34%] top-[46%] h-1 w-1 rounded-full bg-white" />
      <div className="absolute left-[58%] top-[46%] h-1 w-1 rounded-full bg-white" />
      {stage >= 2 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: size * 0.6, height: 3, top: size * 0.82, background: `hsl(${def.hue} / 0.4)` }}
        />
      )}

      {/* 搞怪皮肤：全部用 CSS 叠层绘制 */}
      {skin === 'noodle' && (
        <div className="absolute inset-x-0" style={{ top: -size * 0.04, height: size * 0.34 }}>
          {[0.2, 0.4, 0.6, 0.8].map((x, index) => (
            <span
              key={x}
              className="absolute rounded-full border border-amber-700/40 bg-amber-200"
              style={{ width: size * 0.26, height: size * 0.26, left: size * x - size * 0.13, top: size * (index % 2 ? 0.02 : 0.08) }}
            />
          ))}
        </div>
      )}
      {skin === 'melon' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-t-full border border-green-800/50"
          style={{ width: size * 0.86, height: size * 0.42, top: size * 0.04, background: 'hsl(140 55% 45%)' }}
        >
          <span className="absolute inset-x-2 top-1/3 h-[2px] bg-green-900/30" />
        </div>
      )}
      {skin === 'helmet' && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300/80 bg-sky-100/20"
          style={{ width: size * 0.94, height: size * 0.94 }}
        >
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
        </div>
      )}
      {skin === 'doge' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-md border border-amber-800/40"
          style={{ width: size * 0.52, height: size * 0.34, top: size * 0.36, background: 'hsl(38 70% 78%)' }}
        >
          <span className="absolute left-[22%] top-[30%] h-1 w-1 rounded-full bg-stone-800" />
          <span className="absolute right-[22%] top-[30%] h-1 w-1 rounded-full bg-stone-800" />
          <span className="absolute left-1/2 top-[62%] h-[2px] w-[10px] -translate-x-1/2 rounded bg-stone-700" />
        </div>
      )}
      {skin === 'shades' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-sm bg-stone-900"
          style={{ width: size * 0.62, height: size * 0.18, top: size * 0.44 }}
        >
          <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-stone-600" />
        </div>
      )}
      {skin === 'fish' && (
        <div
          className="absolute rounded-full border border-sky-800/40 bg-sky-200"
          style={{ width: size * 0.7, height: size * 0.24, left: -size * 0.16, top: size * 0.56, transform: 'rotate(-18deg)' }}
        >
          <span className="absolute -right-2 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[8px] border-y-transparent border-l-sky-300" />
        </div>
      )}
      {skin === 'drumstick' && (
        <div
          className="absolute rounded-full border border-amber-900/40 bg-amber-300"
          style={{ width: size * 0.34, height: size * 0.26, right: -size * 0.04, top: size * 0.5, transform: 'rotate(24deg)' }}
        >
          <span className="absolute -left-2 top-1/2 h-2 w-3 -translate-y-1/2 rounded-full bg-stone-100" />
        </div>
      )}
      {hasBodySkin && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-b-xl rounded-t-md border border-green-900/40"
          style={{ width: size * 0.72, height: size * 0.5, bottom: 0, background: 'hsl(140 45% 55%)' }}
        >
          <span className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-green-700" />
        </div>
      )}
    </div>
  );
}

/** 社区形态：宠物毕业后转为班级共建，用简单的几何体表达施工进度 */
function CommunityAvatar({ level, size = 64 }: { level: number; size?: number }) {
  const blocks = Math.min(4, Math.max(1, Math.ceil(level / 3)));
  return (
    <div className="relative shrink-0 rounded-lg bg-muted" style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: blocks }).map((_, index) => (
        <span
          key={index}
          className="absolute rounded-[3px] border border-foreground/20 bg-background"
          style={{
            width: size * 0.28,
            height: size * (0.2 + index * 0.08),
            left: size * (0.12 + index * 0.2),
            bottom: size * 0.14,
          }}
        />
      ))}
    </div>
  );
}

function ExpBar({ percent, isMax }: { percent: number; isMax: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${isMax ? 100 : percent}%`, background: 'hsl(var(--foreground) / 0.72)' }}
      />
    </div>
  );
}

export function PetGarden({
  cls, snapshot, onAdopt, onScore, onGraduate, onAward, onUndo, onSettings,
  lessonNumber, onResetGroups, onStartBattle, onRevealBattle, onBatchScore,
  onBuySkin, onEquipSkin, onInteract,
}: PetGardenProps) {
  const [detailStudent, setDetailStudent] = useState<string | null>(null);
  const [adoptStudent, setAdoptStudent] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState(3);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [revealedBattleId, setRevealedBattleId] = useState<string | null>(null);
  const [batchTargets, setBatchTargets] = useState<string[] | null>(null);
  const [batchPreset, setBatchPreset] = useState<ScorePreset | null>(null);
  const [customDelta, setCustomDelta] = useState('1');
  const [customReason, setCustomReason] = useState('');
  const [shopStudent, setShopStudent] = useState<string | null>(null);
  const [shopTab, setShopTab] = useState<'skin' | 'interact'>('skin');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabled = isEnabledForClass(snapshot, cls.id);
  const classData = snapshot.classes[cls.id] ?? { pets: {}, events: [] };

  const rows = useMemo(() => {
    return (cls.students ?? []).map(name => {
      const pet = classData.pets[name];
      const progress = pet ? expProgress(pet.exp, snapshot.settings.levelTable) : null;
      return { name, pet, progress };
    });
  }, [cls.students, classData.pets, snapshot.settings.levelTable]);

  const ranking = useMemo(() => {
    return [...rows]
      .filter(row => row.pet)
      .sort((a, b) => (b.pet!.level - a.pet!.level) || (b.pet!.exp - a.pet!.exp) || a.name.localeCompare(b.name, 'zh-CN'));
  }, [rows]);

  const adoptedCount = rows.filter(r => r.pet).length;
  const groups = classData.groups ?? [];
  const battles = classData.battles ?? [];
  const groupStandings = groups
    .map(group => ({ group, score: groupScore(classData.events, group, 1, Math.max(1, lessonNumber)) }))
    .sort((a, b) => b.score - a.score);
  const lastEventByStudent = new Map<string, string>();
  classData.events.forEach(event => {
    const prev = lastEventByStudent.get(event.studentName);
    if (!prev || Date.parse(event.createdAt) > Date.parse(prev)) lastEventByStudent.set(event.studentName, event.createdAt);
  });
  const build = buildProgress(classData.events);
  const adoptedRows = rows.filter(row => row.pet);
  const activeShopStudent = shopStudent && classData.pets[shopStudent] ? shopStudent : adoptedRows[0]?.name ?? null;
  const shopPet = activeShopStudent ? classData.pets[activeShopStudent] : null;
  const activeBattles = battles.filter(b => b.status === 'active');
  const settledBattles = battles.filter(b => b.status === 'settled').slice(-4).reverse();
  const detailPet = detailStudent ? classData.pets[detailStudent] : null;
  const detailEvents = detailStudent
    ? [...classData.events].filter(e => e.studentName === detailStudent).slice(-12).reverse()
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">伴学萌宠</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            作业与课后任务完成各 +{snapshot.settings.rules.homeworkDone} 分，满分额外 +{snapshot.settings.rules.fullScoreBonus} 分。
            自动结算，不用重复登记。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setSettingsOpen(true)}>计分设置</Button>
          <span className="text-sm text-muted-foreground">本班启用</span>
          <Switch
            checked={enabled}
            onCheckedChange={checked => onSettings({ enabled: checked, classScope: checked ? [cls.id] : [] })}
            aria-label="为本班启用伴学萌宠"
          />
        </div>
      </div>

      {!enabled ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="text-sm font-medium">这个班还没开启伴学萌宠</div>
          <p className="max-w-md text-sm text-muted-foreground">
            开启后仅影响本页：其他标签页、学情记录与云端数据保持不变；积分由已登记的作业、课后任务与满分自动折算。
          </p>
          <Button onClick={() => onSettings({ enabled: true, classScope: [cls.id] })}>开启本班</Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>已领养 {adoptedCount} / {rows.length} 人</span>
            <span aria-hidden>·</span>
            <span>积分自动结算到第 {classData.lastAutoLesson ?? 0} 课</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map(({ name, pet, progress }) => (
              <Card key={name} className="flex flex-col gap-3 p-4">
                <button
                  type="button"
                  className="flex items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                  onClick={() => (pet ? setDetailStudent(name) : setAdoptStudent(name))}
                >
                  {pet?.route === 'building' ? (
                    <CommunityAvatar level={pet.level} />
                  ) : pet ? (
                    <PetAvatar petId={pet.petId} level={pet.level} skin={pet.skin} />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
                      未领养
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {pet
                        ? pet.route === 'building'
                          ? `班级社区 · 第 ${Math.max(1, Math.ceil(pet.level / 3))} 期`
                          : `${petDefOf(pet.petId).name} · ${petDefOf(pet.petId).stages[stageOf(pet.level)]}`
                        : '选择一只宠物'}
                    </div>
                    {pet && <div className="mt-1 text-[11px] text-muted-foreground">徽章 {badgeBalance(pet)}</div>}
                    {pet && (() => {
                      const status = petStatusOf(pet, lastEventByStudent.get(name));
                      const label = status === 'egg' ? '蛋形态' : status === 'sick' ? '生病中' : status === 'hungry' ? '饥饿中' : '';
                      if (!label) return null;
                      return <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>;
                    })()}
                    {pet && progress && (
                      <>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Lv.{progress.level}</span>
                          <span>{progress.isMax ? 'MAX' : `${progress.current}/${progress.need}`}</span>
                        </div>
                        <div className="mt-1">
                          <ExpBar percent={progress.percent} isMax={progress.isMax} />
                        </div>
                      </>
                    )}
                  </div>
                </button>

                {pet && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pet.badges.slice(0, 4).map(id => {
                      const badge = PET_BADGES.find(b => b.id === id);
                      return badge ? (
                        <Badge key={id} variant="secondary" className="text-[10px] font-normal">
                          {badge.name.replace('之星', '')}
                        </Badge>
                      ) : null;
                    })}
                    {pet.badges.length === 0 && <span className="text-[11px] text-muted-foreground">暂无徽章</span>}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-1.5">
                  {pet ? (
                    QUICK_SCORES.map(item => (
                      <Button
                        key={item.delta}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => onScore(name, item.delta, item.reason)}
                      >
                        +{item.delta}
                      </Button>
                    ))
                  ) : (
                    <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setAdoptStudent(name)}>
                      领养
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">班级共建 · 海底两万里</h3>
              <span className="text-xs text-muted-foreground">全班净积分 {build.total} 分</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>第 {build.stageIndex + 1} 站 · {build.stageName}</span>
              <span>{build.isFinal ? '已到终点站' : `下一站 ${BUILD_STAGES[build.stageIndex + 1]}`}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/70 transition-[width] duration-300" style={{ width: `${Math.min(100, (build.stageScore / build.stageNeed) * 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{build.stageScore} / {build.stageNeed} 分</span>
              <span>共 {BUILD_STAGES.length} 站</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BUILD_STAGES.map((stage, index) => (
                <span
                  key={stage}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${index < build.stageIndex ? 'border-border bg-muted text-muted-foreground' : index === build.stageIndex ? 'border-foreground/30 bg-muted text-foreground' : 'border-dashed border-border text-muted-foreground'}`}
                >
                  {stage}
                </span>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">小组 PK</h3>
                <p className="mt-1 text-xs text-muted-foreground">按课次区间累计成员积分；同分即平局，只比团队、不改个人分。</p>
                <p className="mt-1 text-[11px] text-muted-foreground">发起方式：先点一个组的「挑战」，再点另一个组，即按当前课次开战。</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                  value={groupCount}
                  onChange={event => setGroupCount(Number(event.target.value))}
                  aria-label="分组数量"
                >
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 组</option>)}
                </select>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onResetGroups(groupCount, 'auto')}>均分</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onResetGroups(groupCount, 'random')}>随机</Button>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">还没有分组。选好组数后点「均分」即可，学生按名单顺序分组。</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupStandings.map(({ group, score }, index) => {
                  const battle = activeBattleOf(battles, group.id);
                  const picked = pendingGroupId === group.id;
                  return (
                    <div
                      key={group.id}
                      className={`rounded-xl border p-3 ${picked ? 'border-foreground/40 bg-muted/60' : 'border-border'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{group.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.members.length} 人 · 累计 {score} 分 · 均分 {(score / Math.max(1, group.members.length)).toFixed(1)}
                      </div>
                      <div className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{group.members.join('、')}</div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant={picked ? 'secondary' : 'outline'}
                          className="h-7 px-2 text-[11px]"
                          disabled={!!battle}
                          onClick={() => {
                            if (!pendingGroupId) { setPendingGroupId(group.id); return; }
                            if (pendingGroupId === group.id) { setPendingGroupId(null); return; }
                            onStartBattle(pendingGroupId, group.id, lessonNumber, lessonNumber);
                            setPendingGroupId(null);
                          }}
                        >
                          {battle ? '对战中' : picked ? '再选对手' : '挑战'}
                        </Button>
                        {battle && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => { onRevealBattle(battle.id); setRevealedBattleId(battle.id); }}
                          >
                            揭晓
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setBatchTargets(group.members)}
                        >
                          评价小组
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeBattles.length > 0 && (
              <div className="mt-4 space-y-2">
                {activeBattles.map(battle => {
                  const a = groups.find(g => g.id === battle.groupAId);
                  const b = groups.find(g => g.id === battle.groupBId);
                  if (!a || !b) return null;
                  const aScore = groupScore(classData.events, a, battle.fromLesson, battle.toLesson);
                  const bScore = groupScore(classData.events, b, battle.fromLesson, battle.toLesson);
                  return (
                    <div key={battle.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                      <span className="text-sm font-semibold tabular-nums">{aScore}</span>
                      <span className="text-xs text-muted-foreground">:</span>
                      <span className="text-sm font-semibold tabular-nums">{bScore}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-sm">{b.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">第 {battle.fromLesson} 课</span>
                    </div>
                  );
                })}
              </div>
            )}

            {settledBattles.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">最近战绩</div>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {settledBattles.map(battle => {
                    const a = groups.find(g => g.id === battle.groupAId);
                    const b = groups.find(g => g.id === battle.groupBId);
                    if (!a || !b || !battle.result) return null;
                    const winner = battle.result.winnerId
                      ? (battle.result.winnerId === a.id ? a.name : b.name)
                      : null;
                    return (
                      <div key={battle.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{a.name} vs {b.name}</span>
                        <span className="tabular-nums text-muted-foreground">{battle.result.aScore} : {battle.result.bScore}</span>
                        <span className={`shrink-0 ${winner ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {winner ? `${winner} 胜` : '平局'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">小卖部</h3>
                <p className="mt-1 text-xs text-muted-foreground">徽章是升级奖励（每级 5 枚），买装扮或投喂宠物都会花掉它。</p>
              </div>
              {adoptedRows.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    value={activeShopStudent ?? ''}
                    onChange={event => setShopStudent(event.target.value)}
                    aria-label="选择学生"
                  >
                    {adoptedRows.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">徽章 {shopPet ? badgeBalance(shopPet) : 0}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-1.5">
              {([['skin', '装扮'], ['interact', '互动']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShopTab(key)}
                  className={`rounded-full border px-3 py-1 text-xs ${shopTab === key ? 'border-foreground/40 bg-muted text-foreground' : 'border-border text-muted-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!shopPet && <p className="py-8 text-center text-sm text-muted-foreground">先领养宠物才能逛小卖部</p>}

            {shopPet && shopTab === 'skin' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PET_SKINS.map(item => {
                  const owned = (shopPet.ownedSkins ?? []).includes(item.id);
                  const equipped = shopPet.skin === item.id;
                  const affordable = badgeBalance(shopPet) >= item.price;
                  const wearable = canWear(item.id, shopPet.petId);
                  return (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-muted/50 p-1">
                          <PetAvatar petId={shopPet.petId} level={shopPet.level} size={52} skin={wearable ? item.id : undefined} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{item.name}</div>
                          <div className="text-[11px] text-muted-foreground">{item.price} 徽章</div>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{item.blurb}</p>
                      <Button
                        size="sm"
                        variant={equipped ? 'secondary' : 'outline'}
                        className="mt-2 h-7 w-full px-2 text-[11px]"
                        disabled={!wearable || (!owned && !affordable)}
                        onClick={() => (owned ? onEquipSkin(activeShopStudent!, item.id) : onBuySkin(activeShopStudent!, item.id))}
                      >
                        {!wearable ? '该宠物暂不支持' : equipped ? '卸下' : owned ? '装备' : affordable ? '购买' : '徽章不够'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {shopPet && shopTab === 'interact' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {PET_INTERACTIONS.map(item => (
                  <div key={item.id} className="rounded-xl border border-border p-3">
                    <div className="text-xs font-medium">{item.name}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">花 {item.price} 徽章，经验 +{item.exp}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 w-full px-2 text-[11px]"
                      disabled={badgeBalance(shopPet) < item.price}
                      onClick={() => onInteract(activeShopStudent!, item.id)}
                    >
                      互动一下
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">成长榜</h3>
                <span className="text-xs text-muted-foreground">按等级、经验排序</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {ranking.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">还没有人领养宠物</p>}
                {ranking.map((row, index) => (
                  <div key={row.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                    <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <PetAvatar petId={row.pet!.petId} level={row.pet!.level} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">Lv.{row.pet!.level}</span>
                    <span className="w-12 text-right text-xs tabular-nums">{row.pet!.exp} exp</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold">徽章口径</h3>
              <div className="mt-3 space-y-2">
                {PET_BADGES.map(badge => (
                  <div key={badge.id} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm">{badge.name}</div>
                      <div className="text-xs text-muted-foreground">{badge.rule}</div>
                    </div>
                    <Badge variant={badge.mode === 'auto' ? 'secondary' : 'outline'} className="shrink-0 text-[10px] font-normal">
                      {badge.mode === 'auto' ? '自动' : '手动'}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* 计分设置 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>计分设置</DialogTitle>
            <DialogDescription>改动即时生效，只影响本班宠物，不改动学情记录。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium">历史记录怎么算</div>
              <div className="mt-1.5 flex gap-1.5">
                {([['all', '全部记录'], ['sinceEnable', '仅启用后']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSettings({ autoScope: key })}
                    className={`rounded-full border px-3 py-1 text-xs ${snapshot.settings.autoScope === key ? 'border-foreground/40 bg-muted text-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                选「全部记录」会在启用当天一次性补分，榜首容易固化；选「仅启用后」只结算 {snapshot.settings.enabledAt ? snapshot.settings.enabledAt.slice(0, 10) : '启用日'} 之后的记录。
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">允许经验为负</div>
                <p className="text-[11px] text-muted-foreground">关闭时经验最低为 0，扣分只影响流水。</p>
              </div>
              <Switch
                checked={snapshot.settings.allowNegativeExp}
                onCheckedChange={checked => onSettings({ allowNegativeExp: checked })}
                aria-label="允许经验为负"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">允许人工扣分</div>
                <p className="text-[11px] text-muted-foreground">关闭后只能正向加分；撤回历史流水不受影响。</p>
              </div>
              <Switch
                checked={snapshot.settings.allowDeduction}
                onCheckedChange={checked => onSettings({ allowDeduction: checked })}
                aria-label="允许人工扣分"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ['homeworkDone', '作业完成'],
                ['listeningDone', '课后任务'],
                ['fullScoreBonus', '满分额外'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-[11px] text-muted-foreground">
                  {label}
                  <input
                    className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-center text-sm tabular-nums"
                    value={snapshot.settings.rules[key]}
                    onChange={event => {
                      const value = Number(event.target.value.replace(/[^-\d]/g, ''));
                      if (!Number.isFinite(value)) return;
                      onSettings({ rules: { ...snapshot.settings.rules, [key]: value } });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 领养 */}
      <Dialog open={!!adoptStudent} onOpenChange={open => !open && setAdoptStudent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>选择宠物</DialogTitle>
            <DialogDescription>每位学生只拥有一只宠物；满级后可重领或转为社区建设。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {PET_CATALOG.map(pet => (
              <button
                key={pet.id}
                type="button"
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (adoptStudent) onAdopt(adoptStudent, pet.id);
                  setAdoptStudent(null);
                }}
              >
                <PetAvatar petId={pet.id} level={1} size={44} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{pet.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{pet.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量评价 */}
      <Dialog open={!!batchTargets} onOpenChange={open => !open && setBatchTargets(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量评价</DialogTitle>
            <DialogDescription>
              已选 {(batchTargets ?? []).length} 人 · 选择一条指标即可同时写入，扣分同样生效。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {rows.map(row => {
              const picked = (batchTargets ?? []).includes(row.name);
              return (
                <button
                  key={row.name}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${picked ? 'border-foreground/40 bg-muted text-foreground' : 'border-border text-muted-foreground'}`}
                  onClick={() => setBatchTargets(prev => {
                    const list = prev ?? [];
                    return picked ? list.filter(n => n !== row.name) : [...list, row.name];
                  })}
                >
                  {row.name}
                </button>
              );
            })}
          </div>

          <div className="mt-1 grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {SCORE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setBatchPreset(preset)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${batchPreset?.id === preset.id ? 'border-foreground/40 bg-muted' : 'border-border hover:bg-muted/60'}`}
              >
                <span className="min-w-0 truncate">{preset.name}</span>
                <span className={`ml-2 shrink-0 tabular-nums ${preset.delta > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {preset.delta > 0 ? `+${preset.delta}` : preset.delta}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground" htmlFor="custom-reason">自定义</label>
              <input
                id="custom-reason"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                placeholder="原因，例如：主动帮同学讲题"
                value={customReason}
                onChange={event => setCustomReason(event.target.value)}
              />
            </div>
            <input
              className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-center text-sm tabular-nums"
              value={customDelta}
              onChange={event => setCustomDelta(event.target.value.replace(/[^-\d]/g, ''))}
              aria-label="自定义分值"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBatchTargets(null)}>取消</Button>
            <Button
              disabled={!batchTargets?.length || (!batchPreset && !customReason.trim())}
              onClick={() => {
                if (!batchTargets?.length) return;
                const delta = batchPreset ? batchPreset.delta : Number(customDelta) || 0;
                const reason = batchPreset ? batchPreset.name : customReason.trim();
                if (!delta || !reason) return;
                onBatchScore(batchTargets, delta, reason);
                setBatchPreset(null);
                setCustomReason('');
                setBatchTargets(null);
              }}
            >
              提交
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 小组 PK 结果 */}
      <Dialog open={!!revealedBattleId} onOpenChange={open => !open && setRevealedBattleId(null)}>
        <DialogContent className="max-w-md">
          {(() => {
            const battle = battles.find(b => b.id === revealedBattleId);
            if (!battle || !battle.result) {
              return (
                <DialogHeader>
                  <DialogTitle>正在结算</DialogTitle>
                  <DialogDescription>双方比分仍在汇总，请稍后再看。</DialogDescription>
                </DialogHeader>
              );
            }
            const a = groups.find(g => g.id === battle.groupAId);
            const b = groups.find(g => g.id === battle.groupBId);
            const winner = battle.result.winnerId
              ? (battle.result.winnerId === a?.id ? a : b)
              : null;
            const aTop = a ? groupContributors(classData.events, a, battle.fromLesson, battle.toLesson).slice(0, 3) : [];
            const bTop = b ? groupContributors(classData.events, b, battle.fromLesson, battle.toLesson).slice(0, 3) : [];
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{winner ? `${winner.name} 获胜` : '平局'}</DialogTitle>
                  <DialogDescription>第 {battle.fromLesson} 课 · 按成员积分累计</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center gap-6 py-2">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">{a?.name}</div>
                    <div className="mt-1 text-3xl font-semibold tabular-nums">{battle.result.aScore}</div>
                  </div>
                  <span className="text-sm text-muted-foreground">:</span>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">{b?.name}</div>
                    <div className="mt-1 text-3xl font-semibold tabular-nums">{battle.result.bScore}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[aTop, bTop].map((list, index) => (
                    <div key={index} className="rounded-lg border border-border p-2">
                      <div className="mb-1 font-medium">{index === 0 ? a?.name : b?.name} 贡献</div>
                      {list.length === 0 && <div className="text-muted-foreground">本课暂无加分</div>}
                      {list.map(item => (
                        <div key={item.studentName} className="flex justify-between text-muted-foreground">
                          <span className="truncate">{item.studentName}</span>
                          <span className="tabular-nums">{item.score}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 详情 */}
      <Dialog open={!!detailStudent} onOpenChange={open => !open && setDetailStudent(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{detailStudent} 的伴学萌宠</DialogTitle>
            <DialogDescription>
              {detailPet ? `${petDefOf(detailPet.petId).name} · ${petDefOf(detailPet.petId).stages[stageOf(detailPet.level)]}` : ''}
            </DialogDescription>
          </DialogHeader>

          {detailPet && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <PetAvatar petId={detailPet.petId} level={detailPet.level} size={72} />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Lv.{detailPet.level}</span>
                    <span>{detailPet.exp} exp</span>
                  </div>
                  <div className="mt-1.5">
                    <ExpBar percent={expProgress(detailPet.exp, snapshot.settings.levelTable).percent} isMax={isMaxLevel(detailPet, snapshot.settings)} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {PET_BADGES.filter(b => b.mode === 'manual').map(badge => {
                  const owned = detailPet.badges.includes(badge.id);
                  return (
                    <Button
                      key={badge.id}
                      size="sm"
                      variant={owned ? 'secondary' : 'outline'}
                      disabled={owned}
                      onClick={() => detailStudent && onAward(detailStudent, badge)}
                    >
                      {owned ? `已授予 · ${badge.name}` : `授予 ${badge.name}`}
                    </Button>
                  );
                })}
              </div>

              {detailPet.route === 'building' && (
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <div className="text-sm font-medium">社区建设中</div>
                  <p className="mt-1 text-xs text-muted-foreground">社区等级沿用原经验值，加分继续用于扩建；想回到宠物养成可以重新领养。</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => detailStudent && setAdoptStudent(detailStudent)}>
                    重新领养宠物
                  </Button>
                </div>
              )}

              {isMaxLevel(detailPet, snapshot.settings) && (
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <div className="text-sm font-medium">已满级</div>
                  <p className="mt-1 text-xs text-muted-foreground">可以把这只宠物送进毕业册，重新领养一只，或转去建设班级社区。</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => detailStudent && onGraduate(detailStudent, 'pet')}>毕业并重领</Button>
                    <Button size="sm" variant="outline" onClick={() => detailStudent && onGraduate(detailStudent, 'building')}>转为社区建设</Button>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">最近记录</span>
                  <span className="text-xs text-muted-foreground">撤回会生成反向流水</span>
                </div>
                <ScrollArea className="h-48 rounded-lg border border-border">
                  <div className="divide-y divide-border">
                    {detailEvents.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">暂无流水</p>}
                    {detailEvents.map(event => (
                      <div key={event.id} className="flex items-center gap-3 px-3 py-2">
                        <span className={`w-10 text-right text-xs tabular-nums ${event.delta >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {event.delta > 0 ? `+${event.delta}` : event.delta}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{event.reason}</span>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onUndo(event.id)}>
                          撤回
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
