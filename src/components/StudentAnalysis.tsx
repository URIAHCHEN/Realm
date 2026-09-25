// 学员学情分析弹窗 —— 现代化管理后台风格：KPI 总览 + 多维图表 + 课次时间线 + 校内成绩
import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, BarChart3, Activity, School,
  CalendarCheck, BookOpen, Mic, Trophy, Layers, FileText, Target, Download } from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore } from '@/types';

import { attendanceRateOf, isAbsentRecord } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';

interface StudentAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  nickname: string;
  allRecords: { classId: string; className: string; records: StudentRecord[] }[];
  schoolScores: SchoolScore[];
  getLessonConfig: (classId: string, lessonNumber: number) => LessonConfig;
}

const CHART_COLORS = ['#0a84ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  fontSize: 13,
};

// 选项着色：按语义关键词判断，不再硬编码旧版选项文本
// （老师改选项文案、或导入的是新选项时，颜色依然正确）
function optionToneClass(value: string): string {
  const v = (value || '').trim();
  if (!v) return 'bg-slate-50 text-slate-400 border-slate-200';
  if (/请假|调课/.test(v)) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (/缺勤|未完成|未做完|没带/.test(v)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (/迟到|补发|按要求|不过关|欠缺|走神|内向|需要|留意/.test(v)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (/完成|准时|很棒|优秀|认真|积极|超赞|圆满|参与|细心/.test(v)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

const statusBadge = (value: string | undefined) => (
  <Badge variant="outline" className={`text-xs ${optionToneClass(value || '')}`}>{value || '—'}</Badge>
);
const attendanceBadge = (status: string) => statusBadge(status);
const homeworkBadge = (status: string) => statusBadge(status);
const listeningBadge = (status: string, score?: number) => (
  <Badge variant="outline" className={`text-xs ${optionToneClass(status === '具体分数' ? '完成' : status)}`}>
    <Mic className="w-3 h-3 mr-1" />
    {status === '具体分数' ? `${score ?? 0}分` : (status || '—')}
  </Badge>
);

// KPI 卡片
function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value}<span className="text-xs font-medium text-slate-400 ml-1">{sub}</span></p>
      </div>
    </div>
  );
}

// 单条课次时间线卡片
function LessonTimelineCard({ record, lessonConfig }: { record: StudentRecord; lessonConfig: LessonConfig }) {
  // 关键修复：每一课次用**它自己的**题型配置与满分渲染
  // （原来统一取最新课次的题型，导致 Day1 显示 Day2 的题型、分数全为 0）
  const questionTypes = lessonConfig.questionTypes || [];
  const fullScore = getLessonFullScore(lessonConfig);
  const rateTrend = record.correctRate >= 80 ? 'text-emerald-600' : record.correctRate >= 60 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="relative pl-6">
      {/* 时间线轴点 */}
      <div className="absolute left-0 top-6 w-3 h-3 rounded-full bg-[color:var(--brand)] ring-4 ring-[rgb(var(--brand-rgb)/0.15)]" />
      <div className="absolute left-[5.5px] top-9 bottom-0 w-px bg-slate-200" />
      <div className="rounded-2xl bg-white/80 backdrop-blur border border-black/5 p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Day{record.lessonNumber}</span>
            <span className="text-xs text-slate-400">{record.date}</span>
          </div>
          <div className="flex items-center gap-2">
            {attendanceBadge(record.attendance)}
            {homeworkBadge(record.homeworkStatus)}
            {listeningBadge(record.listeningStatus, record.listeningScore)}
          </div>
        </div>
        {/* 题型得分条 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mb-3">
          {questionTypes.map(qt => {
            const score = record.scores[qt.id] || 0;
            const pct = qt.fullScore > 0 ? Math.min(100, (score / qt.fullScore) * 100) : 0;
            const barColor = pct >= 85 ? 'bg-emerald-400' : pct >= 70 ? 'bg-sky-400' : pct >= 55 ? 'bg-amber-400' : 'bg-rose-400';
            return (
              <div key={qt.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">{qt.name}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{score}<span className="text-slate-400 font-normal">/{qt.fullScore}</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-lg text-[color:var(--brand)]">{record.totalScore}<span className="text-xs font-medium text-slate-400">/{fullScore}</span></span>
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">第 {record.rank} 名</Badge>
          <span className={`font-semibold ${rateTrend}`}>正确率 {record.correctRate}%</span>
          {record.note && <span className="text-xs text-slate-400 truncate max-w-[240px]" title={record.note}>📝 {record.note}</span>}
        </div>
      </div>
    </div>
  );
}

const esc = (v: unknown) => String(v ?? '');

export function StudentAnalysis({
  isOpen,
  onClose,
  studentName,
  nickname,
  allRecords,
  schoolScores,
  getLessonConfig
}: StudentAnalysisProps) {
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);

  const currentClassData = allRecords[selectedClassIndex];
  const records = useMemo(() =>
    [...(currentClassData?.records || [])].sort((a, b) => a.lessonNumber - b.lessonNumber),
    [currentClassData]
  );

  // 该生所有课次出现过的题型名（按首次出现顺序去重）——跨课次分析按「题型名」对齐，
  // 因为不同课次的题型 id 不同，按 id 对齐会全部为 0（原雷达图空白即由此而来）
  const qtNames = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    records.forEach(r => {
      getLessonConfig(currentClassData.classId, r.lessonNumber).questionTypes.forEach(qt => {
        if (!seen.has(qt.name)) { seen.add(qt.name); list.push(qt.name); }
      });
    });
    return list;
  }, [records, currentClassData, getLessonConfig]);

  /** 某课次某题型的得分率（用该课次自己的满分作分母）；该课次没有此题型时返回 null */
  const rateOfQt = (record: StudentRecord, qtName: string): number | null => {
    const cfg = getLessonConfig(currentClassData.classId, record.lessonNumber);
    const qt = cfg.questionTypes.find(q => q.name === qtName);
    if (!qt || !qt.fullScore) return null;
    return Math.round(((record.scores[qt.id] || 0) / qt.fullScore) * 1000) / 10;
  };

  // KPI 统计
  const kpis = useMemo(() => {
    if (records.length === 0) return null;
    // 请假/缺勤课次不计入平均/最低/正确率（与班级口径一致）
    const present = records.filter(r => !isAbsentRecord(r));
    const scorePool = present.length > 0 ? present : records;
    const scores = scorePool.map(r => r.totalScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const avgRate = Math.round(scorePool.reduce((a, r) => a + r.correctRate, 0) / scorePool.length * 10) / 10;
    const latest = records[records.length - 1];
    const prev = records[records.length - 2];
    const trend = prev ? latest.totalScore - prev.totalScore : 0;
    const fullScore = getLessonFullScore(getLessonConfig(currentClassData.classId, latest.lessonNumber));
    const attendanceRate = attendanceRateOf(records.map(r => r.attendance));
    return { total: records.length, avg, max, min, avgRate, latest, trend, fullScore, attendanceRate };
  }, [records, currentClassData, getLessonConfig]);

  // 总分 + 正确率组合图
  const trendChartData = useMemo(() =>
    records.map(r => ({ name: `D${r.lessonNumber}`, 总分: r.totalScore, 正确率: r.correctRate })),
    [records]
  );

  // 题型雷达图（跨课次按题型名取平均得分率 %）——只统计真正有该题型的课次
  const radarData = useMemo(() => {
    if (records.length === 0) return [];
    return qtNames.map(name => {
      const pcts = records.map(r => rateOfQt(r, name)).filter((v): v is number => v != null);
      return {
        subject: name,
        得分率: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10 : 0,
        课次数: pcts.length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, qtNames, currentClassData, getLessonConfig]);

  // 各题型「得分率」多线趋势（统一换算成百分比，跨课次可比；
  // 原实现直接画原始分数，题型满分不同会导致曲线误导）
  const qtTrendData = useMemo(() => {
    return records.map(r => {
      const row: Record<string, string | number | null> = { name: `D${r.lessonNumber}` };
      qtNames.forEach(name => { row[name] = rateOfQt(r, name); });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, qtNames, currentClassData, getLessonConfig]);

  const trendCardRef = useRef<HTMLDivElement>(null);
  const [exportingTrend, setExportingTrend] = useState(false);

  // 导出「入门测趋势」为 PNG，文件名带学生姓名，便于直接发给家长
  const handleExportTrend = async () => {
    const node = trendCardRef.current;
    if (!node || exportingTrend) return;
    setExportingTrend(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nickname}_入门测趋势.png`;
      a.click();
      toast.success(`已导出 ${nickname}_入门测趋势.png`);
    } catch (e) {
      toast.error('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportingTrend(false);
    }
  };

  // 入门测趋势：每次课的正确率 / 班级最高 / 班级平均 / 班级排名（班级口径含全班，请假缺勤不计）
  const entranceTrend = useMemo(() => {
    const classRecords = currentClassData?.records || [];
    return records.map(r => {
      const sameLesson = classRecords.filter(x => x.lessonNumber === r.lessonNumber && !isAbsentRecord(x));
      const rates = sameLesson.map(x => x.correctRate);
      const maxRate = rates.length ? Math.max(...rates) : 0;
      const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : 0;
      const sorted = [...sameLesson].sort((a, b) => b.correctRate - a.correctRate);
      const rank = sorted.findIndex(x => x.id === r.id) + 1;
      return {
        lesson: r.lessonNumber,
        学生正确率: r.correctRate,
        班级最高: maxRate,
        班级平均: avgRate,
        班级排名: rank || r.rank,
        班级人数: sameLesson.length,
      };
    });
  }, [records, currentClassData]);

  // 校内成绩
  const schoolData = useMemo(() =>
    [...schoolScores]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(s => ({
        name: s.date.slice(5),
        exam: s.examName,
        得分率: s.totalScore > 0 ? Math.round((s.score / s.totalScore) * 100 * 10) / 10 : 0,
        score: s.score,
        totalScore: s.totalScore,
        classRank: s.classRank,
        gradeRank: s.gradeRank,
        classSize: s.classSize,
      })),
    [schoolScores]
  );

  if (records.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{nickname} 学情分析</DialogTitle>
          </DialogHeader>
          <div className="text-center py-10 text-slate-400">
            <FileText className="w-14 h-14 mx-auto mb-3" />
            <p>该学员暂无学情记录</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[1100px] w-[96vw] max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader className="space-y-0">
          {/* 头部：头像 + 姓名 + 趋势标识 */}
          <div className="flex items-center gap-4 pt-1">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.2)] to-[rgb(var(--brand-rgb)/0.4)] flex items-center justify-center text-2xl font-bold text-[color:var(--brand-strong)] shadow-inner">
              {nickname.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                {nickname}
                <span className="text-sm font-normal text-slate-400">{studentName !== nickname ? studentName : ''}</span>
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {currentClassData && (
                  <Badge variant="outline" className="text-xs bg-[rgb(var(--brand-rgb)/0.08)] text-[color:var(--brand)] border-[rgb(var(--brand-rgb)/0.2)]">
                    <Layers className="w-3 h-3 mr-1" />{currentClassData.className}
                  </Badge>
                )}
                {kpis && kpis.trend !== 0 && (
                  <Badge variant="outline" className={`text-xs ${kpis.trend > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    {kpis.trend > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    较上次 {kpis.trend > 0 ? '+' : ''}{kpis.trend} 分
                  </Badge>
                )}
                {kpis && kpis.trend === 0 && records.length > 1 && (
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
                    <Minus className="w-3 h-3 mr-1" />与上次持平
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* 多班级切换 */}
        {allRecords.length > 1 && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {allRecords.map((data, i) => (
              <Button
                key={data.classId}
                variant={selectedClassIndex === i ? 'default' : 'outline'}
                size="sm"
                className={`h-8 rounded-xl ${selectedClassIndex === i ? 'ios-button' : 'bg-white/60'}`}
                onClick={() => setSelectedClassIndex(i)}
              >
                {data.className}
              </Button>
            ))}
          </div>
        )}

        {/* KPI 总览 */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<BarChart3 className="w-5 h-5 text-white" />} label="累计课次" value={kpis.total} sub="课" tone="bg-gradient-to-br from-sky-400 to-blue-500" />
            <KpiCard icon={<Target className="w-5 h-5 text-white" />} label="平均分" value={kpis.avg} sub={`/${kpis.fullScore}`} tone="bg-gradient-to-br from-[rgb(var(--brand-rgb))] to-[rgb(var(--brand-rgb)/0.7)]" />
            <KpiCard icon={<Trophy className="w-5 h-5 text-white" />} label="最高分" value={kpis.max} sub="分" tone="bg-gradient-to-br from-amber-400 to-orange-500" />
            <KpiCard icon={<CalendarCheck className="w-5 h-5 text-white" />} label="出勤率" value={kpis.attendanceRate} sub="%" tone="bg-gradient-to-br from-emerald-400 to-teal-500" />
          </div>
        )}

        <Tabs defaultValue="overview" className="mt-1">
          <TabsList className="bg-slate-100/80 rounded-2xl p-1 h-auto">
            <TabsTrigger value="overview" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5">
              <BarChart3 className="w-4 h-4" />成绩总览
            </TabsTrigger>
            <TabsTrigger value="detail" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5">
              <FileText className="w-4 h-4" />课次明细
            </TabsTrigger>
            <TabsTrigger value="school" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5">
              <School className="w-4 h-4" />校内成绩
            </TabsTrigger>
          </TabsList>

          {/* 成绩总览 */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[color:var(--brand)]" />总分与正确率走势
              </p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis yAxisId="score" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="score" dataKey="总分" fill="rgb(var(--brand-rgb) / 0.55)" radius={[6, 6, 0, 0]} barSize={22} />
                    <Line yAxisId="rate" type="monotone" dataKey="正确率" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[color:var(--brand)]" />题型能力雷达（平均得分率）
                </p>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} angle={30} />
                      <Radar name="得分率%" dataKey="得分率" stroke="rgb(var(--brand-rgb) / 0.9)" fill="rgb(var(--brand-rgb) / 0.25)" strokeWidth={2} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 入门测趋势：正确率 / 班级最高 / 班级平均 + 班级排名，可导出为以学生姓名命名的图片 */}
              <div ref={trendCardRef} className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[color:var(--brand)]" />入门测趋势
                    <span className="text-xs font-normal text-slate-400">{esc(nickname)} · {currentClassData.className} · 共 {entranceTrend.length} 次</span>
                  </p>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-[var(--r-md)]" onClick={handleExportTrend} disabled={exportingTrend}
                    title="导出为 PNG（文件名带学生姓名）">
                    <Download className="w-3.5 h-3.5" />{exportingTrend ? '导出中…' : '导出图片'}
                  </Button>
                </div>

                {/* 数据表：一眼看清每次课的正确率与班级位置 */}
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left font-semibold py-1.5 px-2 whitespace-nowrap">指标</th>
                        {entranceTrend.map(t => (
                          <th key={t.lesson} className="font-semibold py-1.5 px-2 whitespace-nowrap">第{t.lesson}次</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-[rgb(var(--brand-rgb)/0.05)]">
                        <td className="py-1.5 px-2 font-semibold text-slate-600 whitespace-nowrap">{esc(nickname)}正确率</td>
                        {entranceTrend.map(t => (
                          <td key={t.lesson} className={`py-1.5 px-2 text-center font-bold ${t.学生正确率 >= 80 ? 'text-emerald-600' : t.学生正确率 >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{t.学生正确率}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">班级最高正确率</td>
                        {entranceTrend.map(t => <td key={t.lesson} className="py-1.5 px-2 text-center text-slate-600">{t.班级最高}%</td>)}
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">班级平均正确率</td>
                        {entranceTrend.map(t => <td key={t.lesson} className="py-1.5 px-2 text-center text-slate-600">{t.班级平均}%</td>)}
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">班级排名【前】</td>
                        {entranceTrend.map(t => <td key={t.lesson} className="py-1.5 px-2 text-center text-slate-600">{t.班级排名}<span className="text-slate-400">/{t.班级人数}</span></td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={entranceTrend.map(t => ({
                      name: `第${t.lesson}次`,
                      学生正确率: t.学生正确率,
                      班级最高: t.班级最高,
                      班级平均: t.班级平均,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="班级最高" stroke="#cbd5e1" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="班级平均" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="学生正确率" stroke="#0a84ff" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[color:var(--brand)]" />各题型得分率趋势
                  <span className="text-xs font-normal text-slate-400">（按题型名跨课次对齐，分母为该课次满分）</span>
                </p>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qtTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {qtNames.map((name, i) => (
                        <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 课次明细（时间线） */}
          <TabsContent value="detail" className="mt-4">
            <div className="max-h-[52vh] overflow-y-auto pr-1">
              {[...records].reverse().map(record => (
                <LessonTimelineCard key={record.id} record={record} lessonConfig={getLessonConfig(currentClassData.classId, record.lessonNumber)} />
              ))}
            </div>
          </TabsContent>

          {/* 校内成绩 */}
          <TabsContent value="school" className="space-y-4 mt-4">
            {schoolData.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <School className="w-14 h-14 mx-auto mb-3" />
                <p>暂无校内成绩记录</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <School className="w-4 h-4 text-[color:var(--brand)]" />校内考试得分率走势
                  </p>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={schoolData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="得分率" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: '#8b5cf6' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">考试</th>
                        <th className="px-4 py-2.5 text-left font-medium">日期</th>
                        <th className="px-4 py-2.5 text-left font-medium">得分</th>
                        <th className="px-4 py-2.5 text-left font-medium">得分率</th>
                        <th className="px-4 py-2.5 text-left font-medium">班级排名</th>
                        <th className="px-4 py-2.5 text-left font-medium">年级排名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...schoolData].reverse().map((s, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{s.exam}</td>
                          <td className="px-4 py-2.5 text-slate-500">{s.name}</td>
                          <td className="px-4 py-2.5 tabular-nums">{s.score}/{s.totalScore}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={`text-xs ${s.得分率 >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s.得分率 >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{s.得分率}%</Badge>
                          </td>
                          <td className="px-4 py-2.5">{s.classRank ? `${s.classRank}/${s.classSize || '-'}` : '-'}</td>
                          <td className="px-4 py-2.5">{s.gradeRank || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
