import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, BarChart3, PieChart, Activity } from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore } from '@/types';

interface StudentAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  nickname: string;
  allRecords: { classId: string; className: string; records: StudentRecord[] }[];
  schoolScores: SchoolScore[];
  getLessonConfig: (classId: string, lessonNumber: number) => LessonConfig;
}

// 简单的折线图组件
function LineChart({ data, labels, title, color = '#6366f1' }: { 
  data: number[]; 
  labels: string[]; 
  title: string;
  color?: string;
}) {
  if (data.length === 0) return <div className="text-center text-slate-400 py-8">暂无数据</div>;

  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-600">{title}</div>
      <div className="relative h-48 bg-slate-50 rounded-lg p-4">
        <svg className="w-full h-full" viewBox={`0 0 ${data.length * 60} 200`} preserveAspectRatio="none">
          {/* 网格线 */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line
              key={i}
              x1="0"
              y1={200 - p * 200}
              x2={data.length * 60}
              y2={200 - p * 200}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}
          
          {/* 折线 */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="3"
            points={data.map((v, i) => `${i * 60 + 30},${200 - ((v - min) / range) * 180 - 10}`).join(' ')}
          />
          
          {/* 数据点 */}
          {data.map((v, i) => (
            <circle
              key={i}
              cx={i * 60 + 30}
              cy={200 - ((v - min) / range) * 180 - 10}
              r="6"
              fill={color}
              stroke="white"
              strokeWidth="2"
            />
          ))}
        </svg>
        
        {/* X轴标签 */}
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          {labels.map((l, i) => (
            <div key={i} className="text-center" style={{ width: `${100 / labels.length}%` }}>
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 玫瑰图（极坐标面积图）
function RoseChart({ data, labels, title }: { 
  data: number[]; 
  labels: string[]; 
  title: string;
}) {
  if (data.length === 0) return <div className="text-center text-slate-400 py-8">暂无数据</div>;

  const max = Math.max(...data, 100);
  const centerX = 100;
  const centerY = 100;
  const maxRadius = 80;
  const angleStep = (2 * Math.PI) / data.length;

  // 生成路径
  const pathPoints = data.map((v, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const radius = (v / max) * maxRadius;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      label: labels[i],
      value: v
    };
  });

  const pathD = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-600">{title}</div>
      <div className="relative h-64 flex items-center justify-center">
        <svg width="200" height="200" viewBox="0 0 200 200">
          {/* 背景圆环 */}
          {[0.2, 0.4, 0.6, 0.8, 1].map((p, i) => (
            <circle
              key={i}
              cx={centerX}
              cy={centerY}
              r={maxRadius * p}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}
          
          {/* 射线 */}
          {data.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            return (
              <line
                key={i}
                x1={centerX}
                y1={centerY}
                x2={centerX + maxRadius * Math.cos(angle)}
                y2={centerY + maxRadius * Math.sin(angle)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          
          {/* 数据区域 */}
          <path
            d={pathD}
            fill="rgba(99, 102, 241, 0.3)"
            stroke="#6366f1"
            strokeWidth="2"
          />
          
          {/* 数据点 */}
          {pathPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              fill="#6366f1"
              stroke="white"
              strokeWidth="2"
            />
          ))}
        </svg>
        
        {/* 图例 */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-2 text-xs">
          {pathPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>{p.label}: {p.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudentAnalysis({
  isOpen,
  onClose,

  nickname,
  allRecords,
  schoolScores,
  getLessonConfig
}: StudentAnalysisProps) {
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number | null>(null);

  const currentClassData = allRecords[selectedClassIndex];
  const records = currentClassData?.records || [];

  // 计算趋势数据
  const trendData = useMemo(() => {
    const lessonNumbers = records.map(r => r.lessonNumber);
    const totalScores = records.map(r => r.totalScore);
    const correctRates = records.map(r => r.correctRate);
    const listeningScores = records.map(r => r.listeningStatus === '具体分数' ? r.listeningScore : 0);
    
    return { lessonNumbers, totalScores, correctRates, listeningScores };
  }, [records]);

  // 各题型分数趋势
  const questionTypeTrends = useMemo(() => {
    if (records.length === 0) return {};
    
    const lessonConfig = getLessonConfig(currentClassData.classId, records[0].lessonNumber);
    const trends: { [key: string]: number[] } = {};
    
    lessonConfig.questionTypes.forEach(qt => {
      trends[qt.name] = records.map(r => r.scores[qt.id] || 0);
    });
    
    return trends;
  }, [records, currentClassData, getLessonConfig]);

  // 选中课程的玫瑰图数据
  const roseChartData = useMemo(() => {
    if (selectedRecordIndex === null || records.length === 0) return null;
    
    const record = records[selectedRecordIndex];
    const lessonConfig = getLessonConfig(currentClassData.classId, record.lessonNumber);
    
    // 获取该课次的班级平均分
    // 这里简化处理，实际应该从所有学生记录中计算
    const data = lessonConfig.questionTypes.map(qt => {
      const score = record.scores[qt.id] || 0;
      return (score / qt.fullScore) * 100;
    });
    
    const labels = lessonConfig.questionTypes.map(qt => qt.name);
    
    return { data, labels };
  }, [selectedRecordIndex, records, currentClassData, getLessonConfig]);

  // 校内成绩趋势
  const schoolScoreTrend = useMemo(() => {
    const sorted = [...schoolScores].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return {
      dates: sorted.map(s => s.date.slice(5)),
      scores: sorted.map(s => s.totalScore > 0 ? Math.round((s.score / s.totalScore) * 100 * 10) / 10 : 0),
      classRanks: sorted.map(s => s.classRank || 0)
    };
  }, [schoolScores]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[98vw] w-[1600px] max-h-[95vh] overflow-y-auto liquid-glass-card">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-3xl flex items-center gap-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent font-bold">
              <Activity className="w-8 h-8 text-violet-600" />
              {nickname} 学情分析
            </DialogTitle>

          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* 班级选择 */}
          {allRecords.length > 1 && (
            <div className="flex gap-2">
              {allRecords.map((data, i) => (
                <Button
                  key={data.classId}
                  variant={selectedClassIndex === i ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedClassIndex(i);
                    setSelectedRecordIndex(null);
                  }}
                >
                  {data.className}
                </Button>
              ))}
            </div>
          )}

          {/* 图表区域 */}
          <div className="grid grid-cols-2 gap-8">
            {/* 入门测趋势 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  入门测总分趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  data={trendData.totalScores}
                  labels={trendData.lessonNumbers.map(n => `第${n}课`)}
                  title=""
                  color="#6366f1"
                />
              </CardContent>
            </Card>

            {/* 正确率趋势 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  正确率趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  data={trendData.correctRates}
                  labels={trendData.lessonNumbers.map(n => `第${n}课`)}
                  title=""
                  color="#10b981"
                />
              </CardContent>
            </Card>

            {/* 乐听说趋势 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  乐听说分数趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  data={trendData.listeningScores.filter(s => s > 0)}
                  labels={trendData.lessonNumbers.filter((_, i) => trendData.listeningScores[i] > 0).map(n => `第${n}课`)}
                  title=""
                  color="#f59e0b"
                />
              </CardContent>
            </Card>

            {/* 校内成绩趋势 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  校内成绩正确率趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  data={schoolScoreTrend.scores}
                  labels={schoolScoreTrend.dates}
                  title=""
                  color="#8b5cf6"
                />
              </CardContent>
            </Card>
          </div>

          {/* 各题型分数趋势 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                各题型分数趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(questionTypeTrends).map(([name, scores]) => (
                  <div key={name} className="space-y-2">
                    <div className="text-xs font-medium text-slate-600">{name}</div>
                    <LineChart
                      data={scores}
                      labels={trendData.lessonNumbers.map(n => `第${n}课`)}
                      title=""
                      color={`hsl(${Math.random() * 360}, 70%, 50%)`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 单次课玫瑰图 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4" />
                单次课题型得分率分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <Select 
                  value={selectedRecordIndex?.toString() || ''} 
                  onValueChange={(v) => setSelectedRecordIndex(parseInt(v))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="选择课次" />
                  </SelectTrigger>
                  <SelectContent>
                    {records.map((r, i) => (
                      <SelectItem key={r.id} value={i.toString()}>
                        第{r.lessonNumber}课 (总分: {r.totalScore})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {roseChartData && (
                <div className="w-64 mx-auto">
                  <RoseChart
                    data={roseChartData.data}
                    labels={roseChartData.labels}
                    title=""
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 详细记录表 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">详细学情记录</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>课次</TableHead>
                      <TableHead>考勤</TableHead>
                      <TableHead>作业</TableHead>
                      <TableHead>乐听说</TableHead>
                      {records[0] && getLessonConfig(currentClassData.classId, records[0].lessonNumber).questionTypes.map(qt => (
                        <TableHead key={qt.id}>{qt.name}</TableHead>
                      ))}
                      <TableHead>总分</TableHead>
                      <TableHead>排名</TableHead>
                      <TableHead>正确率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => {
                      const lessonConfig = getLessonConfig(currentClassData.classId, record.lessonNumber);
                      return (
                        <TableRow key={record.id}>
                          <TableCell>第{record.lessonNumber}课</TableCell>
                          <TableCell>{record.attendance}</TableCell>
                          <TableCell>{record.homeworkStatus}</TableCell>
                          <TableCell>
                            {record.listeningStatus === '具体分数' 
                              ? `${record.listeningScore}分` 
                              : record.listeningStatus}
                          </TableCell>
                          {lessonConfig.questionTypes.map(qt => (
                            <TableCell key={qt.id}>{record.scores[qt.id] || 0}</TableCell>
                          ))}
                          <TableCell className="font-bold">{record.totalScore}</TableCell>
                          <TableCell>第{record.rank}名</TableCell>
                          <TableCell>{record.correctRate}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
