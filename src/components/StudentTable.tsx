import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, UserPlus, UserMinus, Download, AlertTriangle, Copy, Check, Plus, Camera, Settings2, Zap, X, BarChart3, Eraser } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { isColumnVisible } from '@/lib/displaySettings';
import { computeCategoryWeakPoints, formatCategoryWeakPoint, isQtWeak, isQtStrong } from '@/lib/weakPoints';
import { attendanceKind, isAbsentRecord } from '@/lib/attendance';
import { DEFAULT_CLASS_PERFORMANCE_OPTIONS } from '@/hooks/useClassData';
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
  /** 一键删除所选学员本课次记录（含撤销） */
  onDeleteStudentRecords?: (studentNames: string[]) => void;
  onAddStudent: (studentName: string) => void;
  onRemoveStudent: (studentName: string) => void;
  onExportData: () => void;
  onExportExcel: () => void;
  onDeleteLessonRecords?: () => void;
  /** 清空某条记录的全部内容（保留考勤/学习轨迹），适合请假生 */
  onClearRecord?: (recordId: string) => void;
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
  classPerformance: '课堂表现',
  homework: '书面作业',
  listening: '课后任务',
  note: '备注',
  pass: '是否过关',
};

// Radix Select 不允许空字符串选项值：用哨兵值实现「清空为无」
const CLEAR_VALUE = '__clear__';
const CLEAR_ITEM = <SelectItem value={CLEAR_VALUE} className="text-[color:var(--ink-4)] italic">（清空）</SelectItem>;

// 分数色阶档位：按百分比分档
const heatClass = (pct: number): string => {
  if (pct >= 85) return '90';
  if (pct >= 70) return '75';
  if (pct >= 55) return '60';
  return '0';
};

const getAttendanceColor = (attendance: string) => {
  switch (attendanceKind(attendance)) {
    case 'onTime': return 'text-emerald-600 bg-emerald-50/80 border-emerald-200';
    case 'late': return 'text-amber-600 bg-amber-50/80 border-amber-200';
    case 'absent': return 'text-rose-600 bg-rose-50/80 border-rose-200';
    case 'leave': return 'text-blue-600 bg-blue-50/80 border-blue-200';
    case 'transfer': return 'text-cyan-600 bg-cyan-50/80 border-cyan-200';
    default: return '';
  }
};

const getHomeworkColor = (status: string) => {
  if (!status) return '';
  if (status.includes('超赞')) return 'text-amber-600 bg-amber-50/80 border-amber-200';
  if (status.includes('圆满') || status.includes('完成')) return 'text-emerald-600 bg-emerald-50/80 border-emerald-200';
  if (status.includes('未完成') || status.includes('没带')) return 'text-rose-600 bg-rose-50/80 border-rose-200';
  return '';
};

