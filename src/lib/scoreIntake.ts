// Excel、粘贴表格和 OCR 共用草稿、人工确认和写入流程。
import type { Class, SchoolScore, SchoolScoreSurvey } from '@/types';

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
  sourceName?: string;
  fields?: Omit<Partial<SchoolScore>, 'id' | 'studentName' | 'examName' | 'date' | 'score' | 'totalScore'>;
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
  gradeRank?: number;
  gradeSize?: number;
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
const RANK_LABELED = /(?:班级排名|班内排名|班排|班名|名次|排名)\s*:?\s*第?\s*(-?\d+)(?:\s*\/\s*(-?\d+))?\s*名?/;
const GRADE_RANK_LABELED = /(?:年级排名|级部排名|年级名次|级排|年排)\s*:?\s*第?\s*(-?\d+)(?:\s*\/\s*(-?\d+))?\s*名?/;
const SCORE_LABELED = /得分\s*:?\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?/;
const RANK_ORDINAL = /第\s*(-?\d+)\s*名/;

function looksLikeRank(a: number, b: number): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && a > 0 && a <= 10 && b >= 20 && a / b < 0.35;
}

/** 无表头时保留「3/45」的名次推断，明确的名次标签优先于分数推断。 */
export function parseScorePair(line: string, fallbackTotal = 100, allowBareNumber = true): { score?: number; totalScore?: number } {
  const text = normalizeText(line).replace(GRADE_RANK_LABELED, '').replace(RANK_LABELED, '').replace(RANK_ORDINAL, '');
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
  const text = normalizeText(line).replace(GRADE_RANK_LABELED, '');
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

function parseLabeledGradeRank(text: string) {
  const rank = GRADE_RANK_LABELED.exec(normalizeText(text));
  return { gradeRank: rank ? Number(rank[1]) : undefined, gradeSize: rank?.[2] ? Number(rank[2]) : undefined };
}

const columnAliases = {
  name: ['姓名', '学员姓名', '学生姓名', '学员', '学生', '名字', '学员名称', '学生名字'],
  score: ['得分', '分数', '成绩', '考试成绩', '考试得分', '原始分', '实际得分', '原始成绩', '实际分数'],
  total: ['满分', '总分', '试卷总分', '卷面满分', '试卷满分', '卷面分', '考试满分', '科目满分'],
  rank: ['班排', '班级排名', '班内排名', '班级名次', '排名', '名次'],
  size: ['班级人数', '班内人数', '班级总人数', '人数', '总人数', '班级参考人数'],
  gradeRank: ['级排', '年排', '年级排名', '级部排名', '年级名次'],
  gradeSize: ['年级人数', '年级总人数', '年级参考人数', '级部人数'],
  school: ['就读学校', '学校', '在读学校', '所在学校'],
  subject: ['科目', '学科', '考试科目'],
  studentCode: ['学号', '学员编号', '学员编码', '学生编号', '学生编码', '学员id'],
  campus: ['校区', '所属校区', '校区名称'],
  grade: ['年级', '在读年级', '所在年级'],
  classType: ['班型', '班级类型', '班型名称', '班级名称'],
  teacherName: ['教师', '老师', '教师姓名', '老师姓名', '任课教师', '任课老师'],
  teacherEmail: ['教师邮箱', '老师邮箱', '任课教师邮箱'],
  fiscalYear: ['财年', '年度', '学年'],
  quarter: ['季度', '学期'],
  convertedScore: ['折算成绩', '折算分数', '折算得分', '折算分', '换算分', '换算得分'],
  isRecorded: ['是否录入', '是否登记', '是否已录入', '是否收分'],
  isImproved: ['是否进步', '是否提分'],
  improvementType: ['进步类型', '提分类型'],
  auditResult: ['审核结果', '审核状态'],
  gradeLevel: ['等级', '年级档位', '档位', '年级排名等级'],
  enrollmentPercent: ['升学比例', '升学率', '录取率', '录取比例'],
  note: ['备注'],
  group: ['班', '班号', '来源班组', '班组', '班级'],
  batchCode: ['班级编号', '班级批次', '批次编号', '教学班编号'],
  reportedRate: ['得分率', '得分率%'],
  rankSource: ['排名来源', '名次来源'],
  classSelection: ['调研表勾选', '调研班级类型'],
  keyClass: ['是否重点班'],
  progress: ['在读进步点'],
  weakness: ['在读弱项'],
  targetScore: ['期末得分目标'],
  targetRank: ['期末排名目标'],
} as const;

type Column = keyof typeof columnAliases;
type Header = Partial<Record<Column, number>>;
const columns = new Map<string, Column>(
  (Object.entries(columnAliases) as [Column, readonly string[]][]).flatMap(([key, aliases]) =>
    aliases.map(alias => [alias, key]),
  ),
);

/** 把一行拆成单元格：优先制表符，其次 2 个以上空格，最后单空格 */
function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  return line.trim().split(/\s+/).map(s => s.trim()).filter(Boolean);
}

