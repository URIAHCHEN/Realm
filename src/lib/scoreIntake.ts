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
  return normalizeCells(input).trim();
}

function normalizeCells(input: string): string {
  return toHalf(String(input || ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/：/g, ':');
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
  if (!best || best.score < 0.6 || best.score === scored[1]?.score) {
    return { name: '', confidence: best?.score || 0, candidates: scored.slice(0, 3).map(s => s.name) };
  }
  return { name: best.name, confidence: Number(best.score.toFixed(2)), candidates: scored.slice(0, 3).map(s => s.name) };
}

const NUM = /-?\d+(?:\.\d+)?/g;
const SCORE_PAIR = /(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/;
const RANK_LABELED = /(?:班级排名|班内排名|年级排名|班排|班名|名次|排名)\s*:?\s*第?\s*(-?\d+)(?:\s*\/\s*(-?\d+))?\s*名?/;
const SCORE_LABELED = /得分\s*:?\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?/;
const RANK_ORDINAL = /第\s*(-?\d+)\s*名/;

function looksLikeRank(a: number, b: number): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && a > 0 && a <= 10 && b >= 20 && a / b < 0.35;
}

/** 无表头时保留「3/45」的名次推断，明确的名次标签优先于分数推断。 */
export function parseScorePair(line: string, fallbackTotal = 100, allowBareNumber = true): { score?: number; totalScore?: number } {
  const text = normalizeText(line).replace(RANK_LABELED, '').replace(RANK_ORDINAL, '');
  const totalLabeled = /满分\s*:?\s*(-?\d+(?:\.\d+)?)/.exec(text);
  const scoreLabeled = SCORE_LABELED.exec(text);
  if (scoreLabeled) {
    return {
      score: Number(scoreLabeled[1]),
      totalScore: Number(totalLabeled?.[1] ?? scoreLabeled[2] ?? fallbackTotal),
    };
  }

  const pair = SCORE_PAIR.exec(text);
  if (pair && !looksLikeRank(Number(pair[1]), Number(pair[2]))) {
    return { score: Number(pair[1]), totalScore: Number(totalLabeled?.[1] ?? pair[2]) };
  }
  if (totalLabeled) return { totalScore: Number(totalLabeled[1]) };
  if (pair || !allowBareNumber) return {};

  const numbers = text.match(NUM);
  return numbers?.length === 1 ? { score: Number(numbers[0]), totalScore: fallbackTotal } : {};
}

/** 明确标签下支持末位与单人班。没有标签的分数对不重复推断成名次。 */
export function parseRank(line: string): { classRank?: number; classSize?: number } {
  const text = normalizeText(line);
  const labeled = RANK_LABELED.exec(text) ?? RANK_ORDINAL.exec(text);
  if (labeled) {
    return { classRank: Number(labeled[1]), classSize: labeled[2] !== undefined ? Number(labeled[2]) : undefined };
  }
  const pair = SCORE_PAIR.exec(text.replace(SCORE_LABELED, ''));
  if (pair && looksLikeRank(Number(pair[1]), Number(pair[2]))) {
    return { classRank: Number(pair[1]), classSize: Number(pair[2]) };
  }
  return {};
}

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
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  return line.trim().split(/\s+/).map(s => s.trim()).filter(Boolean);
}

function tableHeader(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((cell, index) => {
    if (/[:\d]/.test(cell)) return;
    const key = headerKey(cell);
    if (key && map[key] === undefined) map[key] = index;
  });
  return map.name !== undefined && (map.score !== undefined || map.total !== undefined || map.rank !== undefined) ? map : null;
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

  const nameMatch = /(?:学员姓名|学生姓名|姓名)\s*:?\s*([^\s:：]{1,12})/.exec(joined);
  const schoolMatch = /(?:在读学校|学校)\s*:?\s*([^\s:：]{1,20})/.exec(joined);

  const pair = parseScorePair(joined, 100, false);
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
    problem: pair.score === undefined ? '未识别到得分，请手动填写' : undefined,
  };
}

/**
 * 解析「一行一个学生」的名单/表格文本。
 * 有表头时按表头语义定位列；没有表头则按「姓名 + 数字」的常见顺序兜底。
 */
