// 伴学萌宠 Tab：宠物卡片 + 成长榜 + 徽章
// 约束：只读既有 Class 数据；所有写操作通过回调交给上层（App）落库，组件本身无副作用。

import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarCheck, Check, Compass, Leaf, PawPrint, Search, Settings2, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { LearningWorkspaceHeader } from '@/components/LearningWorkspaceHeader';
import './PetGarden.css';
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
import { hasSizedAssets, hasWornImage, petFaceSources, petStageSources, wornSources } from '@/lib/gamification/petAssets';
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

/** 装扮仅使用与当前物种、当前成长阶段匹配的完整穿戴图。 */
function canWear(skinId: string, petId: string, level: number): boolean {
  return hasWornImage(skinId, petId, stageOf(level));
}

export function PetAvatar({ petId, level, size = 64, skin: requestedSkin }: { petId: string; level: number; size?: number; skin?: string }) {
  const def = petDefOf(petId);
  const stage = stageOf(level);
  const skin = requestedSkin && hasWornImage(requestedSkin, petId, stage) ? requestedSkin : undefined;
  const ear = 8 + stage * 4;
  const base = petStageSources(petId, stage);
  const worn = skin ? wornSources(skin, petId, stage) : {};
  const sized = hasSizedAssets();
  const chosen = worn.large || worn.small ? worn : base;

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
    <div className="pet-exp-track" role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isMax ? 100 : percent}>
      <div
        className="h-full rounded-full motion-progress-fill"
        style={{ transform: `scaleX(${isMax ? 1 : percent / 100})` }}
      />
    </div>
  );
}

function PetPortrait({ petId, level, face }: { petId: string; level: number; face: 'happy' | 'thinking' | 'celebrate' }) {
  const sources = petFaceSources(petId, face);
  return sources.large || sources.small ? <img className="pet-portrait-image" src={sources.large ?? sources.small} srcSet={sources.small && sources.large ? `${sources.small} 128w, ${sources.large} 256w` : undefined} sizes="132px" width={132} height={132} alt={`${petDefOf(petId).name}的${{ happy: '开心', thinking: '思考', celebrate: '庆祝' }[face]}表情`} /> : <PetAvatar petId={petId} level={level} size={132} />;
}

