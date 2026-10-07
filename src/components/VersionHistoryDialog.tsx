// 版本历史面板：列出最近若干版本（时间 / 操作者 / 触发原因 / 变动明细），支持一键回退。
//
// 交互参考在线文档的"版本历史"：左侧为版本列表，选中后右侧展示该版变动明细，
// 回退前二次确认并提示"回退本身也会记为一个新版本"（可再退回来）。
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, RotateCcw, User, Clock3, FileDiff } from 'lucide-react';
import { listVersions, clearVersions, type VersionEntry } from '@/lib/versionStore';
import type { SyncSnapshot } from '@/lib/cloudSync';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 回退：把该版本的快照整体应用到本地（App 侧调用 importData/importSnapshot） */
  onRollback: (entry: VersionEntry) => void;
  /** 当前快照（用于"立即保存一个版本"） */
  currentSnapshot: SyncSnapshot | null;
  /** 当前操作者标识（昵称/邮箱前缀） */
  actor: string;
  /** 手动记录一个版本 */
  onRecordCurrent: () => void;
  /** 仅管理员可回退（权限分级：回退属于高影响操作） */
  canRollback: boolean;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VersionHistoryDialog({ open, onClose, onRollback, actor, onRecordCurrent, canRollback }: Props) {
  const versions = useMemo(() => (open ? listVersions() : []), [open]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find(v => v.id === selectedId) || versions[0] || null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[860px] max-h-[82vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-[color:var(--brand)]" />版本历史
          </DialogTitle>
          <DialogDescription>
            保留最近 {versions.length} 个版本（共 {versions.length} 个）。回退会覆盖当前数据，但回退本身也会记为新版本，可再退回来。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-xs text-[color:var(--ink-4)]">
            当前操作者：<span className="font-semibold text-[color:var(--ink-2)]">{actor}</span>
            {!canRollback && <span className="ml-2 text-amber-600">（回退需管理员权限）</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { onRecordCurrent(); toast.success('已记录当前版本'); }}>
              <FileDiff className="w-4 h-4" />保存当前版本
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
              disabled={versions.length === 0}
              onClick={() => { if (window.confirm('清空全部版本历史？此操作不可恢复（不影响当前数据）。')) { clearVersions(); toast.success('已清空版本历史'); onClose(); } }}
            >
              清空历史
            </Button>
          </div>
        </div>

        {versions.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-4)] py-10 text-center">
            还没有版本记录。导入、清空记录、离班移除等操作会自动记录一个版本。
          </p>
        ) : (
          <div className="grid grid-cols-[240px_1fr] gap-4 min-h-0">
            {/* 左：版本列表 */}
            <ScrollArea className="h-[46vh] pr-2 border-r border-black/5">
              <ul className="space-y-1">
                {versions.map(v => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selected?.id === v.id ? 'bg-[rgb(var(--brand-rgb)/0.12)] text-[color:var(--brand)]' : 'hover:bg-black/[0.04]'}`}
                    >
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Clock3 className="w-3.5 h-3.5" />{fmtTime(v.at)}
                      </p>
                      <p className="text-xs text-[color:var(--ink-3)] mt-0.5">{v.reason}</p>
                      <p className="text-[11px] text-[color:var(--ink-4)] flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3" />{v.actor}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>

            {/* 右：变动明细 */}
            <div className="min-w-0 flex flex-col">
              <p className="text-sm font-semibold mb-2">本版变动（{selected?.summary.length || 0} 项）</p>
              <ScrollArea className="h-[34vh] pr-2">
                <ul className="space-y-1.5">
                  {(selected?.summary || []).map((line, i) => (
                    <li key={i} className="text-sm text-[color:var(--ink-2)] flex gap-2">
                      <span className="text-[color:var(--brand)] shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <div className="flex justify-end gap-2 pt-3 mt-auto border-t border-black/5">
                <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!selected || !canRollback}
                  title={canRollback ? '将数据整体恢复为该版本' : '回退需要管理员权限'}
                  onClick={() => {
                    if (!selected) return;
                    if (window.confirm('确认回退到 ' + fmtTime(selected.at) + ' 的版本？\n\n当前数据会被该版本覆盖（回退本身也会记为新版本，可再退回来）。')) {
                      onRollback(selected);
                    }
                  }}
                >
                  <RotateCcw className="w-4 h-4" />回退到此版本
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
