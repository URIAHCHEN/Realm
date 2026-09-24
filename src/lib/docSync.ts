// 在线文档同步：腾讯文档 / 金山文档等效通道
// 两家开放平台 API 均需企业级鉴权，纯前端无法直连；
// 采用「剪贴板直贴 + 表格文件导入导出」实现数据回环，配合 Supabase 实时双向同步作为主通道。
import type { QuestionType, StudentRecord, SeasonType } from '@/types';

// ============ 导出：生成可直贴在线表格的 TSV（Excel 粘贴格式） ============

export function buildTSV(
  records: StudentRecord[],
  questionTypes: QuestionType[],
  getNickname: (name: string) => string
): string {
  const sorted = [...records].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const header = ['排名', '姓名', '学习轨迹', '考勤', '课堂表现', '书面作业', '课后任务',
    ...questionTypes.map(qt => qt.name), '总分', '正确率', '薄弱项'];
  const rows = sorted.map(r => {
    return [
      r.rank || '',
      getNickname(r.studentName),
      (r.seasons || []).join(''),
      r.attendance,
      r.classPerformance || '',
      r.homeworkStatus,
      r.listeningStatus === '具体分数' ? String(r.listeningScore) : r.listeningStatus,
      ...questionTypes.map(qt => String(r.scores[qt.id] || 0)),
      String(r.totalScore),
      `${r.correctRate}%`,
      '' // 薄弱项列留空，避免在线表格二次加工
    ].join('\t');
  });
  return [header.join('\t'), ...rows].join('\n');
}

// ============ 导出：Markdown 表格（粘贴到智能文档） ============

export function buildMarkdown(
  records: StudentRecord[],
  questionTypes: QuestionType[],
  getNickname: (name: string) => string
): string {
  const sorted = [...records].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const header = `| 排名 | 姓名 | 考勤 | 作业 | ${questionTypes.map(qt => qt.name).join(' | ')} | 总分 | 正确率 |`;
  const sep = `| --- | --- | --- | --- | ${questionTypes.map(() => '---').join(' | ')} | --- | --- |`;
  const rows = sorted.map(r =>
    `| ${r.rank || '-'} | ${getNickname(r.studentName)} | ${r.attendance} | ${r.homeworkStatus} | ${questionTypes.map(qt => r.scores[qt.id] || 0).join(' | ')} | **${r.totalScore}** | ${r.correctRate}% |`
  );
  return [header, sep, ...rows].join('\n');
}

// ============ 导入：解析从在线表格复制/导出的内容（TSV / CSV） ============

export interface ParsedRow {
  studentName: string;
  attendance?: string;
  classPerformance?: string;
  homeworkStatus?: string;
  listeningStatus?: string;
  listeningScore?: number;
  seasons?: SeasonType[];
  lessonNumber?: number;
  scores: { [questionTypeId: string]: number };
  /** 「表格列名 → 分数」原始取值；导入端据此在重建题型配置后映射为 qtId */
  scoreValues?: { [columnName: string]: number };
}

/** 表格中的一个分数列（按表格出现顺序） */
export interface ScoreColumn {
  name: string;
  /** 按列内数据最大值推断的满分 */
  suggestedFullScore: number;
  /** 命中已有题型时给出其 id，用于沿用（保住已录分数） */
  matchedQtId?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
  matchedColumns: string[];
  unmatchedColumns: { name: string; suggestedFullScore: number }[];
  /** 已匹配题型列的真实满分（按列数据最大值推断），与当前配置不一致时给出，用于导入时同步分母 */
  fullScoreUpdates: { qtId: string; name: string; suggestedFullScore: number }[];
  /** 按表格顺序排列的全部分数列（含未匹配列），导入端用它对齐课次题型配置 */
  scoreColumns: ScoreColumn[];
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  // 简易 CSV（考虑引号包裹）
  const out: string[] = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[（）()]/g, '');

