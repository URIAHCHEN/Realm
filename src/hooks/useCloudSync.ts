import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getCachedSession } from '@/lib/auth';
import { makePendingVersion, mergePending, removePending } from '@/lib/pendingReview';
import {
  type CloudSyncConfig,
  type CloudSyncStatus,
  type SyncSnapshot,
  fetchCloudState,
  hashSnapshot,
  loadSyncConfig,
  loadSyncMeta,
  pushSnapshotConditional,
  saveSyncConfig,
  saveSyncMeta,
} from '@/lib/cloudSync';
import { getSyncIntervalSec } from '@/lib/displaySettings';
import { isBackendOffline } from '@/lib/connectivity';

/** 把内部错误码/异常转成老师能看懂的中文提示 */
function toSyncMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw === 'AUTH_FAILED') return '登录已失效或无写入权限：请重新登录；若你不在可写名单，数据将保持只读';
  if (raw === 'TABLE_MISSING') return '云端数据表尚未创建：请先在 Supabase 执行建表/权限 SQL';
  if (raw.startsWith('HTTP_')) return `云端返回异常（${raw.replace('HTTP_', 'HTTP ')}），请稍后重试`;
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network')) {
    return '云端暂时不可达：改动已保存在本设备，联网后会自动补传';
  }
  return raw;
}

interface UseCloudSyncOptions {
  /** 是否管理员：非管理员不做自动推送，改动需「提交审核」 */
  isAdmin?: boolean;  snapshot: SyncSnapshot;
  onImport: (snapshot: SyncSnapshot) => void;
  /** 是否已登录：RLS 收紧后需携带用户 JWT，未登录时不做对账/自动推送 */
  enabled: boolean;
  /** 当前登录账号标识；变化时重新对账（切换账号场景） */
  sessionKey?: string | null;
  /** 是否在可写名单内：false 时只读，不向云端推送 */
  canWrite?: boolean;
}

export type SyncAction = 'idle' | 'pushing' | 'pulling';

