import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, UserPlus, UserMinus, Download, AlertTriangle, Copy, Check, Plus, Camera, Settings2 } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
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
  onExportHTML: () => void;
  onViewStudentAnalysis: (studentName: string) => void;
  onSaveLessonConfig: (lessonNum: number, config: Partial<LessonConfig>) => void;
}

const seasons: { value: SeasonType; label: string; className: string }[] = [
  { value: '暑', label: '暑', className: 'season-summer' },
  { value: '秋', label: '秋', className: 'season-autumn' },
  { value: '寒', label: '寒', className: 'season-winter' },
  { value: '春', label: '春', className: 'season-spring' },
];

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

export function StudentTable({
  students, records, lessonConfig, lessonNumber, getNickname, calculateClassStats,
  onUpdateRecord, onCreateRecord, onDeleteRecord, onAddStudent, onRemoveStudent,
  onExportData, onExportHTML, onViewStudentAnalysis, onSaveLessonConfig
}: StudentTableProps) {
  const [newStudentName, setNewStudentName] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [copiedStudent, setCopiedStudent] = useState<string | null>(null);
  const [showAddQuestionTypeDialog, setShowAddQuestionTypeDialog] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState({ name: '', fullScore: 100 });
  const tableRef = useRef<HTMLDivElement>(null);

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
    const feedback = `${nickname}家长您好！\n\n📚 第${lessonNumber}课学习反馈：\n\n🏫 考勤：${record.attendance}\n📝 作业：${record.homeworkStatus}\n🎙️ 乐听说：${record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus}\n\n📊 入门测成绩：\n${scoreDetails}\n💯 总分：${record.totalScore}/${fullScore}\n📈 班级排名：第${record.rank}名\n📊 正确率：${record.correctRate}%\n\n⚠️ 薄弱项：${weakPointsText}\n\n💪 加油，继续努力！`;
    const success = await copyToClipboard(feedback);
    if (success) {
      setCopiedStudent(studentName);
      setTimeout(() => setCopiedStudent(null), 2000);
    }
  };

  const handleGenerateImage = async () => {
    if (!tableRef.current) return;
    try {
      toast.info('正在生成图片...');
      const canvas = await html2canvas(tableRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
      const link = document.createElement('a');
      link.download = `学情记录表_第${lessonNumber}课_${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('图片生成成功！');
    } catch (error) {
      toast.error('图片生成失败：' + error);
    }
  };

  const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);

  return (
    <Card className="liquid-glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            学情记录表
            <Badge variant="secondary" className="text-lg bg-gradient-to-r from-blue-100 to-sky-100 text-blue-700 border-blue-200">第{lessonNumber}课</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddQuestionTypeDialog(true)} variant="outline" size="sm" className="gap-2 liquid-glass-button bg-white/50 text-blue-700 border-blue-200 hover:bg-blue-50">
              <Settings2 className="w-4 h-4" />配置题型
            </Button>
            <Button onClick={handleGenerateImage} variant="outline" size="sm" className="gap-2 liquid-glass-button bg-white/50 text-sky-700 border-sky-200 hover:bg-sky-50">
              <Camera className="w-4 h-4" />生成图片
            </Button>
            <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" className="gap-2 liquid-glass-button bg-white/50">
              <Plus className="w-4 h-4" />添加学员
            </Button>
            <Button onClick={onExportHTML} variant="outline" size="sm" className="gap-2 liquid-glass-button bg-white/50">
              <Download className="w-4 h-4" />导出HTML
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-slate-400 mb-4">
              <UserPlus className="w-12 h-12 mx-auto mb-2" />
              <p>请先添加学生</p>
            </div>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2 liquid-glass-button">
              <UserPlus className="w-4 h-4" />添加学生
            </Button>
          </div>
        ) : (
          <>
            <div ref={tableRef} className="bg-white rounded-xl p-4">
              <ScrollArea className="h-[600px] border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-gradient-to-r from-blue-50 to-sky-50">
                    <TableRow>
                      <TableHead className="w-14 text-base font-bold">排名</TableHead>
                      <TableHead className="w-20 text-base font-bold">姓名</TableHead>
                      <TableHead className="w-36 text-base font-bold">学习轨迹</TableHead>
                      <TableHead className="w-24 text-base font-bold">考勤</TableHead>
                      <TableHead className="w-28 text-base font-bold">书面作业</TableHead>
                      <TableHead className="w-32 text-base font-bold">乐听说</TableHead>
                      {lessonConfig.questionTypes.map(qt => <TableHead key={qt.id} className="w-20 text-center text-base font-bold">{qt.name}</TableHead>)}
                      <TableHead className="w-20 text-center text-base font-bold">总分</TableHead>
                      <TableHead className="w-20 text-center text-base font-bold">正确率</TableHead>
                      <TableHead className="text-base font-bold">薄弱项</TableHead>
                      <TableHead className="w-28 text-center text-base font-bold">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((studentName) => {
                      const record = getStudentRecord(studentName);
                      const weakPoints = record ? getWeakPoints(record) : [];
                      const totalScore = record?.totalScore || 0;
                      const correctRate = record?.correctRate || 0;
                      return (
                        <TableRow key={studentName} className="hover:bg-blue-50/30">
                          <TableCell className="text-base">
                            {record?.rank ? (
                              <Badge variant={record.rank <= 3 ? "default" : "secondary"} className={record.rank === 1 ? "badge-rank-1" : record.rank === 2 ? "badge-rank-2" : record.rank === 3 ? "badge-rank-3" : "bg-slate-100 text-slate-600 text-base py-1 px-3"}>{record.rank}</Badge>
                            ) : <span className="text-slate-300 text-base">-</span>}
                          </TableCell>
                          <TableCell className="font-medium cursor-pointer text-blue-700 hover:text-blue-900 hover:underline text-base" onClick={() => onViewStudentAnalysis(studentName)}>{getNickname(studentName)}</TableCell>
                          <TableCell className="text-base">
                            <div className="flex gap-1">
                              {seasons.map(({ value, label, className }) => {
                                const isActive = record?.seasons?.includes(value);
                                return <button key={value} onClick={() => handleSeasonToggle(studentName, value)} className={`season-tag ${className} ${isActive ? 'active' : 'inactive'}`} title={value}>{label}</button>;
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-base">
                            <div className="space-y-1">
                              <Select value={record?.attendance || '按时出勤'} onValueChange={(value) => handleAttendanceChange(studentName, value)}>
                                <SelectTrigger className={`w-24 h-9 text-sm border rounded-lg ${getAttendanceColor(record?.attendance || '按时出勤')}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{lessonConfig.attendanceOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                              </Select>
                              {record?.attendance === '调课' && <Input type="text" placeholder="调课原因" value={record?.adjustReason || ''} onChange={(e) => handleAdjustReasonChange(studentName, e.target.value)} className="w-24 h-7 text-sm rounded-lg" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-base">
                            <Select value={record?.homeworkStatus || '圆满完成'} onValueChange={(value) => handleHomeworkChange(studentName, value)}>
                              <SelectTrigger className={`w-28 h-9 text-sm border rounded-lg ${getHomeworkColor(record?.homeworkStatus || '圆满完成')}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{lessonConfig.homeworkOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
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
                              {record?.listeningStatus === '具体分数' && <Input type="number" min={0} max={100} value={record?.listeningScore || 0} onChange={(e) => handleListeningScoreChange(studentName, parseInt(e.target.value) || 0)} className="w-16 h-9 text-sm rounded-lg" />}
                            </div>
                          </TableCell>
                          {lessonConfig.questionTypes.map(qt => {
                            const score = record?.scores?.[qt.id] || 0;
                            const avgScore = stats.avgScores[qt.id] || 0;
                            const isWeak = score < avgScore - 5;
                            const isStrong = score > avgScore + 5;
                            return (
                              <TableCell key={qt.id} className="text-base">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Input type="number" min={0} max={qt.fullScore} value={score} onChange={(e) => handleScoreChange(studentName, qt.id, parseInt(e.target.value) || 0)} className={`w-18 h-9 text-center text-base rounded-lg ${isWeak ? 'border-rose-300 bg-rose-50 text-rose-700' : ''} ${isStrong ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`} />
                                    </TooltipTrigger>
                                    <TooltipContent><p>班均: {avgScore.toFixed(1)}</p><p>差距: {(score - avgScore) >= 0 ? '+' : ''}{(score - avgScore).toFixed(1)}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-base"><span className="font-bold text-blue-600 text-lg">{totalScore}</span><span className="text-sm text-slate-400">/{fullScore}</span></TableCell>
                          <TableCell className="text-center text-base"><Badge variant={correctRate >= 80 ? "default" : correctRate >= 60 ? "secondary" : "destructive"} className={correctRate >= 80 ? "bg-emerald-500 text-base py-1 px-3" : correctRate >= 60 ? "bg-amber-500 text-base py-1 px-3" : "text-base py-1 px-3"}>{correctRate}%</Badge></TableCell>
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
                          <TableCell className="text-base">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyFeedback(studentName)} disabled={!record} className="h-9 w-9 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="复制反馈">{copiedStudent === studentName ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(studentName)} className="h-9 w-9 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50" title="删除记录"><Trash2 className="w-5 h-5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => onRemoveStudent(studentName)} className="h-9 w-9 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100" title="移除学生"><UserMinus className="w-5 h-5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => setShowAddDialog(true)} variant="outline" className="gap-2 liquid-glass-button bg-white/50"><UserPlus className="w-4 h-4" />添加学员</Button>
              <Button onClick={onExportData} variant="outline" className="gap-2 liquid-glass-button bg-white/50"><Download className="w-4 h-4" />导出CSV</Button>
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
            <div><label className="text-sm font-medium mb-2 block">满分</label><Input type="number" placeholder="100" value={newQuestionType.fullScore} onChange={(e) => setNewQuestionType(prev => ({ ...prev, fullScore: parseInt(e.target.value) || 100 }))} className="liquid-glass-input" /></div>
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
