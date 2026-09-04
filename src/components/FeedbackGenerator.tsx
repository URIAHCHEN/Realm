import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Copy, Check, Wand2, Users, ClipboardList,
  CircleAlert, RotateCcw, Send,
} from 'lucide-react';
import { generatePersonalFeedback, copyToClipboard } from '@/lib/feedbackTemplates';
import type { StudentRecord, LessonConfig, QuestionType, WeakPoint } from '@/types';

interface FeedbackGeneratorProps {
  students: string[];
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
}

type StatusTone = 'none' | 'generated' | 'copied';

export function FeedbackGenerator({
  students,
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: FeedbackGeneratorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [copiedSet, setCopiedSet] = useState<Set<string>>(new Set());

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

  const recordOf = (name: string) =>
    lessonRecords.find(r => r.studentName === name);

  const buildWeakPoints = (record: StudentRecord): WeakPoint[] =>
    lessonConfig.questionTypes
      .map(qt => {
        const studentScore = record.scores[qt.id] || 0;
        const classAvgScore = stats.avgScores[qt.id] || 0;
        return {
          questionTypeId: qt.id,
          questionTypeName: qt.name,
          studentScore,
          classAvgScore,
          diff: studentScore - classAvgScore
        };
      })
      .filter(wp => wp.diff < 0)
      .sort((a, b) => a.diff - b.diff);

  const generateFor = (name: string): string | null => {
    const record = recordOf(name);
    if (!record) return null;
    return generatePersonalFeedback(
      record,
      lessonConfig,
      stats,
      buildWeakPoints(record),
      getNickname(name)
    );
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
              {selected && statusBadge(selected)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
