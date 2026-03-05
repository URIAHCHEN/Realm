import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, TrendingUp, Award, Upload, FileSpreadsheet } from 'lucide-react';
import type { SchoolScore } from '@/types';

interface SchoolScorePanelProps {
  students: string[];
  scores: SchoolScore[];
  onAddScore: (score: Omit<SchoolScore, 'id'>) => void;
  onDeleteScore: (studentName: string, scoreId: string) => void;
  onImportExcel: (file: File) => Promise<{ success: number; failed: number; errors: string[] }>;
  getNickname: (name: string) => string;
}

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
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    if (!newScore.studentName || !newScore.examName) return;
    
    onAddScore(newScore as Omit<SchoolScore, 'id'>);
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
    
    // 清空文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 按考试名称分组
  const groupedScores = scores.reduce((acc, score) => {
    if (!acc[score.examName]) {
      acc[score.examName] = [];
    }
    acc[score.examName].push(score);
    return acc;
  }, {} as { [examName: string]: SchoolScore[] });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-indigo-600" />
          校内成绩管理
        </h2>
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
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            导入Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
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
                  <div>
                    <Label>学生姓名</Label>
                    <select
                      value={newScore.studentName}
                      onChange={(e) => setNewScore(prev => ({ ...prev, studentName: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">选择学生</option>
                      {students.map(s => (
                        <option key={s} value={s}>{getNickname(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>考试名称</Label>
                    <Input
                      placeholder="如期中考试、月考等"
                      value={newScore.examName}
                      onChange={(e) => setNewScore(prev => ({ ...prev, examName: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>考试日期</Label>
                    <Input
                      type="date"
                      value={newScore.date}
                      onChange={(e) => setNewScore(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>得分</Label>
                    <Input
                      type="number"
                      value={newScore.score}
                      onChange={(e) => setNewScore(prev => ({ ...prev, score: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>总分</Label>
                    <Input
                      type="number"
                      value={newScore.totalScore}
                      onChange={(e) => setNewScore(prev => ({ ...prev, totalScore: parseFloat(e.target.value) || 100 }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>班级排名</Label>
                    <Input
                      type="number"
                      value={newScore.classRank}
                      onChange={(e) => setNewScore(prev => ({ ...prev, classRank: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>年级排名</Label>
                    <Input
                      type="number"
                      value={newScore.gradeRank}
                      onChange={(e) => setNewScore(prev => ({ ...prev, gradeRank: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div>
                  <Label>备注</Label>
                  <Input
                    placeholder="可选"
                    value={newScore.note || ''}
                    onChange={(e) => setNewScore(prev => ({ ...prev, note: e.target.value }))}
                  />
                </div>

                <Button onClick={handleSave} className="w-full">保存成绩</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
                  <div className="flex-1 bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">{importResult.success}</div>
                    <div className="text-sm text-green-700">成功导入</div>
                  </div>
                  <div className="flex-1 bg-red-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                    <div className="text-sm text-red-700">导入失败</div>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-lg max-h-40 overflow-y-auto">
                    <div className="text-sm font-medium mb-2">错误信息：</div>
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-sm text-red-600">{err}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 成绩列表 */}
      {Object.entries(groupedScores).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" />
            <p>暂无校内成绩记录</p>
            <p className="text-sm mt-2">支持导入Excel文件，格式参考：学员姓名、学号、校区、年级、学科、得分、试卷总分、班级排名、年级排名</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedScores).map(([examName, examScores]) => (
          <Card key={examName}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                {examName}
                <span className="text-sm font-normal text-slate-500">
                  ({examScores[0]?.date})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>得分</TableHead>
                    <TableHead>总分</TableHead>
                    <TableHead>正确率</TableHead>
                    <TableHead>班排</TableHead>
                    <TableHead>年排</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examScores
                    .sort((a, b) => (a.classRank || 999) - (b.classRank || 999))
                    .map(score => {
                      const correctRate = score.totalScore > 0 
                        ? Math.round((score.score / score.totalScore) * 100 * 10) / 10 
                        : 0;
                      return (
                        <TableRow key={score.id}>
                          <TableCell className="font-medium">
                            {getNickname(score.studentName)}
                          </TableCell>
                          <TableCell>{score.score}</TableCell>
                          <TableCell>{score.totalScore}</TableCell>
                          <TableCell>
                            <Badge variant={correctRate >= 80 ? "default" : correctRate >= 60 ? "secondary" : "destructive"}>
                              {correctRate}%
                            </Badge>
                          </TableCell>
                          <TableCell>{score.classRank ? `第${score.classRank}名` : '-'}</TableCell>
                          <TableCell>{score.gradeRank ? `第${score.gradeRank}名` : '-'}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDeleteScore(score.studentName, score.id)}
                              className="text-red-500 hover:text-red-700"
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
        ))
      )}
    </div>
  );
}
