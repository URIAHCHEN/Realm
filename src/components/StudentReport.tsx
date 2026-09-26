import { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportCustomFields } from '@/components/ReportCustomFields';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Line,
  Area,
  ComposedChart,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUp, 
  BookOpen, 
  Lightbulb,
  Calendar,
  User,
  School,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  FileText,
  Clock,
  CheckCircle2,
  Sparkles,
  Users,
  FileSpreadsheet,
  Image as ImageIcon,
  Target,
  AlertTriangle,
  CheckSquare
} from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { optionToneLevel } from '@/lib/optionTone';
import { computeStudentReportStats, computeClassReportStats } from '@/lib/reportStats';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  getQuestionTypeFeedback,
  getOverallFeedback,
  getAttendanceFeedback,
  getHomeworkFeedback,
  getListeningFeedback,
  getTrajectoryFeedback
} from '@/lib/reportFeedback';

interface StudentReportProps {
  students: string[];
  records: StudentRecord[];
  schoolScores: { [studentName: string]: SchoolScore[] };
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
  getNickname: (name: string) => string;
  currentClassName: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

/** 语义分级徽章样式（用于概况卡与列表配色） */
const TONE_BADGE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  bad: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  muted: 'bg-black/[0.06] text-[color:var(--ink-2)]',
};

/** 汇总各课次配置里出现过的选项（保序去重）——用于动态生成「出勤/作业概况」维度 */
function collectOptions(configs: { [lesson: string]: LessonConfig }, key: 'attendanceOptions' | 'homeworkOptions' | 'listeningOptions' | 'classPerformanceOptions'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  Object.keys(configs)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(k => (configs[k]?.[key] || []).forEach(opt => { if (!seen.has(opt)) { seen.add(opt); out.push(opt); } }));
  return out;
}

