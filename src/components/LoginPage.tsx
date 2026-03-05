import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { GraduationCap, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onLogin: (password: string) => boolean;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    
    const success = onLogin(password);
    if (!success) {
      setError('密码错误，请重试');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#007aff] via-[#5ac8fa] to-[#34c759] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl flex items-center justify-center mx-auto mb-4 border border-white/50">
            <GraduationCap className="w-12 h-12 text-[#007aff]" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-1">Lynn's</h1>
          <p className="text-white/80 text-xl font-medium">Realm</p>
        </div>

        {/* 登录卡片 */}
        <Card className="border-0 shadow-2xl bg-white/85 backdrop-blur-2xl rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 pt-6">
            <CardTitle className="text-xl text-center text-[#1c1c1e] font-semibold">管理员登录</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#3c3c43] text-sm font-medium ml-1">密码</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8e8e93]" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Lynn"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    className="pl-12 pr-12 h-14 rounded-xl bg-[#f2f2f7] border-0 text-[#1c1c1e] placeholder:text-[#8e8e93] focus:ring-2 focus:ring-[#007aff]/30 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-[#3c3c43] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {error && (
                  <p className="text-sm text-[#ff3b30] ml-1">{error}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 bg-[#007aff] hover:bg-[#0071e3] text-white font-semibold text-base rounded-xl shadow-lg shadow-[#007aff]/30 transition-all active:scale-[0.98]"
              >
                登录
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
