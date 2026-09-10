// 班级信息卡 —— 仪表盘风格：渐变头部 + 统计瓷贴 + 出勤概览
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Layers, FileText, CalendarDays, BookOpen, ArrowRightLeft, UserRoundSearch, Undo2 } from 'lucide-react';
import type { Class } from '@/types';

export interface TransferredOutStudent {
  name: string;
  recordCount: number;
  lastLesson: number;
}

interface ClassInfoCardProps {
  classData: Class | null;
  onManageStudents: () => void;
  /** 打开转班对话框 */
  onTransferStudent?: () => void;
  /** 已转出学员（有历史记录但不在名单） */
  transferredOut?: TransferredOutStudent[];
  /** 恢复学员到名单 */
  onRestoreStudent?: (name: string) => void;
  /** 查看学员历史分析 */
  onViewStudent?: (name: string) => void;
}

export function ClassInfoCard({ classData, onManageStudents, onTransferStudent, transferredOut = [], onRestoreStudent, onViewStudent }: ClassInfoCardProps) {
  // hook 必须在早返回之前，避免 classData 由 null↔非 null 切换时 hook 数量变化
  const savedLessons = useMemo(() => new Set((classData?.records || []).map(r => r.lessonNumber)).size, [classData?.records]);

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center shadow-sm shrink-0">
              <Users className="w-4.5 h-4.5 text-[color:var(--brand)]" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 leading-tight truncate">{classData.name}</p>
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
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {onTransferStudent && (
              <Button variant="outline" size="sm" onClick={onTransferStudent} className="gap-1 rounded-xl h-8 px-2.5 bg-white/70 border-white" title="学生转班（保留本班历史记录）">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                转班
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onManageStudents} className="gap-1 rounded-xl h-8 px-2.5 bg-white/70 border-white">
              <UserPlus className="w-3.5 h-3.5" />
              管理
            </Button>
          </div>
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

        {/* 已转出学员：历史记录保留在本班，可恢复回名单 */}
        {transferredOut.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" />已转出学员</span>
              <Badge variant="secondary" className="text-[10px] h-5">{transferredOut.length} 人</Badge>
            </p>
            <div className="space-y-1.5">
              {transferredOut.map(t => (
                <div key={t.name} className="flex items-center gap-2 text-xs rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
                  <span className="text-slate-500 line-through">{t.name}</span>
                  <span className="text-slate-400">{t.recordCount} 条记录 · 至第{t.lastLesson}课</span>
                  <span className="ml-auto flex items-center gap-1">
                    {onViewStudent && (
                      <button onClick={() => onViewStudent(t.name)} title="查看历史学情分析" className="p-1 rounded-md text-slate-400 hover:text-[color:var(--brand)] hover:bg-white">
                        <UserRoundSearch className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onRestoreStudent && (
                      <button onClick={() => onRestoreStudent(t.name)} title="恢复到本班名单（历史记录自动接续）" className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-white">
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">转出仅移出名单，历史记录仍计入以往课次的班级统计</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