// 选项颜色 → 单元格样式（浅色文字提亮为深灰保证可读）
function optionCellStyle(hex: string | undefined): CSSProperties | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const text = (0.299 * r + 0.587 * g + 0.114 * b) > 168 ? '#334155' : hex;
  return { background: hex + '24', color: text, borderColor: hex + '66' };
}

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
  onUpdateRecord, onCreateRecord, onDeleteRecord, onDeleteStudentRecords, onAddStudent, onRemoveStudent,
  onExportData, onExportExcel, onDeleteLessonRecords, onClearRecord, getPublicityHTML, onViewStudentAnalysis, onSaveLessonConfig
}: StudentTableProps) {
  const [newStudentName, setNewStudentName] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  // 「仅显示已选」学习轨迹模式下，临时展开某行以添加季度
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
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
  const customFields = lessonConfig.customFields || [];

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
      // 与单格 ScoreInput 相同的 clamp 口径：[0, 100]，两位小数
      const raw = parseFloat(bulkValue);
      const val = Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(100, raw)) * 100) / 100 : 0;
      list.forEach(s => setFieldFor(s, { listeningScore: val, listeningStatus: '具体分数' }));
    } else if (bulkField === 'score') {
      if (!bulkQtId) { toast.error('请先选择要设置的题型'); return; }
      const raw = parseFloat(bulkValue);
      if (!Number.isFinite(raw)) { toast.error('请输入有效分数'); return; }
      const qt = lessonConfig.questionTypes.find(q => q.id === bulkQtId);
      const cap = qt?.fullScore;
      // 与单格输入一致：钳制到 [0, 题型满分]，避免负数/超满分混入统计
      const val = Math.round(Math.max(0, cap != null ? Math.min(cap, raw) : raw) * 100) / 100;
      list.forEach(s => {
        const record = getStudentRecord(s);
        const newScores = { ...(record?.scores || {}), [bulkQtId]: val };
        setFieldFor(s, { scores: newScores });
      });
    }
    toast.success(`已批量更新 ${list.length} 名学员`);
  };

  // 性能：stats 与学号->记录映射用 useMemo 缓存，避免每次渲染（含批量选择、
  // 弹窗开关等无关状态的更新）都重算全班统计与 O(n²) 线性查找
  const lessonRecords = useMemo(
    () => records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );
  const stats = useMemo(
    () => calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  const recordByKey = useMemo(() => {
    const m = new Map<string, StudentRecord>();
    records.forEach(r => {
      if (r.lessonNumber === lessonNumber) m.set(r.studentName, r);
    });
    return m;
  }, [records, lessonNumber]);

  const getStudentRecord = (studentName: string): StudentRecord | undefined => {
    return recordByKey.get(studentName);
  };

  // 薄弱项（按板块、得分率口径）
  const getWeakPoints = (record: StudentRecord) =>
    computeCategoryWeakPoints(record, lessonConfig.questionTypes, stats.avgScores);

  // —— 列排序：姓名（按姓氏拼音）/ 排名 / 总分 / 正确率 / 各题型分数；点击表头 升→降→取消 ——
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const collator = useMemo(() => new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base' }), []);
  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortKey(null); setSortDir('asc'); }
  };
  const sortValueOf = (name: string, key: string): string | number => {
    if (key === 'name') return name;
    const r = recordByKey.get(name);
    if (key === 'rank') {
      if (r?.rank) return r.rank;
      // 无排名的学员：任何方向都排在末尾
      return sortDir === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
    }
    if (key === 'total') return r?.totalScore || 0;
    if (key === 'rate') return r?.correctRate || 0;
    if (key.startsWith('qt:')) return r?.scores?.[key.slice(3)] || 0;
    return 0;
  };
  const orderedStudents = useMemo(() => {
    if (!sortKey) return students;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const va = sortValueOf(a, sortKey);
      const vb = sortValueOf(b, sortKey);
      if (typeof va === 'string' || typeof vb === 'string') return collator.compare(String(va), String(vb)) * dir;
      return (va - vb) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sortKey, sortDir, recordByKey]);
  const sortCaret = (key: string) =>
    sortKey === key ? <span className="ml-0.5 font-bold" style={{ color: 'var(--brand)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

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

  const handleClassPerformanceChange = (studentName: string, value: string) => {
    const record = getStudentRecord(studentName);
    if (record) onUpdateRecord(record.id, 'classPerformance', value);
    else onCreateRecord(studentName, { studentName, lessonNumber, classPerformance: value });
  };

  // 选项颜色标记：按组（attendance/classPerformance/homework/listening/cf:<id>）+ 选项文本取色
  const optStyleOf = (group: string, value: string | undefined) =>
    optionCellStyle(value ? lessonConfig.optionColors?.[group]?.[value] : undefined);
  // Select 哨兵值 → 空串（取消选择）
  const unwrapClear = (v: string) => (v === CLEAR_VALUE ? '' : v);

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

  // 自定义列（选项/分数）写入
  const handleCustomChange = (studentName: string, fieldId: string, value: string | number) => {
    const record = getStudentRecord(studentName);
    const next = { ...(record?.customValues || {}), [fieldId]: value };
    if (record) onUpdateRecord(record.id, 'customValues', next);
    else onCreateRecord(studentName, { studentName, lessonNumber, customValues: next });
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
    // 满分校验：非法/非正数回退 100，避免负满分污染正确率计算
    const fullScore = Number.isFinite(newQuestionType.fullScore) && newQuestionType.fullScore > 0
      ? newQuestionType.fullScore
      : 100;
    const dup = lessonConfig.questionTypes.some(qt => qt.name === newQuestionType.name.trim());
    if (dup) { toast.error('已存在同名题型'); return; }
    const newQt = { id: 'qt_' + Date.now(), name: newQuestionType.name.trim(), fullScore, order: lessonConfig.questionTypes.length };
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
    const weakPointsText = weakPoints.length > 0 ? weakPoints.map(formatCategoryWeakPoint).join('、') : '无明显薄弱项，继续保持！';
    const cpLine = record.classPerformance ? `🙋 课堂表现：${record.classPerformance}\n` : '';
    const feedback = `${nickname}家长您好！\n\n📚 第${lessonNumber}课学习反馈：\n\n🏫 考勤：${record.attendance}\n${cpLine}📝 作业：${record.homeworkStatus}\n🎙️ 课后任务：${record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus}\n\n📊 入门测成绩：\n${scoreDetails}\n💯 总分：${record.totalScore}/${fullScore}\n📈 班级排名：第${record.rank}名\n📊 正确率：${record.correctRate}%\n\n⚠️ 薄弱项：${weakPointsText}\n\n💪 加油，继续努力！`;
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
      // html2canvas 约 200KB，仅在点击「生成图片」时按需加载
      const html2canvas = (await import('html2canvas')).default;
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
  // 统计口径：请假/缺勤学员一律不计入班级整体正确率（与平均分口径一致）
  const statsRateRecords = lessonRecords.filter(r => !isAbsentRecord(r) && r.totalScore > 0);
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
            {onDeleteLessonRecords && (
              confirmClear ? (
                <span className="inline-flex items-center gap-1">
                  <Button size="sm" className="h-8 gap-1 rounded-[var(--r-md)] bg-rose-500 hover:bg-rose-600 text-white"
                    onClick={() => { onDeleteLessonRecords(); setConfirmClear(false); }}>
                    <Check className="w-4 h-4" />确认清空
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 rounded-[var(--r-md)]" onClick={() => setConfirmClear(false)}>取消</Button>
                </span>
              ) : (
                <Button variant="outline" size="sm" className="gap-2 h-8 rounded-[var(--r-md)] border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/10"
                  onClick={() => setConfirmClear(true)} title="清空本课全部记录（可撤销）">
                  <Trash2 className="w-4 h-4" /><span className="hidden sm:inline">清空本课</span>
                </Button>
              )
            )}
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
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-slate-600" onClick={() => { setSelectedStudents(new Set()); setConfirmDeleteSelected(false); }}>
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
                {onDeleteStudentRecords && someSelected && (
                  confirmDeleteSelected ? (
                    <span className="inline-flex items-center gap-1">
                      <Button size="sm" className="h-8 gap-1 rounded-[var(--r-md)] bg-rose-500 hover:bg-rose-600 text-white"
                        onClick={() => {
                          onDeleteStudentRecords(students.filter(s => selectedStudents.has(s)));
                          setConfirmDeleteSelected(false);
                          setSelectedStudents(new Set());
                        }}>
                        <Check className="w-4 h-4" />确认删除
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 rounded-[var(--r-md)]" onClick={() => setConfirmDeleteSelected(false)}>取消</Button>
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[var(--r-md)] border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/10"
                      onClick={() => setConfirmDeleteSelected(true)} title="删除所选学员本课记录（可撤销）">
                      <Trash2 className="w-4 h-4" />删除所选记录
                    </Button>
                  )
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4">
              <div className="h-[600px] border rounded-lg overflow-auto">
                <Table className="border-separate" style={{ borderSpacing: 0 }}>
                  <TableHeader className="bg-slate-50/80 [&_tr]:border-b [&_tr]:border-slate-200">
                    <TableRow>
                      <TableHead className="w-10 text-center">
                        <Checkbox checked={allSelected && students.length > 0} onCheckedChange={toggleSelectAll} aria-label="全选" className="translate-y-[2px]" />
                      </TableHead>
                      <TableHead className="w-14 text-base font-bold cursor-pointer select-none" title="点击排序（升→降→取消）" onClick={() => toggleSort('rank')}>排名{sortCaret('rank')}</TableHead>
                      <TableHead className="w-20 text-base font-bold cursor-pointer select-none" title="按姓氏拼音排序（升→降→取消）" onClick={() => toggleSort('name')}>姓名{sortCaret('name')}</TableHead>
                      {col('seasons') && <TableHead className="w-28 text-base font-bold">{columnLabel('seasons')}</TableHead>}
                      {col('attendance') && <TableHead className="w-24 text-base font-bold">{columnLabel('attendance')}</TableHead>}
                      {col('classPerformance') && <TableHead className="w-24 text-base font-bold">{columnLabel('classPerformance')}</TableHead>}
                      {col('homework') && <TableHead className="w-24 text-base font-bold">{columnLabel('homework')}</TableHead>}
                      {col('listening') && <TableHead className="w-28 text-base font-bold">{columnLabel('listening')}</TableHead>}
                      {col('scores') && lessonConfig.questionTypes.map(qt => <TableHead key={qt.id} className="w-16 text-center text-xs font-bold whitespace-normal break-all leading-tight cursor-pointer select-none" title={`${qt.name}${qt.category ? ' · ' + qt.category : ''}｜点击按该题型分数排序`} onClick={() => toggleSort(`qt:${qt.id}`)}>{qt.name}{sortCaret(`qt:${qt.id}`)}</TableHead>)}
                      {customFields.map(cf => <TableHead key={cf.id} className="min-w-20 text-center text-xs font-bold break-all leading-tight" title={cf.name}>{cf.name}{cf.kind === 'number' && cf.fullScore ? <span className="text-[color:var(--ink-4)]"> ({cf.fullScore})</span> : null}</TableHead>)}
                      <TableHead className="w-16 text-center text-base font-bold cursor-pointer select-none" title="点击排序（升→降→取消）" onClick={() => toggleSort('total')}>总分{sortCaret('total')}</TableHead>
                      {col('correctRate') && <TableHead className="w-16 text-center text-base font-bold cursor-pointer select-none" title="点击排序（升→降→取消）" onClick={() => toggleSort('rate')}>正确率{sortCaret('rate')}</TableHead>}
                      {col('correctRate') && <TableHead className="w-16 text-center text-base font-bold">{columnLabel('pass')}</TableHead>}
                      {col('weakPoints') && <TableHead className="text-base font-bold">薄弱项</TableHead>}
                      {col('note') && <TableHead className="w-24 text-base font-bold">{columnLabel('note')}</TableHead>}
                      {col('actions') && <TableHead className="w-44 text-center text-base font-bold">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedStudents.map((studentName) => {
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
                            <div className="flex gap-1 items-center flex-wrap">
                              {(() => {
                                const selectedSet = new Set(record?.seasons || []);
                                const expanded = expandedSeasons.has(studentName);
                                const shown = settings.showAllSeasons || expanded
                                  ? seasons
                                  : seasons.filter(s => selectedSet.has(s.value));
                                return (
                                  <>
                                    {shown.map(({ value, label, className }) => {
                                      const isActive = selectedSet.has(value);
                                      return <button key={value} onClick={() => handleSeasonToggle(studentName, value)} className={`season-tag ${className} ${isActive ? 'active' : 'inactive'}`} title={value}>{label}</button>;
                                    })}
                                    {shown.length === 0 && <span className="text-slate-300 text-sm">无</span>}
                                    {!settings.showAllSeasons && (
                                      <button
                                        onClick={() => setExpandedSeasons(prev => { const n = new Set(prev); n.has(studentName) ? n.delete(studentName) : n.add(studentName); return n; })}
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-dashed border-[rgb(var(--brand-rgb)/0.4)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.08)]"
                                        title={expanded ? '收起' : '添加季度'}
                                      >
                                        {expanded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </TableCell>
                          )}
                          {col('attendance') && (
                          <TableCell className="text-base">
                            <div className="space-y-1">
                              <Select value={record?.attendance || ''} onValueChange={(value) => handleAttendanceChange(studentName, unwrapClear(value))}>
                                <SelectTrigger className={`w-24 h-9 text-sm border rounded-lg ${record?.attendance ? getAttendanceColor(record.attendance) : ''}`} style={optStyleOf('attendance', record?.attendance)}><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>{CLEAR_ITEM}{lessonConfig.attendanceOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                              </Select>
                              {attendanceKind(record?.attendance) === 'transfer' && <Input type="text" placeholder="调课原因" value={record?.adjustReason || ''} onChange={(e) => handleAdjustReasonChange(studentName, e.target.value)} className="w-24 h-7 text-sm rounded-lg" />}
                            </div>
                          </TableCell>
                          )}
                          {col('classPerformance') && (
                          <TableCell className="text-base">
                            <Select value={record?.classPerformance || ''} onValueChange={(value) => handleClassPerformanceChange(studentName, unwrapClear(value))}>
                              <SelectTrigger className="w-24 h-9 text-sm border rounded-lg bg-white/80" style={optStyleOf('classPerformance', record?.classPerformance)}><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>{CLEAR_ITEM}{(lessonConfig.classPerformanceOptions?.length ? lessonConfig.classPerformanceOptions : DEFAULT_CLASS_PERFORMANCE_OPTIONS).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          )}
                          {col('homework') && (
                          <TableCell className="text-base">
                            <Select value={record?.homeworkStatus || ''} onValueChange={(value) => handleHomeworkChange(studentName, unwrapClear(value))}>
                              <SelectTrigger className={`w-24 h-9 text-sm border rounded-lg ${record?.homeworkStatus ? getHomeworkColor(record.homeworkStatus) : ''}`} style={optStyleOf('homework', record?.homeworkStatus)}><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>{CLEAR_ITEM}{lessonConfig.homeworkOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          )}
                          {col('listening') && (
                          <TableCell className="text-base">
                            <div className="flex items-center gap-1">
                              <Select value={record?.listeningStatus || ''} onValueChange={(value) => handleListeningChange(studentName, unwrapClear(value))}>
                                <SelectTrigger className="w-28 h-9 text-sm border rounded-lg bg-white/80" style={optStyleOf('listening', record?.listeningStatus)}><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {CLEAR_ITEM}
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
                            const isWeak = isQtWeak(qt, score, avgScore);
                            const isStrong = isQtStrong(qt, score, avgScore);
                            // 数据条宽度：按占满分比例，或按与班均相对差映射到 0-100%（封顶，不随高分继续拉长）
                            const barPct = settings.dataBarMode === 'ratio'
                              ? Math.min(92, qt.fullScore > 0 ? (score / qt.fullScore) * 92 : 0)
                              : Math.max(4, Math.min(92, avgScore > 0 ? 50 + ((score - avgScore) / avgScore) * 46 : 0));
                            const inputCls = settings.showDataBars
                              ? 'score-input'
                              : `w-14 h-9 text-center text-base rounded-lg ${isWeak ? 'border-rose-300 bg-rose-50 text-rose-700' : ''} ${isStrong ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`;
                            return (
                              <TableCell key={qt.id} className="text-base">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={`score-cell w-14 h-9 rounded-lg ${settings.showDataBars ? 'border border-black/10' : ''}`}>
                                        {settings.showDataBars && score > 0 && (
                                          <span
                                            className={`score-bar ${isWeak ? 'weak' : isStrong ? 'strong' : ''}`}
                                            style={{ width: `calc(${barPct}% - 6px)` }}
                                          />
                                        )}
                                        <ScoreInput value={score} max={qt.fullScore} placeholder="0" onCommit={(n) => handleScoreChange(studentName, qt.id, n)} className={`${inputCls} w-14 h-9 text-center text-base rounded-lg`} />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent><p>班均: {avgScore.toFixed(1)}</p><p>差距: {(score - avgScore) >= 0 ? '+' : ''}{(score - avgScore).toFixed(1)}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            );
                          })}
                          {customFields.map(cf => (
                            <TableCell key={cf.id} className="text-center text-base">
                              {cf.kind === 'number' ? (
                                <ScoreInput
                                  value={Number(record?.customValues?.[cf.id] ?? 0)}
                                  max={cf.fullScore}
                                  placeholder="—"
                                  onCommit={(n) => handleCustomChange(studentName, cf.id, n)}
                                  className="w-16 h-9 text-center text-sm rounded-lg mx-auto"
                                />
                              ) : (
                                <Select
                                  value={String(record?.customValues?.[cf.id] ?? '')}
                                  onValueChange={(v) => handleCustomChange(studentName, cf.id, unwrapClear(v))}
                                >
                                  <SelectTrigger className="min-w-20 h-9 text-sm rounded-lg bg-white/80" style={optStyleOf(`cf:${cf.id}`, String(record?.customValues?.[cf.id] ?? ''))}><SelectValue placeholder="—" /></SelectTrigger>
                                  <SelectContent>
                                    {CLEAR_ITEM}
                                    {(cf.options || []).map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-center text-base">
                            <span className="total-bar-wrap">
                              {settings.showDataBars && fullScore > 0 && totalScore > 0 && (
                                <span className="total-bar" style={{ width: `${Math.min(100, (totalScore / fullScore) * 100)}%` }} />
                              )}
                              <span className="relative z-[1] font-bold text-lg" style={{ color: 'var(--brand)' }}>{totalScore}</span>
                            </span>
                            {fullScore > 0 && <span className="text-sm text-slate-400">/{fullScore}</span>}
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
                                      <TooltipTrigger><Badge variant="destructive" className="text-sm gap-1 bg-gradient-to-r from-rose-400 to-red-500 py-1 px-2"><AlertTriangle className="w-4 h-4" />{wp.category}</Badge></TooltipTrigger>
                                      <TooltipContent><p>板块：{wp.questionTypeNames.join('、')}</p><p>得分率 {Math.round(wp.studentRate * 100)}%，低于班均 {Math.round(Math.abs(wp.diffRate) * 100)} 个百分点</p></TooltipContent>
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
                              {onClearRecord && (
                                <Button variant="ghost" size="sm" onClick={() => record && onClearRecord(record.id)} disabled={!record} className="h-9 w-9 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50" title="清空记录内容（保留考勤/学习轨迹，可撤销）"><Eraser className="w-5 h-5" /></Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(studentName)} className="h-9 w-9 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50" title="删除记录"><Trash2 className="w-5 h-5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => onRemoveStudent(studentName)} className="h-9 w-9 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100" title="移除学生"><UserMinus className="w-5 h-5" /></Button>
                            </div>
                          </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {/* 底部统计行：吸底固定，纵向滚动时始终可见；横向滚动与列对齐 */}
                    <TableRow className="sticky bottom-0 z-20 bg-white border-t-2 border-[rgb(var(--brand-rgb)/0.3)] font-semibold hover:bg-white">
                      <TableCell className="bg-white"></TableCell>
                      <TableCell className="text-sm font-bold text-slate-700 bg-white" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                          <span>班级统计</span>
                        </div>
                      </TableCell>
                      {col('seasons') && <TableCell className="bg-white"></TableCell>}
                      {col('attendance') && <TableCell className="bg-white"></TableCell>}
                      {col('classPerformance') && <TableCell className="bg-white"></TableCell>}
                      {col('homework') && <TableCell className="bg-white"></TableCell>}
                      {col('listening') && <TableCell className="bg-white"></TableCell>}
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
                            {(statsRateRecords.length > 0
                              ? statsRateRecords.reduce((s, r) => s + r.correctRate, 0) / statsRateRecords.length
                              : 0
                            ).toFixed(1)}%
                          </span>
                        </TableCell>
                      )}
                      {col('correctRate') && <TableCell className="bg-white"></TableCell>}
                      {col('weakPoints') && <TableCell className="bg-white"></TableCell>}
                      {col('note') && <TableCell className="bg-white"></TableCell>}
                      {col('actions') && <TableCell className="bg-white"></TableCell>}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
            {/* 底部操作条：常规文档流（不再固定），随页面正常滚动 */}
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
            <div><label className="text-sm font-medium mb-2 block">满分</label><Input type="number" min="1" step="0.5" placeholder="100" value={newQuestionType.fullScore} onChange={(e) => { const n = parseFloat(e.target.value); setNewQuestionType(prev => ({ ...prev, fullScore: Number.isFinite(n) ? n : 100 })); }} className="liquid-glass-input" /></div>
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
