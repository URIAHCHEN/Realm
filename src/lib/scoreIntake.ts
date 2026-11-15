// 校内成绩录入：把「粘贴的表格文本 / 本地 OCR 结果」解析成结构化草稿，并匹配到班级学员。
//
// 背景（2026-11-15）：现有 Excel 导入写死了 23 列的导出格式（第 0 列姓名、第 10 列得分…），
// 换一份来源就全错位。这里改成按**表头语义**识别列，并把「纸质表格照片」也纳入同一条通路：
//   图片/文本 → 解析 → 匹配学员 → 人工校正 → 写入。
//
// 手写识别不可靠（实测「练弈雅」→「练將産」），所以解析结果永远只是**草稿**，
// 必须经过确认页；未匹配的行不会静默丢弃，而是标出来等人工指定。

import type { SchoolScore } from '@/types';

export interface IntakeContext {
  students: string[];
  /** 班级昵称表：姓名 → 昵称，用于「雪琪」这类叫法也能匹配 */
  nicknames?: { [studentName: string]: string };
  examName: string;
  date: string;
  subject?: string;
  school?: string;
}

export interface ScoreDraft {
  /** 原始识别文本，供人工校对时对照 */
  raw: string;
  /** 匹配到的班级学员；未匹配为空串 */
  studentName: string;
  /** 匹配置信度 0~1，低于 0.6 视为未匹配 */
  confidence: number;
  /** 其他候选（供人工下拉快速选择） */
  candidates: string[];
  school?: string;
  score: number;
  totalScore: number;
  classRank?: number;
  classSize?: number;
  subject?: string;
  note?: string;
  /** 无法解析出分数等问题 */
  problem?: string;
}

