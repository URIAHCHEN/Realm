import { useState, useRef, useMemo, useEffect } from 'react';
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceDot } from 'recharts';
import html2canvas from 'html2canvas';
import {
  Plus, Trash2, TrendingUp, Award, Upload, FileSpreadsheet,
  ClipboardList, Users, Target, CalendarDays, Medal, ArrowRight,
  BarChart3, ChevronUp, ChevronDown, AlertCircle, Image as ImageIcon, Sparkles, LineChart as LineChartIcon
} from 'lucide-react';
import type { SchoolScore } from '@/types';

interface SchoolScorePanelProps {
  students: string[];
  scores: SchoolScore[];
  onAddScore: (score: Omit<SchoolScore, 'id'>) => void;
  onDeleteScore: (studentName: string, scoreId: string) => void;
  onImportExcel: (file: File) => Promise<{ success: number; failed: number; errors: string[]; unmatched: string[] }>;
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
  if (!rank) return { className: 'text-[#8e8e93]' };
  if (rank === 1) return { icon: '🥇', className: 'font-semibold text-amber-600' };
  if (rank === 2) return { icon: '🥈', className: 'font-semibold text-slate-500' };
  if (rank === 3) return { icon: '🥉', className: 'font-semibold text-orange-600' };
  return { className: 'text-[#3a3a3c]' };
};

