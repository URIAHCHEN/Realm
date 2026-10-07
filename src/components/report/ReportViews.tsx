// 学情报告的两个视图组件（个人 / 班级）。
//
// 从 StudentReport.tsx 抽出：容器组件原先同时承担"数据装配 + 两个完整视图 + 导出"，
// 一个文件 1700 行，改统计字段要在两处接口之间人肉同步（历史多次"接口未同步"报错）。
// 现在：容器负责取数与装配，视图只吃 props 渲染；统计口径见 lib/reportStats.ts。
//
// 注意：视图的 props 接口与 lib/reportStats.ts 的返回类型保持一致，
// 统计字段改动时只需改那一处类型定义。
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getLessonFullScore } from '@/lib/lessonFullScore';

import { useState, useMemo, useRef, } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ReportCustomFields } from '@/components/ReportCustomFields';
import { COLORS } from '@/components/report/palette';
import { TeachingAdvice } from '@/components/report/TeachingAdvice';
import { splitSegments, type StudentReportStats, type ClassReportStats } from '@/lib/reportStats';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  ReferenceLine,
  LabelList,
} from 'recharts';
import { 
  TrendingUp, 
  BookOpen, 
  Lightbulb,
  Calendar,
  School,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  FileText,
  Clock,
  CheckCircle2,
  Sparkles,
  Users,
  Image as ImageIcon,
  Target,
  AlertTriangle,
  CheckSquare
} from 'lucide-react';
import type { StudentRecord, LessonConfig, } from '@/types';
import { } from '@/lib/attendance';
import { optionToneLevel } from '@/lib/optionTone';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getQuestionTypeFeedback,
  getOverallFeedback,
  getAttendanceFeedback,
  getHomeworkFeedback,
  getListeningFeedback,
  getTrajectoryFeedback
} from '@/lib/reportFeedback';


/**
 * 口语等附加项的统计行（个人报告与班级报告共用）。
 * 抽成具名类型：原先两个 props 接口各写一遍内联结构，加字段时极易只改一处。
 */
export interface OptionalFieldRow {
  name: string;
  /** 已登记次数（未登记不计入，不当 0 处理） */
  registered: number;
  /** 该批记录总条数 */
  total: number;
  /** 已登记值的平均分 */
  avg: number;
  /** 档位分布（如 很棒哦👍 × 3）；未登记/请假缺勤不出现在任何档 */
  distribution?: { label: string; count: number }[];
  /** 拿到判定的记录数；为 0 时不渲染分布 */
  ratedCount?: number;
}

/** 语义分级徽章样式（用于概况卡与列表配色） */
const TONE_BADGE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  bad: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  muted: 'bg-black/[0.06] text-[color:var(--ink-2)]',
};

