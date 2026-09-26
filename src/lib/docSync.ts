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
  /** true = 不计入小测总分（如口语得分：属于作业成绩，且可空） */
  excludeFromTotal?: boolean;
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
  /** 表头「总分（N）」声明的卷面总分，用于校准各列满分 */
  declaredTotalScore?: number;
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

// 常用题型满分档位（学校常用卷面）：名称命中时优先采用，
// 因为"列内最大值"在没人拿满分时会低估（如语篇填词全班最高 2 分，实际满分 5 分）。
/**
 * 解析一个分数单元格。
 * 为什么要统一入口：粘贴来的表格里常见全角数字（８５）、带百分号（85%）、
 * 甚至字母 O 混入（1O）与负数（-5）。此前直接 parseFloat：
 *   · 全角 → NaN → 该分值被静默丢掉（用户只看到"导入成功"）
 *   · 1O  → 被解析成 1（错值）
 *   · -5  → 直接落库，总分/正确率变负
 * 现在：全角转半角、剥离千分位与百分号；负数与非数字一律判为非法并回报给用户。
 */
export function parseScoreCell(raw: string | undefined): { value?: number; invalid?: boolean } {
  if (raw == null) return {};
  let t = String(raw).trim();
  if (!t) return {};
  // 全角 → 半角（数字、小数点、负号、逗号、空格）
  t = t.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
       .replace(/[．。]/g, '.')
       .replace(/[－—–]/g, '-')
       .replace(/[，,\s]/g, '')
       .replace(/%$/, '');
  if (!t) return {};
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { invalid: true };
  const n = parseFloat(t);
  if (!isFinite(n) || n < 0) return { invalid: true };
  return { value: n };
}

/** 稳健上限：用 90 分位代替最大值，避免单个异常大值把整列满分抬高 */
function robustMax(nums: number[]): number {
  // 异常值剔除：以中位数为基准，超过 3×中位数 的视为误填（如 15 分题里出现 150）。
  // 不用"90 分位"——小样本（3~5 行）时 90 分位就等于最大值，拦不住异常值。
  const nz = nums.filter(n => n > 0);
  if (!nz.length) return 0;
  const sorted = [...nz].sort((a, b) => a - b);
  // 取"下中位数"：偶数样本时若取上中位数，[15,150] 会选中 150，异常值就拦不住了
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const threshold = Math.max(median * 3, median + 1);
  const kept = nz.filter(n => n <= threshold);
  const base = kept.length ? kept : nz;
  return Math.max(...base);
}

const CANONICAL_FULL_SCORES: Record<string, number> = {
  '语法选择': 15, '完形填空': 10, '阅读理解': 10, '语篇填词': 5, '完成句子': 10,
  '语法填空': 10, '单项选择': 5,
  // 口语为百分制；它是作业成绩的一部分，不计入小测总分（见 excludeFromTotal）
  '口语': 100, '口语得分': 100, '口语成绩': 100,
};

/**
 * 判定某列是否为「不计入小测总分」的附加项。
 * 目前覆盖：口语类（口语/口语得分/口语成绩/朗读/跟读/口语表达…）——
 * 它属于作业成绩，且并非每次课都登记，因此需要按"可空 + 不计入总分"处理。
 */
export function isNonQuizColumn(name: string): boolean {
  return /口语|朗读|跟读|配音|口试/.test(name || '');
}

/**
 * 推断各分数列的真实满分，三重依据按"证据强度"协同：
 *   ① 数据最大值（真实卷面下限）
 *   ② 常用档位表（名称命中时给出常见值，弥补"无人满分"造成的低估）
 *   ③ 表头「总分（N）」——最强的校准信号：各列之和必须等于 N
 * 返回与传入列一一对应的满分数组。
 */
