import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { BookMarked, Plus, Pencil, Trash2, Copy, Link as LinkIcon } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { toast } from 'sonner';
import type { SavedFeedback } from '@/types';

interface FeedbackLibraryProps {
  items: SavedFeedback[];
  onChange: (next: SavedFeedback[]) => void;
  currentLesson: number;
  /** 供外部（反馈生成）复用的插入回调；此处仅复制 */
}

const genId = () => 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function FeedbackLibrary({ items, onChange, currentLesson }: FeedbackLibraryProps) {
  const [editing, setEditing] = useState<SavedFeedback | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SavedFeedback>({ id: '', lessonNumber: currentLesson, title: '', content: '', links: [], updatedAt: '' });
  const [linksText, setLinksText] = useState('');

  const grouped = useMemo(() => {
    const map: { [k: number]: SavedFeedback[] } = {};
    [...items].sort((a, b) => a.lessonNumber - b.lessonNumber).forEach(it => {
      (map[it.lessonNumber] ||= []).push(it);
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map(lesson => ({ lesson, list: map[lesson] }));
  }, [items]);

  const openNew = () => {
    setEditing(null);
    setDraft({ id: '', lessonNumber: currentLesson, title: '', content: '', links: [], updatedAt: '' });
    setLinksText('');
    setOpen(true);
  };
  const openEdit = (it: SavedFeedback) => {
    setEditing(it);
    setDraft({ ...it });
    setLinksText((it.links || []).join('\n'));
    setOpen(true);
  };

  const save = () => {
    const content = draft.content.trim();
    if (!content && !draft.title.trim()) { toast.error('请填写标题或内容'); return; }
    const links = linksText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const now = new Date().toISOString();
    if (editing) {
      onChange(items.map(x => x.id === editing.id ? { ...draft, links, updatedAt: now, id: editing.id } : x));
      toast.success('已更新素材');
    } else {
      onChange([...items, { ...draft, id: genId(), links, updatedAt: now }]);
      toast.success('已保存到素材库');
    }
    setOpen(false);
  };

  const remove = (id: string) => { onChange(items.filter(x => x.id !== id)); toast.success('已删除'); };

  const doCopy = async (it: SavedFeedback) => {
    const text = it.links && it.links.length ? `${it.content}\n\n🔗 素材：\n${it.links.join('\n')}` : it.content;
    if (await copyToClipboard(text)) toast.success('已复制，去粘贴给家长吧');
  };

  return (
    <Card className="ios-glass-card border-0">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 text-[color:var(--ink)] font-semibold">
            <span className="w-9 h-9 rounded-[var(--r-md)] bg-[rgb(var(--brand-rgb)/0.1)] flex items-center justify-center">
              <BookMarked className="w-5 h-5 text-[color:var(--brand)]" />
            </span>
            预存反馈素材库
            <Badge variant="secondary" className="ml-1 rounded-full">{items.length}</Badge>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="ios-button gap-2" onClick={openNew}><Plus className="w-4 h-4" />新增素材</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? '编辑素材' : '新增反馈素材'}</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="flex gap-3">
                  <div className="space-y-1.5 w-32">
                    <Label>课次</Label>
                    <Input type="number" min={1} value={draft.lessonNumber} onChange={(e) => setDraft(d => ({ ...d, lessonNumber: Math.max(1, parseInt(e.target.value) || 1) }))} className="ios-input" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <Label>标题 / 场景</Label>
                    <Input placeholder="如：首课鼓励 · 第1课" value={draft.title} onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))} className="ios-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>正文</Label>
                  <Textarea value={draft.content} onChange={(e) => setDraft(d => ({ ...d, content: e.target.value }))} className="min-h-[160px] text-sm ios-input" placeholder="反馈文本内容…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" />素材链接（每行一个，图片/视频链接）</Label>
                  <Textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} className="min-h-[80px] text-sm font-mono ios-input" placeholder={'https://…\nhttps://…'} />
                </div>
                <Button className="ios-button w-full" onClick={save}>{editing ? '保存修改' : '加入素材库'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {items.length === 0 ? (
          <div className="empty-general">
            <span className="empty-ico"><BookMarked className="w-6 h-6" /></span>
            <div className="empty-t">素材库还是空的</div>
            <div className="empty-d">按课次预存常用反馈文本，可附图片/视频链接；点「新增素材」开始，方便快速复用。</div>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(g => (
              <div key={g.lesson}>
                <div className="text-sm font-semibold text-[color:var(--ink-2)] mb-2">第 {g.lesson} 课 <span className="text-[color:var(--ink-4)] font-normal">· {g.list.length} 条</span></div>
                <div className="grid md:grid-cols-2 gap-3">
                  {g.list.map(it => (
                    <div key={it.id} className="rounded-[var(--r-lg)] bg-white/70 ring-1 ring-black/5 p-3.5 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-[color:var(--ink)]">{it.title || '（无标题）'}</div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => doCopy(it)} title="复制" className="p-1.5 rounded-lg text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.1)]"><Copy className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(it)} title="编辑" className="p-1.5 rounded-lg text-[color:var(--ink-4)] hover:bg-black/[0.05]"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => remove(it.id)} title="删除" className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="text-sm text-[color:var(--ink-2)] whitespace-pre-wrap line-clamp-4">{it.content || <span className="text-[color:var(--ink-4)]">（仅链接）</span>}</div>
                      {it.links && it.links.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {it.links.map((l, i) => (
                            <a key={i} href={l} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] max-w-[16rem] truncate">
                              <LinkIcon className="w-3 h-3 shrink-0" />素材 {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
