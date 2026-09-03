import { useCallback, useEffect, useState } from 'react';
import {
  type DisplaySettings,
  applyTheme,
  loadDisplaySettings,
  saveDisplaySettings,
} from '@/lib/displaySettings';

export function useDisplaySettings() {
  const [settings, setSettings] = useState<DisplaySettings>(() => loadDisplaySettings());

  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveDisplaySettings(next);
      return next;
    });
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    setSettings(prev => {
      const hidden = prev.hiddenColumns.includes(columnId)
        ? prev.hiddenColumns.filter(c => c !== columnId)
        : [...prev.hiddenColumns, columnId];
      const next = { ...prev, hiddenColumns: hidden };
      saveDisplaySettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(prev => {
      // 恢复默认（保留同步频率，避免误改同步节奏）
      const merged: DisplaySettings = {
        themeColor: 'blue',
        showDataBars: true,
        dataBarMode: 'ratio',
        showRankHeatmap: true,
        heatmapMode: 'rank',
        hiddenColumns: [],
        exportStyle: 'gradient',
        syncIntervalSec: prev.syncIntervalSec,
      };
      saveDisplaySettings(merged);
      return merged;
    });
  }, []);

  return { settings, update, toggleColumn, reset };
}
