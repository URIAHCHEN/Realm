// 公示导出：生成可直接发布/打印/投屏/截图的学情公示 HTML
// 排版策略：table-layout:fixed 固定列宽 + 全居中 + 等宽数字 + 统一徽章尺寸，保证截图整齐美观
import type { Class, QuestionType, StudentRecord } from '@/types';
import type { ExportStyle } from '@/lib/displaySettings';

interface Palette {
  pageBg: string;
  cardBg: string;
  bannerBg: string;
  bannerText: string;
  headBg: string;
  headText: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  rowBorder: string;
  altRowBg: string;
  track: string;
}

const PALETTES: Record<ExportStyle, Palette> = {
  // 模板同款蓝色系
  gradient: {
    pageBg: 'linear-gradient(135deg, #e8f1fd 0%, #d6e6fa 100%)',
    cardBg: '#ffffff',
    bannerBg: 'linear-gradient(135deg, #3b8beb 0%, #1e5fd6 100%)',
    bannerText: '#ffffff',
    headBg: '#1e5fd6',
    headText: '#ffffff',
    text: '#1f2937',
    muted: '#64748b',
    accent: '#2563eb',
    accentSoft: 'rgba(37,99,235,0.35)',
    rowBorder: '#e2e8f0',
    altRowBg: '#f7fafd',
    track: 'rgba(37,99,235,0.10)',
  },
  minimal: {
    pageBg: '#f5f6f8',
    cardBg: '#ffffff',
    bannerBg: '#f8fafc',
    bannerText: '#111827',
    headBg: '#334155',
    headText: '#ffffff',
    text: '#1f2937',
    muted: '#6b7280',
    accent: '#0a84ff',
    accentSoft: 'rgba(10,132,255,0.28)',
    rowBorder: '#e5e7eb',
    altRowBg: '#f9fafb',
    track: 'rgba(10,132,255,0.10)',
  },
  dark: {
    pageBg: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
    cardBg: '#1e293b',
    bannerBg: 'rgba(255,255,255,0.06)',
    bannerText: '#f1f5f9',
    headBg: 'rgba(255,255,255,0.10)',
    headText: '#f1f5f9',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#7dd3fc',
    accentSoft: 'rgba(125,211,252,0.30)',
    rowBorder: 'rgba(255,255,255,0.08)',
    altRowBg: 'rgba(255,255,255,0.03)',
    track: 'rgba(125,211,252,0.12)',
  },
};

const heat = (pct: number) => pct >= 85 ? '#16a34a' : pct >= 70 ? '#2563eb' : pct >= 55 ? '#d97706' : '#dc2626';
export { heat };

// 考勤状态 emoji 映射（对齐模板：准时👍/请假🕐 等）
const attendanceEmoji = (status: string): string => {
  if (status === '按时出勤') return '准时 👍';
  if (status === '迟到') return '迟到 ⏰';
  if (status === '请假') return '请假 🕐';
  if (status === '缺勤') return '缺勤 ❌';
  if (status === '调课') return '调课 🔄';
  return status;
};

// 课堂练习状态 emoji 映射（对齐模板：完成✅/按要求❗/未完成❌）
const homeworkEmoji = (status: string): string => {
  if (status === '超赞完成' || status === '圆满完成') return '完成 ✅';
  if (status === '没带' || status === '基本完成') return '按要求 ❗';
  if (status === '未完成') return '未完成 ❌';
  return status;
};

// 成长轨迹标签颜色
const SEASON_COLORS: Record<string, string> = {
  '暑': '#ff9f43',
  '秋': '#3b82f6',
  '寒': '#06b6d4',
  '春': '#10b981',
};

const seasonChips = (seasons: string[]): string => {
  if (!seasons || seasons.length === 0) return '<span style="color:#cbd5e1">-</span>';
  return seasons.map(s => {
    const color = SEASON_COLORS[s] || '#94a3b8';
    return `<span style="display:inline-block;width:26px;padding:2px 0;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:${color};text-align:center">${s}</span>`;
  }).join('');
};

