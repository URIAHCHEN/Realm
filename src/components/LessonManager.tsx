import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, BookOpen } from 'lucide-react';

interface LessonManagerProps {
  currentLessonNumber: number;
  allLessons: number[];
  onSelectLesson: (lesson: number) => void;
  onAddLesson: (lesson: number) => void;
  onSaveCurrentLesson: () => void;
}

export function LessonManager({
  currentLessonNumber,
  allLessons,
  onSelectLesson,
  onAddLesson,
  onSaveCurrentLesson
}: LessonManagerProps) {
  const [newLessonNumber, setNewLessonNumber] = useState('');

  const handleAddLesson = () => {
    const lesson = parseInt(newLessonNumber);
    if (lesson > 0) {
      onAddLesson(lesson);
      setNewLessonNumber('');
    }
  };

  // 确保当前课次在列表中
  const displayLessons = allLessons.includes(currentLessonNumber) 
    ? allLessons 
    : [...allLessons, currentLessonNumber].sort((a, b) => a - b);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          课次管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">当前课次</span>
          <Badge className="text-lg px-4 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-0">
            第{currentLessonNumber}课
          </Badge>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            placeholder="新课次"
            value={newLessonNumber}
            onChange={(e) => setNewLessonNumber(e.target.value)}
            className="w-24"
          />
          <Button
            variant="outline"
            onClick={handleAddLesson}
            className="gap-2 flex-1"
          >
            <Plus className="w-4 h-4" />
            增加
          </Button>
        </div>

        <Button
          onClick={onSaveCurrentLesson}
          className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
        >
          <Save className="w-4 h-4" />
          保存当前课次
        </Button>

        <div className="pt-2">
          <span className="text-xs text-slate-400 mb-2 block">已保存课次</span>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {displayLessons.length === 0 ? (
              <span className="text-sm text-slate-400">暂无课次记录</span>
            ) : (
              displayLessons.map((lesson) => (
                <button
                  key={lesson}
                  onClick={() => onSelectLesson(lesson)}
                  className={`
                    px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
                    ${currentLessonNumber === lesson
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }
                  `}
                >
                  第{lesson}课
                </button>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