function inferFullScores(
  cols: { name: string; colMax: number; configFullScore?: number }[],
  declaredTotal?: number
): number[] {
  const canonOf = (name: string) => CANONICAL_FULL_SCORES[norm(name)] ?? 0;
  const base = cols.map(c => {
    const cfg = c.configFullScore && c.configFullScore > 0 ? c.configFullScore : 0;
    return Math.max(cfg, canonOf(c.name), c.colMax > 0 ? c.colMax : 0) || 1;
  });
  if (!declaredTotal || declaredTotal <= 0) return base;

  let sum = base.reduce((a, b) => a + b, 0);
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (eq(sum, declaredTotal)) return base;

  if (sum > declaredTotal) {
    // 高估：把高于"数据最大值"的部分回收（优先回收增量最大的列，且不低于数据最大值）
    const cands = cols
      .map((c, i) => ({ i, over: base[i] - (c.colMax > 0 ? c.colMax : base[i]) }))
      .filter(x => x.over > 0.001)
      .sort((a, b) => b.over - a.over);
    for (const x of cands) {
      if (sum <= declaredTotal) break;
      const shrink = Math.min(x.over, sum - declaredTotal);
      base[x.i] -= shrink;
      sum -= shrink;
    }
    return base;
  }

  // 低估：优先把"常用档位/配置"高于当前值的列提上去（增量大的先补），逼近表头总分
  const ups = cols
    .map((c, i) => {
      const cfg = c.configFullScore || 0;
      const target = Math.max(cfg, canonOf(c.name), c.colMax || 0);
      return { i, gain: target - base[i] };
    })
    .filter(x => x.gain > 0.001)
    .sort((a, b) => b.gain - a.gain);
  for (const u of ups) {
    if (sum >= declaredTotal) break;
    const add = Math.min(u.gain, declaredTotal - sum);
    base[u.i] += add;
    sum += add;
  }
  return base;
}


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
  const hwIdx = findIdx(['书面作业', '课堂练习', '作业']);   // 「课堂练习」是同一列的常用叫法（对外表头已统一为课堂练习）
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
      const parsed = parseScoreCell(cells[listenScoreIdx]);
      if (parsed.invalid) errors.push(`第 ${i + 2} 行（${name || '未署名'}）：口语/听力分数「${String(cells[listenScoreIdx]).trim()}」无法识别，已跳过`);
      else if (parsed.value != null) { row.listeningStatus = '具体分数'; row.listeningScore = parsed.value; }
    }
    row.scoreValues = {};
    qtIdx.forEach(({ qt, idx }) => {
      const parsed = parseScoreCell(cells[idx]);
      if (parsed.invalid) {
        errors.push(`第 ${i + 2} 行（${name || '未署名'}）· ${qt.name}：「${String(cells[idx]).trim()}」不是有效分数，已跳过`);
        return;
      }
      if (parsed.value != null) {
        row.scores[qt.id] = parsed.value;
        row.scoreValues![qt.name] = parsed.value;
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

  // 表头「总分（50）」→ 50：这是校准各列满分最可靠的依据
  const declaredTotalScore = (() => {
    const i = rawHeaders.findIndex(h => norm(h).includes('总分'));
    if (i < 0) return undefined;
    const m = rawHeaders[i].match(/(\d+(?:\.\d+)?)/);
    const n = m ? parseFloat(m[1]) : NaN;
    return !isNaN(n) && n > 0 ? n : undefined;
  })();

  const dataLines = lines.slice(1);
  const unmatchedColumns: { name: string; suggestedFullScore: number }[] = [];
  const unmatchedIdx: { name: string; idx: number; suggestedFullScore: number }[] = [];
  rawHeaders.forEach((h, idx) => {
    if (usedIdx.has(idx)) return;
    const label = (h || '').trim();
    if (!label || /总分|正确率|排名|薄弱项|备注/.test(label)) return;
    const nums = dataLines
      .map(l => parseScoreCell(splitLine(l)[idx]).value)
      .filter((n): n is number => n != null);
    if (nums.length === 0) return;
    const numericRatio = nums.length / Math.max(1, dataLines.length);
    // 口语/朗读这类"并非每次课都登记"的可选列，登记率天然很低（1/4 也正常），
    // 若沿用 50% 的阈值会被整列丢弃 —— 用户就会发现"口语列没导进来"
    const optional = isNonQuizColumn(label);
    if (numericRatio >= 0.5 || (optional && nums.length > 0)) {
      const maxV = robustMax(nums);
      const suggested = Math.max(1, Math.ceil(maxV));
      const colMax = Math.ceil(maxV * 100) / 100;
      unmatchedColumns.push({ name: label, suggestedFullScore: suggested });
      unmatchedIdx.push({ name: label, idx, suggestedFullScore: colMax });
    }
  });

  // 未匹配列的分值同样写进每行 scoreValues：导入端会按列名补建题型并落分
  unmatchedIdx.forEach(({ name, idx }) => {
    rawRows.forEach(({ row, cells }) => {
      const parsed = parseScoreCell(cells[idx]);
      if (parsed.value != null) {
        if (!row.scoreValues) row.scoreValues = {};
        row.scoreValues[name] = parsed.value;
      }
    });
  });

  // 已匹配题型列：按列数据最大值推断本次卷面真实满分，
  // 与当前配置不一致时返回建议（导入端据此回填分母并重算正确率）
  const fullScoreUpdates: { qtId: string; name: string; suggestedFullScore: number }[] = [];
  qtIdx.forEach(({ qt, idx }) => {
    const nums = dataLines
      .map(l => parseScoreCell(splitLine(l)[idx]).value)
      .filter((n): n is number => n != null);
    if (nums.length === 0) return;
    // 稳健上限：剔除异常大值（如 15 分题里混进 150），避免整列满分被抬高
    const suggested = Math.max(1, Math.ceil(robustMax(nums) * 100) / 100);
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

  const colStats = allColIdx.map(col => {
    // 统一走 parseScoreCell：全角数字可解析、负数/非法值被剔除
    const nums = dataLines
      .map(l => parseScoreCell(splitLine(l)[col.idx]).value)
      .filter((n): n is number => n != null);
    // 稳健上限：个别人误填 150 不会把 15 分题的满分抬成 150
    const colMax = robustMax(nums);
    const cfgQt = col.matchedQtId ? questionTypes.find(q => q.id === col.matchedQtId) : undefined;
    return {
      name: col.name,
      matchedQtId: col.matchedQtId,
      colMax: colMax > 0 ? Math.ceil(colMax * 2) / 2 : 0,   // 向上取到 0.5 的整数倍
      configFullScore: cfgQt?.fullScore || col.suggestedFullScore || 0,
    };
  });
  const inferred = inferFullScores(colStats, declaredTotalScore);
  const scoreColumns: ScoreColumn[] = colStats.map((c, i) => ({
    name: c.name,
    matchedQtId: c.matchedQtId,
    suggestedFullScore: inferred[i],
    excludeFromTotal: isNonQuizColumn(c.name) || undefined,
  }));

  return { rows, errors, matchedColumns: matched, unmatchedColumns, fullScoreUpdates, scoreColumns, declaredTotalScore };
}