// 统一规格的分数徽章：固定宽度保证所有列整齐
function scoreBadge(pct: number, score: string | number, p: Palette, color?: string): string {
  const w = Math.max(0, Math.min(100, pct));
  const base = color || p.accent;
  const soft = `${base}2e`;
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:58px;padding:3px 0;border-radius:8px;font-variant-numeric:tabular-nums;font-weight:600;background:linear-gradient(90deg,${soft} ${w}%,${p.track} ${w}%)">${score}</span>`;
}

export function buildPublicityHTML(
  classData: Class,
  lessonNumber: number,
  records: StudentRecord[],
  questionTypes: QuestionType[],
  getNickname: (name: string) => string,
  style: ExportStyle = 'gradient'
): string {
  const p = PALETTES[style] || PALETTES.gradient;
  const sorted = [...records].sort((a, b) => b.totalScore - a.totalScore);
  const fullScore = questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);
  const hasData = records.length > 0;

  // 班级平均值
  const avg = (nums: number[]) => nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : 0;
  const avgTotal = hasData ? avg(records.map(r => r.totalScore)) : 0;
  const avgRate = hasData ? avg(records.map(r => r.correctRate)) : 0;
  const avgQtScores: { [qtId: string]: number } = {};
  questionTypes.forEach(qt => {
    avgQtScores[qt.id] = hasData ? avg(records.map(r => r.scores[qt.id] || 0).filter(s => s > 0)) : 0;
  });

  // 排名徽章：前三名绿色高亮（对齐模板）
  const rankBadge = (i: number, rank: number) => {
    if (i < 3) {
      const bg = i === 0 ? '#16a34a' : i === 1 ? '#22c55e' : '#4ade80';
      return `<span style="display:inline-flex;width:28px;height:28px;border-radius:50%;align-items:center;justify-content:center;font-weight:800;background:${bg};color:#ffffff;box-shadow:0 2px 6px ${bg}55">${rank || i + 1}</span>`;
    }
    return `<span style="display:inline-flex;width:28px;height:28px;border-radius:50%;align-items:center;justify-content:center;font-weight:600;background:${style === 'dark' ? 'rgba(255,255,255,0.08)' : '#f1f5f9'};color:${p.muted}">${rank || i + 1}</span>`;
  };

  // 统一单元格样式：全居中、固定行高、底部细分隔线
  const td = 'padding:10px 8px;border-bottom:1px solid ' + p.rowBorder + ';text-align:center;vertical-align:middle;';

  const rows = sorted.map((r, i) => {
    const ratePct = r.correctRate || 0;
    // 正确率：<80 红色，≥80 绿色
    const rateColor = ratePct < 80 ? '#dc2626' : (style === 'dark' ? p.text : '#16a34a');
    const totalBg = style === 'dark' ? 'rgba(34,197,94,0.18)' : '#e8f8ee';
    return `<tr style="${i % 2 === 1 ? 'background:' + p.altRowBg + ';' : ''}">
      <td style="${td}">${rankBadge(i, r.rank)}</td>
      <td style="${td}font-weight:600">${getNickname(r.studentName)}</td>
      <td style="${td}white-space:nowrap">${seasonChips(r.seasons || [])}</td>
      <td style="${td}white-space:nowrap;font-size:13px">${attendanceEmoji(r.attendance)}</td>
      <td style="${td}white-space:nowrap;font-size:13px">${homeworkEmoji(r.homeworkStatus)}</td>
      <td style="${td}white-space:nowrap;font-size:13px">${r.listeningStatus === '具体分数' ? `${r.listeningScore}分` : (r.listeningStatus || '-')}</td>
      ${questionTypes.map(qt => {
        const score = r.scores[qt.id] || 0;
        return `<td style="${td}">${scoreBadge(qt.fullScore > 0 ? (score / qt.fullScore) * 100 : 0, score, p)}</td>`;
      }).join('')}
      <td style="${td}"><span style="display:inline-flex;align-items:center;justify-content:center;width:76px;padding:3px 0;border-radius:8px;font-weight:800;font-variant-numeric:tabular-nums;background:${totalBg};color:#16a34a">${r.totalScore}<span style="font-weight:500;font-size:11px">/${fullScore}</span></span></td>
      <td style="${td}font-weight:700;color:${rateColor}">${ratePct}%</td>
    </tr>`;
  }).join('');

  // 底部班级平均分行
  const avgRow = `<tr style="background:${style === 'dark' ? 'rgba(37,99,235,0.15)' : '#eef4fd'};font-weight:700">
      <td style="${td}" colspan="2">📊 班级平均</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      ${questionTypes.map(qt => `<td style="${td}">${scoreBadge(100, avgQtScores[qt.id] || 0, p, '#2563eb')}</td>`).join('')}
      <td style="${td}"><span style="color:#16a34a">${avgTotal}</span><span style="font-weight:500;font-size:11px;color:${p.muted}">/${fullScore}</span></td>
      <td style="${td}color:${avgRate < 80 ? '#dc2626' : '#16a34a'}">${avgRate}%</td>
    </tr>`;

  // 固定列宽：保证任何数据量下列对齐一致
  const baseCols = [56, 86, 100, 96, 96, 104];
  const qtCols = questionTypes.map(() => 84);
  const tailCols = [100, 76];
  const colWidths = [...baseCols, ...qtCols, ...tailCols];
  const colgroup = `<colgroup>${colWidths.map(w => `<col style="width:${w}px" />`).join('')}</colgroup>`;
  // 容器宽度 = 列宽和 + 左右 padding
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Day${lessonNumber}学情公示 · ${classData.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif; background: ${p.pageBg}; min-height: 100vh; padding: 24px; color: ${p.text}; }
  .container { width: fit-content; max-width: 100%; margin: 0 auto; background: ${p.cardBg}; border-radius: 20px; overflow: hidden; box-shadow: 0 16px 48px rgba(30,95,214,0.16); }
  .banner { background: ${p.bannerBg}; color: ${p.bannerText}; padding: 26px 32px; text-align: center; }
  .banner h1 { font-size: 30px; font-weight: 800; letter-spacing: 2px; margin-bottom: 6px; }
  .banner p { opacity: ${style === 'gradient' ? '0.9' : '0.7'}; font-size: 14.5px; }
  .banner .meta { display: inline-flex; gap: 14px; margin-top: 8px; font-size: 13px; opacity: 0.85; }
  .content { padding: 18px 16px 20px; overflow-x: auto; }
  table { width: ${tableWidth}px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
  th { background: ${p.headBg}; color: ${p.headText}; padding: 11px 6px; font-weight: 700; white-space: nowrap; font-size: 13px; letter-spacing: 0.5px; text-align: center; overflow: hidden; text-overflow: ellipsis; }
  thead th:first-child { border-radius: 10px 0 0 0; }
  thead th:last-child { border-radius: 0 10px 0 0; }
  @media print { body { padding: 0; background: ${style === 'dark' ? p.pageBg : '#fff'}; } .container { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="container">
    <div class="banner">
      <h1>Day${lessonNumber}学情公示</h1>
      <p>${classData.name}${classData.term ? ' · ' + classData.term : ''}${classData.batchCode ? ' · 批次 ' + classData.batchCode : ''}</p>
      <div class="meta"><span>👥 参考人数 ${records.length} 人</span><span>💯 总分 ${fullScore} 分</span><span>📅 ${new Date().toLocaleDateString('zh-CN')}</span></div>
    </div>
    <div class="content">
      <table>
        ${colgroup}
        <thead>
          <tr>
            <th>排名</th>
            <th>姓名</th>
            <th>成长轨迹</th>
            <th>考勤</th>
            <th>课堂练习</th>
            <th>课后任务</th>
            ${questionTypes.map(qt => `<th title="${qt.name}">${qt.name}</th>`).join('')}
            <th>总分(${fullScore})</th>
            <th>正确率</th>
          </tr>
        </thead>
        <tbody>${rows}${hasData ? avgRow : ''}</tbody>
      </table>
      ${!hasData ? '<p style="text-align:center;padding:40px;color:#94a3b8">本课次暂无学情数据</p>' : ''}
    </div>
  </div>
</body>
</html>`;
}
