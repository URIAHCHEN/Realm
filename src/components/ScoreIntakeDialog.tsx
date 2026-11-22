import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FileSpreadsheet, ImagePlus, Loader2, ScanText, Trash2, Upload, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SchoolScore } from '@/types';
import {
  draftToSchoolScore, matchSchoolScoreRosters, parseIntake, parseSchoolScoreWorkbook, sameSchoolScoreEntry,
  schoolScoreDate, schoolScoreIssue, scoreDedupKey,
  type ScoreDraft, type SchoolScoreRoster, type SchoolScoreTarget,
} from '@/lib/scoreIntake';
import './ScoreIntakeDialog.css';

interface ScoreIntakeDialogProps {
  mode: 'text' | 'excel';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: string[];
  currentClassId?: string;
  rosters: SchoolScoreRoster[];
  nicknames?: Record<string, string>;
  schoolScores: Record<string, SchoolScore[]>;
  onSave: (rows: Omit<SchoolScore, 'id'>[]) => void;
  getNickname: (name: string, classId?: string) => string;
}

interface IntakeRow {
  id: number;
  draft: ScoreDraft;
  target?: SchoolScoreTarget;
  candidates?: SchoolScoreTarget[];
  reason?: string;
}

const targetKey = ({ classId, studentName }: SchoolScoreTarget) => JSON.stringify([classId, studentName]);
function parseTarget(value: string): SchoolScoreTarget | undefined {
  if (!value) return;
  const [classId, studentName] = JSON.parse(value) as [string, string];
  return { classId, studentName };
}
const rosterLabel = (roster: SchoolScoreRoster) => [roster.name, roster.batchCode, roster.term].filter(Boolean).join(' · ');
const rankText = (rank?: number, size?: number) => rank === undefined ? '—' : size ? `${rank}/${size}` : String(rank);
const scoreFields = [
  ['score', '得分'], ['totalScore', '满分'], ['classRank', '班排'], ['classSize', '班级人数'],
  ['gradeRank', '级排'], ['gradeSize', '年级人数'],
] as const;
const allClasses = '__all__';
const needsMatch = '__unmatched__';

