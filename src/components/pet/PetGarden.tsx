// 伴学萌宠 Tab：宠物卡片 + 成长榜 + 徽章
// 约束：只读既有 Class 数据；所有写操作通过回调交给上层（App）落库，组件本身无副作用。

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { PET_BADGES, PET_CATALOG, type PetBadgeDef, type PetSettings, type PetSnapshot } from '@/types/pet';
import { expProgress, isMaxLevel, petDefOf, stageOf } from '@/lib/gamification/rules';
import { isEnabledForClass } from '@/lib/gamification/store';
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
}

const QUICK_SCORES = [
  { delta: 1, reason: '课堂表现' },
  { delta: 3, reason: '小组协作' },
  { delta: 5, reason: '额外坚持' },
];

/** 极简纸艺风格头像：纯 CSS 绘制，不依赖图片资源 */
function PetAvatar({ petId, level, size = 64 }: { petId: string; level: number; size?: number }) {
  const def = petDefOf(petId);
  const stage = stageOf(level);
  const ear = 8 + stage * 4;
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

export function PetGarden({ cls, snapshot, onAdopt, onScore, onGraduate, onAward, onUndo, onSettings }: PetGardenProps) {
  const [detailStudent, setDetailStudent] = useState<string | null>(null);
  const [adoptStudent, setAdoptStudent] = useState<string | null>(null);
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
                    <PetAvatar petId={pet.petId} level={pet.level} />
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