// 按表头名匹配列：支持 排名/姓名/考勤/作业(书面作业)/课后任务/题型名/总分/正确率
export function parseClipboardTable(
  text: string,
  questionTypes: QuestionType[]
): ParseResult {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const errors: string[] = [];
  if (lines.length < 2) {
    return { rows: [], errors: ['内容太少：请连表头一起复制（至少表头 + 1 行数据）'], matchedColumns: [], unmatchedColumns: [], fullScoreUpdates: [], scoreColumns: [] };
  }

  const headers = splitLine(lines[0]).map(norm);
  const nameIdx = headers.findIndex(h => h === '姓名' || h === '学生姓名' || h === '名字' || h === '学生');
  if (nameIdx < 0) {
    return { rows: [], errors: ['未找到"姓名"列，请确认复制内容包含表头'], matchedColumns: [], unmatchedColumns: [], fullScoreUpdates: [], scoreColumns: [] };
  }

  // 列映射：先题型精确匹配 → 再固定列（精确/别名）→ 再题型模糊匹配；全程排除已占用列，避免互相抢占
  const usedIdx = new Set<number>([nameIdx]);
  const qtIdx: { qt: QuestionType; idx: number }[] = [];
  questionTypes.forEach(qt => {
    const idx = headers.findIndex((h, i) => !usedIdx.has(i) && h === norm(qt.name));
    if (idx >= 0) { qtIdx.push({ qt, idx }); usedIdx.add(idx); }
  });

  const findIdx = (names: string[]): number => {
    const idx = headers.findIndex((h, i) => !usedIdx.has(i) && names.some(n => h === n || h.includes(n)));
    if (idx >= 0) usedIdx.add(idx);
    return idx;
  };

  const attIdx = findIdx(['考勤']);
  const cpIdx = findIdx(['课堂表现']);
  const hwIdx = findIdx(['书面作业', '作业']);
  // 先匹配更具体的「课后任务分数」，再匹配「课后任务」，避免分数列抢占状态列
  const listenScoreIdx = findIdx(['课后任务分数', '乐听说分数']);
  const listenIdx = findIdx(['课后任务', '乐听说']);
  const totalIdx = findIdx(['总分']);
  const seasonIdx = findIdx(['成长轨迹', '学习轨迹', '轨迹']);
  const lessonIdx = findIdx(['课次']);
  // 题型模糊匹配（精确未命中者），排除已占用列
  questionTypes.forEach(qt => {
    if (qtIdx.some(q => q.qt.id === qt.id)) return;
    const idx = headers.findIndex((h, i) => !usedIdx.has(i) && h.includes(norm(qt.name)));
    if (idx >= 0) { qtIdx.push({ qt, idx }); usedIdx.add(idx); }
  });
  const onlyCn = (s: string) => (s.match(/[一-龥]/g) || []).join('');

  const rawRows: { row: ParsedRow; cells: string[] }[] = [];
  const matched = [
    nameIdx >= 0 ? '姓名' : '', attIdx >= 0 ? '考勤' : '', cpIdx >= 0 ? '课堂表现' : '', hwIdx >= 0 ? '作业' : '',
    listenIdx >= 0 ? '课后任务' : '', seasonIdx >= 0 ? '学习轨迹' : '', ...qtIdx.map(q => q.qt.name)
  ].filter(Boolean);

  const rows: ParsedRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line);
    const name = (cells[nameIdx] || '').trim();
    if (!name) { errors.push(`第 ${i + 2} 行：姓名为空，已跳过`); return; }
    // 跳过汇总行
    if (/平均|合计|总计|班均/.test(name)) return;

    const row: ParsedRow = { studentName: name, scores: {} };

    if (attIdx >= 0) row.attendance = onlyCn(cells[attIdx] || '') || undefined;
    if (cpIdx >= 0) row.classPerformance = (cells[cpIdx] || '').trim() || undefined;
    if (seasonIdx >= 0) {
      const s = cells[seasonIdx] || '';
      const found = ([...s].filter(ch => '暑秋寒春'.includes(ch)) as SeasonType[]);
      row.seasons = Array.from(new Set(found));
    }
    if (lessonIdx >= 0) {
      const n = parseInt((cells[lessonIdx] || '').replace(/\D/g, ''), 10);
      if (!isNaN(n)) row.lessonNumber = n;
    }
    if (hwIdx >= 0) row.homeworkStatus = (cells[hwIdx] || '').trim() || undefined;
    if (listenIdx >= 0) {
      const v = (cells[listenIdx] || '').trim();
      const num = parseFloat(v);
      if (!isNaN(num) && /^\d+(\.\d+)?$/.test(v)) {
        row.listeningStatus = '具体分数';
        row.listeningScore = num;
      } else if (v) {
        row.listeningStatus = v;
      }
    }
    if (listenScoreIdx >= 0) {
      const num = parseFloat(cells[listenScoreIdx]);
      if (!isNaN(num)) { row.listeningStatus = '具体分数'; row.listeningScore = num; }
    }
    row.scoreValues = {};
    qtIdx.forEach(({ qt, idx }) => {
      const num = parseFloat(cells[idx]);
      if (!isNaN(num)) {
        row.scores[qt.id] = num;
        row.scoreValues![qt.name] = num;
      }
    });
    // 校验：有总分列时，若题型列齐全则校验和
    if (totalIdx >= 0 && qtIdx.length > 0) {
      const sum = qtIdx.reduce((acc, { idx }) => acc + (parseFloat(cells[idx]) || 0), 0);
      const total = parseFloat(cells[totalIdx]);
      if (!isNaN(total) && Math.abs(sum - total) > 1 && qtIdx.length === questionTypes.length) {
        errors.push(`第 ${i + 2} 行（${name}）：题型分合计 ${sum} 与总分 ${total} 不一致，请核对`);
      }
    }
    rows.push(row);
    rawRows.push({ row, cells });
  });

  // 未匹配、但数据多为数值的列 → 候选新题型（usedIdx 已含姓名/固定列/已匹配题型）
  const rawHeaders = splitLine(lines[0]);
  const dataLines = lines.slice(1);
  const unmatchedColumns: { name: string; suggestedFullScore: number }[] = [];
  const unmatchedIdx: { name: string; idx: number; suggestedFullScore: number }[] = [];
  rawHeaders.forEach((h, idx) => {
    if (usedIdx.has(idx)) return;
    const label = (h || '').trim();
    if (!label || /总分|正确率|排名|薄弱项|备注/.test(label)) return;
    const nums = dataLines.map(l => parseFloat((splitLine(l)[idx] || '').trim())).filter(n => !isNaN(n));
    if (nums.length === 0) return;
    const numericRatio = nums.length / Math.max(1, dataLines.length);
    if (numericRatio >= 0.5) {
      const maxV = Math.max(...nums);
      const suggested = Math.max(1, Math.ceil(maxV));
      const colMax = Math.ceil(maxV * 100) / 100;
      unmatchedColumns.push({ name: label, suggestedFullScore: suggested });
      unmatchedIdx.push({ name: label, idx, suggestedFullScore: colMax });
    }
  });

  // 未匹配列的分值同样写进每行 scoreValues：导入端会按列名补建题型并落分
  unmatchedIdx.forEach(({ name, idx }) => {
    rawRows.forEach(({ row, cells }) => {
      const num = parseFloat(cells[idx]);
      if (!isNaN(num)) {
        if (!row.scoreValues) row.scoreValues = {};
        row.scoreValues[name] = num;
      }
    });
  });

  // 已匹配题型列：按列数据最大值推断本次卷面真实满分，
  // 与当前配置不一致时返回建议（导入端据此回填分母并重算正确率）
  const fullScoreUpdates: { qtId: string; name: string; suggestedFullScore: number }[] = [];
  qtIdx.forEach(({ qt, idx }) => {
    const nums = dataLines
      .map(l => parseFloat((splitLine(l)[idx] || '').trim()))
      .filter(n => !isNaN(n) && n >= 0);
    if (nums.length === 0) return;
    const suggested = Math.max(1, Math.ceil(Math.max(...nums) * 100) / 100);
    const current = qt.fullScore || 0;
    if (current <= 0 || Math.abs(current - suggested) > 0.5) {
      fullScoreUpdates.push({ qtId: qt.id, name: qt.name, suggestedFullScore: suggested });
    }
  });

  // 分数列清单（按表格列顺序），并给出每列的真实满分（命中题型时以列最大值为准）
  const allColIdx: { idx: number; name: string; suggestedFullScore: number; matchedQtId?: string }[] = [
    ...qtIdx.map(({ qt, idx }) => ({ idx, name: qt.name, suggestedFullScore: qt.fullScore || 0, matchedQtId: qt.id })),
    ...unmatchedIdx.map(({ name, idx, suggestedFullScore }) => ({ idx, name, suggestedFullScore })),
  ].sort((a, b) => a.idx - b.idx);

  const scoreColumns: ScoreColumn[] = allColIdx.map(col => {
    const nums = dataLines
      .map(l => parseFloat((splitLine(l)[col.idx] || '').trim()))
      .filter(n => !isNaN(n) && n >= 0);
    const byData = nums.length ? Math.max(1, Math.ceil(Math.max(...nums) * 100) / 100) : 0;
    return {
      name: col.name,
      matchedQtId: col.matchedQtId,
      suggestedFullScore: byData || col.suggestedFullScore || 1,
    };
  });

  return { rows, errors, matchedColumns: matched, unmatchedColumns, fullScoreUpdates, scoreColumns };
}
