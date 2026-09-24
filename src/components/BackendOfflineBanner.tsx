import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { getBackendState, subscribeBackendState, offlineHint } from '@/lib/connectivity';

/**
 * 云端离线横幅：与同步状态横幅彼此独立。
 * 只要后端不可达（断网 / 服务商暂停 / 网关异常）就出现，明确告诉老师：
 * 「可以继续录分，数据存在本机，联网后自动补传」——避免误以为数据丢了或系统坏了。
 */
export function BackendOfflineBanner({ onRetry }: { onRetry: () => void }) {
  const state = useSyncExternalStore(subscribeBackendState, getBackendState, getBackendState);
  if (!state.offline) return null;

  return (
    <Card className="border-0 border-l-4 border-l-slate-400 ios-glass-card">
      <CardContent className="py-3.5">
        <div className="flex items-start gap-3">
          <CloudOff className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[color:var(--ink)] flex flex-wrap items-center gap-2">
              <WifiOff className="w-4 h-4 text-slate-400" />
              云端暂时连不上，但可以照常录分
            </p>
            <p className="text-sm text-[color:var(--ink-3)] mt-0.5">
              {offlineHint()}；云端恢复后会自动同步，无需重新登录，也不用担心数据丢失。
            </p>
            {state.detail && (
              <p className="text-xs text-[color:var(--ink-4)] mt-1.5">状态详情：{state.detail}</p>
            )}
            <div className="mt-2.5">
              <Button size="sm" variant="outline" className="h-9 gap-2 rounded-[var(--r-md)]" onClick={onRetry}>
                <RefreshCw className="w-4 h-4" />重新检测
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
