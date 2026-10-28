// 季度成绩单：按季度聚合学情记录，生成可编辑、可导出的成绩单卡片。
// 设计取向参考家长熟悉的纸质成绩单：细线、居中排版、一个红色印章式点缀，
// 但颜色与字体跟随站点（brand 色 / Outfit + 衬线标题），不另起一套视觉。

import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Plus, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import type { StudentRecord } from '@/types';
import {
  DEFAULT_QUARTERLY_TEMPLATE,
  computeQuarterlyStats,
  humanizeEmptyOral,
  isOralQuestionTypeName,
  listQuarters,
  quarterlyVariables,
  renderQuarterlyTemplate,
} from '@/lib/quarterlyStats';
import html2canvas from 'html2canvas';

const TEMPLATE_KEY = 'xqQuarterlyTemplate';

interface ExtraParam { key: string; value: string }

interface StoredTemplate { template: string; teacher: string; extra: ExtraParam[] }

function loadStored(): StoredTemplate {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTemplate>;
      return {
        template: typeof parsed.template === 'string' && parsed.template.trim() ? parsed.template : DEFAULT_QUARTERLY_TEMPLATE,
        teacher: typeof parsed.teacher === 'string' && parsed.teacher.trim() ? parsed.teacher : 'Lynn',
        extra: Array.isArray(parsed.extra) ? parsed.extra.filter(x => x && typeof x.key === 'string') : [{ key: 'trait', value: '努力' }],
      };
    }
  } catch { /* ignore */ }
  return { template: DEFAULT_QUARTERLY_TEMPLATE, teacher: 'Lynn', extra: [{ key: 'trait', value: '努力' }] };
}

/** 把【】里的数字/关键词高亮，其余保持正文字色 */
function Line({ text }: { text: string }) {
  const parts = text.split(/(【[^】]*】)/g);
  return (
    <>
      {parts.map((part, i) => part.startsWith('【') && part.endsWith('】')
        ? <span key={i} className="qr-token">{part.slice(1, -1)}</span>
        : <span key={i}>{part}</span>)}
    </>
  );
}

