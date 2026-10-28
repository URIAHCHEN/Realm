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
}: {
  students: string[];
  records: StudentRecord[];
  currentClassName: string;
  getNickname?: (name: string) => string;
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
  const stats = useMemo(() => {
    if (!quarter || !student) return null;
    return computeQuarterlyStats(records, students, student, quarter, currentClassName, teacher);
  }, [records, students, student, quarter, currentClassName, teacher]);

  const extraMap = useMemo(() => Object.fromEntries(extra.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value])), [extra]);
  const vars = stats ? quarterlyVariables(stats, extraMap) : {};
  const text = renderQuarterlyTemplate(template, vars);
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
            <div className="qr-top">{teacher} 的季度成绩单</div>
            <div className="qr-stamp" aria-hidden="true">
              <span>I</span><i>❤</i><span>ENGLISH</span>
            </div>
            <div className="qr-title">
              <span className="qr-rule" />
              <h2>《季度成绩单》</h2>
              <span className="qr-rule" />
            </div>
            <div className="qr-body">
              {lines.map((line, index) => <p key={index}><Line text={line} /></p>)}
            </div>
            <div className="qr-sign">—— by {teacher}</div>
          </div>
        </div>
      )}
    </div>
  );
}