export function parseScoreTable(text: string, ctx: IntakeContext): ScoreDraft[] {
  const lines = normalizeCells(text).split(/\r?\n/).filter(line => line.trim());
  const drafts: ScoreDraft[] = [];

  let header: Record<string, number> | null = null;

  for (const line of lines) {
    const cells = splitCells(line);
    if (!cells.length) continue;

    const detected = tableHeader(cells);
    if (detected) { header = detected; continue; }

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
  let subject: string | undefined;

  if (header) {
    rawName = cells[header.name] || '';
    const scoreCell = cells[header.score] || '';
    const totalCell = header.total !== undefined ? cells[header.total] || '' : '';
    const scorePair = SCORE_PAIR.exec(scoreCell);
    score = scorePair ? Number(scorePair[1]) : readNumber(scoreCell);
    totalScore = readNumber(totalCell) ?? (scorePair ? Number(scorePair[2]) : 100);
    const rankCell = cells[header.rank] || '';
    const rank = rankCell.match(SCORE_PAIR)
      ? parseRank('班排 ' + rankCell)
      : { classRank: readNumber(rankCell), classSize: undefined };
    classRank = rank.classRank;
    classSize = readNumber(cells[header.size] || '') ?? rank.classSize;
    school = cells[header.school] || '';
    subject = cells[header.subject] || undefined;
  } else {
    // 无表头：第一个非纯数字单元格当姓名，其余按「a/b」「名次」规则解析
    const nameCell = cells.find(c => !/^\d+(\.\d+)?$/.test(c));
    rawName = nameCell || '';
    const pair = parseScorePair(line, totalScore);
    score = pair.score;
    if (pair.totalScore !== undefined) totalScore = pair.totalScore;
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
    subject,
    problem: score === undefined ? '未识别到得分' : undefined,
  };
  return draft;
}

function readNumber(cell: string): number | undefined {
  const value = cell.match(NUM)?.[0];
  return value !== undefined ? Number(value) : undefined;
}

export interface IntakeResult {
  drafts: ScoreDraft[];
  mode: 'sheet' | 'table';
}

/** 总入口：先试单表模式，再退回表格模式 */
export function parseIntake(text: string, ctx: IntakeContext): IntakeResult {
  const lines = normalizeCells(text).split(/\r?\n/);
  const headerIndex = lines.findIndex(line => tableHeader(splitCells(line)));
  if (headerIndex !== -1) return { drafts: parseScoreTable(lines.slice(headerIndex).join('\n'), ctx), mode: 'table' };
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

export function schoolScoreIssue({ score, totalScore, classRank, classSize, gradeRank }: Partial<SchoolScore>): string | undefined {
  if (score === undefined || totalScore === undefined || !Number.isFinite(score) || !Number.isFinite(totalScore) ||
      totalScore <= 0 || score < 0 || score > totalScore) return '得分须在 0 和满分之间，满分需大于 0';
  if (classRank !== undefined && (!Number.isInteger(classRank) || classRank < 1)) return '班排须为正整数';
  if (classSize !== undefined && (!Number.isInteger(classSize) || classSize < 1 ||
      (classRank !== undefined && classRank > classSize))) return '班级人数须为正整数且不小于班排';
  if (gradeRank !== undefined && (!Number.isInteger(gradeRank) || gradeRank < 1)) return '年级排名须为正整数';
}

export function schoolScoreDate(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

type SchoolExam = Pick<SchoolScore, 'examName' | 'date' | 'subject'>;

// 兼容未填写科目的旧英语成绩。
export function schoolScoreSubject(score: Pick<SchoolScore, 'subject'>): string {
  return score.subject?.trim() || '英语';
}

export function schoolExamKey(score: SchoolExam): string {
  return JSON.stringify([score.examName.trim(), score.date, schoolScoreSubject(score)]);
}

export function scoreDedupKey(score: Pick<SchoolScore, 'studentName' | 'examName' | 'date' | 'score' | 'totalScore' | 'subject'>): string {
  return JSON.stringify([score.studentName, schoolExamKey(score), score.score, score.totalScore]);
}