function tableHeader(cells: string[]): Header | null {
  const map: Header = {};
  cells.forEach((cell, index) => {
    const label = normalizeText(cell).replace(/\s/g, '').toLowerCase();
    const key = columns.get(label) ?? columns.get(normalizeName(label));
    if (key && map[key] === undefined) map[key] = index;
  });
  if (map.name === undefined || (map.score === undefined && map.total === undefined && map.rank === undefined)) return null;

  // 兼容原系统的 23 列成绩导出，个别历史版本的字段标题不同。
  if (cells.length === 23 && map.name === 0 && map.studentCode === 1 && (map.score === 10 || map.total === 11)) {
    const legacy: Column[] = ['name', 'studentCode', 'campus', 'grade', 'subject', 'classType', 'teacherName',
      'teacherEmail', 'fiscalYear', 'quarter', 'score', 'total', 'convertedScore', 'isRecorded', 'isImproved',
      'improvementType', 'auditResult', 'rank', 'gradeRank', 'size', 'gradeLevel', 'enrollmentPercent', 'school'];
    return { ...Object.fromEntries(legacy.map((key, index) => [key, index])), ...map };
  }
  return map;
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
    ...parseLabeledGradeRank(joined),
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

  let header: Header | null = null;

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
  header: Header | null,
  line: string,
  ctx: IntakeContext,
  exactMatch = false,
): ScoreDraft | null {
  let rawName = '';
  let score: number | undefined;
  let totalScore = 100;
  let classRank: number | undefined;
  let classSize: number | undefined;
  let school = '';
  let subject: string | undefined;
  let gradeRank: number | undefined;
  let gradeSize: number | undefined;
  let fields: ScoreDraft['fields'];

  if (header) {
    const cell = (key: Column) => cells[header[key] ?? -1]?.trim() || '';
    rawName = cell('name');
    const scoreCell = normalizeText(cell('score'));
    const scorePair = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(scoreCell);
    score = scorePair ? Number(scorePair[1]) : readNumber(scoreCell);
    const totalCell = cell('total');
    totalScore = totalCell ? readNumber(totalCell) ?? 0 : (scorePair ? Number(scorePair[2]) : exactMatch ? 0 : 100);
    const rank = readRankCell(cell('rank'));
    const grade = readRankCell(cell('gradeRank'));
    classRank = rank.rank;
    classSize = readNumber(cell('size')) ?? rank.size;
    gradeRank = grade.rank;
    gradeSize = readNumber(cell('gradeSize')) ?? grade.size;
    school = cell('school');
    subject = cell('subject') || undefined;
    const detailColumns = ['studentCode', 'campus', 'grade', 'classType', 'teacherName', 'teacherEmail',
      'fiscalYear', 'quarter', 'improvementType', 'auditResult', 'gradeLevel', 'note'] as const;
    const surveyColumns = ['batchCode', 'group', 'reportedRate', 'rankSource', 'classSelection', 'keyClass',
      'progress', 'weakness', 'targetScore', 'targetRank'] as const;
    const survey: SchoolScoreSurvey = Object.fromEntries(surveyColumns.flatMap(key => cell(key) ? [[key, cell(key)]] : []));
    fields = {
      ...Object.fromEntries(detailColumns.flatMap(key => cell(key) ? [[key, cell(key)]] : [])),
      convertedScore: readNumber(cell('convertedScore')),
      enrollmentPercent: readNumber(cell('enrollmentPercent')),
      isRecorded: cell('isRecorded') ? cell('isRecorded') === '是' : undefined,
      isImproved: cell('isImproved') ? cell('isImproved') === '是' : undefined,
      survey: Object.keys(survey).length ? survey : undefined,
    };
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
    ({ gradeRank, gradeSize } = parseLabeledGradeRank(line));
  }

  const normalized = normalizeName(rawName);
  if (!normalized) return null;
  // 整行没有数字、也不是姓名，跳过
  if (!exactMatch && score === undefined && !classRank && !gradeRank) {
    const looksLikeName = ctx.students.some(s => similarity(normalizeName(s), normalized) > 0.5);
    if (!looksLikeName) return null;
  }

  const matched = exactMatch ? exactRosterMatch(rawName, ctx.students) : matchStudentName(normalized, ctx.students, ctx.nicknames);
  const draft: ScoreDraft = {
    raw: line,
    sourceName: rawName,
    fields,
    studentName: matched.name,
    confidence: matched.confidence,
    candidates: matched.candidates,
    school: school || ctx.school || '',
    score: score ?? 0,
    totalScore,
    classRank,
    classSize,
    gradeRank,
    gradeSize,
    subject,
    problem: score === undefined ? '未识别到得分' : undefined,
  };
  return draft;
}

