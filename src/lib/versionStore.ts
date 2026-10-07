// 版本历史（修订版本）：记录每次"有意义的变更"，支持回退到最近若干版本，并给出可读的变动明细。
//
// 为什么放在本地而不是云端表：Supabase 免费版当前只用一个 app_state 行承载全量快照，
// 新增表要改 RLS/迁移；而"修订版本"天然是"设备/团队的操作留痕"，
// 先用本机存储 + 只保留最近 N 版即可覆盖"手滑改错想回退"的真实场景。
// 需要跨端共享留痕时，再把 VersionEntry 的元数据（不含快照）同步到快照里即可。
import type { SyncSnapshot } from '@/lib/cloudSync';
import type { StudentRecord } from '@/types';

export interface VersionEntry {
  id: string;
  /** 记录时间（epoch ms） */
  at: number;
  /** 操作者（昵称/邮箱前缀） */
  actor: string;
  /** 触发原因：导入 / 清空 / 离班移除 / 手动保存 / 云同步 … */
  reason: string;
  /** 可读的变动明细（每条一行） */
  summary: string[];
  /** 该版本的完整快照，用于回退 */
  snapshot: SyncSnapshot;
}

const KEY = 'versionHistory.v1';
/** 默认保留版本数（快照较大，避免撑爆 localStorage） */
const MAX_KEEP = 12;