export function QuarterlyReportPanel({
  students,
  records,
  currentClassName,
  getNickname = (name: string) => name,
  getQuestionTypes,
}: {
  students: string[];
  records: StudentRecord[];
  currentClassName: string;
  getNickname?: (name: string) => string;
  /** 按课次取题型定义：用于把「口语得分」这类题型识别为口语来源 */
  getQuestionTypes?: (lesson: number) => { id: string; name: string }[];
}) {
  const stored = useMemo(loadStored, []);
  const quarters = useMemo(() => listQuarters(records), [records]);
  const [quarterKey, setQuarterKey] = useState(quarters[0]?.key ?? '');
  const [student, setStudent] = useState(students[0] ?? '');
  const [teacher, setTeacher] = useState(stored.teacher);
  const [template, setTemplate] = useState(stored.template);
  const [extra, setExtra] = useState<ExtraParam[]>(stored.extra);
  const [exporting, setExporting] = useState(false);
  const [openEditor, setOpenEditor] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const quarter = quarters.find(q => q.key === quarterKey) ?? quarters[0];

  // 口语题型 id 集合：题型配置按课次各存一份，同名题型 id 不同，必须逐课收集。
  // 真实数据里口语是一道独立题型（名称「口语得分」），不是「课后任务」那个分数栏。
  const oralTypeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!getQuestionTypes) return ids;
    const lessons = new Set(records.map(r => r.lessonNumber));
    lessons.forEach(lesson => {
      (getQuestionTypes(lesson) || []).forEach(qt => {
        if (isOralQuestionTypeName(qt.name)) ids.add(qt.id);
      });
    });
    return ids;
  }, [records, getQuestionTypes]);

  const stats = useMemo(() => {
    if (!quarter || !student) return null;
    return computeQuarterlyStats(records, students, student, quarter, currentClassName, teacher, oralTypeIds);
  }, [records, students, student, quarter, currentClassName, teacher, oralTypeIds]);

  // 本季度没口语分、但别的季度有时，给一条提示，避免被读成"漏统计"。
  // （真实数据里口语是独立题型，某些季度整班都没登记，属数据事实而非缺陷）
  const oralHints = useMemo(() => {
    if (!stats || stats.oralCount > 0 || !quarter) return [] as string[];
    return quarters
      .filter(q => q.key !== quarter.key)
      .filter(q => computeQuarterlyStats(records, students, student, q, currentClassName, teacher, oralTypeIds).oralCount > 0)
      .map(q => `第 ${q.quarter} 季度`);
  }, [stats, quarter, quarters, records, students, student, currentClassName, teacher, oralTypeIds]);

  const extraMap = useMemo(() => Object.fromEntries(extra.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value])), [extra]);
  const vars = stats ? quarterlyVariables(stats, extraMap) : {};
  const text = humanizeEmptyOral(renderQuarterlyTemplate(template, vars));
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  const persist = useCallback((next: Partial<StoredTemplate>) => {
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify({
        template: next.template ?? template,
        teacher: next.teacher ?? teacher,
        extra: next.extra ?? extra,
      }));
    } catch { /* ignore */ }
  }, [template, teacher, extra]);

  const resetTemplate = () => {
    setTemplate(DEFAULT_QUARTERLY_TEMPLATE);
    setExtra([{ key: 'trait', value: '努力' }]);
    persist({ template: DEFAULT_QUARTERLY_TEMPLATE, extra: [{ key: 'trait', value: '努力' }] });
  };

  const exportImage = async () => {
    if (!cardRef.current || !stats) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${getNickname(student)}_${stats.year}Q${quarter?.quarter ?? ''}_季度成绩单.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  };

  if (quarters.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-14 text-center text-sm text-[color:var(--ink-4)]">
          还没有带日期的学情记录。先在「学情记录」里补齐上课日期，这里就能按季度生成成绩单。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm" data-html2canvas-ignore="true">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base text-[color:var(--ink)]">
            <FileText className="w-4 h-4 text-[color:var(--brand)]" />
            季度成绩单
            <Badge variant="secondary" className="font-normal">按季度聚合 · 可改模板</Badge>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setOpenEditor(v => !v)}>
                <Settings2 className="w-4 h-4" />{openEditor ? '收起模板' : '编辑模板'}
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={exportImage} disabled={exporting || !stats}>
                <Download className="w-4 h-4" />{exporting ? '生成中…' : '导出图片'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--ink-4)]">季度</span>
              <Select value={quarterKey} onValueChange={setQuarterKey}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {quarters.map(q => <SelectItem key={q.key} value={q.key}>{q.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--ink-4)]">学生</span>
              <Select value={student} onValueChange={setStudent}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {students.map(name => <SelectItem key={name} value={name}>{getNickname(name)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--ink-4)]">老师署名</span>
              <Input className="h-9" value={teacher} onChange={e => { setTeacher(e.target.value); persist({ teacher: e.target.value }); }} />
            </label>
            <div className="space-y-1">
              <span className="text-xs text-[color:var(--ink-4)]">本季度有效测评</span>
              <div className="flex h-9 items-center gap-2 rounded-md border border-black/5 bg-black/[0.02] px-3 text-sm text-[color:var(--ink-2)]">
                <strong className="tnum">{stats?.lessons ?? 0}</strong> 课 · <strong className="tnum">{stats?.assessed ?? 0}</strong> 次
              </div>
            </div>
          </div>

          {openEditor && (
            <div className="rounded-xl border border-black/5 bg-black/[0.02] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[color:var(--ink-3)]">模板占位符：{'{student} {class} {year} {entryAvg} {entryRate} {rank} {beatPct} {hwDone} {hwRate} {oralAvg} {oralBeat} {trait}'}</span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetTemplate}>
                  <RotateCcw className="w-3.5 h-3.5" />恢复默认
                </Button>
              </div>
              <textarea
                className="min-h-[150px] w-full resize-y rounded-lg border border-black/10 bg-white p-3 text-sm leading-relaxed text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]"
                value={template}
                onChange={e => { setTemplate(e.target.value); persist({ template: e.target.value }); }}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[color:var(--ink-3)]">自选参数（在模板里用 {'{key}'} 引用）</span>
                  <Button
                    variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                    onClick={() => setExtra(prev => { const next = [...prev, { key: '', value: '' }]; persist({ extra: next }); return next; })}
                  >
                    <Plus className="w-3.5 h-3.5" />添加
                  </Button>
                </div>
                {extra.map((pair, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      className="h-8 w-40" placeholder="参数名，如 trait" value={pair.key}
                      onChange={e => {
                        const next = extra.map((p, i) => i === index ? { ...p, key: e.target.value } : p);
                        setExtra(next); persist({ extra: next });
                      }}
                    />
                    <Input
                      className="h-8 flex-1" placeholder="参数值" value={pair.value}
                      onChange={e => {
                        const next = extra.map((p, i) => i === index ? { ...p, value: e.target.value } : p);
                        setExtra(next); persist({ extra: next });
                      }}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-[color:var(--ink-4)]"
                      onClick={() => { const next = extra.filter((_, i) => i !== index); setExtra(next); persist({ extra: next }); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <div className="qr-stage">
          <div className="qr-card" ref={cardRef}>
            <span className="qr-frame" aria-hidden="true" />
            <span className="qr-corner qr-corner-tl" aria-hidden="true" />
            <span className="qr-corner qr-corner-tr" aria-hidden="true" />
            <span className="qr-corner qr-corner-bl" aria-hidden="true" />
            <span className="qr-corner qr-corner-br" aria-hidden="true" />

            <div className="qr-head">
              <span className="qr-head-line" />
              <span className="qr-head-text">Lynn&apos;s Realm · 学情成长记录</span>
              <span className="qr-head-line" />
            </div>

            <div className="qr-title">
              <span className="qr-diamond" aria-hidden="true" />
              <h2>季度成绩单</h2>
              <span className="qr-diamond" aria-hidden="true" />
            </div>
            <p className="qr-title-en">QUARTERLY REPORT</p>

            <div className="qr-hero">
              <p className="qr-hero-name">{getNickname(student)}</p>
              <p className="qr-hero-sub">
                {stats.year} 年 · 第 {quarter?.quarter ?? ''} 季度 · {stats.className}
              </p>
            </div>

            <div className="qr-metrics">
              <div className="qr-metric">
                <span className="qr-metric-label">入门测均分</span>
                <strong className="qr-metric-value">{stats.entryAvg}</strong>
                <span className="qr-metric-note">得分率 {stats.entryRate}%</span>
              </div>
              <div className="qr-metric">
                <span className="qr-metric-label">班级排名</span>
                <strong className="qr-metric-value">
                  {stats.rank > 0 ? <>第 {stats.rank}<em>名</em></> : '—'}
                </strong>
                <span className="qr-metric-note">击败 {stats.beatPct}% 同学</span>
              </div>
              <div className="qr-metric">
                <span className="qr-metric-label">作业完成</span>
                <strong className="qr-metric-value">{stats.hwDone}<em>个</em></strong>
                <span className="qr-metric-note">完成率 {stats.hwRate}%</span>
              </div>
              <div className="qr-metric">
                <span className="qr-metric-label">口语均分</span>
                <strong className="qr-metric-value">
                  {stats.oralCount > 0 ? stats.oralAvg : '—'}
                </strong>
                <span className="qr-metric-note">
                  {stats.oralCount > 0 ? `击败 ${stats.oralBeat}% 同学` : '本季度未登记'}
                </span>
              </div>
            </div>

            <div className="qr-quote">
              <span className="qr-quote-label">老师寄语</span>
              <div className="qr-body">
                {lines.map((line, index) => <p key={index}><Line text={line} /></p>)}
              </div>
            </div>

            <div className="qr-foot">
              <div className="qr-seal" aria-hidden="true">
                <span className="qr-seal-top">LYNN</span>
                <em className="qr-seal-mid">★</em>
                <span className="qr-seal-bottom">认证</span>
              </div>
              <div className="qr-sign-wrap">
                <p className="qr-sign">—— {teacher}</p>
                <p className="qr-date">{stats.year} 年 · 第 {quarter?.quarter ?? ''} 季度</p>
              </div>
            </div>
          </div>
          {oralHints.length > 0 && (
            <p className="qr-hint" data-html2canvas-ignore="true">
              本季度没有口语记录；该生的口语得分在{oralHints.join('、')}，切换季度即可看到。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
