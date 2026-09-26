import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  type CloudSyncConfig,
  type CloudSyncStatus,
  type SyncSnapshot,
  fetchCloudState,
  hashSnapshot,
  loadSyncConfig,
  loadSyncMeta,
  pushSnapshot,
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
  snapshot: SyncSnapshot;
  onImport: (snapshot: SyncSnapshot) => void;
  /** 是否已登录：RLS 收紧后需携带用户 JWT，未登录时不做对账/自动推送 */
  enabled: boolean;
  /** 当前登录账号标识；变化时重新对账（切换账号场景） */
  sessionKey?: string | null;
  /** 是否在可写名单内：false 时只读，不向云端推送 */
  canWrite?: boolean;
}

export type SyncAction = 'idle' | 'pushing' | 'pulling';

export function useCloudSync({ snapshot, onImport, enabled, sessionKey, canWrite = true }: UseCloudSyncOptions) {
  const [config, setConfig] = useState<CloudSyncConfig | null>(() => loadSyncConfig());
  const [status, setStatus] = useState<CloudSyncStatus>('unconfigured');
  const [action, setAction] = useState<SyncAction>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [message, setMessage] = useState<string>('');

  const statusRef = useRef<CloudSyncStatus>('unconfigured');
  const snapshotRef = useRef(snapshot);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPush = useRef(false);
  /** 导入（拉取/冲突解决）后，等待"落地后的本地快照"来校准 lastPushedHash */
  const pendingImportHash = useRef(false);
  /** reconcile 互斥：focus 与 visibilitychange 会几乎同时触发，避免并发对账 */
  const reconciling = useRef(false);

  snapshotRef.current = snapshot;

  const doPush = useCallback(async (cfg: CloudSyncConfig, silent = false) => {
    if (!canWrite) {
      setStatus('readonly');
      statusRef.current = 'readonly';
      setMessage('当前为只读：未列入可写名单');
      if (!silent) toast.info('你尚未被加入可写名单，改动只保存在本地');
      return false;
    }
    setAction('pushing');
    try {
      // 关键：固定"本次真正上传的那份快照"。
      // 若在上传途中继续录分，snapshotRef.current 会变成新内容；
      // 用新内容当 lastPushedHash 会让下次对账误判"云端有更新"→ 拉取覆盖刚录的分数。
      const pushed = snapshotRef.current;
      await pushSnapshot(cfg, pushed);
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
    if (reconciling.current) return;
    reconciling.current = true;
    setStatus('connecting');
    try {
      const cloud = await fetchCloudState(cfg);
      const meta = loadSyncMeta();
      const localHash = hashSnapshot(snapshotRef.current);

      if (!cloud.snapshot) {
        // 云端为空：本地有数据则上传
        if (Object.keys(snapshotRef.current.classes || {}).length > 0) {
          await doPush(cfg, true);
        } else {
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
    }
  }, [doPush, doPull, canWrite]);

  // 登录后对账：enabled 变 true、切换账号或权限变化时重新对账（此时已携带用户 JWT，可过 RLS）
  useEffect(() => {
    if (config && enabled) {
      reconcile(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionKey, canWrite]);

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
  }, [snapshot, config, doPush, enabled, canWrite]);

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
    resolveConflictKeepLocal,
    resolveConflictKeepCloud,
  };
}
