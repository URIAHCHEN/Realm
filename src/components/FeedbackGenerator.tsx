import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Copy, Check, Wand2, Users, ClipboardList,
  CircleAlert, RotateCcw, Send, Sparkles,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generatePersonalFeedback, generateFourInOne, copyToClipboard, DEFAULT_FOUR_IN_ONE_TEMPLATE, FOUR_IN_ONE_VARIABLES, FOUR_IN_ONE_SCENARIOS, FOUR_IN_ONE_VARIANT_COUNT } from '@/lib/feedbackTemplates';
import { isAbsentRecord } from '@/lib/attendance';
import type { StudentRecord, LessonConfig, QuestionType } from '@/types';

interface FeedbackGeneratorProps {
  students: string[];
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
  libraryLinks?: string[];
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
}

type StatusTone = 'none' | 'generated' | 'copied';

export function FeedbackGenerator({
  students,
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats,
  libraryLinks = [],
  onSaveLessonConfig
}: FeedbackGeneratorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [copiedSet, setCopiedSet] = useState<Set<string>>(new Set());

  // 模板旁编辑 + 实时预览
  const [showTemplate, setShowTemplate] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState(lessonConfig.feedbackTemplate);
  const [draftFourInOne, setDraftFourInOne] = useState(lessonConfig.fourInOneTemplate || DEFAULT_FOUR_IN_ONE_TEMPLATE);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // 反馈模式：常规模板 / 四个一
  const [feedbackMode, setFeedbackMode] = useState<'normal' | 'fourInOne'>('normal');
  const [scenario, setScenario] = useState<'daily' | 'afterclass' | 'comm'>('daily');
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [variant, setVariant] = useState(0);
  const SCENARIOS: { value: 'daily' | 'afterclass' | 'comm'; label: string }[] =
    FOUR_IN_ONE_SCENARIOS.map(s => ({ value: s.key, label: s.label }));
  const scenarioLabel = SCENARIOS.find(s => s.value === scenario)?.label || scenario;

  const lessonRecords = useMemo(() =>
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() =>
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  // 切换课次时重置批量状态
  useEffect(() => {
    setGenerated({});
    setCopiedSet(new Set());
    setSelected(null);
  }, [lessonNumber]);

  // 切换反馈模式/场景/新学员/措辞时，清空以便按新规则重算
  useEffect(() => {
    setGenerated({});
    setCopiedSet(new Set());
  }, [feedbackMode, scenario, isNewStudent, variant]);

  const recordOf = (name: string) =>
    lessonRecords.find(r => r.studentName === name);

  const generateFor = (name: string): string | null => {
    const record = recordOf(name);
    if (!record) return null;
    if (feedbackMode === 'fourInOne') {
      return generateFourInOne(record, lessonConfig, stats, getNickname(name), scenarioLabel, isNewStudent, libraryLinks, variant, draftFourInOne, scenario);
    }
    return generatePersonalFeedback(record, lessonConfig, stats, getNickname(name), draftFeedback);
  };

  // 模板草稿改动：若当前学生已有生成内容，实时重算预览
  useEffect(() => {
    if (!selected) return;
    setGenerated(prev => prev[selected] ? { ...prev, [selected]: generateFor(selected) ?? prev[selected] } : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeedback, draftFourInOne]);

  // 外部模板变化（保存成功 / 切换课次或班级）时回填草稿
  useEffect(() => { setDraftFeedback(lessonConfig.feedbackTemplate); }, [lessonConfig.feedbackTemplate]);
  useEffect(() => { setDraftFourInOne(lessonConfig.fourInOneTemplate || DEFAULT_FOUR_IN_ONE_TEMPLATE); }, [lessonConfig.fourInOneTemplate]);

  const isFourInOne = feedbackMode === 'fourInOne';
  const activeTemplate = isFourInOne ? draftFourInOne : draftFeedback;
  const setActiveTemplate = (v: string) => isFourInOne ? setDraftFourInOne(v) : setDraftFeedback(v);

  // 在光标处插入变量到模板
  const insertTemplateVar = (token: string) => {
    const ta = templateRef.current;
    if (!ta) { setActiveTemplate(activeTemplate + token); return; }
    const start = ta.selectionStart ?? activeTemplate.length;
    const end = ta.selectionEnd ?? activeTemplate.length;
    const next = activeTemplate.slice(0, start) + token + activeTemplate.slice(end);
    setActiveTemplate(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + token.length, start + token.length); });
  };

  // 保存当前模式模板到课次配置，并按新模板重算所有已生成反馈
  const handleSaveTemplate = () => {
    if (isFourInOne) {
      onSaveLessonConfig(lessonNumber, { fourInOneTemplate: draftFourInOne });
    } else {
      onSaveLessonConfig(lessonNumber, { feedbackTemplate: draftFeedback });
    }
    setGenerated(prev => {
      const next: Record<string, string> = {};
      Object.keys(prev).forEach(name => { const t = generateFor(name); if (t) next[name] = t; });
      return next;
    });
    toast.success('模板已保存，已按新模板重新生成');
  };

  const resetTemplateToDefault = () => {
    if (isFourInOne) setDraftFourInOne(DEFAULT_FOUR_IN_ONE_TEMPLATE);
    else setDraftFeedback(lessonConfig.feedbackTemplate);
    toast.info('已恢复模板草稿');
  };

  const ensureGenerated = (name: string): string | null => {
    if (generated[name]) return generated[name];
    const text = generateFor(name);
    if (text) {
      setGenerated(prev => ({ ...prev, [name]: text }));
    }
    return text;
  };

  const handleSelect = (name: string) => {
    setSelected(name);
    ensureGenerated(name);
  };

  const handleGenerateAll = () => {
    const withRecords = students.filter(s => recordOf(s));
    if (withRecords.length === 0) {
      toast.error(`第${lessonNumber}课还没有学情记录，请先到「学情记录」保存`);
      return;
    }
    const next = { ...generated };
    let fresh = 0;
    withRecords.forEach(name => {
      if (!next[name]) {
        const text = generateFor(name);
        if (text) {
          next[name] = text;
          fresh++;
        }
      }
    });
    setGenerated(next);
    if (!selected) setSelected(withRecords[0]);
    toast.success(fresh > 0
      ? `已生成 ${fresh} 份新反馈，共 ${Object.keys(next).length} 份`
      : '全部反馈已是最新，无需重新生成'
    );
    const absentCount = withRecords.filter(n => {
      const r = recordOf(n);
      return r && isAbsentRecord(r);
    }).length;
    if (absentCount > 0) toast.info(`其中 ${absentCount} 名本课请假/缺勤，已按请假处理（不计入平均分）`);
  };

  const handleCopyOne = async (name: string) => {
    const text = generated[name] ?? ensureGenerated(name);
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => new Set(prev).add(name));
      toast.success(`已复制 ${getNickname(name)} 的私发反馈`);
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const handleCopyAll = async () => {
    const ordered = students.filter(s => generated[s]);
    if (ordered.length === 0) {
      toast.error('还没有生成任何反馈');
      return;
    }
    const text = ordered.map(s => generated[s]).join('\n\n──────────────\n\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success(`已复制 ${ordered.length} 份反馈（用分隔线隔开）`);
    }
  };

  const handleResetStatus = () => {
    setCopiedSet(new Set());
    toast.success('已重置复制状态');
  };

  const statusTone = (name: string): StatusTone => {
    if (copiedSet.has(name)) return 'copied';
    if (generated[name]) return 'generated';
    return 'none';
  };

  const withRecordsCount = students.filter(s => recordOf(s)).length;
  const generatedCount = students.filter(s => generated[s]).length;
  const copiedCount = copiedSet.size;
  const progressPct = withRecordsCount > 0
    ? Math.round((generatedCount / withRecordsCount) * 100)
    : 0;

  const selectedRecord = selected ? recordOf(selected) : undefined;

  const statusBadge = (name: string) => {
    const tone = statusTone(name);
    if (tone === 'copied') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 rounded-full">
          <Check className="w-3 h-3" />已发送
        </Badge>
      );
    }
    if (tone === 'generated') {
      return (
        <Badge className="border-0 rounded-full gap-1 bg-[rgb(var(--brand-rgb)/0.12)]" style={{ color: 'var(--brand)' }}>
          已生成
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="rounded-full text-[color:var(--ink-4)] bg-black/[0.05]">
        未生成
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* 顶部：标题 + 批量操作 */}
      <Card className="ios-glass-card border-0">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}>
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">私发反馈工作台 · 第{lessonNumber}课</p>
                <p className="text-xs text-[color:var(--ink-4)]">按课次配置的反馈模板一键生成全班私发话术，逐个复制发送并跟踪进度</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="ios-button gap-2" onClick={handleGenerateAll}>
                <Wand2 className="w-4 h-4" />
                一键生成全班
              </Button>
              <Button variant="outline" className="rounded-xl gap-2" onClick={handleCopyAll}>
                <Copy className="w-4 h-4" />
                复制全部
              </Button>
              <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 text-[color:var(--ink-4)]" onClick={handleResetStatus}>
                <RotateCcw className="w-3.5 h-3.5" />
                重置状态
              </Button>
            </div>
          </div>

          {/* 反馈模式 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="tablist" className="inline-flex gap-1 p-1 rounded-[var(--r-md)] bg-black/[0.05]">
              <button
                role="tab" aria-selected={feedbackMode === 'normal'}
                onClick={() => setFeedbackMode('normal')}
                className={`px-3 h-8 rounded-lg text-sm font-medium transition-all ${feedbackMode === 'normal' ? 'bg-white shadow-sm text-[color:var(--ink)]' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
              >常规反馈</button>
              <button
                role="tab" aria-selected={feedbackMode === 'fourInOne'}
                onClick={() => setFeedbackMode('fourInOne')}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-all ${feedbackMode === 'fourInOne' ? 'bg-white shadow-sm text-[color:var(--ink)]' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
              ><Sparkles className="w-3.5 h-3.5" />四个一</button>
            </div>
            {feedbackMode === 'fourInOne' && (
              <>
                <Select value={scenario} onValueChange={(v) => setScenario(v as typeof scenario)}>
                  <SelectTrigger className="w-32 h-8 text-sm rounded-[var(--r-md)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCENARIOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-2)] cursor-pointer select-none">
                  <input type="checkbox" checked={isNewStudent} onChange={(e) => setIsNewStudent(e.target.checked)} className="accent-[color:var(--brand)]" />
                  新学员（补充孩子感受）
                </label>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[var(--r-md)]" onClick={() => setVariant(v => (v + 1) % FOUR_IN_ONE_VARIANT_COUNT)}>
                  <RotateCcw className="w-3.5 h-3.5" />换一版措辞（{variant + 1}/{FOUR_IN_ONE_VARIANT_COUNT}）
                </Button>
              </>
            )}
          </div>

          {/* 进度条 */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[color:var(--ink-4)]">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                有记录学生 {withRecordsCount} / 共 {students.length} 人
              </span>
              <span>
                已生成 <span className="font-semibold" style={{ color: 'var(--brand)' }}>{generatedCount}</span>
                <span className="mx-1.5">·</span>
                已发送 <span className="font-semibold text-emerald-600">{copiedCount}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, rgb(var(--brand-rgb)/0.6), rgb(var(--brand-rgb)))'
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 主体：左列表 + 右编辑 */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* 学生列表 */}
        <Card className="ios-glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-[color:var(--ink-2)]">
              <ClipboardList className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              学生列表
              <Badge variant="secondary" className="rounded-full ml-auto">{students.length} 人</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {students.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-4)] text-center py-8">班级暂无学生</p>
            ) : (
              <ScrollArea className="h-[460px] pr-2">
                <div className="space-y-1">
                  {students.map(s => {
                    const hasRecord = !!recordOf(s);
                    const tone = statusTone(s);
                    const isActive = selected === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSelect(s)}
                        className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${
                          isActive
                            ? 'bg-[rgb(var(--brand-rgb)/0.1)] ring-1 ring-[rgb(var(--brand-rgb)/0.35)]'
                            : 'hover:bg-black/[0.04]'
                        }`}
                      >
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                          style={{
                            background: tone === 'copied'
                              ? 'linear-gradient(135deg,#34d399,#10b981)'
                              : 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))'
                          }}
                        >
                          {getNickname(s).slice(0, 1) || s.slice(0, 1)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-[color:var(--ink)] truncate">{getNickname(s)}</span>
                          <span className="block text-[11px] text-[color:var(--ink-4)] truncate">
                            {hasRecord ? `${recordOf(s)!.totalScore}分 · 第${recordOf(s)!.rank}名` : '本课无记录'}
                          </span>
                        </span>
                        {tone === 'copied' ? (
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : tone === 'generated' ? (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--brand-rgb))' }} />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* 编辑区 */}
        <Card className="ios-glass-card border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between gap-2 text-[color:var(--ink-2)]">
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                {selected ? `${getNickname(selected)} 的反馈内容` : '反馈内容'}
              </span>
              <span className="flex items-center gap-2">
                {selected && statusBadge(selected)}
                <button
                  onClick={() => setShowTemplate(v => !v)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-all ${showTemplate ? 'bg-[rgb(var(--brand-rgb)/0.12)] border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)]' : 'bg-black/[0.04] border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
                  title="在右侧编辑并预览反馈模板"
                >
                  <Wand2 className="w-3.5 h-3.5" />{isFourInOne ? '四个一模板' : '反馈模板'}
                </button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
          <div className={showTemplate ? 'grid gap-5 lg:grid-cols-2 items-start' : ''}>
          <div className="space-y-3">
            {!selected ? (
              <div className="py-16 text-center text-[color:var(--ink-4)]">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">从左侧选择学生，或点「一键生成全班」开始</p>
              </div>
            ) : !selectedRecord ? (
              <div className="py-16 text-center">
                <CircleAlert className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                <p className="text-sm text-[color:var(--ink-2)] font-medium">{getNickname(selected)} 在第{lessonNumber}课还没有学情记录</p>
                <p className="text-xs text-[color:var(--ink-4)] mt-1.5">请先到「学情记录」为该生建档后再生成反馈</p>
              </div>
            ) : (
              <>
                <Textarea
                  value={generated[selected] ?? ''}
                  onChange={(e) => setGenerated(prev => ({ ...prev, [selected]: e.target.value }))}
                  className="min-h-[360px] text-sm leading-relaxed ios-input"
                  placeholder="点击上方「一键生成全班」或直接输入反馈内容…"
                />
                {(lessonConfig.customFields || []).length > 0 && selectedRecord && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[color:var(--ink-4)]">可选参数（点击追加）：</span>
                    {(lessonConfig.customFields || []).map(cf => {
                      const v = (selectedRecord.customValues || {})[cf.id];
                      if (v === '' || v == null) return null;
                      const disp = cf.kind === 'number' ? `${v}分` : String(v);
                      return (
                        <button
                          key={cf.id}
                          type="button"
                          onClick={() => setGenerated(prev => ({ ...prev, [selected]: `${prev[selected] ?? ''}\n📋 ${cf.name}：${disp}` }))}
                          className="px-2 py-0.5 rounded-lg text-xs bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                        >+ {cf.name}：{disp}</button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[color:var(--ink-4)]">
                    内容可自由编辑；薄弱项与成绩详情已按班均自动计算
                  </p>
                  <Button className="ios-button gap-2" onClick={() => handleCopyOne(selected)}>
                    <Copy className="w-4 h-4" />
                    复制并发送
                  </Button>
                </div>
              </>
            )}
          </div>
          {showTemplate && (
            <div className="space-y-3 rounded-2xl border border-black/8 bg-black/[0.02] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--ink)] flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                  {isFourInOne ? '四个一 · 模板编辑' : '私发反馈 · 模板编辑'}
                </p>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg gap-1 text-[color:var(--ink-4)]" onClick={resetTemplateToDefault}>
                    <RotateCcw className="w-3.5 h-3.5" />恢复默认
                  </Button>
                  <Button size="sm" className="ios-button h-7 text-xs rounded-lg gap-1" onClick={handleSaveTemplate}>
                    <Check className="w-3.5 h-3.5" />保存模板
                  </Button>
                </div>
              </div>
              <Textarea
                ref={templateRef}
                value={activeTemplate}
                onChange={(e) => setActiveTemplate(e.target.value)}
                className="min-h-[220px] text-sm leading-relaxed font-mono ios-input"
                placeholder="编辑模板，点击变量可插入…"
              />
              <div className="flex flex-wrap gap-1.5">
                {(isFourInOne ? FOUR_IN_ONE_VARIABLES : [
                  { key: '【学生昵称】', desc: '' }, { key: '【学生短昵称】', desc: '' }, { key: '【课次】', desc: '' },
                  { key: '【考勤】', desc: '' }, { key: '【作业】', desc: '' }, { key: '【课后任务】', desc: '' },
                  { key: '【成绩详情】', desc: '' }, { key: '【总分】', desc: '' }, { key: '【满分】', desc: '' },
                  { key: '【排名】', desc: '' }, { key: '【正确率】', desc: '' }, { key: '【薄弱项】', desc: '' },
                  { key: '【作业内容】', desc: '' },
                ]).map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertTemplateVar(v.key)}
                    title={v.desc || undefined}
                    className="px-2 py-0.5 rounded-lg text-xs font-mono bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                  >{v.key}</button>
                ))}
                {!isFourInOne && (lessonConfig.customFields || []).map(cf => (
                  <button
                    key={cf.id}
                    type="button"
                    onClick={() => insertTemplateVar(`【${cf.name}】`)}
                    className="px-2 py-0.5 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >【{cf.name}】</button>
                ))}
              </div>
              <p className="text-xs text-[color:var(--ink-4)] leading-relaxed">
                {isFourInOne
                  ? '留空将使用内置默认结构；自动内容由当期成绩、薄弱板块、作业与考勤实时生成。编辑后点「保存模板」写入本课并即时重算全班预览。'
                  : '编辑后左侧预览实时更新；点「保存模板」写入本课，未保存的改动仅用于预览。此处编辑与「生成设置 → 表格字段」的模板互通。'}
              </p>
            </div>
          )}
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
