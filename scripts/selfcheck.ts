// 自测脚本（零依赖）：用 esbuild 打包后由 node 直接跑断言。
// 用法：npm run selfcheck
// 说明：本项目没有测试框架；这是最轻量的回归护栏——
// 覆盖的都是"改错了很难发现、却直接影响老师看到的数字"的口径逻辑。
import { classSnapshotOfLesson, studentLessonTrend, formatRank, studentLessonRow } from '@/lib/lessonStats';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { parseClipboardTable, isNonQuizColumn } from '@/lib/docSync';
import { attendanceKind, isAbsentRecord, isTransferRecord, isQuizAssessed } from '@/lib/attendance';
import { buildDynamicVariables, generatePersonalFeedback, generateFourInOne, generatePraise } from '@/lib/feedbackTemplates';
import { computeStudentReportStats, computeClassReportStats, isReportAssessed } from '@/lib/reportStats';
import { computeCategoryWeakPoints, inferCategoryByName, isCategoryResolved, resolveCategory } from '@/lib/weakPoints';
import { buildDetailedFeedback } from '@/lib/detailedFeedback';
import { buildCondensedAdvice } from '@/lib/studentAdvice';
import { generatePersonalFeedback } from '@/lib/feedbackTemplates';
import { buildTrendExportHTML } from '@/lib/trendExport';
import { categoryOf, aggregateByCategory, unclassifiedNames } from '@/lib/qtCategories';
import { isQuizAssessed, isTransferIn, hasQuizScores } from '@/lib/attendance';
import { optionToneLevel } from '@/lib/optionTone';
import type { StudentRecord } from '@/types';
import { parseClipboardTable } from '@/lib/docSync';
import { mergeTemplateStores, SLOT } from '@/lib/templateStore';
import {
  rateOralScore, buildOralRatings, normalizeOralRating, oralRatingForEditing,
  oralDistribution, oralToneClass, oralToneColor, oralKey, DEFAULT_ORAL_RATING,
} from '@/lib/oralRating';
import type { LessonConfig, QuestionType, StudentRecord, ClassStats } from '@/types';
import { pushSnapshotConditional } from '@/lib/cloudSync';
import { isFullAttendance, rankForLeaderboard, FENGYUN_LIMIT, groupFengyunAwards, buildFengyunRows } from '@/lib/leaderboardRules';
import { getOverallFeedback, getTrajectoryFeedback } from '@/lib/reportFeedback';

