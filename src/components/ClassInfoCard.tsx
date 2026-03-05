import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus } from 'lucide-react';
import type { Class } from '@/types';

interface ClassInfoCardProps {
  classData: Class | null;
  onManageStudents: () => void;
}

export function ClassInfoCard({ classData, onManageStudents }: ClassInfoCardProps) {
  if (!classData) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="py-8 text-center text-slate-400">
          请先选择班级
        </CardContent>
      </Card>
    );
  }

  // 获取已配置课次数
  const configuredLessons = Object.keys(classData.lessonConfigs).length;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            班级信息
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onManageStudents} className="gap-2">
            <UserPlus className="w-4 h-4" />
            管理学生
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">班级名称</span>
            <span className="font-medium">{classData.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">学生人数</span>
            <Badge variant="secondary" className="text-indigo-600 bg-indigo-50">
              {classData.students.length}人
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">记录数</span>
            <span className="text-slate-600">{classData.records.length}条</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">已配置课次</span>
            <span className="text-slate-600">{configuredLessons}个</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
