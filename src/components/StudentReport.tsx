import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  LineChart,
  Line,
  AreaChart,
  Area
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import html2canvas from 'html2canvas';
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
const SCORE_RANGES = [
  { label: '90-100', min: 90, max: 100, color: '#10b981' },
  { label: '80-89', min: 80, max: 89, color: '#3b82f6' },
  { label: '70-79', min: 70, max: 79, color: '#f59e0b' },
  { label: '60-69', min: 60, max: 69, color: '#f97316' },
  { label: '0-59', min: 0, max: 59, color: '#ef4444' }
];

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
  const [selectedLesson, setSelectedLesson] = useState<number | 'all'>('all');
  const [trendType, setTrendType] = useState<'line' | 'bar' | 'area'>('line');
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
  const studentStats = useMemo(() => {
    if (studentRecords.length === 0) return null;

    const totalLessons = studentRecords.length;
    const avgScore = studentRecords.reduce((sum, r) => sum + r.totalScore, 0) / totalLessons;
    const maxScore = Math.max(...studentRecords.map(r => r.totalScore));
    const minScore = Math.min(...studentRecords.map(r => r.totalScore));
    
    const questionTypeScores: { [key: string]: { total: number; count: number; name: string } } = {};
    
    studentRecords.forEach(record => {
      const config = lessonConfigs[record.lessonNumber];
      if (config) {
        config.questionTypes.forEach(qt => {
          if (!questionTypeScores[qt.id]) {
            questionTypeScores[qt.id] = { total: 0, count: 0, name: qt.name };
          }
          if (record.scores[qt.id] !== undefined) {
            questionTypeScores[qt.id].total += record.scores[qt.id];
            questionTypeScores[qt.id].count++;
          }
        });
      }
    });

    const avgQuestionTypeScores = Object.entries(questionTypeScores).map(([id, data]) => ({
      id,
      name: data.name,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0
    }));

    const learningTrajectory = studentRecords.map(r => ({
      lesson: r.lessonNumber,
      score: r.totalScore,
      correctRate: r.correctRate,
      listeningScore: r.listeningScore
    }));

    const attendanceStats = {
      total: studentRecords.length,
      onTime: studentRecords.filter(r => r.attendance === '按时出勤').length,
      late: studentRecords.filter(r => r.attendance === '迟到').length,
      absent: studentRecords.filter(r => r.attendance === '缺勤').length
    };

    const homeworkStats = {
      excellent: studentRecords.filter(r => r.homeworkStatus === '超赞完成').length,
      good: studentRecords.filter(r => r.homeworkStatus === '圆满完成').length,
      average: studentRecords.filter(r => r.homeworkStatus === '基本完成').length,
      poor: studentRecords.filter(r => r.homeworkStatus === '未完成').length
    };

    return {
      totalLessons,
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      avgQuestionTypeScores,
      learningTrajectory,
      attendanceStats,
      homeworkStats
    };
  }, [studentRecords, lessonConfigs]);

  // 班级统计数据
  const classStats = useMemo(() => {
    if (classReportRecords.length === 0) return null;

    const validRecords = classReportRecords.filter(r => r.totalScore > 0);
    const avgScore = validRecords.length > 0
      ? validRecords.reduce((sum, r) => sum + r.totalScore, 0) / validRecords.length
      : 0;
    const maxScore = validRecords.length > 0 ? Math.max(...validRecords.map(r => r.totalScore)) : 0;
    const minScore = validRecords.length > 0 ? Math.min(...validRecords.map(r => r.totalScore)) : 0;
    const avgCorrectRate = validRecords.length > 0
      ? validRecords.reduce((sum, r) => sum + r.correctRate, 0) / validRecords.length
      : 0;

    // 分数段分布
    const distribution = SCORE_RANGES.map(range => ({
      ...range,
      count: validRecords.filter(r => r.totalScore >= range.min && r.totalScore <= range.max).length
    }));

    // 各题型平均分
    const questionTypeScores: { [key: string]: { total: number; count: number; name: string; fullScore: number } } = {};
    classReportRecords.forEach(record => {
      const config = lessonConfigs[record.lessonNumber];
      if (config) {
        config.questionTypes.forEach(qt => {
          if (!questionTypeScores[qt.id]) {
            questionTypeScores[qt.id] = { total: 0, count: 0, name: qt.name, fullScore: qt.fullScore };
          }
          if (record.scores[qt.id] !== undefined) {
            questionTypeScores[qt.id].total += record.scores[qt.id];
            questionTypeScores[qt.id].count++;
          }
        });
      }
    });

    const questionTypeAvg = Object.entries(questionTypeScores).map(([id, data]) => ({
      id,
      name: data.name,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      fullScore: data.fullScore,
      count: data.count,
      correctRate: data.fullScore > 0 && data.count > 0
        ? Math.round(((data.total / data.count) / data.fullScore) * 100 * 10) / 10
        : 0
    }));

    // 薄弱题型 Top3
    const weakPoints = [...questionTypeAvg]
      .filter(qt => qt.count > 0)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 3);

    // 出勤概况
    const attendanceSummary = {
      total: classReportRecords.length,
      onTime: classReportRecords.filter(r => r.attendance === '按时出勤').length,
      late: classReportRecords.filter(r => r.attendance === '迟到').length,
      absent: classReportRecords.filter(r => r.attendance === '缺勤').length,
      leave: classReportRecords.filter(r => r.attendance === '请假').length,
      transfer: classReportRecords.filter(r => r.attendance === '调课').length
    };

    // 作业概况
    const homeworkSummary = {
      total: classReportRecords.length,
      excellent: classReportRecords.filter(r => r.homeworkStatus === '超赞完成').length,
      good: classReportRecords.filter(r => r.homeworkStatus === '圆满完成').length,
      average: classReportRecords.filter(r => r.homeworkStatus === '基本完成').length,
      poor: classReportRecords.filter(r => r.homeworkStatus === '未完成').length,
      notBring: classReportRecords.filter(r => r.homeworkStatus === '没带').length
    };

    return {
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      avgCorrectRate: Math.round(avgCorrectRate * 10) / 10,
      distribution,
      questionTypeAvg,
      weakPoints,
      attendanceSummary,
      homeworkSummary,
      validCount: validRecords.length
    };
  }, [classReportRecords, lessonConfigs]);

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
      fullMark: 100
    }));
    if (scoreSort === 'asc') list.sort((a, b) => a.score - b.score);
    if (scoreSort === 'desc') list.sort((a, b) => b.score - a.score);
    return list;
  }, [studentRecords, scoreSort]);

  // 折线图数据 - 学习趋势
  const trendData = useMemo(() => {
    return studentRecords.map(r => ({
      lesson: r.lessonNumber,
      score: r.totalScore,
      listeningScore: r.listeningScore
    }));
  }, [studentRecords]);

  // 雷达图数据 - 能力维度
  const radarData = useMemo(() => {
    if (!studentStats) return [];
    return studentStats.avgQuestionTypeScores.map(qt => ({
      subject: qt.name,
      A: qt.avgScore,
      fullMark: 100
    }));
  }, [studentStats]);

  // 校内成绩表格数据
  const examTableData = useMemo(() => {
    return studentSchoolScores.map(score => ({
      examName: score.examName,
      date: score.date,
      score: score.score,
      totalScore: score.totalScore,
      rate: Math.round((score.score / score.totalScore) * 100),
      classRank: score.classRank,
      gradeRank: score.gradeRank,
      classSize: score.classSize
    }));
  }, [studentSchoolScores]);

  // 导出班级报告为图片
  const exportClassReportImage = async () => {
    if (!classReportRef.current) return;
    try {
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
        <p className="text-[color:var(--ink-4)]">请先添加学生后再查看学情报告</p>
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
                <div className="flex flex-wrap gap-2">
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
          trendData={trendData}
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
          personalReportRef={personalReportRef}
        />
      ) : (
        <div ref={classReportRef} className="space-y-6 bg-white p-6 rounded-2xl">
          <ClassReport
            currentClassName={currentClassName}
            selectedLesson={selectedLesson}
            classStats={classStats}
            classReportRecords={classReportRecords}
            getNickname={getNickname}
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
    avgQuestionTypeScores: { id: string; name: string; avgScore: number }[];
    learningTrajectory: { lesson: number; score: number; correctRate: number; listeningScore: number }[];
    attendanceStats: { total: number; onTime: number; late: number; absent: number };
    homeworkStats: { excellent: number; good: number; average: number; poor: number };
  } | null;
  examTableData: { examName: string; date: string; score: number; totalScore: number; rate: number; classRank?: number; gradeRank?: number; classSize?: number }[];
  pieData: { name: string; value: number; color: string }[];
  barData: { lesson: string; lessonNum: number; score: number; correctRate: number; fullMark: number }[];
  trendData: { lesson: number; score: number; listeningScore: number }[];
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
  personalReportRef?: React.RefObject<HTMLDivElement | null>;
}

