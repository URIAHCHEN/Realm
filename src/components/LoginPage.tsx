// 登录页（2026-10-08 重做）：双栏布局 —— 左品牌面板（随机颜文字 + 双语金句），右表单。
//
// 设计意图（frontend-design 方法论：克制，把大胆用在一处）：
//   · 唯一"大胆"的地方 = 左侧品牌面板：把随机颜文字当主视觉，配双语金句与三条能力点，
//     与站内品牌区共用同一套随机池（刷新即换），让入口与站内观感连贯。
//   · 其余保持安静：右侧白玻璃卡 + 大圆角输入 + 品牌渐变主按钮，不加多余装饰。
//   · 桌面双栏、窄屏单栏；只做一次入场淡入，不做循环动画。
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, Eye, EyeOff, Loader2, ArrowRight, ShieldCheck, Sparkles, Cloud } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth';
import { KAOMOJI, ICONS, QUOTES, pickRandom } from '@/components/brandMarkContent';

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
    'h-12 rounded-xl bg-white/80 border border-black/[0.08] pl-11 pr-11 text-[15px] '
    + 'transition-[box-shadow,border-color,background] duration-150 focus-visible:bg-white '
    + 'focus-visible:border-[rgb(var(--brand-rgb)/0.55)] focus-visible:ring-0 '
    + 'focus-visible:shadow-[0_0_0_4px_rgb(var(--brand-rgb)/0.14)]';

  const perks = [
    { icon: <Cloud className="w-4 h-4" />, title: '云端同步', desc: '多设备共享同一份学情数据' },
    { icon: <Sparkles className="w-4 h-4" />, title: '自动分析', desc: '正确率 / 排名 / 薄弱项一体生成' },
    { icon: <ShieldCheck className="w-4 h-4" />, title: '改动可审', desc: '修订留痕，可回退、需审核' },
  ];

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* 背景：品牌色柔光 + 极浅渐变 */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1200px 600px at 10% -12%, rgb(var(--brand-rgb)/0.20), transparent 62%),'
            + 'radial-gradient(900px 520px at 104% 112%, rgb(var(--brand-rgb)/0.12), transparent 58%),'
            + 'linear-gradient(180deg, #fbfcfe 0%, #f3f6fb 100%)',
        }}
      />

      <div className="w-full max-w-[940px] ios-animate-fade-in">
        <div
          className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] rounded-[30px] overflow-hidden border border-white/70 bg-white/70"
          style={{ boxShadow: '0 46px 110px -46px rgba(15,23,42,0.40)' }}
        >
          {/* ── 左：品牌面板（本页唯一"大胆"的地方） ── */}
          <div
            className="relative hidden md:flex flex-col justify-between p-9 text-white"
            style={{
              background:
                'linear-gradient(152deg, rgb(var(--brand-rgb)) 0%, rgb(var(--brand-rgb)/0.84) 52%, rgb(var(--brand-rgb)/0.70) 100%)',
            }}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-16 -left-10 w-64 h-64 rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.22)' }} />
              <div className="absolute bottom-10 -right-12 w-56 h-56 rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.14)' }} />
            </div>

            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-[26px]">{icon}</div>
                <div>
                  <p className="text-[15px] font-semibold tracking-wide">Lynn's Realm</p>
                  <p className="text-[11px] text-white/70">学情管理 · 让每一次成长有迹可循</p>
                </div>
              </div>

              <p className="mt-10 text-[32px] leading-tight font-bold tracking-tight whitespace-nowrap">{kaomoji}</p>
              <p className="mt-3 text-[15px] text-white/88">{quote.zh}</p>
              <p className="mt-1 text-[12px] italic text-white/60">{quote.en}</p>
            </div>

            <ul className="relative space-y-3.5 pt-10">
              {perks.map(p => (
                <li key={p.title} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">{p.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{p.title}</span>
                    <span className="block text-[11px] text-white/65">{p.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── 右：表单 ── */}
          <div className="p-7 sm:p-9">
            {/* 窄屏顶部品牌（左栏在窄屏隐藏） */}
            <div className="md:hidden flex items-center gap-2.5 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-white"
                style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.72))' }}
              >{icon}</div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--brand)' }}>{kaomoji}</p>
                <p className="text-[11px] text-[color:var(--ink-4)] truncate">{quote.zh}</p>
              </div>
            </div>

            {/* 登录 / 创建账号：分段控件 */}
            <div className="flex p-1 rounded-2xl bg-black/[0.04] mb-6">
              {([['login', '登录'], ['register', '创建账号']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={
                    'flex-1 h-9 rounded-xl text-[13px] font-semibold transition-colors '
                    + (mode === m
                      ? 'bg-white text-[color:var(--brand)] shadow-sm'
                      : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] text-[color:var(--ink-2)]">邮箱</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ink-4)]" />
                  <Input
                    id="email" type="email" inputMode="email" autoComplete="username" placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); setInfo(''); }}
                    className={fieldCls}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] text-[color:var(--ink-2)]">密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ink-4)]" />
                  <Input
                    id="password" type={showPassword ? 'text' : 'password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? '至少 6 位' : '请输入密码'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); setInfo(''); }}
                    className={fieldCls}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[color:var(--ink-4)] hover:text-[color:var(--ink-2)] hover:bg-black/[0.05] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
              )}
              {info && (
                <p className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{info}</p>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold gap-2 text-white border-0 hover:opacity-95 transition-opacity"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.78))',
                  boxShadow: '0 12px 26px -14px rgb(var(--brand-rgb)/0.75)',
                }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {busy ? '处理中…' : isRegister ? '创建账号' : '进入学情管理'}
              </Button>
            </form>

            <p className="mt-5 text-[12px] text-[color:var(--ink-4)] text-center leading-relaxed">
              {isRegister ? '注册后需管理员加入可写名单才能录入数据' : '使用学校分配的邮箱登录；忘记密码请联系管理员'}
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] text-[color:var(--ink-4)]">
          数据仅用于本班学情分析 · 支持修订版本回退与改动审核
        </p>
      </div>
    </div>
  );
}
