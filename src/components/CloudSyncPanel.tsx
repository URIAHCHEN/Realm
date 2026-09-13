import { useState } from 'react';
import { toast } from 'sonner';
import {
  Cloud, CloudUpload, CloudDownload, CheckCircle2, AlertTriangle,
  XCircle, Loader2, Link2, Copy, PlugZap, RefreshCcw, Unlink, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SETUP_SQL, testConnection } from '@/lib/cloudSync';
import type { useCloudSync } from '@/hooks/useCloudSync';

type Sync = ReturnType<typeof useCloudSync>;

const statusMeta: Record<string, { label: string; icon: typeof Cloud; className: string }> = {
  unconfigured: { label: '未配置', icon: Cloud, className: 'bg-slate-100 text-slate-600' },
  connecting: { label: '连接中', icon: Loader2, className: 'bg-blue-100 text-blue-700' },
  connected: { label: '已连接', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700' },
  error: { label: '连接异常', icon: XCircle, className: 'bg-rose-100 text-rose-700' },
  conflict: { label: '同步冲突', icon: AlertTriangle, className: 'bg-amber-100 text-amber-700' },
};

function formatTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

const BTN = 'h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-1.5';
const BTN_PRIMARY = `${BTN} bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90 shadow-sm`;
const FIELD = 'h-9 text-sm rounded-[var(--r-md)]';

export function CloudSyncPanel({ sync }: { sync: Sync }) {
  const [url, setUrl] = useState(sync.config?.supabaseUrl || '');
  const [key, setKey] = useState(sync.config?.supabaseKey || '');
  const [autoSync, setAutoSync] = useState(sync.config?.autoSync ?? true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  const meta = statusMeta[sync.status] || statusMeta.unconfigured;
  const StatusIcon = meta.icon;

  const handleSave = () => {
    if (!url.trim() || !key.trim()) {
      toast.error('请填写 Project URL 和 anon key');
      return;
    }
    sync.saveConfig({ supabaseUrl: url.trim(), supabaseKey: key.trim(), autoSync });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    const result = await testConnection({ supabaseUrl: url.trim(), supabaseKey: key.trim(), autoSync });
    setTestResult(result.message);
    setTesting(false);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      toast.success('SQL 已复制，去 Supabase SQL Editor 粘贴执行');
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  return (
    <div className="space-y-5">
      {/* 状态卡片 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base text-[color:var(--ink)]">
            <span className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-[color:var(--brand)]" />
              云同步状态
            </span>
            <Badge className={`${meta.className} border-0 flex items-center gap-1.5`}>
              <StatusIcon className={`w-3.5 h-3.5 ${sync.status === 'connecting' ? 'animate-spin' : ''}`} />
              {meta.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sync.message && (
            <p className="text-sm text-[#8e8e93]">{sync.message}</p>
          )}
          <p className="text-sm text-[#8e8e93]">最近同步：{formatTime(sync.lastSyncAt)}</p>

          {sync.action !== 'idle' && (
            <p className="text-sm text-[color:var(--brand)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {sync.action === 'pushing' ? '正在上传到云端…' : '正在拉取云端数据…'}
            </p>
          )}

          {/* 冲突处理 */}
          {sync.status === 'conflict' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
              <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                本地和云端都有新的改动，请选择保留哪一边（另一边将被覆盖）
              </p>
              <div className="flex gap-2">
                <Button size="sm" className={BTN_PRIMARY} onClick={sync.resolveConflictKeepLocal}>
                  <CloudUpload className="w-4 h-4" />
                  保留本地，覆盖云端
                </Button>
                <Button size="sm" variant="outline" className={BTN} onClick={sync.resolveConflictKeepCloud}>
                  <CloudDownload className="w-4 h-4" />
                  保留云端，覆盖本地
                </Button>
              </div>
            </div>
          )}

          {/* 手动操作 */}
          {sync.config && sync.status !== 'conflict' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" className={BTN_PRIMARY} disabled={sync.action !== 'idle'} onClick={sync.push}>
                <CloudUpload className="w-4 h-4" />
                手动上传
              </Button>
              <Button size="sm" variant="outline" className={BTN} disabled={sync.action !== 'idle'} onClick={sync.pull}>
                <CloudDownload className="w-4 h-4" />
                从云端拉取
              </Button>
              <Button size="sm" variant="ghost" className={`${BTN} text-[#ff3b30] hover:bg-[#ff3b30]/10`} onClick={sync.clearConfig}>
                <Unlink className="w-4 h-4" />
                断开云同步
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 配置表单 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-[color:var(--ink)]">
            <Link2 className="w-5 h-5 text-[color:var(--brand)]" />
            Supabase 连接配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-sm text-[color:var(--ink-2)]">Project URL</Label>
              <Input
                placeholder="https://xxxxxxxx.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-sm text-[color:var(--ink-2)]">anon public key（API Key）</Label>
              <Input
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={`${FIELD} font-mono text-xs`}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f2f2f7] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#1c1c1e]">自动同步</p>
              <p className="text-xs text-[#8e8e93]">数据变化后约 3 秒自动上传；打开应用时自动检查云端更新</p>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className={BTN_PRIMARY + " gap-2"} onClick={handleSave}>
              <PlugZap className="w-4 h-4" />
              保存并连接
            </Button>
            <Button size="sm" variant="outline" className={BTN + " gap-2"} disabled={testing} onClick={handleTest}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              测试连接
            </Button>
          </div>
          {testResult && (
            <p className="text-sm text-[#8e8e93] flex items-start gap-1.5">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {testResult}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 首次配置指引 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[color:var(--ink)]">首次配置三步走（约 3 分钟）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[color:var(--ink-2)]">
          <div className="space-y-2">
            <p><span className="font-semibold text-[color:var(--brand)]">第 1 步</span>：打开 <span className="font-mono text-xs bg-[#f2f2f7] px-1.5 py-0.5 rounded">supabase.com</span> 免费注册并新建一个项目（免费额度完全够用）。</p>
            <p><span className="font-semibold text-[color:var(--brand)]">第 2 步</span>：项目左侧菜单进 <span className="font-semibold">SQL Editor</span>，粘贴下面的 SQL 执行。<span className="text-[color:var(--ink-4)]">只需执行一次；若此前建过表，再执行一次即可自动收紧权限（安全版）。</span></p>
            <p><span className="font-semibold text-[color:var(--brand)]">第 3 步</span>：项目设置 → API，把 <span className="font-semibold">Project URL</span> 和 <span className="font-semibold">anon public key</span> 填到上方，点“保存并连接”。</p>
          </div>
          <div className="rounded-[var(--r-md)] overflow-hidden border border-black/10">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#2c2c2e]">
              <span className="text-xs font-medium text-[#e5e5ea]">建表与权限 SQL（安全版 · 幂等）</span>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-2.5 rounded-md gap-1.5 text-xs"
                onClick={handleCopySql}
              >
                <Copy className="w-3.5 h-3.5" />
                复制 SQL
              </Button>
            </div>
            <pre className="bg-[#1c1c1e] text-[#e5e5ea] p-3 text-xs leading-relaxed font-mono overflow-auto max-h-[320px] whitespace-pre">{SETUP_SQL}</pre>
          </div>
          <p className="text-xs text-[color:var(--ink-4)]">
            安全模型：仅登录账号可读写云端数据（匿名请求一律拒绝）；成员名册由首个账号自举为管理员，后续由管理员添加成员。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
