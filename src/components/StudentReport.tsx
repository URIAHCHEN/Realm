import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  Line
} from 'recharts';
import { 
  TrendingUp, 
  BookOpen, 
  Award, 
  Target, 
  Lightbulb,
  Calendar,
  User,
  School,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  ChevronRight,
  FileText,
  Clock
} from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore } from '@/types';

interface StudentReportProps {
  students: string[];
  records: StudentRecord[];
  schoolScores: { [studentName: string]: SchoolScore[] };
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
  getNickname: (name: string) => string;
  currentClassName: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export function StudentReport({
  students,
  records,
  schoolScores,
  lessonConfigs,
  getNickname,
  currentClassName
}: StudentReportProps) {
  const [selectedStudent, setSelectedStudent] = useState<string>(students[0] || '');

  // 获取选中学生的所有记录
  const studentRecords = useMemo(() => {
    return records.filter(r => r.studentName === selectedStudent).sort((a, b) => a.lessonNumber - b.lessonNumber);
  }, [records, selectedStudent]);

  // 获取选中学生的校内成绩
  const studentSchoolScores = useMemo(() => {
    return schoolScores[selectedStudent] || [];
  }, [schoolScores, selectedStudent]);

  // 计算学生统计数据
  const studentStats = useMemo(() => {
    if (studentRecords.length === 0) return null;

    const totalLessons = studentRecords.length;
    const avgScore = studentRecords.reduce((sum, r) => sum + r.totalScore, 0) / totalLessons;
    const maxScore = Math.max(...studentRecords.map(r => r.totalScore));
    const minScore = Math.min(...studentRecords.map(r => r.totalScore));
    
    // 计算各题型平均分
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

    // 计算学习轨迹
    const learningTrajectory = studentRecords.map(r => ({
      lesson: r.lessonNumber,
      score: r.totalScore,
      correctRate: r.correctRate,
      listeningScore: r.listeningScore
    }));

    // 计算考勤统计
    const attendanceStats = {
      total: studentRecords.length,
      onTime: studentRecords.filter(r => r.attendance === '按时出勤').length,
      late: studentRecords.filter(r => r.attendance === '迟到').length,
      absent: studentRecords.filter(r => r.attendance === '缺勤').length
    };

    // 计算作业完成情况
    const homeworkStats = {
      excellent: studentRecords.filter(r => r.homeworkStatus === '超赞完成').length,
      good: studentRecords.filter(r => r.homeworkStatus === '圆满完成').length,
      average: studentRecords.filter(r => r.attendance === '基本完成').length,
      poor: studentRecords.filter(r => r.attendance === '未完成').length
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

  // 饼图数据 - 题型得分分布
  const pieData = useMemo(() => {
    if (!studentStats) return [];
    return studentStats.avgQuestionTypeScores.map((qt, index) => ({
      name: qt.name,
      value: qt.avgScore,
      color: COLORS[index % COLORS.length]
    }));
  }, [studentStats]);

  // 柱状图数据 - 各课次成绩
  const barData = useMemo(() => {
    return studentRecords.map(r => ({
      lesson: `第${r.lessonNumber}课`,
      score: r.totalScore,
      correctRate: r.correctRate,
      fullMark: 100
    }));
  }, [studentRecords]);

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

  if (students.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-12 h-12 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">暂无学生数据</h3>
        <p className="text-slate-500">请先添加学生后再查看学情报告</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 学生选择器 */}
      <Card className="liquid-glass-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <User className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-slate-700">选择学生：</span>
            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
              <SelectTrigger className="w-64 liquid-glass-input">
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
          </div>
        </CardContent>
      </Card>

      {studentRecords.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileText className="w-12 h-12 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">暂无学习记录</h3>
          <p className="text-slate-500">该学生暂无任何课次的学习记录</p>
        </div>
      ) : (
        <div className="report-container">
          {/* 报告头部 */}
          <div className="report-header">
            <h1 className="report-title">📊 学情深度分析报告</h1>
            <p className="report-subtitle">
              {currentClassName} · {selectedStudent} ({getNickname(selectedStudent)})
            </p>
          </div>

          {/* 基本信息卡片 */}
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

          {/* 学习趋势图 */}
          <div className="report-section">
            <h2 className="report-section-title">
              <TrendingUp className="w-5 h-5 inline mr-2" />
              学习趋势分析
            </h2>
            <div className="report-chart-container" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="lesson" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    name="入门测成绩" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="listeningScore" 
                    name="乐听说成绩" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 各课次成绩柱状图 */}
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
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="score" name="得分" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="correctRate" name="正确率%" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 题型得分分布饼图 */}
          {pieData.length > 0 && (
            <div className="report-section">
              <h2 className="report-section-title">
                <PieChartIcon className="w-5 h-5 inline mr-2" />
                题型得分分布
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="report-chart-container" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {studentStats?.avgQuestionTypeScores.map((qt, index) => (
                    <div key={qt.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-medium">{qt.name}</span>
                      </div>
                      <span className="font-bold text-blue-600">{qt.avgScore}分</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 能力雷达图 */}
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
                    <Radar
                      name="当前水平"
                      dataKey="A"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 考勤与作业统计 */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                  考勤统计
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">按时出勤</span>
                    <Badge className="bg-green-100 text-green-700">
                      {studentStats?.attendanceStats.onTime} 次
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">迟到</span>
                    <Badge className="bg-yellow-100 text-yellow-700">
                      {studentStats?.attendanceStats.late} 次
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">缺勤</span>
                    <Badge className="bg-red-100 text-red-700">
                      {studentStats?.attendanceStats.absent} 次
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  作业完成情况
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">超赞完成</span>
                    <Badge className="bg-green-100 text-green-700">
                      {studentStats?.homeworkStats.excellent} 次
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">圆满完成</span>
                    <Badge className="bg-blue-100 text-blue-700">
                      {studentStats?.homeworkStats.good} 次
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">基本完成</span>
                    <Badge className="bg-yellow-100 text-yellow-700">
                      {studentStats?.homeworkStats.average} 次
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 校内成绩表格 */}
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
                          }>
                            {exam.rate}%
                          </Badge>
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

          {/* 详细学习记录 */}
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
                    <TableHead>乐听说</TableHead>
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
                        }>
                          {record.attendance}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          record.homeworkStatus === '超赞完成' ? 'bg-green-100 text-green-700' :
                          record.homeworkStatus === '圆满完成' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }>
                          {record.homeworkStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.listeningStatus === '具体分数' ? 
                          `${record.listeningScore}分` : 
                          record.listeningStatus
                        }
                      </TableCell>
                      <TableCell className="font-bold">{record.totalScore}分</TableCell>
                      <TableCell>{record.correctRate}%</TableCell>
                      <TableCell>第{record.rank}名</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* 个性化建议 */}
          <div className="report-section">
            <h2 className="report-section-title">
              <Lightbulb className="w-5 h-5 inline mr-2" />
              学习建议
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    短期目标
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      保持按时出勤，不迟到不早退
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      作业按时高质量完成
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      每天练习乐听说15分钟
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    提升方向
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      加强薄弱题型的专项练习
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      提高正确率，减少粗心错误
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      多做真题，熟悉考试节奏
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    长期规划
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      建立系统的知识体系
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      培养自主学习能力
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      为升学考试做好充分准备
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
