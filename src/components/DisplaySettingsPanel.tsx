import { toast } from 'sonner';
import { Palette, BarChart3, Columns3, FileDown, RotateCcw, Sparkles } from 'lucide-react';
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

export function DisplaySettingsPanel({ display }: { display: Display }) {
  const { settings, update, toggleColumn, reset } = display;

  return (
    <Card className="ios-glass-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[#1c1c1e]">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          个性化设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 主题配色 */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-[#3a3a3c] flex items-center gap-1.5">
            <Palette className="w-4 h-4" />主题配色
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {THEME_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => update({ themeColor: p.id })}
                className={`flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition-all duration-300 border ${
                  settings.themeColor === p.id
                    ? 'border-[rgb(var(--brand-rgb)/0.5)] bg-[rgb(var(--brand-rgb)/0.08)] shadow-sm scale-[1.03]'
                    : 'border-black/8 bg-white/60 hover:bg-white'
                }`}
              >
                <span className="w-5 h-5 rounded-full shadow-inner" style={swatchStyle(p.rgb)} />
                {p.name}
              </button>
            ))}
          </div>
        </section>

        {/* 数据可视化 */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-[#3a3a3c] flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />数据可视化
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-[#f2f2f7] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">题型得分数据条</p>
                <p className="text-xs text-[#8e8e93]">得分单元格内渲染比例数据条</p>
              </div>
              <Switch checked={settings.showDataBars} onCheckedChange={v => update({ showDataBars: v })} />
            </div>
            <div className="rounded-2xl bg-[#f2f2f7] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">数据条规则</p>
                <p className="text-xs text-[#8e8e93]">条长按满分占比或与班均差距计算</p>
              </div>
              <Select value={settings.dataBarMode} onValueChange={v => update({ dataBarMode: v as never })}>
                <SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ratio">占满分比例</SelectItem>
                  <SelectItem value="vsAvg">对比班均</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-[#f2f2f7] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">排名色阶</p>
                <p className="text-xs text-[#8e8e93]">排名与正确率徽章自动变色</p>
              </div>
              <Switch checked={settings.showRankHeatmap} onCheckedChange={v => update({ showRankHeatmap: v })} />
            </div>
            <div className="rounded-2xl bg-[#f2f2f7] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">色阶规则</p>
                <p className="text-xs text-[#8e8e93]">按名次金银铜或按分数四档色阶</p>
              </div>
              <Select value={settings.heatmapMode} onValueChange={v => update({ heatmapMode: v as never })}>
                <SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rank">按名次（前三名）</SelectItem>
                  <SelectItem value="score">按分数色阶</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* 字段显示 */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-[#3a3a3c] flex items-center gap-1.5">
            <Columns3 className="w-4 h-4" />表格字段显示 / 隐藏
          </h3>
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
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-all ${
                    disabled
                      ? 'border-black/8 bg-[#f2f2f7] text-[#aeaeb2] cursor-not-allowed'
                      : hidden
                        ? 'border-dashed border-black/15 bg-white/40 text-[#aeaeb2] line-through'
                        : 'border-[rgb(var(--brand-rgb)/0.35)] bg-[rgb(var(--brand-rgb)/0.08)]'
                  }`}
                  style={!disabled && !hidden ? { color: 'var(--brand)' } : undefined}
                >
                  {c.label}{disabled && ' ·'}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#8e8e93]">带 · 的字段始终显示；点击其他字段可切换显隐，设置即时生效。</p>
        </section>

        {/* 导出样式 */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-[#3a3a3c] flex items-center gap-1.5">
            <FileDown className="w-4 h-4" />公示导出样式
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { id: 'gradient', name: '渐变大气', desc: '蓝紫渐变头部，适合大屏展示', preview: 'linear-gradient(135deg,#667eea,#764ba2)' },
              { id: 'minimal', name: '极简清爽', desc: '白底细边框，适合打印张贴', preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
              { id: 'dark', name: '深邃暗色', desc: '深色卡片，适合投屏公示', preview: 'linear-gradient(135deg,#1e293b,#0f172a)' },
            ].map(s => (
              <button
                key={s.id}
                onClick={() => update({ exportStyle: s.id as never })}
                className={`rounded-2xl overflow-hidden border text-left transition-all duration-300 ${
                  settings.exportStyle === s.id
                    ? 'border-[rgb(var(--brand-rgb)/0.5)] shadow-md scale-[1.02]'
                    : 'border-black/8 hover:border-black/20'
                }`}
              >
                <span className="block h-10 w-full" style={{ background: s.preview }} />
                <span className="block px-3.5 py-2.5 bg-white/70">
                  <span className="block text-sm font-semibold text-[#1c1c1e]">{s.name}</span>
                  <span className="block text-xs text-[#8e8e93]">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl gap-1.5 text-[#8e8e93]"
            onClick={() => { reset(); toast.success('已恢复默认显示设置'); }}
          >
            <RotateCcw className="w-4 h-4" />
            恢复默认
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