function exactRosterMatch(input: string, students: string[]): MatchResult {
  const raw = normalizeText(input).replace(/\s/g, '');
  const candidates = students.filter(name => normalizeText(name).replace(/\s/g, '') === raw);
  const name = students.includes(input) ? input : candidates.length === 1 ? candidates[0] : '';
  return { name, confidence: name ? 1 : 0, candidates };
}

export type SchoolScoreRoster = Pick<Class, 'id' | 'name' | 'term' | 'batchCode' | 'students'>;
export type SchoolScoreTarget = { classId: string; studentName: string };

const rosterKey = (value = '') => normalizeText(value).replace(/\s/g, '').toLowerCase();

export function matchSchoolScoreRosters(drafts: ScoreDraft[], rosters: SchoolScoreRoster[]) {
  const names = new Map<string, SchoolScoreTarget[]>();
  const labels = new Map<string, Set<string>>();
  for (const roster of rosters) {
    for (const name of new Set(roster.students)) {
      const key = rosterKey(name);
      const entries = names.get(key) || [];
      entries.push({ classId: roster.id, studentName: name });
      names.set(key, entries);
    }
    for (const label of [roster.batchCode, roster.name]) {
      const key = rosterKey(label);
      if (!key) continue;
      const ids = labels.get(key) || new Set<string>();
      ids.add(roster.id);
      labels.set(key, ids);
    }
  }

  return drafts.map(draft => {
    const matches = names.get(rosterKey(draft.sourceName)) || [];
    const survey = draft.fields?.survey;
    // 短班号可能无法对应系统班名。只有精确命中的班号或班名才作为归班依据。
    const hintedClasses = [survey?.batchCode, survey?.group, draft.fields?.classType]
      .map(label => labels.get(rosterKey(label))).filter(ids => ids !== undefined);
    const candidates = matches.filter(match => hintedClasses.every(ids => ids.has(match.classId)));
    return {
      target: candidates.length === 1 ? candidates[0] : undefined,
      candidates: candidates.length ? candidates : matches,
      reason: candidates.length > 1 ? '同名学员，请指定班级' : matches.length && !candidates.length ? '班级待确认' : '未匹配到学员',
    };
  });
}

function readRankCell(cell: string): { rank?: number; size?: number } {
  const match = /^(?:第\s*)?(-?\d+)\s*名?(?:\s*\/\s*(-?\d+)\s*人?)?$/.exec(normalizeText(cell));
  return match ? { rank: Number(match[1]), size: match[2] === undefined ? undefined : Number(match[2]) } : {};
}

export async function parseSchoolScoreWorkbook(file: File, ctx: IntakeContext) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const full = workbook.SheetNames.find(name => normalizeText(name) === '全量明细');
  const sheets = full ? [full] : workbook.SheetNames;
  for (const sheet of sheets) {
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheet], { header: 1, raw: false, defval: '' });
    const headerIndex = rows.findIndex(cells => tableHeader(cells)?.score !== undefined);
    if (headerIndex < 0) continue;
    const header = tableHeader(rows[headerIndex]);
    const drafts = rows.slice(headerIndex + 1).flatMap(cells => {
      if (tableHeader(cells)) return [];
      const draft = buildDraftFromCells(cells, header, cells.join('\t'), ctx, true);
      return draft ? [draft] : [];
    });
    return { sheet, drafts };
  }
  throw new Error('未找到包含「姓名」和「得分」的成绩明细工作表');
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

