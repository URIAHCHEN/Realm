import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Trophy, Copy, Check } from 'lucide-react';
import { generatePraise, copyToClipboard } from '@/lib/feedbackTemplates';
import type { StudentRecord, LessonConfig, QuestionType } from '@/types';

type PraiseType = 'entrance' | 'listening' | 'comprehensive';

interface PraiseGeneratorProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
}

export function PraiseGenerator({
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: PraiseGeneratorProps) {
  const [praiseType, setPraiseType] = useState<PraiseType>('comprehensive');
  const [praise, setPraise] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const lessonRecords = useMemo(() => 
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() => 
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  const handleGenerate = () => {
    const generatedPraise = generatePraise(
      lessonNumber,
      lessonRecords,
      lessonConfig,
      stats,
      getNickname,
      praiseType
    );
    
    setPraise(generatedPraise);
  };

  const handleCopy = async () => {
    if (!praise) return;
    const success = await copyToClipboard(praise);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          班群公示表彰
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={praiseType} onValueChange={(value) => setPraiseType(value as PraiseType)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrance">入门测表扬榜</SelectItem>
              <SelectItem value="listening">乐听说表扬榜</SelectItem>
              <SelectItem value="comprehensive">综合表彰</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleGenerate}
            className="bg-amber-500 hover:bg-amber-600"
          >
            生成表彰
          </Button>
        </div>

        {praise && (
          <>
            <Textarea
              value={praise}
              onChange={(e) => setPraise(e.target.value)}
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
                  复制表彰
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
