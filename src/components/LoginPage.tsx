import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { GraduationCap, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth';

interface LoginPageProps {
  /** 登录/注册成功后回调（由 App 置为已认证并进入应用） */
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) { setError('请输入邮箱'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }
    setBusy(true);
    const res = isRegister ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);
    if (res.ok) {
      if (isRegister && res.message.includes('确认')) {
        setInfo(res.message); // 需邮箱确认，停留本页
        return;
      }
      onSuccess();
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-screen mac-login-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl flex items-center justify-center mx-auto mb-4 border border-white/50">
            <GraduationCap className="w-12 h-12 text-[color:var(--accent)]" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-1">Lynn's</h1>
          <p className="text-white/80 text-xl font-medium">Realm</p>
        </div>

        {/* 登录卡片 */}
        <Card className="border-0 shadow-2xl bg-white/85 backdrop-blur-2xl rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 pt-6">
            <CardTitle className="text-xl text-center text-[#1c1c1e] font-semibold">
              {isRegister ? '创建账号' : '账号登录'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#3c3c43] text-sm font-medium ml-1">邮箱</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8e8e93]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); setInfo(''); }}
                    className="pl-12 pr-4 h-14 rounded-xl bg-[#f2f2f7] border-0 text-[#1c1c1e] placeholder:text-[#8e8e93] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.3)] focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#3c3c43] text-sm font-medium ml-1">密码</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8e8e93]" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? '至少 6 位' : '密码'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); setInfo(''); }}
                    className="pl-12 pr-12 h-14 rounded-xl bg-[#f2f2f7] border-0 text-[#1c1c1e] placeholder:text-[#8e8e93] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.3)] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-[#3c3c43] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {error && <p className="text-sm text-[#ff3b30] ml-1">{error}</p>}
                {info && <p className="text-sm text-[#34c759] ml-1">{info}</p>}
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-14 bg-[rgb(var(--accent-rgb)/0.12)] hover:bg-[var(--accent-strong)] text-white font-semibold text-base rounded-xl shadow-lg shadow-[rgb(var(--accent-rgb)/30)] transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? '处理中…' : (isRegister ? '注册并登录' : '登录')}
              </Button>

              <div className="text-center text-sm text-[#8e8e93]">
                {isRegister ? '已有账号？' : '还没有账号？'}
                <button
                  type="button"
                  onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); setInfo(''); }}
                  className="ml-1 font-medium text-[color:var(--accent)] hover:underline"
                >
                  {isRegister ? '去登录' : '创建账号'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