export function ScoreIntakeDialog({
  mode, open, onOpenChange, students, currentClassId, rosters, nicknames, schoolScores, onSave, getNickname,
}: ScoreIntakeDialogProps) {
  const isExcel = mode === 'excel';
  const [examName, setExamName] = useState(isExcel ? '' : '校内考试');
  const [date, setDate] = useState(() => isExcel ? '' : schoolScoreDate());
  const [subject, setSubject] = useState('英语');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [editing, setEditing] = useState<number>();
  const [filter, setFilter] = useState(allClasses);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [workbook, setWorkbook] = useState<{ name: string; sheet: string }>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const desktop = (window as Window & {
    realmDesktop?: { ocr?: (path: string) => Promise<string>; pickImage?: () => Promise<string | null> };
  }).realmDesktop;
  const canOcr = typeof desktop?.ocr === 'function';
  const eligibleRosters = useMemo(() => isExcel ? rosters : rosters.filter(roster => roster.id === currentClassId), [isExcel, rosters, currentClassId]);
  const ctx = { students, nicknames, examName, date, subject };

  const resetPreview = () => {
    setRows(null);
    setEditing(undefined);
    setFilter(allClasses);
    setReviewOnly(false);
  };

  const parseText = () => {
    const { drafts } = parseIntake(text, ctx);
    if (!drafts.length) {
      toast.error('没解析出成绩行，请检查姓名和得分');
      return;
    }
    resetPreview();
    setRows(drafts.map((draft, id) => ({
      id, draft,
      target: currentClassId && draft.studentName ? { classId: currentClassId, studentName: draft.studentName } : undefined,
    })));
  };

  const loadWorkbook = async (file: File) => {
    setBusy(true);
    setWorkbook(undefined);
    resetPreview();
    try {
      // Excel 的归班以完整名册为准，解析阶段只需保留源姓名和字段。
      const { sheet, drafts } = await parseSchoolScoreWorkbook(file, { ...ctx, students: [] });
      const matches = matchSchoolScoreRosters(drafts, eligibleRosters);
      setWorkbook({ name: file.name, sheet });
      setRows(drafts.map((draft, id) => ({ id, draft, ...matches[id] })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async () => {
    if (!desktop?.ocr || !desktop.pickImage) return;
    setBusy(true);
    try {
      const path = await desktop.pickImage();
      if (!path) return;
      const recognized = await desktop.ocr(path);
      setText(previous => previous.trim() ? `${previous}\n${recognized}` : recognized);
      resetPreview();
    } catch (error) {
      toast.error(`识别失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (id: number, change: (row: IntakeRow) => IntakeRow) => {
    setRows(current => current?.map(row => row.id === id ? change(row) : row) ?? null);
  };
  const updateDraft = (id: number, patch: Partial<ScoreDraft>) => {
    updateRow(id, row => ({ ...row, draft: { ...row.draft, ...patch } }));
  };

  const planned = new Map<string, Omit<SchoolScore, 'id'>[]>();
  const reviewed = (rows || []).map(item => {
    const { draft, target } = item;
    const roster = eligibleRosters.find(entry => entry.id === target?.classId);
    const active = target && roster?.students.includes(target.studentName) ? target : undefined;
    const row = { ...draftToSchoolScore(draft, ctx), studentName: active?.studentName || '', classId: active?.classId };
    const issue = active ? draft.problem || schoolScoreIssue(row) : item.reason || '请指定学员';
    const qualified = planned.get(row.studentName) || [];
    const related = [...(schoolScores[row.studentName] || []), ...qualified].filter(existing => sameSchoolScoreEntry(existing, row));
    const duplicate = !issue && related.some(existing => scoreDedupKey(existing) === scoreDedupKey(row));
    const conflict = !issue && !duplicate && related.length > 0;
    if (!issue && !duplicate && !conflict) planned.set(row.studentName, [...qualified, row]);
    return { ...item, row, active, issue, duplicate, conflict };
  });
  const ready = Array.from(planned.values()).flat();
  const readyClasses = new Set(ready.map(row => row.classId)).size;
  const issueCount = reviewed.filter(item => item.issue).length;
  const existingCount = reviewed.filter(item => item.duplicate || item.conflict).length;
  const canSave = !!examName.trim() && !!date && !!ready.length && !busy && (isExcel || issueCount === 0);
  const groups = new Map<string, typeof reviewed>();
  for (const row of reviewed) {
    const key = row.active?.classId || needsMatch;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const activeFilter = groups.has(filter) ? filter : allClasses;
  const visibleGroups = Array.from(groups).filter(([key]) => activeFilter === allClasses || key === activeFilter)
    .sort(([a], [b]) => Number(a === needsMatch) - Number(b === needsMatch));

  const save = () => {
    if (!canSave) return;
    onSave(ready);
    toast.success(isExcel ? `已写入 ${readyClasses} 个班级，共 ${ready.length} 条成绩` : `已写入 ${ready.length} 条成绩`);
    resetPreview();
    setWorkbook(undefined);
    setText('');
    onOpenChange(false);
  };

  const Icon = isExcel ? FileSpreadsheet : ScanText;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="score-intake-dialog">
        <header className="score-intake-heading">
          <span className="learning-workspace-mark"><Icon size={20} aria-hidden="true" /></span>
          <div>
            <DialogTitle>{isExcel ? '导入 Excel 校内成绩' : '智能录入校内成绩'}</DialogTitle>
            <DialogDescription>{isExcel ? '一次上传，匹配全部班级的在读学员' : '按当前班级名单核对粘贴或识别的成绩'}</DialogDescription>
          </div>
        </header>

        <div className="score-intake-body">
          <div className="score-intake-exam">
            <label>考试名称<Input value={examName} onChange={e => setExamName(e.target.value)} placeholder="如 26 秋期中考试" required /></label>
            <label>考试日期<Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
            <label>科目<Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="英语" /></label>
          </div>

          {isExcel ? (
            <div className="score-intake-file">
              <span className="score-intake-file-icon"><Upload size={18} aria-hidden="true" /></span>
              <div className="score-intake-file-info">
                <strong>{workbook?.name || '上传成绩工作簿'}</strong>
                <p role="status">{busy ? '正在读取工作簿…' : workbook ? `工作表「${workbook.sheet}」` : '支持 .xlsx、.xls，优先读取「全量明细」'}</p>
              </div>
              <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="成绩 Excel 文件"
                accept=".xlsx,.xls" disabled={busy} onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void loadWorkbook(file);
                }} />
              <Button variant={workbook ? 'outline' : 'default'} size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {workbook ? '更换文件' : '选择文件'}
              </Button>
            </div>
          ) : (
            <div className="score-intake-text">
              <textarea aria-label="成绩原文" rows={5} value={text} placeholder={'姓名\t得分\t满分\t班排\t级排\n示例学员\t126.5\t150\t3/45\t9/120'}
                onChange={event => { setText(event.target.value); resetPreview(); }} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={parseText} disabled={busy || !text.trim()}><Wand2 size={15} aria-hidden="true" />解析</Button>
                {canOcr && <Button variant="outline" size="sm" onClick={pickImage} disabled={busy}><ImagePlus size={15} aria-hidden="true" />选图识别</Button>}
                {text && <Button variant="ghost" size="sm" onClick={() => { setText(''); resetPreview(); }}>清空</Button>}
              </div>
            </div>
          )}

          {rows && (
            <section aria-label="匹配预览" className="score-intake-preview">
              <div className="score-intake-summary">
                <div>
                  <h3>匹配预览</h3>
                  <p>共 {reviewed.length} 条 · {readyClasses} 个班级可写入</p>
                </div>
                <div className="score-intake-counts" aria-live="polite">
                  <span data-tone="ready">可写入 {ready.length}</span>
                  {issueCount > 0 && <span data-tone="review">待核对 {issueCount}</span>}
                  {existingCount > 0 && <span>已有记录 {existingCount}</span>}
                </div>
              </div>

              {isExcel && reviewed.length > 0 && (
                <div className="score-intake-filters">
                  <select aria-label="筛选预览班级" value={activeFilter} onChange={e => setFilter(e.target.value)}>
                    <option value={allClasses}>全部班级</option>
                    {eligibleRosters.filter(roster => groups.has(roster.id)).map(roster => (
                      <option key={roster.id} value={roster.id}>{rosterLabel(roster)}（{groups.get(roster.id)?.length}）</option>
                    ))}
                    {groups.has(needsMatch) && <option value={needsMatch}>未归班（{groups.get(needsMatch)?.length}）</option>}
                  </select>
                  <Button variant="outline" size="sm" aria-pressed={reviewOnly} onClick={() => setReviewOnly(value => !value)}>仅看待核对</Button>
                </div>
              )}

              {visibleGroups.map(([key, group]) => {
                const visible = reviewOnly ? group.filter(item => item.issue) : group;
                if (!visible.length) return null;
                const roster = eligibleRosters.find(item => item.id === key);
                return (
                  <section key={key} className="score-intake-group">
                    <h4>{roster?.name || '待确认学员'}<span>{[roster?.batchCode, roster?.term, `${visible.length} 条`].filter(Boolean).join(' · ')}</span></h4>
                    {visible.map(({ id, draft, row, active, issue, duplicate, conflict, candidates }) => {
                      const name = active ? getNickname(active.studentName, active.classId) : draft.sourceName || '未识别姓名';
                      const status = issue || (duplicate ? '重复记录' : conflict ? '同场已有成绩' : '可写入');
                      const expanded = editing === id;
                      return (
                        <div key={id} className="score-intake-record">
                          <div className="score-intake-record-grid">
                            <div className="score-intake-person">
                              <strong>{name}</strong>
                              <span>{[active && name !== active.studentName ? active.studentName : undefined, row.school].filter(Boolean).join(' · ')}</span>
                            </div>
                            <div><small>得分</small><b>{draft.problem ? '—' : `${row.score}/${row.totalScore || '—'}`}</b></div>
                            <div><small>班排</small><b>{rankText(row.classRank, row.classSize)}</b></div>
                            <div><small>级排</small><b>{rankText(row.gradeRank, row.gradeSize)}</b></div>
                            <span className="score-intake-status" data-tone={issue ? 'review' : duplicate || conflict ? 'existing' : 'ready'}>{status}</span>
                            <Button variant="ghost" size="sm" className="score-intake-edit" aria-expanded={expanded} aria-label={`编辑 ${name}`}
                              onClick={() => setEditing(expanded ? undefined : id)}>{expanded ? '收起' : '编辑'}</Button>
                          </div>
                          {expanded && (
                            <div className="score-intake-editor">
                              {candidates && candidates.length > 1 && !active && <p>同名候选班级：{candidates.map(candidate => eligibleRosters.find(item => item.id === candidate.classId)?.name).join('、')}</p>}
                              <div className="score-intake-editor-grid">
                                <label className="score-intake-editor-student">匹配学员
                                  <select value={active ? targetKey(active) : ''} onChange={event => {
                                    const target = parseTarget(event.target.value);
                                    updateRow(id, item => ({ ...item, target, reason: target ? undefined : '请指定学员' }));
                                    // 手动归班后仍展示被编辑的行。
                                    if (filter !== allClasses && filter !== target?.classId) setFilter(allClasses);
                                  }}>
                                    <option value="">请选择学员</option>
                                    {eligibleRosters.map(roster => (
                                      <optgroup key={roster.id} label={rosterLabel(roster)}>
                                        {Array.from(new Set(roster.students)).map(student => (
                                          <option key={student} value={targetKey({ classId: roster.id, studentName: student })}>{student}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                </label>
                                <label className="score-intake-editor-school">就读学校<Input value={draft.school || ''} onChange={event => updateDraft(id, { school: event.target.value })} /></label>
                                {scoreFields.map(([field, label]) => {
                                  const isScore = field === 'score';
                                  const numericRank = field !== 'score' && field !== 'totalScore';
                                  return (
                                    <label key={field}>{label}
                                      <Input type="number" min={numericRank ? 1 : 0} step={numericRank ? 1 : 'any'}
                                        value={(isScore && draft.problem ? '' : draft[field]) ?? ''}
                                        onChange={event => {
                                          const value = event.target.value === '' ? undefined : event.target.valueAsNumber;
                                          updateDraft(id, {
                                            [field]: value ?? (numericRank ? undefined : 0),
                                            ...(isScore ? { problem: value === undefined ? '请填写得分' : undefined } : {}),
                                          });
                                        }} />
                                    </label>
                                  );
                                })}
                                <label>科目<Input value={draft.subject || ''} placeholder={subject || '英语'} onChange={event => updateDraft(id, { subject: event.target.value })} /></label>
                              </div>
                              <div className="score-intake-editor-actions">
                                {row.survey?.rankSource && <span>排名来源 · {row.survey.rankSource}</span>}
                                <Button variant="ghost" size="sm" onClick={() => setRows(previous => previous?.filter(item => item.id !== id) ?? null)}>
                                  <Trash2 size={14} aria-hidden="true" />移除此行
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
              {reviewed.length === 0 && <p className="score-intake-empty">没有可预览的成绩行。</p>}
              {reviewed.length > 0 && reviewOnly && visibleGroups.every(([, group]) => group.every(row => !row.issue)) && <p className="score-intake-empty">当前筛选下没有待核对的成绩。</p>}
            </section>
          )}
        </div>

        <footer className="score-intake-footer">
          <p>{rows
            ? isExcel
              ? [`写入 ${readyClasses} 个班级`, issueCount ? `待核对 ${issueCount} 条将跳过` : '', existingCount ? `已有 ${existingCount} 条将跳过` : ''].filter(Boolean).join(' · ')
              : issueCount ? '请修正或移除待核对项' : '确认后写入本班'
            : '请填写考试名称、日期并预览成绩'}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
            <Button size="sm" onClick={save} disabled={!canSave}>写入 {ready.length} 条</Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
