import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth';
import { KAOMOJI, ICONS, QUOTES, pickRandom } from '@/components/BrandMark';

interface LoginPageProps {
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

  // 每次进入随机抽一次（与站内品牌区同一口径：刷新即换）
  const { kaomoji, icon, quote } = useMemo(
    () => ({ kaomoji: pickRandom(KAOMOJI), icon: pickRandom(ICONS), quote: pickRandom(QUOTES) }),
    []
  );

  const switchMode = (m: 'login' | 'register') => {
    if (m === mode) return;
    setMode(m);
    setError('');
    setInfo('');
  };

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
      if (isRegister && res.message.includes('确认')) { setInfo(res.message); return; }
      onSuccess();
    } else {
      setError(res.message);
    }
  };

  const fieldCls =
    'h-12 rounded-xl bg-white/70 border border-black/10 pl-11 pr-11 text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] ' +
    'transition-[box-shadow,border-color,background] duration-150 focus-visible:bg-white focus-visible:border-[color:var(--brand)] focus-visible:ring-0 ' +
    'focus-visible:shadow-[0_0_0_4px_rgb(var(--brand-rgb)/0.15)]';

  return (
    <div className="relative min-h-screen mac-login-bg flex items-center justify-center px-5 py-10">
      {/* 背景柔光点缀，增强层次但不喧哗 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full blur-3xl" style={{ background: 'rgb(var(--brand-rgb)/0.25)' }} />
        <div className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.18)' }} />
      </div>

      <div className="relative w-full max-w-[400px] ios-animate-fade-in">
        {/* 品牌区 */}
        <div className="text-center mb-8">
          <div className="w-[68px] h-[68px] mx-auto mb-4 rounded-[24px] bg-white/92 ring-1 ring-white/60 flex items-center justify-center text-[30px]"
            style={{ boxShadow: '0 16px 44px rgba(0,0,0,0.20)' }}>
            {icon}
          </div>
          <h1 className="text-[30px] font-bold text-white tracking-tight whitespace-nowrap">{kaomoji}</h1>
          <p className="mt-2 text-white/85 text-[14px]">{quote.zh}</p>
          <p className="mt-0.5 text-white/55 text-[12px] italic">{quote.en}</p>
        </div>

        {/* 登录卡片 */}
        <div className="rounded-[30px] bg-white/88 ring-1 ring-white/60 p-7" style={{ boxShadow: '0 30px 80px -30px rgba(0,0,0,0.35)' }}>
          {/* 分段切换：登录 / 创建账号 */}
          <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/[0.05] mb-6">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={
                  'h-9 rounded-lg text-sm font-medium transition-all duration-150 ' +
                  (mode === m ? 'bg-white text-[color:var(--ink)] shadow-sm' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]')
                }
              >
                {m === 'login' ? '登录' : '创建账号'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[color:var(--ink-2)] text-sm">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--ink-4)]" />
                <Input
                  id="email" type="email" inputMode="email" autoComplete="username" placeholder="you@example.com"
                  value={email} onChange={(e) => { setEmail(e.target.value); setError(''); setInfo(''); }} className={fieldCls}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[color:var(--ink-2)] text-sm">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--ink-4)]" />
                <Input
                  id="password" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder={isRegister ? '至少 6 位' : '请输入密码'}
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(''); setInfo(''); }} className={fieldCls}
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] hover:text-[color:var(--ink-2)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-[#ff3b30]" role="alert">{error}</p>}
            {info && <p className="text-sm text-[#34c759]" role="status">{info}</p>}

            <Button type="submit" disabled={busy} className="ios-button w-full h-12 mt-1">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" />处理中…</> : (isRegister ? '创建账号并进入' : '登录')}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-[color:var(--ink-4)]">
            {isRegister ? '已有账号？' : '还没有账号？'}
            <button
              type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')}
              className="ml-1 font-medium hover:underline" style={{ color: 'var(--brand)' }}
            >
              {isRegister ? '去登录' : '创建账号'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
