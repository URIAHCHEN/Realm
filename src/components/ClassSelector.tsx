import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Settings, Users } from 'lucide-react';
import type { Class } from '@/types';

interface ClassSelectorProps {
  classes: { [key: string]: Class };
  currentClassId: string | null;
  onSelectClass: (classId: string) => void;
  onCreateClass: (name: string) => void;
  onDeleteClass: (classId: string) => void;
}

export function ClassSelector({
  classes,
  currentClassId,
  onSelectClass,
  onCreateClass,
  onDeleteClass
}: ClassSelectorProps) {
  const [newClassName, setNewClassName] = useState('');
  const [manageOpen, setManageOpen] = useState(false);

  const handleCreateClass = () => {
    if (newClassName.trim()) {
      onCreateClass(newClassName.trim());
      setNewClassName('');
    }
  };

  return (
    <div className="ios-glass-card px-6 py-4 mx-auto max-w-[1600px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#1c1c1e] flex items-center gap-3">
          <div className="w-9 h-9 bg-[#007aff]/10 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-[#007aff]" />
          </div>
          班级选择
        </h2>
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl border-[#007aff]/20 text-[#007aff] hover:bg-[#007aff]/5">
              <Settings className="w-4 h-4" />
              班级管理
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md ios-glass-card border-0">
            <DialogHeader>
              <DialogTitle className="text-[#1c1c1e]">班级管理</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Input
                  placeholder="输入新班级名称"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                  className="ios-input"
                />
                <Button onClick={handleCreateClass} className="gap-2 ios-button">
                  <Plus className="w-4 h-4" />
                  添加
                </Button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.values(classes).map((cls) => (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between p-3 bg-[#f2f2f7] rounded-xl hover:bg-[#e5e5ea] transition-colors"
                  >
                    <div>
                      <span className="font-medium text-[#1c1c1e]">{cls.name}</span>
                      <span className="text-sm text-[#8e8e93] ml-2">
                        {cls.students.length}名学生
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteClass(cls.id)}
                      className="text-[#ff3b30] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(classes).map((cls) => (
          <button
            key={cls.id}
            onClick={() => onSelectClass(cls.id)}
            className={`
              px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
              ${currentClassId === cls.id
                ? 'bg-[#007aff] text-white shadow-md shadow-[#007aff]/25'
                : 'bg-[#f2f2f7] text-[#1c1c1e] hover:bg-[#e5e5ea]'
              }
            `}
          >
            {cls.name}
          </button>
        ))}
      </div>
    </div>
  );
}