export function useCloudSync({ snapshot, onImport, enabled, sessionKey, canWrite = true, isAdmin = true }: UseCloudSyncOptions) {
  const [config, setConfig] = useState<CloudSyncConfig | null>(() => loadSyncConfig());
  const [status, setStatus] = useState<CloudSyncStatus>('unconfigured');
  const [action, setAction] = useState<SyncAction>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [message, setMessage] = useState<string>('');

  /** 当前操作者标识（审核队列署名用） */
  const ACTOR_OR_SELF = () => (getCachedSession()?.email || '本机').split('@')[0];

  const statusRef = useRef<CloudSyncStatus>('unconfigured');
  const snapshotRef = useRef(snapshot);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPush = useRef(false);
  /** 导入（拉取/冲突解决）后，等待"落地后的本地快照"来校准 lastPushedHash */
  const pendingImportHash = useRef(false);
  /** reconcile 互斥：focus 与 visibilitychange 会几乎同时触发，避免并发对账 */
  const reconciling = useRef(false);
  /**
   * 互斥期间被丢弃的那次对账必须补跑一次。
   * 典型场景：登录瞬间 canWrite 仍是初始 false，此次对账被跳过；随后权限变 true，
   * effect 再触发时上一次还没跑完 → 又被丢弃 → 界面永远停在"只读 / 未列入可写名单"。
   */
  const reconcilePending = useRef(false);
  const reconcileRef = useRef<((cfg: CloudSyncConfig) => Promise<void>) | null>(null);
  /** doPush 单飞：定时推送 + 对账推送 + 手动推送可并发，慢的那次带旧快照后落盘会覆盖新数据 */
  const pushInFlight = useRef(false);
  /**
   * 云端为空、但对账时本地数据还没加载完（刷新后 restart 时序）→ 置位。
   * 数据一旦到位立刻补一次首传，否则会一直停在"云端为空，等待首次同步"，
   * 直到用户碰巧编辑或切窗口触发下一轮对账。
   * 用 state 而非 ref：置位的时刻往往晚于数据加载，ref 不会让 effect 重跑。
   */
  const [awaitingFirstUpload, setAwaitingFirstUpload] = useState(false);

  snapshotRef.current = snapshot;

  const doPush = useCallback(async (cfg: CloudSyncConfig, silent = false) => {
    if (pushInFlight.current) return false;
    if (!canWrite) {
      setStatus('readonly');
      statusRef.current = 'readonly';
      setMessage('当前为只读：未列入可写名单');
      if (!silent) toast.info('你尚未被加入可写名单，改动只保存在本地');
      return false;
    }
    setAction('pushing');
    pushInFlight.current = true;
    try {
      // 乐观锁（CAS）：把基线 hash 作为**写请求的条件**（PATCH ?snapshot_hash=eq.<base>），
      // 由数据库原子判断——不再「先 fetch 比对再 upsert」，那段窗口里他端写入会被静默覆盖。
      // 0 行受影响 = 云端已被其他设备推进 → 暂停本次上传并转 conflict，由同步中心二选一。
      const baseMeta = loadSyncMeta();
      // 关键：固定"本次真正上传的那份快照"。
      // 若在上传途中继续录分，snapshotRef.current 会变成新内容；
      // 用新内容当 lastPushedHash 会让下次对账误判"云端有更新"→ 拉取覆盖刚录的分数。
      const pushed = snapshotRef.current;
      const outcome = await pushSnapshotConditional(cfg, pushed, baseMeta.lastPushedHash || null);
      if (!outcome.ok) {
        if (outcome.reason === 'conflict') {
          setStatus('conflict');
          statusRef.current = 'conflict';
          setMessage('云端已被其他设备更新；为避免覆盖，本次上传已暂停，请在同步中心选择保留哪一边');
          if (!silent) toast.error('云端有他人新改动，本次上传已暂停（防覆盖）');
          return false;
        }
        if (outcome.reason === 'missing') {
          setStatus('error');
          statusRef.current = 'error';
          setMessage('云端数据表不存在：请先在 Supabase 执行建表 SQL');
          if (!silent) toast.error('云端数据表不存在，请先执行建表 SQL');
          return false;
        }
        // auth：登录态失效或无权写入
        setStatus('error');
        statusRef.current = 'error';
        setMessage('无权写入云端：请重新登录，或确认账号在成员名单内');
        if (!silent) toast.error('无权写入云端，请重新登录');
        return false;
      }
      const pushedHash = hashSnapshot(pushed);
      // 若期间本地又变了，哈希照实记录"已上传的那份"，本地差异会在下一次自动推送里补上
      const meta = { lastPushedAt: Date.now(), lastPushedHash: pushedHash };
      saveSyncMeta(meta);
      setLastSyncAt(meta.lastPushedAt);
      setStatus('connected');
      statusRef.current = 'connected';
      setMessage('已同步到云端');
      if (!silent) toast.success('已上传到云端 ☁️');
      return true;
    } catch (e) {
      setStatus('error');
      statusRef.current = 'error';
      const m = toSyncMessage(e);
      setMessage(m);
      if (!silent && !isBackendOffline()) toast.error('云端上传失败：' + m);
      return false;
    } finally {
      setAction('idle');
      pushInFlight.current = false;
    }
  }, [canWrite]);

  const doPull = useCallback(async (cfg: CloudSyncConfig, silent = false) => {
    setAction('pulling');
    try {
      const cloud = await fetchCloudState(cfg);
      if (!cloud.snapshot) {
        if (!silent) toast.info('云端还没有数据，先上传一份吧');
        return false;
      }
      // 导入会做迁移/重算（请假清零、正确率重算、模板自愈、选项迁移），
      // 落地后的本地快照与云端那份并不等值 —— 因此这里只标记"等待落地哈希"，
      // 由下面的 effect 在本地下一次渲染时记录真实哈希：
      //   ① 避免每次拉取后本地永远"看起来脏"→ 假冲突 + 无意义往返；
      //   ② 也让抑制标记不会吃掉用户随后的一次真实编辑（原实现会）。
      pendingImportHash.current = true;
      onImport(cloud.snapshot);
      const meta = { lastPushedAt: Date.now(), lastPushedHash: hashSnapshot(cloud.snapshot) };
      saveSyncMeta(meta);
      setLastSyncAt(meta.lastPushedAt);
      const okStatus: CloudSyncStatus = canWrite ? 'connected' : 'readonly';
      setStatus(okStatus);
      statusRef.current = okStatus;
      setMessage(canWrite ? '已从云端拉取最新数据' : '已同步为最新（只读）');
      if (!silent) toast.success('已从云端拉取最新数据 📥');
      return true;
    } catch (e) {
      setStatus('error');
      statusRef.current = 'error';
      const m = toSyncMessage(e);
      setMessage(m);
      if (!silent && !isBackendOffline()) toast.error('云端拉取失败：' + m);
      return false;
    } finally {
      setAction('idle');
    }
  }, [onImport, canWrite]);

  // 启动时对比本地与云端，自动决定同步方向
  const reconcile = useCallback(async (cfg: CloudSyncConfig) => {
    // 同一时刻只允许一次对账：focus 与 visibilitychange 几乎同刻触发，
    // 60s 定时也可能撞上；并发对账会基于过期 meta 做决策（重复上传 / 假冲突 / 重复导入）
    if (reconciling.current) { reconcilePending.current = true; return; }
    reconciling.current = true;
    setStatus('connecting');
    try {
      const cloud = await fetchCloudState(cfg);
      const meta = loadSyncMeta();
      const localHash = hashSnapshot(snapshotRef.current);

      if (!cloud.snapshot) {
        // 云端为空：本地有数据则上传
        if (Object.keys(snapshotRef.current.classes || {}).length > 0) {
          setAwaitingFirstUpload(false);
          await doPush(cfg, true);
        } else {
          // 本地也还没有数据（刚刷新、数据仍在加载）→ 标记待补传，别就此判定"无事可做"
          setAwaitingFirstUpload(true);
          setStatus(canWrite ? 'connected' : 'readonly');
          statusRef.current = canWrite ? 'connected' : 'readonly';
          setMessage('云端为空，等待首次同步');
        }
        return;
      }

      const cloudHasData = cloud.hash !== '';
      if (!cloudHasData) {
        // 云端行存在但无哈希（异常情况），以云端数据为准
        await doPull(cfg, true);
        return;
      }

      // 首次对账（本机没有同步记录：新设备、换浏览器、清缓存、或刚点过「断开云同步」）：
      // 此时 lastPushedHash 为空串，若照常比较会同时判定"本地有改动 + 云端有改动" →
      // 弹出冲突二选一；而误点「保留本地」会把示例数据推给共享后端、覆盖全团队数据。
      // 因此首次对账一律以云端为准（拉取），除非云端为空（上面已处理）。
      if (!meta.lastPushedHash) {
        await doPull(cfg, true);
        return;
      }

      const localChanged = localHash !== meta.lastPushedHash;
      const cloudChanged = cloud.hash !== meta.lastPushedHash;

      if (!localChanged && !cloudChanged) {
        setStatus(canWrite ? 'connected' : 'readonly');
        statusRef.current = canWrite ? 'connected' : 'readonly';
        setLastSyncAt(meta.lastPushedAt);
        setMessage('本地与云端一致');
      } else if (!localChanged && cloudChanged) {
        await doPull(cfg, true);
      } else if (localChanged && !cloudChanged) {
        await doPush(cfg, true);
      } else {
        setStatus('conflict');
        statusRef.current = 'conflict';
        setMessage('本地与云端都有改动，需要手动选择保留哪边');
      }
    } catch (e) {
      setStatus('error');
      statusRef.current = 'error';
      setMessage(toSyncMessage(e));
    } finally {
      reconciling.current = false;
      if (reconcilePending.current) {
        reconcilePending.current = false;
        const run = reconcileRef.current;
        // 让出一拍：等 canWrite / config 的新值落到本次渲染再补跑
        if (run) setTimeout(() => { void run(cfg); }, 80);
      }
    }
  }, [doPush, doPull, canWrite]);
  reconcileRef.current = reconcile;

  // 登录后对账：enabled 变 true、切换账号或权限变化时重新对账（此时已携带用户 JWT，可过 RLS）
  useEffect(() => {
    if (config && enabled) {
      reconcile(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionKey, canWrite]);

  // 云端为空时，本地数据往往晚一步才从 localStorage 读出来（刷新后的加载时序）。
  // 首次对账因此看不见数据、只留下"等待首次同步"，之后不会再有对账触发点。
  // 这里监听快照到位，立刻补一次首传 —— 用户导入备份后也能自动上去，不必再点一次上传。
  useEffect(() => {
    if (!awaitingFirstUpload) return;
    if (!config || !enabled || !canWrite) return;
    if (Object.keys(snapshot.classes || {}).length === 0) return;
    setAwaitingFirstUpload(false);
    void doPush(config, true);
  }, [awaitingFirstUpload, snapshot, config, enabled, canWrite, doPush]);

  // 导入落地：用"迁移/重算之后"的真实本地快照校准 lastPushedHash，
  // 否则本地会被判定为永远脏（假冲突 / 每次拉取后又回推一次）
  useEffect(() => {
    if (!pendingImportHash.current || !config) return;
    pendingImportHash.current = false;
    const meta = { lastPushedAt: Date.now(), lastPushedHash: hashSnapshot(snapshot) };
    saveSyncMeta(meta);
    suppressPush.current = true;
  }, [snapshot, config]);

  // 数据变更：自动同步（防抖，间隔可在设置中调整），仅登录且可写、连接正常时
  useEffect(() => {
    if (!enabled) return;
    if (!canWrite) return;
    if (!config || !config.autoSync) return;
    if (statusRef.current !== 'connected') return;
    // 审核流：非管理员的改动不自动写入线上数据，需在页面上「提交审核」
    if (isAdmin === false) {
      setMessage('有改动待提交审核（不会自动上传）');
      return;
    }
    // 抑制仅针对"刚刚由导入落地的那份哈希"，且不依赖 effect 的早退分支去消费，
    // 避免把用户随后的真实编辑当成导入回响而漏推
    if (suppressPush.current) {
      suppressPush.current = false;
      return;
    }
    const intervalSec = getSyncIntervalSec();
    if (intervalSec <= 0) return; // 用户关闭了自动同步
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      doPush(config, true);
    }, intervalSec * 1000);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [snapshot, config, doPush, enabled, canWrite, isAdmin]);

  // 多端收敛：窗口获焦/可见 或 每 60s，轻量再对账（复用冲突检测，不改变写入语义）
  useEffect(() => {
    if (!enabled || !config) return;
    const maybeReconcile = () => {
      if (document.visibilityState === 'visible') reconcile(config);
    };
    window.addEventListener('focus', maybeReconcile);
    document.addEventListener('visibilitychange', maybeReconcile);
    const id = setInterval(maybeReconcile, 60_000);
    return () => {
      window.removeEventListener('focus', maybeReconcile);
      document.removeEventListener('visibilitychange', maybeReconcile);
      clearInterval(id);
    };
  }, [enabled, config, reconcile]);

  // ============ 对外操作 ============

  const handleSaveConfig = useCallback((cfg: CloudSyncConfig) => {
    saveSyncConfig(cfg);
    setConfig(cfg);
    statusRef.current = 'connecting';
    reconcile(cfg);
  }, [reconcile]);

  const handleClearConfig = useCallback(() => {
    localStorage.removeItem('cloudSyncConfig');
    localStorage.removeItem('cloudSyncMeta');
    setConfig(null);
    setStatus('unconfigured');
    statusRef.current = 'unconfigured';
    setMessage('');
  }, []);

  const push = useCallback(() => {
    if (config) return doPush(config);
  }, [config, doPush]);

  const pull = useCallback(() => {
    if (config) return doPull(config);
  }, [config, doPull]);

  // 只做"对账"（比较本地/云端后决定推或拉），不会无条件用云端覆盖本地。
  // 离线恢复、手动"重新检测"应当走这里，而不是 pull。
  /** 最近一次从云端拿到的待审列表 */
  const [pending, setPending] = useState<import('@/lib/pendingReview').PendingVersion[]>([]);

  /** 非管理员：把当前这一版提交审核（只写待审列表，不动线上数据） */
  const submitForReview = useCallback(async (note?: string) => {
    if (!config) return;
    setAction('pushing');
    try {
      const item = makePendingVersion(snapshotRef.current, ACTOR_OR_SELF(), note);
      // 多人同时提交时「读队列 → 合并 → 整体写回」会互相覆盖（后到者把先到者的条目冲掉）。
      // 改为条件写：写失败（hash 变了）就重新取最新队列再合并，最多 3 轮（2026-10-17）
      let merged: import('@/lib/pendingReview').PendingVersion[] | null = null;
      let failReason: 'conflict' | 'missing' | 'auth' | '' = '';
      for (let attempt = 0; attempt < 3 && !merged; attempt++) {
        const cloud = await fetchCloudState(config);
        const baseSnap = cloud.snapshot;
        if (!baseSnap) { toast.error('云端还没有基础数据，请先让管理员上传一版'); return; }
        const next = mergePending(baseSnap.pendingVersions, item);
        const outcome = await pushSnapshotConditional(config, { ...baseSnap, pendingVersions: next }, cloud.hash || null);
        if (outcome.ok) { merged = next; break; }
        failReason = outcome.reason;
        // 只有「云端刚被改过」值得重读重试；其余（无表/无权限）直接失败
        if (outcome.reason !== 'conflict') break;
      }
      if (!merged) {
        setStatus('error'); statusRef.current = 'error';
        const msg = failReason === 'conflict'
          ? '多人同时提交，队列刚被更新，请再点一次提交'
          : failReason === 'auth' ? '无权写入云端：请重新登录或确认在成员名单内'
          : '云端数据表不存在，请先执行建表 SQL';
        setMessage(msg); toast.error(msg);
        return;
      }
      setPending(merged);
      setStatus('connected'); statusRef.current = 'connected';
      setMessage('已提交审核，等待管理员批准');
      toast.success('已提交审核', { description: '管理员批准后才会写入线上数据', duration: 5000 });
    } catch (e) {
      setStatus('error'); statusRef.current = 'error';
      const m2 = toSyncMessage(e); setMessage(m2); toast.error('提交失败：' + m2);
    } finally { setAction('idle'); }
  }, [config]);

  /** 管理员刷新待审列表 */
  const refreshPending = useCallback(async () => {
    if (!config) return [];
    try {
      const cloud = await fetchCloudState(config);
      const list = cloud.snapshot?.pendingVersions || [];
      setPending(list);
      return list;
    } catch { return []; }
  }, [config]);

  /** 管理员批准：该版本成为线上数据（保留其余待审条目） */
  const approvePending = useCallback(async (item: import('@/lib/pendingReview').PendingVersion) => {
    if (!config) return;
    try {
      // 条件写：批准前先取云端当前 hash 作基线，若期间他端写入则放弃本次批准（不覆盖别人）
      const cloud = await fetchCloudState(config);
      const rest = removePending(cloud.snapshot?.pendingVersions || pending, item.id);
      const outcome = await pushSnapshotConditional(config, { ...item.snapshot, pendingVersions: rest }, cloud.hash || null);
      if (!outcome.ok) {
        toast.error(outcome.reason === 'conflict'
          ? '云端刚被其他设备更新，请刷新待审列表后再批准'
          : '批准失败：无权写入云端或数据表不存在');
        return;
      }
      onImport(item.snapshot);
      setPending(rest);
      saveSyncMeta({ lastPushedAt: Date.now(), lastPushedHash: hashSnapshot(item.snapshot) });
      setMessage('已批准 ' + item.by + ' 的修订并写入线上数据');
    } catch (e) {
      toast.error('批准失败：' + toSyncMessage(e));
    }
  }, [config, pending, onImport]);

  /** 管理员驳回：仅把该条目从队列移除（线上数据不变） */
  const rejectPending = useCallback(async (item: import('@/lib/pendingReview').PendingVersion) => {
    if (!config) return;
    try {
      const cloud = await fetchCloudState(config);
      const rest = removePending(cloud.snapshot?.pendingVersions || pending, item.id);
      const outcome = await pushSnapshotConditional(config, { ...(cloud.snapshot || snapshotRef.current), pendingVersions: rest }, cloud.hash || null);
      if (!outcome.ok) {
        toast.error('云端刚被其他设备更新，请刷新待审列表后重试');
        return;
      }
      setPending(rest);
      setMessage('已驳回 ' + item.by + ' 的修订');
    } catch (e) {
      toast.error('驳回失败：' + toSyncMessage(e));
    }
  }, [config, pending]);

  const reconcileNow = useCallback(() => {
    if (config) return reconcile(config);
  }, [config, reconcile]);

  const resolveConflictKeepLocal = useCallback(() => {
    if (config) return doPush(config);
  }, [config, doPush]);

  const resolveConflictKeepCloud = useCallback(() => {
    if (config) return doPull(config);
  }, [config, doPull]);

  return {
    config,
    status,
    action,
    lastSyncAt,
    message,
    saveConfig: handleSaveConfig,
    clearConfig: handleClearConfig,
    push,
    pull,
    reconcileNow,
    pending,
    submitForReview,
    refreshPending,
    approvePending,
    rejectPending,
    resolveConflictKeepLocal,
    resolveConflictKeepCloud,
  };
}
