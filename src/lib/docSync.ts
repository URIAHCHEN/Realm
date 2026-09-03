// 在线文档同步：腾讯文档 / 金山文档等效通道
// 两家开放平台 API 均需企业级鉴权，纯前端无法直连；
// 采用「剪贴板直贴 + 表格文件导入导出」实现数据回环，配合 Supabase 实时双向同步作为主通道。
import type { QuestionType, StudentRecord } from '@/types';

// ============ 导出：生成可直贴在线表格的 TSV（Excel 粘贴格式） ============

export function buildTSV(
  records: StudentRecord[],
  questionTypes: QuestionType[],
  getNickname: (name: string) => string
): string {
  const sorted = [...records].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const header = ['排名', '姓名', '学习轨迹', '考勤', '书面作业', '课后任务',
    ...questionTypes.map(qt => qt.name), '总分', '正确率', '薄弱项'];
  const rows = sorted.map(r => {
    return [
      r.rank || '',
      getNickname(r.studentName),
      (r.seasons || []).join(''),
      r.attendance,
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
  homeworkStatus?: string;
  listeningStatus?: string;
  listeningScore?: number;
  scores: { [questionTypeId: string]: number };
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
  matchedColumns: string[];
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
    return { rows: [], errors: ['内容太少：请连表头一起复制（至少表头 + 1 行数据）'], matchedColumns: [] };
  }

  const headers = splitLine(lines[0]).map(norm);
  const nameIdx = headers.findIndex(h => h === '姓名' || h === '学生姓名' || h === '名字' || h === '学生');
  if (nameIdx < 0) {
    return { rows: [], errors: ['未找到"姓名"列，请确认复制内容包含表头'], matchedColumns: [] };
  }

  // 题型列映射（按名称模糊匹配）
  const qtIdx: { qt: QuestionType; idx: number }[] = [];
  questionTypes.forEach(qt => {
    const idx = headers.findIndex(h => h === norm(qt.name) || h.includes(norm(qt.name)));
    if (idx >= 0) qtIdx.push({ qt, idx });
  });

  const findIdx = (names: string[]): number =>
    headers.findIndex(h => names.some(n => h === n || h.includes(n)));

  const attIdx = findIdx(['考勤']);
  const hwIdx = findIdx(['作业']);
  const listenIdx = findIdx(['课后任务', '乐听说']);
  const listenScoreIdx = findIdx(['课后任务分数', '乐听说分数']);
  const totalIdx = findIdx(['总分']);

  const matched = [
    nameIdx >= 0 ? '姓名' : '', attIdx >= 0 ? '考勤' : '', hwIdx >= 0 ? '作业' : '',
    listenIdx >= 0 ? '课后任务' : '', ...qtIdx.map(q => q.qt.name)
  ].filter(Boolean);

  const rows: ParsedRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line);
    const name = (cells[nameIdx] || '').trim();
    if (!name) { errors.push(`第 ${i + 2} 行：姓名为空，已跳过`); return; }
    // 跳过汇总行
    if (/平均|合计|总计|班均/.test(name)) return;

    const row: ParsedRow = { studentName: name, scores: {} };

    if (attIdx >= 0) row.attendance = (cells[attIdx] || '').trim() || undefined;
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
    qtIdx.forEach(({ qt, idx }) => {
      const num = parseFloat(cells[idx]);
      if (!isNaN(num)) row.scores[qt.id] = num;
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
  });

  return { rows, errors, matchedColumns: matched };
}
