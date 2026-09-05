import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, UserPlus, UserMinus, Download, AlertTriangle, Copy, Check, Plus, Camera, Settings2, Zap, X, BarChart3 } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { isColumnVisible } from '@/lib/displaySettings';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import type { StudentRecord, LessonConfig, SeasonType, QuestionType } from '@/types';

interface StudentTableProps {
  students: string[];
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
  onUpdateRecord: (recordId: string, field: keyof StudentRecord, value: any) => void;
  onCreateRecord: (studentName: string, record: Partial<StudentRecord>) => void;
  onDeleteRecord: (recordId: string) => void;
  onAddStudent: (studentName: string) => void;
  onRemoveStudent: (studentName: string) => void;
  onExportData: () => void;
  onExportExcel: () => void;
  /** 返回当前课次的学情公示 HTML（用于生成图片） */
  getPublicityHTML: () => string;
  onViewStudentAnalysis: (studentName: string) => void;
  onSaveLessonConfig: (lessonNum: number, config: Partial<LessonConfig>) => void;
}

const seasons: { value: SeasonType; label: string; className: string }[] = [
  { value: '暑', label: '暑', className: 'season-summer' },
  { value: '秋', label: '秋', className: 'season-autumn' },
  { value: '寒', label: '寒', className: 'season-winter' },
  { value: '春', label: '春', className: 'season-spring' },
];

// 固定列默认标题（可被课次配置 columnLabels 覆盖）
const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  seasons: '学习轨迹',
  attendance: '考勤',
  homework: '书面作业',
  listening: '课后任务',
  note: '备注',
  pass: '是否过关',
};

// 分数色阶档位：按百分比分档
const heatClass = (pct: number): string => {
  if (pct >= 85) return '90';
  if (pct >= 70) return '75';
  if (pct >= 55) return '60';
  return '0';
};

const getAttendanceColor = (attendance: string) => {
  if (attendance === '按时出勤') return 'text-emerald-600 bg-emerald-50/80 border-emerald-200';
  if (attendance === '迟到') return 'text-amber-600 bg-amber-50/80 border-amber-200';
  if (attendance === '缺勤') return 'text-rose-600 bg-rose-50/80 border-rose-200';
  if (attendance === '请假') return 'text-blue-600 bg-blue-50/80 border-blue-200';
  if (attendance === '调课') return 'text-cyan-600 bg-cyan-50/80 border-cyan-200';
  return '';
};

const getHomeworkColor = (status: string) => {
  if (status === '超赞完成') return 'text-amber-600 bg-amber-50/80 border-amber-200';
  if (status === '圆满完成') return 'text-emerald-600 bg-emerald-50/80 border-emerald-200';
  if (status === '未完成' || status === '没带') return 'text-rose-600 bg-rose-50/80 border-rose-200';
  return '';
};

/** 成绩输入：自持文本以允许输入小数；提交为 number（支持 8.5 这类分值） */
function ScoreInput({ value, max, onCommit, className, placeholder }: {
  value: number; max?: number; onCommit: (n: number) => void; className?: string; placeholder?: string;
}) {
  const [text, setText] = useState(() => (value > 0 ? String(value) : ''));
  const [focused, setFocused] = useState(false);

  // 外部值变化（批量/他端拉取）且未聚焦时，回填显示
  useEffect(() => { if (!focused) setText(value > 0 ? String(value) : ''); }, [value, focused]);

  const clamp = (n: number) => {
    if (isNaN(n)) return 0;
    let x = Math.max(0, n);
    if (max != null) x = Math.min(max, x);
    return Math.round(x * 100) / 100;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d.]/g, '');
    const dot = raw.indexOf('.');
    if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, ''); // 仅保留一个小数点
    setText(raw);
    onCommit(clamp(parseFloat(raw)));
  };

  const handleBlur = () => {
    setFocused(false);
    const n = clamp(parseFloat(text));
    setText(n > 0 ? String(n) : '');
    onCommit(n);
  };

  return (
    <Input
      type="text" inputMode="decimal" placeholder={placeholder} value={text}
      onFocus={() => setFocused(true)} onChange={handleChange} onBlur={handleBlur}
      className={className}
    />
  );
}

