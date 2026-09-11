// 随机分组对话框：基于当课次名单随机均分；人数不能整除时，多出的每人由用户指定加入哪一组
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Shuffle, Copy, Plus } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { toast } from 'sonner';

interface GroupDialogProps {
  open: boolean;
  onClose: () => void;
  students: string[];
  lessonNumber: number;
  getNickname: (name: string) => string;
}

// Fisher–Yates 洗牌
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function GroupDialog({ open, onClose, students, lessonNumber, getNickname }: GroupDialogProps) {
  const [groupCount, setGroupCount] = useState(2);
  const [order, setOrder] = useState<string[]>([]);
  const [extraTarget, setExtraTarget] = useState<number[]>([]);

  const n = students.length;
  const g = Math.max(1, Math.min(groupCount, Math.max(1, n)));
  const base = n > 0 ? Math.floor(n / g) : 0;
  const rem = n - base * g;

  // 打开 / 名单变化时重新洗牌（多出人员的去向由 [g, rem] 效应重置）
  useEffect(() => {
    if (open) {
      setOrder(shuffle(students));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, students]);

  // 组数变化时重置多出人员去向（默认前 rem 组各 +1）
  useEffect(() => {
    setExtraTarget(Array.from({ length: rem }, (_, i) => i % g));
  }, [g, rem]);

  const groups = useMemo(() => {
    const list: string[][] = Array.from({ length: g }, () => []);
    // 先均分 base 人/组
    for (let i = 0; i < g; i++) {
      list[i] = order.slice(i * base, (i + 1) * base);
    }
    // 多出的人按用户指定加入
    const extraPool = order.slice(base * g);
    extraPool.forEach((name, idx) => {
      const target = extraTarget[idx] ?? (idx % g);
      const ti = Math.max(0, Math.min(g - 1, target));
      list[ti].push(name);
    });
    return list;
  }, [order, base, g, extraTarget]);

  const extraPool = order.slice(base * g);

  const reshuffle = () => setOrder(shuffle(students));

  const copyResult = async () => {
    const text = groups
      .map((members, i) => `第${i + 1}组（${members.length}人）：${members.map(getNickname).join('、')}`)
      .join('\n');
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`已复制 ${g} 个小组的分组结果`);
    else toast.error('复制失败，请手动选择复制');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[color:var(--ink)]">
            <Users className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            随机分组 · 第{lessonNumber}课
          </DialogTitle>
        </DialogHeader>

        {n === 0 ? (
          <p className="text-sm text-[color:var(--ink-4)] text-center py-10">本班暂无学生，无法分组</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-[color:var(--ink-2)] flex items-center gap-2">
                小组数量
                <Select value={String(g)} onValueChange={(v) => setGroupCount(parseInt(v, 10) || 2)}>
                  <SelectTrigger className="w-24 h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: Math.max(1, n) }, (_, i) => i + 1)
                      .filter(x => x >= 1 && x <= n)
                      .map(x => <SelectItem key={x} value={String(x)}>{x} 组</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <Badge variant="secondary" className="rounded-full">{n} 人 · 每组约 {base}{rem > 0 ? `~${base + 1}` : ''} 人</Badge>
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={reshuffle}>
                <Shuffle className="w-3.5 h-3.5" />重新随机
              </Button>
            </div>

            {rem > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {n} 人无法被 {g} 组整除，多出 {rem} 人；请为每位多出的人选择加入的小组：
                </p>
                <div className="space-y-2">
                  {extraPool.map((name, idx) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-sm text-[color:var(--ink-2)] w-24 truncate" title={name}>{getNickname(name)}</span>
                      <Select
                        value={String(extraTarget[idx] ?? (idx % g))}
                        onValueChange={(v) => {
                          const t = parseInt(v, 10);
                          setExtraTarget(prev => {
                            const next = [...prev];
                            next[idx] = t;
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="w-28 h-8 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: g }, (_, i) => <SelectItem key={i} value={String(i)}>第 {i + 1} 组</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="max-h-[40vh] pr-2">
              <div className="space-y-3">
                {groups.map((members, i) => (
                  <div key={i} className="rounded-xl border border-[rgb(var(--brand-rgb)/0.2)] bg-[rgb(var(--brand-rgb)/0.04)] p-3">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--brand)' }}>
                      第 {i + 1} 组
                      <Badge variant="secondary" className="rounded-full text-[10px]">{members.length} 人</Badge>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.length === 0 ? (
                        <span className="text-xs text-[color:var(--ink-4)]">（空组）</span>
                      ) : (
                        members.map(m => (
                          <span key={m} className="text-xs px-2 py-1 rounded-lg bg-white/80 border border-[rgb(var(--brand-rgb)/0.15)] text-[color:var(--ink-2)]">
                            {getNickname(m)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={onClose}>关闭</Button>
              <Button className="ios-button gap-2 rounded-xl" onClick={copyResult}>
                <Copy className="w-4 h-4" />复制分组结果
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
