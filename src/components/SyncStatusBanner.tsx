import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CloudOff, RefreshCw, Upload, Download, ShieldAlert } from 'lucide-react';
import type { CloudSyncStatus } from '@/lib/cloudSync';

interface SyncStatusBannerProps {
  status: CloudSyncStatus;
  message: string;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  /** 重新检测成员身份/连接（用于只读或错误时自救） */
  onRefresh: () => void;
}

/** 同步状态横幅：所有登录用户可见。只读/冲突/错误时给出原因与自助操作，避免“一直橙着没入口”。 */
export function SyncStatusBanner({ status, message, onKeepLocal, onKeepCloud, onRefresh }: SyncStatusBannerProps) {
  if (status !== 'readonly' && status !== 'conflict' && status !== 'error') return null;

  const cfg = {
    readonly: {
      icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      title: '当前为只读模式',
      desc: '你的改动只保存在本设备，尚未列入可写名单。被管理员加入名单后点「重新检测」即可恢复同步；若刚被加入，也可刷新页面生效。',
    },
    conflict: {
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      title: '本地与云端都有改动',
      desc: '为避免互相覆盖，需要你选择保留哪一边：保留本地会把这台设备的数据上传云端；保留云端会以云端最新数据覆盖本地。',
    },
    error: {
      icon: <CloudOff className="w-5 h-5 text-rose-500" />,
      title: '同步出现问题',
      desc: '请根据下方提示处理；常见为网络波动或登录过期，可尝试重新检测或重新登录。',
    },
  }[status];

  return (
    <Card className="ios-glass-card border-0 border-l-4 border-l-amber-400">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{cfg.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[color:var(--ink)]">{cfg.title}</p>
            <p className="text-sm text-[color:var(--ink-3)] mt-0.5">{cfg.desc}</p>
            {message && <p className="text-xs text-[color:var(--ink-4)] mt-1.5">状态详情：{message}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {status === 'conflict' && (
                <>
                  <Button size="sm" className="ios-button h-9" onClick={onKeepLocal}>
                    <Upload className="w-4 h-4" />保留本地并上传
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 rounded-[var(--r-md)]" onClick={onKeepCloud}>
                    <Download className="w-4 h-4" />保留云端
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" className="h-9 gap-2 rounded-[var(--r-md)]" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4" />重新检测
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
