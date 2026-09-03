import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, Copy, Trash2, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { addMember, listMembers, myUserId, removeMember, setMemberAdmin } from '@/lib/members';
import type { MemberRow } from '@/lib/members';
import { BUILD_SCOPE } from '@/lib/config';

interface MembersPanelProps {
  /** 当前用户是否为管理员 */
  isAdmin: boolean;
  /** 名册变化后回调（父级可刷新自身权限） */
  onChanged?: () => void;
}

/** 团队权限面板：所有人可见“我的ID”，管理员可维护可写名单。真正权限由服务端 RLS 保证。 */
export function MembersPanel({ isAdmin, onChanged }: MembersPanelProps) {
  const scope = BUILD_SCOPE;
  const me = myUserId();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [newUid, setNewUid] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAdmin, setNewAdmin] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    const res = await listMembers(scope);
    if (res.ok) setRows(res.data ?? []);
    else setErr(res.message);
    setLoading(false);
  }, [scope]);

  useEffect(() => { if (isAdmin) reload(); }, [isAdmin, reload]);

  const copyMe = async () => {
    try { await navigator.clipboard.writeText(me); } catch { /* ignore */ }
  };

  const onAdd = async () => {
    if (!newUid.trim()) { setErr('请填写用户ID'); return; }
    const r = await addMember(scope, newUid, newEmail, newAdmin);
    if (!r.ok) { setErr(r.message); return; }
    setErr(''); setNewUid(''); setNewEmail(''); setNewAdmin(false);
    await reload(); onChanged?.();
  };

  const onToggle = async (row: MemberRow) => {
    const r = await setMemberAdmin(scope, row.user_id, !row.is_admin);
    if (!r.ok) { setErr(r.message); return; }
    await reload(); onChanged?.();
  };

  const onRemove = async (row: MemberRow) => {
    if (row.user_id === me) { setErr('不能移除自己'); return; }
    const r = await removeMember(scope, row.user_id);
    if (!r.ok) { setErr(r.message); return; }
    await reload(); onChanged?.();
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-[#1c1c1e]">
          <Users className="w-4 h-4" /> 团队权限
          <Badge variant="secondary" className="ml-1">{scope}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 我的ID：所有人都能复制发给管理员 */}
        <div className="rounded-xl bg-[#f2f2f7] p-3">
          <div className="text-xs text-[#8e8e93] mb-1">我的用户ID（发送给管理员以加入可写名单）</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs break-all text-[#1c1c1e] font-mono">{me || '未登录'}</code>
            <Button variant="ghost" size="sm" className="h-8" onClick={copyMe} disabled={!me}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {!isAdmin ? (
          <div className="flex items-center gap-2 text-sm text-[#8e8e93]">
            <ShieldAlert className="w-4 h-4" />
            你是只读成员；需要录入请在“成员管理”由管理员添加你的用户ID。
          </div>
        ) : (
          <>
            {/* 添加成员 */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#3c3c43]">添加可写成员</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={newUid} onChange={(e) => setNewUid(e.target.value)} placeholder="成员用户ID (uuid)" className="h-10" />
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="邮箱(选填)" className="h-10 sm:w-48" />
                <Button size="sm" className="h-10 shrink-0" onClick={onAdd}>
                  <UserPlus className="w-4 h-4 mr-1" />添加
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#3c3c43]">
                <input type="checkbox" checked={newAdmin} onChange={(e) => setNewAdmin(e.target.checked)} />
                设为管理员
              </label>
            </div>

            {/* 名册 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-[#3c3c43]">名册（{rows.length}）</div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reload} disabled={loading}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
                </Button>
              </div>
              <div className="divide-y divide-[#e5e5ea] rounded-xl border border-[#e5e5ea] overflow-hidden">
                {rows.length === 0 && !loading && <div className="p-3 text-sm text-[#8e8e93]">暂无成员</div>}
                {rows.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2 px-3 py-2">
                    {r.is_admin ? <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> : <Users className="w-4 h-4 text-[#8e8e93] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#1c1c1e] truncate">{r.email || r.user_id}</div>
                      {r.email && <div className="text-[11px] text-[#8e8e93] font-mono truncate">{r.user_id}</div>}
                    </div>
                    {r.user_id === me && <Badge variant="outline" className="text-[10px]">我</Badge>}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onToggle(r)} disabled={r.user_id === me}>
                      {r.is_admin ? '降为成员' : '设为管理'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[#ff3b30]" onClick={() => onRemove(r)} disabled={r.user_id === me}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {err && <p className="text-sm text-[#ff3b30]">{err}</p>}
      </CardContent>
    </Card>
  );
}
