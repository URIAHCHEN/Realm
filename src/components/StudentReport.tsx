import { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {Card, CardContent, } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { } from '@/components/ReportCustomFields';
import { 
  User,
  PieChart as FileText,
  Users,
  FileSpreadsheet,
  Image as ImageIcon,
  } from 'lucide-react';
import type { StudentRecord, LessonConfig, SchoolScore } from '@/types';
import { isAbsentRecord } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { } from '@/lib/optionTone';
import { computeStudentReportStats, computeClassReportStats } from '@/lib/reportStats';
import { } from '@/components/ui/checkbox';
import { } from '@/components/ui/label';

interface StudentReportProps {
  students: string[];
  records: StudentRecord[];
  schoolScores: { [studentName: string]: SchoolScore[] };
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
  getNickname: (name: string) => string;
  currentClassName: string;
}


/** 汇总各课次配置里出现过的选项（保序去重）——用于动态生成「出勤/作业概况」维度 */
function collectOptions(configs: { [lesson: string]: LessonConfig }, key: 'attendanceOptions' | 'homeworkOptions' | 'listeningOptions' | 'classPerformanceOptions'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  Object.keys(configs)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(k => (configs[k]?.[key] || []).forEach(opt => { if (!seen.has(opt)) { seen.add(opt); out.push(opt); } }));
  return out;
}

import { PersonalReportView as PersonalReport, ClassReportView as ClassReport } from '@/components/report/ReportViews';
import { COLORS } from '@/components/report/palette';

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
  // 切换班级后，旧班级的学生名可能已不在名单里 —— 否则个人报告恒显示"暂无学习记录"
  useEffect(() => {
    if (students.length && !students.includes(selectedStudent)) setSelectedStudent(students[0] || '');
  }, [students, selectedStudent]);
  const [selectedLesson, setSelectedLesson] = useState<number | 'all'>('all');
  const [trendType, setTrendType] = useState<'line' | 'bar' | 'area'>('bar');
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

  // 合并各课次自定义列（按 id 去重）供“自定义维度”统计
  const allCustomFields = useMemo(() => {
    const seen = new Map<string, import('@/types').CustomField>();
    Object.values(lessonConfigs).forEach(cfg => {
      (cfg.customFields || []).forEach(cf => { if (!seen.has(cf.id)) seen.set(cf.id, cf); });
    });
    return Array.from(seen.values()).sort((a, b) => a.order - b.order);
  }, [lessonConfigs]);

  // 附加项清单（如口语得分）：不计入小测，但属于作业成绩的一部分 → 单独统计
  const optionalScoreFields = useMemo(() => {
    const seen = new Map<string, { name: string; fullScore: number; ids: string[] }>();
    Object.keys(lessonConfigs).forEach(k => {
      (lessonConfigs[k]?.questionTypes || []).forEach(qt => {
        if (!qt.excludeFromTotal) return;
        const cur = seen.get(qt.name) || { name: qt.name, fullScore: qt.fullScore, ids: [] as string[] };
        if (!cur.ids.includes(qt.id)) cur.ids.push(qt.id);
        seen.set(qt.name, cur);
      });
    });
    return Array.from(seen.values());
  }, [lessonConfigs]);

  /** 统计某批记录在附加项上的表现：只累加"已登记"的值，未登记不计入 */
  const summarizeOptional = (field: { name: string; ids: string[] }, recs: StudentRecord[]) => {
    const values = recs
      .map(r => field.ids.map(id => r.scores?.[id]).find(v => typeof v === 'number'))
      .filter((v): v is number => typeof v === 'number');
    return {
      name: field.name,
      registered: values.length,
      total: recs.length,
      avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0,
    };
  };

  // 动态选项清单：跨课次收集当前配置里出现过的选项（改文案后统计自动跟随）
  const attendanceOptions = useMemo(() => collectOptions(lessonConfigs, 'attendanceOptions'), [lessonConfigs]);
  const homeworkOptions = useMemo(() => collectOptions(lessonConfigs, 'homeworkOptions'), [lessonConfigs]);
  const listeningOptions = useMemo(() => collectOptions(lessonConfigs, 'listeningOptions'), [lessonConfigs]);

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
  const studentStats = useMemo(
    () => computeStudentReportStats(studentRecords, lessonConfigs, { attendanceOptions, homeworkOptions, listeningOptions }),
    [studentRecords, lessonConfigs, attendanceOptions, homeworkOptions, listeningOptions]
  );

  // 班级统计数据
  const classStats = useMemo(
    () => computeClassReportStats(classReportRecords, lessonConfigs, { attendanceOptions, homeworkOptions, listeningOptions }),
    [classReportRecords, lessonConfigs, attendanceOptions, homeworkOptions, listeningOptions]
  );

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
      // 各课次真实满分（题型配置动态变化，非固定值）
      fullMark: getLessonFullScore(lessonConfigs[r.lessonNumber]) || 100
    }));
    if (scoreSort === 'asc') list.sort((a, b) => a.score - b.score);
    if (scoreSort === 'desc') list.sort((a, b) => b.score - a.score);
    return list;
  }, [studentRecords, scoreSort, lessonConfigs]);

  // 口语类统计行：个人报告用（选中学生）/ 班级报告用（全班）
  const optionalStudentRows = useMemo(
    () => optionalScoreFields.map(f => summarizeOptional(f, studentRecords)),
    [optionalScoreFields, studentRecords]
  );
  const optionalClassRows = useMemo(
    () => optionalScoreFields.map(f => summarizeOptional(f, classReportRecords)),
    [optionalScoreFields, classReportRecords]
  );

  // 班级组合图数据：每次课「班级平均正确率（柱）+ 最高/最低（线）+ 目标线 + 达标人数」
  const classComboTrend = useMemo(() => {
    const scored = classReportRecords.filter(r => !isAbsentRecord(r));
    const lessons = Array.from(new Set(scored.map(r => r.lessonNumber))).sort((a, b) => a - b);
    return lessons.map(ln => {
      const rs = scored.filter(r => r.lessonNumber === ln);
      const rates = rs.map(r => r.correctRate);
      return {
        lesson: `第${ln}课`,
        班级平均: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0,
        班级最高: rates.length ? Math.max(...rates) : 0,
        班级最低: rates.length ? Math.min(...rates) : 0,
        达标人数: rs.filter(r => r.correctRate >= 80).length,
        人数: rs.length,
      };
    });
  }, [classReportRecords]);

  // 组合图数据：每次课「本生正确率（柱）+ 班级平均/最高（线）+ 目标线」
  // 统一用正确率口径，跨课次可比（各次满分不同，绝对分不可比）
  const comboTrend = useMemo(() => {
    const classPresent = records.filter(r => !isAbsentRecord(r));
    return studentRecords.map(r => {
      const sameLesson = classPresent.filter(x => x.lessonNumber === r.lessonNumber);
      const rates = sameLesson.map(x => x.correctRate);
      const avg = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
      return {
        lesson: `第${r.lessonNumber}课`,
        学生正确率: r.correctRate,
        班级平均: avg,
        班级最高: rates.length ? Math.max(...rates) : 0,
        班级排名: r.rank,
      };
    });
  }, [studentRecords, records]);


  // 雷达图数据 - 能力维度（坐标轴上限取各题型真实满分，而非写死 100）
  const radarData = useMemo(() => {
    if (!studentStats) return [];
    return studentStats.avgQuestionTypeScores.map(qt => ({
      subject: qt.name,
      A: qt.avgScore,
      fullMark: qt.fullScore || 100
    }));
  }, [studentStats]);

  // 校内成绩表格数据
  const examTableData = useMemo(() => {
    return studentSchoolScores.map(score => ({
      examName: score.examName,
      date: score.date,
      score: score.score,
      totalScore: score.totalScore,
      rate: score.totalScore > 0 ? Math.round((score.score / score.totalScore) * 100) : 0,
      classRank: score.classRank,
      gradeRank: score.gradeRank,
      classSize: score.classSize
    }));
  }, [studentSchoolScores]);

  // 导出班级报告为图片
  const exportClassReportImage = async () => {
    if (!classReportRef.current) { toast.error('导出失败：报告内容尚未渲染完成，请稍后重试'); return; }
    try {
      const html2canvas = (await import('html2canvas')).default;
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
      toast.error('导出图片失败：' + (err instanceof Error ? err.message : String(err)));
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
        <p className="text-[color:var(--ink-4)]">还没添加学生——先在「学情记录」里把班级学员建好，这里就能看到每个人的学情报告了</p>
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
                <div className="flex flex-wrap gap-2" data-html2canvas-ignore="true">
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
          comboTrend={comboTrend}
          optionalRows={optionalStudentRows}

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
          customFields={allCustomFields}
          personalReportRef={personalReportRef}
        />
      ) : (
        <div ref={classReportRef} className="space-y-6 bg-white p-6 rounded-2xl">
          <ClassReport
            currentClassName={currentClassName}
            selectedLesson={selectedLesson}
            classStats={classStats}
            classComboTrend={classComboTrend}
            optionalRows={optionalClassRows}
            classReportRecords={classReportRecords}
            getNickname={getNickname}
            customFields={allCustomFields}
          />
        </div>
      )}
    </div>
  );
}

