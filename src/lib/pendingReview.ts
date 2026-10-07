// 待审核版本（协作审核流）。
//
// 口径（2026-10-07 Lynn 明确）：
//   非管理员把一版（通常是整个班级的数据）编辑完后 **提交审核**；
//   审核通过前，其改动不写入线上数据 —— 只以"待审版本"的形式挂在校准快照里，
//   管理员在「审核队列」看得见、可批准（成为新线上数据）或驳回（附理由）。
//
// 为什么放在云端快照里而不是新建表：
//   Supabase 免费版目前只有一个 app_state 行承载全量快照，新建表要改 RLS 与迁移；
//   把待审列表挂在快照内，可以复用现有的推送/拉取通道，团队所有人都能看到队列。
import type { SyncSnapshot } from '@/lib/cloudSync';

export interface PendingVersion {
  id: string;
  /** 提交人（昵称/邮箱前缀） */
  by: string;
  /** 提交时间（epoch ms） */
  at: number;
  /** 提交说明（可选） */
  note?: string;
  /** 提交人编辑后的完整快照（批准后即成为线上数据） */
  snapshot: SyncSnapshot;
}

/** 生成一个待审条目 */
export function makePendingVersion(
  snapshot: SyncSnapshot,
  by: string,
  note?: string
): PendingVersion {
  return {
    id: 'pv' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    by: by || '成员',
    at: Date.now(),
    note,
    snapshot,
  };
}

/** 合并待审列表：同一个人重复提交时，只保留最新一版（避免队列被同一人刷屏） */
export function mergePending(list: PendingVersion[] | undefined, incoming: PendingVersion): PendingVersion[] {
  const base = Array.isArray(list) ? list : [];
  return [...base.filter(p => p.by !== incoming.by), incoming];
}

/** 移除某个待审条目（批准/驳回后） */
export function removePending(list: PendingVersion[] | undefined, id: string): PendingVersion[] {
  return (Array.isArray(list) ? list : []).filter(p => p.id !== id);
}

/** 提交前的基本校验：快照必须包含 classes（否则是坏数据） */
export function isValidPendingSnapshot(snap: SyncSnapshot | null | undefined): boolean {
  return !!snap && typeof snap === 'object' && !!snap.classes && typeof snap.classes === 'object';
}
