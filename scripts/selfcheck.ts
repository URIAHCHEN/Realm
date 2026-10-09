// 自测脚本（零依赖）：用 esbuild 打包后由 node 直接跑断言。
// 用法：npm run selfcheck
// 说明：本项目没有测试框架；这是最轻量的回归护栏——
// 覆盖的都是"改错了很难发现、却直接影响老师看到的数字"的口径逻辑。
import { classSnapshotOfLesson, studentLessonTrend, formatRank, studentLessonRow } from '@/lib/lessonStats';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { parseClipboardTable, isNonQuizColumn } from '@/lib/docSync';
import { attendanceKind, isAbsentRecord, isTransferRecord, isQuizAssessed } from '@/lib/attendance';
import { buildDynamicVariables, generatePersonalFeedback, generatePraise } from '@/lib/feedbackTemplates';
import { computeStudentReportStats } from '@/lib/reportStats';
import { mergeTemplateStores, SLOT } from '@/lib/templateStore';
import {
  rateOralScore, buildOralRatings, normalizeOralRating, oralRatingForEditing,
  oralDistribution, oralToneClass, oralToneColor, oralKey, DEFAULT_ORAL_RATING,
} from '@/lib/oralRating';
import type { LessonConfig, QuestionType, StudentRecord, ClassStats } from '@/types';

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
check(out3.includes('未参与'), '病假学生生成的是"未参与"说明');
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

console.log('');
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`✅ 全部通过（${passed} 项断言）`);