export function PetGarden({
  cls, snapshot, onAdopt, onScore, onGraduate, onAward, onUndo, onSettings,
  lessonNumber, onResetGroups, onStartBattle, onRevealBattle, onBatchScore,
  onBuySkin, onEquipSkin, onInteract,
}: PetGardenProps) {
  const [view, setView] = useState<'garden' | 'shop' | 'adventure'>('garden');
  const [search, setSearch] = useState('');
  const [face, setFace] = useState<'happy' | 'thinking' | 'celebrate'>('happy');
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
    <div className="learning-workspace pet-garden" data-view={view}>
      <LearningWorkspaceHeader
        title="伴学萌宠"
        context={cls.name}
        description="把课堂表现、作业和课后任务的积分，记进伙伴的成长。"
        icon={PawPrint}
      >
        <div className="pet-hero-art" aria-hidden="true">
          <div className="pet-hero-moss"><PetAvatar petId="moss" level={1} size={104} /></div>
          <div className="pet-hero-fox"><PetAvatar petId="ember" level={1} size={89} /></div>
        </div>
      </LearningWorkspaceHeader>

      <div className="pet-board-controls learning-surface">
        {enabled && (
          <dl className="pet-metrics" aria-label="班级成长概览">
            <div>
              <span className="pet-metric-icon"><Users size={19} aria-hidden="true" /></span>
              <div><dt>已领养学员</dt><dd>{adoptedCount}<small> / {rows.length}</small></dd></div>
            </div>
            <div>
              <span className="pet-metric-icon"><TrendingUp size={19} aria-hidden="true" /></span>
              <div><dt>已进阶伙伴</dt><dd>{ranking.filter(row => stageOf(row.pet!.level) > 0).length}<small> 只</small></dd></div>
            </div>
            <div>
              <span className="pet-metric-icon"><CalendarCheck size={19} aria-hidden="true" /></span>
              <div><dt>最近结算课次</dt><dd>{classData.lastAutoLesson ? <>第 {classData.lastAutoLesson}<small> 课</small></> : '—'}</dd></div>
            </div>
          </dl>
        )}

        <div className="pet-operations">
          {enabled && (
            <nav className="pet-navigation workspace-segments" aria-label="萌宠视图">
              {([{ id: 'garden', label: '我的园地', icon: Leaf }, { id: 'shop', label: '装扮小铺', icon: ShoppingBag }, { id: 'adventure', label: '班级冒险', icon: Compass }] as const).map(item => (
                <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>
                  <item.icon size={17} aria-hidden="true" />{item.label}
                </button>
              ))}
            </nav>
          )}
          <div className="pet-settings">
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />计分设置</Button>
            <label className="pet-scope">
              本班启用
              <Switch
                checked={enabled}
                onCheckedChange={checked => onSettings({ enabled: checked, classScope: checked ? [cls.id] : [] })}
                aria-label="为本班启用伴学萌宠"
              />
            </label>
          </div>
        </div>
      </div>

      {!enabled ? (
        <Card className="learning-surface pet-panel pet-empty pet-disabled">
          <span className="pet-metric-icon"><PawPrint size={22} aria-hidden="true" /></span>
          <div>
            <h3>这个班还没开启伴学萌宠</h3>
            <p>开启前可在计分设置中确认历史记录的结算范围。</p>
          </div>
          <Button onClick={() => onSettings({ enabled: true, classScope: [cls.id] })}>开启本班</Button>
        </Card>
      ) : (
        <>
          <div className="pet-section pet-garden-toolbar" data-section="garden">
            <div>
              <h3>班级成长园地 <span>{rows.length} 位学员</span></h3>
              <p>作业 +{snapshot.settings.rules.homeworkDone} · 课后任务 +{snapshot.settings.rules.listeningDone} · 满分额外 +{snapshot.settings.rules.fullScoreBonus}</p>
            </div>
            <label className="pet-search"><Search size={17} aria-hidden="true" /><input aria-label="搜索学生" placeholder="搜索学员" value={search} onChange={e => setSearch(e.target.value)} /></label>
          </div>
          <div className="pet-section pet-students" data-section="garden">
            {rows.length === 0 && <div className="pet-panel pet-empty">班级还没有学生，添加名单后就能一起领养伙伴。</div>}
            {rows.length > 0 && !rows.some(row => row.name.includes(search.trim())) && <div className="pet-panel pet-empty" role="status">没有找到这位同学，试试其他名字。</div>}
            {rows.filter(row => row.name.includes(search.trim())).map(({ name, pet, progress }) => (
              <Card key={name} className="learning-surface pet-student" style={{ '--pet-hue': pet ? petDefOf(pet.petId).hue : '155 20% 45%' } as React.CSSProperties}>
                <button
                  type="button"
                  className="pet-student-open" aria-label={`${pet ? '查看' : '为'}${name}${pet ? '的宠物' : '领养宠物'}`}
                  onClick={() => { setFace('happy'); if (pet) setDetailStudent(name); else setAdoptStudent(name); }}
                >
                  <div className="pet-habitat"><span className="pet-card-level">{pet ? `Lv.${pet.level}` : '未领养'}</span>
                  {pet?.route === 'building' ? (
                    <CommunityAvatar level={pet.level} size={140} />
                  ) : pet ? (
                    <PetAvatar petId={pet.petId} level={pet.level} skin={pet.skin} size={144} />
                  ) : (
                    <div className="pet-adopt-placeholder"><PawPrint size={30} strokeWidth={1.45} /></div>
                  )}
                  </div>
                  <div className="pet-student-info">
                    <div className="pet-student-name">{name}<ArrowUpRight size={15} /></div>
                    <div className="pet-student-subtitle">
                      {pet
                        ? pet.route === 'building'
                          ? `班级社区 · 第 ${Math.max(1, Math.ceil(pet.level / 3))} 期`
                          : `${petDefOf(pet.petId).name} · ${petDefOf(pet.petId).stages[stageOf(pet.level)]}`
                        : '选择一只宠物'}
                    </div>
                    {pet && <div className="pet-student-meta">徽章 {badgeBalance(pet)}</div>}
                    {pet && (() => {
                      const status = petStatusOf(pet, lastEventByStudent.get(name));
                      const label = status === 'egg' ? '蛋形态' : status === 'sick' ? '生病中' : status === 'hungry' ? '饥饿中' : '';
                      if (!label) return null;
                      return <div className="pet-student-meta">{label}</div>;
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
                  <div className="pet-earned-badges flex flex-wrap items-center gap-1.5">
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

                <div className="pet-quick-scores mt-auto">
                  {pet ? (
                    QUICK_SCORES.map(item => (
                      <Button
                        key={item.delta}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        aria-label={`为${name}加${item.delta}分：${item.reason}`}
                        onClick={() => onScore(name, item.delta, item.reason)}
                      >
                        +{item.delta}<span>{item.reason}</span>
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

          <Card className="pet-section learning-surface pet-panel pet-expedition p-5" data-section="adventure">
            <div className="pet-expedition-heading">
              <h3 className="pet-section-title"><Compass size={19} aria-hidden="true" />班级共建 · 海底两万里</h3>
              <span>全班净积分 <strong>{build.total}</strong></span>
            </div>
            <div className="pet-expedition-progress">
              <div><strong>第 {build.stageIndex + 1} 站 · {build.stageName}</strong><span>{build.isFinal ? '已到终点站' : `距下一站还差 ${Math.max(0, build.stageNeed - build.stageScore)} 分`}</span></div>
              <div className="pet-exp-track" role="progressbar" aria-label="本站共建进度"
                aria-valuemin={0} aria-valuemax={build.stageNeed} aria-valuenow={Math.min(build.stageNeed, build.stageScore)}>
                <div className="motion-progress-fill" style={{ transform: `scaleX(${Math.min(1, build.stageScore / build.stageNeed)})` }} />
              </div>
            </div>
            <ol className="pet-stations" aria-label="班级共建路线">
              {BUILD_STAGES.map((stage, index) => (
                <li key={stage}
                  data-position={index < build.stageIndex ? 'complete' : index === build.stageIndex ? 'current' : 'pending'}
                  aria-current={index === build.stageIndex ? 'step' : undefined}>
                  <span>{index < build.stageIndex ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{stage}
                </li>
              ))}
            </ol>
          </Card>

          <Card className="pet-section learning-surface pet-panel p-5" data-section="adventure">
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

          <Card className="pet-section learning-surface pet-panel pet-shop p-5" data-section="shop">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="pet-section-title"><ShoppingBag size={19} aria-hidden="true" />装扮与互动</h3>
                <p className="mt-1 text-xs text-muted-foreground">徽章是升级奖励（每级 5 枚），买装扮或投喂宠物都会花掉它。</p>
              </div>
              {adoptedRows.length > 0 && (
                <div className="pet-shop-account">
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    value={activeShopStudent ?? ''}
                    onChange={event => setShopStudent(event.target.value)}
                    aria-label="选择学生"
                  >
                    {adoptedRows.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
                  </select>
                  <span>徽章 <strong>{shopPet ? badgeBalance(shopPet) : 0}</strong></span>
                </div>
              )}
            </div>

            <div className="pet-shop-modes workspace-segments" aria-label="小铺分类">
              {([['skin', '装扮'], ['interact', '互动']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShopTab(key)}
                  aria-pressed={shopTab === key}
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
                  const wearable = canWear(item.id, shopPet.petId, shopPet.level);
                  return (
                    <div key={item.id} className="pet-shop-item rounded-xl border border-border p-3">
                      <div className="pet-shop-item-top flex items-center gap-2">
                        <div className="rounded-lg bg-muted/50 p-1">
                          <PetAvatar petId={shopPet.petId} level={shopPet.level} size={108} skin={wearable ? item.id : undefined} />
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
                        {!wearable ? '当前形态装扮制作中' : equipped ? '卸下' : owned ? '装备' : affordable ? '购买' : '徽章不够'}
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

          <div className="pet-section grid gap-6 lg:grid-cols-[1.2fr_1fr]" data-section="garden">
            <Card className="learning-surface pet-panel p-5">
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

            <Card className="learning-surface pet-panel p-5">
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
        <DialogContent className="pet-dialog max-w-md">
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
        <DialogContent className="pet-dialog max-w-lg">
          <DialogHeader>
            <DialogTitle>选择宠物</DialogTitle>
            <DialogDescription>每位学生只拥有一只宠物；满级后可重领或转为社区建设。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {PET_CATALOG.map(pet => (
              <button
                key={pet.id}
                type="button"
                className="pet-adoption-option flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (adoptStudent) onAdopt(adoptStudent, pet.id);
                  setAdoptStudent(null);
                }}
              >
                <PetAvatar petId={pet.id} level={1} size={86} />
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
        <DialogContent className="pet-dialog max-w-2xl">
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
        <DialogContent className="pet-dialog max-w-md">
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
        <DialogContent className="pet-dialog max-w-xl">
          <DialogHeader>
            <DialogTitle>{detailStudent} 的伴学萌宠</DialogTitle>
            <DialogDescription>
              {detailPet ? `${petDefOf(detailPet.petId).name} · ${petDefOf(detailPet.petId).stages[stageOf(detailPet.level)]}` : ''}
            </DialogDescription>
          </DialogHeader>

          {detailPet && (
            <div className="space-y-5">
              <div className="pet-detail-portrait flex items-center gap-4">
                <PetPortrait petId={detailPet.petId} level={detailPet.level} face={face} />
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

              <div className="pet-expression-picker" aria-label="宠物表情">
                {([['happy', '开心'], ['thinking', '思考'], ['celebrate', '庆祝']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={face === id} onClick={() => setFace(id)}>{label}</button>)}
              </div>
              <div className="pet-growth-path" aria-label="四阶段成长路线">
                {([1, 3, 5, 7] as const).map((level, index) => <div key={level} data-unlocked={detailPet.level >= level}><PetAvatar petId={detailPet.petId} level={level} size={64} /><strong>{petDefOf(detailPet.petId).stages[index]}</strong><span>Lv.{level}{index === 3 ? '+' : `–${level + 1}`}</span></div>)}
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
