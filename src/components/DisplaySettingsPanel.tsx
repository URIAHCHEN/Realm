import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Palette, BarChart3, Columns3, FileDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLUMN_LABELS, THEME_PRESETS } from '@/lib/displaySettings';
import type { useDisplaySettings } from '@/hooks/useDisplaySettings';

type Display = ReturnType<typeof useDisplaySettings>;

const swatchStyle = (rgb: string) => ({
  background: `linear-gradient(135deg, rgb(${rgb}) 0%, rgb(${rgb} / 0.75) 100%)`,
});

/** 统一的设置分区卡片：标题 + 内容，保证各分区尺寸与留白一致 */
function SectionCard(
  { icon, title, desc, className, children }:
  { icon: ReactNode; title: string; desc?: string; className?: string; children: ReactNode }
) {
  return (
    <Card className={`ios-glass-card border-0 h-full ${className || ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-[color:var(--ink)]">
          <span className="w-5 h-5 inline-flex items-center justify-center" style={{ color: 'var(--brand)' }}>{icon}</span>
          {title}
        </CardTitle>
        {desc && <p className="text-xs text-[color:var(--ink-4)] mt-1">{desc}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** 单行设置项：左文右控件，行高与内边距统一 */
function SettingRow({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--r-md)] bg-black/[0.04] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-black/[0.07]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[color:var(--ink)]">{title}</p>
        <p className="text-xs text-[color:var(--ink-4)]">{desc}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

const SELECT_TRIGGER = 'w-32 h-9 text-sm rounded-[var(--r-md)]';

export function DisplaySettingsPanel({ display }: { display: Display }) {
  const { settings, update, toggleColumn, reset } = display;

  return (
    <div className="space-y-5">
      {/* 平铺两列：主题配色 / 数据可视化 */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <SectionCard icon={<Palette className="w-4 h-4" />} title="主题配色" desc="影响全站强调色，切换即时生效">
          <div className="flex flex-wrap gap-2.5">
            {THEME_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => update({ themeColor: p.id })}
                className={`flex items-center gap-2 h-9 rounded-[var(--r-md)] px-3 text-sm font-medium transition-all border ${
                  settings.themeColor === p.id
                    ? 'border-[rgb(var(--brand-rgb)/0.5)] bg-[rgb(var(--brand-rgb)/0.08)] shadow-sm'
                    : 'border-black/8 bg-white/60 hover:bg-white'
                }`}
              >
                <span className="w-5 h-5 rounded-full shadow-inner" style={swatchStyle(p.rgb)} />
                {p.name}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={<BarChart3 className="w-4 h-4" />} title="数据可视化" desc="学情表内数据条与色阶规则">
          <div className="space-y-2">
            <SettingRow title="题型得分数据条" desc="得分单元格内渲染比例数据条">
              <Switch aria-label="题型得分数据条" checked={settings.showDataBars} onCheckedChange={v => update({ showDataBars: v })} />
            </SettingRow>
            <SettingRow title="数据条规则" desc="条长按满分占比或与班均差距计算">
              <Select value={settings.dataBarMode} onValueChange={v => update({ dataBarMode: v as never })}>
                <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ratio">占满分比例</SelectItem>
                  <SelectItem value="vsAvg">对比班均</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="排名色阶" desc="排名与正确率徽章自动变色">
              <Switch aria-label="排名色阶" checked={settings.showRankHeatmap} onCheckedChange={v => update({ showRankHeatmap: v })} />
            </SettingRow>
            <SettingRow title="色阶规则" desc="按名次金银铜或按分数四档色阶">
              <Select value={settings.heatmapMode} onValueChange={v => update({ heatmapMode: v as never })}>
                <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rank">按名次（前三名）</SelectItem>
                  <SelectItem value="score">按分数色阶</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="学习轨迹显示未选季度" desc="开启则四季都显示、未选标灰">
              <Switch aria-label="学习轨迹显示未选季度" checked={settings.showAllSeasons} onCheckedChange={v => update({ showAllSeasons: v })} />
            </SettingRow>
          </div>
        </SectionCard>
      </div>

      {/* 全宽：表格字段显示 / 隐藏 */}
      <SectionCard
        icon={<Columns3 className="w-4 h-4" />}
        title="表格字段显示 / 隐藏"
        desc="带 · 的字段始终显示；点击其他字段可切换显隐，设置即时生效"
      >
        <div className="flex flex-wrap gap-2">
          {COLUMN_LABELS.map(c => {
            const disabled = !!c.always;
            const hidden = settings.hiddenColumns.includes(c.id);
            return (
              <button
                key={c.id}
                disabled={disabled}
                onClick={() => toggleColumn(c.id)}
                title={disabled ? '该字段始终显示' : '点击切换显示'}
                className={`h-8 rounded-full px-3 text-sm font-medium border transition-all ${
                  disabled
                    ? 'border-black/8 bg-black/[0.05] text-[color:var(--ink-4)] cursor-not-allowed'
                    : hidden
                      ? 'border-dashed border-black/15 bg-white/40 text-[color:var(--ink-4)] line-through'
                      : 'border-[rgb(var(--brand-rgb)/0.35)] bg-[rgb(var(--brand-rgb)/0.08)]'
                }`}
                style={!disabled && !hidden ? { color: 'var(--brand)' } : undefined}
              >
                {c.label}{disabled && ' ·'}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* 全宽：公示导出样式 */}
      <SectionCard icon={<FileDown className="w-4 h-4" />} title="公示导出样式" desc="生成公示图片 / HTML 时使用的配色方案">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: 'gradient', name: '渐变大气', desc: '蓝紫渐变头部，适合大屏展示', preview: 'linear-gradient(135deg,#667eea,#764ba2)' },
            { id: 'minimal', name: '极简清爽', desc: '白底细边框，适合打印张贴', preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
            { id: 'dark', name: '深邃暗色', desc: '深色卡片，适合投屏公示', preview: 'linear-gradient(135deg,#1e293b,#0f172a)' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => update({ exportStyle: s.id as never })}
              className={`rounded-[var(--r-md)] overflow-hidden border text-left transition-all ${
                settings.exportStyle === s.id
                  ? 'border-[rgb(var(--brand-rgb)/0.5)] shadow-md'
                  : 'border-black/8 hover:border-black/20'
              }`}
            >
              <span className="block h-10 w-full" style={{ background: s.preview }} />
              <span className="block px-3.5 py-2.5 bg-white/70">
                <span className="block text-sm font-semibold text-[color:var(--ink)]">{s.name}</span>
                <span className="block text-xs text-[color:var(--ink-4)]">{s.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 rounded-[var(--r-md)] gap-1.5 text-[color:var(--ink-4)]"
          onClick={() => { reset(); toast.success('已恢复默认显示设置'); }}
        >
          <RotateCcw className="w-4 h-4" />
          恢复默认
        </Button>
      </div>
    </div>
  );
}
