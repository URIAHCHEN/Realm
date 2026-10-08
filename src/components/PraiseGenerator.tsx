import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { attendanceKind } from '@/lib/attendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trophy, Copy, Check, Sparkles } from 'lucide-react';
import { generatePraise, copyToClipboard } from '@/lib/feedbackTemplates';
import type { StudentRecord, LessonConfig, QuestionType, ClassStats } from '@/types';

type PraiseType = 'entrance' | 'listening' | 'comprehensive';

interface PraiseGeneratorProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  /** 共用 ClassStats 而非内联结构：新增字段（registeredCounts）时不必逐个组件改 */
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => ClassStats;
}

const PRAISE_META: Record<PraiseType, { label: string; desc: string }> = {
  entrance: { label: '入门测表扬榜', desc: '成绩前十风云榜' },
  listening: { label: '课后任务表扬榜', desc: '听力打卡前五名' },
  comprehensive: { label: '综合表彰', desc: '风云榜+达人+作业+全勤+稳步前进' },
};

export function PraiseGenerator({
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: PraiseGeneratorProps) {
  const [praiseType, setPraiseType] = useState<PraiseType>('comprehensive');
  // 表彰模板选择：'default' 为默认模板，其余为多模板管理中的自定义模板
  const [templateId, setTemplateId] = useState<string>('default');
  const [praise, setPraise] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const customTemplates = lessonConfig.praiseTemplates || [];
  const activeTemplate = customTemplates.find(t => t.id === templateId);

  const lessonRecords = useMemo(() =>
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() =>
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  const quickStats = useMemo(() => {
    // 口径修正（原来四处都是硬编码字面量，与老师实际的选项文案对不上 → 统计恒为 0）：
    //  · 课后任务：看是否真的录了分，而不是匹配"具体分数"这个特定选项
    //  · 作业超赞：关键词匹配（忽略 emoji 与自定义后缀）
    //  · 按时出勤：走 attendanceKind 语义判定，而不是匹配"按时出勤"这个字面量
    const norm = (v?: string | null) => (v || '').replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
    // 负面关键词：用于把"未完成/请假"这类从正向统计里剔除
    const NEG = /未完成|未交|未做|未带|没带|没做|请假|缺勤|缺席|迟到|补交|不合格|未参与/;
    // 口径再修（2026-10-08）：老师的 课后任务/作业 用的是**定性选项**（很棒哦👏 / 完成✅），
    // 既没有数值分、也没有"超赞"这类文案 —— 之前的判定必然恒为 0。
    // 现在按"是否登记为正向状态"统计，与老师实际填表方式一致。
    const entrance = lessonRecords.filter(r => Number(r.totalScore) > 0).length;
    const listening = lessonRecords.filter(r =>
      Number(r.listeningScore) > 0 || (!!r.listeningStatus && !NEG.test(String(r.listeningStatus)))
    ).length;
    const homework = lessonRecords.filter(r => {
      const v = norm(r.homeworkStatus);
      if (!v || NEG.test(v)) return false;
      return /完成|超赞|超额|优秀|很棒|已交|交齐/.test(v);
    }).length;
    const allPresent = lessonRecords.filter(r => attendanceKind(r.attendance) === 'onTime').length;
    return [
      { label: '可入风云榜', value: entrance },
      { label: '课后任务登记', value: listening },
      { label: '作业完成', value: homework },
      { label: '按时出勤', value: allPresent },
    ];
  }, [lessonRecords]);

  const handleGenerate = () => {
    if (lessonRecords.length === 0) return;
    const generatedPraise = generatePraise(
      lessonNumber,
      lessonRecords,
      lessonConfig,
      stats,
      getNickname,
      praiseType,
      activeTemplate?.template
    );
    setPraise(generatedPraise);
  };

  const handleCopy = async () => {
    if (!praise) return;
    const success = await copyToClipboard(praise);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="ios-glass-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-[color:var(--ink)]">
          <Trophy className="w-5 h-5 text-amber-500" />
          班群公示表彰
          <Badge variant="secondary" className="rounded-full">第{lessonNumber}课</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 表彰数据概览 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {quickStats.map(s => (
            <div key={s.label} className="rounded-xl bg-black/[0.05] px-3.5 py-2.5 text-center">
              <p className="text-xl font-bold" style={{ color: 'var(--brand)' }}>{s.value}</p>
              <p className="text-[11px] text-[color:var(--ink-4)]">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <Select value={praiseType} onValueChange={(value) => setPraiseType(value as PraiseType)}>
            <SelectTrigger className="flex-1 rounded-xl ios-input md:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRAISE_META) as PraiseType[]).map(t => (
                <SelectItem key={t} value={t}>
                  {PRAISE_META[t].label} · {PRAISE_META[t].desc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customTemplates.length > 0 && (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="flex-1 rounded-xl ios-input md:max-w-[180px]">
                <SelectValue placeholder="模板" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认模板</SelectItem>
                {customTemplates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleGenerate}
            disabled={lessonRecords.length === 0}
            className="ios-button gap-2"
          >
            <Sparkles className="w-4 h-4" />
            生成表彰
          </Button>
        </div>

        {lessonRecords.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-4)] py-8 text-center">
            第{lessonNumber}课还没有学情记录，请先到「学情记录」保存
          </p>
        ) : praise ? (
          <>
            <Textarea
              value={praise}
              onChange={(e) => setPraise(e.target.value)}
              className="min-h-[300px] text-sm leading-relaxed ios-input"
            />
            <Button
              onClick={handleCopy}
              variant={copied ? 'outline' : 'default'}
              className={`w-full gap-2 ${copied ? 'rounded-xl border-emerald-300 text-emerald-600' : 'ios-button'}`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  已复制，去班群粘贴吧
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制表彰
                </>
              )}
            </Button>
          </>
        ) : (
          <p className="text-xs text-[color:var(--ink-4)] text-center">
            选择表彰类型后点「生成表彰」，内容基于当前课次数据自动汇总，可编辑后复制
          </p>
        )}
      </CardContent>
    </Card>
  );
}
