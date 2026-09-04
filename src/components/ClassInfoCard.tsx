// 班级信息卡 —— 仪表盘风格：渐变头部 + 统计瓷贴 + 出勤概览
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Layers, FileText, CalendarDays, BookOpen } from 'lucide-react';
import type { Class } from '@/types';

interface ClassInfoCardProps {
  classData: Class | null;
  onManageStudents: () => void;
}

export function ClassInfoCard({ classData, onManageStudents }: ClassInfoCardProps) {
  if (!classData) {
    return (
      <Card className="rounded-2xl bg-white/60 backdrop-blur border-black/5">
        <CardContent className="py-8 text-center text-slate-400">
          请先选择班级
        </CardContent>
      </Card>
    );
  }

  const configuredLessons = Object.keys(classData.lessonConfigs).length;
  const savedLessons = useMemo(() => new Set(classData.records.map(r => r.lessonNumber)).size, [classData.records]);

  const stats = [
    { icon: <Users className="w-4 h-4" />, label: '学员', value: `${classData.students.length}人`, tone: 'bg-sky-50 text-sky-600' },
    { icon: <FileText className="w-4 h-4" />, label: '学情记录', value: `${classData.records.length}条`, tone: 'bg-violet-50 text-violet-600' },
    { icon: <Layers className="w-4 h-4" />, label: '已配置课次', value: `${configuredLessons}个`, tone: 'bg-amber-50 text-amber-600' },
    { icon: <BookOpen className="w-4 h-4" />, label: '已保存课次', value: `${savedLessons}个`, tone: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <Card className="rounded-2xl bg-white/60 backdrop-blur border border-black/5 shadow-sm overflow-hidden">
      {/* 渐变头部 */}
      <div className="bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.12)] to-[rgb(var(--brand-rgb)/0.25)] px-5 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
              <Users className="w-4.5 h-4.5 text-[color:var(--brand)]" />
            </div>
            <div>
              <p className="font-bold text-slate-800 leading-tight">{classData.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {classData.term && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 text-[color:var(--brand)] flex items-center gap-0.5">
                    <CalendarDays className="w-2.5 h-2.5" />{classData.term}
                  </span>
                )}
                {classData.batchCode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100/80 text-purple-700 font-mono">{classData.batchCode}</span>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onManageStudents} className="gap-1.5 rounded-xl h-8 bg-white/70 border-white">
            <UserPlus className="w-3.5 h-3.5" />
            管理
          </Button>
        </div>
      </div>

      <CardContent className="p-4 pt-4">
        {/* 统计瓷贴 */}
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl bg-slate-50/80 border border-black/[0.03] p-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${s.tone}`}>{s.icon}</div>
              <p className="text-lg font-bold text-slate-800 leading-none">{s.value}</p>
              <p className="text-[11px] text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 学员名单胶囊预览 */}
        {classData.students.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-2 flex items-center justify-between">
              <span>学员名单</span>
              <Badge variant="secondary" className="text-[10px] h-5">{classData.students.length} 人</Badge>
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {classData.students.map(s => (
                <span key={s} className="text-xs px-2 py-1 rounded-lg bg-[rgb(var(--brand-rgb)/0.07)] text-slate-600 border border-[rgb(var(--brand-rgb)/0.12)]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
