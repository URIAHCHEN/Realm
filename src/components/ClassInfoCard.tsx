// 班级信息模块（2026-10-08 拆分版）：原来挤在左侧栏的一张竖卡，拆成两块，
// 跟着学情记录表上下铺开 —— 表格终于可以用满整行宽度，"上短下长"的问题随之消失。
//   · ClassInfoBand   → 表格上方：班级头部（名称/学期/批次 + 转班/管理/分组）+ 统计瓷贴横排
//   · ClassRosterCard → 表格下方：学员名单胶囊 + 已转出学员（名单性质的内容放表后，不打断录入视线）
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Layers, FileText, CalendarDays, BookOpen, ArrowRightLeft, UserRoundSearch, Undo2, Copy, UsersRound } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { toast } from 'sonner';
import { GroupDialog } from '@/components/GroupDialog';
import type { Class } from '@/types';

export interface TransferredOutStudent {
  name: string;
  recordCount: number;
  lastLesson: number;
}

interface ClassInfoBandProps {
  classData: Class | null;
  onManageStudents: () => void;
  /** 打开转班对话框 */
  onTransferStudent?: () => void;
  /** 昵称解析（分组对话框展示用） */
  getNickname?: (name: string) => string;
  /** 当前课次（分组对话框标题用） */
  lessonNumber?: number;
}

/** 表格上方的班级信息横条 */
export function ClassInfoBand({ classData, onManageStudents, onTransferStudent, getNickname, lessonNumber = 1 }: ClassInfoBandProps) {
  // hook 必须在早返回之前，避免 classData 由 null↔非 null 切换时 hook 数量变化
  const savedLessons = useMemo(() => new Set((classData?.records || []).map(r => r.lessonNumber)).size, [classData?.records]);
  const [groupOpen, setGroupOpen] = useState(false);

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
    { icon: <FileText className="w-4 h-4" />, label: '学情记录', value: `${classData.records.length}条`, tone: 'bg-[rgb(var(--brand-rgb)/0.08)] text-[color:var(--brand)]' },
    { icon: <Layers className="w-4 h-4" />, label: '已配置课次', value: `${configuredLessons}个`, tone: 'bg-amber-50 text-amber-600' },
    { icon: <BookOpen className="w-4 h-4" />, label: '已保存课次', value: `${savedLessons}个`, tone: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <>
      <Card className="rounded-2xl bg-white/60 backdrop-blur border border-black/5 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-stretch">
          {/* 渐变头部：班级名 + 学期/批次 + 操作按钮 */}
          <div className="bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.12)] to-[rgb(var(--brand-rgb)/0.25)] px-5 py-4 flex items-center gap-3 flex-wrap sm:flex-nowrap min-w-0">
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[rgb(var(--brand-rgb)/0.12)] text-[color:var(--brand)] font-mono">{classData.batchCode}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 sm:ml-auto">
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
              <Button variant="outline" size="sm" onClick={() => setGroupOpen(true)} className="gap-1 rounded-xl h-8 px-2.5 bg-white/70 border-white" title="基于当课次名单随机分组">
                <UsersRound className="w-3.5 h-3.5" />
                分组
              </Button>
            </div>
          </div>

          {/* 统计瓷贴：横排铺满剩余宽度 */}
          <div className="flex-1 min-w-[320px] grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
            {stats.map(s => (
              <div key={s.label} className="rounded-xl bg-slate-50/80 border border-black/[0.03] p-2.5 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.tone}`}>{s.icon}</div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-800 leading-none">{s.value}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <GroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        students={classData.students}
        lessonNumber={lessonNumber}
        getNickname={getNickname || ((s: string) => s)}
      />
    </>
  );
}

interface ClassRosterCardProps {
  classData: Class | null;
  /** 已转出学员（有历史记录但不在名单） */
  transferredOut?: TransferredOutStudent[];
  /** 恢复学员到名单 */
  onRestoreStudent?: (name: string) => void;
  /** 查看学员历史分析 */
  onViewStudent?: (name: string) => void;
  /** 昵称解析（复制名单展示用） */
  getNickname?: (name: string) => string;
}

/** 表格下方的学员名单卡 */
export function ClassRosterCard({ classData, transferredOut = [], onRestoreStudent, onViewStudent, getNickname }: ClassRosterCardProps) {
  if (!classData) return null;

  const nick = getNickname || ((s: string) => s);

  // 一键复制本课学生名单（逐行一列）
  const copyRoster = async () => {
    if (classData.students.length === 0) {
      toast.error('本班暂无学生');
      return;
    }
    const text = classData.students.map(nick).join('\n');
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`已复制 ${classData.students.length} 人名单（逐行）`);
    else toast.error('复制失败，请手动选择复制');
  };

  return (
    <Card className="rounded-2xl bg-white/60 backdrop-blur border border-black/5 shadow-sm">
      <CardContent className="p-4 pt-4 space-y-4">
        {/* 学员名单胶囊 */}
        {classData.students.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                学员名单
                <button
                  onClick={copyRoster}
                  aria-label="一键复制该课次学生名单（逐行）"
                  title="一键复制该课次学生名单（逐行）"
                  className="p-1 rounded-md text-slate-400 hover:text-[color:var(--brand)] hover:bg-white"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </span>
              <Badge variant="secondary" className="text-[10px] h-5">{classData.students.length} 人</Badge>
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
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
          <div>
            <p className="text-xs text-slate-400 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" />已转出学员</span>
              <Badge variant="secondary" className="text-[10px] h-5">{transferredOut.length} 人</Badge>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {transferredOut.map(t => (
                <div key={t.name} className="flex items-center gap-2 text-xs rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
                  <span className="text-slate-500 line-through">{t.name}</span>
                  <span className="text-slate-400">{t.recordCount} 条记录 · 至第{t.lastLesson}课</span>
                  <span className="flex items-center gap-1">
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
