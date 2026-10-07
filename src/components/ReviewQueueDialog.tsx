// 审核队列（管理员）：其他成员提交的"整版修订"在此审阅、批准或驳回。
//
// 口径（按 Lynn 2026-10-07 明确）：
//   · 非管理员编辑完（通常是整个班级的一版数据）后提交审核；
//   · 审核通过前，他们的改动**不会写入云端数据库**（只存在于提交的待审版本里）；
//   · 管理员看到的是"相对当前数据的变动明细"（复用 versionStore.diffSnapshots），
//     批准 → 该版本成为新的线上数据；驳回 → 附理由退回。
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Check, X, User, Clock3 } from 'lucide-react';
import { diffSnapshots } from '@/lib/versionStore';
import type { SyncSnapshot } from '@/lib/cloudSync';
import type { PendingVersion } from '@/lib/pendingReview';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 待审列表（来自云端快照的 pendingVersions） */
  pending: PendingVersion[];
  /** 当前线上/本地数据，用于计算"相对当前有什么变化" */
  currentSnapshot: SyncSnapshot | null;
  /** 批准：把该版本作为新的线上数据 */
  onApprove: (item: PendingVersion) => void;
  /** 驳回：附理由 */
  onReject: (item: PendingVersion, reason: string) => void;
  canReview: boolean;
}

function fmt(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ReviewQueueDialog({ open, onClose, pending, currentSnapshot, onApprove, onReject, canReview }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pending.find(p => p.id === selectedId) || pending[0] || null;
  const detail = useMemo(
    () => (selected ? diffSnapshots(currentSnapshot || undefined, selected.snapshot) : []),
    [selected, currentSnapshot]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[900px] max-h-[84vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[color:var(--brand)]" />审核队列
          </DialogTitle>
          <DialogDescription>
            其他成员提交的整版修订。审核通过前，这些改动不会写入线上数据。
            {!canReview && <span className="ml-1 text-amber-600">（仅管理员可批准/驳回）</span>}
          </DialogDescription>
        </DialogHeader>

        {pending.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-4)] py-12 text-center">当前没有待审核的提交 🎉</p>
        ) : (
          <div className="grid grid-cols-[260px_1fr] gap-4 min-h-0">
            <ScrollArea className="h-[50vh] pr-2 border-r border-black/5">
              <ul className="space-y-1">
                {pending.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selected?.id === p.id ? 'bg-[rgb(var(--brand-rgb)/0.12)] text-[color:var(--brand)]' : 'hover:bg-black/[0.04]'}`}
                    >
                      <p className="text-sm font-semibold flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{p.by}</p>
                      <p className="text-xs text-[color:var(--ink-3)] mt-0.5 flex items-center gap-1"><Clock3 className="w-3 h-3" />{fmt(p.at)}</p>
                      {p.note && <p className="text-[11px] text-[color:var(--ink-4)] mt-0.5 truncate">备注：{p.note}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <div className="min-w-0 flex flex-col">
              <p className="text-sm font-semibold mb-2">
                相对当前数据的变动（{detail.length} 项）
              </p>
              <ScrollArea className="h-[36vh] pr-2">
                <ul className="space-y-1.5">
                  {detail.map((line, i) => (
                    <li key={i} className="text-sm text-[color:var(--ink-2)] flex gap-2">
                      <span className="text-[color:var(--brand)] shrink-0">·</span><span>{line}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <div className="flex justify-end gap-2 pt-3 mt-auto border-t border-black/5">
                <Button size="sm" variant="ghost" onClick={onClose}>稍后处理</Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
                  disabled={!selected || !canReview}
                  onClick={() => {
                    if (!selected) return;
                    const reason = window.prompt('驳回理由（会显示给提交人）：', '数据需要再核对') ?? '';
                    if (reason === null) return;
                    onReject(selected, reason || '未填写理由');
                    toast.success('已驳回 ' + selected.by + ' 的提交');
                    setSelectedId(null);
                  }}
                >
                  <X className="w-4 h-4" />驳回
                </Button>
                <Button
                  size="sm" className="gap-1.5"
                  disabled={!selected || !canReview}
                  onClick={() => {
                    if (!selected) return;
                    if (!window.confirm('批准 ' + selected.by + ' 的这版修订？\n\n批准后该版本将成为线上数据（可在「版本历史」中回退）。')) return;
                    onApprove(selected);
                    toast.success('已批准并写入线上数据');
                    setSelectedId(null);
                  }}
                >
                  <Check className="w-4 h-4" />批准并写入
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