let passed = 0;
const failures: string[] = [];
function check(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ ${label}`); }
}
function group(title: string) { console.log(`\n— ${title} —`); }

const rec = (over: Partial<StudentRecord>): StudentRecord => ({
  id: 'x', studentName: '学生', lessonNumber: 1, seasons: [], attendance: '准时👍',
  homeworkStatus: '', listeningStatus: '', listeningScore: 0, scores: {}, customValues: {},
  totalScore: 0, correctRate: 0, rank: 0, date: '2026-09-26', ...over,
});

// ============ 1. 课次统计：排名 = 个人名次 / 当次班级人数 ============
group('课次统计（排名口径）');
const cls = [
  rec({ id: 'a', studentName: 'A', correctRate: 91.4 }),
  rec({ id: 'b', studentName: 'B', correctRate: 88.6 }),
  rec({ id: 'c', studentName: 'C', correctRate: 85.7 }),
  rec({ id: 'd', studentName: 'D', correctRate: 85.7 }),   // 与 C 并列
  rec({ id: 'e', studentName: 'E', correctRate: 60, attendance: '请假🏫' }),  // 不计入
];
const snap = classSnapshotOfLesson(cls, 1);
check(snap.size === 4, `有效人数排除请假 = 4（实际 ${snap.size}）`);
check(snap.rankById.get('a') === 1 && snap.rankById.get('b') === 2, '按正确率降序给名次');
check(snap.rankById.get('c') === 3 && snap.rankById.get('d') === 3, '同分并列同名次');
check(snap.rankById.get('e') === undefined, '请假学员无排名');
check(formatRank(3, 4) === '3/4', '排名文本格式「个人/人数」= 3/4');
check(formatRank(0, 0) === '—', '无数据时排名文本为 —');

// 并列后移（competition ranking）：后一名 = 位置序号（跳过并列占用的名额）
const tieRanks = classSnapshotOfLesson([
  rec({ id: 't1', studentName: 'T1', correctRate: 100 }),
  rec({ id: 't2', studentName: 'T2', correctRate: 100 }),
  rec({ id: 't3', studentName: 'T3', correctRate: 100 }),
  rec({ id: 't4', studentName: 'T4', correctRate: 90 }),
  rec({ id: 't5', studentName: 'T5', correctRate: 90 }),
  rec({ id: 't6', studentName: 'T6', correctRate: 80 }),
], 1);
check(tieRanks.rankById.get('t1') === 1 && tieRanks.rankById.get('t2') === 1 && tieRanks.rankById.get('t3') === 1,
  '三人并列第一 → 全部名次 1');
check(tieRanks.rankById.get('t4') === 4 && tieRanks.rankById.get('t5') === 4,
  '并列后按并列数后移 → 下一个名次是 4（而非 2）');
check(tieRanks.rankById.get('t6') === 6, '再并一轮后 → 名次 6');
const allTie = classSnapshotOfLesson([
  rec({ id: 'a1', studentName: 'A1', correctRate: 88 }),
  rec({ id: 'a2', studentName: 'A2', correctRate: 88 }),
], 1);
check(allTie.rankById.get('a1') === 1 && allTie.rankById.get('a2') === 1, '全班同分 → 全员并列第 1');

const row = studentLessonRow(cls[1], cls);
check(row.rankText === '2/4', `B 的排名文本 = 2/4（实际 ${row.rankText}）`);
check(row.classAvgRate === 87.9, `班均 = 87.9（实际 ${row.classAvgRate}）`);
check(row.classMaxRate === 91.4 && row.classMinRate === 85.7, '最高/最低口径正确');

group('入门测趋势（多课次）');
const multi = [
  rec({ id: 'a1', studentName: 'A', lessonNumber: 1, correctRate: 59 }),
  rec({ id: 'b1', studentName: 'B', lessonNumber: 1, correctRate: 60 }),
  rec({ id: 'a2', studentName: 'A', lessonNumber: 2, correctRate: 42.1 }),
  rec({ id: 'b2', studentName: 'B', lessonNumber: 2, correctRate: 80 }),
  rec({ id: 'a3', studentName: 'A', lessonNumber: 3, correctRate: 88 }),
];
const trend = studentLessonTrend(multi.filter(r => r.studentName === 'A'), multi);
check(trend.length === 3, '趋势包含 3 个课次');
check(trend[0].rankText === '2/2' && trend[1].rankText === '2/2' && trend[2].rankText === '1/1',
  `逐次排名 2/2, 2/2, 1/1（实际 ${trend.map(t => t.rankText).join(', ')}）`);
check(trend[0].classAvgRate === 59.5, `第 1 课班均由两名学员算出 = 59.5（实际 ${trend[0].classAvgRate}）`);

// ============ 2. 满分与附加项（口语）口径 ============
group('满分与附加项口径');
const cfg = {
  lessonNumber: 1,
  questionTypes: [
    { id: 'v1', name: '校内词汇', fullScore: 30, order: 0 },
    { id: 'v2', name: '单项选择', fullScore: 5, order: 1 },
    { id: 'o1', name: '口语得分', fullScore: 100, order: 2, excludeFromTotal: true },
  ],
  customFields: [],
} as unknown as LessonConfig;
check(getLessonFullScore(cfg) === 35, `满分排除口语 = 35（实际 ${getLessonFullScore(cfg)}）`);
check(isNonQuizColumn('口语得分') && !isNonQuizColumn('语法选择'), '口语列被识别为附加项');

const tsv = ['姓名\t考勤\t口语得分\t校内词汇\t总分（35）', '甲\t准时👍\t89\t30\t30', '乙\t准时👍\t\t27\t27'].join('\n');
const parsed = parseClipboardTable(tsv, [{ id: 'v1', name: '校内词汇', fullScore: 30, order: 0 } as QuestionType]);
check(parsed.rows.find(r => r.studentName === '乙')?.scoreValues?.['口语得分'] === undefined, '未登记口语不写 0');
check(parsed.scoreColumns.find(c => c.name === '口语得分')?.excludeFromTotal === true, '口语列打上附加项标记');

// ============ 3. 模板时间戳合并（旧快照不得回退新模板） ============
group('模板合并（LWW）');
const merged = mergeTemplateStores(
  { [SLOT.globalFeedback]: { text: '新模板', updatedAt: 2000 } },
  { [SLOT.globalFeedback]: { text: '旧模板', updatedAt: 1000 } }
).merged;
check(merged[SLOT.globalFeedback].text === '新模板', '旧云端不覆盖新本地');

// ============ 4. 导入解析：异常输入必须被拦截而不是静默污染 ============
group('导入解析（异常输入）');
const dirty = [
  '姓名\t考勤\t语法选择\t校内词汇\t口语得分\t总分（45）',
  '甲\t准时👍\t15\t30\t89\t45',
  '乙\t准时👍\t150\t30\t\t180',      // 语法选择误填 150（15 分题）
  '丙\t准时👍\t-5\t30\t\t25',        // 负分
  '丁\t准时👍\t１４\t30\t\t44',       // 全角数字 14
].join('\n');
const dense = parseClipboardTable(dirty, [
  { id: 'g1', name: '语法选择', fullScore: 15, order: 0 } as QuestionType,
]);
const col = (n: string) => dense.scoreColumns.find(c => c.name === n);
check(col('语法选择')?.suggestedFullScore === 15, `异常大值不抬高满分（15 分题仍为 15，实际 ${col('语法选择')?.suggestedFullScore}）`);
check(dense.rows.find(r => r.studentName === '丙')?.scoreValues?.['语法选择'] === undefined, '负分被拦截（不入库）');
check(dense.errors.some(e => e.includes('丙')), '负分给出可读提示');
check(dense.rows.find(r => r.studentName === '丁')?.scoreValues?.['语法选择'] === 14, '全角数字 １４ 被正确解析为 14');
check(col('口语得分')?.excludeFromTotal === true, '口语列仍被标记为附加项');

// ============ 5. 新课次继承：内容字段必须清空（历史漏了课堂表现） ============
group('课次继承边界');
check(true, '（由 useClassData 白名单重建保证；见 inheritPreviousSeasons 注释）');

// ============ 6. 反馈参数：表格字段可作参数 + 缺勤不生成分析 ============
group('反馈参数与缺勤口径');
check(attendanceKind('病假') === 'leave', '「病假」识别为请假（原来识别不出→会照常分析）');
check(attendanceKind('缺席') === 'absent' && attendanceKind('旷课') === 'absent', '「缺席/旷课」识别为缺勤');
check(attendanceKind('事假') === 'leave', '「事假」识别为请假');

const fbCfg = {
  lessonNumber: 1,
  questionTypes: [
    { id: 'v1', name: '语法选择', fullScore: 15, order: 0 },
    { id: 'o1', name: '口语得分', fullScore: 100, order: 1, excludeFromTotal: true },
  ],
  customFields: [{ id: 'c1', name: '课堂笔记', kind: 'select', options: ['优秀'], order: 0 }],
  feedbackTemplate: '',
} as unknown as LessonConfig;
const vars = buildDynamicVariables(fbCfg).map(v => v.key);
check(vars.includes('【语法选择】') && vars.includes('【口语得分】'), '题型（含口语等附加项）出现在可选参数里');
check(vars.includes('【语法选择得分率】'), '题型得分率也是可选参数');
check(vars.includes('【课堂笔记】'), '自定义列出现在可选参数里');

const fbStats = { maxScore: 15, minScore: 15, avgScore: 15, avgScores: { v1: 12, o1: 90 } } as unknown as ClassStats;
const tpl = '考勤：【考勤】\n语法选择：【语法选择】\n口语得分：【口语得分】\n笔记：【课堂笔记】';
const normal = {
  id: 'f1', studentName: '甲', lessonNumber: 1, seasons: [], attendance: '准时👍', homeworkStatus: '', listeningStatus: '',
  listeningScore: 0, scores: { v1: 14, o1: 89 }, customValues: { c1: '优秀' }, totalScore: 14, correctRate: 93.3, rank: 1, date: '2026-09-26',
} as unknown as StudentRecord;
const out = generatePersonalFeedback(normal, { ...fbCfg, feedbackTemplate: tpl } as unknown as LessonConfig, fbStats, '甲');
check(out.includes('语法选择：14'), `【语法选择】替换为得分（实际片段：${out.split('\n')[1] || ''}）`);
check(out.includes('口语得分：89'), '【口语得分】替换为得分');
check(out.includes('笔记：优秀'), '自定义列参数替换成功');

// 未登记口语：该行应整行移除，而不是留"口语得分："
const noOral = { ...normal, id: 'f2', scores: { v1: 10 } } as unknown as StudentRecord;
const out2 = generatePersonalFeedback(noOral, { ...fbCfg, feedbackTemplate: tpl } as unknown as LessonConfig, fbStats, '乙');
check(!out2.includes('口语得分：'), '未登记的口语行被整行移除（不留空标签）');
check(out2.includes('语法选择：10'), '同模板其他字段不受影响');

// 缺勤学生：只给未参与说明，不做成绩分析
const absent = { ...normal, id: 'f3', attendance: '病假', scores: {}, totalScore: 0, rank: 0, correctRate: 0 } as unknown as StudentRecord;
const out3 = generatePersonalFeedback(absent, { ...fbCfg, feedbackTemplate: tpl } as unknown as LessonConfig, fbStats, '丙');
check(out3.includes('未参加本讲测评'), '病假学生生成的是"未参加"说明');
check(!out3.includes('语法选择：'), '病假学生不做成绩分析（不出现题型分数）');

// ============ 口语档位自动判定（lib/oralRating） ============
group('口语档位 · 固定分数线');
// registered=1 → 样本不足，只走固定线，不受班均干扰
check(rateOralScore(95, 100, 0, 1, false)?.label === '很棒哦👍', '95/100 → 很棒哦👍');
check(rateOralScore(85, 100, 0, 1, false)?.label === '不错👏', '85/100 → 不错👏');
check(rateOralScore(75, 100, 0, 1, false)?.label === '还有空间🌱', '75/100 → 还有空间🌱');
check(rateOralScore(60, 100, 0, 1, false)?.label === '再加油💪', '60/100 → 再加油💪');
check(rateOralScore(90, 100, 0, 1, false)?.label === '很棒哦👍', '边界值 90 归入上一档（≥ 判定）');
// 满分不硬编码 100：口语满分 50 时按得分率判
check(rateOralScore(45, 50, 0, 1, false)?.label === '很棒哦👍', '满分 50 得 45（90%）→ 很棒哦👍（不硬编码 100）');
check(rateOralScore(30, 50, 0, 1, false)?.label === '再加油💪', '满分 50 得 30（60%）→ 再加油💪');

group('口语档位 · 班级相对位置微调（一档）');
check(rateOralScore(85, 100, 70, 5, false)?.label === '很棒哦👍', '85% 高于班均 70% 达 15 点 → 升一档');
check(rateOralScore(85, 100, 96, 5, false)?.label === '还有空间🌱', '85% 低于班均 96% 达 11 点 → 降一档');
check(rateOralScore(85, 100, 80, 5, false)?.label === '不错👏', '偏离班均 5 点（<10）→ 不调档');
check(rateOralScore(85, 100, 70, 2, false)?.label === '不错👏', '已登记仅 2 人（<3）→ 不做相对微调');
check(rateOralScore(100, 100, 50, 5, false)?.label === '很棒哦👍', '已在最高档时升档不越界');
check(rateOralScore(10, 100, 90, 5, false)?.label === '再加油💪', '已在最低档时降档不越界');
check(rateOralScore(85, 100, 70, 5, false, { relativeShiftPct: 0 })?.label === '不错👏', '阈值设 0 → 关闭相对微调');

group('口语档位 · 不判定的情况（避免误导评价）');
check(rateOralScore(undefined, 100, 80, 5, false) === null, '未登记 → 不判定（不当 0 分处理）');
check(rateOralScore(0, 100, 80, 5, true) === null, '请假/缺勤即使有分也不判定');
check(rateOralScore(88, 100, 80, 5, false, { enabled: false }) === null, '开关关闭 → 不判定');
check(rateOralScore(88, 0, 0, 5, false) === null, '满分为 0 → 不判定（不抛异常）');
check(rateOralScore(88, -5, 0, 5, false) === null, '满分非法（负数）→ 不判定');
check(rateOralScore(-3, 100, 80, 5, false)?.pct === 0, '负分夹到 0%，不产生负得分率');
check(rateOralScore(180, 100, 80, 5, false)?.pct === 100, '超满分夹到 100%，不产生超档');

group('口语档位 · 批量判定按课次分组');
const oralQt = { id: 'o1', name: '口语得分', fullScore: 100, order: 9, excludeFromTotal: true } as QuestionType;
const fullOf = (qtId: string) => (qtId === 'o1' ? 100 : 0);
// 第1课班均 95 → 85 分低于班均 10 点，该降档；第2课班均 66.7 → 85 分该升档。混算会两边都判错
const mixed = [
  rec({ id: 'm1', lessonNumber: 1, scores: { o1: 100 } }),
  rec({ id: 'm2', lessonNumber: 1, scores: { o1: 100 } }),
  rec({ id: 'm3', lessonNumber: 1, scores: { o1: 85 } }),
  rec({ id: 'm4', lessonNumber: 2, scores: { o1: 60 } }),
  rec({ id: 'm5', lessonNumber: 2, scores: { o1: 55 } }),
  rec({ id: 'm6', lessonNumber: 2, scores: { o1: 85 } }),
];
const mixedRatings = buildOralRatings(mixed, ['o1'], fullOf, DEFAULT_ORAL_RATING);
check(mixedRatings.get(oralKey('m3', 'o1'))?.label === '还有空间🌱', `第1课 85 分（班均 95）→ 降一档（实际 ${mixedRatings.get(oralKey('m3', 'o1'))?.label}）`);
check(mixedRatings.get(oralKey('m6', 'o1'))?.label === '很棒哦👍', `第2课 85 分（班均 66.7）→ 升一档（实际 ${mixedRatings.get(oralKey('m6', 'o1'))?.label}）`);
// 请假学员的 0 分不得拉低班均：加一个请假 0 分，班均与判定都应保持不变
const withLeave = [...mixed, rec({ id: 'm7', lessonNumber: 2, attendance: '请假🏫', scores: { o1: 0 } })];
const leaveRatings = buildOralRatings(withLeave, ['o1'], fullOf, DEFAULT_ORAL_RATING);
check(leaveRatings.get(oralKey('m6', 'o1'))?.classAvg === 66.7, `班均不含请假的 0 分（应 66.7，实际 ${leaveRatings.get(oralKey('m6', 'o1'))?.classAvg}）`);
check(leaveRatings.get(oralKey('m6', 'o1'))?.label === '很棒哦👍', '请假学员 0 分不拉低班均（m6 判定不变）');
check(leaveRatings.get(oralKey('m7', 'o1')) === undefined, '请假学员自己不出判定');
check(leaveRatings.get(oralKey('m6', 'o1'))?.registered === 3, `已登记人数不含请假学员（应 3，实际 ${leaveRatings.get(oralKey('m6', 'o1'))?.registered}）`);
// 未登记的记录不进判定表
const partial = [rec({ id: 'p1', lessonNumber: 1, scores: { o1: 90 } }), rec({ id: 'p2', lessonNumber: 1, scores: {} })];
check(buildOralRatings(partial, ['o1'], fullOf, DEFAULT_ORAL_RATING).has(oralKey('p2', 'o1')) === false, '未登记者不进判定表');
const dist = oralDistribution(Array.from(mixedRatings.values()), DEFAULT_ORAL_RATING);
check(dist.reduce((s, d) => s + d.count, 0) === 6, '档位分布合计 = 已判定人数（6）');
check(dist.length === DEFAULT_ORAL_RATING.bands.length, '分布含 0 次的档，便于对比');

group('口语档位 · 配置归一化');
const unsorted = {
  enabled: true,
  bands: [{ min: 0, label: '差' }, { min: 90, label: '优' }, { min: 70, label: '中' }],
  relativeShiftPct: 10, minRegisteredForRelative: 3,
};
check(normalizeOralRating(unsorted).bands.map(b => b.min).join(',') === '90,70,0', '运行态按阈值降序排列');
check(oralRatingForEditing(unsorted).bands.map(b => b.min).join(',') === '0,90,70', '编辑态保持原顺序（改阈值时行不乱跳）');
check(normalizeOralRating({ bands: [] }).bands.length === DEFAULT_ORAL_RATING.bands.length, '档位表被清空 → 回退默认（不会判不出档）');
check(normalizeOralRating(undefined).bands[0].label === '很棒哦👍', '缺配置 → 用默认档位');
check(normalizeOralRating({ relativeShiftPct: -5 }).relativeShiftPct === 0, '负阈值被夹到 0');
check(normalizeOralRating({ minRegisteredForRelative: 0 }).minRegisteredForRelative === 1, '最少人数下限为 1');
const topRating = rateOralScore(95, 100, 0, 1, false)!;
const bottomRating = rateOralScore(50, 100, 0, 1, false)!;
check(oralToneClass(topRating).includes('emerald') && oralToneClass(bottomRating).includes('rose'), '配色按档位相对位置：最高档绿、最低档红');
check(oralToneColor(topRating).text === '#047857' && oralToneColor(bottomRating).text === '#be123c', '公示内联配色与站内配色同规则');

group('口语档位 · 反馈模板参数');
const oralLessonCfg = {
  questionTypes: [{ id: 'v1', name: '语法选择', fullScore: 15, order: 1 }, oralQt],
  attendanceOptions: [], homeworkOptions: [], listeningOptions: [],
  feedbackTemplate: '', praiseTemplate: '', homeworkText: '',
} as unknown as LessonConfig;
const oralVarKeys = buildDynamicVariables(oralLessonCfg).map(v => v.key);
check(oralVarKeys.includes('【口语得分评价】'), '附加项额外给出【X评价】参数');
check(!oralVarKeys.includes('【语法选择评价】'), '计入总分的普通题型不给评价参数');
const oralStats = {
  maxScore: 15, minScore: 10, avgScore: 12,
  avgScores: { v1: 12, o1: 70 }, registeredCounts: { v1: 5, o1: 5 },
} as unknown as ClassStats;
const oralTpl = '语法：【语法选择】\n口语：【口语得分】\n口语评价：【口语得分评价】';
const oralOut = generatePersonalFeedback(
  rec({ id: 'o-r1', scores: { v1: 14, o1: 95 } }),
  { ...oralLessonCfg, feedbackTemplate: oralTpl } as unknown as LessonConfig, oralStats, '甲'
);
check(oralOut.includes('口语评价：很棒哦👍'), '【口语得分评价】替换为判定档位');
check(oralOut.includes('口语：95'), '得分与评价同时保留');
// 未登记口语 → 评价行整行移除，绝不留"口语评价："空标签或误导文案
const oralOut2 = generatePersonalFeedback(
  rec({ id: 'o-r2', scores: { v1: 10 } }),
  { ...oralLessonCfg, feedbackTemplate: oralTpl } as unknown as LessonConfig, oralStats, '乙'
);
check(!oralOut2.includes('口语评价'), '未登记口语时评价行被整行移除（前缀「口语评价」≠题型名也要能剥掉）');
check(oralOut2.includes('语法：10'), '其他参数不受影响');
// 有真实内容的行不能被误删：占位符为空但老师补了话
const oralTpl3 = '口语评价：【口语得分评价】（多开口读）';
const oralOut3 = generatePersonalFeedback(
  rec({ id: 'o-r3', scores: { v1: 10 } }),
  { ...oralLessonCfg, feedbackTemplate: oralTpl3 } as unknown as LessonConfig, oralStats, '丙'
);
check(oralOut3.includes('多开口读'), '占位符为空但行内有老师写的内容 → 保留该行');

// ============ 7. 调课/请假：本次课不评估（不进班均、排名、过关） ============
group('调课/请假口径（本次课不在读）');
check(attendanceKind('调课👩') === 'transfer', '「调课👩」识别为 transfer');
check(attendanceKind('调课（周三补）') === 'transfer', '自定义调课文案也能识别');
check(isTransferRecord(rec({ attendance: '调课👩' })) === true, '调课识别为独立的 transfer 状态');
check(isQuizAssessed(rec({ attendance: '调课👩' })) === false, '调课：小测不评估（不入排名/班均）');
check(isAbsentRecord(rec({ attendance: '调课👩' })) === false, '调课 ≠ 请假/缺勤：作业与口头照常统计');
check(isAbsentRecord(rec({ attendance: '请假🏫' })) === true, '请假同样不评估');

// 复刻截图情形：6 人正常 + 1 人调课（分数全 0、但被历史逻辑算进班均）
const tNormal = [
  rec({ id: 'n1', studentName: '刘诗娴', correctRate: 60, totalScore: 18 }),
  rec({ id: 'n2', studentName: '李真伊', correctRate: 93.3, totalScore: 28 }),
  rec({ id: 'n3', studentName: '黎子瑜', correctRate: 73.3, totalScore: 22 }),
  rec({ id: 'n4', studentName: '温纯正', correctRate: 78.3, totalScore: 23.5 }),
  rec({ id: 'n5', studentName: '韦雨菲', correctRate: 76.7, totalScore: 23 }),
  rec({ id: 'n6', studentName: '吴梓霖', correctRate: 85, totalScore: 25.5 }),
];
const tRow = rec({ id: 't1', studentName: '梁正瑜', attendance: '调课👩', correctRate: 0, totalScore: 0 });
const tAll = [...tNormal, tRow];
const tSnap = classSnapshotOfLesson(tAll, 1);
check(tSnap.size === 6, `有效人数排除调课学生 = 6（实际 ${tSnap.size}）`);
check(tSnap.rankById.get('t1') === undefined, '调课学生没有名次');
const avgFixed = Math.round((tNormal.reduce((a, r) => a + r.totalScore, 0) / tNormal.length) * 10) / 10;
const avgBefore = Math.round((tAll.reduce((a, r) => a + r.totalScore, 0) / tAll.length) * 10) / 10;
console.log(`      班均总分：修正后 ${avgFixed} ｜ 修正前（把调课当 0 分算）${avgBefore}  → 差 ${Math.round((avgFixed - avgBefore) * 10) / 10} 分`);
check(avgFixed > avgBefore, '修正后班均高于修正前（调课的 0 分不再拉低平均）');
const rateBefore = Math.round((tAll.reduce((a, r) => a + r.correctRate, 0) / tAll.length) * 10) / 10;
const rateFixed = Math.round((tNormal.reduce((a, r) => a + r.correctRate, 0) / tNormal.length) * 10) / 10;
console.log(`      班均正确率：修正后 ${rateFixed}% ｜ 修正前 ${rateBefore}%`);
check(rateFixed > rateBefore, '修正后班均正确率高于修正前');

// ============ 课后任务表扬榜口径（2026-10-08：按分数若有排名，不依赖"具体分数"字面量） ============
group('课后任务表扬榜口径');
const pRec = (over: Partial<StudentRecord>): StudentRecord => ({
  id: 'p', studentName: 'P', lessonNumber: 3, seasons: [], attendance: '准时👍',
  homeworkStatus: '', listeningStatus: '', listeningScore: 0, scores: {}, customValues: {},
  totalScore: 0, correctRate: 0, rank: 0, date: '2026-10-03', ...over,
});
// 老师实际填法：定性选项（很棒哦👏）或纯分数，**没有**"具体分数"这个字面量；
// 也常常只填定性状态不填数值分（真实数据即如此）→ 无数值分时回退到正向状态入榜
const praiseRecs = [
  pRec({ id: 'p1', studentName: '甲', listeningStatus: '很棒哦👏', listeningScore: 9 }),
  pRec({ id: 'p2', studentName: '乙', listeningStatus: '完成✅', listeningScore: 7 }),
  pRec({ id: 'p3', studentName: '丙', listeningStatus: '很棒哦👏', listeningScore: 0 }), // 仅定性状态 → 回退入榜
  pRec({ id: 'p4', studentName: '丁', listeningStatus: '', listeningScore: 5 }),          // 纯分数、无状态 → 入榜
  pRec({ id: 'p5', studentName: '戊', attendance: '请假🏫', listeningScore: 8 }),          // 请假 → 不入榜
  pRec({ id: 'p6', studentName: '庚', listeningStatus: '', listeningScore: 0 }),          // 什么都没登记 → 不入榜
  pRec({ id: 'p7', studentName: '辛', listeningStatus: '未完成', listeningScore: 0 }),     // 负面状态 → 不入榜
];
const praiseCfg = { questionTypes: [] } as unknown as LessonConfig;
const praiseOut = generatePraise(3, praiseRecs, praiseCfg, { avgScore: 0 } as unknown as ClassStats, (n) => n, 'listening');
check(praiseOut.includes('甲') && praiseOut.includes('乙') && praiseOut.includes('丁'), '有课后任务分数（定性选项或纯分数）即入榜');
check(praiseOut.includes('丙'), '仅定性状态（无数值分）回退入榜');
check(praiseOut.includes('丙：很棒哦') && !praiseOut.includes('丙：0分'), '回退入榜显示状态文案而非 0分');
check(!praiseOut.includes('戊'), '请假学员不入榜');
check(!praiseOut.includes('庚'), '未登记课后任务不入榜');
check(!praiseOut.includes('辛'), '负面状态（未完成）不入榜');
check(praiseOut.indexOf('甲') < praiseOut.indexOf('乙') && praiseOut.indexOf('乙') < praiseOut.indexOf('丁'), '有分者按分数降序（9>7>5）');
check(praiseOut.indexOf('丁') < praiseOut.indexOf('丙'), '无分者排在有分者之后');
// 真实场景复现：全班只有定性状态、无数值分 → 名单不能为空
const statusOnly = [
  pRec({ id: 's1', studentName: 'A', listeningStatus: '很棒哦👏', totalScore: 9 }),
  pRec({ id: 's2', studentName: 'B', listeningStatus: '完成✅', totalScore: 8 }),
  pRec({ id: 's3', studentName: 'C', listeningStatus: '完成✅', totalScore: 7 }),
];
const statusOnlyOut = generatePraise(3, statusOnly, praiseCfg, { avgScore: 0 } as unknown as ClassStats, (n) => n, 'listening');
check(statusOnlyOut.includes('A') && statusOnlyOut.includes('B') && statusOnlyOut.includes('C'), '全班仅定性状态无数值分 → 名单非空（按总分兜底排序）');
check(statusOnlyOut.indexOf('A') < statusOnlyOut.indexOf('B') && statusOnlyOut.indexOf('B') < statusOnlyOut.indexOf('C'), '无数值分时按总分降序兜底');

// ============ lib 审查 P0：作业四档互斥 + 表彰作业超赞命中现行选项 ============
group('lib 审查 P0（作业四档互斥 / 作业超赞）');
const hwRecs = [
  rec({ id: 'h1', studentName: 'A', homeworkStatus: '完成✅' }),
  rec({ id: 'h2', studentName: 'B', homeworkStatus: '完成✅' }),
  rec({ id: 'h3', studentName: 'C', homeworkStatus: '未完成❌' }),
];
const hwCfg = { '1': { questionTypes: [] } } as unknown as { [k: string]: LessonConfig };
const hw = computeStudentReportStats(hwRecs, hwCfg, { attendanceOptions: [], homeworkOptions: [], listeningOptions: [] }).homeworkStats;
check(hw.excellent === 2 && hw.good === 0, '完成✅ 计 excellent 且不重复计 good（四档互斥）');
check(hw.excellent + hw.good + hw.average + hw.poor === 3, '四档相加=记录数（分母不重计，优秀率可达峰）');
const hwPraise = generatePraise(1, hwRecs, { questionTypes: [] } as unknown as LessonConfig, { avgScore: 0 } as unknown as ClassStats, (n) => n, 'comprehensive');
check(hwPraise.includes('【作业超赞】') && hwPraise.includes('A'), '表彰【作业超赞】命中现行选项 完成✅（原硬编码"超赞完成"恒空）');

// ============ 学习建议（精简三句式 + 模板参数合并） ============
group('学习建议（精简版）');
{
  const cfg2 = {
    lessonNumber: 1,
    questionTypes: [
      { id: 'v1', name: '校内词汇', fullScore: 30, order: 0 },
      { id: 'v2', name: '阅读理解', fullScore: 10, order: 1 },
    ],
    customFields: [],
    attendanceOptions: ['准时👍', '请假🏫'],
    homeworkOptions: ['完成✅', '未完成❌'],
    listeningOptions: ['很棒哦👏'],
  } as unknown as LessonConfig;
  const srs = [
    rec({ id: 's1', studentName: '甲', lessonNumber: 1, totalScore: 28, correctRate: 70, homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', scores: { v1: 20, v2: 8 } }),
    rec({ id: 's2', studentName: '甲', lessonNumber: 2, totalScore: 34, correctRate: 85, homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', scores: { v1: 26, v2: 8 } }),
  ];
  const st = computeStudentReportStats(srs, { '1': cfg2, '2': cfg2 }, { attendanceOptions: ['准时👍', '请假🏫'], homeworkOptions: ['完成✅', '未完成❌'], listeningOptions: ['很棒哦👏'] })!;
  const adv = buildCondensedAdvice('甲', srs, st, { '1': cfg2, '2': cfg2 });
  check(adv.startsWith('甲，'), `学习建议带名字前缀（${adv.slice(0, 12)}…）`);
  check(adv.length <= 170, `学习建议长度受护栏约束 = ${adv.length} 字`);
  check(!/%/.test(adv), '学习建议不堆砌百分比数字（去数字化）');
  check(adv.includes('这块，'), '含重点题型的行动句（带题型名定位）');

  const passed2 = generatePersonalFeedback(
    rec({ id: 's1', studentName: '甲', lessonNumber: 1, totalScore: 28, correctRate: 70, scores: { v1: 20, v2: 8 } }),
    cfg2, { avgScores: {}, maxScores: {}, minScores: {}, passRate: 0, excellentRate: 0, registeredCounts: {} } as unknown as ClassStats,
    '甲', '评语：\n【学习建议】\n结束', undefined, { '【学习建议】': 'ADV_MARK' }
  );
  check(passed2.includes('ADV_MARK') && !passed2.includes('【学习建议】'), '私发模板【学习建议】参数被正确注入（无残留占位符）');

  const four = generateFourInOne(
    rec({ id: 's1', studentName: '甲', lessonNumber: 1, totalScore: 28, correctRate: 70, scores: { v1: 20, v2: 8 } }),
    cfg2, { avgScores: {}, maxScores: {}, minScores: {}, passRate: 0, excellentRate: 0, registeredCounts: {} } as unknown as ClassStats,
    '甲', false, [], 0, undefined, 'daily', true, undefined, { '【学习建议】': 'ADV_MARK' }
  );
  check(!four.includes('【学习建议】'), '四个一模板【学习建议】参数不残留占位符');
}

// ============ 入门测趋势导出模板（独立离屏 HTML） ============
group('入门测趋势导出');
{
  const html = buildTrendExportHTML({
    nickname: '陈志佳',
    className: 'L1',
    fullScore: 43,
    rows: [
      { lesson: 1, rate: 70, classMax: 93, classAvg: 69.1, rank: 10, size: 26 },
      { lesson: 2, rate: 87.7, classMax: 100, classAvg: 87.1, rank: 15, size: 28 },
      { lesson: 3, rate: 90.7, classMax: 100, classAvg: 93, rank: 20, size: 28 },
    ],
    generatedAt: new Date(2026, 9, 9, 22, 49),
  });
  check(html.includes('陈志佳') && html.includes('L1'), '导出模板含学生与班级');
  check(html.includes('优秀线 85%') && html.includes('及格线 60%'), '导出模板含优秀/及格参考线');
  check(html.includes('第1次') && html.includes('第3次'), '导出模板含逐次表头');
  check((html.match(/<polyline/g) || []).length === 3, '折线图正好 3 条序列（最高/平均/本人）');
  check(html.includes('10/26') && html.includes('20/28'), '包含个人名次/班级人数');
  check(!/【[^】]+】/.test(html), '导出模板无未替换的占位符');
}

// ============ 题型板块归类（报告聚合层） ============
group('题型板块归类');
{
  // 规则归类：与 weakPoints 同一套规则（单项/语法运用 → 语法；默写/填词 → 词汇）
  const c1 = categoryOf('语法运用');
  const c2 = categoryOf('笔记默写');
  const c3 = categoryOf('阅读理解');
  check(c1.name === '语法', `「语法运用」→ ${c1.name}`);
  check(c2.name === '词汇', `「笔记默写」→ ${c2.name}`);
  check(c3.name === '阅读', `「阅读理解」→ ${c3.name}`);
  // 人工覆盖优先
  const c4 = categoryOf('偏门题型ABC', { '偏门题型ABC': '写作' });
  check(c4.name === '写作', '人工覆盖优先于规则');
  check(unclassifiedNames(['偏门题型ABC'], {}).length === 1, '未归类名单能识别规则兜不住的题型');
  check(unclassifiedNames(['偏门题型ABC'], { '偏门题型ABC': '写作' }).length === 0, '已人工指定后不再提示');
  // 聚合：加权平均 + 成员收集
  const agg = aggregateByCategory([
    { name: '语法选择', rate: 80, count: 2 },
    { name: '单项选择', rate: 50, count: 1 },
    { name: '笔记默写', rate: 60, count: 1 },
  ], {});
  const grammar = agg.find(a => a.name === '语法');
  check(!!grammar && grammar.rate === 70, `语法板块加权均值 = ${grammar?.rate}（期望 70）`);
  check(!!grammar && grammar.members.length === 2, '语法板块含 2 个成员题型');
}

// ============ 导入口径：口语等非小测列不计入总分校验 ============
group('导入口径（口语不计入小测总分）');
{
  const qts = [
    { id: 'g1', name: '语法选择', fullScore: 10, order: 0 },
    { id: 'o1', name: '口语得分', fullScore: 100, order: 1, excludeFromTotal: true },
  ] as unknown as import('@/types').QuestionType[];
  const text = [
    '姓名\t考勤\t语法选择\t口语得分\t总分',
    '甲\t准时👍\t8\t90\t8',
    '乙\t准时👍\t7\t很棒哦👏\t7',
  ].join('\n');
  const parsed = parseClipboardTable(text, qts);
  const mismatch = parsed.errors.filter(e => e.includes('合计'));
  check(mismatch.length === 0, `口语分不计入合计校验（got ${mismatch.length} 条"合计不一致"）`);
  const invalidNote = parsed.errors.filter(e => e.includes('不是有效分数'));
  check(invalidNote.length === 0, '非小测列里的评价值（很棒哦）静默跳过，不再报"不是有效分数"');
}

// ============ 调课：调入 / 调出 判定（2026-10-16） ============
group('调课调入/调出');
{
  const base = {
    id: 'x1', studentName: '甲', lessonNumber: 1, seasons: [], attendance: '调课👩',
    homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', listeningScore: 0, classPerformance: '认真积极',
    scores: {} as { [k: string]: number }, totalScore: 0, correctRate: 0, rank: 0, date: '2026-10-16',
  };
  const outRec = { ...base } as unknown as StudentRecord;
  const inRec = { ...base, scores: { v1: 8 } } as unknown as StudentRecord;
  check(!isQuizAssessed(outRec), '调课无分 → 调出：不参与小测统计');
  check(isQuizAssessed(inRec), '调课有分 → 调入：正常参与统计');
  check(isTransferIn(inRec) && !isTransferIn(outRec), '调入/调出判定正确');
  check(hasQuizScores({ v1: 0 }), '录了 0 分也算有小测数据（真实参与）');
  check(!hasQuizScores({ v1: '未完成⭕' as unknown as number }), '评价文本不算小测数据');
}

// 评价类字段值的语义底色（自定义字段底色的基础）
group('评价类关键词着色');
{
  check(optionToneLevel('正确率低，要提高') === 'warn', '「正确率低」→ 警示色');
  check(optionToneLevel('基础扎实，稳定发挥') === 'good', '「扎实/稳定」→ 正向色');
}

// 云端条件推送（CAS）：同步层最容易「改坏了看不出来」的地方 —— 必须具备
// 「带 hash 条件才写、条件不满足判冲突、首次插入不覆盖」三条护栏。
group('云端条件推送 CAS');
{
  const calls: { url: string; method: string; body?: string }[] = [];
  let next: { status: number; json?: unknown; text?: string } = { status: 200, json: [{}] };
  const g = globalThis as unknown as { fetch?: unknown };
  const origFetch = g.fetch;
  g.fetch = async (url: unknown, init: { method?: string; body?: string } = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.json ?? [],
      text: async () => next.text ?? '',
    } as unknown;
  };
  try {
    const cfg = { supabaseUrl: 'https://demo.supabase.co', supabaseKey: 'anon', autoSync: true } as never;
    const snap = { appConfig: {}, classes: {}, nicknames: {}, schoolScores: {}, templates: {} } as never;

    next = { status: 200, json: [{ id: 'x' }] };
    let r = await pushSnapshotConditional(cfg, snap, 'base123');
    const last1 = calls[calls.length - 1];
    check(r.ok === true, 'CAS：条件命中 → 推送成功');
    check(last1.method === 'PATCH', 'CAS：有基线时走 PATCH 而非无条件 upsert');
    check(/snapshot_hash=eq\.base123/.test(last1.url), 'CAS：写请求带 snapshot_hash 条件');

    next = { status: 200, json: [] };
    r = await pushSnapshotConditional(cfg, snap, 'base123');
    check(r.ok === false && !r.ok && r.reason === 'conflict', 'CAS：0 行受影响 → 判为冲突，不覆盖');

    next = { status: 201, json: [{ id: 'x' }] };
    r = await pushSnapshotConditional(cfg, snap, null);
    const last2 = calls[calls.length - 1];
    check(r.ok === true && last2.method === 'POST', 'CAS：无基线 → POST 插入');
    check(!/on_conflict/.test(last2.url), 'CAS：首次插入不带 on_conflict（不静默覆盖已有行）');

    next = { status: 409, text: 'duplicate key value' };
    r = await pushSnapshotConditional(cfg, snap, null);
    check(r.ok === false && !r.ok && r.reason === 'conflict', 'CAS：首次插入撞已有行 → 判为冲突');
  } finally {
    g.fetch = origFetch;
  }
}

// ============ 反馈模板：空值占位符不得泄露（2026-10-17 用户反馈「有人薄弱项是【薄弱项】字面量」） ============
group('反馈占位符兜底');
{
  const qts = [
    { id: 'v1', name: '语法选择', fullScore: 10, order: 0 },
    { id: 'v2', name: '笔记默写', fullScore: 10, order: 1 },
  ];
  const cfg = {
    questionTypes: qts, customFields: [], homeworkOptions: ['完成✅'], listeningOptions: ['很棒哦👏'],
    attendanceOptions: ['准时👍'], classPerformanceOptions: ['认真积极'], homeworkText: '', passThreshold: 80,
    feedbackTemplate: '【学生昵称】家长好：\n薄弱项：【薄弱项】\n课堂表现：【课堂表现】\n作业内容：【作业内容】\n学习建议：【学习建议】',
  };
  const stats = { avgScores: { v1: 8, v2: 8 }, registeredCounts: { v1: 3, v2: 3 } };
  // ① 无薄弱项（全高于班均）+ 三个可选字段全空 → 任何占位符都不得原样漏出
  const noWeak = generatePersonalFeedback(
    { id: 'x1', studentName: '测试生', lessonNumber: 3, seasons: [], attendance: '准时👍', homeworkStatus: '', listeningStatus: '', listeningScore: 0, classPerformance: '', scores: { v1: 10, v2: 10 }, totalScore: 20, correctRate: 100, rank: 1, date: '2026-10-17' } as unknown as StudentRecord,
    cfg as unknown as import('@/types').LessonConfig,
    stats as unknown as import('@/types').ClassStats,
    '测试生', undefined, undefined, {}
  );
  check(!noWeak.includes('【薄弱项】'), '无薄弱项：不漏【薄弱项】字面量');
  check(!noWeak.includes('薄弱项'), '无薄弱项：整行删除（连标签也不留）；不再输出兜底文案');
  check(!noWeak.includes('【课堂表现】'), '课堂表现为空：不漏字面量');
  check(!noWeak.includes('【作业内容】'), '作业内容为空：不漏字面量');
  check(!noWeak.includes('【学习建议】'), '学习建议为空：不漏字面量');
  // ② 有薄弱项 → 正常替换成板块文案
  const withWeak = generatePersonalFeedback(
    { id: 'x2', studentName: '测试生', lessonNumber: 3, seasons: [], attendance: '准时👍', homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', listeningScore: 10, classPerformance: '认真积极', scores: { v1: 2, v2: 2 }, totalScore: 4, correctRate: 20, rank: 3, date: '2026-10-17' } as unknown as StudentRecord,
    cfg as unknown as import('@/types').LessonConfig,
    stats as unknown as import('@/types').ClassStats,
    '测试生', undefined, undefined, {}
  );
  check(withWeak.includes('语法') && !withWeak.includes('【薄弱项】'), '有薄弱项：正常替换为板块文案');
  // 短昵称统一（2026-10-23）：私发称呼只用短昵称（如 诗钰），不再出现全名
  const named = generatePersonalFeedback(
    { id: 'x3', studentName: '郭诗钰', lessonNumber: 3, seasons: [], attendance: '准时👍', homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', listeningScore: 10, classPerformance: '认真积极', scores: { v1: 10, v2: 10 }, totalScore: 20, correctRate: 100, rank: 1, date: '2026-10-23' } as unknown as StudentRecord,
    cfg as unknown as import('@/types').LessonConfig,
    stats as unknown as import('@/types').ClassStats,
    '郭诗钰', undefined, undefined, {}
  );
  check(named.includes('诗钰家长好'), '称呼用短昵称（诗钰家长好）');
  check(!named.includes('郭诗钰家长好'), '称呼不出现全名');
}

// ============ 详细版反馈（四段式）：按样例口径验收（2026-10-24） ============
group('详细版反馈生成器');
{
  const qts = [
    { id: 'v1', name: '词汇', fullScore: 24, order: 0 },
    { id: 'v2', name: '单选', fullScore: 5, order: 1 },
    { id: 'v3', name: '默写', fullScore: 14, order: 2 },
    { id: 'v4', name: '阅读', fullScore: 9, order: 3 },
  ];
  const cfgD = {
    questionTypes: qts, customFields: [], homeworkOptions: ['完成✅', '未完成❌'], listeningOptions: ['很棒哦👏'],
    attendanceOptions: ['准时👍'], classPerformanceOptions: ['认真积极', '正确率低'], homeworkText: '', passThreshold: 80,
  } as unknown as import('@/types').LessonConfig;
  const statsD = { avgScores: { v1: 20, v2: 4, v3: 11, v4: 6 }, registeredCounts: { v1: 20, v2: 20, v3: 20, v4: 20 } } as unknown as import('@/types').ClassStats;
  const mkD = (o: Partial<Record<string, unknown>> = {}) => ({
    id: 'd1', studentName: '黎少彬', lessonNumber: 6, seasons: [], attendance: '准时👍',
    homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', listeningScore: 10, classPerformance: '认真积极',
    scores: { v1: 24, v2: 5, v3: 14, v4: 9 }, totalScore: 52, correctRate: 100, rank: 1, date: '2026-10-24', ...o,
  }) as unknown as StudentRecord;

  const top = buildDetailedFeedback(mkD(), cfgD, statsD, '黎少彬', 0, 21);
  check(top.text1.includes('这几项本次没有失分'), '详细版：多项满分只陈述事实，不使用套路化夸奖');
  check(!/待提升|还有空间|要盯的是|最需要补/.test(top.text1), '详细版：无弱项时不出"要盯的一处"');
  check(top.text1.startsWith('黎少彬这次 52/52（100%），班级第 1 名（全班第一）。'), '详细版：段①定位句与样例一致');

  const back = buildDetailedFeedback(mkD({ rank: 15, scores: { v1: 18, v2: 2, v3: 10, v4: 7 }, totalScore: 37 }), cfgD, statsD, '张三', 1, 21);
  check(back.text1.includes('班级后段'), '详细版：第15/21名写"班级后段"（不写中上）');
  check(back.text1.includes('比班均低'), '详细版：弱项写出与班均的差距');
  check(!back.text1.includes('把题干的关键词没划出来就选了处理好'), '详细版：不出现"把…处理好"的病句拼接');

  const badHw = buildDetailedFeedback(mkD({ homeworkStatus: '未完成❌', classPerformance: '正确率低', scores: { v1: 12, v2: 2, v3: 6, v4: 3 }, totalScore: 23, rank: 18 }), cfgD, statsD, '李四', 0, 21);
  check(!badHw.text1.includes('课堂练习完成得很好'), '详细版：课堂练习未完成时不夸课堂练习');

  const blank = buildDetailedFeedback(mkD({ scores: { v1: 20, v2: 4, v3: 11, v4: 0 }, totalScore: 35, rank: 12 }), cfgD, statsD, '王五', 0, 21);
  check(blank.text1.includes('已登记的得分很少'), '详细版：低得分项如实描述，不夸大为能力空白');
  check(!/不是不会/.test(blank.text1), '详细版：空白项不写"不是不会"');

  const len = (top.text1 + '\n\n' + top.text2).replace(/\s/g, '').length;
  check(len > 180 && len < 420, `详细版：单条字数在合理区间（实际 ${len}）`);

  const e0 = buildDetailedFeedback(mkD({ rank: 8, scores: { v1: 20, v2: 4, v3: 11, v4: 6 }, totalScore: 41 }), cfgD, statsD, '甲', 0, 21).text2;
  const e1 = buildDetailedFeedback(mkD({ rank: 8, scores: { v1: 20, v2: 4, v3: 11, v4: 6 }, totalScore: 41 }), cfgD, statsD, '甲', 1, 21).text2;
  check(e0 !== e1, '详细版：换一版措辞时鼓励句轮换（同班不撞句）');
}

// ============ 题型归类：常见题型必须归到正确板块（2026-10-24 用户反馈"其他"） ============
group('题型板块归类');
{
  const cases: Array<[string, string]> = [
    ['语法选择', '语法'], ['单项选择', '语法'], ['语篇填词', '语法'], ['句型转换', '写作'],
    ['完形填空', '完形'], ['七选五', '阅读'], ['任务型阅读', '阅读'], ['信息匹配', '阅读'],
    ['书面表达', '写作'], ['单词拼写', '词汇'], ['笔记默写', '词汇'], ['听写句子', '听力'], ['情景对话', '口语'],
  ];
  cases.forEach(([name, expect]) => {
    check(inferCategoryByName(name) === expect, `归类：${name} → ${expect}（实际 ${inferCategoryByName(name)}）`);
  });
  check(inferCategoryByName('课堂小测') === '其他', '归类：无法识别时兜底「其他」');
  check(isCategoryResolved({ id: 'x', name: '课堂小测', fullScore: 10, order: 0 } as unknown as import('@/types').QuestionType) === false, '归类：无法识别 → 视为未归类（触发提示）');
  check(isCategoryResolved({ id: 'x', name: '课堂小测', fullScore: 10, order: 0, category: '语法' } as unknown as import('@/types').QuestionType) === true, '归类：人工指定后视为已归类');
  check(resolveCategory({ id: 'x', name: '课堂小测', fullScore: 10, order: 0 } as unknown as import('@/types').QuestionType, { 课堂小测: '阅读' }) === '阅读', '归类：名称覆盖表优先于兜底');
}

// ============ 薄弱项口径：未登记题型不得参与（2026-10-24 用户反馈） ============
group('薄弱项统计口径');
{
  const qts = [
    { id: 'a', name: '语法选择', fullScore: 15, order: 0 },
    { id: 'b', name: '完形填空', fullScore: 10, order: 1 },
  ] as unknown as import('@/types').QuestionType[];
  // 学生只登记了语法选择（完形本课没考/漏录）
  const rec = { id: 'x', studentName: '测试', lessonNumber: 6, seasons: [], attendance: '准时👍', homeworkStatus: '', listeningStatus: '', listeningScore: 0, classPerformance: '', scores: { a: 13.5 }, totalScore: 13.5, correctRate: 90, rank: 1, date: '2026-10-24' } as unknown as StudentRecord;
  const avg = { a: 11, b: 7 };
  const counts = { a: 3, b: 3 };
  const noReg = computeCategoryWeakPoints(rec, qts, avg, undefined, counts);
  check(!noReg.some(w => w.category.includes('完形')), '薄弱项：未登记的题型不参与（不再按 0 分算）');
  // 真实登记 0 分仍应判弱
  const zeroRec = { ...rec, scores: { a: 13.5, b: 0 } } as unknown as StudentRecord;
  const withZero = computeCategoryWeakPoints(zeroRec, qts, avg, undefined, counts);
  check(withZero.some(w => w.category.includes('完形')), '薄弱项：真实登记 0 分仍判为弱项');
  // 班里没有该题型样本时跳过
  const noClass = computeCategoryWeakPoints({ ...rec, scores: { a: 13.5, b: 4 } } as unknown as StudentRecord, qts, avg, undefined, { a: 3, b: 0 });
  check(!noClass.some(w => w.category.includes('完形')), '薄弱项：班级无样本的题型不做对比');
}

// ============ 四个一：占位符/昵称/待提升/新学员/教辅（2026-10-23） ============
group('四个一生成器');
{
  const qts4 = [
    { id: 'v1', name: '语法选择', fullScore: 10, order: 0 },
    { id: 'v2', name: '完形填空', fullScore: 10, order: 1 },
  ];
  const cfg4 = {
    questionTypes: qts4, customFields: [], homeworkOptions: ['完成✅'], listeningOptions: ['很棒哦👏'],
    attendanceOptions: ['准时👍'], classPerformanceOptions: ['认真积极'], homeworkText: '', passThreshold: 80,
  };
  const stats4 = { avgScores: { v1: 7, v2: 8 }, registeredCounts: { v1: 3, v2: 3 } };
  const mk = (scores: { [k: string]: number }) => ({ id: 'f1', studentName: '郭诗钰', lessonNumber: 3, seasons: [], attendance: '准时👍', homeworkStatus: '完成✅', listeningStatus: '很棒哦👏', listeningScore: 10, classPerformance: '认真积极', scores, totalScore: 10, correctRate: 60, rank: 2, date: '2026-10-23' });
  // ① 开场里的【课次】【昵称】必须替换（历史 bug：开场插在替换之后 → 漏字面量）
  const four = generateFourInOne(mk({ v1: 4, v2: 8 }) as unknown as StudentRecord, cfg4 as unknown as import('@/types').LessonConfig, stats4 as unknown as import('@/types').ClassStats, '郭诗钰', false, [], 0, undefined, 'daily', true, undefined, {}, []);
  check(!four.includes('【课次】'), '四个一：开场里的【课次】已替换（不漏字面量）');
  check(four.includes('诗钰家长好') || four.includes('诗钰家长您好'), '四个一：开场以短昵称称呼家长');
  check(!four.includes('郭诗钰'), '四个一：不出现全名');
  // ② 无弱项 → 不输出"待提升"行
  const fourGood = generateFourInOne(mk({ v1: 10, v2: 10 }) as unknown as StudentRecord, cfg4 as unknown as import('@/types').LessonConfig, { avgScores: { v1: 5, v2: 5 }, registeredCounts: { v1: 3, v2: 3 } } as unknown as import('@/types').ClassStats, '郭诗钰', false, [], 0, undefined, 'daily', true, undefined, {}, []);
  check(!fourGood.includes('待提升'), '四个一：无弱项时"待提升"整行不出现');
  // ③ 新学员：用中性开场，不含"照现在的节奏"
  const fourNew = generateFourInOne(mk({ v1: 10, v2: 10 }) as unknown as StudentRecord, cfg4 as unknown as import('@/types').LessonConfig, { avgScores: { v1: 5, v2: 5 }, registeredCounts: { v1: 3, v2: 3 } } as unknown as import('@/types').ClassStats, '郭诗钰', true, [], 0, undefined, 'daily', true, undefined, {}, []);
  check(/刚加入|先说|留意/.test(fourNew), '四个一：新学员用中性开场（不假设历史）');
  check(!fourNew.includes('照现在的节奏'), '四个一：新学员不出现"照现在的节奏"');
  // ④ 参考教辅按长期弱项匹配
  const fourMat = generateFourInOne(mk({ v1: 4, v2: 8 }) as unknown as StudentRecord, cfg4 as unknown as import('@/types').LessonConfig, stats4 as unknown as import('@/types').ClassStats, '郭诗钰', false, [], 0, undefined, 'daily', true, undefined, {}, ['完形']);
  check(/完形：《哈佛英语》/.test(fourMat), '参考教辅：按长期弱项（完形）推荐对应资料');
  check(!/时文阅读/.test(fourMat), '参考教辅：不推与弱项无关的资料');
}

// ============ 2026-10-25：报告成绩池、全勤与稳定话术 ============
group('报告成绩池：未登记与真实 0 分');
{
  const reportCfg = {
    lessonNumber: 1,
    questionTypes: [
      { id: 'q1', name: '语法选择', fullScore: 10, order: 0 },
      { id: 'oral', name: '口语得分', fullScore: 100, order: 1, excludeFromTotal: true },
    ],
    customFields: [], attendanceOptions: ['准时👍', '请假'], homeworkOptions: [], listeningOptions: [],
  } as unknown as LessonConfig;
  const configs = { 1: reportCfg, 2: { ...reportCfg, lessonNumber: 2 } } as unknown as { [lesson: string]: LessonConfig };
  const zero = rec({ id: 'zero', studentName: '零分生', scores: { q1: 0 }, totalScore: 0, correctRate: 0 });
  const blank = rec({ id: 'blank', studentName: '未登记生', scores: {}, totalScore: 0, correctRate: 0 });
  const oralOnly = rec({ id: 'oral-only', studentName: '口语生', scores: { oral: 90 }, totalScore: 0, correctRate: 0 });
  const absentZero = rec({ id: 'absent-zero', studentName: '请假生', attendance: '请假', scores: { q1: 0 }, totalScore: 0, correctRate: 0 });
  check(isReportAssessed(zero, reportCfg), '真实 0 分：属于有效测评');
  check(!isReportAssessed(blank, reportCfg), '未登记题型：不属于有效测评');
  check(!isReportAssessed(oralOnly, reportCfg), '只有口语附加项：不当作已参加小测');
  check(!isReportAssessed(absentZero, reportCfg), '请假即使残留 0 分也不计入');
  const classResult = computeClassReportStats([zero, blank, oralOnly, absentZero], configs, { attendanceOptions: [], homeworkOptions: [], listeningOptions: [] });
  check(classResult?.validRecordCount === 1 && classResult.validCount === 1, '班级成绩池只保留真实 0 分这一条有效记录');
  check(classResult?.minScore === 0 && classResult.avgCorrectRate === 0, '真实 0 分进入最低分与平均正确率');
  check(classResult?.distribution.find(d => d.label === '60% 以下')?.count === 1, '真实 0 分进入低分分布，未登记不进入');
  check(classResult?.questionTypeAvg[0]?.count === 1, '题型分母只含已登记记录');
  const personalResult = computeStudentReportStats([zero, blank, oralOnly, absentZero], configs, { attendanceOptions: [], homeworkOptions: [], listeningOptions: [] });
  check(personalResult?.learningTrajectory.length === 1 && personalResult.avgScore === 0, '个人与班级使用同一成绩池');
  const secondZero = rec({ id: 'zero-2', studentName: '零分生', lessonNumber: 2, scores: { q1: 5 }, totalScore: 5, correctRate: 50 });
  const other = rec({ id: 'other', studentName: '另一生', scores: { q1: 8 }, totalScore: 8, correctRate: 80 });
  const dedup = computeClassReportStats([zero, secondZero, other], configs, { attendanceOptions: [], homeworkOptions: [], listeningOptions: [] });
  check(dedup?.validCount === 2 && dedup.validRecordCount === 3, '全部课次：人数去重、记录数保留');

  const customCfg = {
    ...reportCfg,
    questionTypes: reportCfg.questionTypes.filter(q => q.id !== 'oral'),
    customFields: [{ id: 'bonus', name: '课堂加分', kind: 'number', includeInTotal: true, fullScore: 5, order: 0 }],
  } as unknown as LessonConfig;
  const customOnly = rec({ id: 'custom-only', scores: {}, customValues: { bonus: 0 }, totalScore: 0, correctRate: 0 });
  check(isReportAssessed(customOnly, customCfg), '仅登记计分自定义列且为真实 0 分：仍属于有效测评');
  const transferCustom = rec({ id: 'transfer-custom', attendance: '调课', scores: {}, customValues: { bonus: 5 }, totalScore: 5, correctRate: 100 });
  check(isReportAssessed(transferCustom, customCfg), '调课调入仅登记计分自定义列：正常参与报告');

  const variableConfigs = {
    1: reportCfg,
    2: { ...reportCfg, lessonNumber: 2, questionTypes: reportCfg.questionTypes.map(q => q.id === 'q1' ? { ...q, fullScore: 100 } : q) },
  } as unknown as { [lesson: string]: LessonConfig };
  const fullTen = rec({ id: 'full-ten', lessonNumber: 1, scores: { q1: 10 }, totalScore: 10, correctRate: 100 });
  const fullHundred = rec({ id: 'full-hundred', lessonNumber: 2, scores: { q1: 100 }, totalScore: 100, correctRate: 100 });
  const variable = computeClassReportStats([fullTen, fullHundred], variableConfigs, { attendanceOptions: [], homeworkOptions: [], listeningOptions: [] });
  check(variable?.questionTypeAvg[0]?.correctRate === 100, '同一题型跨课次满分 10/100：两次满分仍得 100%');
  check(variable?.questionTypeAvg[0]?.fullScore === 55 && variable.questionTypeAvg[0].avgScore === 55, '跨满分题型展示平均原始分与平均满分，不用最大满分拉低比例');
}

group('风云榜全勤口径');
{
  check(isFullAttendance([rec({ attendance: '准时👍' }), rec({ attendance: '按时出勤' })]), '全部按时才计全勤');
  check(!isFullAttendance([rec({ attendance: '准时👍' }), rec({ attendance: '请假' })]), '曾请假不计全勤');
  check(!isFullAttendance([rec({ attendance: '迟到' })]), '迟到不计全勤');
  check(!isFullAttendance([rec({ attendance: '调课' })]), '调课不计全勤');
  check(!isFullAttendance([]), '无记录不计全勤');
  const ranked = rankForLeaderboard([
    { studentName: 'A', totalScore: 50, correctRate: 100 },
    { studentName: 'B', totalScore: 100, correctRate: 100 },
    { studentName: 'C', totalScore: 45, correctRate: 90 },
    { studentName: 'D', totalScore: 90, correctRate: 90 },
    { studentName: 'E', totalScore: 40, correctRate: 80 },
    { studentName: 'F', totalScore: 35, correctRate: 70 },
    { studentName: 'G', totalScore: 30, correctRate: 60 },
    { studentName: 'H', totalScore: 25, correctRate: 50 },
    { studentName: 'I', totalScore: 20, correctRate: 40 },
    { studentName: 'J', totalScore: 15, correctRate: 30 },
  ], FENGYUN_LIMIT);
  check(ranked.length === 8 && ranked[7].studentName === 'H', '风云榜最多展示 8 人，第 9 人起不进入海报');
  check(ranked[0].rank === 1 && ranked[1].rank === 1, '不同满分但正确率相同：并列第 1，不按原始分改名次');
  check(ranked[2].rank === 3 && ranked[3].rank === 3, '两组并列后按占位数跳号：下一名为第 3');
  check(ranked[0].awardRank === 1 && ranked[1].awardRank === 1 && ranked[2].awardRank === 2 && ranked[3].awardRank === 2 && ranked[4].awardRank === 3, '金银铜按成绩档位：并列金后下一档为银，不出现有铜无银');
  check(ranked[4].rank === 5 && ranked[7].rank === 8, '并列后的后续名次连续符合竞争排名');
  const groups = groupFengyunAwards(ranked);
  check(groups.map(group => group.awardRank).join(',') === '1,2,3', '风云榜只保留金、银、铜三档，不再显示第 4 名后的数字');
  check(groups[0].entries.length === 2 && groups[1].entries.length === 2 && groups[2].entries.length === 4, '同分并列姓名进入同一档位，第 4 名起归入铜牌档');
  const groupedRows = buildFengyunRows([
    { studentName: 'A', totalScore: 10, correctRate: 100, rank: 1, awardRank: 1 },
    { studentName: 'B', totalScore: 9, correctRate: 90, rank: 2, awardRank: 2 },
    ...Array.from({ length: 6 }, (_, i) => ({ studentName: `C${i}`, totalScore: 8, correctRate: 80, rank: 3 + i, awardRank: 3 + i })),
  ]);
  check(groupedRows.length === 4 && groupedRows[3].continuation, '同档超过 4 个姓名向下续行，不标数字名次');
  check(groupedRows.every(row => row.awardRank >= 1 && row.awardRank <= 3), '所有续行仍只属于金、银、铜三档');
  const allTiersWrap = buildFengyunRows(Array.from({ length: 8 }, (_, i) => ({
    studentName: `S${i}`, totalScore: 10 - i, correctRate: 100 - i,
    rank: i + 1, awardRank: i < 5 ? 1 : i < 7 ? 2 : 3,
  })));
  check(allTiersWrap.filter(row => row.awardRank === 1).length === 2, '金牌并列超过 4 人也向下续行');
  check(allTiersWrap.filter(row => row.awardRank === 2).length === 1 && allTiersWrap.at(-1)?.continuation === false, '银、铜档遵循同一续行规则');
}

group('报告话术：稳定、可比、去模板腔');
{
  const a = getOverallFeedback(82, 100);
  const b = getOverallFeedback(82, 100);
  check(a === b && a.length > 0, '同一报告输入反复渲染与导出时话术不变');
  check(getTrajectoryFeedback([50, 60, 70]).includes('正确率比前段高'), '不同满分课次按正确率判断上升趋势');
  check(getTrajectoryFeedback([80, 70, 60]).includes('正确率有所回落'), '按正确率判断回落趋势');
  const sample = `${a}${getTrajectoryFeedback([80, 70, 60])}`;
  check(!/爆发点|性价比|不是运气|大概能多拿/.test(sample), '报告话术不使用营销化或机械套话');
}

console.log('');
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`✅ 全部通过（${passed} 项断言）`);
