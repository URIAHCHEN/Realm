import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, Save } from 'lucide-react';
import { toast } from 'sonner';

interface PasswordSettingsProps {
  currentPassword: string;
  onChangePassword: (newPassword: string) => void;
}

export function PasswordSettings({ currentPassword, onChangePassword }: PasswordSettingsProps) {
  const [currentInput, setCurrentInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (currentInput !== currentPassword) {
      toast.error('当前密码错误');
      return;
    }

    if (newPassword.length < 4) {
      toast.error('新密码至少需要4位');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    onChangePassword(newPassword);
    toast.success('密码修改成功');
    
    // 清空输入
    setCurrentInput('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-indigo-600" />
          修改登录密码
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>当前密码</Label>
            <div className="relative">
              <Input
                type={showCurrent ? 'text' : 'password'}
                placeholder="请输入当前密码"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>新密码</Label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                placeholder="请输入新密码（至少4位）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>确认新密码</Label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                placeholder="请再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="w-4 h-4" />
            修改密码
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
