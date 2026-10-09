// 入门测趋势 · 导出图模板（2026-10-09 重构）
//
// 为什么要独立模板：原实现直接 html2canvas 截取界面卡片，带来三类问题 ——
//  ① 「导出图片」按钮被一起截进图里；
//  ② 卡片里的 truncate 副标题被 html2canvas 按错误的行盒基线绘制，字形下半截被裁掉（"字体异常"）；
//  ③ 半透明卡片 + 应用内排版，做单张分享图不够好看、信息也不够全。
// 现在改为离屏 HTML（内联样式 + 手写 SVG 折线图）→ html2canvas。
// 好处：行高/内边距/字体全部自控（不会裁字）、字体栈显式声明（不会回退到衬线）、
// 结构可设计成真正的"报表图"（标题块 + 数据表 + 折线图 + 页脚口径）。
import { CHART_FONT_FAMILY, CHART_GOOD, CHART_WARN, CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartTheme';

export interface TrendExportRow {
  lesson: number;
  /** 本人正确率 % */
  rate: number;
  /** 班级最高正确率 % */
  classMax: number;
  /** 班级平均正确率 % */
  classAvg: number;
  /** 个人名次（当次） */
  rank: number;
  /** 当次班级人数 */
  size: number;
}

export interface TrendExportInput {
  nickname: string;
  className: string;
  /** 满分（取最新课次的小测满分） */
  fullScore: number;
  rows: TrendExportRow[];
  /** 生成时间 */
  generatedAt: Date;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => `${round1(n)}%`;

/** 正确率分档配色（与学情表/报告口径一致：≥80 绿 / ≥60 琥珀 / <60 玫红） */
const rateColor = (v: number) => (v >= 80 ? '#047857' : v >= 60 ? '#b45309' : '#be123c');

// ── SVG 折线图（手写，避免任何布局/字体回退问题）──────────────
function buildChartSVG(rows: TrendExportRow[]): string {
  const W = 1140;
  const H = 430;
  const padL = 58, padR = 26, padT = 24, padB = 76;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(rows.length, 1);
  const x = (i: number) => padL + ((i + 0.5) / n) * plotW;
  const y = (rate: number) => padT + ((100 - Math.max(0, Math.min(100, rate))) / 100) * plotH;

  const parts: string[] = [];
  // 网格 + Y 轴刻度
  [0, 25, 50, 75, 100].forEach(v => {
    const yy = y(v);
    parts.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#eef2f7" stroke-dasharray="3 3" />`);
    parts.push(`<text x="${padL - 12}" y="${yy}" text-anchor="end" dominant-baseline="central" font-size="12" fill="#94a3b8" font-family='${CHART_FONT_FAMILY}'>${v}%</text>`);
  });
  // 达标 / 优秀参考线
  const ref = (v: number, color: string, label: string) =>
    `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="5 5" />` +
    `<text x="${W - padR - 6}" y="${y(v) - 7}" text-anchor="end" font-size="11.5" font-weight="600" fill="${color}" font-family='${CHART_FONT_FAMILY}'>${label}</text>`;
  parts.push(ref(85, CHART_GOOD, '优秀线 85%'));
  parts.push(ref(60, CHART_WARN, '及格线 60%'));

  // 三条折线
  const series: { key: 'classMax' | 'classAvg' | 'rate'; color: string; width: number; dash?: string; dot: number }[] = [
    { key: 'classMax', color: CHART_NEUTRAL, width: 1.8, dash: '6 4', dot: 0 },
    { key: 'classAvg', color: CHART_WARN, width: 2.2, dash: undefined, dot: 4 },
    { key: 'rate', color: CHART_SERIES[0], width: 3, dash: undefined, dot: 5.5 },
  ];
  series.forEach(s => {
    const pts = rows.map((r, i) => `${round1(x(i))},${round1(y(r[s.key]))}`).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" />`);
    if (s.dot > 0) {
      rows.forEach((r, i) => {
        parts.push(`<circle cx="${round1(x(i))}" cy="${round1(y(r[s.key]))}" r="${s.dot}" fill="#ffffff" stroke="${s.color}" stroke-width="2.4" />`);
      });
    }
  });

  // 本人正确率数值标签（上/下自动避让）
  rows.forEach((r, i) => {
    const cx = x(i), cy = y(r.rate);
    const below = cy < padT + 26;
    parts.push(`<text x="${round1(cx)}" y="${round1(below ? cy + 24 : cy - 14)}" text-anchor="middle" font-size="13" font-weight="700" fill="${CHART_SERIES[0]}" font-family='${CHART_FONT_FAMILY}'>${pct(r.rate)}</text>`);
  });

  // X 轴课次 + 名次行（名次变化用箭头，颜色区分进步/退步）
  rows.forEach((r, i) => {
    const cx = x(i);
    parts.push(`<text x="${round1(cx)}" y="${padT + plotH + 26}" text-anchor="middle" font-size="12.5" fill="#64748b" font-family='${CHART_FONT_FAMILY}'>第${r.lesson}次</text>`);
    const prev = i > 0 ? rows[i - 1].rank : null;
    const arrow = prev == null ? '' : r.rank < prev ? ' ↑' : r.rank > prev ? ' ↓' : ' →';
    const arrowColor = prev == null ? '#64748b' : r.rank < prev ? '#047857' : r.rank > prev ? '#be123c' : '#94a3b8';
    parts.push(`<text x="${round1(cx)}" y="${padT + plotH + 48}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${arrowColor}" font-family='${CHART_FONT_FAMILY}'>${r.rank}/${r.size}${arrow}</text>`);
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="入门测正确率趋势折线图">${parts.join('')}</svg>`;
}

/** 生成「入门测趋势」导出图 HTML（离屏渲染用，宽度 1200px） */
export function buildTrendExportHTML(input: TrendExportInput): string {
  const { nickname, className, fullScore, rows, generatedAt } = input;
  const timeText = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;
  const rowsHtml = [
    { label: `${nickname}正确率`, bold: true, get: (r: TrendExportRow) => pct(r.rate), color: (v: number) => rateColor(v), val: (r: TrendExportRow) => r.rate },
    { label: '班级最高正确率', bold: false, get: (r: TrendExportRow) => pct(r.classMax), color: () => '#475569', val: (r: TrendExportRow) => r.classMax },
    { label: '班级平均正确率', bold: false, get: (r: TrendExportRow) => pct(r.classAvg), color: () => '#475569', val: (r: TrendExportRow) => r.classAvg },
  ].map((row, ri) => `
      <tr style="${ri === 0 ? 'background:#f2f7ff;' : ''}">
        <td style="padding:11px 14px;text-align:left;font-size:13px;${row.bold ? 'font-weight:700;color:#1f2937;' : 'color:#475569;'}">${esc(row.label)}</td>
        ${rows.map(r => `<td style="padding:11px 14px;text-align:center;font-size:13.5px;font-weight:700;color:${row.color(row.val(r))};font-variant-numeric:tabular-nums;">${row.get(r)}</td>`).join('')}
      </tr>`).join('') + `
      <tr>
        <td style="padding:11px 14px;text-align:left;font-size:13px;color:#475569;">我的排名 / 班级人数</td>
        ${rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].rank : null;
          const color = prev == null ? '#334155' : r.rank < prev ? '#047857' : r.rank > prev ? '#be123c' : '#334155';
          const arrow = prev == null ? '' : r.rank < prev ? ' ↑' : r.rank > prev ? ' ↓' : '';
          return `<td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:${color};font-variant-numeric:tabular-nums;">${r.rank}/${r.size}${arrow}</td>`;
        }).join('')}
      </tr>`;

  return `<div style="width:1200px;box-sizing:border-box;background:#ffffff;padding:34px 36px 26px;font-family:${CHART_FONT_FAMILY};color:#1f2937;">
  <div style="height:5px;border-radius:999px;background:linear-gradient(90deg,#0a84ff,#5ac8fa);"></div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:20px 0 4px;">
    <div>
      <div style="font-size:23px;font-weight:800;letter-spacing:.3px;line-height:1.25;">入门测趋势</div>
      <div style="margin-top:6px;font-size:13px;color:#64748b;line-height:1.5;">${esc(nickname)} · ${esc(className)} · 共 ${rows.length} 次 · 满分 ${round1(fullScore)} 分</div>
    </div>
    <div style="font-size:12px;color:#94a3b8;line-height:1.6;text-align:right;">正确率 = 得分 ÷ 当次满分<br/>请假 / 缺勤课次不计入</div>
  </div>
  <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:18px;border:1px solid #e6ecf5;border-radius:14px;overflow:hidden;">
    <thead>
      <tr style="background:#f7f9fc;">
        <th style="padding:11px 14px;text-align:left;font-size:12.5px;font-weight:700;color:#475569;">指标</th>
        ${rows.map(r => `<th style="padding:11px 14px;text-align:center;font-size:12.5px;font-weight:700;color:#475569;">第${r.lesson}次</th>`).join('')}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="margin-top:22px;">${buildChartSVG(rows)}</div>
  <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-top:2px;font-size:12.5px;color:#475569;">
    <span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:22px;height:0;border-top:2px dashed ${CHART_NEUTRAL};display:inline-block;"></span>班级最高</span>
    <span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:22px;height:3px;background:${CHART_WARN};border-radius:2px;display:inline-block;"></span>班级平均</span>
    <span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:22px;height:3px;background:${CHART_SERIES[0]};border-radius:2px;display:inline-block;"></span>${esc(nickname)}正确率</span>
  </div>
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #eef2f7;display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#94a3b8;">
    <span>学情记录系统 · 入门测趋势</span>
    <span>生成于 ${timeText}</span>
  </div>
</div>`;
}