export function StudentReport({
  students,
  records,
  schoolScores,
  lessonConfigs,
  getNickname,
  currentClassName
}: StudentReportProps) {
  const [reportMode, setReportMode] = useState<'personal' | 'class'>('personal');
  const [selectedStudent, setSelectedStudent] = useState<string>(students[0] || '');
  // 切换班级后，旧班级的学生名可能已不在名单里 —— 否则个人报告恒显示"暂无学习记录"
  useEffect(() => {
    if (students.length && !students.includes(selectedStudent)) setSelectedStudent(students[0] || '');
  }, [students, selectedStudent]);
  const [selectedLesson, setSelectedLesson] = useState<number | 'all'>('all');
  const [trendType, setTrendType] = useState<'line' | 'bar' | 'area'>('bar');
  const [scoreSort, setScoreSort] = useState<'lesson' | 'asc' | 'desc'>('lesson');
  const [showListening, setShowListening] = useState(true);
  const [showCorrectRate, setShowCorrectRate] = useState(true);
  const [distType, setDistType] = useState<'pie' | 'bar' | 'radar'>('pie');
  const classReportRef = useRef<HTMLDivElement>(null);
  const personalReportRef = useRef<HTMLDivElement>(null);

  // 所有课次
  const allLessons = useMemo(() => {
    const lessons = Array.from(new Set(records.map(r => r.lessonNumber))).sort((a, b) => a - b);
    return lessons;
  }, [records]);

  // 合并各课次自定义列（按 id 去重）供“自定义维度”统计
  const allCustomFields = useMemo(() => {
    const seen = new Map<string, import('@/types').CustomField>();
    Object.values(lessonConfigs).forEach(cfg => {
      (cfg.customFields || []).forEach(cf => { if (!seen.has(cf.id)) seen.set(cf.id, cf); });
    });
    return Array.from(seen.values()).sort((a, b) => a.order - b.order);
  }, [lessonConfigs]);

  // 附加项清单（如口语得分）：不计入小测，但属于作业成绩的一部分 → 单独统计
  const optionalScoreFields = useMemo(() => {
    const seen = new Map<string, { name: string; fullScore: number; ids: string[] }>();
    Object.keys(lessonConfigs).forEach(k => {
      (lessonConfigs[k]?.questionTypes || []).forEach(qt => {
        if (!qt.excludeFromTotal) return;
        const cur = seen.get(qt.name) || { name: qt.name, fullScore: qt.fullScore, ids: [] as string[] };
        if (!cur.ids.includes(qt.id)) cur.ids.push(qt.id);
        seen.set(qt.name, cur);
      });
    });
    return Array.from(seen.values());
  }, [lessonConfigs]);

  /** 统计某批记录在附加项上的表现：只累加"已登记"的值，未登记不计入 */
  const summarizeOptional = (field: { name: string; ids: string[] }, recs: StudentRecord[]) => {
    const values = recs
      .map(r => field.ids.map(id => r.scores?.[id]).find(v => typeof v === 'number'))
      .filter((v): v is number => typeof v === 'number');
    return {
      name: field.name,
      registered: values.length,
      total: recs.length,
      avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0,
    };
  };

  // 动态选项清单：跨课次收集当前配置里出现过的选项（改文案后统计自动跟随）
  const attendanceOptions = useMemo(() => collectOptions(lessonConfigs, 'attendanceOptions'), [lessonConfigs]);
  const homeworkOptions = useMemo(() => collectOptions(lessonConfigs, 'homeworkOptions'), [lessonConfigs]);
  const listeningOptions = useMemo(() => collectOptions(lessonConfigs, 'listeningOptions'), [lessonConfigs]);

  // 获取选中学生的所有记录
  const studentRecords = useMemo(() => {
    return records.filter(r => r.studentName === selectedStudent).sort((a, b) => a.lessonNumber - b.lessonNumber);
  }, [records, selectedStudent]);

  // 获取选中学生的校内成绩
  const studentSchoolScores = useMemo(() => {
    return schoolScores[selectedStudent] || [];
  }, [schoolScores, selectedStudent]);

  // 班级报告使用的记录
  const classReportRecords = useMemo(() => {
    if (selectedLesson === 'all') return records;
    return records.filter(r => r.lessonNumber === selectedLesson);
  }, [records, selectedLesson]);

  // 计算学生统计数据
  const studentStats = useMemo(
    () => computeStudentReportStats(studentRecords, lessonConfigs, { attendanceOptions, homeworkOptions, listeningOptions }),
    [studentRecords, lessonConfigs, attendanceOptions, homeworkOptions, listeningOptions]
  );

  // 班级统计数据
  const classStats = useMemo(
    () => computeClassReportStats(classReportRecords, lessonConfigs, { attendanceOptions, homeworkOptions, listeningOptions }),
    [classReportRecords, lessonConfigs, attendanceOptions, homeworkOptions, listeningOptions]
  );

  // 饼图数据 - 题型得分分布
  const pieData = useMemo(() => {
    if (!studentStats) return [];
    return studentStats.avgQuestionTypeScores.map((qt, index) => ({
      name: qt.name,
      value: qt.avgScore,
      color: COLORS[index % COLORS.length]
    }));
  }, [studentStats]);

  // 柱状图数据 - 各课次成绩（支持排序切换）
  const barData = useMemo(() => {
    const list = studentRecords.map(r => ({
      lesson: `第${r.lessonNumber}课`,
      lessonNum: r.lessonNumber,
      score: r.totalScore,
      correctRate: r.correctRate,
      // 各课次真实满分（题型配置动态变化，非固定值）
      fullMark: getLessonFullScore(lessonConfigs[r.lessonNumber]) || 100
    }));
    if (scoreSort === 'asc') list.sort((a, b) => a.score - b.score);
    if (scoreSort === 'desc') list.sort((a, b) => b.score - a.score);
    return list;
  }, [studentRecords, scoreSort, lessonConfigs]);

  // 口语类统计行：个人报告用（选中学生）/ 班级报告用（全班）
  const optionalStudentRows = useMemo(
    () => optionalScoreFields.map(f => summarizeOptional(f, studentRecords)),
    [optionalScoreFields, studentRecords]
  );
  const optionalClassRows = useMemo(
    () => optionalScoreFields.map(f => summarizeOptional(f, classReportRecords)),
    [optionalScoreFields, classReportRecords]
  );

  // 班级组合图数据：每次课「班级平均正确率（柱）+ 最高/最低（线）+ 目标线 + 达标人数」
  const classComboTrend = useMemo(() => {
    const scored = classReportRecords.filter(r => !isAbsentRecord(r));
    const lessons = Array.from(new Set(scored.map(r => r.lessonNumber))).sort((a, b) => a - b);
    return lessons.map(ln => {
      const rs = scored.filter(r => r.lessonNumber === ln);
      const rates = rs.map(r => r.correctRate);
      return {
        lesson: `第${ln}课`,
        班级平均: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0,
        班级最高: rates.length ? Math.max(...rates) : 0,
        班级最低: rates.length ? Math.min(...rates) : 0,
        达标人数: rs.filter(r => r.correctRate >= 80).length,
        人数: rs.length,
      };
    });
  }, [classReportRecords]);

  // 组合图数据：每次课「本生正确率（柱）+ 班级平均/最高（线）+ 目标线」
  // 统一用正确率口径，跨课次可比（各次满分不同，绝对分不可比）
  const comboTrend = useMemo(() => {
    const classPresent = records.filter(r => !isAbsentRecord(r));
    return studentRecords.map(r => {
      const sameLesson = classPresent.filter(x => x.lessonNumber === r.lessonNumber);
      const rates = sameLesson.map(x => x.correctRate);
      const avg = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
      return {
        lesson: `第${r.lessonNumber}课`,
        学生正确率: r.correctRate,
        班级平均: avg,
        班级最高: rates.length ? Math.max(...rates) : 0,
        班级排名: r.rank,
      };
    });
  }, [studentRecords, records]);


  // 雷达图数据 - 能力维度（坐标轴上限取各题型真实满分，而非写死 100）
  const radarData = useMemo(() => {
    if (!studentStats) return [];
    return studentStats.avgQuestionTypeScores.map(qt => ({
      subject: qt.name,
      A: qt.avgScore,
      fullMark: qt.fullScore || 100
    }));
  }, [studentStats]);

  // 校内成绩表格数据
  const examTableData = useMemo(() => {
    return studentSchoolScores.map(score => ({
      examName: score.examName,
      date: score.date,
      score: score.score,
      totalScore: score.totalScore,
      rate: score.totalScore > 0 ? Math.round((score.score / score.totalScore) * 100) : 0,
      classRank: score.classRank,
      gradeRank: score.gradeRank,
      classSize: score.classSize
    }));
  }, [studentSchoolScores]);

  // 导出班级报告为图片
  const exportClassReportImage = async () => {
    if (!classReportRef.current) { toast.error('导出失败：报告内容尚未渲染完成，请稍后重试'); return; }
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(classReportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const link = document.createElement('a');
      link.download = `${currentClassName}_学情报告_${selectedLesson === 'all' ? '全部课次' : `第${selectedLesson}课`}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('导出图片失败:', err);
      toast.error('导出图片失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // 导出班级报告为CSV
  const exportClassReportCSV = () => {
    if (!classStats) return;
    const rows: string[] = [];
    rows.push(['项目', '数值'].join(','));
    rows.push(['班级', currentClassName].join(','));
    rows.push(['课次范围', selectedLesson === 'all' ? '全部课次' : `第${selectedLesson}课`].join(','));
    rows.push(['平均分', classStats.avgScore].join(','));
    rows.push(['最高分', classStats.maxScore].join(','));
    rows.push(['最低分', classStats.minScore].join(','));
    rows.push(['平均正确率', `${classStats.avgCorrectRate}%`].join(','));
    rows.push(['有效记录数', classStats.validCount].join(','));
    rows.push('');
    rows.push(['分数段', '人数'].join(','));
    classStats.distribution.forEach(d => rows.push([d.label, d.count].join(',')));
    rows.push('');
    rows.push(['题型', '平均分', '满分', '正确率'].join(','));
    classStats.questionTypeAvg.forEach(qt => rows.push([qt.name, qt.avgScore, qt.fullScore, `${qt.correctRate}%`].join(',')));
    rows.push('');
    rows.push(['薄弱题型 Top3'].join(','));
    classStats.weakPoints.forEach((qt, i) => rows.push([`Top${i + 1}`, qt.name, `${qt.correctRate}%`].join(',')));

    const csv = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentClassName}_班级学情_${selectedLesson === 'all' ? '全部课次' : `第${selectedLesson}课`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (students.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-[rgb(var(--brand-rgb)/0.13)] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-12 h-12 text-[color:var(--brand)]" />
        </div>
        <h3 className="text-xl font-semibold text-[color:var(--ink)] mb-2">暂无学生数据</h3>
        <p className="text-[color:var(--ink-4)]">还没添加学生——先在「学情记录」里把班级学员建好，这里就能看到每个人的学情报告了</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 报告模式切换 */}
      <Card className="liquid-glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Tabs value={reportMode} onValueChange={(v) => setReportMode(v as typeof reportMode)} className="w-auto">
              <TabsList className="grid w-64 grid-cols-2">
                <TabsTrigger value="personal" className="gap-2">
                  <User className="w-4 h-4" />
                  个人报告
                </TabsTrigger>
                <TabsTrigger value="class" className="gap-2">
                  <Users className="w-4 h-4" />
                  班级报告
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {reportMode === 'personal' ? (
              <>
                <span className="font-medium text-[color:var(--ink-2)]">选择学生：</span>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger className="w-full sm:w-64 liquid-glass-input">
                    <SelectValue placeholder="选择学生" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student} value={student}>
                        {student} ({getNickname(student)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <span className="font-medium text-[color:var(--ink-2)]">选择课次：</span>
                <Select value={String(selectedLesson)} onValueChange={(v) => setSelectedLesson(v === 'all' ? 'all' : Number(v))}>
                  <SelectTrigger className="w-full sm:w-48 liquid-glass-input">
                    <SelectValue placeholder="选择课次" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部课次</SelectItem>
                    {allLessons.map(lesson => (
                      <SelectItem key={lesson} value={String(lesson)}>第{lesson}课</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="hidden sm:block flex-1" />
                <div className="flex flex-wrap gap-2" data-html2canvas-ignore="true">
                  <Button variant="outline" size="sm" className="gap-2" onClick={exportClassReportCSV}>
                    <FileSpreadsheet className="w-4 h-4" />
                    导出CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={exportClassReportImage}>
                    <ImageIcon className="w-4 h-4" />
                    导出图片
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {reportMode === 'personal' ? (
        <PersonalReport
          studentRecords={studentRecords}
          studentStats={studentStats}
          examTableData={examTableData}
          pieData={pieData}
          barData={barData}
          comboTrend={comboTrend}
          optionalRows={optionalStudentRows}

          radarData={radarData}
          currentClassName={currentClassName}
          selectedStudent={selectedStudent}
          getNickname={getNickname}
          trendType={trendType}
          setTrendType={setTrendType}
          scoreSort={scoreSort}
          setScoreSort={setScoreSort}
          showListening={showListening}
          setShowListening={setShowListening}
          showCorrectRate={showCorrectRate}
          setShowCorrectRate={setShowCorrectRate}
          distType={distType}
          setDistType={setDistType}
          lessonConfigs={lessonConfigs}
          customFields={allCustomFields}
          personalReportRef={personalReportRef}
        />
      ) : (
        <div ref={classReportRef} className="space-y-6 bg-white p-6 rounded-2xl">
          <ClassReport
            currentClassName={currentClassName}
            selectedLesson={selectedLesson}
            classStats={classStats}
            classComboTrend={classComboTrend}
            optionalRows={optionalClassRows}
            classReportRecords={classReportRecords}
            getNickname={getNickname}
            customFields={allCustomFields}
          />
        </div>
      )}
    </div>
  );
}

// 个人报告组件
interface PersonalReportProps {
  studentRecords: StudentRecord[];
  studentStats: {
    totalLessons: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
    avgQuestionTypeScores: { id: string; name: string; avgScore: number; fullScore: number }[];
    learningTrajectory: { lesson: number; score: number; correctRate: number; listeningScore: number }[];
    attendanceStats: { total: number; onTime: number; late: number; absent: number };
    homeworkStats: { excellent: number; good: number; average: number; poor: number };
    /** 动态维度：按当前配置选项聚合（选项改文案后自动跟随） */
    attendanceBreakdown: { option: string; count: number }[];
    homeworkBreakdown: { option: string; count: number }[];
    listeningBreakdown: { option: string; count: number }[];
  } | null;
  examTableData: { examName: string; date: string; score: number; totalScore: number; rate: number; classRank?: number; gradeRank?: number; classSize?: number }[];
  pieData: { name: string; value: number; color: string }[];
  barData: { lesson: string; lessonNum: number; score: number; correctRate: number; fullMark: number }[];
  comboTrend: { lesson: string; 学生正确率: number; 班级平均: number; 班级最高: number; 班级排名: number }[];
  optionalRows: { name: string; registered: number; total: number; avg: number }[];
  radarData: { subject: string; A: number; fullMark: number }[];
  currentClassName: string;
  selectedStudent: string;
  getNickname: (name: string) => string;
  trendType: 'line' | 'bar' | 'area';
  setTrendType: (v: 'line' | 'bar' | 'area') => void;
  scoreSort: 'lesson' | 'asc' | 'desc';
  setScoreSort: (v: 'lesson' | 'asc' | 'desc') => void;
  showListening: boolean;
  setShowListening: (v: boolean) => void;
  showCorrectRate: boolean;
  setShowCorrectRate: (v: boolean) => void;
  distType: 'pie' | 'bar' | 'radar';
  setDistType: (v: 'pie' | 'bar' | 'radar') => void;
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
  customFields: import('@/types').CustomField[];
  personalReportRef?: React.RefObject<HTMLDivElement | null>;
}

function PersonalReport({
  studentRecords,
  studentStats,
  examTableData,
  pieData,
  barData,
  comboTrend,
  optionalRows,
  radarData,
  currentClassName,
  selectedStudent,
  getNickname,
  trendType,
  setTrendType,
  scoreSort,
  setScoreSort,
  showListening,
  setShowListening,
  showCorrectRate,
  setShowCorrectRate,
  distType,
  setDistType,
  lessonConfigs,
  customFields,
  personalReportRef
}: PersonalReportProps) {
  const [isExportingImage, setIsExportingImage] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  // 雷达图坐标轴上限：取各题型真实满分中的最大值（不再写死 100）
  const radarMax = useMemo(() => {
    const maxes = (radarData || []).map(d => d.fullMark).filter(v => Number.isFinite(v) && v > 0);
    return maxes.length > 0 ? Math.max(...maxes) : 100;
  }, [radarData]);
  const targetRef = (personalReportRef as React.RefObject<HTMLDivElement | null>) || innerRef;

  const handleExportPersonalImage = async () => {
    if (!targetRef.current || isExportingImage) return;
    setIsExportingImage(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const target = targetRef.current;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: target.offsetWidth,
        height: target.offsetHeight
      });
      const link = document.createElement('a');
      link.download = `${getNickname(selectedStudent)}_学情报告.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('个人报告图片已导出');
    } catch (err) {
      console.error(err);
      toast.error('导出失败：' + err);
    } finally {
      setIsExportingImage(false);
    }
  };

  if (studentRecords.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-[rgb(var(--brand-rgb)/0.13)] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-12 h-12 text-[color:var(--brand)]" />
        </div>
        <h3 className="text-xl font-semibold text-[color:var(--ink)] mb-2">暂无学习记录</h3>
        <p className="text-[color:var(--ink-4)]">该学生暂无任何课次的学习记录</p>
      </div>
    );
  }

  return (
    <div className="report-container" ref={targetRef}>
      <div className="report-header">
        <h1 className="report-title">📊 学情深度分析报告</h1>
        <p className="report-subtitle">
          {currentClassName} · {selectedStudent} ({getNickname(selectedStudent)})
        </p>
      </div>

      <Card className="mb-6 liquid-glass-card" data-html2canvas-ignore="true">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-[color:var(--ink-2)] whitespace-nowrap">趋势图类型</Label>
              <Select value={trendType} onValueChange={(v) => setTrendType(v as typeof trendType)}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">折线图</SelectItem>
                  <SelectItem value="bar">组合图（柱+线）</SelectItem>
                  <SelectItem value="area">面积图</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-[color:var(--ink-2)] whitespace-nowrap">课次排序</Label>
              <Select value={scoreSort} onValueChange={(v) => setScoreSort(v as typeof scoreSort)}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson">按课次正序</SelectItem>
                  <SelectItem value="asc">成绩从低到高</SelectItem>
                  <SelectItem value="desc">成绩从高到低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <Label className="text-sm text-[color:var(--ink-2)] whitespace-nowrap">展示指标</Label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox checked={showListening} onCheckedChange={(v) => setShowListening(!!v)} className="translate-y-[1px]" />课后任务
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox checked={showCorrectRate} onCheckedChange={(v) => setShowCorrectRate(!!v)} className="translate-y-[1px]" />正确率
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-[color:var(--ink-2)] whitespace-nowrap">题型分布图</Label>
              <Select value={distType} onValueChange={(v) => setDistType(v as typeof distType)}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pie">饼图</SelectItem>
                  <SelectItem value="bar">柱状图</SelectItem>
                  <SelectItem value="radar">雷达图</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="gap-2 h-8" data-html2canvas-ignore="true" onClick={handleExportPersonalImage} disabled={isExportingImage}>
              <ImageIcon className="w-4 h-4" />
              {isExportingImage ? '生成中...' : '导出图片'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="report-info-grid">
        <div className="report-info-item">
          <p className="report-info-label">累计课次</p>
          <p className="report-info-value">{studentStats?.totalLessons} 课</p>
        </div>
        <div className="report-info-item">
          <p className="report-info-label">平均成绩</p>
          <p className="report-info-value">{studentStats?.avgScore} 分</p>
        </div>
        <div className="report-info-item">
          <p className="report-info-label">最高成绩</p>
          <p className="report-info-value">{studentStats?.maxScore} 分</p>
        </div>
        <div className="report-info-item">
          <p className="report-info-label">最低成绩</p>
          <p className="report-info-value">{studentStats?.minScore} 分</p>
        </div>
      </div>

      <ReportCustomFields records={studentRecords} customFields={customFields} />

      <div className="report-section">
        <h2 className="report-section-title">
          <TrendingUp className="w-5 h-5 inline mr-2" />
          学习趋势分析
          <span className="text-xs font-normal text-[color:var(--ink-4)] ml-2">（柱=本生正确率，线=班级平均/最高，红线=目标 80%）</span>
        </h2>
        <div className="report-chart-container" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comboTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="lesson" stroke="#6b7280" />
              <YAxis domain={[0, 100]} unit="%" stroke="#6b7280" />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                formatter={(v: number, n: string) => [n === '班级排名' ? v : `${v}%`, n]}
              />
              <Legend />
              {/* 目标线：达标基准，一眼看出哪些课次在线上/线下 */}
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '目标 80%', position: 'right', fontSize: 11, fill: '#ef4444' }} />
              {/* 主序列：本生正确率（柱/线/面积三种形态可切换） */}
              {trendType === 'bar' && <Bar dataKey="学生正确率" name="本生正确率" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />}
              {trendType === 'line' && <Line type="monotone" dataKey="学生正确率" name="本生正确率" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} />}
              {trendType === 'area' && <Area type="monotone" dataKey="学生正确率" name="本生正确率" stroke="#3b82f6" strokeWidth={2} fill="#3b82f622" />}
              {/* 班级对比线：定位"自己在班里什么位置" */}
              <Line type="monotone" dataKey="班级平均" name="班级平均" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="班级最高" name="班级最高" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="report-section">
        <h2 className="report-section-title">
          <BarChart3 className="w-5 h-5 inline mr-2" />
          各课次成绩分布
        </h2>
        <div className="report-chart-container" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="lesson" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="score" name="得分" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              {showCorrectRate && <Bar dataKey="correctRate" name="正确率%" fill="#10b981" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="report-section">
          <h2 className="report-section-title">
            <PieChartIcon className="w-5 h-5 inline mr-2" />
            题型得分分布
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="report-chart-container" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                {distType === 'pie' ? (
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : distType === 'bar' ? (
                  <BarChart data={pieData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" />
                    <YAxis type="category" dataKey="name" width={80} stroke="#6b7280" />
                    <Tooltip />
                    <Bar dataKey="value" name="平均分" radius={[0, 4, 4, 0]}>
                      {pieData.map((entry, index) => <Cell key={`bar-cell-${index}`} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                ) : (
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} />
                    <Radar name="平均分" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {studentStats?.avgQuestionTypeScores.map((qt, index) => (
                <div key={qt.id} className="flex items-center justify-between p-3 bg-black/[0.04] rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="font-medium">{qt.name}</span>
                  </div>
                  <span className="font-bold text-[color:var(--brand)]">{qt.avgScore}分</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {radarData.length > 0 && (
        <div className="report-section">
          <h2 className="report-section-title">
            <Activity className="w-5 h-5 inline mr-2" />
            能力维度分析
          </h2>
          <div className="report-chart-container" style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis angle={30} domain={[0, radarMax]} />
                <Radar name="当前水平" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-[color:var(--brand)]" />
              考勤统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(studentStats?.attendanceBreakdown || []).map(({ option, count }) => (
                <div key={option} className="flex justify-between items-center">
                  <span className="text-[color:var(--ink-2)]">{option}</span>
                  <Badge className={TONE_BADGE[optionToneLevel(option)]}>{count} 次</Badge>
                </div>
              ))}
              {(studentStats?.attendanceBreakdown || []).length === 0 && (
                <p className="text-sm text-[color:var(--ink-4)]">本课次暂无考勤记录</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-[color:var(--brand)]" />
              课堂练习 / 课后任务
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(studentStats?.homeworkBreakdown || []).map(({ option, count }) => (
                <div key={option} className="flex justify-between items-center">
                  <span className="text-[color:var(--ink-2)]">{option}</span>
                  <Badge className={TONE_BADGE[optionToneLevel(option)]}>{count} 次</Badge>
                </div>
              ))}
              {(studentStats?.listeningBreakdown || []).map(({ option, count }) => (
                <div key={'l-' + option} className="flex justify-between items-center">
                  <span className="text-[color:var(--ink-2)]">课后任务 · {option}</span>
                  <Badge className={TONE_BADGE[optionToneLevel(option)]}>{count} 次</Badge>
                </div>
              ))}
              {(studentStats?.homeworkBreakdown || []).length === 0 && (studentStats?.listeningBreakdown || []).length === 0 && (
                <p className="text-sm text-[color:var(--ink-4)]">本课次暂无课堂练习/课后任务记录</p>
              )}
              {optionalRows.length > 0 && (
                <div className="pt-2 mt-1 border-t border-black/5 space-y-2">
                  <p className="text-xs text-[color:var(--ink-4)]">口语类（作业成绩，不计入小测总分）</p>
                  {optionalRows.map(st => (
                    <div key={st.name} className="flex justify-between items-center">
                      <span className="text-[color:var(--ink-2)]">{st.name}</span>
                      <Badge className={TONE_BADGE.muted}>
                        {st.registered > 0 ? `平均 ${st.avg} 分 · 已登记 ${st.registered}/${st.total} 次` : '尚未登记'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {examTableData.length > 0 && (
        <div className="report-section">
          <h2 className="report-section-title">
            <School className="w-5 h-5 inline mr-2" />
            校内考试成绩
          </h2>
          <div className="overflow-x-auto">
            <Table className="report-table">
              <TableHeader>
                <TableRow>
                  <TableHead>考试名称</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>得分</TableHead>
                  <TableHead>得分率</TableHead>
                  <TableHead>班级排名</TableHead>
                  <TableHead>年级排名</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examTableData.map((exam, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{exam.examName}</TableCell>
                    <TableCell>{exam.date}</TableCell>
                    <TableCell>{exam.score} / {exam.totalScore}</TableCell>
                    <TableCell>
                      <Badge className={
                        exam.rate >= 80 ? 'bg-green-100 text-green-700' :
                        exam.rate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }>{exam.rate}%</Badge>
                    </TableCell>
                    <TableCell>{exam.classRank} / {exam.classSize}</TableCell>
                    <TableCell>{exam.gradeRank || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="report-section">
        <h2 className="report-section-title">
          <Calendar className="w-5 h-5 inline mr-2" />
          详细学习记录
        </h2>
        <div className="overflow-x-auto">
          <Table className="report-table">
            <TableHeader>
              <TableRow>
                <TableHead>课次</TableHead>
                <TableHead>考勤</TableHead>
                <TableHead>作业</TableHead>
                <TableHead>课后任务</TableHead>
                <TableHead>入门测</TableHead>
                <TableHead>正确率</TableHead>
                <TableHead>排名</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...studentRecords].reverse().map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">第{record.lessonNumber}课</TableCell>
                  <TableCell>
                    <Badge className={
                      record.attendance === '按时出勤' ? 'bg-green-100 text-green-700' :
                      record.attendance === '迟到' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }>{record.attendance}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      record.homeworkStatus === '超赞完成' ? 'bg-green-100 text-green-700' :
                      record.homeworkStatus === '圆满完成' ? 'bg-[rgb(var(--brand-rgb)/0.13)] text-[color:var(--brand)]' :
                      'bg-yellow-100 text-yellow-700'
                    }>{record.homeworkStatus}</Badge>
                  </TableCell>
                  <TableCell>{record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus}</TableCell>
                  <TableCell className="font-bold">{record.totalScore}分</TableCell>
                  <TableCell>{record.correctRate}%</TableCell>
                  <TableCell>第{record.rank}名</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <StudentFeedback 
        studentRecords={studentRecords}
        studentStats={studentStats}
        lessonConfigs={lessonConfigs}
        avgQuestionTypeScores={studentStats?.avgQuestionTypeScores || []}
      />
    </div>
  );
}

// 班级报告组件
interface ClassReportProps {
  currentClassName: string;
  selectedLesson: number | 'all';
  classComboTrend: { lesson: string; 班级平均: number; 班级最高: number; 班级最低: number; 达标人数: number; 人数: number }[];
  optionalRows: { name: string; registered: number; total: number; avg: number }[];
  classStats: {
    avgScore: number;
    maxScore: number;
    minScore: number;
    avgCorrectRate: number;
    distribution: { label: string; min: number; max: number; color: string; count: number }[];
    questionTypeAvg: { id: string; name: string; avgScore: number; fullScore: number; correctRate: number }[];
    weakPoints: { id: string; name: string; avgScore: number; fullScore: number; correctRate: number }[];
    attendanceSummary: { total: number; onTime: number; late: number; absent: number; leave: number; transfer: number };
    attendanceBreakdown: { option: string; count: number }[];
    homeworkBreakdown: { option: string; count: number }[];
    listeningBreakdown: { option: string; count: number }[];
    homeworkSummary: { total: number; hwTotal: number; qualityTotal: number; excellent: number; good: number; average: number; poor: number; notBring: number };
    validCount: number;
  } | null;
  classReportRecords: StudentRecord[];
  getNickname: (name: string) => string;
  customFields: import('@/types').CustomField[];
}

function ClassReport({ currentClassName, selectedLesson, classStats, classComboTrend, optionalRows, classReportRecords, getNickname, customFields }: ClassReportProps) {
  // 低分学生（用于关注名单）；hook 需在早返回之前声明
  const lowScoreStudents = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    classReportRecords.filter(r => r.totalScore > 0).forEach(r => {
      const existing = latestByStudent.get(r.studentName);
      if (!existing || r.lessonNumber > existing.lessonNumber) {
        latestByStudent.set(r.studentName, r);
      }
    });
    return Array.from(latestByStudent.values())
      .sort((a, b) => a.totalScore - b.totalScore)
      .slice(0, 5);
  }, [classReportRecords]);

  if (!classStats || classReportRecords.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-[rgb(var(--brand-rgb)/0.13)] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-12 h-12 text-[color:var(--brand)]" />
        </div>
        <h3 className="text-xl font-semibold text-[color:var(--ink)] mb-2">暂无班级学习记录</h3>
        <p className="text-[color:var(--ink-4)]">班级报告还没有数据——在「学情记录」录入本课成绩后，这里会自动汇总班级整体情况</p>
      </div>
    );
  }

  // 出勤率 =（按时+迟到）/ 总记录（迟到也算到场；与考勤关键词归类一致）
  const attendanceRate = classStats.attendanceSummary.total > 0
    ? Math.round(((classStats.attendanceSummary.onTime + classStats.attendanceSummary.late) / classStats.attendanceSummary.total) * 100)
    : 0;
  // 分母改为「填过课堂练习或课后任务的记录数」，分子为其中语义为"优秀"的条数
  const homeworkExcellentRate = classStats.homeworkSummary.qualityTotal > 0
    ? Math.round((classStats.homeworkSummary.excellent / classStats.homeworkSummary.qualityTotal) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* 报告头部 */}
      <div className="text-center pb-6 border-b border-black/[0.06]">
        <h1 className="text-2xl font-bold text-[color:var(--ink)]">📊 班级学情报告</h1>
        <p className="text-[color:var(--ink-4)] mt-1">
          {currentClassName} · {selectedLesson === 'all' ? '全部课次' : `第${selectedLesson}课`}
        </p>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="ios-glass-card border-0">
          <CardContent className="pt-4 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--brand-rgb)/0.13)] flex items-center justify-center">
                <Target className="w-5 h-5 text-[color:var(--brand)]" />
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-4)]">平均分</p>
                <p className="text-xl font-bold text-[color:var(--ink)]">{classStats.avgScore}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="ios-glass-card border-0">
          <CardContent className="pt-4 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-4)]">平均正确率</p>
                <p className="text-xl font-bold text-[color:var(--ink)]">{classStats.avgCorrectRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="ios-glass-card border-0">
          <CardContent className="pt-4 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-4)]">出勤率</p>
                <p className="text-xl font-bold text-[color:var(--ink)]">{attendanceRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="ios-glass-card border-0">
          <CardContent className="pt-4 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--brand-rgb)/0.12)] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[color:var(--brand)]" />
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-4)]">作业优良率</p>
                <p className="text-xl font-bold text-[color:var(--ink)]">{homeworkExcellentRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ReportCustomFields records={classReportRecords} customFields={customFields} />

      {/* 分数段分布 */}
      <div className="report-section">
        <h2 className="report-section-title">
          <BarChart3 className="w-5 h-5 inline mr-2" />
          班级正确率分布
          <span className="text-xs font-normal text-[color:var(--ink-4)] ml-2">（按各课次满分换算，跨课次可直接比较）</span>
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="report-chart-container" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classStats.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Bar dataKey="count" name="人数" radius={[4, 4, 0, 0]}>
                  {classStats.distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3 content-center">
            {classStats.distribution.map((d, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: `${d.color}15` }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-[color:var(--ink-2)]">{d.label}分</span>
                </div>
                <span className="font-bold" style={{ color: d.color }}>{d.count}人</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 薄弱题型 Top3 */}
      <div className="report-section">
        <h2 className="report-section-title">
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          薄弱题型 Top3
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classStats.weakPoints.length > 0 ? classStats.weakPoints.map((qt, i) => (
            <Card key={qt.id} className="border-rose-100 bg-gradient-to-br from-rose-50 to-orange-50">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-rose-700 font-medium">Top {i + 1}</span>
                  <Badge className="bg-rose-100 text-rose-700 border-0">{qt.correctRate}%</Badge>
                </div>
                <p className="text-lg font-bold text-[color:var(--ink)]">{qt.name}</p>
                <p className="text-sm text-[color:var(--ink-4)] mt-1">班均 {qt.avgScore} / {qt.fullScore} 分</p>
              </CardContent>
            </Card>
          )) : (
            <div className="col-span-3 text-center py-8 text-[color:var(--ink-4)] bg-black/[0.04] rounded-xl">
              暂无题型数据
            </div>
          )}
        </div>
      </div>

      {/* 各次课正确率组合图：柱=班级平均、线=最高/最低、红线=目标 80% */}
      {classComboTrend.length > 0 && (
        <div className="report-section">
          <h2 className="report-section-title">
            <Activity className="w-5 h-5 inline mr-2" />
            各次课正确率对比
            <span className="text-xs font-normal text-[color:var(--ink-4)] ml-2">（柱=班级平均，线=最高/最低，红线=目标 80%）</span>
          </h2>
          <div className="report-chart-container" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={classComboTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="lesson" stroke="#6b7280" />
                <YAxis domain={[0, 100]} unit="%" stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} formatter={(v: number, n: string) => [`${v}`, n]} />
                <Legend />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '目标 80%', position: 'right', fontSize: 11, fill: '#ef4444' }} />
                <Bar dataKey="班级平均" name="班级平均正确率" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={26} />
                <Line type="monotone" dataKey="班级最高" name="班级最高" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="班级最低" name="班级最低" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-[color:var(--ink-4)] mt-2">
            口径：请假/缺勤不计入；正确率 = 得分 ÷ 该课次满分，跨课次可直接比较
          </p>
        </div>
      )}

      {/* 出勤与作业概况 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-[color:var(--brand)]" />
              出勤概况
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {classStats.attendanceBreakdown.map(({ option, count }) => {
                const lv = optionToneLevel(option);
                const box = lv === 'good' ? 'bg-green-50 text-green-700' : lv === 'warn' ? 'bg-yellow-50 text-yellow-700'
                  : lv === 'bad' ? 'bg-red-50 text-red-700' : lv === 'info' ? 'bg-blue-50 text-blue-700' : 'bg-black/[0.04] text-[color:var(--ink-2)]';
                return (
                  <div key={option} className={`p-3 rounded-xl text-center ${box}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs">{option}</p>
                  </div>
                );
              })}
              {classStats.attendanceBreakdown.length === 0 && <p className="col-span-2 text-sm text-[color:var(--ink-4)] text-center py-2">暂无考勤记录</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-[color:var(--brand)]" />
              作业概况
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {classStats.homeworkBreakdown.map(({ option, count }) => {
                const lv = optionToneLevel(option);
                const box = lv === 'good' ? 'bg-green-50 text-green-700' : lv === 'warn' ? 'bg-yellow-50 text-yellow-700'
                  : lv === 'bad' ? 'bg-red-50 text-red-700' : 'bg-black/[0.04] text-[color:var(--ink-2)]';
                return (
                  <div key={option} className={`p-3 rounded-xl text-center ${box}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs">{option}</p>
                  </div>
                );
              })}
              {classStats.listeningBreakdown.length > 0 && (
                <div className="col-span-2 pt-1">
                  <p className="text-xs text-[color:var(--ink-4)] mb-2">课后任务完成情况</p>
                  <div className="grid grid-cols-2 gap-3">
                    {classStats.listeningBreakdown.map(({ option, count }) => {
                      const lv = optionToneLevel(option);
                      const box = lv === 'good' ? 'bg-green-50 text-green-700' : lv === 'warn' ? 'bg-yellow-50 text-yellow-700'
                        : lv === 'bad' ? 'bg-red-50 text-red-700' : 'bg-black/[0.04] text-[color:var(--ink-2)]';
                      return (
                        <div key={'l-' + option} className={`p-3 rounded-xl text-center ${box}`}>
                          <p className="text-2xl font-bold">{count}</p>
                          <p className="text-xs">{option}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {classStats.homeworkBreakdown.length === 0 && classStats.listeningBreakdown.length === 0 && (
                <p className="col-span-2 text-sm text-[color:var(--ink-4)] text-center py-2">暂无课堂练习/课后任务记录</p>
              )}
              {optionalRows.length > 0 && (
                <div className="col-span-2 pt-2 mt-1 border-t border-black/5">
                  <p className="text-xs text-[color:var(--ink-4)] mb-2">口语类（作业成绩，不计入小测总分；仅统计已登记）</p>
                  <div className="grid grid-cols-2 gap-3">
                    {optionalRows.map(st => (
                      <div key={st.name} className="p-3 rounded-xl text-center bg-blue-50 text-blue-700">
                        <p className="text-2xl font-bold">{st.registered > 0 ? st.avg : '—'}</p>
                        <p className="text-xs">{st.name}均分 · 已登记 {st.registered} 次</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 需关注学生 */}
      {lowScoreStudents.length > 0 && (
        <div className="report-section">
          <h2 className="report-section-title">
            <Users className="w-5 h-5 inline mr-2" />
            需关注学生（入门测分数较低）
          </h2>
          <div className="overflow-x-auto">
            <Table className="report-table">
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>课次</TableHead>
                  <TableHead>入门测</TableHead>
                  <TableHead>正确率</TableHead>
                  <TableHead>排名</TableHead>
                  <TableHead>考勤</TableHead>
                  <TableHead>作业</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowScoreStudents.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{getNickname(record.studentName)}</TableCell>
                    <TableCell>第{record.lessonNumber}课</TableCell>
                    <TableCell className="font-bold text-rose-600">{record.totalScore}分</TableCell>
                    <TableCell>{record.correctRate}%</TableCell>
                    <TableCell>第{record.rank}名</TableCell>
                    <TableCell>
                      <Badge className={
                        record.attendance === '按时出勤' ? 'bg-green-100 text-green-700' :
                        record.attendance === '迟到' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }>{record.attendance}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        record.homeworkStatus === '超赞完成' ? 'bg-green-100 text-green-700' :
                        record.homeworkStatus === '圆满完成' ? 'bg-[rgb(var(--brand-rgb)/0.13)] text-[color:var(--brand)]' :
                        'bg-yellow-100 text-yellow-700'
                      }>{record.homeworkStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// 个性化反馈组件
interface StudentFeedbackProps {
  studentRecords: StudentRecord[];
  studentStats: {
    totalLessons: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
    avgQuestionTypeScores: { id: string; name: string; avgScore: number; fullScore: number }[];
    learningTrajectory: { lesson: number; score: number; correctRate: number; listeningScore: number }[];
    attendanceStats: { total: number; onTime: number; late: number; absent: number };
    homeworkStats: { excellent: number; good: number; average: number; poor: number };
  } | null;
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
  avgQuestionTypeScores: { id: string; name: string; avgScore: number }[];
}

function StudentFeedback({ 
  studentRecords, 
  studentStats, 
  lessonConfigs,
  avgQuestionTypeScores 
}: StudentFeedbackProps) {
  
  const attendanceRate = studentStats && studentStats.attendanceStats.total > 0 ?
    ((studentStats.attendanceStats.onTime + studentStats.attendanceStats.late) / studentStats.attendanceStats.total) : 0;

  const totalHomework = studentStats ?
    ((studentStats.homeworkStats.excellent + studentStats.homeworkStats.good +
     studentStats.homeworkStats.average + studentStats.homeworkStats.poor) || 1) : 1;
  const excellentRate = studentStats ?
    (studentStats.homeworkStats.excellent / totalHomework) : 0;
  
  const listeningScores = studentRecords
    .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
    .map(r => r.listeningScore);
  const avgListeningScore = listeningScores.length > 0 ?
    listeningScores.reduce((a, b) => a + b, 0) / listeningScores.length : 0;
  
  const trajectoryScores = studentStats?.learningTrajectory.map(t => t.score) || [];
  
  // 整体反馈的满分基准：优先按各课次配置取真实满分（getLessonFullScore 统一来源），
  // 多课次取平均；配置缺失时回退"总分/正确率"反推；再缺失回退 100。
  // 原实现用绕口的反推公式（含 correctRate=0 时的除零/NaN 风险），已废弃。
  const knownFullScores = studentRecords
    .map(r => getLessonFullScore(lessonConfigs[r.lessonNumber]))
    .filter(v => Number.isFinite(v) && v > 0);
  const derivedFullScores = studentRecords
    .filter(r => r.correctRate > 0 && r.totalScore > 0)
    .map(r => r.totalScore / (r.correctRate / 100));
  const fullScore = knownFullScores.length > 0
    ? Math.round(knownFullScores.reduce((a, b) => a + b, 0) / knownFullScores.length)
    : derivedFullScores.length > 0
      ? Math.round(derivedFullScores.reduce((a, b) => a + b, 0) / derivedFullScores.length)
      : 100;
  
  const questionTypeFeedbacks = avgQuestionTypeScores.map(qt => {
    let questionFullScore = 100;
    for (const record of studentRecords) {
      const config = lessonConfigs[record.lessonNumber];
      if (config) {
        const questionType = config.questionTypes.find(q => q.name === qt.name);
        if (questionType) {
          questionFullScore = questionType.fullScore;
          break;
        }
      }
    }
    
    return {
      name: qt.name,
      feedback: getQuestionTypeFeedback(qt.name, qt.avgScore, questionFullScore)
    };
  });
  
  const overallFeedback = studentStats ? 
    getOverallFeedback(studentStats.avgScore, fullScore || 100) : '';
  
  const attendanceFeedback = getAttendanceFeedback(attendanceRate);
  
  const homeworkFeedbackText = getHomeworkFeedback(excellentRate);
  
  const listeningFeedbackText = getListeningFeedback(avgListeningScore);
  
  const trajectoryFeedbackText = getTrajectoryFeedback(trajectoryScores);
  
  return (
    <div className="report-section">
      <h2 className="report-section-title">
        <Lightbulb className="w-5 h-5 inline mr-2" />
        学习建议
      </h2>
      
      <Card className="mb-4 bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.10)] to-[rgb(var(--brand-rgb)/0.10)] border-[rgb(var(--brand-rgb)/0.22)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[color:var(--brand)]" />
            整体表现分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[color:var(--ink-2)] leading-relaxed">{overallFeedback}</p>
        </CardContent>
      </Card>
      
      {questionTypeFeedbacks.length > 0 && (
        <Card className="mb-4 bg-gradient-to-br from-black/[0.05] to-gray-50 border-black/[0.1]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[color:var(--ink-2)]" />
              各题型分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questionTypeFeedbacks.map((item, index) => (
                <div key={index} className="p-3 bg-white rounded-lg border border-black/[0.06]">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-[color:var(--brand)]" />
                    <span className="font-medium text-sm text-[color:var(--ink)]">{item.name}</span>
                  </div>
                  <p className="text-sm text-[color:var(--ink-2)] leading-relaxed ml-6">{item.feedback}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              考勤表现
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[color:var(--ink-2)] leading-relaxed">{attendanceFeedback}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.1)] border-[rgb(var(--brand-rgb)/0.25)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[color:var(--brand)]" />
              作业情况
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[color:var(--ink-2)] leading-relaxed">{homeworkFeedbackText}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              学习趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[color:var(--ink-2)] leading-relaxed">{trajectoryFeedbackText}</p>
          </CardContent>
        </Card>
      </div>
      
      {avgListeningScore > 0 && (
        <Card className="mt-4 bg-gradient-to-br from-cyan-50 to-[rgb(var(--brand-rgb)/0.10)] border-cyan-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-600" />
              课后任务表现
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[color:var(--ink-2)] leading-relaxed">{listeningFeedbackText}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
