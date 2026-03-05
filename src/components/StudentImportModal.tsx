import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, FileInput, Users, X } from 'lucide-react';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: string[];
  onSave: (students: string[]) => void;
}

export function StudentImportModal({
  isOpen,
  onClose,
  students,
  onSave
}: StudentImportModalProps) {
  const [tempStudents, setTempStudents] = useState<string[]>(students);
  const [importText, setImportText] = useState('');
  const [newStudentName, setNewStudentName] = useState('');

  // 当 students 变化时更新 tempStudents
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setTempStudents(students);
    }
    if (!open) {
      onClose();
    }
  };

  const handleImportText = () => {
    const names = importText
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    const newNames = names.filter(name => !tempStudents.includes(name));
    setTempStudents([...tempStudents, ...newNames]);
    setImportText('');
  };

  const handleAddSingle = () => {
    if (newStudentName.trim() && !tempStudents.includes(newStudentName.trim())) {
      setTempStudents([...tempStudents, newStudentName.trim()]);
      setNewStudentName('');
    }
  };

  const handleRemove = (index: number) => {
    setTempStudents(tempStudents.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(tempStudents);
    onClose();
  };

  const handleClear = () => {
    if (confirm('确定要清空所有学生吗？')) {
      setTempStudents([]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            管理学生名单
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* 文本导入 */}
          <div className="space-y-2">
            <label className="text-sm text-slate-600 font-medium">批量导入（每行一个姓名）</label>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="例如：
张三
李四
王五"
              className="min-h-[100px]"
            />
            <Button
              onClick={handleImportText}
              variant="outline"
              className="w-full gap-2"
            >
              <FileInput className="w-4 h-4" />
              导入文本
            </Button>
          </div>

          {/* 单个添加 */}
          <div className="space-y-2">
            <label className="text-sm text-slate-600 font-medium">单个添加</label>
            <div className="flex gap-2">
              <Input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="输入学生姓名"
                onKeyDown={(e) => e.key === 'Enter' && handleAddSingle()}
              />
              <Button onClick={handleAddSingle} variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* 学生列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 font-medium">
                学生列表
              </label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{tempStudents.length}人</Badge>
                <Button
                  onClick={handleClear}
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 h-8"
                >
                  清空
                </Button>
              </div>
            </div>
            <ScrollArea className="h-48 border rounded-lg p-3">
              {tempStudents.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  暂无学生
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tempStudents.map((student, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-md"
                    >
                      <span className="text-sm">{student}</span>
                      <button
                        onClick={() => handleRemove(index)}
                        className="text-slate-400 hover:text-red-500 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              保存名单
            </Button>
            <Button onClick={onClose} variant="outline">
              取消
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
