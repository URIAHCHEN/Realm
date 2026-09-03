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

interface UseCloudSyncOptions {
  snapshot: SyncSnapshot;
  onImport: (snapshot: SyncSnapshot) => void;
  /** 是否已登录：RLS 收紧后需携带用户 JWT，未登录时不做对账/自动推送 */
  enabled: boolean;
  /** 当前登录账号标识；变化时重新对账（切换账号场景） */
  sessionKey?: string | null;
}

export type SyncAction = 'idle' | 'pushing' | 'pulling';

export function useCloudSync({ snapshot, onImport, enabled, sessionKey }: UseCloudSyncOptions) {
  const [config, setConfig] = useState<CloudSyncConfig | null>(() => loadSyncConfig());
  const [status, setStatus] = useState<CloudSyncStatus>('unconfigured');
  const [action, setAction] = useState<SyncAction>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [message, setMessage] = useState<string>('');

  const statusRef = useRef<CloudSyncStatus>('unconfigured');
  const snapshotRef = useRef(snapshot);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPush = useRef(false);

  snapshotRef.current = snapshot;

  const doPush = useCallback(async (cfg: CloudSyncConfig, silent = false) => {
    setAction('pushing');
    try {
      await pushSnapshot(cfg, snapshotRef.current);
      const meta = { lastPushedAt: Date.now(), lastPushedHash: hashSnapshot(snapshotRef.current) };
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
      setMessage(e instanceof Error ? e.message : String(e));
      if (!silent) toast.error('云端上传失败：' + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      setAction('idle');
    }
  }, []);

  const doPull = useCallback(async (cfg: CloudSyncConfig, silent = false) => {
    setAction('pulling');
    try {
      const cloud = await fetchCloudState(cfg);
      if (!cloud.snapshot) {
        if (!silent) toast.info('云端还没有数据，先上传一份吧');
        return false;
      }
      suppressPush.current = true;
      onImport(cloud.snapshot);
      const meta = { lastPushedAt: Date.now(), lastPushedHash: hashSnapshot(cloud.snapshot) };
      saveSyncMeta(meta);
      setLastSyncAt(meta.lastPushedAt);
      setStatus('connected');
      statusRef.current = 'connected';
      setMessage('已从云端拉取最新数据');
      if (!silent) toast.success('已从云端拉取最新数据 📥');
      return true;
    } catch (e) {
      setStatus('error');
      statusRef.current = 'error';
      setMessage(e instanceof Error ? e.message : String(e));
      if (!silent) toast.error('云端拉取失败：' + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      setAction('idle');
    }
  }, [onImport]);

  // 启动时对比本地与云端，自动决定同步方向
  const reconcile = useCallback(async (cfg: CloudSyncConfig) => {
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
          setStatus('connected');
          statusRef.current = 'connected';
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

      const localChanged = localHash !== meta.lastPushedHash;
      const cloudChanged = cloud.hash !== meta.lastPushedHash;

      if (!localChanged && !cloudChanged) {
        setStatus('connected');
        statusRef.current = 'connected';
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
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [doPush, doPull]);

  // 登录后对账：enabled 变 true 或切换账号时重新对账（此时已携带用户 JWT，可过 RLS）
  useEffect(() => {
    if (config && enabled) {
      reconcile(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionKey]);

  // 数据变更：自动同步（防抖，间隔可在设置中调整），仅登录后、连接正常且无冲突时
  useEffect(() => {
    if (!enabled) return;
    if (!config || !config.autoSync) return;
    if (statusRef.current !== 'connected') return;
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
  }, [snapshot, config, doPush, enabled]);

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
    resolveConflictKeepLocal,
    resolveConflictKeepCloud,
  };
}