export function SchoolScorePanel({
  students,
  scores,
  onAddScore,
  onDeleteScore,
  onImportExcel,
  getNickname
}: SchoolScorePanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[]; unmatched: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<'list' | 'progress' | 'compare'>('list');
  const [isTrendDialogOpen, setIsTrendDialogOpen] = useState(false);
  const [trendStudent, setTrendStudent] = useState<string>('');
  const [isExportingTrend, setIsExportingTrend] = useState(false);
  const trendChartRef = useRef<HTMLDivElement>(null);
  const [compareExamA, setCompareExamA] = useState<string>('');
  const [compareExamB, setCompareExamB] = useState<string>('');

  const [newScore, setNewScore] = useState<Partial<SchoolScore>>({
    studentName: '',
    examName: '',
    date: new Date().toISOString().split('T')[0],
    score: 0,
    totalScore: 100,
    classRank: 0,
    gradeRank: 0,
    isRecorded: true,
    isImproved: false
  });

  const handleSave = () => {
    if (!newScore.studentName || !newScore.examName) {
      toast.error('请选择学生并填写考试名称');
      return;
    }

    onAddScore(newScore as Omit<SchoolScore, 'id'>);
    toast.success(`已添加 ${getNickname(newScore.studentName)} 的「${newScore.examName}」成绩`);
    setIsDialogOpen(false);
    setNewScore({
      studentName: '',
      examName: '',
      date: new Date().toISOString().split('T')[0],
      score: 0,
      totalScore: 100,
      classRank: 0,
      gradeRank: 0,
      isRecorded: true,
      isImproved: false
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await onImportExcel(file);
    setImportResult(result);
    setIsImportDialogOpen(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 导出趋势图为图片
  const handleExportTrendImage = async () => {
    if (!trendChartRef.current || !trendStudent || isExportingTrend) return;
    setIsExportingTrend(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const target = trendChartRef.current;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: target.offsetWidth,
        height: target.offsetHeight
      });
      const link = document.createElement('a');
      link.download = `${getNickname(trendStudent)}_入门测趋势.png`;
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

  // 按考试名称分组
  const groupedScores = useMemo(() =>
    scores.reduce((acc, score) => {
      if (!acc[score.examName]) {
        acc[score.examName] = [];
      }
      acc[score.examName].push(score);
      return acc;
    }, {} as { [examName: string]: SchoolScore[] }),
    [scores]
  );

  const examNames = useMemo(() => Object.keys(groupedScores), [groupedScores]);

  const examEntries = useMemo(() =>
    Object.entries(groupedScores).map(([examName, list]) => {
      const sorted = [...list].sort((a, b) => (a.classRank || 999) - (b.classRank || 999));
      const avgRate = list.length > 0
        ? Math.round(list.reduce((s, sc) => s + (sc.totalScore > 0 ? (sc.score / sc.totalScore) * 100 : 0), 0) / list.length * 10) / 10
        : 0;
      const top1 = sorted[0];
      return { examName, list: sorted, avgRate, top1 };
    }),
    [groupedScores]
  );

  const coveredStudents = useMemo(() =>
    new Set(scores.map(s => s.studentName)).size,
    [scores]
  );

  const avgRateAll = useMemo(() => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((s, sc) => s + (sc.totalScore > 0 ? (sc.score / sc.totalScore) * 100 : 0), 0) / scores.length * 10) / 10;
  }, [scores]);

  // 进步之星：同一学生在多次考试中的提升
  const progressStars = useMemo(() => {
    const studentScores = new Map<string, SchoolScore[]>();
    scores.forEach(s => {
      if (!studentScores.has(s.studentName)) {
        studentScores.set(s.studentName, []);
      }
      studentScores.get(s.studentName)!.push(s);
    });

    return Array.from(studentScores.entries())
      .map(([name, list]) => {
        const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstRate = first.totalScore > 0 ? (first.score / first.totalScore) * 100 : 0;
        const lastRate = last.totalScore > 0 ? (last.score / last.totalScore) * 100 : 0;
        const rateImprovement = lastRate - firstRate;
        const scoreImprovement = last.score - first.score;
        const rankImprovement = first.classRank && last.classRank ? first.classRank - last.classRank : undefined;
        return {
          name,
          nickname: getNickname(name),
          firstExam: first.examName,
          lastExam: last.examName,
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
      .filter(item => item.examCount >= 2)
      .sort((a, b) => b.rateImprovement - a.rateImprovement);
  }, [scores, getNickname]);

  // 阶段对比数据
  const compareData = useMemo(() => {
    if (!compareExamA || !compareExamB || compareExamA === compareExamB) return [];
    const aMap = new Map(groupedScores[compareExamA]?.map(s => [s.studentName, s]));
    const bMap = new Map(groupedScores[compareExamB]?.map(s => [s.studentName, s]));

    const allStudents = new Set([...aMap.keys(), ...bMap.keys()]);
    return Array.from(allStudents).map(name => {
      const a = aMap.get(name);
      const b = bMap.get(name);
      const aRate = a && a.totalScore > 0 ? (a.score / a.totalScore) * 100 : 0;
      const bRate = b && b.totalScore > 0 ? (b.score / b.totalScore) * 100 : 0;
      const scoreDiff = a && b ? b.score - a.score : undefined;
      const rateDiff = a && b ? bRate - aRate : undefined;
      const rankDiff = a?.classRank && b?.classRank ? a.classRank - b.classRank : undefined;
      return {
        name,
        nickname: getNickname(name),
        a,
        b,
        aRate,
        bRate,
        scoreDiff,
        rateDiff,
        rankDiff
      };
    }).sort((x, y) => {
      // 有两次成绩的优先，按提升率排序
      if (x.rateDiff === undefined) return 1;
      if (y.rateDiff === undefined) return -1;
      return y.rateDiff - x.rateDiff;
    });
  }, [groupedScores, compareExamA, compareExamB, getNickname]);

  // 自动设置默认对比考试
  useEffect(() => {
    if (examNames.length >= 2 && (!compareExamA || !compareExamB)) {
      setCompareExamA(examNames[examNames.length - 2]);
      setCompareExamB(examNames[examNames.length - 1]);
    }
  }, [examNames, compareExamA, compareExamB]);

  const kpis = [
    { icon: ClipboardList, label: '考试场次', value: String(examEntries.length) },
    { icon: FileSpreadsheet, label: '成绩条数', value: String(scores.length) },
    { icon: Target, label: '平均正确率', value: `${avgRateAll}%` },
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
            <p className="font-semibold text-[#1c1c1e]">校内成绩管理</p>
            <p className="text-xs text-[#8e8e93]">按考试归组追踪班级校内成绩、正确率与排名变化</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl gap-2"
          >
            <Upload className="w-4 h-4" />
            导入Excel
          </Button>
          <Button
            variant="outline"
            disabled={scores.length === 0}
            onClick={() => {
              const namesWithData = new Set(scores.map(s => s.studentName));
              const first = students.find(s => namesWithData.has(s)) || students[0] || '';
              setTrendStudent(first);
              setIsTrendDialogOpen(true);
            }}
            className="rounded-xl gap-2"
          >
            <LineChartIcon className="w-4 h-4" />
            导出趋势图
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="ios-button gap-2">
                <Plus className="w-4 h-4" />
                添加成绩
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
                      value={newScore.score}
                      onChange={(e) => setNewScore(prev => ({ ...prev, score: parseFloat(e.target.value) || 0 }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>总分</Label>
                    <Input
                      type="number"
                      value={newScore.totalScore}
                      onChange={(e) => setNewScore(prev => ({ ...prev, totalScore: parseFloat(e.target.value) || 100 }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>班级排名</Label>
                    <Input
                      type="number"
                      value={newScore.classRank}
                      onChange={(e) => setNewScore(prev => ({ ...prev, classRank: parseInt(e.target.value) || 0 }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>年级排名</Label>
                    <Input
                      type="number"
                      value={newScore.gradeRank}
                      onChange={(e) => setNewScore(prev => ({ ...prev, gradeRank: parseInt(e.target.value) || 0 }))}
                      className="rounded-xl ios-input"
                    />
                  </div>
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
                  <p className="text-xl font-bold text-[#1c1c1e] leading-tight">{k.value}</p>
                  <p className="text-xs text-[#8e8e93]">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 导入结果对话框 */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入结果</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {importResult && (
              <>
                <div className="flex gap-4">
                  <div className="flex-1 bg-emerald-50 p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-emerald-600">{importResult.success}</div>
                    <div className="text-sm text-emerald-700">成功导入</div>
                  </div>
                  <div className="flex-1 bg-rose-50 p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-rose-600">{importResult.failed}</div>
                    <div className="text-sm text-rose-700">导入失败</div>
                  </div>
                </div>
                {importResult.unmatched.length > 0 && (
                  <div className="bg-amber-50 p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                      <AlertCircle className="w-4 h-4" />
                      未匹配学生（{importResult.unmatched.length}人）
                    </div>
                    <div className="text-sm text-amber-800">
                      {importResult.unmatched.join('、')}
                    </div>
                    <p className="text-xs text-amber-600 mt-2">请检查 Excel 中的学生姓名是否与班级名单一致。</p>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="bg-[#f2f2f7] p-4 rounded-xl max-h-40 overflow-y-auto">
                    <div className="text-sm font-medium mb-2">错误信息：</div>
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-sm text-rose-600">{err}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 视图切换 */}
      {examEntries.length > 0 && (
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
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
            {examEntries.map(({ examName, list, avgRate, top1 }) => (
              <Card key={examName} className="ios-glass-card border-0 overflow-hidden">
                <div className="px-5 py-3.5 flex items-center justify-between gap-3"
                  style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.75))' }}>
                  <div className="flex items-center gap-2.5 text-white">
                    <Award className="w-5 h-5" />
                    <span className="font-semibold">{examName}</span>
                    {top1?.date && (
                      <Badge className="bg-white/20 text-white border-0 rounded-full gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {top1.date}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-white/90 text-xs">
                    <span>{list.length} 名学生</span>
                    <span className="w-px h-3.5 bg-white/30" />
                    <span>班均正确率 <span className="font-bold text-white">{avgRate}%</span></span>
                    {top1 && (
                      <>
                        <span className="w-px h-3.5 bg-white/30" />
                        <Medal className="w-3.5 h-3.5" />
                        <span>第一名 {getNickname(top1.studentName)} · {top1.score}分</span>
                      </>
                    )}
                  </div>
                </div>
                <CardContent className="pt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>姓名</TableHead>
                        <TableHead>得分</TableHead>
                        <TableHead>总分</TableHead>
                        <TableHead>正确率</TableHead>
                        <TableHead>班排</TableHead>
                        <TableHead>年排</TableHead>
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
                        return (
                          <TableRow key={score.id} className="hover:bg-black/[0.03]">
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}>
                                  {getNickname(score.studentName).slice(0, 1)}
                                </span>
                                <span className="font-medium text-[#1c1c1e]">{getNickname(score.studentName)}</span>
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-bold text-[#1c1c1e]">{score.score}</span>
                              <span className="text-[#8e8e93] text-xs"> 分</span>
                            </TableCell>
                            <TableCell className="text-[#8e8e93]">{score.totalScore}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge className={`${rateTone(correctRate)} border-0 rounded-full font-semibold`}>
                                  {correctRate}%
                                </Badge>
                                <div className="w-16 h-1.5 rounded-full bg-[#f2f2f7] overflow-hidden hidden md:block">
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
                              <span className={ct.className}>{ct.icon && <span className="mr-0.5">{ct.icon}</span>}{score.classRank ? `第${score.classRank}名` : '-'}</span>
                            </TableCell>
                            <TableCell>
                              <span className={gt.className}>{gt.icon && <span className="mr-0.5">{gt.icon}</span>}{score.gradeRank ? `第${score.gradeRank}名` : '-'}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  onDeleteScore(score.studentName, score.id);
                                  toast.success('已删除该条成绩');
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
                  <h3 className="font-semibold text-[#1c1c1e]">进步之星</h3>
                  <span className="text-xs text-[#8e8e93]">基于同一学生的多次考试成绩，按正确率提升幅度排序</span>
                </div>
                {progressStars.length > 0 ? (
                  <div className="space-y-3">
                    {progressStars.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-4 p-4 rounded-xl bg-white/60 border border-slate-100">
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
                            <span className="font-semibold text-[#1c1c1e]">{s.nickname}</span>
                            <span className="text-xs text-[#8e8e93]">共{s.examCount}次考试</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-[#8e8e93]">
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
                          <div className="text-xs text-[#8e8e93]">
                            {s.scoreImprovement >= 0 ? '+' : ''}{s.scoreImprovement}分
                            {s.rankImprovement !== undefined && s.rankImprovement > 0 ? ` · 排名前进了${s.rankImprovement}名` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#8e8e93]">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-40" />
                    <p className="font-medium text-[#3a3a3c]">暂无进步之星数据</p>
                    <p className="text-sm mt-2">至少需要同一名学生的两场考试成绩</p>
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
                    <h3 className="font-semibold text-[#1c1c1e]">阶段对比</h3>
                  </div>
                  <div className="flex items-center gap-3 flex-1">
                    <Select value={compareExamA} onValueChange={setCompareExamA}>
                      <SelectTrigger className="w-44 rounded-xl">
                        <SelectValue placeholder="选择前次考试" />
                      </SelectTrigger>
                      <SelectContent>
                        {examNames.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[#8e8e93]">对比</span>
                    <Select value={compareExamB} onValueChange={setCompareExamB}>
                      <SelectTrigger className="w-44 rounded-xl">
                        <SelectValue placeholder="选择后次考试" />
                      </SelectTrigger>
                      <SelectContent>
                        {examNames.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {compareExamA && compareExamB && compareExamA === compareExamB && (
                  <div className="bg-amber-50 text-amber-700 p-3 rounded-xl text-sm mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    请选择两场不同的考试进行对比
                  </div>
                )}

                {compareData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>姓名</TableHead>
                        <TableHead>{compareExamA}</TableHead>
                        <TableHead>{compareExamB}</TableHead>
                        <TableHead>分数变化</TableHead>
                        <TableHead>正确率变化</TableHead>
                        <TableHead>排名变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compareData.map(item => (
                        <TableRow key={item.name} className="hover:bg-black/[0.03]">
                          <TableCell className="font-medium text-[#1c1c1e]">{item.nickname}</TableCell>
                          <TableCell>
                            {item.a ? (
                              <div className="flex flex-col">
                                <span className="font-semibold">{item.a.score}分</span>
                                <span className="text-xs text-[#8e8e93]">{item.aRate.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="text-[#8e8e93]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.b ? (
                              <div className="flex flex-col">
                                <span className="font-semibold">{item.b.score}分</span>
                                <span className="text-xs text-[#8e8e93]">{item.bRate.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <span className="text-[#8e8e93]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.scoreDiff !== undefined ? (
                              <span className={`font-semibold ${item.scoreDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {item.scoreDiff >= 0 ? '+' : ''}{item.scoreDiff}分
                              </span>
                            ) : (
                              <span className="text-[#8e8e93]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.rateDiff !== undefined ? (
                              <span className={`font-semibold ${item.rateDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {item.rateDiff >= 0 ? '+' : ''}{item.rateDiff.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#8e8e93]">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.rankDiff !== undefined ? (
                              <span className={`font-semibold flex items-center gap-0.5 ${item.rankDiff > 0 ? 'text-emerald-600' : item.rankDiff < 0 ? 'text-rose-600' : 'text-[#8e8e93]'}`}>
                                {item.rankDiff > 0 ? <ChevronUp className="w-4 h-4" /> : item.rankDiff < 0 ? <ChevronDown className="w-4 h-4" /> : null}
                                {item.rankDiff !== 0 ? `${Math.abs(item.rankDiff)}名` : '持平'}
                              </span>
                            ) : (
                              <span className="text-[#8e8e93]">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-[#8e8e93]">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-40" />
                    <p className="font-medium text-[#3a3a3c]">请选择两场考试进行对比</p>
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
          <CardContent className="py-14 text-center text-[#8e8e93]">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-[#3a3a3c]">暂无校内成绩记录</p>
            <p className="text-sm mt-2">支持导入Excel文件，格式参考：学员姓名、学号、校区、年级、学科、得分、试卷总分、班级排名、年级排名</p>
          </CardContent>
        </Card>
      )}

      {/* 趋势图导出弹窗 */}
      <Dialog open={isTrendDialogOpen} onOpenChange={setIsTrendDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>入门测成绩趋势图导出</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 mt-2">
            <Label>选择学员</Label>
            <Select value={trendStudent} onValueChange={setTrendStudent}>
              <SelectTrigger className="w-56"><SelectValue placeholder="选择学员" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set(scores.map(s => s.studentName))).map(name => (
                  <SelectItem key={name} value={name}>{getNickname(name)}（{name}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="ml-auto gap-2 ios-button" disabled={isExportingTrend || !trendStudent} onClick={handleExportTrendImage}>
              <ImageIcon className="w-4 h-4" />
              {isExportingTrend ? '生成中...' : '导出图片'}
            </Button>
          </div>
          <div ref={trendChartRef} className="mt-4 bg-white p-6 rounded-2xl">
            <TrendChartExport student={trendStudent} scores={scores} getNickname={getNickname} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 趋势图导出组件
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function TrendChartExport({ student, scores, getNickname }: { student: string; scores: SchoolScore[]; getNickname: (name: string) => string }) {
  const studentScores = useMemo(() =>
    scores.filter(s => s.studentName === student).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [scores, student]
  );

  const lineData = useMemo(() => {
    return studentScores.map(s => {
      const studentRate = s.totalScore > 0 ? Math.round((s.score / s.totalScore) * 100 * 10) / 10 : 0;
      // 同次考试的所有学生成绩，计算班级最高和平均
      const sameExam = scores.filter(x => x.examName === s.examName && x.totalScore > 0);
      const rates = sameExam.map(x => (x.score / x.totalScore) * 100);
      const max = rates.length > 0 ? Math.max(...rates) : 0;
      const avg = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : 0;
      return {
        name: s.examName.length > 8 ? s.examName.slice(0, 8) + '…' : s.examName,
        fullName: s.examName,
        date: s.date,
        studentRate,
        classMax: Math.round(max * 10) / 10,
        classAvg: avg,
        rank: s.classRank || 0
      };
    });
  }, [studentScores, scores]);

  const pieData = useMemo(() => {
    const totals = studentScores.reduce((acc, s) => {
      const key = s.examName;
      acc[key] = (acc[key] || 0) + s.score;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(totals).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }));
  }, [studentScores]);

  // 进步课次：连续对比，每次相对上一次提升率
  const improvements = useMemo(() => {
    const result: { examName: string; improvement: number }[] = [];
    for (let i = 1; i < lineData.length; i++) {
      const diff = lineData[i].studentRate - lineData[i - 1].studentRate;
      if (diff >= 5) result.push({ examName: lineData[i].name, improvement: Math.round(diff * 10) / 10 });
    }
    return result;
  }, [lineData]);

  if (!student || studentScores.length === 0) {
    return <div className="text-center py-12 text-slate-500">所选学员暂无校内成绩数据</div>;
  }

  const nickname = getNickname(student);
  const latestRate = lineData[lineData.length - 1]?.studentRate ?? 0;
  const firstRate = lineData[0]?.studentRate ?? 0;
  const totalImprovement = Math.round((latestRate - firstRate) * 10) / 10;
  const bestRank = Math.min(...studentScores.map(s => s.classRank || 999).filter(r => r > 0));

  return (
    <div className="space-y-5">
      {/* 报告头 */}
      <div className="text-center pb-3 border-b border-slate-100">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          入门测成绩趋势报告
        </h2>
        <p className="text-slate-500 mt-1">
          学员姓名：<span className="font-semibold text-slate-800">{nickname}</span>
          <span className="mx-3 text-slate-300">|</span>
          共 <span className="font-semibold text-slate-800">{studentScores.length}</span> 次考试
          {improvements.length > 0 && (
            <>
              <span className="mx-3 text-slate-300">|</span>
              <span className="text-emerald-600 font-semibold">进步课次 {improvements.length} 次</span>
            </>
          )}
        </p>
      </div>

      {/* KPI 瓷贴 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
          <p className="text-xs text-slate-500 mb-1">最近正确率</p>
          <p className="text-2xl font-bold text-blue-700">{latestRate}%</p>
        </div>
        <div className={`p-4 rounded-xl border ${totalImprovement >= 0 ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-100' : 'bg-gradient-to-br from-rose-50 to-orange-50 border-rose-100'}`}>
          <p className="text-xs text-slate-500 mb-1">总体提升</p>
          <p className={`text-2xl font-bold ${totalImprovement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {totalImprovement >= 0 ? '+' : ''}{totalImprovement}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100">
          <p className="text-xs text-slate-500 mb-1">最佳班级排名</p>
          <p className="text-2xl font-bold text-amber-700">{bestRank < 999 ? `第${bestRank}名` : '-'}</p>
        </div>
      </div>

      {/* 折线图 */}
      <div className="rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <LineChartIcon className="w-4 h-4 text-blue-600" />
            历次正确率趋势
          </h3>
          <span className="text-xs text-slate-500">虚线=班级平均 · 紫色=班级最高</span>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: number, k: string) => [`${v}%`, k]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="classMax" name="班级最高" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="classAvg" name="班级平均" stroke="#94a3b8" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="studentRate" name="学员正确率" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, fill: '#2563eb' }} activeDot={{ r: 7 }} />
              {improvements.map((imp, i) => {
                const idx = lineData.findIndex(d => d.name === imp.examName);
                if (idx === -1) return null;
                return (
                  <ReferenceDot
                    key={i}
                    x={lineData[idx].name}
                    y={lineData[idx].studentRate}
                    r={9}
                    fill="#10b981"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 饼图 + 进步课次 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-100 p-4">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-sm">
            <Target className="w-4 h-4 text-blue-600" />
            各次得分分布
          </h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 p-4">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            高亮进步课次（相对上次提升≥5%）
          </h3>
          {improvements.length > 0 ? (
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {improvements.map((imp, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <span className="text-sm text-slate-700 truncate">{imp.examName}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">+{imp.improvement}%</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-slate-500 py-12">暂无显著进步课次</div>
          )}
        </div>
      </div>

      {/* 历次汇总表（参考附图） */}
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
          <h3 className="font-semibold text-slate-800 text-sm">一、历次情况汇总</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                <th className="px-3 py-2 text-left whitespace-nowrap">项目</th>
                {lineData.map((d, i) => (
                  <th key={i} className="px-3 py-2 text-center whitespace-nowrap">{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium text-slate-700">{nickname}</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center">
                    <span className={d.studentRate >= 80 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{d.studentRate}%</span>
                  </td>
                ))}
              </tr>
              <tr className="bg-blue-50/60">
                <td className="px-3 py-2 font-medium text-slate-700">班级最高正确率</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center text-purple-700 font-semibold">{d.classMax}%</td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium text-slate-700">班级平均正确率</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center text-slate-600 font-semibold">{d.classAvg}%</td>
                ))}
              </tr>
              <tr className="bg-blue-50/60">
                <td className="px-3 py-2 font-medium text-slate-700">班级排名【前】</td>
                {lineData.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center font-semibold">{d.rank > 0 ? d.rank.toFixed(2) : '-'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
