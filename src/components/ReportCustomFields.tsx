import type { StudentRecord, CustomField } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SlidersHorizontal } from 'lucide-react';

interface ReportCustomFieldsProps {
  records: StudentRecord[];
  customFields: CustomField[];
}

/** 报告的“自定义维度”小节：分数型显示均值/满分与占比条；选项型显示分布 */
export function ReportCustomFields({ records, customFields }: ReportCustomFieldsProps) {
  if (!customFields || customFields.length === 0 || records.length === 0) return null;

  const stats = [...customFields]
    .sort((a, b) => a.order - b.order)
    .map(cf => {
      const vals = records
        .map(r => r.customValues?.[cf.id])
        .filter((v): v is string | number => v !== '' && v != null);
      if (cf.kind === 'number') {
        const nums = vals.map(v => Number(v)).filter(n => !isNaN(n));
        const avg = nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : 0;
        const max = cf.fullScore ?? 0;
        return { cf, kind: 'number' as const, avg, max, count: nums.length };
      }
      const dist: Record<string, number> = {};
      vals.forEach(v => { const k = String(v); dist[k] = (dist[k] || 0) + 1; });
      return { cf, kind: 'select' as const, dist, count: vals.length };
    })
    .filter(s => s.count > 0);

  if (stats.length === 0) return null;

  return (
    <Card className="mb-6 liquid-glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <SlidersHorizontal className="w-5 h-5 text-[color:var(--brand)]" />自定义维度
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.cf.id} className="rounded-[var(--r-lg)] bg-black/[0.04] p-3">
            <div className="text-xs text-[color:var(--ink-4)] mb-1 flex items-center justify-between">
              <span className="truncate">{s.cf.name}</span>
              <span className="shrink-0 ml-2">{s.count} 条</span>
            </div>
            {s.kind === 'number' ? (
              <>
                <div className="text-2xl font-bold text-[color:var(--brand)]">
                  {s.avg}{s.max ? <span className="text-sm font-medium text-[color:var(--ink-4)]">/{s.max}</span> : null}
                </div>
                {s.max > 0 && (
                  <div className="h-1.5 rounded-full bg-black/10 overflow-hidden mt-2">
                    <div className="h-full bg-[color:var(--brand)]" style={{ width: `${Math.min(100, (s.avg / s.max) * 100)}%` }} />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(s.dist)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)]">
                      {k}<span className="opacity-70">×{v}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
