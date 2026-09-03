import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Settings, Users, Pencil, Check, Layers, CalendarDays, Upload } from 'lucide-react';
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

  // 所有学期（去重排序）
  const allTerms = useMemo(() => {
    const terms = new Set<string>();
    Object.values(classes).forEach(c => { if (c.term) terms.add(c.term); });
    return ['全部', ...Array.from(terms).sort()];
  }, [classes]);

  const visibleClasses = useMemo(() => {
    return Object.values(classes).filter(c => activeTerm === '全部' || c.term === activeTerm);
  }, [classes, activeTerm]);

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

  return (
    <div className="ios-glass-card px-6 py-4 mx-auto max-w-[1600px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#1c1c1e] flex items-center gap-3">
          <div className="w-9 h-9 bg-[rgb(var(--accent-rgb)/0.1)] rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-[color:var(--accent)]" />
          </div>
          班级选择
        </h2>
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl border-[rgb(var(--accent-rgb)/0.2)] text-[color:var(--accent)] hover:bg-[rgb(var(--accent-rgb)/0.05)]">
              <Settings className="w-4 h-4" />
              班级管理
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg ios-glass-card border-0">
            <DialogHeader>
              <DialogTitle className="text-[#1c1c1e]">班级管理</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Input
                  placeholder="新班级名称，如 初三双语班"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                  className="ios-input"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="财年季度，如 FY27Q1"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    className="ios-input"
                  />
                  <Input
                    placeholder="批次编号，如 TG3ZY078（选填）"
                    value={newBatchCode}
                    onChange={(e) => setNewBatchCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                    className="ios-input"
                  />
                </div>
                <Button onClick={handleCreateClass} className="w-full gap-2 ios-button">
                  <Plus className="w-4 h-4" />
                  添加班级
                </Button>
                <Button
                  onClick={() => setBulkImportOpen(true)}
                  variant="outline"
                  className="w-full gap-2 rounded-xl border-[rgb(var(--accent-rgb)/0.25)] text-[color:var(--accent)] hover:bg-[rgb(var(--accent-rgb)/0.06)]"
                >
                  <Upload className="w-4 h-4" />
                  批量导入学员（四列表格）
                </Button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {Object.values(classes).map((cls) => (
                  editingId === cls.id ? (
                    <div key={cls.id} className="p-3 bg-[#e8f1ff] rounded-xl space-y-2">
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="班级名称"
                        className="ios-input h-9"
                      />
                      <div className="flex gap-2">
                        <Input
                          value={editForm.term}
                          onChange={(e) => setEditForm(f => ({ ...f, term: e.target.value }))}
                          placeholder="财年季度"
                          className="ios-input h-9"
                        />
                        <Input
                          value={editForm.batchCode}
                          onChange={(e) => setEditForm(f => ({ ...f, batchCode: e.target.value }))}
                          placeholder="批次编号"
                          className="ios-input h-9"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="rounded-lg h-8" onClick={() => setEditingId(null)}>取消</Button>
                        <Button size="sm" className="rounded-lg h-8 gap-1 ios-button" onClick={saveEdit}>
                          <Check className="w-3.5 h-3.5" />
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={cls.id}
                      className="flex items-center justify-between p-3 bg-[#f2f2f7] rounded-xl hover:bg-[#e5e5ea] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[#1c1c1e]">{cls.name}</span>
                          {cls.term && (
                            <span className="text-xs bg-[rgb(var(--accent-rgb)/0.1)] text-[color:var(--accent)] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {cls.term}
                            </span>
                          )}
                          {cls.batchCode && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              {cls.batchCode}
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-[#8e8e93]">{cls.students.length}名学生</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(cls)}
                          className="text-[#8e8e93] hover:text-[color:var(--accent)] rounded-xl"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteClass(cls.id)}
                          className="text-[#ff3b30] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-xl"
                        >
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

        {/* 批量导入学员 */}
        <BulkStudentImportDialog
          isOpen={bulkImportOpen}
          onClose={() => setBulkImportOpen(false)}
          classes={classes}
          onCreateClass={onCreateClass}
          onAddStudents={onAddStudents}
        />
      </div>

      {/* 学期筛选 */}
      {allTerms.length > 2 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-[#8e8e93] mr-1 flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            学期：
          </span>
          {allTerms.map(term => (
            <button
              key={term}
              onClick={() => setActiveTerm(term)}
              className={`
                px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                ${activeTerm === term
                  ? 'bg-[#1c1c1e] text-white'
                  : 'bg-[#f2f2f7] text-[#8e8e93] hover:bg-[#e5e5ea]'}
              `}
            >
              {term}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {visibleClasses.map((cls) => (
          <button
            key={cls.id}
            onClick={() => onSelectClass(cls.id)}
            className={`
              px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
              flex items-center gap-2
              ${currentClassId === cls.id
                ? 'bg-[rgb(var(--accent-rgb)/0.12)] text-white shadow-md shadow-[rgb(var(--accent-rgb)/25)]'
                : 'bg-[#f2f2f7] text-[#1c1c1e] hover:bg-[#e5e5ea]'
              }
            `}
          >
            <span>{cls.name}</span>
            {cls.term && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${currentClassId === cls.id ? 'bg-white/20' : 'bg-[rgb(var(--accent-rgb)/0.1)] text-[color:var(--accent)]'}`}>
                {cls.term}
              </span>
            )}
            {cls.batchCode && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${currentClassId === cls.id ? 'bg-white/20' : 'bg-purple-100 text-purple-700'}`}>
                {cls.batchCode}
              </span>
            )}
          </button>
        ))}
        {visibleClasses.length === 0 && (
          <p className="text-sm text-[#8e8e93] py-2">该学期暂无班级，可在"班级管理"中新建</p>
        )}
      </div>
    </div>
  );
}
