import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, ShieldCheck, Eye, EyeOff, Save, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface PasswordSettingsProps {
  /** 管理员密码（最高权限） */
  adminPassword: string;
  /** 修改登录密码（需管理员权限） */
  onChangeLoginPassword: (newPassword: string) => void;
  /** 修改管理员密码 */
  onChangeAdminPassword: (newPassword: string) => void;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function PasswordSettings({ adminPassword, onChangeLoginPassword, onChangeAdminPassword }: PasswordSettingsProps) {
  // —— 修改登录密码 ——
  const [adminInput, setAdminInput] = useState('');
  const [newLoginPwd, setNewLoginPwd] = useState('');
  const [confirmLoginPwd, setConfirmLoginPwd] = useState('');

  // —— 修改管理员密码 ——
  const [currentAdminInput, setCurrentAdminInput] = useState('');
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [confirmAdminPwd, setConfirmAdminPwd] = useState('');

  const handleChangeLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInput !== adminPassword) {
      toast.error('管理员密码错误，无法修改登录密码');
      return;
    }
    if (newLoginPwd.length < 4) {
      toast.error('新登录密码至少需要4位');
      return;
    }
    if (newLoginPwd !== confirmLoginPwd) {
      toast.error('两次输入的新登录密码不一致');
      return;
    }
    onChangeLoginPassword(newLoginPwd);
    toast.success('登录密码已更新，下次登录生效');
    setAdminInput('');
    setNewLoginPwd('');
    setConfirmLoginPwd('');
  };

  const handleChangeAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdminInput !== adminPassword) {
      toast.error('当前管理员密码错误');
      return;
    }
    if (newAdminPwd.length < 6) {
      toast.error('新管理员密码至少需要6位');
      return;
    }
    if (newAdminPwd !== confirmAdminPwd) {
      toast.error('两次输入的新管理员密码不一致');
      return;
    }
    onChangeAdminPassword(newAdminPwd);
    toast.success('管理员密码已更新');
    setCurrentAdminInput('');
    setNewAdminPwd('');
    setConfirmAdminPwd('');
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          密码与权限管理
        </CardTitle>
        <p className="text-xs text-slate-400 mt-1">两级权限：登录密码用于日常登录；管理员密码拥有最高权限，可修改登录密码等设置。</p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="gap-1.5">
              <KeyRound className="w-4 h-4" />修改登录密码
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5">
              <Lock className="w-4 h-4" />修改管理员密码
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleChangeLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>管理员密码（身份验证）</Label>
                <PasswordInput value={adminInput} onChange={setAdminInput} placeholder="请输入管理员密码" />
              </div>
              <div className="space-y-2">
                <Label>新登录密码</Label>
                <PasswordInput value={newLoginPwd} onChange={setNewLoginPwd} placeholder="请输入新登录密码（至少4位）" />
              </div>
              <div className="space-y-2">
                <Label>确认新登录密码</Label>
                <PasswordInput value={confirmLoginPwd} onChange={setConfirmLoginPwd} placeholder="请再次输入新登录密码" />
              </div>
              <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Save className="w-4 h-4" />
                更新登录密码
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="admin">
            <form onSubmit={handleChangeAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label>当前管理员密码</Label>
                <PasswordInput value={currentAdminInput} onChange={setCurrentAdminInput} placeholder="请输入当前管理员密码" />
              </div>
              <div className="space-y-2">
                <Label>新管理员密码</Label>
                <PasswordInput value={newAdminPwd} onChange={setNewAdminPwd} placeholder="请输入新管理员密码（至少6位）" />
              </div>
              <div className="space-y-2">
                <Label>确认新管理员密码</Label>
                <PasswordInput value={confirmAdminPwd} onChange={setConfirmAdminPwd} placeholder="请再次输入新管理员密码" />
              </div>
              <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Save className="w-4 h-4" />
                更新管理员密码
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
