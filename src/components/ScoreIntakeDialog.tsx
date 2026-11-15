// 校内成绩「智能录入」：把一段文本（或桌面客户端识别出的图片文字）解析成成绩草稿，
// 匹配到班级学员，人工校正后一次性写入。
//
// 为什么需要它：原来的 Excel 导入写死了 23 列格式，换一份来源就错位；
// 而纸质表格/照片没有结构化数据可用。这里统一成「文本 → 草稿 → 确认」一条通路。
//
// 识别结果永远只是草稿：手写中文的 OCR 准确率不足以直接入库（实测「练弈雅」→「练將産」），
// 所以未匹配的行不会被静默丢弃，而是标红等人工指认。

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, ScanText, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SchoolScore } from '@/types';
import { parseIntake, scoreDedupKey, type ScoreDraft } from '@/lib/scoreIntake';

interface ScoreIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: string[];
  nicknames?: { [studentName: string]: string };
  existingScores: SchoolScore[];
  onSave: (rows: Omit<SchoolScore, 'id'>[]) => void;
  getNickname: (name: string) => string;
  defaultSubject?: string;
}

const todayISO = () => new Date().toISOString().split('T')[0];

export function ScoreIntakeDialog({
  open,
  onOpenChange,
  students,
  nicknames,
  existingScores,
  onSave,
  getNickname,
  defaultSubject = '英语',
}: ScoreIntakeDialogProps) {
  const [examName, setExamName] = useState('校内考试');
  const [date, setDate] = useState(todayISO());
  const [subject, setSubject] = useState(defaultSubject);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<ScoreDraft[] | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  /** 桌面客户端注入了本地 OCR 才显示选图入口；浏览器里没有可用的离线 OCR */
  const desktop = typeof window !== 'undefined'
    ? (window as unknown as { realmDesktop?: { ocr?: (path: string) => Promise<string>; pickImage?: () => Promise<string | null> } }).realmDesktop
    : undefined;
  const canOcr = typeof desktop?.ocr === 'function';

  const ctx = useMemo(() => ({ students, nicknames, examName, date, subject }), [students, nicknames, examName, date, subject]);

  const existingKeys = useMemo(() => new Set(existingScores.map(scoreDedupKey)), [existingScores]);

  const parse = useCallback(() => {
    if (!text.trim()) {
      toast.error('先把要录入的内容粘贴进来');
      return;
    }
    const result = parseIntake(text, ctx);
    if (!result.drafts.length) {
      toast.error('没解析出成绩行，检查一下是否包含姓名与分数');
      return;
    }
    setDrafts(result.drafts);
    toast.success(`已解析 ${result.drafts.length} 条${result.mode === 'sheet' ? '（识别为单张调研表）' : ''}`);
  }, [text, ctx]);

  const pickImage = useCallback(async () => {
    if (!canOcr || !desktop) return;
    setOcrBusy(true);
    try {
      const path = await desktop.pickImage?.();
      if (!path) return;
      const recognized = await desktop.ocr!(path);
      setText(prev => (prev.trim() ? `${prev}\n${recognized}` : recognized));
      toast.success('图片已识别，内容已填入下方文本框，请核对后解析');
    } catch (e) {
      toast.error(`识别失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcrBusy(false);
    }
  }, [canOcr, desktop]);

  const updateDraft = (index: number, patch: Partial<ScoreDraft>) => {
    setDrafts(prev => (prev ? prev.map((d, i) => (i === index ? { ...d, ...patch } : d)) : prev));
  };

  const removeDraft = (index: number) => {
    setDrafts(prev => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const stats = useMemo(() => {
    const list = drafts || [];
    const matched = list.filter(d => d.studentName);
    const dup = matched.filter(d => existingKeys.has(
      scoreDedupKey({ studentName: d.studentName, examName, date, score: d.score, totalScore: d.totalScore }),
    ));
    return { total: list.length, matched: matched.length, unmatched: list.length - matched.length, dup: dup.length };
  }, [drafts, existingKeys, examName, date]);

  const save = () => {
    const list = drafts || [];
    const usable = list.filter(d => d.studentName && d.score > 0);
    if (!usable.length) {
      toast.error('没有可写入的行：至少要有学员和得分');
      return;
    }
    const rows = usable
      .filter(d => !existingKeys.has(scoreDedupKey({ studentName: d.studentName, examName, date, score: d.score, totalScore: d.totalScore })))
      .map(d => ({
        studentName: d.studentName,
        examName,
        date,
        score: d.score,
        totalScore: d.totalScore,
        classRank: d.classRank,
        classSize: d.classSize,
        school: d.school || undefined,
        subject: d.subject || subject,
        note: d.note,
        isRecorded: true,
        isImproved: false,
      }));
    if (!rows.length) {
      toast.error('这些成绩都已经录过了（同学生、同考试、同分数）');
      return;
    }
    onSave(rows);
    toast.success(`已写入 ${rows.length} 条成绩`);
    setDrafts(null);
    setText('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText className="w-5 h-5 text-[color:var(--brand)]" />
            智能录入校内成绩
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs text-[color:var(--ink-4)]">考试名称</span>
              <Input className="rounded-xl ios-input" value={examName} onChange={e => setExamName(e.target.value)} placeholder="如期中考试" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-[color:var(--ink-4)]">考试日期</span>
              <Input className="rounded-xl ios-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-[color:var(--ink-4)]">科目</span>
              <Input className="rounded-xl ios-input" value={subject} onChange={e => setSubject(e.target.value)} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[color:var(--ink-4)]">
                粘贴表格文本（每行一个学生，支持「姓名 学校 满分 得分 班排」或「张三 126/150」）
              </span>
              <div className="flex gap-2">
                {canOcr && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={pickImage} disabled={ocrBusy}>
                    {ocrBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    选图识别
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { setText(''); setDrafts(null); }}>
                  <Trash2 className="w-3.5 h-3.5" />清空
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-[130px] w-full resize-y rounded-xl border border-black/10 bg-white p-3 font-mono text-[13px] leading-relaxed text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]"
              placeholder={'陈志佳\t四中\t150\t126\t5\n陈梓铭\t七中\t150\t118\t12\n\n或单张调研表：\n学员姓名：胡怡萱  在读学校：四中逸园\n满分：150 得分：138 班排：3'}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={parse}>
                <Wand2 className="w-3.5 h-3.5" />解析
              </Button>
              {!canOcr && (
                <p className="text-[11px] leading-relaxed text-[color:var(--ink-4)]">
                  浏览器里没有离线 OCR：请从手机/微信把表格照片转成文字后粘贴；桌面客户端可直接选图识别。
                </p>
              )}
            </div>
          </div>

          {drafts && drafts.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">共 {stats.total} 条</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已匹配 {stats.matched}</Badge>
                {stats.unmatched > 0 && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">待指认 {stats.unmatched}</Badge>}
                {stats.dup > 0 && <Badge variant="outline">重复 {stats.dup}</Badge>}
                <span className="text-[color:var(--ink-4)]">未匹配的行请下拉指定学员，或删掉它</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-black/5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[24%]">学员</TableHead>
                      <TableHead className="w-[18%]">学校</TableHead>
                      <TableHead className="w-[14%]">得分</TableHead>
                      <TableHead className="w-[14%]">满分</TableHead>
                      <TableHead className="w-[14%]">班排</TableHead>
                      <TableHead className="w-[8%] text-center">状态</TableHead>
                      <TableHead className="w-[6%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((draft, index) => {
                      const isDup = !!draft.studentName && existingKeys.has(scoreDedupKey({
                        studentName: draft.studentName, examName, date, score: draft.score, totalScore: draft.totalScore,
                      }));
                      return (
                        <TableRow key={index} className={draft.studentName ? '' : 'bg-rose-50/50'}>
                          <TableCell>
                            <Select
                              value={draft.studentName || '__none__'}
                              onValueChange={(v) => updateDraft(index, { studentName: v === '__none__' ? '' : v, confidence: 1 })}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue placeholder="指定学员" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">（未匹配）</SelectItem>
                                {students.map(s => (
                                  <SelectItem key={s} value={s}>{getNickname(s)}（{s}）</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!draft.studentName && draft.raw && (
                              <p className="mt-1 truncate text-[10px] text-[color:var(--ink-4)]" title={draft.raw}>
                                识别为「{draft.raw.slice(0, 18)}」
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs" value={draft.school || ''}
                              onChange={e => updateDraft(index, { school: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-16 text-xs" type="number" value={draft.score}
                              onChange={e => updateDraft(index, { score: Number(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-16 text-xs" type="number" value={draft.totalScore}
                              onChange={e => updateDraft(index, { totalScore: Number(e.target.value) || 100 })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-16 text-xs" type="number" value={draft.classRank ?? ''}
                              placeholder="—"
                              onChange={e => updateDraft(index, { classRank: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </TableCell>
                          <TableCell>
                            {isDup
                              ? <span className="text-[11px] text-amber-600">重复</span>
                              : draft.studentName
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                : <AlertCircle className="w-4 h-4 text-rose-500" />}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDraft(index)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setDrafts(null); }}>返回修改文本</Button>
                <Button size="sm" onClick={save} disabled={stats.matched === 0}>
                  写入 {Math.max(0, stats.matched - stats.dup)} 条
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
