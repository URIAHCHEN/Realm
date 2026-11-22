import { schoolExamKey, schoolRank, schoolRankChange, schoolScoreDate, schoolScoreIssue, schoolScoreSubject, type SchoolRankScope } from '@/lib/scoreIntake';
import { useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceDot, ReferenceLine } from 'recharts';
import { TOOLTIP_CONTENT, TOOLTIP_LABEL, AXIS_TICK, AXIS_TICK_SM, GRID, LEGEND_STYLE, LEGEND_STYLE_SM, CHART_GOOD, CHART_WARN, CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartTheme';
import { ScoreIntakeDialog } from '@/components/ScoreIntakeDialog';
import {
  Plus, Trash2, TrendingUp, Award, Upload, FileSpreadsheet,
  ClipboardList, Users, Target, CalendarDays, ArrowRight,
  BarChart3, ChevronUp, Image as ImageIcon, Sparkles, LineChart as LineChartIcon
} from 'lucide-react';
import type { SchoolScore } from '@/types';

interface SchoolScorePanelProps {
  students: string[];
  scores: SchoolScore[];
  onAddScore: (score: Omit<SchoolScore, 'id'>) => void;
  /** 批量写入（智能录入一次落整批，避免逐条触发推送） */
  onAddScores?: (rows: Omit<SchoolScore, 'id'>[]) => void;
  /** 班级昵称表：识别到的叫法也能匹配到学员 */
  nicknames?: { [studentName: string]: string };
  onDeleteScore: (studentName: string, scoreId: string) => void;
  getNickname: (name: string) => string;
}

const rateTone = (r: number): string => {
  if (r >= 90) return 'bg-emerald-100 text-emerald-700';
  if (r >= 80) return 'bg-green-100 text-green-700';
  if (r >= 70) return 'bg-amber-100 text-amber-700';
  if (r >= 60) return 'bg-orange-100 text-orange-700';
  return 'bg-rose-100 text-rose-700';
};

const rankTone = (rank?: number): { icon?: string; className: string } => {
  if (!rank) return { className: 'text-[color:var(--ink-4)]' };
  if (rank === 1) return { icon: '🥇', className: 'font-semibold text-amber-600' };
  if (rank === 2) return { icon: '🥈', className: 'font-semibold text-[color:var(--ink-4)]' };
  if (rank === 3) return { icon: '🥉', className: 'font-semibold text-orange-600' };
  return { className: 'text-[color:var(--ink-2)]' };
};

function ScoreRankChange({ a, b, scope }: { a?: SchoolScore; b?: SchoolScore; scope: SchoolRankScope }) {
  const { from, to, delta, scopeChanged } = schoolRankChange(a, b, scope);
  if (!from && !to) return <span className="text-[color:var(--ink-4)]">—</span>;
  return (
    <div className="space-y-0.5 whitespace-nowrap">
      <div className="font-medium">
        {from?.label || '—'} <span aria-label="到">→</span> {to?.label || '—'}
      </div>
      <div className="text-xs text-[color:var(--ink-4)]">
        {scopeChanged ? `口径不同${from?.method && to?.method && from.method !== to.method ? `（${from.method} → ${to.method}）` : ''}`
          : delta === undefined ? '缺一期排名'
          : delta === 0 ? '持平'
          : <span className={delta > 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta > 0 ? '前进' : '后退'} {Math.abs(delta)} 名</span>}
        {!scopeChanged && from?.method && to?.method === from.method && ` · ${from.method}`}
      </div>
    </div>
  );
}

function ScoreSourceDetails({ score }: { score: SchoolScore }) {
  const survey = score.survey;
  const fields = [
    ['就读学校', score.school], ['来源班组', survey?.group], ['年级', score.grade], ['班型', score.classType],
    ['原表得分率', survey?.reportedRate], ['排名来源', survey?.rankSource], ['调研表勾选', survey?.classSelection],
    ['是否重点班', survey?.keyClass], ['在读进步点', survey?.progress], ['在读弱项', survey?.weakness],
    ['期末得分目标', survey?.targetScore], ['期末排名目标', survey?.targetRank], ['备注', score.note],
  ].filter(([, value]) => value);
  if (!fields.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer whitespace-nowrap text-[color:var(--brand)]">档案详情</summary>
      <dl className="mt-2 grid min-w-40 max-w-64 gap-1.5 whitespace-normal">
        {fields.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[auto_1fr] gap-1.5">
            <dt className="text-[color:var(--ink-4)]">{label}</dt><dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function SchoolScorePanel({
  students,
  scores,
  onAddScore,
  onAddScores,
  nicknames,
  onDeleteScore,
  getNickname
}: SchoolScorePanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [intakeMode, setIntakeMode] = useState<'text' | 'excel' | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'progress' | 'compare'>('list');
  const [isTrendDialogOpen, setIsTrendDialogOpen] = useState(false);
  const [trendStudent, setTrendStudent] = useState<string>('');
  const [trendSubject, setTrendSubject] = useState('');
  const trendSubjects = [...new Set(scores.filter(score => score.studentName === trendStudent).map(schoolScoreSubject))];
  const activeTrendSubject = trendSubjects.includes(trendSubject) ? trendSubject : trendSubjects[0] || '';
  const [isExportingTrend, setIsExportingTrend] = useState(false);
  const trendChartRef = useRef<HTMLDivElement>(null);
  const [compareExamA, setCompareExamA] = useState<string>('');
  const [compareExamB, setCompareExamB] = useState<string>('');

  const [newScore, setNewScore] = useState<Partial<SchoolScore>>({
    studentName: '',
    examName: '',
    date: schoolScoreDate(),
    totalScore: 100,
    isRecorded: true,
    isImproved: false
  });

  const handleSave = () => {
    if (!newScore.studentName || !students.includes(newScore.studentName) || !newScore.examName?.trim() || !newScore.date) {
      toast.error('请选择学员并填写考试名称和日期');
      return;
    }
    const issue = schoolScoreIssue(newScore);
    if (issue) {
      toast.error(issue);
      return;
    }

    onAddScore({ ...newScore, examName: newScore.examName.trim() } as Omit<SchoolScore, 'id'>);
    toast.success(`已添加 ${getNickname(newScore.studentName)} 的「${newScore.examName}」成绩`);
    setIsDialogOpen(false);
    setNewScore({
      studentName: '',
      examName: '',
      date: schoolScoreDate(),
      totalScore: 100,
      isRecorded: true,
      isImproved: false
    });
  };

  // 导出趋势图为图片
  const handleExportTrendImage = async () => {
    if (!trendChartRef.current || !trendStudent || isExportingTrend) return;
    setIsExportingTrend(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const target = trendChartRef.current;
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
      link.download = `${getNickname(trendStudent)}_${activeTrendSubject}_校内成绩趋势.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('趋势图已导出');
    } catch (err) {
      console.error(err);
      toast.error('导出失败：' + err);
    } finally {
      setIsExportingTrend(false);
    }
  };

  const groupedScores = useMemo(() => {
    const groups = new Map<string, SchoolScore[]>();
    for (const score of scores) {
      const key = schoolExamKey(score);
      const group = groups.get(key);
      if (group) group.push(score);
      else groups.set(key, [score]);
    }
    return groups;
  }, [scores]);

  const examEntries = useMemo(() =>
    Array.from(groupedScores, ([examId, list]) => {
      const { examName, date } = list[0];
      const subject = schoolScoreSubject(list[0]);
      const sorted = [...list].sort((a, b) => b.score / (b.totalScore || Infinity) - a.score / (a.totalScore || Infinity));
      const rates = list.filter(s => !schoolScoreIssue({ score: s.score, totalScore: s.totalScore }))
        .map(s => s.score / s.totalScore * 100);
      const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : 0;
      return { examId, examName, date, subject, label: [examName, date, subject].filter(Boolean).join(' · '),
        list: sorted, avgRate };
    }).sort((a, b) => b.date.localeCompare(a.date)),
    [groupedScores]
  );
  const lastExam = examEntries.find(exam => exam.examId === compareExamB) ?? examEntries[0];
  const earlierExams = lastExam ? examEntries.filter(exam => exam.examId !== lastExam.examId && exam.subject === lastExam.subject && exam.date <= lastExam.date) : [];
  const firstExam = earlierExams.find(exam => exam.examId === compareExamA) ?? earlierExams[0];

  const coveredStudents = useMemo(() =>
    new Set(scores.map(s => s.studentName)).size,
    [scores]
  );

  const avgRateAll = useMemo(() => {
    const rates = scores.filter(score => !schoolScoreIssue({ score: score.score, totalScore: score.totalScore }))
      .map(score => score.score / score.totalScore * 100);
    return rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length * 10) / 10 : 0;
  }, [scores]);

  // 进步之星：同一学生在多次考试中的提升
  const progressStars = useMemo(() => {
    const studentScores = new Map<string, SchoolScore[]>();
    groupedScores.forEach(list => list.forEach(score => {
      const key = JSON.stringify([score.studentName, schoolScoreSubject(score)]);
      const group = studentScores.get(key);
      if (group) {
        if (!group.some(row => schoolExamKey(row) === schoolExamKey(score))) group.push(score);
      } else {
        studentScores.set(key, [score]);
      }
    }));

    return Array.from(studentScores.entries())
      .map(([key, list]) => {
        const name = list[0].studentName;
        const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstRate = first.totalScore > 0 ? (first.score / first.totalScore) * 100 : 0;
        const lastRate = last.totalScore > 0 ? (last.score / last.totalScore) * 100 : 0;
        const rateImprovement = lastRate - firstRate;
        // 保留一位小数：浮点减法噪声（如 4.899999999999999）直接显示很扎眼
        const scoreImprovement = first.totalScore === last.totalScore ? Math.round((last.score - first.score) * 10) / 10 : undefined;
        const rankImprovement = schoolRankChange(first, last, 'class').delta;
        return {
          key,
          name,
          subject: schoolScoreSubject(first),
          nickname: getNickname(name),
          firstExam: `${first.examName} ${first.date}`,
          lastExam: `${last.examName} ${last.date}`,
          firstScore: first.score,
          lastScore: last.score,
          firstRate,
          lastRate,
          scoreImprovement,
          rateImprovement,
          rankImprovement,
          examCount: sorted.length
        };
      })
      .filter(item => item.examCount >= 2 && item.rateImprovement > 0)
      .sort((a, b) => b.rateImprovement - a.rateImprovement);
  }, [groupedScores, getNickname]);

  // 阶段对比数据
  const compareData = useMemo(() => {
    if (!firstExam || !lastExam) return [];
    const index = (list: SchoolScore[]) => {
      const map = new Map<string, SchoolScore | null>();
      for (const score of list) map.set(score.studentName, map.has(score.studentName) ? null : score);
      return map;
    };
    const aMap = index(firstExam.list);
    const bMap = index(lastExam.list);

    const allStudents = new Set([...aMap.keys(), ...bMap.keys()]);
    return Array.from(allStudents).map(name => {
      const a = aMap.get(name) ?? undefined;
      const b = bMap.get(name) ?? undefined;
      const aRate = a && a.totalScore > 0 ? (a.score / a.totalScore) * 100 : 0;
      const bRate = b && b.totalScore > 0 ? (b.score / b.totalScore) * 100 : 0;
      const scoreDiff = a && b && a.totalScore === b.totalScore ? Math.round((b.score - a.score) * 100) / 100 : undefined;
      const rateDiff = a && b ? Math.round((bRate - aRate) * 10) / 10 : undefined;

      return {
        name,
        nickname: getNickname(name),
        a,
        b,
        aRate,
        bRate,
        scoreDiff,
        rateDiff,
        hasMultiple: aMap.get(name) === null || bMap.get(name) === null
      };
    }).sort((x, y) => {
      // 有两次成绩的优先，按提升率排序
      if (x.rateDiff === undefined) return y.rateDiff === undefined ? 0 : 1;
      if (y.rateDiff === undefined) return -1;
      return y.rateDiff - x.rateDiff;
    });
  }, [firstExam, lastExam, getNickname]);

  const kpis = [
    { icon: ClipboardList, label: '考试场次', value: String(examEntries.length) },
    { icon: FileSpreadsheet, label: '成绩条数', value: String(scores.length) },
    { icon: Target, label: '平均得分率', value: `${avgRateAll}%` },
    { icon: Users, label: '已覆盖学生', value: `${coveredStudents}/${students.length}` },
  ];

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}>
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-[color:var(--ink)]">校内成绩管理</p>
            <p className="text-xs text-[color:var(--ink-4)]">按考试归组追踪班级校内成绩、得分率与排名变化</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline" aria-label="导入 Excel" title="导入 Excel"
            disabled={!students.length || !onAddScores}
            onClick={() => setIntakeMode('excel')}
            className="rounded-[var(--r-md)] gap-2"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">导入Excel</span>
          </Button>
          <Button
            variant="outline" aria-label="智能录入" title="粘贴文本或识别图片，批量录入成绩"
            onClick={() => setIntakeMode('text')}
            className="rounded-[var(--r-md)] gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">智能录入</span>
          </Button>
          <Button
            variant="outline" aria-label="导出趋势图" title="导出趋势图"
            disabled={scores.length === 0}
            onClick={() => {
              const namesWithData = new Set(scores.map(s => s.studentName));
              const first = students.find(s => namesWithData.has(s)) || students[0] || '';
              setTrendStudent(first);
              setIsTrendDialogOpen(true);
            }}
            className="rounded-[var(--r-md)] gap-2"
          >
            <LineChartIcon className="w-4 h-4" />
            <span className="hidden sm:inline">导出趋势图</span>
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="ios-button gap-2" aria-label="添加成绩" title="添加成绩">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">添加成绩</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>添加校内成绩</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>学生姓名</Label>
                    <Select
                      value={newScore.studentName}
                      onValueChange={(v) => setNewScore(prev => ({ ...prev, studentName: v }))}
                    >
                      <SelectTrigger className="w-full rounded-xl ios-input"><SelectValue placeholder="选择学生" /></SelectTrigger>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s} value={s}>{getNickname(s)}（{s}）</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>考试名称</Label>
                    <Input
                      placeholder="如期中考试、月考、Day1巩固练习"
                      value={newScore.examName}
                      onChange={(e) => setNewScore(prev => ({ ...prev, examName: e.target.value }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>考试日期</Label>
                    <Input
                      type="date"
                      value={newScore.date}
                      onChange={(e) => setNewScore(prev => ({ ...prev, date: e.target.value }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>得分</Label>
                    <Input
                      type="number"
                      value={newScore.score ?? ''}
                      min={0}
                      step={"any"}
                      onChange={(e) => setNewScore(prev => ({ ...prev, score: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>总分</Label>
                    <Input
                      type="number"
                      value={newScore.totalScore ?? ''}
                      min={0}
                      step={"any"}
                      onChange={(e) => setNewScore(prev => ({ ...prev, totalScore: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>班级排名</Label>
                    <Input
                      type="number"
                      value={newScore.classRank ?? ''}
                      min={1}
                      step={1}
                      onChange={(e) => setNewScore(prev => ({ ...prev, classRank: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>年级排名</Label>
                    <Input
                      type="number"
                      value={newScore.gradeRank ?? ''}
                      min={1}
                      step={1}
                      onChange={(e) => setNewScore(prev => ({ ...prev, gradeRank: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {([['classSize', '班级人数'], ['gradeSize', '年级人数']] as const).map(([key, label]) => (
                    <label key={key} className="space-y-1.5 text-sm">
                      <span>{label}</span>
                      <Input
                        type="number" min={1} step={1}
                        value={newScore[key] ?? ''}
                        onChange={event => setNewScore(prev => ({ ...prev, [key]: event.target.value ? Number(event.target.value) : undefined }))}
                        className="rounded-xl ios-input"
                      />
                    </label>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label>在读学校</Label>
                  <Input
                    placeholder="如 四中逸园（可留空）"
                    value={newScore.school || ''}
                    onChange={(e) => setNewScore(prev => ({ ...prev, school: e.target.value }))}
                    className="rounded-xl ios-input"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>备注</Label>
                  <Input
                    placeholder="可选"
                    value={newScore.note || ''}
                    onChange={(e) => setNewScore(prev => ({ ...prev, note: e.target.value }))}
                    className="rounded-xl ios-input"
                  />
                </div>

                <Button onClick={handleSave} className="w-full ios-button">保存成绩</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI 瓷贴 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="ios-glass-card border-0">
              <CardContent className="pt-4 pb-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgb(var(--brand-rgb)/0.1)]">
                  <Icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-[color:var(--ink)] leading-tight">{k.value}</p>
                  <p className="text-xs text-[color:var(--ink-4)]">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 视图切换 */}
      {examEntries.length > 0 && (
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)} className="space-y-4">
          <TabsList className="mode-seg-grid school-score-tabs w-full max-w-md" aria-label="校内成绩视图">
            <TabsTrigger value="list" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              成绩列表
            </TabsTrigger>
            <TabsTrigger value="progress" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              进步之星
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              阶段对比
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {examEntries.map(({ examId, examName, date, subject, list, avgRate }) => (
              <Card key={examId} className="ios-glass-card border-0 overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2"
                  style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.75))' }}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-white">
                    <Award className="w-5 h-5" />
                    <span className="font-semibold">{examName}</span>
                    {date && (
                      <Badge className="bg-white/20 text-white border-0 rounded-full gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {date}
                      </Badge>
                    )}
                    <span className="text-xs text-white/90">{subject}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-white/90 text-xs">
                    <span>{list.length} 名学生</span>
                    <span className="w-px h-3.5 bg-white/30" />
                    <span>班均得分率 <span className="font-bold text-white">{avgRate}%</span></span>
                  </div>
                </div>
                <CardContent className="pt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>姓名</TableHead>
                        <TableHead>得分</TableHead>
                        <TableHead>总分</TableHead>
                        <TableHead>得分率</TableHead>
                        <TableHead>班排</TableHead>
                        <TableHead>级排</TableHead>
                        <TableHead>来源信息</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map(score => {
                        const correctRate = score.totalScore > 0
                          ? Math.round((score.score / score.totalScore) * 100 * 10) / 10
                          : 0;
                        const ct = rankTone(score.classRank);
                        const gt = rankTone(score.gradeRank);
                        const classRanking = schoolRank(score, 'class');
                        const gradeRanking = schoolRank(score, 'grade');
                        return (
                          <TableRow key={score.id} className="hover:bg-black/[0.03]">
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}>
                                  {getNickname(score.studentName).slice(0, 1)}
                                </span>
                                <span className="font-medium text-[color:var(--ink)]">{getNickname(score.studentName)}</span>
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-bold text-[color:var(--ink)]">{score.score}</span>
                              <span className="text-[color:var(--ink-4)] text-xs"> 分</span>
                            </TableCell>
                            <TableCell className="text-[color:var(--ink-4)]">{score.totalScore}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge className={`${rateTone(correctRate)} border-0 rounded-full font-semibold`}>
                                  {correctRate}%
                                </Badge>
                                <div className="w-16 h-1.5 rounded-full bg-black/[0.05] overflow-hidden hidden md:block">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, correctRate)}%`,
                                      background: correctRate >= 80 ? '#10b981' : correctRate >= 60 ? '#f59e0b' : '#f43f5e'
                                    }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={ct.className}>{ct.icon && <span className="mr-0.5">{ct.icon}</span>}{classRanking?.label || '—'}</span>
                              {classRanking?.method && <small className="block text-[color:var(--ink-4)]">{classRanking.method}</small>}
                            </TableCell>
                            <TableCell>
                              <span className={gt.className}>{gt.icon && <span className="mr-0.5">{gt.icon}</span>}{gradeRanking?.label || '—'}</span>
                              {gradeRanking?.method && <small className="block text-[color:var(--ink-4)]">{gradeRanking.method}</small>}
                            </TableCell>
                            <TableCell><ScoreSourceDetails score={score} /></TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="删除成绩"
                                onClick={() => {
                                  onDeleteScore(score.studentName, score.id);
                                }}
                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="progress">
            <Card className="ios-glass-card border-0">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                  <h3 className="font-semibold text-[color:var(--ink)]">进步之星</h3>
                  <span className="text-xs text-[color:var(--ink-4)]">按同一学员、同一科目的得分率提升幅度排序</span>
                </div>
                {progressStars.length > 0 ? (
                  <div className="space-y-3">
                    {progressStars.map((s, i) => (
                      <div key={s.key} className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-white/60 border border-black/[0.06]">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{
                            background: i === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' :
                              i === 1 ? 'linear-gradient(135deg, #e5e7eb, #9ca3af)' :
                                i === 2 ? 'linear-gradient(135deg, #fdba74, #ea580c)' :
                                  'linear-gradient(135deg, #f1f5f9, #cbd5e1)',
                            color: i < 3 ? 'white' : '#64748b'
                          }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[color:var(--ink)]">{s.nickname}</span>
                            <span className="text-xs text-[color:var(--ink-4)]">{s.subject} · 共{s.examCount}次考试</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-[color:var(--ink-4)]">
                            <span>{s.firstExam} {s.firstScore}分</span>
                            <ArrowRight className="w-3 h-3" />
                            <span>{s.lastExam} {s.lastScore}分</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-emerald-600 font-bold">
                            <ChevronUp className="w-4 h-4" />
                            +{s.rateImprovement.toFixed(1)}%
                          </div>
                          <div className="text-xs text-[color:var(--ink-4)]">
                            {[s.scoreImprovement !== undefined ? `${s.scoreImprovement >= 0 ? '+' : ''}${s.scoreImprovement}分` : '',
                              s.rankImprovement !== undefined && s.rankImprovement > 0 ? `排名前进 ${s.rankImprovement} 名` : ''].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-[color:var(--ink-4)]">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-40" />
                    <p className="font-medium text-[color:var(--ink-2)]">暂无进步之星数据</p>
                    <p className="text-sm mt-2">同一学员同科目的得分率提升后会显示在这里</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare">
            <Card className="ios-glass-card border-0">
              <CardContent className="pt-5 pb-4">
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                    <h3 className="font-semibold text-[color:var(--ink)]">阶段对比</h3>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Select value={firstExam?.examId ?? ''} onValueChange={setCompareExamA}>
                      <SelectTrigger className="w-full min-w-0 rounded-xl sm:w-60" aria-label="对比基准考试">
                        <SelectValue placeholder="同科目没有其他考试" />
                      </SelectTrigger>
                      <SelectContent>
                        {earlierExams.map(exam => (
                          <SelectItem key={exam.examId} value={exam.examId}>{exam.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={lastExam?.examId ?? ''} onValueChange={setCompareExamB}>
                      <SelectTrigger className="w-full min-w-0 rounded-xl sm:w-60" aria-label="对比目标考试">
                        <SelectValue placeholder="选择目标考试" />
                      </SelectTrigger>
                      <SelectContent>
                        {examEntries.map(exam => (
                          <SelectItem key={exam.examId} value={exam.examId}>{exam.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <p className="mb-3 text-xs text-[color:var(--ink-4)]">同科目跨期对比。满分不同时看得分率百分点，排名并列展示名次和人数。<span className="sm:hidden"> 横向滑动可查看排名。</span></p>
                {compareData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>姓名</TableHead>
                        <TableHead>{firstExam?.label}</TableHead>
                        <TableHead>{lastExam?.label}</TableHead>
                        <TableHead>分数变化</TableHead>
                        <TableHead>得分率变化</TableHead>
                        <TableHead>班排变化</TableHead>
                        <TableHead>级排变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compareData.map(item => (
                        <TableRow key={item.name} className="hover:bg-black/[0.03]">
                          <TableCell className="whitespace-nowrap font-medium text-[color:var(--ink)]">
                            {item.nickname}
                            {item.hasMultiple && <small className="block text-amber-700">有多条成绩待核对</small>}
                          </TableCell>
                          <TableCell>
                            {item.a ? (
                              <div className="flex flex-col">
                                <span className="font-semibold">{item.a.score}/{item.a.totalScore} 分</span>
                                <span className="text-xs text-[color:var(--ink-4)]">{item.aRate.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="text-[color:var(--ink-4)]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.b ? (
                              <div className="flex flex-col">
                                <span className="font-semibold">{item.b.score}/{item.b.totalScore} 分</span>
                                <span className="text-xs text-[color:var(--ink-4)]">{item.bRate.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="text-[color:var(--ink-4)]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.scoreDiff !== undefined ? (
                              <span className={`font-semibold ${item.scoreDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {item.scoreDiff >= 0 ? '+' : ''}{item.scoreDiff}分
                              </span>
                            ) : (
                              <span className="text-[color:var(--ink-4)]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.rateDiff !== undefined ? (
                              <span className={`font-semibold ${item.rateDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {item.rateDiff >= 0 ? '+' : ''}{item.rateDiff.toFixed(1)} 个百分点
                              </span>
                            ) : (
                              <span className="text-[color:var(--ink-4)]">-</span>
                            )}
                          </TableCell>
                          <TableCell><ScoreRankChange a={item.a} b={item.b} scope="class" /></TableCell>
                          <TableCell><ScoreRankChange a={item.a} b={item.b} scope="grade" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-[color:var(--ink-4)]">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-40" />
                    <p className="font-medium text-[color:var(--ink-2)]">请选择两场考试进行对比</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* 成绩列表（无数据时） */}
      {examEntries.length === 0 && (
        <Card className="ios-glass-card border-0">
          <CardContent>
            <div className="empty-general">
              <span className="empty-ico"><FileSpreadsheet className="w-6 h-6" /></span>
              <div className="empty-t">暂无校内成绩记录</div>
              <div className="empty-d">
                导入 Excel 或粘贴表格，确认考试名称、日期和本班成绩后写入。
                也可点右上角「添加成绩」手工录入。
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 趋势图导出弹窗 */}
      <Dialog open={isTrendDialogOpen} onOpenChange={setIsTrendDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>校内成绩趋势图导出</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <Label>选择学员</Label>
            <Select value={trendStudent} onValueChange={setTrendStudent}>
              <SelectTrigger className="w-56"><SelectValue placeholder="选择学员" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set(scores.map(s => s.studentName))).map(name => (
                  <SelectItem key={name} value={name}>{getNickname(name)}（{name}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {trendSubjects.length > 1 && (
              <Select value={activeTrendSubject} onValueChange={setTrendSubject}>
                <SelectTrigger className="w-24" aria-label="趋势图科目"><SelectValue /></SelectTrigger>
                <SelectContent>{trendSubjects.map(subject => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button className="ml-auto gap-2 ios-button" disabled={isExportingTrend || !activeTrendSubject} onClick={handleExportTrendImage}>
              <ImageIcon className="w-4 h-4" />
              {isExportingTrend ? '生成中...' : '导出图片'}
            </Button>
          </div>
          <div ref={trendChartRef} className="mt-4 bg-white p-6 rounded-2xl">
            <TrendChartExport student={trendStudent} subject={activeTrendSubject} scores={scores} getNickname={getNickname} />
          </div>
        </DialogContent>
      </Dialog>

      {onAddScores && (['text', 'excel'] as const).map(mode => (
        <ScoreIntakeDialog
          key={mode}
          mode={mode}
          open={intakeMode === mode}
          onOpenChange={open => setIntakeMode(open ? mode : null)}
          students={students}
          nicknames={nicknames}
          existingScores={scores}
          onSave={onAddScores}
          getNickname={getNickname}
        />
      ))}
    </div>
  );
}

// 趋势图导出组件
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function TrendChartExport({ student, subject, scores, getNickname }: { student: string; subject: string; scores: SchoolScore[]; getNickname: (name: string) => string }) {
  const studentScores = useMemo(() =>
    scores.filter(s => s.studentName === student && schoolScoreSubject(s) === subject).sort((a, b) => a.date.localeCompare(b.date)),
    [scores, student, subject]
  );

  const lineData = useMemo(() => {
    return studentScores.map((s, index) => {
      const studentRate = s.totalScore > 0 ? Math.round((s.score / s.totalScore) * 100 * 10) / 10 : 0;
      // 同次考试的所有学生成绩，计算班级最高和平均
      const sameExam = scores.filter(x => schoolExamKey(x) === schoolExamKey(s) && x.totalScore > 0);
      const rates = sameExam.map(x => (x.score / x.totalScore) * 100);
      const max = rates.length > 0 ? Math.max(...rates) : 0;
      const avg = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : 0;
      return {
        index,
        name: s.examName.length > 8 ? s.examName.slice(0, 8) + '…' : s.examName,
        fullName: `${s.examName} · ${s.date}`,
        date: s.date,
        studentRate,
        classMax: Math.round(max * 10) / 10,
        classAvg: avg,
        classRank: schoolRank(s, 'class'),
        gradeRank: schoolRank(s, 'grade')
      };
    });
  }, [studentScores, scores]);

  const pieData = studentScores.map(s => ({ name: `${s.examName} · ${s.date}`, value: s.score }));
  const improvements = lineData.slice(1).flatMap((point, index) => {
    const diff = point.studentRate - lineData[index].studentRate;
    return diff >= 5 ? [{ point, improvement: Math.round(diff * 10) / 10 }] : [];
  });

  if (!student || studentScores.length === 0) {
    return <div className="text-center py-12 text-[color:var(--ink-4)]">所选学员暂无校内成绩数据</div>;
  }

  const nickname = getNickname(student);
  const latestRate = lineData[lineData.length - 1]?.studentRate ?? 0;
  const firstRate = lineData[0]?.studentRate ?? 0;
  const totalImprovement = Math.round((latestRate - firstRate) * 10) / 10;
  const bestRank = Math.min(...studentScores.map(s => s.classRank || 0).filter(r => r > 0));

  return (
    <div className="space-y-5">
      {/* 报告头 */}
      <div className="text-center pb-3 border-b border-black/[0.06]">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[color:var(--brand)] to-cyan-600 bg-clip-text text-transparent">
          校内成绩趋势报告
        </h2>
        <p className="text-[color:var(--ink-4)] mt-1">
          学员姓名：<span className="font-semibold text-[color:var(--ink)]">{nickname}</span>
          <span className="mx-3 text-[color:var(--ink-4)]">|</span>
          {subject} · 共 <span className="font-semibold text-[color:var(--ink)]">{studentScores.length}</span> 次考试
          {improvements.length > 0 && (
            <>
              <span className="mx-3 text-[color:var(--ink-4)]">|</span>
              <span className="text-emerald-600 font-semibold">进步课次 {improvements.length} 次</span>
            </>
          )}
        </p>
      </div>

      {/* KPI 瓷贴 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.10)] to-cyan-50 border border-[rgb(var(--brand-rgb)/0.22)]">
          <p className="text-xs text-[color:var(--ink-4)] mb-1">最近得分率</p>
          <p className="text-2xl font-bold text-[color:var(--brand)]">{latestRate}%</p>
        </div>
        <div className={`p-4 rounded-xl border ${totalImprovement >= 0 ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-100' : 'bg-gradient-to-br from-rose-50 to-orange-50 border-rose-100'}`}>
          <p className="text-xs text-[color:var(--ink-4)] mb-1">总体提升</p>
          <p className={`text-2xl font-bold ${totalImprovement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {totalImprovement >= 0 ? '+' : ''}{totalImprovement}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100">
          <p className="text-xs text-[color:var(--ink-4)] mb-1">最佳班级排名</p>
          <p className="text-2xl font-bold text-amber-700">{Number.isFinite(bestRank) ? `第${bestRank}名` : '-'}</p>
        </div>
      </div>

      {/* 折线图 */}
      <div className="rounded-xl border border-black/[0.06] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-[color:var(--ink)] flex items-center gap-2">
            <LineChartIcon className="w-4 h-4 text-[color:var(--brand)]" />
            历次得分率趋势
          </h3>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="index" tickFormatter={index => lineData[index]?.name ?? ''} tickLine={false} axisLine={false} tick={AXIS_TICK} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} unit="%" tick={AXIS_TICK_SM} />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT}
                labelStyle={TOOLTIP_LABEL}
                formatter={(v: number, k: string) => [`${v}%`, k]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="classMax" name="班级最高" stroke={CHART_NEUTRAL} strokeWidth={1.8} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="classAvg" name="班级平均" stroke={CHART_WARN} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="studentRate" name="学员得分率" stroke={CHART_SERIES[0]} strokeWidth={3} dot={{ r: 5, fill: CHART_SERIES[0] }} activeDot={{ r: 7 }} />
              <ReferenceLine y={80} stroke={CHART_WARN} strokeDasharray="4 4" label={{ value: '达标线 80%', fontSize: 10.5, fill: CHART_WARN, position: 'insideTopRight' }} />
              <ReferenceLine y={85} stroke={CHART_GOOD} strokeDasharray="4 4" label={{ value: '优秀线 85%', fontSize: 10.5, fill: CHART_GOOD, position: 'insideTopLeft' }} />
              {improvements.map(({ point }) => (
                <ReferenceDot key={point.index} x={point.index} y={point.studentRate}
                  r={9} fill="#10b981" stroke="#fff" strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 饼图 + 进步课次 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-black/[0.06] p-4">
          <h3 className="font-semibold text-[color:var(--ink)] mb-2 flex items-center gap-2 text-sm">
            <Target className="w-4 h-4 text-[color:var(--brand)]" />
            各次得分分布
          </h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={LEGEND_STYLE_SM} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-black/[0.06] p-4">
          <h3 className="font-semibold text-[color:var(--ink)] mb-2 flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            高亮进步课次（相对上次提升至少 5 个百分点）
          </h3>
          {improvements.length > 0 ? (
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {improvements.map((imp, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <span className="text-sm text-[color:var(--ink-2)] truncate">{imp.point.fullName}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">+{imp.improvement}%</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-[color:var(--ink-4)] py-12">暂无显著进步课次</div>
          )}
        </div>
      </div>

      {/* 历次汇总表（参考附图） */}
      <div className="rounded-xl border border-black/[0.06] overflow-hidden">
        <div className="px-4 py-2 bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.10)] to-cyan-50 border-b border-[rgb(var(--brand-rgb)/0.22)]">
          <h3 className="font-semibold text-[color:var(--ink)] text-sm">一、历次情况汇总</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-[color:var(--brand)] from-[color:var(--brand)] text-white">
                <th className="px-3 py-2 text-left whitespace-nowrap">项目</th>
                {lineData.map((d, i) => (
                  <th key={i} className="px-3 py-2 text-center whitespace-nowrap">{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium text-[color:var(--ink-2)]">{nickname}</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center">
                    <span className={d.studentRate >= 80 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{d.studentRate}%</span>
                  </td>
                ))}
              </tr>
              <tr className="bg-[rgb(var(--brand-rgb)/0.08)]">
                <td className="px-3 py-2 font-medium text-[color:var(--ink-2)]">班级最高得分率</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center text-purple-700 font-semibold">{d.classMax}%</td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium text-[color:var(--ink-2)]">班级平均得分率</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center text-[color:var(--ink-2)] font-semibold">{d.classAvg}%</td>
                ))}
              </tr>
              <tr className="bg-[rgb(var(--brand-rgb)/0.08)]">
                <td className="px-3 py-2 font-medium text-[color:var(--ink-2)]">班级排名</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center font-semibold">{d.classRank?.label || '—'}{d.classRank?.method && ` · ${d.classRank.method}`}</td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium text-[color:var(--ink-2)]">年级排名</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center font-semibold">{d.gradeRank?.label || '—'}{d.gradeRank?.method && ` · ${d.gradeRank.method}`}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
