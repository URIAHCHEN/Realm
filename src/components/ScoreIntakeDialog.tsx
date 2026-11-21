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
import { ImagePlus, Loader2, ScanText, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SchoolScore } from '@/types';
import { parseIntake, schoolScoreDate, schoolScoreIssue, scoreDedupKey, type ScoreDraft } from '@/lib/scoreIntake';

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
  const [date, setDate] = useState(schoolScoreDate);
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
      setDrafts(null);
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

  const seenKeys = new Set(existingKeys);
  const reviewedRows = (drafts || []).map(draft => {
    const row: Omit<SchoolScore, 'id'> = {
      studentName: draft.studentName,
      examName: examName.trim(),
      date,
      score: draft.score,
      totalScore: draft.totalScore,
      classRank: draft.classRank,
      classSize: draft.classSize,
      school: draft.school?.trim() || undefined,
      subject: draft.subject?.trim() || subject.trim() || undefined,
      note: draft.note,
      isRecorded: true,
      isImproved: false,
    };
    const issue = !students.includes(row.studentName) ? '请指定学员' : draft.problem || schoolScoreIssue(row);
    const key = scoreDedupKey(row);
    const duplicate = !issue && seenKeys.has(key);
    if (!issue) seenKeys.add(key);
    return { row, issue, duplicate };
  });
  const readyRows = reviewedRows.filter(item => !item.issue && !item.duplicate);
  const issueCount = reviewedRows.filter(item => item.issue).length;
  const duplicateCount = reviewedRows.filter(item => item.duplicate).length;
  const canSave = !!examName.trim() && !!date && issueCount === 0 && readyRows.length > 0 && !ocrBusy;

  const save = () => {
    if (!canSave) return;
    onSave(readyRows.map(item => item.row));
    toast.success(`已写入 ${readyRows.length} 条成绩`);
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
              aria-label="成绩原文"
              onChange={e => { setText(e.target.value); setDrafts(null); }}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={parse} disabled={ocrBusy}>
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
                <Badge variant="secondary">共 {reviewedRows.length} 条</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">可写入 {readyRows.length}</Badge>
                {issueCount > 0 && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">待核对 {issueCount}</Badge>}
                {duplicateCount > 0 && <Badge variant="outline">重复 {duplicateCount}</Badge>}
                <span className="text-[color:var(--ink-4)]">修正或移除待核对的行。重复成绩会跳过。</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-black/5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[24%]">学员</TableHead>
                      <TableHead className="w-[18%]">学校</TableHead>
                      <TableHead className="w-[14%]">得分</TableHead>
                      <TableHead className="w-[14%]">满分</TableHead>
                      <TableHead>班排</TableHead>
                      <TableHead>班级人数</TableHead>
                      <TableHead>科目</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="w-[6%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((draft, index) => {
                      const { issue, duplicate } = reviewedRows[index];
                      return (
                        <TableRow key={index} className={issue ? 'bg-rose-50/50' : ''}>
                          <TableCell>
                            <Select
                              value={draft.studentName || '__none__'}
                              onValueChange={(v) => updateDraft(index, { studentName: v === '__none__' ? '' : v, confidence: 1 })}
                            >
                              <SelectTrigger className="h-8 w-full min-w-24 text-xs" aria-label={`第 ${index + 1} 行学员`}>
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
                              className="h-8 w-16 text-xs" type="number" value={draft.problem ? '' : draft.score} min={0} max={draft.totalScore} step="any"
                              aria-label={`第 ${index + 1} 行得分`}
                              onChange={e => {
                                const score = e.target.valueAsNumber;
                                updateDraft(index, { score: Number.isFinite(score) ? score : 0, problem: Number.isFinite(score) ? undefined : '请填写得分' });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-16 text-xs" type="number" value={draft.totalScore} min={0} step="any"
                              aria-label={`第 ${index + 1} 行满分`}
                              onChange={e => updateDraft(index, { totalScore: Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-16 text-xs" type="number" value={draft.classRank ?? ''} min={1} step={1}
                              aria-label={`第 ${index + 1} 行班排`}
                              placeholder="—"
                              onChange={e => updateDraft(index, { classRank: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input className="h-8 w-16 text-xs" type="number" value={draft.classSize ?? ''} min={1} step={1}
                              aria-label={`第 ${index + 1} 行班级人数`} placeholder="—"
                              onChange={e => updateDraft(index, { classSize: e.target.value ? Number(e.target.value) : undefined })} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-8 w-16 text-xs" value={draft.subject || ''}
                              aria-label={`第 ${index + 1} 行科目`} placeholder={subject || '—'}
                              onChange={e => updateDraft(index, { subject: e.target.value })} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {issue ? <span className="whitespace-normal text-rose-700">{issue}</span>
                              : duplicate ? <span className="text-amber-700">重复</span>
                              : <span className="text-emerald-700">可写入</span>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDraft(index)} aria-label={`移除第 ${index + 1} 行`}>
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
                <Button size="sm" onClick={save} disabled={!canSave}>
                  写入 {readyRows.length} 条
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
