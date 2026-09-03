// 学员学情分析弹窗 —— 现代化管理后台风格：KPI 总览 + 多维图表 + 课次时间线 + 校内成绩
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  CalendarCheck, BookOpen, Mic, Trophy, Layers, FileText, Target
} from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore, QuestionType } from '@/types';

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

// 考勤徽章
const attendanceBadge = (status: string) => {
  const map: Record<string, string> = {
    '按时出勤': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '迟到': 'bg-amber-50 text-amber-700 border-amber-200',
    '缺勤': 'bg-rose-50 text-rose-700 border-rose-200',
    '请假': 'bg-blue-50 text-blue-700 border-blue-200',
    '调课': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</Badge>;
};

// 作业徽章
const homeworkBadge = (status: string) => {
  const map: Record<string, string> = {
    '超赞完成': 'bg-amber-50 text-amber-700 border-amber-200',
    '圆满完成': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '基本完成': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    '没带': 'bg-orange-50 text-orange-700 border-orange-200',
    '未完成': 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</Badge>;
};

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
function LessonTimelineCard({ record, questionTypes }: { record: StudentRecord; questionTypes: QuestionType[] }) {
  const fullScore = questionTypes.reduce((s, q) => s + q.fullScore, 0);
  const rateTrend = record.correctRate >= 80 ? 'text-emerald-600' : record.correctRate >= 60 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="relative pl-6">
      {/* 时间线轴点 */}
      <div className="absolute left-0 top-6 w-3 h-3 rounded-full bg-[color:var(--accent)] ring-4 ring-[rgb(var(--accent-rgb)/0.15)]" />
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
            <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">
              <Mic className="w-3 h-3 mr-1" />
              {record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus}
            </Badge>
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
          <span className="font-bold text-lg text-[color:var(--accent)]">{record.totalScore}<span className="text-xs font-medium text-slate-400">/{fullScore}</span></span>
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">第 {record.rank} 名</Badge>
          <span className={`font-semibold ${rateTrend}`}>正确率 {record.correctRate}%</span>
          {record.note && <span className="text-xs text-slate-400 truncate max-w-[240px]" title={record.note}>📝 {record.note}</span>}
        </div>
      </div>
    </div>
  );
}

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

  // 统一取最新课次的题型配置
  const questionTypes = useMemo(() => {
    if (records.length === 0) return [];
    const configs = records.map(r => getLessonConfig(currentClassData.classId, r.lessonNumber));
    return configs[configs.length - 1].questionTypes;
  }, [records, currentClassData, getLessonConfig]);

  // KPI 统计
  const kpis = useMemo(() => {
    if (records.length === 0) return null;
    const scores = records.map(r => r.totalScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const avgRate = Math.round(records.reduce((a, r) => a + r.correctRate, 0) / records.length * 10) / 10;
    const latest = records[records.length - 1];
    const prev = records[records.length - 2];
    const trend = prev ? latest.totalScore - prev.totalScore : 0;
    const fullScore = questionTypes.reduce((s, q) => s + q.fullScore, 0);
    const attendanceRate = Math.round(records.filter(r => r.attendance === '按时出勤').length / records.length * 100);
    return { total: records.length, avg, max, min, avgRate, latest, trend, fullScore, attendanceRate };
  }, [records, questionTypes]);

  // 总分 + 正确率组合图
  const trendChartData = useMemo(() =>
    records.map(r => ({ name: `D${r.lessonNumber}`, 总分: r.totalScore, 正确率: r.correctRate })),
    [records]
  );

  // 题型雷达图（平均得分率 %）
  const radarData = useMemo(() => {
    if (records.length === 0) return [];
    return questionTypes.map(qt => {
      const pcts = records.map(r => {
        const score = r.scores[qt.id] || 0;
        return qt.fullScore > 0 ? (score / qt.fullScore) * 100 : 0;
      });
      return { subject: qt.name, 得分率: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10 };
    });
  }, [records, questionTypes]);

  // 各题型分数多线趋势
  const qtTrendData = useMemo(() => {
    return records.map(r => {
      const row: Record<string, string | number> = { name: `D${r.lessonNumber}` };
      questionTypes.forEach(qt => { row[qt.name] = r.scores[qt.id] || 0; });
      return row;
    });
  }, [records, questionTypes]);

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
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(var(--accent-rgb)/0.2)] to-[rgb(var(--accent-rgb)/0.4)] flex items-center justify-center text-2xl font-bold text-[color:var(--accent-strong)] shadow-inner">
              {nickname.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                {nickname}
                <span className="text-sm font-normal text-slate-400">{studentName !== nickname ? studentName : ''}</span>
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {currentClassData && (
                  <Badge variant="outline" className="text-xs bg-[rgb(var(--accent-rgb)/0.08)] text-[color:var(--accent)] border-[rgb(var(--accent-rgb)/0.2)]">
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
            <KpiCard icon={<Target className="w-5 h-5 text-white" />} label="平均分" value={kpis.avg} sub={`/${kpis.fullScore}`} tone="bg-gradient-to-br from-violet-400 to-purple-500" />
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
                <TrendingUp className="w-4 h-4 text-[color:var(--accent)]" />总分与正确率走势
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
                    <Bar yAxisId="score" dataKey="总分" fill="rgb(var(--accent-rgb) / 0.55)" radius={[6, 6, 0, 0]} barSize={22} />
                    <Line yAxisId="rate" type="monotone" dataKey="正确率" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[color:var(--accent)]" />题型能力雷达（平均得分率）
                </p>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} angle={30} />
                      <Radar name="得分率%" dataKey="得分率" stroke="rgb(var(--accent-rgb) / 0.9)" fill="rgb(var(--accent-rgb) / 0.25)" strokeWidth={2} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl bg-white/70 backdrop-blur border border-black/5 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[color:var(--accent)]" />各题型分数趋势
                </p>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qtTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {questionTypes.map((qt, i) => (
                        <Line key={qt.id} type="monotone" dataKey={qt.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
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
                <LessonTimelineCard key={record.id} record={record} questionTypes={questionTypes} />
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
                    <School className="w-4 h-4 text-[color:var(--accent)]" />校内考试得分率走势
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
