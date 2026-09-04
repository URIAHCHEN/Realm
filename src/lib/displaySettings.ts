// 显示与个性化设置：主题配色、数据可视化规则、字段显示、同步频率、导出样式

export type ThemeColor = 'blue' | 'purple' | 'teal' | 'pink' | 'orange';
export type DataBarMode = 'ratio' | 'vsAvg';
export type HeatmapMode = 'rank' | 'score';
export type ExportStyle = 'gradient' | 'minimal' | 'dark';

export interface DisplaySettings {
  themeColor: ThemeColor;
  showDataBars: boolean;
  dataBarMode: DataBarMode;
  showRankHeatmap: boolean;
  heatmapMode: HeatmapMode;
  hiddenColumns: string[];
  syncIntervalSec: number;
  exportStyle: ExportStyle;
}

export const COLUMN_LABELS: { id: string; label: string; always?: boolean }[] = [
  { id: 'rank', label: '排名', always: true },
  { id: 'name', label: '姓名', always: true },
  { id: 'seasons', label: '学习轨迹' },
  { id: 'attendance', label: '考勤' },
  { id: 'homework', label: '书面作业' },
  { id: 'listening', label: '课后任务' },
  { id: 'note', label: '备注' },
  { id: 'scores', label: '题型得分', always: true },
  { id: 'total', label: '总分', always: true },
  { id: 'correctRate', label: '正确率' },
  { id: 'weakPoints', label: '薄弱项' },
  { id: 'actions', label: '操作' },
];

export const THEME_PRESETS: { id: ThemeColor; name: string; accent: string; accentStrong: string; rgb: string; pageFrom: string; pageTo: string }[] = [
  { id: 'blue', name: '海洋蓝', accent: '#0a84ff', accentStrong: '#0060df', rgb: '10 132 255', pageFrom: '#f5f7fa', pageTo: '#e8ecf1' },
  { id: 'purple', name: '星云紫', accent: '#7c5cff', accentStrong: '#5f3ee8', rgb: '124 92 255', pageFrom: '#f7f6fc', pageTo: '#ece9f5' },
  { id: 'teal', name: '青屿绿', accent: '#0fb5ae', accentStrong: '#0d8f89', rgb: '15 181 174', pageFrom: '#f4faf9', pageTo: '#e4f0ee' },
  { id: 'pink', name: '晨曦粉', accent: '#ff4d7d', accentStrong: '#e0335f', rgb: '255 77 125', pageFrom: '#fdf6f8', pageTo: '#f4e7ec' },
  { id: 'orange', name: '暖阳橙', accent: '#ff8c1a', accentStrong: '#e07700', rgb: '255 140 26', pageFrom: '#fdf8f3', pageTo: '#f3ebe0' },
];

const STORAGE_KEY = 'displaySettings';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  themeColor: 'blue',
  showDataBars: true,
  dataBarMode: 'ratio',
  showRankHeatmap: true,
  heatmapMode: 'rank',
  hiddenColumns: [],
  syncIntervalSec: 3,
  exportStyle: 'gradient',
};

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_DISPLAY_SETTINGS };
}

export function saveDisplaySettings(settings: DisplaySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getSyncIntervalSec(): number {
  const s = loadDisplaySettings();
  return s.syncIntervalSec >= 1 ? s.syncIntervalSec : 3;
}

// 将主题写入 CSS 变量（macOS 26 质感配色体系）
export function applyTheme(settings: DisplaySettings) {
  const preset = THEME_PRESETS.find(p => p.id === settings.themeColor) || THEME_PRESETS[0];
  const root = document.documentElement;
  root.style.setProperty('--brand', preset.accent);
  root.style.setProperty('--brand-strong', preset.accentStrong);
  root.style.setProperty('--brand-rgb', preset.rgb);
  root.style.setProperty('--page-from', preset.pageFrom);
  root.style.setProperty('--page-to', preset.pageTo);
}

export function isColumnVisible(settings: DisplaySettings, columnId: string): boolean {
  return !settings.hiddenColumns.includes(columnId);
}
