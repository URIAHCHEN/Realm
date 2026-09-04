import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Settings, Users, Pencil, Check, Layers, CalendarDays, Upload, FolderPlus, SearchX } from 'lucide-react';
import { BulkStudentImportDialog } from '@/components/BulkStudentImportDialog';
import type { Class } from '@/types';

interface ClassSelectorProps {
  classes: { [key: string]: Class };
  currentClassId: string | null;
  onSelectClass: (classId: string) => void;
  onCreateClass: (name: string, term?: string, batchCode?: string) => string;
  onUpdateClass: (classId: string, patch: { name?: string; term?: string; batchCode?: string }) => void;
  onDeleteClass: (classId: string) => void;
  onAddStudents: (classId: string, studentNames: string[]) => void;
}

export function ClassSelector({
  classes,
  currentClassId,
  onSelectClass,
  onCreateClass,
  onUpdateClass,
  onDeleteClass,
  onAddStudents
}: ClassSelectorProps) {
  const [newClassName, setNewClassName] = useState('');
  const [newTerm, setNewTerm] = useState('FY27Q1');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', term: '', batchCode: '' });
  const [activeTerm, setActiveTerm] = useState<string>('全部');
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const allClasses = useMemo(() => Object.values(classes), [classes]);

  const allTerms = useMemo(() => {
    const terms = new Set<string>();
    allClasses.forEach(c => { if (c.term) terms.add(c.term); });
    return ['全部', ...Array.from(terms).sort()];
  }, [allClasses]);

  const visibleClasses = useMemo(
    () => allClasses.filter(c => activeTerm === '全部' || c.term === activeTerm),
    [allClasses, activeTerm]
  );

  const totalEmpty = allClasses.length === 0;

  const handleCreateClass = () => {
    if (newClassName.trim()) {
      onCreateClass(newClassName.trim(), newTerm.trim(), newBatchCode.trim());
      setNewClassName('');
      setNewBatchCode('');
    }
  };

  const startEdit = (cls: Class) => {
    setEditingId(cls.id);
    setEditForm({ name: cls.name, term: cls.term || '', batchCode: cls.batchCode || '' });
  };

  const saveEdit = () => {
    if (editingId && editForm.name.trim()) {
      onUpdateClass(editingId, {
        name: editForm.name.trim(),
        term: editForm.term.trim(),
        batchCode: editForm.batchCode.trim()
      });
      setEditingId(null);
    }
  };

  const ManageButton = (
    <Dialog open={manageOpen} onOpenChange={setManageOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]">
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">班级管理</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[color:var(--ink)]">班级管理</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Input
              placeholder="新班级名称，如 初三双语班"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
              className="ios-input"
            />
            <div className="flex gap-2">
              <Input placeholder="财年季度，如 FY27Q1" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} className="ios-input" />
              <Input
                placeholder="批次编号，如 TG3ZY078（选填）"
                value={newBatchCode}
                onChange={(e) => setNewBatchCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                className="ios-input"
              />
            </div>
            <Button onClick={handleCreateClass} className="ios-button w-full">
              <Plus className="w-4 h-4" />添加班级
            </Button>
            <Button
              onClick={() => setBulkImportOpen(true)}
              variant="outline"
              className="w-full gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]"
            >
              <Upload className="w-4 h-4" />批量导入学员（四列表格）
            </Button>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {allClasses.map((cls) => (
              editingId === cls.id ? (
                <div key={cls.id} className="p-3 rounded-[var(--r-md)] bg-[rgb(var(--brand-rgb)/0.06)] ring-1 ring-[rgb(var(--brand-rgb)/0.15)] space-y-2">
                  <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="班级名称" className="ios-input h-9" />
                  <div className="flex gap-2">
                    <Input value={editForm.term} onChange={(e) => setEditForm(f => ({ ...f, term: e.target.value }))} placeholder="财年季度" className="ios-input h-9" />
                    <Input value={editForm.batchCode} onChange={(e) => setEditForm(f => ({ ...f, batchCode: e.target.value }))} placeholder="批次编号" className="ios-input h-9" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="rounded-[var(--r-md)] h-8" onClick={() => setEditingId(null)}>取消</Button>
                    <Button size="sm" className="ios-button h-8 px-3" onClick={saveEdit}>
                      <Check className="w-3.5 h-3.5" />保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={cls.id} className="flex items-center justify-between gap-3 p-3 rounded-[var(--r-md)] bg-black/[0.03] hover:bg-black/[0.06] transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[color:var(--ink)]">{cls.name}</span>
                      {cls.term && (
                        <span className="text-xs bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />{cls.term}
                        </span>
                      )}
                      {cls.batchCode && (
                        <span className="text-xs bg-[#f3e8ff] text-[#7e22ce] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                          <Layers className="w-3 h-3" />{cls.batchCode}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-[color:var(--ink-4)]">{cls.students.length} 名学生</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(cls)} className="text-[color:var(--ink-4)] hover:text-[color:var(--brand)] rounded-[var(--r-md)]" aria-label="编辑班级">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteClass(cls.id)} className="text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-[var(--r-md)]" aria-label="删除班级">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="ios-glass-card p-4 sm:p-6 mx-auto max-w-[1600px]">
      {/* 标题行 */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[color:var(--ink)] font-semibold text-base flex items-center gap-3">
          <span className="w-9 h-9 bg-[rgb(var(--brand-rgb)/0.1)] rounded-[var(--r-md)] flex items-center justify-center">
            <Users className="w-5 h-5 text-[color:var(--brand)]" />
          </span>
          班级选择
          {!totalEmpty && <span className="text-[color:var(--ink-4)] text-sm font-normal">· {visibleClasses.length}/{allClasses.length}</span>}
        </h2>
        {ManageButton}
      </div>

      {/* 空状态：完全没有班级 */}
      {totalEmpty ? (
        <div className="empty-general mt-2">
          <span className="empty-ico"><FolderPlus className="w-6 h-6" /></span>
          <div className="empty-t">还没有班级</div>
          <div className="empty-d">创建第一个班级，或用「批量导入学员」一次建好几个班。</div>
          <div className="flex gap-2 mt-1">
            <Button className="ios-button" onClick={() => setManageOpen(true)}><Plus className="w-4 h-4" />新建班级</Button>
            <Button variant="outline" className="gap-2 rounded-[var(--r-md)] border-[rgb(var(--brand-rgb)/0.25)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]" onClick={() => setBulkImportOpen(true)}>
              <Upload className="w-4 h-4" />批量导入
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 学期筛选 */}
          {allTerms.length > 2 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-4">
              <span className="text-xs text-[color:var(--ink-4)] mr-1 inline-flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />学期：
              </span>
              {allTerms.map(term => (
                <button
                  key={term}
                  onClick={() => setActiveTerm(term)}
                  aria-pressed={activeTerm === term}
                  className={
                    'px-2.5 h-7 rounded-[var(--r-sm)] text-xs font-medium transition-colors ' +
                    (activeTerm === term
                      ? 'bg-[color:var(--brand)] text-white shadow-[0_2px_8px_rgb(var(--brand-rgb)/0.30)]'
                      : 'bg-black/[0.05] text-[color:var(--ink-3)] hover:bg-black/[0.09]')
                  }
                >
                  {term}
                </button>
              ))}
            </div>
          )}

          {/* 班级胶囊 */}
          {visibleClasses.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-4">
              {visibleClasses.map((cls) => {
                const active = currentClassId === cls.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => onSelectClass(cls.id)}
                    aria-pressed={active}
                    className={
                      'px-4 h-10 rounded-[var(--r-md)] text-sm font-medium inline-flex items-center gap-2 transition-all duration-200 ' +
                      (active
                        ? 'bg-[color:var(--brand)] text-white shadow-[0_6px_18px_rgb(var(--brand-rgb)/0.30)]'
                        : 'bg-white/70 text-[color:var(--ink)] ring-1 ring-black/5 hover:ring-[rgb(var(--brand-rgb)/0.4)] hover:bg-white')
                    }
                  >
                    <span className="truncate max-w-[12rem]">{cls.name}</span>
                    {cls.term && (
                      <span className={'text-[10px] px-1.5 py-0.5 rounded-md ' + (active ? 'bg-white/20 text-white' : 'bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)]')}>
                        {cls.term}
                      </span>
                    )}
                    {cls.batchCode && (
                      <span className={'text-[10px] px-1.5 py-0.5 rounded-md font-mono ' + (active ? 'bg-white/20 text-white' : 'bg-[#f3e8ff] text-[#7e22ce]')}>
                        {cls.batchCode}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-general mt-2 py-10">
              <span className="empty-ico"><SearchX className="w-6 h-6" /></span>
              <div className="empty-t">「{activeTerm}」暂无班级</div>
              <div className="empty-d">换一个学期，或新建一个班级。</div>
              <div className="flex gap-2 mt-1">
                <Button variant="outline" className="rounded-[var(--r-md)]" onClick={() => setActiveTerm('全部')}>查看全部学期</Button>
                <Button className="ios-button" onClick={() => setManageOpen(true)}><Plus className="w-4 h-4" />新建班级</Button>
              </div>
            </div>
          )}
        </>
      )}

      <BulkStudentImportDialog
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        classes={classes}
        onCreateClass={onCreateClass}
        onAddStudents={onAddStudents}
      />
    </div>
  );
}