// 个人报告组件
export interface PersonalReportProps {
  studentRecords: StudentRecord[];
  /** 统计结果类型直接取自 lib/reportStats，避免视图再声明一份接口导致字段漂移 */
  studentStats: StudentReportStats | null;
  examTableData: { examName: string; date: string; score: number; totalScore: number; rate: number; classRank?: number; gradeRank?: number; classSize?: number }[];
  pieData: { name: string; value: number; color: string }[];
  barData: { lesson: string; lessonNum: number; score: number; correctRate: number; fullMark: number }[];
  comboTrend: { lesson: string; 学生正确率: number; 班级平均: number; 班级最高: number; 班级排名: number }[];
  optionalRows: OptionalFieldRow[];
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

export function PersonalReportView({
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
  const targetRef = (personalReportRef as React.RefObject<HTMLDivElement | null>) || innerRef;

  const handleExportPersonalImage = async () => {
    if (!targetRef.current || isExportingImage) return;
    setIsExportingImage(true);
    const target = targetRef.current;
    const prevWidth = target.style.width;
    try {
      // 导出前的关键处理（缺一不可，否则会导出大片空白 / 图表丢失）：
      // ① data-exporting → 把滚动淡入的 opacity:0 全部展开
      // ② 固定像素宽度 → 克隆文档里 ResponsiveContainer 需要真实宽度，否则图表宽为 0
      // ③ 清掉高度上限与裁剪 → 否则只截到首屏
      document.documentElement.setAttribute('data-exporting', '1');
      const w = Math.max(target.scrollWidth, 1080);
      target.style.width = w + 'px';
      await new Promise(r => setTimeout(r, 700));   // 等图表按新宽度重排 + 字体就绪
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: w,
        height: target.scrollHeight,
        windowWidth: w,
        windowHeight: target.scrollHeight,
        scrollX: 0,
        scrollY: 0,
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
      document.documentElement.removeAttribute('data-exporting');
      target.style.width = prevWidth;
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
              <YAxis domain={[0, 100]} stroke="#6b7280" />
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
            <ComposedChart data={barData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#eef1f5" vertical={false} />
              <XAxis dataKey="lesson" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              {showCorrectRate && <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />}
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #eef1f5', borderRadius: '12px', boxShadow: '0 12px 30px -18px rgba(15,23,42,.4)' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {showCorrectRate && <ReferenceLine yAxisId="r" y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '目标 80%', fontSize: 11, fill: '#b45309', position: 'insideTopRight' }} />}
              <Bar yAxisId="l" dataKey="score" name="得分" fill="url(#scoreFill)" radius={[6, 6, 0, 0]} maxBarSize={38}>
                <LabelList dataKey="score" position="top" style={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
              </Bar>
              {showCorrectRate && (
                <Line yAxisId="r" type="monotone" dataKey="correctRate" name="正确率%" stroke="#0ea5e9" strokeWidth={2.5}
                  dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }}>
                  <LabelList dataKey="correctRate" position="bottom" style={{ fontSize: 10, fill: '#0369a1' }} />
                </Line>
              )}
            </ComposedChart>
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
                  <BarChart data={pieData} layout="vertical" margin={{ top: 6, right: 56, left: 8, bottom: 6 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="2 6" stroke="#eef1f5" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="name" width={76} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #eef1f5', borderRadius: '12px' }} />
                    <Bar dataKey="value" name="平均分" radius={[0, 8, 8, 0]} maxBarSize={20}>
                      {pieData.map((entry, index) => <Cell key={`bar-cell-${index}`} fill={entry.color} />)}
                      {/* 数值直标：分数 + 得分率，一屏看清高低与达成度 */}
                      <LabelList
                        dataKey="value"
                        position="right"
                        content={(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number; value?: number | string }) => {
                          const i = props.index ?? 0;
                          const max = studentStats?.avgQuestionTypeScores.find(q => q.name === pieData[i]?.name)?.fullScore || 0;
                          const v = Number(props.value || 0);
                          const rate = max > 0 ? Math.round((v / max) * 100) : 0;
                          const x = Number(props.x || 0) + Number(props.width || 0) + 6;
                          const y = Number(props.y || 0) + Number(props.height || 0) / 2 + 4;
                          return (
                            <text x={x} y={y} fontSize={11.5} fontWeight={600}>
                              <tspan fill="#334155">{v}分</tspan>
                              <tspan fill="#94a3b8" dx="5">{rate}%</tspan>
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                ) : (
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="得分率" dataKey="A" stroke="rgb(var(--brand-rgb))" strokeWidth={2}
                      fill="rgb(var(--brand-rgb))" fillOpacity={0.35} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {studentStats?.avgQuestionTypeScores.map((qt, index) => {
                const rate = qt.fullScore > 0 ? Math.round((Number(qt.avgScore) / qt.fullScore) * 100) : 0;
                const tone = rate >= 85 ? '#10b981' : rate >= 70 ? '#3b82f6' : rate >= 60 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={qt.id} className="px-3 py-2.5 rounded-xl bg-black/[0.03]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ink)] min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="truncate">{qt.name}</span>
                      </span>
                      <span className="text-[13px] font-bold shrink-0 tnum" style={{ color: tone }}>
                        {qt.avgScore}<span className="text-[11px] font-normal text-[color:var(--ink-4)]">/{qt.fullScore}</span>
                        <span className="ml-1.5 text-[11px] font-semibold">{rate}%</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, rate)}%`, background: tone }} />
                    </div>
                  </div>
                );
              })}
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
                <PolarGrid stroke="#e6ebf2" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Radar name="当前水平（得分率）" dataKey="A" stroke="rgb(var(--brand-rgb))" strokeWidth={2}
                  fill="rgb(var(--brand-rgb))" fillOpacity={0.35} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
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
                    <div key={st.name} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[color:var(--ink-2)]">{st.name}</span>
                        <Badge className={TONE_BADGE.muted}>
                          {st.registered > 0 ? `平均 ${st.avg} 分 · 已登记 ${st.registered}/${st.total} 次` : '尚未登记'}
                        </Badge>
                      </div>
                      {/* 档位分布：只列实际出现的档，全 0（无人拿到判定）时整行不渲染 */}
                      {(st.ratedCount ?? 0) > 0 && (st.distribution || []).some(d => d.count > 0) && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(st.distribution || []).filter(d => d.count > 0).map(d => (
                            <span key={d.label} className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-black/5 bg-slate-50 text-[11px] font-medium text-[color:var(--ink-2)] whitespace-nowrap">
                              {d.label} × {d.count}
                            </span>
                          ))}
                        </div>
                      )}
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
export interface ClassReportProps {
  currentClassName: string;
  selectedLesson: number | 'all';
  classComboTrend: { lesson: string; 班级平均: number; 班级最高: number; 班级最低: number; 达标人数: number; 人数: number }[];
  optionalRows: OptionalFieldRow[];
  classStats: ClassReportStats | null;
  classReportRecords: StudentRecord[];
  getNickname: (name: string) => string;
  customFields: import('@/types').CustomField[];
}

export function ClassReportView({ currentClassName, selectedLesson, classStats, classComboTrend, optionalRows, classReportRecords, getNickname, customFields }: ClassReportProps) {
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
                <YAxis domain={[0, 100]} stroke="#6b7280" />
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
                        {/* 档位分布：一眼看出全班口语的整体档位结构 */}
                        {(st.ratedCount ?? 0) > 0 && (st.distribution || []).some(d => d.count > 0) && (
                          <div className="flex flex-wrap gap-1 justify-center mt-2">
                            {(st.distribution || []).filter(d => d.count > 0).map(d => (
                              <span key={d.label} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/70 text-[11px] font-medium whitespace-nowrap">
                                {d.label} × {d.count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 教学建议（3-2-1）：按「学情分析报告 · 初中」技能口径生成 */}
      <TeachingAdvice
        data={{
          className: currentClassName,
          validCount: classStats.validCount,
          avgCorrectRate: classStats.avgCorrectRate,
          weakTypes: [...classStats.questionTypeAvg]
            .filter(qt => qt.count > 0)
            .sort((a, b) => a.correctRate - b.correctRate)
            .map(qt => ({ name: qt.name, correctRate: qt.correctRate, count: qt.count })),
          highCount: splitSegments(classReportRecords.filter(r => !r.attendance || true).map(r => r.correctRate)).highCount,
          lowCount: splitSegments(classReportRecords.map(r => r.correctRate)).lowCount,
          passRate: classStats.avgCorrectRate >= 0 ? Math.round((classReportRecords.filter(r => r.correctRate >= 60).length / Math.max(1, classReportRecords.length)) * 100) : 0,
          excellentRate: Math.round((classReportRecords.filter(r => r.correctRate >= 85).length / Math.max(1, classReportRecords.length)) * 100),
        }}
      />

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
      
      {/* 合并板块：整体表现 + 各题型分析。
          原先两块各占一张大卡、题型一列排到底（"简单粗陋"），
          现在：整体表现压成一行结论，题型改成 2 列紧凑卡（得分徽章 + 得分率进度条 + 一句建议）。 */}
      <Card className="mb-4 bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.10)] to-[rgb(var(--brand-rgb)/0.04)] border-[rgb(var(--brand-rgb)/0.22)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[color:var(--brand)]" />
            表现与题型分析
            <span className="text-[11px] font-normal text-[color:var(--ink-4)] ml-1">整体结论 + 逐题型诊断</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 整体结论：一行读完 */}
          <p className="text-sm text-[color:var(--ink-2)] leading-relaxed pl-3 border-l-2"
            style={{ borderColor: 'rgb(var(--brand-rgb)/0.45)' }}>
            {overallFeedback}
          </p>

          {questionTypeFeedbacks.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <BarChart3 className="w-4 h-4 text-[color:var(--ink-2)]" />
                <span className="text-[13px] font-semibold text-[color:var(--ink)]">各题型</span>
                <span className="text-[11px] text-[color:var(--ink-4)]">按得分率着色：≥85 优 / ≥70 良 / ≥60 中 / &lt;60 需补</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {questionTypeFeedbacks.map((item, index) => {
                  const stat = studentStats?.avgQuestionTypeScores.find(q => q.name === item.name);
                  const avg = stat ? Number(stat.avgScore) : 0;
                  const full = stat?.fullScore || 0;
                  const rate = full > 0 ? Math.round((avg / full) * 100) : 0;
                  const tone = rate >= 85 ? '#10b981' : rate >= 70 ? '#3b82f6' : rate >= 60 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={index} className="rounded-xl bg-white border border-black/[0.06] p-3.5">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: tone }} />
                          <span className="text-[13px] font-semibold text-[color:var(--ink)] truncate">{item.name}</span>
                        </span>
                        {full > 0 && (
                          <span className="text-[12px] font-bold shrink-0 tnum" style={{ color: tone }}>
                            {avg}<span className="text-[11px] font-normal text-[color:var(--ink-4)]">/{full}</span>
                            <span className="ml-1 text-[11px]">{rate}%</span>
                          </span>
                        )}
                      </div>
                      {full > 0 && (
                        <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mb-2">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, background: tone }} />
                        </div>
                      )}
                      <p className="text-[12.5px] text-[color:var(--ink-2)] leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.feedback}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
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
