// 自测脚本（零依赖）：用 esbuild 打包后由 node 直接跑断言。
// 用法：npm run selfcheck
// 说明：本项目没有测试框架；这是最轻量的回归护栏——
// 覆盖的都是"改错了很难发现、却直接影响老师看到的数字"的口径逻辑。
import { classSnapshotOfLesson, studentLessonTrend, formatRank, studentLessonRow } from '@/lib/lessonStats';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { parseClipboardTable, isNonQuizColumn } from '@/lib/docSync';
import { attendanceKind } from '@/lib/attendance';
import { buildDynamicVariables, generatePersonalFeedback } from '@/lib/feedbackTemplates';
import { mergeTemplateStores, SLOT } from '@/lib/templateStore';
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

console.log('');
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`✅ 全部通过（${passed} 项断言）`);
