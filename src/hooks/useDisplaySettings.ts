import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  type DisplaySettings,
  applyTheme,
  loadDisplaySettings,
  saveDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
} from '@/lib/displaySettings';

// 全局共享的显示设置 store：多个组件各自调用 useDisplaySettings 时读到同一份状态，
// 任一处 update/toggleColumn/reset 后所有订阅者立即重渲染（设置即时生效，无需刷新页面）。
let current: DisplaySettings = loadDisplaySettings();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot(): DisplaySettings {
  return current;
}
function commit(next: DisplaySettings) {
  current = next;
  saveDisplaySettings(next);
  applyTheme(next);
  listeners.forEach(l => l());
}

export function useDisplaySettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 首挂载时确保主题变量已注入（多实例/路由切换场景）
  useEffect(() => {
    applyTheme(current);
  }, []);

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    commit({ ...current, ...patch });
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    const hidden = current.hiddenColumns.includes(columnId)
      ? current.hiddenColumns.filter(c => c !== columnId)
      : [...current.hiddenColumns, columnId];
    commit({ ...current, hiddenColumns: hidden });
  }, []);

  const reset = useCallback(() => {
    commit({
      ...DEFAULT_DISPLAY_SETTINGS,
      syncIntervalSec: current.syncIntervalSec,
    });
  }, []);

  return { settings, update, toggleColumn, reset };
}
