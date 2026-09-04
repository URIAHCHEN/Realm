// 课次管理卡 —— 仪表盘风格：当前课次大徽章 + 快速切换网格 + 一键保存
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, BookOpen, CheckCircle2 } from 'lucide-react';

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
    } else {
      // 输入为空时，自动加到最大课次+1
      const next = allLessons.length > 0 ? Math.max(...allLessons) + 1 : 1;
      onAddLesson(next);
    }
  };

  // 确保当前课次在列表中
  const displayLessons = allLessons.includes(currentLessonNumber)
    ? allLessons
    : [...allLessons, currentLessonNumber].sort((a, b) => a - b);

  return (
    <Card className="rounded-2xl bg-white/60 backdrop-blur border border-black/5 shadow-sm">
      <CardContent className="p-4 space-y-4">
        {/* 当前课次大徽章 */}
        <div className="rounded-xl bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.12)] to-[rgb(var(--brand-rgb)/0.25)] p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
              <BookOpen className="w-4 h-4 text-[color:var(--brand)]" />
            </div>
            <span className="text-sm font-medium text-slate-600">当前课次</span>
          </div>
          <Badge className="text-lg px-4 py-1 rounded-xl bg-white/80 text-[color:var(--brand-strong)] border-0 shadow-sm font-bold">
            第 {currentLessonNumber} 课
          </Badge>
        </div>

        {/* 保存按钮 */}
        <Button
          onClick={onSaveCurrentLesson}
          className="w-full gap-2 rounded-xl ios-button h-10"
        >
          <Save className="w-4 h-4" />
          保存当前课次
        </Button>

        {/* 课次切换网格 */}
        <div>
          <p className="text-xs text-slate-400 mb-2 flex items-center justify-between">
            <span>课次列表</span>
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3" />
              {displayLessons.length} 个
            </span>
          </p>
          <div className="grid grid-cols-5 gap-1.5 max-h-36 overflow-y-auto pb-1">
            {displayLessons.length === 0 ? (
              <span className="text-sm text-slate-400 col-span-5 text-center py-2">暂无课次，点击下方 + 新建</span>
            ) : (
              displayLessons.map((lesson) => (
                <button
                  key={lesson}
                  onClick={() => onSelectLesson(lesson)}
                  className={`
                    h-9 rounded-lg text-sm font-semibold transition-all duration-150
                    ${currentLessonNumber === lesson
                      ? 'bg-[color:var(--brand)] text-white shadow-md shadow-[rgb(var(--brand-rgb)/0.3)]'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-[rgb(var(--brand-rgb)/0.1)] hover:text-[color:var(--brand)]'}
                  `}
                >
                  {lesson}
                </button>
              ))
            )}
          </div>
        </div>

        {/* 快速新增 */}
        <div className="flex gap-2">
          <div className="flex rounded-xl overflow-hidden border border-black/10 bg-white/70">
            <button
              onClick={() => onAddLesson(Math.max(0, ...allLessons, 0) + 1)}
              className="px-3 flex items-center justify-center text-slate-400 hover:text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)] transition-colors"
              title="新建下一个课次"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <Input
            type="number"
            min={1}
            placeholder="指定课次号"
            value={newLessonNumber}
            onChange={(e) => setNewLessonNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLesson()}
            className="h-9 rounded-xl bg-white/70"
          />
          <Button variant="outline" onClick={handleAddLesson} className="gap-1.5 rounded-xl h-9 shrink-0">
            <Plus className="w-4 h-4" />
            增加
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
