// 学生转班对话框：转出（保留原班历史）+ 可选转入目标班（新班从零统计）
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, ShieldCheck, AlertTriangle } from 'lucide-react';

export interface TransferClassOption {
  id: string;
  name: string;
  students: string[];
  recordCount: number;
}

interface TransferStudentDialogProps {
  open: boolean;
  onClose: () => void;
  fromClassId: string;
  fromClassName: string;
  students: string[];
  classes: TransferClassOption[];
  getNickname: (name: string) => string;
  onConfirm: (studentName: string, toClassId: string | null) => void;
}

const NONE = '__none__';

export function TransferStudentDialog({
  open, onClose, fromClassId, fromClassName, students, classes, getNickname, onConfirm
}: TransferStudentDialogProps) {
  const [student, setStudent] = useState<string>('');
  const [target, setTarget] = useState<string>(NONE);

  // 每次打开重置选择
  useEffect(() => {
    if (open) { setStudent(''); setTarget(NONE); }
  }, [open]);

  const otherClasses = useMemo(() => classes.filter(c => c.id !== fromClassId), [classes, fromClassId]);
  const targetClass = otherClasses.find(c => c.id === target);
  // 目标班是否已有该生历史记录（同名学生）
  const targetHasHistory = !!(targetClass && targetClass.recordCount > 0 && targetClass.students.includes(student));
  const targetMayHaveHistory = !!(targetClass && targetClass.recordCount > 0);
  const canConfirm = !!student && students.includes(student);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[color:var(--ink)]">
            <ArrowRightLeft className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            学生转班
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[color:var(--ink-2)]">转班学员（当前班级：{fromClassName}）</label>
            <Select value={student} onValueChange={setStudent}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder={students.length ? '选择学员' : '本班暂无学员'} /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s} value={s}>{getNickname(s)}（{s}）</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[color:var(--ink-2)]">转入班级</label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>不转入（仅从本班转出）</SelectItem>
                {otherClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}（{c.students.length}人）</SelectItem>)}
              </SelectContent>
            </Select>
            {otherClasses.length === 0 && (
              <p className="text-xs text-amber-600">还没有其他班级可转入，可先在班级选择栏新建班级</p>
            )}
          </div>

          {target !== NONE && targetMayHaveHistory && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {targetHasHistory
                  ? `目标班级名单中已存在同名学员「${student}」。转班后其在本班的历史记录仍归本班；目标班若已有该生记录，两边记录相互独立、互不合并。`
                  : '目标班级已有历史学情记录。该生转入后仅加入名单，不迁移本班记录；新班的平均分、排名等统计将基于目标班全部学员数据重新计算。'}
              </span>
            </div>
          )}

          <div className="rounded-xl bg-[rgb(var(--brand-rgb)/0.05)] border border-[rgb(var(--brand-rgb)/0.15)] p-3.5">
            <p className="text-xs font-semibold text-[color:var(--ink-2)] flex items-center gap-1.5 mb-2">
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--brand)' }} />转班数据归属规则
            </p>
            <ul className="text-xs text-[color:var(--ink-3)] space-y-1.5 leading-relaxed list-disc pl-4">
              <li><b>历史记录留在原班</b>：本班保留该生全部学情记录，以往课次的班级统计口径不变；该生从学员名单移出，不再出现在后续课次录入中。</li>
              <li><b>新班从零开始</b>：转入班级后不携带任何学情记录，从下一课次起正常录入；新班的平均分、排名、薄弱项等全部按新班数据重新计算。</li>
              <li><b>可随时归队</b>：在原班「已转出学员」中点「恢复」即可回到名单，历史记录自动接续；转班操作本身支持在提示条 8 秒内撤销。</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="rounded-xl" onClick={onClose}>取消</Button>
            <Button
              className="ios-button gap-2 rounded-xl"
              disabled={!canConfirm}
              onClick={() => { if (canConfirm) { onConfirm(student, target === NONE ? null : target); } }}
            >
              <ArrowRightLeft className="w-4 h-4" />
              确认转班
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
