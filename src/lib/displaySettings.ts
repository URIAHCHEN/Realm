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
  /** 学习轨迹（四季）列：true=全部显示未选标灰；false=仅显示已选 */
  showAllSeasons: boolean;
  /** 自动隐藏「本课无数据」的题型/自定义列：导入的表格里没出现的题就不用占一列 */
  autoHideEmptyColumns: boolean;
  hiddenColumns: string[];
  syncIntervalSec: number;
  exportStyle: ExportStyle;
}

export const COLUMN_LABELS: { id: string; label: string; always?: boolean }[] = [
  { id: 'rank', label: '排名', always: true },
  { id: 'name', label: '姓名', always: true },
  { id: 'seasons', label: '学习轨迹' },
  { id: 'attendance', label: '考勤' },
  { id: 'classPerformance', label: '课堂表现' },
  { id: 'homework', label: '课堂练习' },
  { id: 'listening', label: '课后任务' },
  { id: 'note', label: '备注' },
  { id: 'scores', label: '题型得分', always: true },
  { id: 'total', label: '总分', always: true },
  { id: 'correctRate', label: '正确率' },
  { id: 'weakPoints', label: '薄弱项' },
  { id: 'actions', label: '操作' },
];

/** layout 决定 App.css 里 [data-theme='xxx'] 的版式块：不只是换色，排版/圆角/分隔线一并变化 */
export const THEME_PRESETS: { id: ThemeColor; name: string; accent: string; accentStrong: string; rgb: string; pageFrom: string; pageTo: string; layout?: string }[] = [
  { id: 'blue', name: '海洋蓝', accent: '#0a84ff', accentStrong: '#0060df', rgb: '10 132 255', pageFrom: '#f5f7fa', pageTo: '#e8ecf1' },
  { id: 'purple', name: '星云紫', accent: '#7c5cff', accentStrong: '#5f3ee8', rgb: '124 92 255', pageFrom: '#f7f6fc', pageTo: '#ece9f5' },
  { id: 'teal', name: '青屿绿', accent: '#0fb5ae', accentStrong: '#0d8f89', rgb: '15 181 174', pageFrom: '#f4faf9', pageTo: '#e4f0ee' },
  { id: 'pink', name: '晨曦粉', accent: '#ff4d7d', accentStrong: '#e0335f', rgb: '255 77 125', pageFrom: '#fdf6f8', pageTo: '#f4e7ec' },
  { id: 'orange', name: '暖阳橙', accent: '#ff8c1a', accentStrong: '#e07700', rgb: '255 140 26', pageFrom: '#fdf8f3', pageTo: '#f3ebe0' },
  // ===== 2026-10-07 新增：版式级差异（不只是颜色）=====
  { id: 'ink' as ThemeColor, name: '墨黑 · 深色顶栏', accent: '#111827', accentStrong: '#030712', rgb: '17 24 39', pageFrom: '#f3f4f6', pageTo: '#e5e7eb', layout: 'ink' },
  { id: 'editorial' as ThemeColor, name: '报刊 · 衬线直角', accent: '#1f2937', accentStrong: '#111827', rgb: '31 41 55', pageFrom: '#faf9f6', pageTo: '#f3f1ea', layout: 'editorial' },
  { id: 'candy' as ThemeColor, name: '糖果 · 大圆角', accent: '#f472b6', accentStrong: '#db2777', rgb: '244 114 182', pageFrom: '#fff7fb', pageTo: '#f5f3ff', layout: 'candy' },
  { id: 'mono' as ThemeColor, name: '极简 · 等宽无框', accent: '#0f766e', accentStrong: '#115e59', rgb: '15 118 110', pageFrom: '#f8fafc', pageTo: '#f1f5f9', layout: 'mono' },
];

const STORAGE_KEY = 'displaySettings';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  themeColor: 'blue',
  showDataBars: true,
  dataBarMode: 'ratio',
  showRankHeatmap: true,
  heatmapMode: 'rank',
  showAllSeasons: true,
  autoHideEmptyColumns: true,
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[display] 设置写入失败，刷新后可能回退默认值', e);
  }
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
  // 版式标记：App.css 的 [data-theme='xxx'] 负责排版级差异
  root.setAttribute('data-theme', (preset as { layout?: string }).layout || 'default');
}

export function isColumnVisible(settings: DisplaySettings, columnId: string): boolean {
  return !settings.hiddenColumns.includes(columnId);
}