export function draftToSchoolScore(draft: ScoreDraft, ctx: IntakeContext): Omit<SchoolScore, 'id'> {
  return {
    ...draft.fields,
    studentName: draft.studentName,
    examName: ctx.examName.trim(),
    date: ctx.date,
    score: draft.score,
    totalScore: draft.totalScore,
    classRank: draft.classRank,
    classSize: draft.classSize,
    gradeRank: draft.gradeRank,
    gradeSize: draft.gradeSize,
    school: draft.school?.trim() || ctx.school,
    subject: draft.subject?.trim() || ctx.subject?.trim() || undefined,
    note: draft.note || draft.fields?.note,
    isRecorded: draft.fields?.isRecorded ?? true,
    isImproved: draft.fields?.isImproved ?? false,
  };
}

export function schoolScoreIssue({ score, totalScore, classRank, classSize, gradeRank, gradeSize }: Partial<SchoolScore>): string | undefined {
  if (score === undefined || totalScore === undefined || !Number.isFinite(score) || !Number.isFinite(totalScore) ||
      totalScore <= 0 || score < 0 || score > totalScore) return '得分须在 0 和满分之间，满分需大于 0';
  if (classRank !== undefined && (!Number.isInteger(classRank) || classRank < 1)) return '班排须为正整数';
  if (classSize !== undefined && (!Number.isInteger(classSize) || classSize < 1 ||
      (classRank !== undefined && classRank > classSize))) return '班级人数须为正整数且不小于班排';
  if (gradeRank !== undefined && (!Number.isInteger(gradeRank) || gradeRank < 1)) return '年级排名须为正整数';
  if (gradeSize !== undefined && (!Number.isInteger(gradeSize) || gradeSize < 1 ||
      (gradeRank !== undefined && gradeRank > gradeSize))) return '年级人数须为正整数且不小于级排';
}

/**
 * 从文件名里猜考试日期：`期中英语成绩汇总-2026-11-22.xlsx` → `2026-11-22`。
 * Excel 导入本身不带日期，让用户每次手填既麻烦又容易漏（漏了按钮是灰的，点了没反应）。
 */
export function guessDateFromFileName(name: string): string {
  const match = /(20\d{2})\s*[-_.年/]?\s*(\d{1,2})\s*[-_.月/]?\s*(\d{1,2})/.exec(String(name || ''));
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

export function schoolScoreEntryKey(score: SchoolExam & Pick<SchoolScore, 'studentName'>): string {
  return JSON.stringify([score.studentName, schoolExamKey(score)]);
}

type SchoolScoreEntry = SchoolExam & Pick<SchoolScore, 'studentName' | 'classId'>;

export function sameSchoolScoreEntry(a: SchoolScoreEntry, b: SchoolScoreEntry): boolean {
  return schoolScoreEntryKey(a) === schoolScoreEntryKey(b) && (!a.classId || !b.classId || a.classId === b.classId);
}

export function schoolScoreInClass(score: SchoolScore, classId: string): boolean {
  return !score.classId || score.classId === classId;
}

export type SchoolRankScope = 'class' | 'grade';

export function schoolRank(score: SchoolScore | undefined, scope: SchoolRankScope) {
  if (!score) return;
  const rank = scope === 'class' ? score.classRank : score.gradeRank;
  const size = scope === 'class' ? score.classSize : score.gradeSize;
  if (rank === undefined || !Number.isInteger(rank) || rank < 1 || (size !== undefined && (!Number.isInteger(size) || rank > size))) return;
  const source = score.survey?.rankSource?.trim() || '';
  const method = source === '部分问卷' ? (scope === 'class' ? '问卷' : '计算') : source;
  const cohort = method === '计算'
    ? (scope === 'class' ? [score.grade, score.survey?.group].filter(Boolean).join(' · ') : score.grade)
    : score.school?.trim();
  return { rank, size, method, cohort, label: size ? `${rank}/${size}` : `第${rank}名` };
}

export function schoolRankChange(a: SchoolScore | undefined, b: SchoolScore | undefined, scope: SchoolRankScope) {
  const from = schoolRank(a, scope);
  const to = schoolRank(b, scope);
  if (!from || !to) return { from, to };
  const scopeChanged = from.method !== to.method ||
    (!!from.cohort && !!to.cohort && from.cohort !== to.cohort) ||
    (from.method === '计算' && (!from.cohort || !to.cohort || from.size === undefined || from.size !== to.size));
  return { from, to, scopeChanged, delta: scopeChanged ? undefined : from.rank - to.rank };
}

export function schoolRankLabel(score: SchoolScore, scope: SchoolRankScope): string {
  const rank = schoolRank(score, scope);
  if (!rank) return '—';
  return rank.method ? `${rank.label} · ${rank.method}` : rank.label;
}
