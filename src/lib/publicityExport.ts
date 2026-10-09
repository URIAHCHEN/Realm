// 公示导出：生成可直接发布/打印/投屏/截图的学情公示 HTML
// 排版策略：table-layout:fixed 固定列宽 + 全居中 + 等宽数字 + 统一徽章尺寸，保证截图整齐美观
import type { Class, QuestionType, StudentRecord, CustomField, OralRatingConfig } from '@/types';
import type { ExportStyle } from '@/lib/displaySettings';
import { isAbsentRecord } from '@/lib/attendance';
import { classSnapshotOfLesson } from '@/lib/lessonStats';
import { buildOralRatings, oralKey, oralToneColor } from '@/lib/oralRating';

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
  // 干净中性底 + 品牌蓝点缀：避免大面积半透明蓝造成的"浑浊感"
  gradient: {
    pageBg: 'linear-gradient(180deg, #f3f6fa 0%, #eef2f8 100%)',
    cardBg: '#ffffff',
    bannerBg: 'linear-gradient(135deg, #2f6fe4 0%, #1750c4 100%)',
    bannerText: '#ffffff',
    headBg: 'linear-gradient(180deg,#dbe7f6 0%,#c7dbf1 100%)',
    headText: '#1e3a5f',
    text: '#111827',
    muted: '#6b7280',
    accent: '#1e5fd6',
    accentSoft: 'rgba(30,95,214,0.10)',
    rowBorder: '#eef1f5',
    altRowBg: '#f6f9fd',
    track: '#f4f6fa',
  },
  minimal: {
    pageBg: '#f6f7f9',
    cardBg: '#ffffff',
    bannerBg: '#ffffff',
    bannerText: '#111827',
    headBg: '#f3f5f8',
    headText: '#374151',
    text: '#111827',
    muted: '#6b7280',
    accent: '#0a84ff',
    accentSoft: 'rgba(10,132,255,0.10)',
    rowBorder: '#edf0f4',
    altRowBg: '#fafbfc',
    track: '#f4f6fa',
  },
  dark: {
    pageBg: 'linear-gradient(180deg, #16202f 0%, #0f172a 100%)',
    cardBg: '#1b2534',
    bannerBg: '#1b2534',
    bannerText: '#f1f5f9',
    headBg: 'rgba(255,255,255,0.07)',
    headText: '#e5eaf3',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#7dd3fc',
    accentSoft: 'rgba(125,211,252,0.14)',
    rowBorder: 'rgba(255,255,255,0.07)',
    altRowBg: 'rgba(255,255,255,0.025)',
    track: 'rgba(255,255,255,0.05)',
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
// 底色用浅淡色块、文字用更深一档的同色，保证小字号下也看得清
const SEASON_COLORS: Record<string, string> = {
  '暑': '#ff9f43',
  '秋': '#3b82f6',
  '寒': '#06b6d4',
  '春': '#10b981',
};
const SEASON_TEXT_COLORS: Record<string, string> = {
  '暑': '#c2600a',
  '秋': '#1d4ed8',
  '寒': '#0e7490',
  '春': '#047857',
};

// 成长轨迹 chips：display:inline-block + line-height 垂直居中。
// 起因：html2canvas 对 inline-flex 的宽度/居中测量有缺陷 → 导出图里徽章会横向偏移错位；
// 块级/inline-block + 行高是它在截图里最稳的居中写法。
const seasonChips = (seasons: string[]): string => {
  if (!seasons || seasons.length === 0) return '<span style="color:#cbd5e1">-</span>';
  return seasons.map(s => {
    const color = SEASON_COLORS[s] || '#94a3b8';
    const textColor = SEASON_TEXT_COLORS[s] || color;
    return `<span style="display:inline-block;width:24px;height:22px;line-height:21px;text-align:center;vertical-align:middle;margin:0 2px;border-radius:7px;font-size:12.5px;font-weight:700;color:${textColor};background:${color}12;border:1px solid ${color}2e">${s}</span>`;
  }).join('');
};

// HTML 转义：学员昵称 / 自定义选项 / 备注等均来自导入表格或人工输入，
// 直接拼进公示 HTML 会破坏排版（含 < & ），并在导出为 .html 打开时构成注入风险
function esc(v: unknown): string {
  const str = v == null ? '' : String(v);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 统一规格的分数徽章：固定宽度保证所有列整齐
function scoreBadge(pct: number, score: string | number, color?: string, dark = false): string {
  // 2026-10-08：对齐"经典公示表"样式 —— 分数用**浅色底 + 深色字**（不是浅字），
  // 底色按档位：≥85 浅绿 / ≥70 浅蓝 / ≥60 浅黄 / <70 浅红，保证扫一眼就能定位弱项。
  // 2026-10-09：改为「固定尺寸块级 + 行高居中」——html2canvas 渲染 inline-flex 时
  // 宽度/居中测量有缺陷，导出图里各分数底色会横向错位（用户实拍截图确认），
  // 固定 48×26 的块级徽章在截图与浏览器里完全一致。
  const tone = color || heat(pct);
  const bgMap: Record<string, string> = dark
    ? { '#16a34a': 'rgba(22,163,74,0.18)', '#2563eb': 'rgba(37,99,235,0.22)', '#0ea5e9': 'rgba(14,165,233,0.20)', '#d97706': 'rgba(217,119,6,0.20)', '#dc2626': 'rgba(220,38,38,0.20)' }
    : { '#16a34a': '#e7f6ec', '#2563eb': '#e8f0fe', '#0ea5e9': '#e8f0fe', '#d97706': '#fef7e6', '#dc2626': '#fdecec' };
  const bg = bgMap[tone] || (dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9');
  return `<span style="display:block;width:48px;height:26px;line-height:26px;margin:0 auto;border-radius:7px;text-align:center;font-variant-numeric:tabular-nums;font-weight:700;font-size:13.5px;color:${tone};background:${bg}">${score}</span>`;
}

export function buildPublicityHTML(
  classData: Class,
  lessonNumber: number,
  records: StudentRecord[],
  questionTypes: QuestionType[],
  getNickname: (name: string) => string,
  style: ExportStyle = 'gradient',
  customFields: CustomField[] = [],
  /** 口语等附加项的档位判定配置；缺省用默认档位 */
  oralRating?: OralRatingConfig
): string {
  const p = PALETTES[style] || PALETTES.gradient;
  // 公示只列出到课学员：请假/缺勤者不出现在名单中（平均分本就不计入）
  const sorted = [...records].filter(r => !isAbsentRecord(r)).sort((a, b) => b.totalScore - a.totalScore);
  const fullScore =
    questionTypes.reduce((sum, qt) => (qt.excludeFromTotal ? sum : sum + qt.fullScore), 0) +
    customFields.reduce((sum, cf) => sum + (cf.kind === 'number' && cf.includeInTotal ? (cf.fullScore || 0) : 0), 0);
  const hasData = sorted.length > 0;

  // 班级平均值（口径与学情表一致：请假/缺勤学员不计入平均分）
  const presentRecords = records.filter(r => !isAbsentRecord(r));
  const avg = (nums: number[]) => nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : 0;
  const avgTotal = presentRecords.length > 0 ? avg(presentRecords.map(r => r.totalScore)) : 0;
  const avgRate = presentRecords.length > 0 ? avg(presentRecords.map(r => r.correctRate)) : 0;
  const avgQtScores: { [qtId: string]: number } = {};
  questionTypes.forEach(qt => {
    avgQtScores[qt.id] = presentRecords.length > 0 ? avg(presentRecords.map(r => r.scores[qt.id] || 0).filter(s => s > 0)) : 0;
  });
  const avgCustomScores: { [cfId: string]: number } = {};
  customFields.forEach(cf => {
    if (cf.kind === 'number') {
      avgCustomScores[cf.id] = presentRecords.length > 0 ? avg(presentRecords.map(r => Number(r.customValues?.[cf.id]) || 0).filter(s => s > 0)) : 0;
    }
  });

  // 口语等附加项的档位判定：与学情表徽标同一份实现（lib/oralRating），
  // 保证公示里的评价和老师在表里看到的完全一致。
  // 传入全部 records —— 请假/缺勤由判定函数内部排除，班均口径与学情表一致。
  const optionalQts = questionTypes.filter(qt => qt.excludeFromTotal);
  const fullScoreByQtId = new Map(optionalQts.map(qt => [qt.id, qt.fullScore]));
  const oralRatings = buildOralRatings(
    records,
    optionalQts.map(qt => qt.id),
    (qtId) => fullScoreByQtId.get(qtId) || 0,
    oralRating
  );

  // 排名徽章：前三名金银铜渐变高亮（按真实名次着色，非位置；同分并列 → 同色同号，如四个金色「1」）
  // 固定尺寸块级圆（html2canvas 对齐安全）
  const rankBadge = (rank: number) => {
    if (rank === 1 || rank === 2 || rank === 3) {
      const grad = rank === 1 ? 'linear-gradient(135deg,#fcd34d,#f0a92c)'
        : rank === 2 ? 'linear-gradient(135deg,#e5eaf0,#a9b4c3)'
        : 'linear-gradient(135deg,#f3b98f,#cd7f45)';
      const glow = rank === 1 ? '#f0a92c' : rank === 2 ? '#94a3b8' : '#cd7f45';
      return `<span style="display:block;width:28px;height:28px;line-height:28px;margin:0 auto;border-radius:50%;text-align:center;font-weight:800;background:${grad};color:#ffffff;box-shadow:0 2px 7px ${glow}66;font-size:13.5px">${rank}</span>`;
    }
    return `<span style="display:block;line-height:28px;text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:${p.muted};font-size:13.5px">${rank}</span>`;
  };

  // 统一单元格样式：全居中、固定行高、底部细分隔线；溢出裁剪，保证固定列宽不错位
  const td = 'padding:9px 8px;border-bottom:1px solid ' + p.rowBorder + ';text-align:center;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;';
  // 负面状态（未完成/未交/缺勤/迟到…）整格高亮：浅底 + 同色系加深文字（一张表里最该被看见的就是这些）
  // 2026-10-09 按用户要求升级：从"只标红文字"改为"整格高亮突出"，底色取同色系的浅tint、文字再加深一档
  const NEG = /未完成|未交|未做|未带|没带|请假|缺勤|缺席|迟到|补交|不合格|未参与/;
  const isDarkStyle = style === 'dark';
  const stateCell = (text: string): { css: string; cellBg: string } => {
    if (/请假|调课/.test(text)) {
      return isDarkStyle
        ? { css: 'font-size:13px;color:#93c5fd;font-weight:700;', cellBg: 'rgba(59,130,246,0.16)' }
        : { css: 'font-size:13px;color:#1d4ed8;font-weight:700;', cellBg: '#e8f0fe' };
    }
    if (NEG.test(text)) {
      return isDarkStyle
        ? { css: 'font-size:13px;color:#fda4af;font-weight:800;', cellBg: 'rgba(244,63,94,0.16)' }
        : { css: 'font-size:13px;color:#b91c1c;font-weight:800;', cellBg: '#fdecec' };
    }
    return { css: `font-size:13px;color:${p.text};`, cellBg: '' };
  };

  // 排名独立重算（同分并列 + 后一名按并列数后移）：不依赖落库里的历史 rank，
  // 旧数据即便还带着"未并列"的名次，导出也会按当前口径重新算 —— 与学情表/榜单完全一致
  const rankSnap = classSnapshotOfLesson(records, lessonNumber);
  const rows = sorted.map((r, i) => {
    const ratePct = r.correctRate || 0;
    const rankVal = rankSnap.rankById.get(r.id) ?? (r.rank || i + 1);
    // 正确率：<80 红色，≥80 绿色
    const rateColor = ratePct < 80 ? '#dc2626' : (style === 'dark' ? p.text : '#16a34a');
    const att = stateCell(r.attendance || '');
    const hw = stateCell(r.homeworkStatus || '');
    const ls = stateCell(r.listeningStatus === '具体分数' ? '完成' : (r.listeningStatus || ''));
    const cellBg = (st: { cellBg: string }) => st.cellBg ? `background:${st.cellBg};` : '';
    return `<tr style="${i % 2 === 1 ? 'background:' + p.altRowBg + ';' : ''}">
      <td style="${td}font-weight:600">${esc(getNickname(r.studentName))}</td>
      <td style="${td}white-space:nowrap">${seasonChips(r.seasons || [])}</td>
      <td style="${td}white-space:nowrap;${att.css}${cellBg(att)}">${esc(attendanceEmoji(r.attendance))}</td>
      <td style="${td}white-space:nowrap;${hw.css}${cellBg(hw)}">${esc(homeworkEmoji(r.homeworkStatus))}</td>
      <td style="${td}white-space:nowrap;${ls.css}${cellBg(ls)}">${r.listeningStatus === '具体分数' ? `${r.listeningScore}分` : esc(r.listeningStatus || '-')}</td>
      ${questionTypes.map(qt => {
        const raw = r.scores[qt.id];
        const isOptional = !!qt.excludeFromTotal;
        // 附加项（口语等）未登记时显示「-」而不是 0：与学情表的「—」口径一致，
        // 否则家长会看到"口语 0 分"这种并不存在的事实
        if (isOptional && typeof raw !== 'number') {
          return `<td style="${td}"><span style="color:${p.muted};font-size:13px">-</span></td>`;
        }
        const score = typeof raw === 'number' ? raw : 0;
        const badge = scoreBadge(qt.fullScore > 0 ? (score / qt.fullScore) * 100 : 0, score, undefined, isDarkStyle);
        const rating = isOptional ? oralRatings.get(oralKey(r.id, qt.id)) : undefined;
        if (!rating) return `<td style="${td}">${badge}</td>`;
        const c = oralToneColor(rating, oralRating);
        // 分数在上、档位在下：不用 flex（html2canvas 对 flex 列的居中渲染有缺陷 → 导出错位），
        // 块级徽章（margin auto）+ inline-block 胶囊（td 文本居中）两层都稳定
        const pill = `<span style="display:inline-block;margin-top:3px;padding:1px 7px;border-radius:7px;font-size:11px;font-weight:600;line-height:16px;white-space:nowrap;color:${c.text};background:${c.bg};border:1px solid ${c.border}">${esc(rating.label)}</span>`;
        return `<td style="${td}">${badge}${pill}</td>`;
      }).join('')}
      ${customFields.map(cf => {
        const v = r.customValues?.[cf.id];
        const disp = (v === '' || v == null) ? '-' : esc(cf.kind === 'number' ? `${v}` : String(v));
        return `<td style="${td}${cf.kind === 'number' ? 'font-weight:600' : 'font-size:13px'}">${disp}</td>`;
      }).join('')}
      <td style="${td}"><span style="font-weight:800;font-variant-numeric:tabular-nums;color:${style === 'dark' ? p.text : '#1e5fd6'};font-size:14.5px">${r.totalScore}</span><span style="font-weight:500;font-size:11px;color:${p.muted}">/${fullScore}</span></td>
      <td style="${td}font-weight:700;color:${rateColor}">${ratePct}%</td>
      <td style="${td}">${rankBadge(rankVal)}</td>
    </tr>`;
  }).join('');

  // 底部班级平均分行
  const avgRow = `<tr style="background:${style === 'dark' ? 'rgba(255,255,255,0.06)' : '#dbe7f6'};font-weight:700;color:${style === 'dark' ? '#e5eaf3' : '#1e3a5f'}">
      <td style="${td}text-align:left;padding-left:14px">班级平均</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      <td style="${td}">-</td>
      ${questionTypes.map(qt => `<td style="${td}">${scoreBadge(100, avgQtScores[qt.id] || 0, p.muted, isDarkStyle)}</td>`).join('')}
      ${customFields.map(cf => `<td style="${td}">${cf.kind === 'number' ? (avgCustomScores[cf.id] || 0) : '-'}</td>`).join('')}
      <td style="${td}"><span style="color:${style === 'dark' ? p.text : '#1e5fd6'}">${avgTotal}</span><span style="font-weight:500;font-size:11px;color:${p.muted}">/${fullScore}</span></td>
      <td style="${td}color:${avgRate < 80 ? '#dc2626' : '#16a34a'}">${avgRate}%</td>
      <td style="${td}">-</td>
    </tr>`;

  // 固定列宽：保证任何数据量下列对齐一致。
  // 2026-10-09：成长轨迹列 96 → 136 —— 四个季节 chip（4×28px）此前会被列宽裁掉/挤出错位，
  // 且表头宽度曾与 colgroup 不一致（100 vs 96）；现在表头与 colgroup 同源，不会再错。
  const baseCols = [96, 136, 92, 92, 96];
  // 附加项（口语等）比小测题型多一行档位徽章 → 列宽给足，避免挤压换行
  const qtCols = questionTypes.map(qt => (qt.excludeFromTotal ? 100 : 78));
  const customCols = customFields.map(() => 90);
  const tailCols = [98, 84, 58];
  const colWidths = [...baseCols, ...qtCols, ...customCols, ...tailCols];
  const colgroup = `<colgroup>${colWidths.map(w => `<col style="width:${w}px" />`).join('')}</colgroup>`;
  // 容器宽度 = 列宽和 + 左右 padding
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Day${lessonNumber}学情公示 · ${esc(classData.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif; background: ${p.pageBg}; min-height: 100vh; padding: 28px; color: ${p.text}; }
  .container { width: fit-content; max-width: 100%; margin: 0 auto; background: ${p.cardBg}; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 36px rgba(17,24,39,0.10), 0 1px 0 rgba(17,24,39,0.04); }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .accent { height: 5px; background: linear-gradient(90deg, ${p.accent}, ${p.headBg}); }
  .banner { background: ${p.bannerBg}; color: ${p.bannerText}; padding: 28px 34px 24px; text-align: center; }
  .banner h1 { font-size: 26px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 6px; }
  .banner p { opacity: ${style === 'gradient' ? '0.92' : '0.72'}; font-size: 14.5px; font-weight: 500; }
  .banner .meta { display:inline-block; margin-top:10px; padding:3px 12px; border-radius:999px; font-size:11.5px; letter-spacing:0.3px; background:${style === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)'}; opacity:0.9; }
  .content { padding: 18px 18px 16px; overflow-x: auto; }
  table { width: ${tableWidth}px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13.5px; border: 1px solid #c7dbf1; border-radius: 10px; overflow: hidden; }
  th { background: ${p.headBg}; color: ${p.headText}; padding: 12px 6px; font-weight: 700; white-space: nowrap; font-size: 12.5px; letter-spacing: 0.3px; text-align: center; overflow: hidden; text-overflow: ellipsis; }
  thead th:first-child { border-radius: 10px 0 0 0; }
  thead th:last-child { border-radius: 0 10px 0 0; }
  tbody tr { transition: none; }
  .legend { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 18px 18px; font-size:12px; color:${p.muted}; }
  .legend .l { display:inline-flex; align-items:center; gap:5px; }
  .legend .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  @media print { body { padding: 0; background: ${style === 'dark' ? p.pageBg : '#fff'}; } .container { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="container">
    <div class="accent"></div>
    <div class="banner">
      <h1>Day${lessonNumber}学情公示</h1>
      <p>${esc(classData.name)}${classData.term ? ' · ' + esc(classData.term) : ''}${classData.batchCode ? ' · 批次 ' + esc(classData.batchCode) : ''}</p>
      <div class="meta">满分 ${fullScore} 分 · ${new Date().toLocaleDateString('zh-CN')}</div>
    </div>
    <div class="content">
      <table>
        ${colgroup}
        <thead>
          <tr>
            <th style="width:${baseCols[0]}px">姓名</th>
            <th style="width:${baseCols[1]}px">成长轨迹</th>
            <th style="width:${baseCols[2]}px">考勤</th>
            <th style="width:${baseCols[3]}px">课堂练习</th>
            <th style="width:${baseCols[4]}px">课后任务</th>
            ${questionTypes.map((qt, qi) => `<th title="${esc(qt.name)}" style="width:${qtCols[qi]}px">${esc(qt.name)}</th>`).join('')}
            ${customFields.map((cf, ci) => `<th title="${esc(cf.name)}" style="width:${customCols[ci]}px">${esc(cf.name)}${cf.kind === 'number' && cf.includeInTotal ? '*' : ''}</th>`).join('')}
            <th style="width:${tailCols[0]}px">总分(${fullScore})</th>
            <th style="width:${tailCols[1]}px">正确率</th>
            <th style="width:${tailCols[2]}px">排名</th>
          </tr>
        </thead>
        <tbody>${rows}${hasData ? avgRow : ''}</tbody>
      </table>
      ${!hasData ? '<p style="text-align:center;padding:40px;color:#94a3b8">本课次暂无到课学员的学情数据</p>' : ''}
    </div>
    ${hasData ? `<div class="legend">
      <span class="l">🥇🥈🥉 前三名（同分并列）</span>
      <span class="l"><span class="dot" style="background:#16a34a"></span>正确率≥80%&emsp;<span class="dot" style="background:#dc2626"></span>&lt;80%</span>
    </div>` : ''}
  </div>
</body>
</html>`;
}
