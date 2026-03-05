import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Copy, Check } from 'lucide-react';
import { generatePersonalFeedback, copyToClipboard } from '@/lib/feedbackTemplates';
import type { StudentRecord, LessonConfig, ClassStats, QuestionType } from '@/types';

interface FeedbackGeneratorProps {
  students: string[];
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => ClassStats;
}

export function FeedbackGenerator({
  students,
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: FeedbackGeneratorProps) {
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const lessonRecords = useMemo(() => 
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() => 
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  const calculateWeakPoints = (record: StudentRecord) => {
    const weakPoints: { questionTypeId: string; questionTypeName: string; studentScore: number; classAvgScore: number; diff: number }[] = [];
    lessonConfig.questionTypes.forEach(qt => {
      const studentScore = record.scores[qt.id] || 0;
      const classAvgScore = stats.avgScores[qt.id] || 0;
      const diff = studentScore - classAvgScore;
      if (diff < -5) {
        weakPoints.push({ questionTypeId: qt.id, questionTypeName: qt.name, studentScore, classAvgScore, diff });
      }
    });
    return weakPoints.sort((a, b) => a.diff - b.diff);
  };

  const handleGenerate = () => {
    if (!selectedStudent) return;

    const record = records.find(r => r.studentName === selectedStudent && r.lessonNumber === lessonNumber);
    if (!record) {
      setFeedback('该学生暂无本课次记录，请先录入数据。');
      return;
    }

    const weakPoints = calculateWeakPoints(record);

    const generatedFeedback = generatePersonalFeedback(
      record,
      lessonConfig,
      stats,
      weakPoints,
      getNickname(selectedStudent)
    );

    setFeedback(generatedFeedback);
  };

  const handleCopy = async () => {
    if (!feedback) return;
    const success = await copyToClipboard(feedback);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          个性化私发反馈
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={selectedStudent} onValueChange={setSelectedStudent}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="选择学生" />
            </SelectTrigger>
            <SelectContent>
              {students.map(student => (
                <SelectItem key={student} value={student}>
                  {getNickname(student)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleGenerate}
            disabled={!selectedStudent}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            生成反馈
          </Button>
        </div>

        {feedback && (
          <>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[300px] font-mono text-sm bg-slate-50 border-slate-200"
            />
            <Button
              onClick={handleCopy}
              variant="outline"
              className="w-full gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制反馈
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