function PersonalReport({
  studentRecords,
  studentStats,
  examTableData,
  pieData,
  barData,
  trendData,
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
  personalReportRef
}: PersonalReportProps) {
  const [isExportingImage, setIsExportingImage] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const targetRef = (personalReportRef as React.RefObject<HTMLDivElement | null>) || innerRef;

  const handleExportPersonalImage = async () => {
    if (!targetRef.current || isExportingImage) return;
    setIsExportingImage(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const target = targetRef.current;
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

  // 课次配置驱动指标项：监听课次配置变化以驱动派生指标
  useMemo(() => {
    const _hasListening = studentRecords.some(r => r.listeningStatus === '具体分数' && r.listeningScore > 0);
    void _hasListening;
  }, [studentRecords, lessonConfigs]);
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

      <Card className="mb-6 liquid-glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-[color:var(--ink-2)] whitespace-nowrap">趋势图类型</Label>
              <Select value={trendType} onValueChange={(v) => setTrendType(v as typeof trendType)}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">折线图</SelectItem>
                  <SelectItem value="bar">柱状图</SelectItem>
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
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handleExportPersonalImage} disabled={isExportingImage}>
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

      <div className="report-section">
        <h2 className="report-section-title">
          <TrendingUp className="w-5 h-5 inline mr-2" />
          学习趋势分析
        </h2>
        <div className="report-chart-container" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            {trendType === 'line' ? (
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="lesson" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="score" name="入门测成绩" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                {showListening && <Line type="monotone" dataKey="listeningScore" name="课后任务成绩" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />}
              </LineChart>
            ) : trendType === 'bar' ? (
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="lesson" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Bar dataKey="score" name="入门测成绩" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                {showListening && <Bar dataKey="listeningScore" name="课后任务成绩" fill="#10b981" radius={[4, 4, 0, 0]} />}
              </BarChart>
            ) : (
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="listenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="lesson" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Area type="monotone" dataKey="score" name="入门测成绩" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreGrad)" />
                {showListening && <Area type="monotone" dataKey="listeningScore" name="课后任务成绩" stroke="#10b981" strokeWidth={2} fill="url(#listenGrad)" />}
              </AreaChart>
            )}
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
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
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
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">按时出勤</span>
                <Badge className="bg-green-100 text-green-700">{studentStats?.attendanceStats.onTime} 次</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">迟到</span>
                <Badge className="bg-yellow-100 text-yellow-700">{studentStats?.attendanceStats.late} 次</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">缺勤</span>
                <Badge className="bg-red-100 text-red-700">{studentStats?.attendanceStats.absent} 次</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-[color:var(--brand)]" />
              作业完成情况
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">超赞完成</span>
                <Badge className="bg-green-100 text-green-700">{studentStats?.homeworkStats.excellent} 次</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">圆满完成</span>
                <Badge className="bg-[rgb(var(--brand-rgb)/0.13)] text-[color:var(--brand)]">{studentStats?.homeworkStats.good} 次</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--ink-2)]">基本完成</span>
                <Badge className="bg-yellow-100 text-yellow-700">{studentStats?.homeworkStats.average} 次</Badge>
              </div>
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
  classStats: {
    avgScore: number;
    maxScore: number;
    minScore: number;
    avgCorrectRate: number;
    distribution: { label: string; min: number; max: number; color: string; count: number }[];
    questionTypeAvg: { id: string; name: string; avgScore: number; fullScore: number; correctRate: number }[];
    weakPoints: { id: string; name: string; avgScore: number; fullScore: number; correctRate: number }[];
    attendanceSummary: { total: number; onTime: number; late: number; absent: number; leave: number; transfer: number };
    homeworkSummary: { total: number; excellent: number; good: number; average: number; poor: number; notBring: number };
    validCount: number;
  } | null;
  classReportRecords: StudentRecord[];
  getNickname: (name: string) => string;
}