const FULLWIDTH = /[\uFF01-\uFF5E]/g;
const toHalf = (s: string) => s.replace(FULLWIDTH, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

/** 归一化：半角化、去零宽字符、全角空格，保留中文与数字 */
export function normalizeText(input: string): string {
  return toHalf(String(input || ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/[：:]/g, ':')
    .trim();
}

/** 姓名归一化：去掉空格、括号说明、常见后缀标注 */
export function normalizeName(input: string): string {
  return normalizeText(input)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[、,，.。;；]+$/g, '')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  return 1 - levenshtein(a, b) / max;
}

export interface MatchResult {
  name: string;
  confidence: number;
  candidates: string[];
}

/**
 * 姓名匹配：精确 → 去空格 → 昵称 → 互相包含 → 编辑距离。
 * 阈值 0.6，低于此值视为未匹配（宁可让人工指认，也不要错记到别人头上）。
 */
export function matchStudentName(
  input: string,
  students: string[],
  nicknames: { [studentName: string]: string } = {},
): MatchResult {
  const raw = normalizeName(input);
  if (!raw || !students.length) return { name: '', confidence: 0, candidates: [] };

  const scored = students.map((name) => {
    const normalized = normalizeName(name);
    let score = similarity(raw, normalized);
    if (normalized === raw) score = 1;
    else {
      const nick = normalizeName(nicknames[name] || '');
      if (nick && nick === raw) score = Math.max(score, 0.96);
      else if (normalized.startsWith(raw) || raw.startsWith(normalized)) {
        // 包含关系：长度接近才可信（「王雨」命中「王雨桐」比命中「王雨桐同学家长」更可靠）
        const gap = Math.abs(normalized.length - raw.length);
        score = Math.max(score, gap <= 1 ? 0.88 : 0.7);
      } else if (normalized.includes(raw) || raw.includes(normalized)) {
        score = Math.max(score, 0.68);
      }
    }
    return { name, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.6) {
    return { name: '', confidence: best?.score || 0, candidates: scored.slice(0, 3).map(s => s.name) };
  }
  return { name: best.name, confidence: Number(best.score.toFixed(2)), candidates: scored.slice(0, 3).map(s => s.name) };
}

const NUM = /-?\d+(?:\.\d+)?/g;

/** 从一行里取「得分/满分」：支持 85/100、85 分、得分 85 满分 100 等写法 */
export function parseScorePair(line: string, fallbackTotal = 100): { score?: number; totalScore?: number } {
  const text = normalizeText(line);

  // 显式「满分 x 得分 y」或「得分 y 满分 x」
  const totalLabeled = /满分\s*:?\s*(\d+(?:\.\d+)?)/.exec(text);
  const scoreLabeled = /得分\s*:?\s*(\d+(?:\.\d+)?)/.exec(text);
  if (totalLabeled || scoreLabeled) {
    return {
      score: scoreLabeled ? Number(scoreLabeled[1]) : undefined,
      totalScore: totalLabeled ? Number(totalLabeled[1]) : fallbackTotal,
    };
  }

  // a/b 形式
  const pair = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(text);
  if (pair) {
    const a = Number(pair[1]);
    const b = Number(pair[2]);
    // a/b 有歧义：「126/150」是得分/满分，「3/45」是名次/人数。
    // 分母达到 20 且分子很小、占比不足三成时按名次处理，避免把名次写成 3 分。
    if (b > a && b >= 20) {
      if (a <= 10 && a / b < 0.35) return {};
      return { score: a, totalScore: b };
    }
  }

  const nums = text.match(NUM);
  if (nums && nums.length === 1) {
    const v = Number(nums[0]);
    if (v >= 0 && v <= 1000) return { score: v, totalScore: fallbackTotal };
  }
  return {};
}

/** 从一行里取名次：支持「班排 3」「第 3 名」「3/45」 */
export function parseRank(line: string): { classRank?: number; classSize?: number } {
  const text = normalizeText(line);
  const slash = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (slash) {
    const rank = Number(slash[1]);
    const size = Number(slash[2]);
    if (rank > 0 && size > rank) return { classRank: rank, classSize: size };
  }
  const labeled = /(?:班排|班名|班级排名|年级排名|排名)\s*:?\s*第?\s*(\d+)/.exec(text);
  if (labeled) return { classRank: Number(labeled[1]) };
  const ordinal = /第\s*(\d+)\s*名/.exec(text);
  if (ordinal) return { classRank: Number(ordinal[1]) };
  return {};
}

const HEADER_HINT = /姓名|学生|学员|得分|分数|满分|总分|班排|排名|学校|科目/;

/** 表头列名归一化到语义键 */
function headerKey(cell: string): 'name' | 'score' | 'total' | 'rank' | 'size' | 'school' | 'subject' | null {
  const c = normalizeName(cell);
  if (/姓名|学生|学员|名字/.test(c)) return 'name';
  if (/满分|总分|卷面分/.test(c)) return 'total';
  if (/得分|分数|成绩/.test(c)) return 'score';
  if (/班排|班级排名|名次|排名/.test(c)) return 'rank';
  if (/人数|班级人数|总人数/.test(c)) return 'size';
  if (/学校|在读/.test(c)) return 'school';
  if (/科目|学科/.test(c)) return 'subject';
  return null;
}

/** 把一行拆成单元格：优先制表符，其次 2 个以上空格，最后单空格 */
function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim()).filter(Boolean);
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  return line.trim().split(/\s+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 解析「一张纸一个学生」的调研表（阶段教学服务调研这类填空表）。
 * 识别到姓名/学校/满分/得分/班排任一关键词即认为是单表模式。
 */
export function parseSingleSheet(text: string, ctx: IntakeContext): ScoreDraft | null {
  const lines = normalizeText(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return null;

  const joined = lines.join(' ');
  // 只有「表单标签」才算一张调研表。表头里的「姓名 / 得分 / 满分」是列表头的词，
  // 不能据此判定成单张表，否则一份带表头的名单会被整段吃掉、只剩一条草稿。
  const isForm = /学员姓名|学生姓名|在读学校|调研/.test(joined);
  if (!isForm) return null;

  const fallback = { score: undefined as number | undefined, totalScore: 100 };
  const nameMatch = /(?:学员姓名|学生姓名|姓名)\s*:?\s*([^\s:：]{1,12})/.exec(joined);
  const schoolMatch = /(?:在读学校|学校)\s*:?\s*([^\s:：]{1,20})/.exec(joined);

  const pair = pickScoreFromText(joined, fallback.totalScore);
  const rank = parseRank(joined);
  const rawName = nameMatch ? nameMatch[1] : '';
  const matched = rawName ? matchStudentName(rawName, ctx.students, ctx.nicknames) : { name: '', confidence: 0, candidates: [] };

  return {
    raw: lines.join(' / '),
    studentName: matched.name,
    confidence: matched.confidence,
    candidates: matched.candidates,
    school: (schoolMatch ? schoolMatch[1] : '') || ctx.school || '',
    score: pair.score ?? 0,
    totalScore: pair.totalScore ?? 100,
    classRank: rank.classRank,
    classSize: rank.classSize,
    subject: ctx.subject,
    problem: pair.score === undefined ? '未识别到得分，请手动填写' : undefined,
  };
}

/** 从整段文本里挑一个最像「得分」的数字（用于单表模式，避免把满分当得分） */
function pickScoreFromText(text: string, fallbackTotal: number): { score?: number; totalScore: number } {
  const totalLabeled = /满分\s*:?\s*(\d+(?:\.\d+)?)/.exec(text);
  const total = totalLabeled ? Number(totalLabeled[1]) : fallbackTotal;
  const scoreLabeled = /得分\s*:?\s*(\d+(?:\.\d+)?)/.exec(text);
  if (scoreLabeled) return { score: Number(scoreLabeled[1]), totalScore: total };
  const pair = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(text);
  if (pair && Number(pair[2]) > Number(pair[1])) return { score: Number(pair[1]), totalScore: Number(pair[2]) };
  return { score: undefined, totalScore: total };
}

/**
 * 解析「一行一个学生」的名单/表格文本。
 * 有表头时按表头语义定位列；没有表头则按「姓名 + 数字」的常见顺序兜底。
 */
export function parseScoreTable(text: string, ctx: IntakeContext): ScoreDraft[] {
  const lines = normalizeText(text).split(/\n+/).map(s => s.replace(/\r/g, '').trim()).filter(Boolean);
  const drafts: ScoreDraft[] = [];

  let header: Record<string, number> | null = null;

  for (const line of lines) {
    const cells = splitCells(line);
    if (!cells.length) continue;

    // 表头行：命中 2 个以上语义列，记为列映射并跳过
    if (HEADER_HINT.test(line) && !/\d{2,}/.test(line)) {
      const map: Record<string, number> = {};
      cells.forEach((cell, index) => {
        const key = headerKey(cell);
        if (key && map[key] === undefined) map[key] = index;
      });
      if (Object.keys(map).length >= 2) { header = map; continue; }
    }

    // 纯标题/说明行
    if (!/\d/.test(line) && cells.length === 1) continue;

    const draft = buildDraftFromCells(cells, header, line, ctx);
    if (draft) drafts.push(draft);
  }

  return drafts;
}

function buildDraftFromCells(
  cells: string[],
  header: Record<string, number> | null,
  line: string,
  ctx: IntakeContext,
): ScoreDraft | null {
  let rawName = '';
  let score: number | undefined;
  let totalScore = 100;
  let classRank: number | undefined;
  let classSize: number | undefined;
  let school = '';

  if (header) {
    rawName = cells[header.name] || '';
    const scoreCell = cells[header.score] || '';
    const totalCell = header.total !== undefined ? cells[header.total] || '' : '';
    score = scoreCell ? Number((scoreCell.match(NUM) || [])[0]) : undefined;
    if (totalCell) {
      const t = Number((totalCell.match(NUM) || [])[0]);
      if (Number.isFinite(t) && t > 0) totalScore = t;
    }
    if (header.rank !== undefined) {
      const r = Number((cells[header.rank] || '').match(NUM)?.[0]);
      if (Number.isFinite(r) && r > 0) classRank = r;
    }
    if (header.size !== undefined) {
      const s = Number((cells[header.size] || '').match(NUM)?.[0]);
      if (Number.isFinite(s) && s > 0) classSize = s;
    }
    school = header.school !== undefined ? cells[header.school] || '' : '';
  } else {
    // 无表头：第一个非纯数字单元格当姓名，其余按「a/b」「名次」规则解析
    const nameCell = cells.find(c => !/^\d+(\.\d+)?$/.test(c));
    rawName = nameCell || '';
    const pair = parseScorePair(line, totalScore);
    score = pair.score;
    if (pair.totalScore) totalScore = pair.totalScore;
    const rank = parseRank(line);
    classRank = rank.classRank;
    classSize = rank.classSize;
  }

  const normalized = normalizeName(rawName);
  if (!normalized) return null;
  // 整行没有数字、也不是姓名，跳过
  if (score === undefined && !classRank) {
    const looksLikeName = ctx.students.some(s => similarity(normalizeName(s), normalized) > 0.5);
    if (!looksLikeName) return null;
  }

  const matched = matchStudentName(normalized, ctx.students, ctx.nicknames);
  const draft: ScoreDraft = {
    raw: line,
    studentName: matched.name,
    confidence: matched.confidence,
    candidates: matched.candidates,
    school: school || ctx.school || '',
    score: score ?? 0,
    totalScore,
    classRank,
    classSize,
    subject: ctx.subject,
    problem: score === undefined ? '未识别到得分' : undefined,
  };
  return draft;
}

export interface IntakeResult {
  drafts: ScoreDraft[];
  mode: 'sheet' | 'table';
}

/** 总入口：先试单表模式，再退回表格模式 */
export function parseIntake(text: string, ctx: IntakeContext): IntakeResult {
  const sheet = parseSingleSheet(text, ctx);
  if (sheet) return { drafts: [sheet], mode: 'sheet' };
  return { drafts: parseScoreTable(text, ctx), mode: 'table' };
}

/** 草稿 → SchoolScore（复用既有字段，不新增结构） */
export function draftToSchoolScore(draft: ScoreDraft, ctx: IntakeContext, id: string): SchoolScore {
  return {
    id,
    studentName: draft.studentName,
    examName: ctx.examName,
    date: ctx.date,
    score: draft.score,
    totalScore: draft.totalScore,
    classRank: draft.classRank,
    classSize: draft.classSize,
    school: draft.school || ctx.school,
    subject: draft.subject || ctx.subject,
    note: draft.note,
    isRecorded: true,
    isImproved: false,
  };
}

/** 去重键：同学生 + 同考试 + 同日期 + 同分数 + 同总分 */
export function scoreDedupKey(score: Pick<SchoolScore, 'studentName' | 'examName' | 'date' | 'score' | 'totalScore'>): string {
  return [score.studentName, score.examName, score.date, score.score, score.totalScore].join('|');
}