interface Stored {
  entries: VersionEntry[];
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Stored;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

/** 写入时做容量保护：写失败就逐步减少保留数量（最少 3 版） */
function write(entries: VersionEntry[]) {
  let keep = MAX_KEEP;
  while (keep >= 3) {
    const slice = entries.slice(-keep);
    try {
      localStorage.setItem(KEY, JSON.stringify({ entries: slice }));
      return;
    } catch {
      keep = Math.floor(keep / 2);
    }
  }
  // 极端情况：只留最新一版；仍失败则放弃（不影响主流程）
  try {
    localStorage.setItem(KEY, JSON.stringify({ entries: entries.slice(-1) }));
  } catch { /* 忽略：版本历史不可用不应阻塞业务 */ }
}

export function listVersions(): VersionEntry[] {
  return read().entries.slice().reverse();   // 新的在前
}

export function clearVersions() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/**
 * 记录一个版本。若与上一版快照完全相同则跳过（避免噪声）。
 * 注意：调用方应传"变更之后"的快照。
 */
export function recordVersion(
  snapshot: SyncSnapshot,
  meta: { actor: string; reason: string; summary?: string[] }
): VersionEntry | null {
  const stored = read();
  const last = stored.entries[stored.entries.length - 1];
  const summary = meta.summary && meta.summary.length > 0
    ? meta.summary
    : last ? diffSnapshots(last.snapshot, snapshot) : ['（首次记录：建立版本基线）'];
  if (last && summary.length === 0) return null;   // 无变化不记账

  const entry: VersionEntry = {
    id: 'v' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    at: Date.now(),
    actor: meta.actor || '本机',
    reason: meta.reason,
    summary,
    snapshot,
  };
  write([...stored.entries, entry]);
  return entry;
}

// ============ 变动明细 ============

const FIELD_LABELS: Record<string, string> = {
  attendance: '考勤',
  classPerformance: '课堂表现',
  homeworkStatus: '课堂练习',
  listeningStatus: '课后任务',
  listeningScore: '课后任务分数',
  note: '备注',
  adjustReason: '调课原因',
};

function recordKey(r: StudentRecord) {
  return r.studentName + '#' + r.lessonNumber;
}

/** 对比两个快照，输出可读的变动明细（最多 12 条，超出折叠） */
export function diffSnapshots(prev: SyncSnapshot | undefined, next: SyncSnapshot): string[] {
  if (!prev) return ['（首次记录：建立版本基线）'];
  const out: string[] = [];

  // 班级层：新增/删除
  const prevClasses = prev.classes || {};
  const nextClasses = next.classes || {};
  const addedClasses = Object.values(nextClasses).filter(c => !prevClasses[c.id]);
  const removedClasses = Object.values(prevClasses).filter(c => !nextClasses[c.id]);
  if (addedClasses.length) out.push('新增班级：' + addedClasses.map(c => c.name).join('、'));
  if (removedClasses.length) out.push('删除班级：' + removedClasses.map(c => c.name).join('、'));

  // 逐班对比
  Object.values(nextClasses).forEach(cls => {
    const before = prevClasses[cls.id];
    if (!before) return;
    const tag = '【' + cls.name + '】';

    const addStudents = cls.students.filter(s => !before.students.includes(s));
    const delStudents = before.students.filter(s => !cls.students.includes(s));
    if (addStudents.length) out.push(tag + '新增学员 ' + addStudents.length + ' 人：' + addStudents.slice(0, 5).join('、') + (addStudents.length > 5 ? ' 等' : ''));
    if (delStudents.length) out.push(tag + '移除学员 ' + delStudents.length + ' 人：' + delStudents.slice(0, 5).join('、') + (delStudents.length > 5 ? ' 等' : ''));

    const beforeRecs = new Map(before.records.map(r => [recordKey(r), r]));
    const afterRecs = new Map(cls.records.map(r => [recordKey(r), r]));
    let addedRec = 0;
    let removedRec = 0;
    const fieldChanges: string[] = [];

    afterRecs.forEach((r, key) => {
      const b = beforeRecs.get(key);
      if (!b) {
        addedRec++;
        const hasContent = Object.keys(r.scores || {}).length > 0 || r.totalScore > 0 || r.attendance;
        if (hasContent) fieldChanges.push('第' + r.lessonNumber + '课 ' + r.studentName + '：新增一条有内容的记录');
        return;
      }
      // 字段级差异
      (Object.keys(FIELD_LABELS) as (keyof StudentRecord)[]).forEach(f => {
        const ov = String(b[f] ?? '');
        const nv = String(r[f] ?? '');
        if (ov !== nv) fieldChanges.push('第' + r.lessonNumber + '课 ' + r.studentName + '：' + (FIELD_LABELS[f as string] || f) + ' ' + (ov || '空') + ' → ' + (nv || '空'));
      });
      // 分数差异（按题型名对齐展示更可读，这里用总分 + 明细数量兜底）
      if (JSON.stringify(b.scores || {}) !== JSON.stringify(r.scores || {})) {
        const oldT = b.totalScore ?? 0;
        const newT = r.totalScore ?? 0;
        if (oldT !== newT) fieldChanges.push('第' + r.lessonNumber + '课 ' + r.studentName + '：总分 ' + oldT + ' → ' + newT);
        else fieldChanges.push('第' + r.lessonNumber + '课 ' + r.studentName + '：题型分数有调整');
      }
      if (JSON.stringify(b.customValues || {}) !== JSON.stringify(r.customValues || {})) {
        fieldChanges.push('第' + r.lessonNumber + '课 ' + r.studentName + '：自定义列有调整');
      }
    });
    beforeRecs.forEach((_r, key) => { if (!afterRecs.has(key)) removedRec++; });

    if (addedRec) out.push(tag + '新增记录 ' + addedRec + ' 条');
    if (removedRec) out.push(tag + '删除记录 ' + removedRec + ' 条');
    fieldChanges.slice(0, 6).forEach(line => out.push(tag + line));
    if (fieldChanges.length > 6) out.push(tag + '…另有 ' + (fieldChanges.length - 6) + ' 处字段调整');
  });

  if (JSON.stringify(prev.appConfig) !== JSON.stringify(next.appConfig)) out.push('系统设置/默认选项有调整');
  if (JSON.stringify(prev.nicknames || {}) !== JSON.stringify(next.nicknames || {})) out.push('学员昵称有调整');
  if (JSON.stringify(prev.schoolScores || {}) !== JSON.stringify(next.schoolScores || {})) out.push('校内成绩有调整');

  return out.slice(0, 14);
}