function ClassReport({ currentClassName, selectedLesson, classStats, classReportRecords, getNickname }: ClassReportProps) {
  if (!classStats || classReportRecords.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-[rgb(var(--brand-rgb)/0.13)] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-12 h-12 text-[color:var(--brand)]" />
        </div>
        <h3 className="text-xl font-semibold text-[color:var(--ink)] mb-2">暂无班级学习记录</h3>
        <p className="text-[color:var(--ink-4)]">请先录入学情数据后再查看班级报告</p>
      </div>
    );
  }

  const attendanceRate = classStats.attendanceSummary.total > 0
    ? Math.round((classStats.attendanceSummary.onTime / classStats.attendanceSummary.total) * 100)
    : 0;
  const homeworkExcellentRate = classStats.homeworkSummary.total > 0
    ? Math.round(((classStats.homeworkSummary.excellent + classStats.homeworkSummary.good) / classStats.homeworkSummary.total) * 100)
    : 0;

  // 低分学生（用于关注名单）
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
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-4)]">作业优良率</p>
                <p className="text-xl font-bold text-[color:var(--ink)]">{homeworkExcellentRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 分数段分布 */}
      <div className="report-section">
        <h2 className="report-section-title">
          <BarChart3 className="w-5 h-5 inline mr-2" />
          班级分数段分布
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
              <div className="p-3 bg-green-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-green-700">{classStats.attendanceSummary.onTime}</p>
                <p className="text-xs text-green-600">按时出勤</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-yellow-700">{classStats.attendanceSummary.late}</p>
                <p className="text-xs text-yellow-600">迟到</p>
              </div>
              <div className="p-3 bg-red-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-red-700">{classStats.attendanceSummary.absent}</p>
                <p className="text-xs text-red-600">缺勤</p>
              </div>
              <div className="p-3 bg-black/[0.04] rounded-xl text-center">
                <p className="text-2xl font-bold text-[color:var(--ink-2)]">{classStats.attendanceSummary.leave + classStats.attendanceSummary.transfer}</p>
                <p className="text-xs text-[color:var(--ink-2)]">请假/调课</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-purple-600" />
              作业概况
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-green-700">{classStats.homeworkSummary.excellent}</p>
                <p className="text-xs text-green-600">超赞完成</p>
              </div>
              <div className="p-3 bg-[rgb(var(--brand-rgb)/0.08)] rounded-xl text-center">
                <p className="text-2xl font-bold text-[color:var(--brand)]">{classStats.homeworkSummary.good}</p>
                <p className="text-xs text-[color:var(--brand)]">圆满完成</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-yellow-700">{classStats.homeworkSummary.average + classStats.homeworkSummary.poor}</p>
                <p className="text-xs text-yellow-600">未完成/基本完成</p>
              </div>
              <div className="p-3 bg-black/[0.04] rounded-xl text-center">
                <p className="text-2xl font-bold text-[color:var(--ink-2)]">{classStats.homeworkSummary.notBring}</p>
                <p className="text-xs text-[color:var(--ink-2)]">没带</p>
              </div>
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
    avgQuestionTypeScores: { id: string; name: string; avgScore: number }[];
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
  
  const attendanceRate = studentStats ? 
    (studentStats.attendanceStats.onTime / studentStats.attendanceStats.total) : 0;
  
  const totalHomework = studentStats ? 
    (studentStats.homeworkStats.excellent + studentStats.homeworkStats.good + 
     studentStats.homeworkStats.average + studentStats.homeworkStats.poor) : 1;
  const excellentRate = studentStats ? 
    (studentStats.homeworkStats.excellent / totalHomework) : 0;
  
  const listeningScores = studentRecords
    .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
    .map(r => r.listeningScore);
  const avgListeningScore = listeningScores.length > 0 ?
    listeningScores.reduce((a, b) => a + b, 0) / listeningScores.length : 0;
  
  const trajectoryScores = studentStats?.learningTrajectory.map(t => t.score) || [];
  
  const fullScore = studentRecords.length > 0 ?
    studentRecords[0].totalScore / (studentRecords[0].correctRate / 100) * (100 / studentRecords[0].totalScore) * studentRecords[0].totalScore :
    100;
  
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

        <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-600" />
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
