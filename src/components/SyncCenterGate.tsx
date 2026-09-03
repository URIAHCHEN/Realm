import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, Unlock, ShieldCheck } from 'lucide-react';

interface SyncCenterGateProps {
  /** 管理员密码，用于解锁同步中心面板 */
  adminPassword: string;
  children: React.ReactNode;
}

/** 同步中心访问门：需管理员密码解锁后才展示面板。注意：后台自动上传不受此门影响（登录即同步）。 */
export function SyncCenterGate({ adminPassword, children }: SyncCenterGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');

  if (unlocked) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-[#f2f2f7] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-[#3c3c43]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            同步中心已解锁
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#8e8e93]"
            onClick={() => { setUnlocked(false); setPwd(''); setError(''); }}
          >
            <Lock className="w-3.5 h-3.5 mr-1" />
            重新锁定
          </Button>
        </div>
        {children}
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd.trim()) { setError('请输入管理员密码'); return; }
    if (pwd === adminPassword) {
      setUnlocked(true);
      setError('');
      setPwd('');
    } else {
      setError('密码错误');
      setPwd('');
    }
  };

  return (
    <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-2xl rounded-3xl">
      <CardContent className="pt-6">
        <div className="max-w-sm mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--accent-rgb)/0.12)] flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-[color:var(--accent)]" />
          </div>
          <h3 className="text-lg font-semibold text-[#1c1c1e] mb-1">同步中心</h3>
          <p className="text-sm text-[#8e8e93] mb-6">
            此区域包含云同步与文档同步设置，请输入管理员密码访问。<br />
            日常数据仍会在登录后自动同步到云端，无需在此操作。
          </p>
          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="sync-admin-pwd" className="text-[#3c3c43] text-sm ml-1">管理员密码</Label>
              <Input
                id="sync-admin-pwd"
                type="password"
                autoFocus
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setError(''); }}
                placeholder="请输入管理员密码"
                className="h-12 rounded-xl bg-[#f2f2f7] border-0 focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.3)]"
              />
            </div>
            {error && <p className="text-sm text-[#ff3b30]">{error}</p>}
            <Button
              type="submit"
              className="w-full h-12 bg-[rgb(var(--accent-rgb)/0.12)] hover:bg-[var(--accent-strong)] text-white font-semibold rounded-xl transition-all active:scale-[0.98]"
            >
              <Unlock className="w-4 h-4 mr-1.5" />
              解锁
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