export function StudentTable({
  students, records, lessonConfig, lessonNumber, getNickname, calculateClassStats,
  onUpdateRecord, onCreateRecord, onDeleteRecord, onAddStudent, onRemoveStudent,
  onExportData, onExportExcel, getPublicityHTML, onViewStudentAnalysis, onSaveLessonConfig
}: StudentTableProps) {
  const [newStudentName, setNewStudentName] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [copiedStudent, setCopiedStudent] = useState<string | null>(null);
  const [showAddQuestionTypeDialog, setShowAddQuestionTypeDialog] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState({ name: '', fullScore: 100 });
  // 批量操作状态
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [classAttendanceValue, setClassAttendanceValue] = useState('按时出勤');
  const [bulkField, setBulkField] = useState<'attendance' | 'homework' | 'listeningStatus' | 'listeningScore' | 'score'>('attendance');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkQtId, setBulkQtId] = useState('');
  const { settings } = useDisplaySettings();
  const col = (id: string) => isColumnVisible(settings, id);

  // 自定义列标题（留空回退默认名）
  const columnLabel = (key: string) => {
    const custom = lessonConfig.columnLabels?.[key as keyof import('@/types').ColumnLabels];
    return (custom && custom.trim()) || DEFAULT_COLUMN_LABELS[key] || key;
  };

  const allSelected = students.length > 0 && students.every(s => selectedStudents.has(s));
  const someSelected = selectedStudents.size > 0;

  const toggleSelectAll = () => {
    setSelectedStudents(allSelected ? new Set() : new Set(students));
  };

  const toggleSelect = (studentName: string) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(studentName)) next.delete(studentName);
      else next.add(studentName);
      return next;
    });
  };

  // 为单个学生设置字段（无记录则先创建）
  const setFieldFor = (studentName: string, patch: Partial<StudentRecord>) => {
    const record = getStudentRecord(studentName);
    if (record) {
      Object.entries(patch).forEach(([field, value]) => onUpdateRecord(record.id, field as keyof StudentRecord, value));
    } else {
      onCreateRecord(studentName, { studentName, lessonNumber, ...patch });
    }
  };

  // 一键设置全班考勤
  const handleApplyClassAttendance = () => {
    students.forEach(s => setFieldFor(s, { attendance: classAttendanceValue }));
    toast.success(`已将全班 ${students.length} 名学员考勤标记为「${classAttendanceValue}」`);
  };

  // 批量应用（多选行）
  const handleApplyBulk = () => {
    if (!someSelected) return;
    const list = students.filter(s => selectedStudents.has(s));
    if (bulkField === 'attendance' || bulkField === 'homework' || bulkField === 'listeningStatus') {
      const field = bulkField === 'attendance' ? 'attendance' : bulkField === 'homework' ? 'homeworkStatus' : 'listeningStatus';
      list.forEach(s => setFieldFor(s, { [field]: bulkValue } as Partial<StudentRecord>));
    } else if (bulkField === 'listeningScore') {
      const val = parseFloat(bulkValue) || 0;
      list.forEach(s => setFieldFor(s, { listeningScore: val, listeningStatus: '具体分数' }));
    } else if (bulkField === 'score') {
      if (!bulkQtId) { toast.error('请先选择要设置的题型'); return; }
      const val = parseFloat(bulkValue) || 0;
      list.forEach(s => {
        const record = getStudentRecord(s);
        const newScores = { ...(record?.scores || {}), [bulkQtId]: val };
        setFieldFor(s, { scores: newScores });
      });
    }
    toast.success(`已批量更新 ${list.length} 名学员`);
  };

  const lessonRecords = records.filter(r => r.lessonNumber === lessonNumber);
  const stats = calculateClassStats(lessonRecords, lessonConfig.questionTypes);

  const getStudentRecord = (studentName: string): StudentRecord | undefined => {
    return records.find(r => r.studentName === studentName && r.lessonNumber === lessonNumber);
  };

  const getWeakPoints = (record: StudentRecord): { name: string; diff: number }[] => {
    const weakPoints: { name: string; diff: number }[] = [];
    lessonConfig.questionTypes.forEach(qt => {
      const studentScore = record.scores[qt.id] || 0;
      const avgScore = stats.avgScores[qt.id] || 0;
      const diff = studentScore - avgScore;
      if (diff < -5) weakPoints.push({ name: qt.name, diff });
    });
    return weakPoints.sort((a, b) => a.diff - b.diff);
  };

  const handleSeasonToggle = (studentName: string, season: SeasonType) => {
    const record = getStudentRecord(studentName);
    const currentSeasons = record?.seasons || [];
    const newSeasons = currentSeasons.includes(season) ? currentSeasons.filter(s => s !== season) : [...currentSeasons, season];
    if (record) onUpdateRecord(record.id, 'seasons', newSeasons);
    else onCreateRecord(studentName, { studentName, lessonNumber, seasons: newSeasons });
  };

  const handleAttendanceChange = (studentName: string, value: string) => {
    const record = getStudentRecord(studentName);
    if (record) onUpdateRecord(record.id, 'attendance', value);
    else onCreateRecord(studentName, { studentName, lessonNumber, attendance: value });
  };

  const handleHomeworkChange = (studentName: string, value: string) => {
    const record = getStudentRecord(studentName);
    if (record) onUpdateRecord(record.id, 'homeworkStatus', value);
    else onCreateRecord(studentName, { studentName, lessonNumber, homeworkStatus: value });
  };

  const handleListeningChange = (studentName: string, value: string) => {
    const record = getStudentRecord(studentName);
    if (record) {
      onUpdateRecord(record.id, 'listeningStatus', value);
      if (value === '具体分数') onUpdateRecord(record.id, 'listeningScore', record.listeningScore || 0);
    } else {
      onCreateRecord(studentName, { studentName, lessonNumber, listeningStatus: value, listeningScore: 0 });
    }
  };

  const handleListeningScoreChange = (studentName: string, value: number) => {
    const record = getStudentRecord(studentName);
    if (record) onUpdateRecord(record.id, 'listeningScore', value);
    else onCreateRecord(studentName, { studentName, lessonNumber, listeningScore: value, listeningStatus: '具体分数' });
  };

  const handleAdjustReasonChange = (studentName: string, value: string) => {
    const record = getStudentRecord(studentName);
    if (record) onUpdateRecord(record.id, 'adjustReason', value);
  };

  const handleScoreChange = (studentName: string, questionTypeId: string, value: number) => {
    const record = getStudentRecord(studentName);
    const newScores = { ...(record?.scores || {}), [questionTypeId]: value };
    if (record) onUpdateRecord(record.id, 'scores', newScores);
    else onCreateRecord(studentName, { studentName, lessonNumber, scores: newScores });
  };

  const handleDeleteRecord = (studentName: string) => {
    const record = getStudentRecord(studentName);
    if (record) onDeleteRecord(record.id);
  };

  const handleAddStudent = () => {
    if (newStudentName.trim()) {
      onAddStudent(newStudentName.trim());
      setNewStudentName('');
      setShowAddDialog(false);
    }
  };

  const handleAddQuestionType = () => {
    if (!newQuestionType.name.trim()) return;
    const newQt = { id: 'qt_' + Date.now(), name: newQuestionType.name.trim(), fullScore: newQuestionType.fullScore, order: lessonConfig.questionTypes.length };
    onSaveLessonConfig(lessonNumber, { questionTypes: [...lessonConfig.questionTypes, newQt] });
    setNewQuestionType({ name: '', fullScore: 100 });
    setShowAddQuestionTypeDialog(false);
    toast.success('题型添加成功！');
  };

  const handleCopyFeedback = async (studentName: string) => {
    const record = getStudentRecord(studentName);
    if (!record) return;
    const weakPoints = getWeakPoints(record);
    const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);
    const nickname = getNickname(studentName);
    const scoreDetails = lessonConfig.questionTypes.map(qt => {
      const score = record.scores[qt.id] || 0;
      const avgScore = stats.avgScores[qt.id] || 0;
      const diff = score - avgScore;
      const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      return `• ${qt.name}：${score}/${qt.fullScore}分（班均${avgScore.toFixed(1)}，${diffText}）`;
    }).join('\n');
    const weakPointsText = weakPoints.length > 0 ? weakPoints.map(wp => `${wp.name}（低${Math.abs(wp.diff).toFixed(1)}分）`).join('、') : '无明显薄弱项，继续保持！';
    const feedback = `${nickname}家长您好！\n\n📚 第${lessonNumber}课学习反馈：\n\n🏫 考勤：${record.attendance}\n📝 作业：${record.homeworkStatus}\n🎙️ 课后任务：${record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus}\n\n📊 入门测成绩：\n${scoreDetails}\n💯 总分：${record.totalScore}/${fullScore}\n📈 班级排名：第${record.rank}名\n📊 正确率：${record.correctRate}%\n\n⚠️ 薄弱项：${weakPointsText}\n\n💪 加油，继续努力！`;
    const success = await copyToClipboard(feedback);
    if (success) {
      setCopiedStudent(studentName);
      setTimeout(() => setCopiedStudent(null), 2000);
    }
  };

  // 生成公示图片：离屏渲染学情公示模板 HTML 后截屏，避免截屏实时表格时
  // 0 宽渐变数据条导致 html2canvas createPattern 报错（InvalidStateError）
  const handleGenerateImage = async () => {
    let container: HTMLDivElement | null = null;
    try {
      toast.info('正在生成公示图片...');
      container = document.createElement('div');
      // 离屏放置：宽度固定保证排版，不产生 0 尺寸渐变元素
      container.style.cssText = 'position:fixed;left:-20000px;top:0;width:max-content;z-index:-1;opacity:1;pointer-events:none;';
      container.innerHTML = getPublicityHTML();
      document.body.appendChild(container);
      // 等待 DOM 渲染与字体加载
      await new Promise(r => setTimeout(r, 400));
      const target = (container.querySelector('.container') as HTMLElement) || (container.firstElementChild as HTMLElement);
      const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false, width: target.offsetWidth, height: target.offsetHeight });
      const link = document.createElement('a');
      link.download = `学情公示_第${lessonNumber}课_${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('公示图片已生成！');
    } catch (error) {
      toast.error('图片生成失败：' + error);
    } finally {
      container?.remove();
    }
  };

  const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);
  const canApplyBulk = someSelected && (
    bulkField === 'score'
      ? bulkQtId !== '' && bulkValue !== ''
      : bulkValue !== ''
  );

  return (
    <Card className="liquid-glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-xl flex items-center gap-2 text-[color:var(--ink)]">
            学情记录表
            <Badge variant="secondary" className="text-base bg-[rgb(var(--brand-rgb)/0.12)] text-[color:var(--brand)] border border-[rgb(var(--brand-rgb)/0.2)]">第{lessonNumber}课</Badge>
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setShowAddQuestionTypeDialog(true)} variant="outline" size="sm" title="配置题型" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]">
              <Settings2 className="w-4 h-4" /><span className="hidden sm:inline">配置题型</span>
            </Button>
            <Button onClick={handleGenerateImage} variant="outline" size="sm" title="生成公示图片" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]">
              <Camera className="w-4 h-4" /><span className="hidden sm:inline">生成图片</span>
            </Button>
            <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" title="添加学员" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">添加学员</span>
            </Button>
            <Button onClick={onExportExcel} variant="outline" size="sm" title="导出 Excel" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">导出 Excel</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <div className="empty-general">
            <span className="empty-ico"><UserPlus className="w-6 h-6" /></span>
            <div className="empty-t">还没有学员</div>
            <div className="empty-d">添加学生后即可录入考勤、作业与入门测成绩。</div>
            <Button onClick={() => setShowAddDialog(true)} className="ios-button mt-1"><UserPlus className="w-4 h-4" />添加学员</Button>
          </div>
        ) : (
          <>
            {/* 批量操作工具栏 */}
            <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.12)] border border-[rgb(var(--brand-rgb)/0.15)] space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)]">
                  <Zap className="w-4 h-4" />全班一键考勤
                </span>
                <Select value={classAttendanceValue} onValueChange={setClassAttendanceValue}>
                  <SelectTrigger className="w-32 h-8 text-sm bg-white/80"><SelectValue /></SelectTrigger>
                  <SelectContent>{lessonConfig.attendanceOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" className="h-8 gap-1.5 ios-button" onClick={handleApplyClassAttendance}>
                  <Check className="w-4 h-4" />一键标记全班
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[rgb(var(--brand-rgb)/0.15)]">
                <span className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                  批量设置
                  {someSelected && (
                    <Badge className="bg-[rgb(var(--brand-rgb)/0.15)] text-[color:var(--brand)] border-0">已选 {selectedStudents.size} 人</Badge>
                  )}
                </span>
                {someSelected && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-slate-600" onClick={() => setSelectedStudents(new Set())}>
                    <X className="w-3 h-3" />清除选择
                  </Button>
                )}
                <Select value={bulkField} onValueChange={(v) => { setBulkField(v as typeof bulkField); setBulkValue(''); setBulkQtId(''); }}>
                  <SelectTrigger className="w-32 h-8 text-sm bg-white/80"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attendance">考勤状态</SelectItem>
                    <SelectItem value="homework">作业状态</SelectItem>
                    <SelectItem value="listeningStatus">课后任务状态</SelectItem>
                    <SelectItem value="listeningScore">课后任务分数</SelectItem>
                    <SelectItem value="score">题型分数</SelectItem>
                  </SelectContent>
                </Select>
                {bulkField === 'attendance' && (
                  <Select value={bulkValue} onValueChange={setBulkValue}>
                    <SelectTrigger className="w-32 h-8 text-sm bg-white/80"><SelectValue placeholder="选择状态" /></SelectTrigger>
                    <SelectContent>{lessonConfig.attendanceOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {bulkField === 'homework' && (
                  <Select value={bulkValue} onValueChange={setBulkValue}>
                    <SelectTrigger className="w-32 h-8 text-sm bg-white/80"><SelectValue placeholder="选择状态" /></SelectTrigger>
                    <SelectContent>{lessonConfig.homeworkOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {bulkField === 'listeningStatus' && (
                  <Select value={bulkValue} onValueChange={setBulkValue}>
                    <SelectTrigger className="w-32 h-8 text-sm bg-white/80"><SelectValue placeholder="选择状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未完成">未完成</SelectItem>
                      <SelectItem value="未加入">未加入</SelectItem>
                      <SelectItem value="具体分数">具体分数</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {bulkField === 'listeningScore' && (
                  <Input type="number" min={0} max={100} placeholder="分数" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="w-24 h-8 text-sm" />
                )}
                {bulkField === 'score' && (
                  <>
                    <Select value={bulkQtId} onValueChange={setBulkQtId}>
                      <SelectTrigger className="w-36 h-8 text-sm bg-white/80"><SelectValue placeholder="选择题型" /></SelectTrigger>
                      <SelectContent>{lessonConfig.questionTypes.map(qt => <SelectItem key={qt.id} value={qt.id}>{qt.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={0} placeholder="分数" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="w-24 h-8 text-sm" />
                  </>
                )}
                <Button size="sm" className="h-8 gap-1.5 ios-button" disabled={!canApplyBulk} onClick={handleApplyBulk}>
                  <Check className="w-4 h-4" />应用到选中
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4">
              <ScrollArea className="h-[600px] border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.07)] to-[rgb(var(--brand-rgb)/0.12)] backdrop-blur-md">
                    <TableRow>
                      <TableHead className="w-10 text-center">
                        <Checkbox checked={allSelected && students.length > 0} onCheckedChange={toggleSelectAll} aria-label="全选" className="translate-y-[2px]" />
                      </TableHead>
                      <TableHead className="w-14 text-base font-bold">排名</TableHead>
                      <TableHead className="w-20 text-base font-bold">姓名</TableHead>
                      {col('seasons') && <TableHead className="w-36 text-base font-bold">{columnLabel('seasons')}</TableHead>}
                      {col('attendance') && <TableHead className="w-24 text-base font-bold">{columnLabel('attendance')}</TableHead>}
                      {col('homework') && <TableHead className="w-28 text-base font-bold">{columnLabel('homework')}</TableHead>}
                      {col('listening') && <TableHead className="w-32 text-base font-bold">{columnLabel('listening')}</TableHead>}
                      {col('scores') && lessonConfig.questionTypes.map(qt => <TableHead key={qt.id} className="w-20 text-center text-base font-bold">{qt.name}</TableHead>)}
                      <TableHead className="w-20 text-center text-base font-bold">总分</TableHead>
                      {col('correctRate') && <TableHead className="w-20 text-center text-base font-bold">正确率</TableHead>}
                      {col('correctRate') && <TableHead className="w-16 text-center text-base font-bold">{columnLabel('pass')}</TableHead>}
                      {col('weakPoints') && <TableHead className="text-base font-bold">薄弱项</TableHead>}
                      {col('note') && <TableHead className="w-28 text-base font-bold">{columnLabel('note')}</TableHead>}
                      {col('actions') && <TableHead className="w-28 text-center text-base font-bold">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((studentName) => {
                      const record = getStudentRecord(studentName);
                      const weakPoints = record ? getWeakPoints(record) : [];
                      const totalScore = record?.totalScore || 0;
                      const correctRate = record?.correctRate || 0;
                      return (
                        <TableRow key={studentName} className={`hover:bg-[rgb(var(--brand-rgb)/0.04)] transition-colors ${selectedStudents.has(studentName) ? 'bg-[rgb(var(--brand-rgb)/0.08)]' : ''}`}>
                          <TableCell className="text-center">
                            <Checkbox checked={selectedStudents.has(studentName)} onCheckedChange={() => toggleSelect(studentName)} aria-label={`选择 ${studentName}`} className="translate-y-[2px]" />
                          </TableCell>
                          <TableCell className="text-base">
                            {record?.rank ? (
                              settings.showRankHeatmap && settings.heatmapMode === 'score' ? (
                                <Badge variant="secondary" className={`heat-badge heat-${heatClass(fullScore > 0 ? (totalScore / fullScore) * 100 : 0)} rounded-full text-base py-1 px-3 font-bold`}>{record.rank}</Badge>
                              ) : (
                                <Badge variant={record.rank <= 3 ? "default" : "secondary"} className={record.rank === 1 ? "badge-rank-1 rounded-full text-base py-1 px-3" : record.rank === 2 ? "badge-rank-2 rounded-full text-base py-1 px-3" : record.rank === 3 ? "badge-rank-3 rounded-full text-base py-1 px-3" : "bg-slate-100 text-slate-600 rounded-full text-base py-1 px-3"}>{record.rank}</Badge>
                              )
                            ) : <span className="text-slate-300 text-base">-</span>}
                          </TableCell>
                          <TableCell className="font-medium cursor-pointer hover:underline text-base" style={{ color: 'var(--brand)' }} onClick={() => onViewStudentAnalysis(studentName)}>{getNickname(studentName)}</TableCell>
                          {col('seasons') && (
                          <TableCell className="text-base">
                            <div className="flex gap-1">
                              {seasons.map(({ value, label, className }) => {
                                const isActive = record?.seasons?.includes(value);
                                return <button key={value} onClick={() => handleSeasonToggle(studentName, value)} className={`season-tag ${className} ${isActive ? 'active' : 'inactive'}`} title={value}>{label}</button>;
                              })}
                            </div>
                          </TableCell>
                          )}
                          {col('attendance') && (
                          <TableCell className="text-base">
                            <div className="space-y-1">
                              <Select value={record?.attendance || '按时出勤'} onValueChange={(value) => handleAttendanceChange(studentName, value)}>
                                <SelectTrigger className={`w-24 h-9 text-sm border rounded-lg ${getAttendanceColor(record?.attendance || '按时出勤')}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{lessonConfig.attendanceOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                              </Select>
                              {record?.attendance === '调课' && <Input type="text" placeholder="调课原因" value={record?.adjustReason || ''} onChange={(e) => handleAdjustReasonChange(studentName, e.target.value)} className="w-24 h-7 text-sm rounded-lg" />}
                            </div>
                          </TableCell>
                          )}
                          {col('homework') && (
                          <TableCell className="text-base">
                            <Select value={record?.homeworkStatus || '圆满完成'} onValueChange={(value) => handleHomeworkChange(studentName, value)}>
                              <SelectTrigger className={`w-28 h-9 text-sm border rounded-lg ${getHomeworkColor(record?.homeworkStatus || '圆满完成')}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{lessonConfig.homeworkOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          )}
                          {col('listening') && (
                          <TableCell className="text-base">
                            <div className="flex items-center gap-1">
                              <Select value={record?.listeningStatus || '具体分数'} onValueChange={(value) => handleListeningChange(studentName, value)}>
                                <SelectTrigger className="w-28 h-9 text-sm border rounded-lg bg-white/80"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="未完成">未完成</SelectItem>
                                  <SelectItem value="未加入">未加入</SelectItem>
                                  <SelectItem value="具体分数">具体分数</SelectItem>
                                </SelectContent>
                              </Select>
                              {record?.listeningStatus === '具体分数' && <ScoreInput value={(record?.listeningScore ?? 0)} max={100} placeholder="0" onCommit={(n) => handleListeningScoreChange(studentName, n)} className="w-16 h-9 text-sm rounded-lg" />}
                            </div>
                          </TableCell>
                          )}
                          {col('scores') && lessonConfig.questionTypes.map(qt => {
                            const score = record?.scores?.[qt.id] || 0;
                            const avgScore = stats.avgScores[qt.id] || 0;
                            const isWeak = score < avgScore - 5;
                            const isStrong = score > avgScore + 5;
                            // 数据条宽度：按占满分比例，或按与班均相对差映射到 0-100%
                            const barPct = settings.dataBarMode === 'ratio'
                              ? Math.min(100, qt.fullScore > 0 ? (score / qt.fullScore) * 100 : 0)
                              : Math.max(4, Math.min(100, avgScore > 0 ? 50 + ((score - avgScore) / avgScore) * 50 : 0));
                            const inputCls = settings.showDataBars
                              ? 'score-input'
                              : `w-18 h-9 text-center text-base rounded-lg ${isWeak ? 'border-rose-300 bg-rose-50 text-rose-700' : ''} ${isStrong ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`;
                            return (
                              <TableCell key={qt.id} className="text-base">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={`score-cell w-18 h-9 rounded-lg ${settings.showDataBars ? 'border border-black/10' : ''}`}>
                                        {settings.showDataBars && score > 0 && (
                                          <span
                                            className={`score-bar ${isWeak ? 'weak' : isStrong ? 'strong' : ''}`}
                                            style={{ width: `calc(${barPct}% - 6px)` }}
                                          />
                                        )}
                                        <ScoreInput value={score} max={qt.fullScore} placeholder="0" onCommit={(n) => handleScoreChange(studentName, qt.id, n)} className={`${inputCls} w-18 h-9 text-center text-base rounded-lg`} />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent><p>班均: {avgScore.toFixed(1)}</p><p>差距: {(score - avgScore) >= 0 ? '+' : ''}{(score - avgScore).toFixed(1)}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-base">
                            <span className="total-bar-wrap">
                              {settings.showDataBars && fullScore > 0 && totalScore > 0 && (
                                <span className="total-bar" style={{ width: `${Math.min(100, (totalScore / fullScore) * 100)}%` }} />
                              )}
                              <span className="relative z-[1] font-bold text-lg" style={{ color: 'var(--brand)' }}>{totalScore}</span>
                            </span>
                            <span className="text-sm text-slate-400">/{fullScore}</span>
                          </TableCell>
                          {col('correctRate') && (
                          <TableCell className="text-center text-base">
                            <Badge variant="secondary" className={`heat-badge rounded-full text-base py-1 px-3 ${settings.showRankHeatmap ? `heat-${heatClass(correctRate)}` : 'bg-slate-100 text-slate-600'}`}>{correctRate}%</Badge>
                          </TableCell>
                          )}
                          {col('correctRate') && (
                          <TableCell className="text-center text-base">
                            {record ? (
                              correctRate >= (lessonConfig.passThreshold ?? 80)
                                ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 rounded-full text-sm py-0.5 px-2 font-semibold">✓ 过关</Badge>
                                : <Badge className="bg-rose-100 text-rose-700 border-rose-200 rounded-full text-sm py-0.5 px-2 font-semibold">✗ 未过关</Badge>
                            ) : <span className="text-slate-300">-</span>}
                          </TableCell>
                          )}
                          {col('weakPoints') && (
                          <TableCell className="text-base">
                            {weakPoints.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {weakPoints.slice(0, 2).map((wp, i) => (
                                  <TooltipProvider key={i}>
                                    <Tooltip>
                                      <TooltipTrigger><Badge variant="destructive" className="text-sm gap-1 bg-gradient-to-r from-rose-400 to-red-500 py-1 px-2"><AlertTriangle className="w-4 h-4" />{wp.name}</Badge></TooltipTrigger>
                                      <TooltipContent><p>低于班均 {Math.abs(wp.diff).toFixed(1)} 分</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ))}
                                {weakPoints.length > 2 && <Badge variant="outline" className="text-sm py-1 px-2">+{weakPoints.length - 2}</Badge>}
                              </div>
                            ) : record ? <span className="text-emerald-600 text-base flex items-center gap-1">无明显薄弱项</span> : <span className="text-slate-300 text-base">-</span>}
                          </TableCell>
                          )}
                          {col('note') && (
                          <TableCell className="text-base">
                            <Input
                              type="text"
                              placeholder="输入备注"
                              value={record?.note || ''}
                              onChange={(e) => setFieldFor(studentName, { note: e.target.value })}
                              className="w-24 h-9 text-sm rounded-lg"
                            />
                          </TableCell>
                          )}
                          {col('actions') && (
                          <TableCell className="text-base">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyFeedback(studentName)} disabled={!record} className="h-9 w-9 p-0 hover:bg-[rgb(var(--brand-rgb)/0.08)]" style={{ color: 'var(--brand)' }} title="复制反馈">{copiedStudent === studentName ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(studentName)} className="h-9 w-9 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50" title="删除记录"><Trash2 className="w-5 h-5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => onRemoveStudent(studentName)} className="h-9 w-9 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100" title="移除学生"><UserMinus className="w-5 h-5" /></Button>
                            </div>
                          </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {/* 底部统计行 */}
                    <TableRow className="bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.12)] border-t-2 border-[rgb(var(--brand-rgb)/0.25)] hover:bg-[rgb(var(--brand-rgb)/0.10)] font-semibold">
                      <TableCell></TableCell>
                      <TableCell className="text-sm font-bold text-slate-700" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                          <span>班级统计</span>
                        </div>
                      </TableCell>
                      {col('seasons') && <TableCell></TableCell>}
                      {col('attendance') && <TableCell></TableCell>}
                      {col('homework') && <TableCell></TableCell>}
                      {col('listening') && <TableCell></TableCell>}
                      {col('scores') && lessonConfig.questionTypes.map(qt => (
                        <TableCell key={qt.id} className="text-center text-sm">
                          <span className="inline-flex items-center justify-center min-w-[46px] px-2 py-1 rounded-md font-bold text-[color:var(--brand)] bg-white/70 border border-[rgb(var(--brand-rgb)/0.2)]">
                            {(stats.avgScores[qt.id] ?? 0).toFixed(1)}
                          </span>
                        </TableCell>
                      ))}
                      <TableCell className="text-center text-sm">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-md font-bold text-emerald-700 bg-emerald-50/80 border border-emerald-200">
                          {stats.avgScore.toFixed(1)}
                        </span>
                      </TableCell>
                      {col('correctRate') && (
                        <TableCell className="text-center text-sm">
                          <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md font-bold ${stats.avgScore >= (lessonConfig.passThreshold ?? 80) ? 'text-emerald-700 bg-emerald-50/80 border border-emerald-200' : 'text-rose-700 bg-rose-50/80 border border-rose-200'}`}>
                            {(lessonRecords.filter(r => r.totalScore > 0).length > 0
                              ? lessonRecords.filter(r => r.totalScore > 0).reduce((s, r) => s + r.correctRate, 0) / lessonRecords.filter(r => r.totalScore > 0).length
                              : 0
                            ).toFixed(1)}%
                          </span>
                        </TableCell>
                      )}
                      {col('correctRate') && <TableCell></TableCell>}
                      {col('weakPoints') && <TableCell></TableCell>}
                      {col('note') && <TableCell></TableCell>}
                      {col('actions') && <TableCell></TableCell>}
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            <div className="flex gap-2 flex-wrap mt-4">
              <Button onClick={() => setShowAddDialog(true)} variant="outline" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]"><UserPlus className="w-4 h-4" />添加学员</Button>
              <Button onClick={onExportData} variant="outline" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]"><Download className="w-4 h-4" />导出CSV</Button>
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="liquid-glass-card">
          <DialogHeader><DialogTitle>添加学员</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <Input placeholder="输入学生姓名" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()} className="liquid-glass-input" />
            <Button onClick={handleAddStudent} className="w-full liquid-glass-button">添加</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showAddQuestionTypeDialog} onOpenChange={setShowAddQuestionTypeDialog}>
        <DialogContent className="liquid-glass-card">
          <DialogHeader><DialogTitle>添加题型配置</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><label className="text-sm font-medium mb-2 block">题型名称</label><Input placeholder="如：阅读理解" value={newQuestionType.name} onChange={(e) => setNewQuestionType(prev => ({ ...prev, name: e.target.value }))} className="liquid-glass-input" /></div>
            <div><label className="text-sm font-medium mb-2 block">满分</label><Input type="number" step="0.5" placeholder="100" value={newQuestionType.fullScore} onChange={(e) => setNewQuestionType(prev => ({ ...prev, fullScore: parseFloat(e.target.value) || 100 }))} className="liquid-glass-input" /></div>
            <div className="flex gap-2">
              <Button onClick={handleAddQuestionType} className="flex-1 liquid-glass-button">添加</Button>
              <Button onClick={() => setShowAddQuestionTypeDialog(false)} variant="outline" className="flex-1">取消</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
