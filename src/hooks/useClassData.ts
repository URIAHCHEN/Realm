import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Class,
  StudentRecord,
  QuestionType,
  LessonConfig,
  AppConfig,
  SchoolScore,
  ClassStats,
} from '@/types';
import { buildPublicityHTML } from '@/lib/publicityExport';
import { isAbsentRecord, attendanceKind } from '@/lib/attendance';
import { getLessonFullScore } from '@/lib/lessonFullScore';
import { migrateLegacyOption } from '@/lib/optionMatch';
import { classSnapshotOfLesson } from '@/lib/lessonStats';
import {
  SLOT, readTemplateStore, writeTemplateStore, stampTemplate, mergeTemplateStores,
  getStamp, type TemplateStore,
} from '@/lib/templateStore';
import { computeCategoryWeakPoints, type CategoryWeakPoint } from '@/lib/weakPoints';
import { toast } from 'sonner';

// 生成唯一ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// localStorage 安全写入：配额超限（QuotaExceededError）/隐私模式等场景下
// 旧实现会抛出未捕获异常并静默丢失本次数据；这里统一捕获并仅提示一次，
// 提示用户导出备份，避免长时间录入后才发现数据没存上。
let storageWarned = false;
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[save] ${key} 写入失败`, e);
    if (!storageWarned) {
      storageWarned = true;
      toast.error('本地存储写入失败：数据可能无法保存，请尽快用「导出备份」留存数据', { duration: 10000 });
    }
  }
}

// localStorage JSON 安全解析：数据损坏（写入中断/手动改坏）时回退默认值，
// 避免初始化阶段抛异常导致整页白屏且无法自愈（坏数据一直留在 localStorage）
function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    console.warn(`[load] ${key} 数据损坏，已回退默认值`);
    return fallback;
  }
}

// 默认题型
const defaultQuestionTypes: QuestionType[] = [
  { id: 'vocab', name: '单词默写', fullScore: 100, order: 1 },
  { id: 'choice', name: '单项选择', fullScore: 100, order: 2 },
  { id: 'note', name: '笔记默写', fullScore: 100, order: 3 }
];

// 课堂表现默认选项（固定列，层级与考勤相同；旧课次配置未含该字段时兜底）
export const DEFAULT_CLASS_PERFORMANCE_OPTIONS = [
  '有些内向， 您也鼓励下💪',
  '容易走神， 要多留意哦⚠️',
  '笔记认真， 要更积极哇✍️',
  '认真积极， 继续保持呀🤗',
  '做题认真， 要更细心呢💯',
  '认真上课， 积极参与棒👍',
];

// 全局默认选项（v3：带表情符号的正式选项集；v3 起同时按"内容"兜底迁移旧 v1 选项）
export const DEFAULT_OPTIONS_VERSION = 3;
export const DEFAULT_ATTENDANCE_OPTIONS = ['迟到❗', '准时👍', '请假🏫', '调课👩‍'];
export const DEFAULT_HOMEWORK_OPTIONS = ['完成✅', '未做完❎', '未完成❌', '补发⚠️', '按要求❗', '错题本欠缺✍️', '笔记不过关📒'];
export const DEFAULT_LISTENING_OPTIONS = ['很棒哦👏', '未完成⭕'];

// 旧 v1 选项集（无表情）；若存储中仍是这些内容则强制升级
const V1_ATTENDANCE = ['按时出勤', '迟到', '缺勤', '请假', '调课'];
const V1_HOMEWORK = ['超赞完成', '圆满完成', '未完成', '没带'];
const V1_LISTENING = ['具体分数', '未加入课后任务', '未完成'];
const V1_CLASSPERF = ['专注高效', '积极互动', '状态一般', '需提醒'];
const sameList = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && a.every((x, i) => x === b[i]);

// 默认配置
const defaultAppConfig: AppConfig = {
  defaultAttendanceOptions: [...DEFAULT_ATTENDANCE_OPTIONS],
  defaultHomeworkOptions: [...DEFAULT_HOMEWORK_OPTIONS],
  defaultListeningOptions: [...DEFAULT_LISTENING_OPTIONS],
  defaultClassPerformanceOptions: [...DEFAULT_CLASS_PERFORMANCE_OPTIONS],
  defaultOptionsVersion: DEFAULT_OPTIONS_VERSION,
  // 默认私发模板（2026-09 按去 AI 味原则重写）：
  //  · 去掉"跟您同步一下""第一时间"这类模板腔与空话
  //  · 长短句交错，允许口语停顿（破折号、短句）
  //  · 先给具体信息，再给一句判断；不堆形容词
  defaultFeedbackTemplate: `【学生昵称】家长好，第【课次】课的情况我写在这儿。

🏫 考勤：【考勤】
🙋 课堂表现：【课堂表现】
📝 作业：【作业】
🎙️ 课后任务：【课后任务】

入门测这边：
【成绩详情】
总分【总分】/【满分】，班级第【排名】名，正确率【正确率】%。

⚠️ 还要盯的地方：【薄弱项】

📝 今日作业
【作业内容】

有变化我会主动告诉您。您在家看到什么，也跟我说一声，两边对得上，孩子才不白练 💪`,
  // 默认表扬模板：一句事实 + 一句轻收尾，不喊口号
  defaultPraiseTemplate: `🏆 第【课次】课【表彰类型】

【表彰内容】

上面这几位，这节课的功夫是实打实的。没上榜的也别急，下节课接着来。`,
  defaultQuestionTypes: [...defaultQuestionTypes]
};

// 获取默认课次配置
const getDefaultLessonConfig = (appConfig: AppConfig): LessonConfig => ({
  questionTypes: [...appConfig.defaultQuestionTypes],
  attendanceOptions: [...appConfig.defaultAttendanceOptions],
  homeworkOptions: [...appConfig.defaultHomeworkOptions],
  listeningOptions: [...appConfig.defaultListeningOptions],
  classPerformanceOptions: [...(appConfig.defaultClassPerformanceOptions || DEFAULT_CLASS_PERFORMANCE_OPTIONS)],
  feedbackTemplate: appConfig.defaultFeedbackTemplate,
  praiseTemplate: appConfig.defaultPraiseTemplate,
  homeworkText: '1️⃣课后任务\n2️⃣错题本（按照要求整理）\n3️⃣开心过年',
  customFields: [],
  passThreshold: 80
});

// 旧课次配置缺少「课堂表现」选项 / 模板字段时兜底，保证列、配置面板、反馈生成始终可用。
// 模板兜底尤其关键：课次配置里缺 feedbackTemplate 时，模板引擎会拿到 undefined 并在
// .replace() 处抛错 → 反馈生成整页白屏（历史上确实发生过）。
const withLessonDefaults = (cfg: LessonConfig, appConfig: AppConfig): LessonConfig => ({
  ...cfg,
  classPerformanceOptions: (cfg.classPerformanceOptions && cfg.classPerformanceOptions.length)
    ? cfg.classPerformanceOptions
    : [...DEFAULT_CLASS_PERFORMANCE_OPTIONS],
  feedbackTemplate: cfg.feedbackTemplate || appConfig.defaultFeedbackTemplate,
  praiseTemplate: cfg.praiseTemplate || appConfig.defaultPraiseTemplate,
});

// 旧版本存储的全局默认选项 → 迁移到 v3 正式选项集（带表情符号）。
// 双重保险：① 存储版本号 < 3 即迁移；② 即使版本号已达标，只要内容仍是旧 v1 集合也强制迁移，
// 确保旧选项（按时出勤/超赞完成/具体分数/专注高效 等）不再出现。
function migrateDefaultOptions(merged: AppConfig, stored: Partial<AppConfig> | undefined): AppConfig {
  const storedVersion = stored?.defaultOptionsVersion;
  const isV1Content =
    sameList(stored?.defaultAttendanceOptions, V1_ATTENDANCE) ||
    sameList(stored?.defaultHomeworkOptions, V1_HOMEWORK) ||
    sameList(stored?.defaultListeningOptions, V1_LISTENING) ||
    sameList(stored?.defaultClassPerformanceOptions, V1_CLASSPERF);
  if ((storedVersion ?? 1) >= DEFAULT_OPTIONS_VERSION && !isV1Content) return merged;
  return {
    ...merged,
    defaultAttendanceOptions: [...DEFAULT_ATTENDANCE_OPTIONS],
    defaultHomeworkOptions: [...DEFAULT_HOMEWORK_OPTIONS],
    defaultListeningOptions: [...DEFAULT_LISTENING_OPTIONS],
    defaultClassPerformanceOptions: [...DEFAULT_CLASS_PERFORMANCE_OPTIONS],
    defaultOptionsVersion: DEFAULT_OPTIONS_VERSION,
  };
}

// 总分/正确率统一口径：题型分数 + 计入总分的分数型自定义列
// 考勤含「请假」的记录：分数一律不计入总分与正确率（原始分数仍保留，改回出勤会自动重新计入）
// 分母统一取自 getLessonFullScore（题型满分 + 计入总分的自定义列满分），随课次配置动态变化
function computeTotals(
  scores: { [k: string]: number },
  customValues: { [k: string]: string | number } | undefined,
  lessonConfig: LessonConfig,
  attendance?: string
): { totalScore: number; correctRate: number } {
  // 请假与缺勤一致处理：都不计入总分与正确率。
  // 原来只清零"请假"，先录分后标缺勤的记录仍会带着分数参与排名，
  // 与 lessonStats / 报告口径（把两者都排除）矛盾。
  const kind = attendanceKind(attendance);
  if (kind === 'leave' || kind === 'absent') {
    return { totalScore: 0, correctRate: 0 };
  }
  const total =
    // 不计入总分的题型（口语等附加项）跳过
    (lessonConfig.questionTypes || []).reduce((sum, qt) => (qt.excludeFromTotal ? sum : sum + (scores?.[qt.id] || 0)), 0) +
    (lessonConfig.customFields || []).reduce(
      (sum, cf) => (cf.kind === 'number' && cf.includeInTotal ? sum + (Number(customValues?.[cf.id]) || 0) : sum),
      0
    );
  const full = getLessonFullScore(lessonConfig);
  const correctRate = full > 0 ? Math.round((total / full) * 100 * 10) / 10 : 0;
  return { totalScore: Math.round(total * 100) / 100, correctRate };
}

// 重算某课次排名（按总分降序），返回新数组（不可变，不改动入参对象）。
// 用 Map 定位代替逐条 findIndex，将 O(n²) 降为 O(n log n)；统一所有写路径的排名口径
function rerankLesson(records: StudentRecord[], lessonNumber: number): StudentRecord[] {
  // 口径统一交给 lib/lessonStats（唯一来源）：
  //  · 排除请假/缺勤（他们不该占名次，也不该把别人挤后一位）
  //  · 按正确率降序（总分随各次满分变化，跨课次不可比）
  //  · 同分并列同名次（与报告/分析弹窗一致）
  const snap = classSnapshotOfLesson(records, lessonNumber);
  return records.map(r => {
    if (r.lessonNumber !== lessonNumber) return r;
    const pos = snap.rankById.get(r.id);
    // 请假/缺勤无名次：显式置 0，避免表格显示上一轮的旧名次
    const next = pos ?? 0;
    return r.rank !== next ? { ...r, rank: next } : r;
  });
}

// 解析某课次生效配置（与 getLessonConfig 同口径的纯函数版本，供加载期/导入期迁移使用）
function resolveLessonConfigPure(classData: Class, lessonNumber: number, appConfig: AppConfig): LessonConfig {
  const cfgs = classData.lessonConfigs || {};
  const cfg = cfgs[lessonNumber.toString()];
  if (cfg) return withLessonDefaults(cfg, appConfig);
  const prev = lessonNumber - 1;
  if (prev > 0 && cfgs[prev.toString()]) return withLessonDefaults(cfgs[prev.toString()], appConfig);
  return getDefaultLessonConfig(appConfig);
}

// 以「当前课次配置的真实满分」重算全部记录的正确率。
// 修复历史数据分母停留在默认 300（默认题型 3×100）导致学情表/表扬榜/学情报告正确率失真的问题；
// 分母统一取自 getLessonFullScore，与保存路径 computeTotals 完全同口径；分母为 0/缺失时正确率记 0，避免除零。
function recomputeRatesInClass(classData: Class, appConfig: AppConfig): Class {
  if (!classData?.records) return classData;
  let changed = false;
  const records = classData.records.map(r => {
    const cfg = resolveLessonConfigPure(classData, r.lessonNumber, appConfig);
    const { totalScore, correctRate } = computeTotals(r.scores, r.customValues, cfg, r.attendance);
    if (totalScore === r.totalScore && correctRate === r.correctRate) return r;
    changed = true;
    return { ...r, totalScore, correctRate };
  });
  if (!changed) return classData;
  // 总分变化后同步重排各课次名次，保证排名与总分一致
  let ranked = records;
  new Set(records.map(r => r.lessonNumber)).forEach(lesson => {
    ranked = rerankLesson(ranked, lesson);
  });
  return { ...classData, records: ranked };
}

function recomputeAllRates(classes: { [key: string]: Class }, appConfig: AppConfig): { [key: string]: Class } {
  let changed = false;
  const next: { [key: string]: Class } = {};
  Object.entries(classes).forEach(([id, c]) => {
    const nc = recomputeRatesInClass(c, appConfig);
    if (nc !== c) changed = true;
    next[id] = nc;
  });
  return changed ? next : classes;
}

// 历史数据规范化：把「请假」记录的已计总分/正确率清零并重排各课次名次（旧数据加载/云端导入时执行）
// 历史选项值迁移：把记录里旧版选项（按时出勤/超赞完成/圆满完成/没带/专注高效…）
// 换成现行选项，避免下拉框出现"看得见却选不中"的幽灵值（与最新选项集保持一致）
function migrateLegacyRecordOptions(all: { [key: string]: Class }): { [key: string]: Class } {
  let changed = false;
  const next: { [key: string]: Class } = {};
  Object.entries(all).forEach(([cid, cls]) => {
    if (!cls?.records?.length) { next[cid] = cls; return; }
    let clsChanged = false;
    const records = cls.records.map(r => {
      const attendance = migrateLegacyOption(r.attendance);
      const homeworkStatus = migrateLegacyOption(r.homeworkStatus);
      const listeningStatus = migrateLegacyOption(r.listeningStatus);
      const classPerformance = migrateLegacyOption(r.classPerformance);
      if (
        attendance === r.attendance && homeworkStatus === r.homeworkStatus
        && listeningStatus === r.listeningStatus && classPerformance === r.classPerformance
      ) return r;
      clsChanged = true;
      return {
        ...r,
        ...(attendance !== undefined ? { attendance } : {}),
        ...(homeworkStatus !== undefined ? { homeworkStatus } : {}),
        ...(listeningStatus !== undefined ? { listeningStatus } : {}),
        ...(classPerformance !== undefined ? { classPerformance } : {}),
      } as StudentRecord;
    });
    if (clsChanged) changed = true;
    next[cid] = clsChanged ? { ...cls, records } : cls;
  });
  return changed ? next : all;
}

// 历史配置迁移：把「口语得分」这类附加项题型补上 excludeFromTotal 标记
// （老数据里它们被当成普通题型计入了总分，需要按新口径纠正；幂等，可重复执行）
function migrateExcludeFromTotal(all: { [key: string]: Class }): { [key: string]: Class } {
  const shouldExclude = (name: string) => /口语|朗读|跟读|配音|口试/.test(name || '');
  let changed = false;
  const next: { [key: string]: Class } = {};
  Object.entries(all).forEach(([cid, cls]) => {
    const cfgs = cls?.lessonConfigs || {};
    let cfgChanged = false;
    const nextCfgs: typeof cfgs = { ...cfgs };
    Object.entries(cfgs).forEach(([key, cfg]) => {
      if (!cfg?.questionTypes?.length) return;
      let typeChanged = false;
      const types = cfg.questionTypes.map(qt => {
        if (shouldExclude(qt.name) && !qt.excludeFromTotal) {
          typeChanged = true;
          return { ...qt, excludeFromTotal: true };
        }
        return qt;
      });
      if (typeChanged) {
        nextCfgs[key] = { ...cfg, questionTypes: types };
        cfgChanged = true;
      }
    });
    if (cfgChanged) { changed = true; next[cid] = { ...cls, lessonConfigs: nextCfgs }; }
    else next[cid] = cls;
  });
  return changed ? next : all;
}

function normalizeLeaveTotals(all: { [key: string]: Class }): { [key: string]: Class } {
  let changed = false;
  const next: { [key: string]: Class } = {};
  Object.entries(all).forEach(([cid, cls]) => {
    if (!cls?.records) { next[cid] = cls; return; }
    let clsChanged = false;
    let records = cls.records.map(r => {
      if (attendanceKind(r.attendance) === 'leave' && (r.totalScore > 0 || r.correctRate > 0)) {
        clsChanged = true;
        return { ...r, totalScore: 0, correctRate: 0 };
      }
      return r;
    });
    if (clsChanged) {
      changed = true;
      const lessons = new Set(records.map(r => r.lessonNumber));
      let ranked = records;
      lessons.forEach(lesson => {
        ranked = rerankLesson(ranked, lesson);
      });
      records = ranked;
    }
    next[cid] = clsChanged ? { ...cls, records } : cls;
  });
  return changed ? next : all;
}

// 加载期自愈：把登记表里记录的模板文本写回配置。
// 场景：某次整体快照覆盖、或旧包缺字段导致配置里的模板是旧的/空的，
// 而登记表始终保留着"最后一次编辑"的内容与时间戳 → 用更新的那份覆盖回来。
function applyTemplateStore(
  appConfig: AppConfig,
  classes: { [key: string]: Class }
): { appConfig: AppConfig; classes: { [key: string]: Class } } {
  const store = readTemplateStore();
  if (!Object.keys(store).length) return { appConfig, classes };

  const nextApp: AppConfig = { ...appConfig };
  const gFb = getStamp(SLOT.globalFeedback, store);
  if (gFb && gFb.text !== nextApp.defaultFeedbackTemplate) nextApp.defaultFeedbackTemplate = gFb.text;
  const gPr = getStamp(SLOT.globalPraise, store);
  if (gPr && gPr.text !== nextApp.defaultPraiseTemplate) nextApp.defaultPraiseTemplate = gPr.text;

  let classesChanged = false;
  const nextClasses: { [key: string]: Class } = {};
  Object.entries(classes).forEach(([cid, cls]) => {
    const cfgs = cls?.lessonConfigs || {};
    let cfgChanged = false;
    const nextCfgs: typeof cfgs = { ...cfgs };
    Object.keys(cfgs).forEach(lessonKey => {
      const lesson = Number(lessonKey);
      const cfg = cfgs[lessonKey];
      if (!cfg) return;
      const fb = getStamp(SLOT.lessonFeedback(cid, lesson), store);
      const pr = getStamp(SLOT.lessonPraise(cid, lesson), store);
      const f4 = getStamp(SLOT.lessonFourInOne(cid, lesson), store);
      const patch: Partial<LessonConfig> = {};
      if (fb && fb.text !== cfg.feedbackTemplate) patch.feedbackTemplate = fb.text;
      if (pr && pr.text !== cfg.praiseTemplate) patch.praiseTemplate = pr.text;
      if (f4 && f4.text !== cfg.fourInOneTemplate) patch.fourInOneTemplate = f4.text;
      if (Object.keys(patch).length) {
        nextCfgs[lessonKey] = { ...cfg, ...patch };
        cfgChanged = true;
      }
    });
    if (cfgChanged) { classesChanged = true; nextClasses[cid] = { ...cls, lessonConfigs: nextCfgs }; }
    else nextClasses[cid] = cls;
  });

  return { appConfig: nextApp, classes: classesChanged ? nextClasses : classes };
}

export function useClassData() {
  // 应用配置
  const [appConfig, setAppConfig] = useState<AppConfig>(() => {
    const saved = safeParse<Partial<AppConfig>>('appConfig', {});
    const base = migrateDefaultOptions({ ...defaultAppConfig, ...saved }, saved);
    // 模板自愈：登记表里的最后一次编辑优先（避免被旧配置/新部署的默认值冲掉）
    const savedClasses = safeParse<{ [key: string]: Class } | null>('classData', null);
    return applyTemplateStore(base, savedClasses && typeof savedClasses === 'object' ? savedClasses : {}).appConfig;
  });

  // 班级数据
  const [classes, setClasses] = useState<{ [key: string]: Class }>(() => {
    const saved = safeParse<{ [key: string]: Class } | null>('classData', null);
    if (saved && typeof saved === 'object') {
      // 加载期迁移：请假清零 + 以当前课次真实满分重算正确率（修复历史 300 分母）
      const migrated = recomputeAllRates(normalizeLeaveTotals(migrateLegacyRecordOptions(migrateExcludeFromTotal(saved))), appConfig);
      // 课次模板自愈：登记表里的最后一次编辑优先
      return applyTemplateStore(appConfig, migrated).classes;
    }
    // 初始化示例数据
    return {
      'class1': {
        id: 'class1',
        name: '寒假双语班',
        students: ['陈乐颐', '陈乐颖', '陈思瑶', '陈梓涛', '邓卓峰', '付博菡', '管语彤', '黎翰旭'],
        records: [],
        lessonConfigs: {}
      },
      'class2': {
        id: 'class2',
        name: '寒假提高班',
        students: ['梁栩帆', '林鸿业', '刘梅凤', '刘梓皓', '欧阳凌娜', '彭臻'],
        records: [],
        lessonConfigs: {}
      }
    };
  });

  // 当前班级和课次
  const [currentClassId, setCurrentClassId] = useState<string | null>(() => {
    const saved = localStorage.getItem('currentClassId');
    return saved || 'class1';
  });

  const [currentLessonNumber, setCurrentLessonNumber] = useState<number>(() => {
    const saved = localStorage.getItem('currentLessonNumber');
    const n = saved ? parseInt(saved, 10) : 1;
    // 损坏值（NaN/非正数）回退第 1 课，避免 NaN 课次导致所有过滤为空
    return Number.isFinite(n) && n > 0 ? n : 1;
  });

  // 学生昵称（按班级）
  const [nicknames, setNicknames] = useState<{ [classId: string]: { [studentName: string]: string } }>(() => {
    return safeParse('studentNicknames', {});
  });

  // 校内成绩
  const [schoolScores, setSchoolScores] = useState<{ [studentName: string]: SchoolScore[] }>(() => {
    return safeParse('schoolScores', {});
  });

  // 保存到 localStorage
  // 性能：录入分数时 classes 每次击键都变化，旧实现会即时全量 JSON.stringify
  // 所有班级数据（可达数 MB），造成主线程卡顿。改为 400ms 防抖合并写入，
  // 并在页面隐藏/关闭前立即落盘一次，确保持久性不降级。
  useEffect(() => {
    const flush = () => safeSet('appConfig', JSON.stringify(appConfig));
    const t = setTimeout(flush, 400);
    const onHide = () => { clearTimeout(t); flush(); };
    window.addEventListener('pagehide', onHide);
    return () => { clearTimeout(t); window.removeEventListener('pagehide', onHide); };
  }, [appConfig]);

  useEffect(() => {
    const flush = () => safeSet('classData', JSON.stringify(classes));
    const t = setTimeout(flush, 400);
    const onHide = () => { clearTimeout(t); flush(); };
    window.addEventListener('pagehide', onHide);
    return () => { clearTimeout(t); window.removeEventListener('pagehide', onHide); };
  }, [classes]);

  useEffect(() => {
    safeSet('currentClassId', currentClassId || '');
  }, [currentClassId]);

  useEffect(() => {
    safeSet('currentLessonNumber', currentLessonNumber.toString());
  }, [currentLessonNumber]);

  useEffect(() => {
    safeSet('studentNicknames', JSON.stringify(nicknames));
  }, [nicknames]);

  useEffect(() => {
    const flush = () => safeSet('schoolScores', JSON.stringify(schoolScores));
    const t = setTimeout(flush, 400);
    const onHide = () => { clearTimeout(t); flush(); };
    window.addEventListener('pagehide', onHide);
    return () => { clearTimeout(t); window.removeEventListener('pagehide', onHide); };
  }, [schoolScores]);

  // 获取当前班级
  const currentClass = currentClassId ? classes[currentClassId] : null;

  // 获取当前课次配置
  const getLessonConfig = useCallback((classId: string, lessonNumber: number): LessonConfig => {
    const classData = classes[classId];
    if (!classData) return getDefaultLessonConfig(appConfig);
    
    const config = classData.lessonConfigs[lessonNumber.toString()];
    if (config) return withLessonDefaults(config, appConfig);
    
    // 如果没有课次配置，尝试使用上一节课的配置
    const prevLesson = lessonNumber - 1;
    if (prevLesson > 0 && classData.lessonConfigs[prevLesson.toString()]) {
      return withLessonDefaults(classData.lessonConfigs[prevLesson.toString()], appConfig);
    }
    
    return getDefaultLessonConfig(appConfig);
  }, [classes, appConfig]);

  const currentLessonConfig = useMemo(() => {
    if (!currentClassId) return getDefaultLessonConfig(appConfig);
    return getLessonConfig(currentClassId, currentLessonNumber);
  }, [currentClassId, currentLessonNumber, getLessonConfig, appConfig]);

  // 获取当前课次的记录
  const getCurrentLessonRecords = useCallback(() => {
    if (!currentClass) return [];
    return currentClass.records.filter(r => r.lessonNumber === currentLessonNumber);
  }, [currentClass, currentLessonNumber]);

  // 获取所有课次
  const getAllLessons = useCallback((classId?: string) => {
    const classData = classId ? classes[classId] : currentClass;
    if (!classData) return [];
    const lessons = [...new Set(classData.records.map(r => r.lessonNumber))];
    return lessons.sort((a, b) => a - b);
  }, [currentClass, classes]);

  // 获取学生昵称
  const getStudentNickname = useCallback((studentName: string, classId?: string) => {
    const cid = classId || currentClassId;
    if (!cid) return studentName;
    return nicknames[cid]?.[studentName] || studentName;
  }, [nicknames, currentClassId]);

  // 设置学生昵称
  const setStudentNickname = useCallback((studentName: string, nickname: string, classId?: string) => {
    const cid = classId || currentClassId;
    if (!cid) return;
    setNicknames(prev => ({
      ...prev,
      [cid]: { ...prev[cid], [studentName]: nickname }
    }));
  }, [currentClassId]);

  // 获取作业内容
  const getHomeworkText = useCallback((lessonNumber: number, classId?: string) => {
    const cid = classId || currentClassId;
    if (!cid) return getDefaultLessonConfig(appConfig).homeworkText;
    return getLessonConfig(cid, lessonNumber).homeworkText;
  }, [currentClassId, getLessonConfig, appConfig]);

  // 计算班级统计数据
  // 口径：请假/缺勤学员不计入总分与平均分（含各题型班均），0 分不再拉低统计
  const calculateClassStats = useCallback((records: StudentRecord[], questionTypes: QuestionType[]): ClassStats => {
    if (records.length === 0) {
      return { maxScore: 0, minScore: 0, avgScore: 0, avgScores: {} };
    }

    const present = records.filter(r => !isAbsentRecord(r));
    const scores = present.map(r => r.totalScore);
    const maxScore = scores.length ? Math.max(...scores) : 0;
    const minScore = scores.length ? Math.min(...scores) : 0;
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const avgScores: { [key: string]: number } = {};
    questionTypes.forEach(qt => {
      if (qt.excludeFromTotal) {
        // 附加项（如口语得分）：并非每次课都登记 → 只对"已登记"的值求平均，
        // 未登记（key 不存在）不能当作 0，否则班均会被拉低
        const registered = present
          .map(r => r.scores[qt.id])
          .filter((v): v is number => typeof v === 'number');
        avgScores[qt.id] = registered.length > 0
          ? Math.round(registered.reduce((a, b) => a + b, 0) / registered.length * 10) / 10
          : 0;
        return;
      }
      // 仅统计出勤学员；到课学员的 0 分也计入班均（不再用 >0 过滤，避免班均虚高）
      const typeScores = present.map(r => r.scores[qt.id] || 0);
      avgScores[qt.id] = typeScores.length > 0
        ? Math.round(typeScores.reduce((a, b) => a + b, 0) / typeScores.length * 10) / 10
        : 0;
    });

    return { maxScore, minScore, avgScore, avgScores };
  }, []);

  // 计算学生薄弱项（按板块聚合，得分率口径）
  const calculateWeakPoints = useCallback((record: StudentRecord, questionTypes: QuestionType[]): CategoryWeakPoint[] => {
    if (!currentClass) return [];

    const lessonRecords = currentClass.records.filter(
      r => r.lessonNumber === record.lessonNumber
    );
    // 附加项（如口语得分）不属于小测，不参与薄弱项分析
    const quizTypes = questionTypes.filter(qt => !qt.excludeFromTotal);
    const stats = calculateClassStats(lessonRecords, quizTypes);

    return computeCategoryWeakPoints(record, quizTypes, stats.avgScores);
  }, [currentClass, calculateClassStats]);

  // 创建新班级
  const createClass = useCallback((name: string, term?: string, batchCode?: string) => {
    const id = 'class' + generateId();
    setClasses(prev => ({
      ...prev,
      [id]: {
        id,
        name,
        term: term?.trim() || undefined,
        batchCode: batchCode?.trim() || undefined,
        students: [],
        records: [],
        lessonConfigs: {}
      }
    }));
    return id;
  }, []);

  // 更新班级基础信息（名称/学期/批次编号）
  const updateClass = useCallback((classId: string, patch: { name?: string; term?: string; batchCode?: string }) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;
      return {
        ...prev,
        [classId]: {
          ...classData,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.term !== undefined ? { term: patch.term?.trim() || undefined } : {}),
          ...(patch.batchCode !== undefined ? { batchCode: patch.batchCode?.trim() || undefined } : {})
        }
      };
    });
  }, []);

  // 删除班级
  const deleteClass = useCallback((classId: string) => {
    setClasses(prev => {
      const newClasses = { ...prev };
      delete newClasses[classId];
      return newClasses;
    });
    // 同步清理该班的昵称，避免数据残留无限增长
    setNicknames(prev => {
      if (!(classId in prev)) return prev;
      const next = { ...prev };
      delete next[classId];
      return next;
    });
    if (currentClassId === classId) {
      const remainingClasses = Object.keys(classes).filter(id => id !== classId);
      setCurrentClassId(remainingClasses[0] || null);
    }
  }, [currentClassId, classes]);

  // 添加学生到班级
  const addStudentToClass = useCallback((classId: string, studentName: string) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData || classData.students.includes(studentName)) return prev;

      return {
        ...prev,
        [classId]: {
          ...classData,
          students: [...classData.students, studentName]
        }
      };
    });
    // 设置默认昵称
    setNicknames(prev => ({
      ...prev,
      [classId]: { ...prev[classId], [studentName]: studentName }
    }));
  }, []);

  // 批量添加学生
  const addStudents = useCallback((classId: string, studentNames: string[]) => {
    setClasses(prev => {
      const classData = prev[classId];
      // 防御：班级不存在时忽略，避免 undefined.students 崩溃
      if (!classData) return prev;
      const known = new Set(classData.students);
      const newStudents = studentNames.filter(name => name && !known.has(name));

      return {
        ...prev,
        [classId]: {
          ...classData,
          students: [...classData.students, ...newStudents]
        }
      };
    });
    
    const newNicknames: { [key: string]: string } = {};
    studentNames.forEach(name => {
      newNicknames[name] = name;
    });
    setNicknames(prev => ({
      ...prev,
      [classId]: { ...prev[classId], ...newNicknames }
    }));
  }, []);

  // 从班级移除学生（连带删除其记录），并重排受影响课次名次
  const removeStudentFromClass = useCallback((classId: string, studentName: string) => {
    setClasses(prev => {
      const cls = prev[classId];
      if (!cls) return prev;
      const lessons = new Set(cls.records.filter(r => r.studentName === studentName).map(r => r.lessonNumber));
      let records = cls.records.filter(r => r.studentName !== studentName);
      lessons.forEach(l => { records = rerankLesson(records, l); });
      return {
        ...prev,
        [classId]: {
          ...cls,
          students: cls.students.filter(s => s !== studentName),
          records
        }
      };
    });
  }, []);

  // 转班：只移动名单，不动任何学情记录。
  // 转出班：移出名单、保留历史记录（历史课次统计不受影响）；转入班：仅加入名单，学情从零开始。
  const transferStudent = useCallback((studentName: string, fromClassId: string, toClassId: string | null) => {
    setClasses(prev => {
      const from = prev[fromClassId];
      if (!from) return prev;
      const next = { ...prev };
      next[fromClassId] = { ...from, students: from.students.filter(s => s !== studentName) };
      if (toClassId && next[toClassId] && !next[toClassId].students.includes(studentName)) {
        next[toClassId] = { ...next[toClassId], students: [...next[toClassId].students, studentName] };
      }
      return next;
    });
  }, []);

  // 将学员恢复到某班级名单（转班撤销 / 已转出学员归队）；不涉及记录
  const restoreStudentToClass = useCallback((studentName: string, classId: string) => {
    setClasses(prev => {
      const cls = prev[classId];
      if (!cls || cls.students.includes(studentName)) return prev;
      return { ...prev, [classId]: { ...cls, students: [...cls.students, studentName] } };
    });
  }, []);

  // 仅从名单移除学员（保留记录）——用于转班撤销时回退目标班名单
  const removeStudentFromRoster = useCallback((classId: string, studentName: string) => {
    setClasses(prev => {
      const cls = prev[classId];
      if (!cls) return prev;
      return { ...prev, [classId]: { ...cls, students: cls.students.filter(s => s !== studentName) } };
    });
  }, []);

  // 保存课次配置
  const saveLessonConfig = useCallback((classId: string, lessonNumber: number, config: Partial<LessonConfig>) => {
    // 课次模板打戳登记：只有"文本真的变了"才更新时间戳
    if (config.feedbackTemplate !== undefined) stampTemplate(SLOT.lessonFeedback(classId, lessonNumber), config.feedbackTemplate);
    if (config.praiseTemplate !== undefined) stampTemplate(SLOT.lessonPraise(classId, lessonNumber), config.praiseTemplate);
    if (config.fourInOneTemplate !== undefined) stampTemplate(SLOT.lessonFourInOne(classId, lessonNumber), config.fourInOneTemplate);
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;
      const existingConfig = classData.lessonConfigs[lessonNumber.toString()] || getDefaultLessonConfig(appConfig);
      const updated: Class = {
        ...classData,
        lessonConfigs: {
          ...classData.lessonConfigs,
          [lessonNumber.toString()]: { ...existingConfig, ...config }
        }
      };
      // 课次配置变化（增删题型/改满分/计入总分开关）后，用新满分重算该班全部记录正确率，保持三处口径一致
      return { ...prev, [classId]: recomputeRatesInClass(updated, appConfig) };
    });
  }, [appConfig]);

  // 创建或更新记录
  const saveRecord = useCallback((classId: string, record: Partial<StudentRecord>) => {
    setClasses(prev => {
      const classData = prev[classId];
      // 防御：班级不存在（如云端导入竞态/被删除）时静默忽略，避免 TypeError
      if (!classData) return prev;
      const lessonNumber = record.lessonNumber || currentLessonNumber;
      // 在 updater 内按 prev 解析配置：与满分同步等排在前面的更新顺序正确，
      // 不会拿到过期闭包里的旧配置
      const baseCfg = classData.lessonConfigs[lessonNumber.toString()]
        || (lessonNumber > 1 ? classData.lessonConfigs[(lessonNumber - 1).toString()] : undefined)
        || getDefaultLessonConfig(appConfig);
      const lessonConfig = withLessonDefaults(baseCfg, appConfig);

      const existingIndex = classData.records.findIndex(
        r => r.studentName === record.studentName && r.lessonNumber === record.lessonNumber
      );

      let newRecords;
      if (existingIndex >= 0) {
        // 更新现有记录
        newRecords = [...classData.records];
        const existing = newRecords[existingIndex];
        const updatedScores = { ...existing.scores, ...record.scores };
        const updatedCustom = record.customValues
          ? { ...(existing.customValues || {}), ...record.customValues }
          : existing.customValues;

        const { totalScore, correctRate } = computeTotals(updatedScores, updatedCustom, lessonConfig, record.attendance ?? existing.attendance);

        newRecords[existingIndex] = { 
          ...existing, 
          ...record,
          scores: updatedScores,
          customValues: updatedCustom,
          totalScore,
          correctRate
        };
      } else {
        // 创建新记录
        const scores = record.scores || {};
        const { totalScore, correctRate } = computeTotals(scores, record.customValues, lessonConfig, record.attendance);

        const newRecord: StudentRecord = {
          // 先承载调用方传入的全部字段（课堂表现 / 备注 / 调课原因 / 自定义列…），
          // 否则逐字段手写会静默丢弃未列出的字段——导入"课堂表现"丢失就是由此而来
          ...record,
          id: generateId(),
          studentName: record.studentName || '',
          lessonNumber: record.lessonNumber || currentLessonNumber,
          seasons: record.seasons || [],
          // 未提供的状态一律留空，不再塞入旧版选项（原为 '按时出勤' / '圆满完成' / '具体分数'，
          // 这些值已在新版选项中废弃，写进去会导致下拉框显示成"看得见但选不中"的幽灵值）
          attendance: record.attendance ?? '',
          homeworkStatus: record.homeworkStatus ?? '',
          listeningStatus: record.listeningStatus ?? '',
          listeningScore: record.listeningScore ?? 0,
          scores,
          customValues: record.customValues || {},
          totalScore,
          correctRate,
          rank: 0,
          date: new Date().toISOString().slice(0, 10)
        };
        newRecords = [...classData.records, newRecord];
      }

      // 重新计算排名
      const ranked = rerankLesson(newRecords, lessonNumber);

      return {
        ...prev,
        [classId]: { ...classData, records: ranked }
      };
    });
  }, [currentLessonNumber, appConfig]);

  // 更新记录字段
  const updateRecordField = useCallback((
    classId: string,
    recordId: string,
    field: keyof StudentRecord,
    value: StudentRecord[keyof StudentRecord]
  ) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;
      const recordIndex = classData.records.findIndex(r => r.id === recordId);
      if (recordIndex < 0) return prev;

      const newRecords = [...classData.records];
      newRecords[recordIndex] = { ...newRecords[recordIndex], [field]: value };

      // 分数、自定义值或考勤变化：统一口径重算总分/正确率与排名（请假→总分清零，恢复出勤→重新计入）
      if (field === 'scores' || field === 'customValues' || field === 'attendance') {
        const record = newRecords[recordIndex];
        // 关键：用记录自身所属课次的配置重算（原实现固定取当前课次，跨课次更新会算错）
        const lesson = record.lessonNumber || currentLessonNumber;
        const lessonConfig =
          classData.lessonConfigs[lesson.toString()] ||
          (lesson > 1 ? classData.lessonConfigs[(lesson - 1).toString()] : undefined) ||
          getDefaultLessonConfig(appConfig);
        const { totalScore, correctRate } = computeTotals(record.scores, record.customValues, lessonConfig, record.attendance);
        newRecords[recordIndex].totalScore = totalScore;
        newRecords[recordIndex].correctRate = correctRate;

        // 重新计算排名
        const ranked = rerankLesson(newRecords, lesson);
        return {
          ...prev,
          [classId]: { ...classData, records: ranked }
        };
      }

      return {
        ...prev,
        [classId]: { ...classData, records: newRecords }
      };
    });
  }, [currentLessonNumber, appConfig]);

  // 导入即对齐课次题型配置：以导入表格的列为准，重建目标课次的题型；
  // - 命中已有题型 → 沿用其 id（保住已录分数），满分按本次列数据最大值更新
  // - 表格新增列 → 补建题型（满分取列最大值）
  // - 表格中不存在、但本课次已有分数的题型 → 追加保留（避免历史分数变成孤儿数据）
  // - 表格中不存在且本课次无分数的题型 → 移除
  // 返回「列名 → 题型 id」映射，供导入方把分数落到正确的题型上。
  const syncQuestionTypesFromImport = useCallback((
    classId: string,
    lessonNumber: number,
    columns: { name: string; suggestedFullScore: number; matchedQtId?: string; excludeFromTotal?: boolean }[]
  ): { [columnName: string]: string } => {
    const mapping: { [columnName: string]: string } = {};
    if (!columns.length) return mapping;
    const classData = classes[classId];
    if (!classData) return mapping;

    const key = lessonNumber.toString();
    const baseCfg = classData.lessonConfigs[key]
      || (lessonNumber > 1 ? classData.lessonConfigs[(lessonNumber - 1).toString()] : undefined)
      || getDefaultLessonConfig(appConfig);

    // 本课次已录入的题型分数（用于判断能否安全移除某题型）
    const usedQtIds = new Set<string>();
    classData.records.forEach(r => {
      if (r.lessonNumber !== lessonNumber) return;
      Object.entries(r.scores || {}).forEach(([qtId, v]) => { if ((v || 0) !== 0) usedQtIds.add(qtId); });
    });

    const byName = new Map(baseCfg.questionTypes.map(qt => [qt.name, qt]));
    const nextTypes: QuestionType[] = [];
    const takenIds = new Set<string>();

    columns.forEach((col, i) => {
      const name = (col.name || '').trim();
      if (!name) return;
      const existing = (col.matchedQtId ? baseCfg.questionTypes.find(q => q.id === col.matchedQtId) : undefined)
        || byName.get(name);
      const fullScore = col.suggestedFullScore > 0 ? col.suggestedFullScore : (existing?.fullScore || 100);
      // 不计入小测总分的列（口语等）→ 落到题型标记上；已存在题型时一并纠正
      // 只有"表格列明确命中附加项"时才改标记；表格没有该信息时保留原值，
      // 避免一次普通导入把口语等附加项重新算进总分
      const excludeFromTotal = col.excludeFromTotal ?? existing?.excludeFromTotal ?? undefined;
      if (existing && !takenIds.has(existing.id)) {
        takenIds.add(existing.id);
        nextTypes.push({ ...existing, name, fullScore, order: i, excludeFromTotal });
      } else {
        const id = 'qt_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
        nextTypes.push({ id, name, fullScore, order: i, excludeFromTotal });
      }
      mapping[name] = nextTypes[nextTypes.length - 1].id;
    });

    // 表格里没有、但本课已有分数的题型：追加保留，避免数据丢失
    baseCfg.questionTypes.forEach(qt => {
      if (takenIds.has(qt.id)) return;
      if (usedQtIds.has(qt.id)) {
        nextTypes.push({ ...qt, order: nextTypes.length });
        mapping[qt.name] = qt.id;
      }
    });

    const changed = nextTypes.length !== baseCfg.questionTypes.length
      || nextTypes.some((qt, i) => {
        const old = baseCfg.questionTypes[i];
        return !old || old.id !== qt.id || old.name !== qt.name
        || (old.fullScore || 0) !== (qt.fullScore || 0)
        || (old.excludeFromTotal || false) !== (qt.excludeFromTotal || false);
      });

    if (changed) {
      const updatedConfig: LessonConfig = { ...baseCfg, questionTypes: nextTypes };
      setClasses(prev => {
        const cd = prev[classId];
        if (!cd) return prev;
        // 配置变了 → 用新满分重算该课次总分/正确率并重排名次
        const updateRecords = (records: StudentRecord[]) => rerankLesson(
          records.map(r => {
            if (r.lessonNumber !== lessonNumber) return r;
            const { totalScore, correctRate } = computeTotals(r.scores, r.customValues, updatedConfig, r.attendance);
            return (r.totalScore !== totalScore || r.correctRate !== correctRate)
              ? { ...r, totalScore, correctRate }
              : r;
          }),
          lessonNumber
        );
        return {
          ...prev,
          [classId]: {
            ...cd,
            lessonConfigs: { ...cd.lessonConfigs, [key]: updatedConfig },
            records: updateRecords(cd.records)
          }
        };
      });
    }

    return mapping;
  }, [classes, appConfig]);

  // 同步题型真实满分并重算该课次全部记录：
  // 在线表格导入时按列数据最大值推断各题型卷面满分（如第一次课 50、第二次 35），
  // 回填到课次配置后，以统一分母（getLessonFullScore）重算总分/正确率/排名，
  // 修正"分母停留在默认 300"导致三处 Tab 正确率失真的问题。
  // 返回实际更新的题型数量。
  const syncQuestionFullScores = useCallback((classId: string, lessonNumber: number, updates: { qtId: string; fullScore: number }[]): number => {
    if (!updates.length) return 0;
    const classData = classes[classId];
    if (!classData) return 0;
    const key = lessonNumber.toString();
    const baseCfg = classData.lessonConfigs[key]
      || (lessonNumber > 1 ? classData.lessonConfigs[(lessonNumber - 1).toString()] : undefined)
      || getDefaultLessonConfig(appConfig);

    const qtById = new Map(baseCfg.questionTypes.map(qt => [qt.id, qt]));
    let applied = 0;
    updates.forEach(u => {
      const qt = qtById.get(u.qtId);
      if (!qt) return;
      const next = Math.max(0, Math.round(u.fullScore * 100) / 100);
      if (Math.abs((qt.fullScore || 0) - next) < 0.01) return;
      qtById.set(u.qtId, { ...qt, fullScore: next });
      applied++;
    });
    if (applied === 0) return 0;
    const questionTypes = baseCfg.questionTypes.map(qt => qtById.get(qt.id) || qt);
    const updatedConfig = { ...baseCfg, questionTypes };

    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      // 用新分母重算该课次全部记录（含请假口径），并重排名次
      const ranked = rerankLesson(
        cd.records.map(r => {
          if (r.lessonNumber !== lessonNumber) return r;
          const { totalScore, correctRate } = computeTotals(r.scores, r.customValues, updatedConfig, r.attendance);
          return (r.totalScore !== totalScore || r.correctRate !== correctRate)
            ? { ...r, totalScore, correctRate }
            : r;
        }),
        lessonNumber
      );
      return {
        ...prev,
        [classId]: {
          ...cd,
          lessonConfigs: { ...cd.lessonConfigs, [key]: updatedConfig },
          records: ranked
        }
      };
    });
    return applied;
  }, [classes, appConfig]);

  // 删除记录
  const deleteRecord = useCallback((classId: string, recordId: string) => {
    setClasses(prev => {
      const cls = prev[classId];
      if (!cls) return prev;
      const removed = cls.records.find(r => r.id === recordId);
      const filtered = cls.records.filter(r => r.id !== recordId);
      const records = removed ? rerankLesson(filtered, removed.lessonNumber) : filtered;
      return { ...prev, [classId]: { ...cls, records } };
    });
  }, []);

  // 清空某条记录的全部内容（保留考勤/学习轨迹与学生与记录本身）——服务于「请假生什么都不用记」
  const clearRecordContent = useCallback((classId: string, recordId: string) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;
      const idx = classData.records.findIndex(r => r.id === recordId);
      if (idx < 0) return prev;

      const newRecords = [...classData.records];
      newRecords[idx] = {
        ...newRecords[idx],
        scores: {},
        customValues: {},
        homeworkStatus: '',
        listeningStatus: '',
        listeningScore: 0,
        classPerformance: '',
        note: '',
        adjustReason: '',
        totalScore: 0,
        correctRate: 0,
      };

      // 重算该课次排名
      const lesson = newRecords[idx].lessonNumber;
      const ranked = rerankLesson(newRecords, lesson);

      return { ...prev, [classId]: { ...classData, records: ranked } };
    });
  }, []);

  // 新增课次时自动继承最近一次历史课的学习轨迹（seasons）：
  // 有轨迹的学生在新课次建空记录并带入轨迹；已有记录但轨迹为空则回填。其余内容留空。
  const inheritPreviousSeasons = useCallback((classId: string, newLessonNumber: number): { fromLesson: number; count: number } | null => {
    const classData = classes[classId];
    if (!classData) return null;
    const prevLesson = [...new Set(classData.records.map(r => r.lessonNumber))]
      .filter(n => n < newLessonNumber)
      .sort((a, b) => b - a)[0];
    if (prevLesson == null) return null;
    // 仅给当前名单内的学员继承；已转出的学员不生成新课次记录（避免重新进入统计）
    const roster = new Set(classData.students);
    const sources = classData.records.filter(r => r.lessonNumber === prevLesson && (r.seasons?.length ?? 0) > 0 && roster.has(r.studentName));
    if (sources.length === 0) return null;

    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      const newRecords = [...cd.records];
      sources.forEach(src => {
        const idx = newRecords.findIndex(r => r.studentName === src.studentName && r.lessonNumber === newLessonNumber);
        if (idx >= 0) {
          if (!(newRecords[idx].seasons?.length)) newRecords[idx] = { ...newRecords[idx], seasons: [...src.seasons] };
          return;
        }
        // 白名单重建（不要用 ...src 展开）：`...src` 会把上一课的内容字段一并带过来，
        // 历史上就漏掉了 classPerformance —— 新课次一建好，该生「课堂表现」直接显示上一课的内容，
        // 还会流进报告与反馈文案。这里只继承"身份与名单"信息，内容字段一律清空。
        newRecords.push({
          id: 'rec' + generateId(),
          studentName: src.studentName,
          lessonNumber: newLessonNumber,
          seasons: [...src.seasons],
          attendance: '',
          classPerformance: '',
          homeworkStatus: '',
          listeningStatus: '',
          listeningScore: 0,
          scores: {},
          customValues: {},
          totalScore: 0,
          correctRate: 0,
          rank: 0,
          date: new Date().toISOString().slice(0, 10),
          note: '',
          adjustReason: '',
        });
      });
      return { ...prev, [classId]: { ...cd, records: newRecords } };
    });
    return { fromLesson: prevLesson, count: sources.length };
  }, [classes]);

  // 恢复被删除的单条记录（保留原 id，用于删除撤销）
  const restoreRecord = useCallback((classId: string, record: StudentRecord) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;
      // 已存在同 id 或同「学生+课次」的记录则不重复插入
      const exists = classData.records.some(
        r => r.id === record.id || (r.studentName === record.studentName && r.lessonNumber === record.lessonNumber)
      );
      if (exists) return prev;

      const newRecords = [...classData.records, record];
      // 重算该课次排名，与 saveRecord 保持一致
      const ranked = rerankLesson(newRecords, record.lessonNumber);

      return { ...prev, [classId]: { ...classData, records: ranked } };
    });
  }, []);

  // 一键删除某课次全部记录（返回被删记录，供撤销恢复）
  const deleteLessonRecords = useCallback((classId: string, lessonNumber: number): StudentRecord[] => {
    const classData = classes[classId];
    if (!classData) return [];
    const removed = classData.records.filter(r => r.lessonNumber === lessonNumber);
    if (removed.length === 0) return [];
    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      return { ...prev, [classId]: { ...cd, records: cd.records.filter(r => r.lessonNumber !== lessonNumber) } };
    });
    return removed;
  }, [classes]);

  // 删除整课（记录 + 课次配置），使该课次可被重新新增并锁定全局默认；返回快照供撤销
  const deleteLesson = useCallback((classId: string, lessonNumber: number): { records: StudentRecord[]; config: LessonConfig | undefined } => {
    const classData = classes[classId];
    if (!classData) return { records: [], config: undefined };
    const records = classData.records.filter(r => r.lessonNumber === lessonNumber);
    const config = classData.lessonConfigs[lessonNumber.toString()];
    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      const lessonConfigs = { ...cd.lessonConfigs };
      delete lessonConfigs[lessonNumber.toString()];
      return {
        ...prev,
        [classId]: {
          ...cd,
          records: cd.records.filter(r => r.lessonNumber !== lessonNumber),
          lessonConfigs
        }
      };
    });
    return { records, config };
  }, [classes]);

  // 恢复整课（撤销删除本课）：写回记录与课次配置
  const restoreLesson = useCallback((classId: string, lessonNumber: number, records: StudentRecord[], config: LessonConfig | undefined) => {
    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      const existingIds = new Set(cd.records.map(r => r.id));
      const toAdd = records.filter(r => !existingIds.has(r.id));
      const lessonConfigs = config
        ? { ...cd.lessonConfigs, [lessonNumber.toString()]: config }
        : cd.lessonConfigs;
      let nextRecords = cd.records;
      if (toAdd.length > 0) {
        nextRecords = [...cd.records, ...toAdd];
        nextRecords = rerankLesson(nextRecords, lessonNumber);
      }
      return { ...prev, [classId]: { ...cd, records: nextRecords, lessonConfigs } };
    });
  }, []);

  // 批量恢复记录（撤销用），并重算受影响课次排名
  const restoreRecords = useCallback((classId: string, records: StudentRecord[]) => {
    if (records.length === 0) return;
    setClasses(prev => {
      const cd = prev[classId];
      if (!cd) return prev;
      const existingIds = new Set(cd.records.map(r => r.id));
      const toAdd = records.filter(r => !existingIds.has(r.id));
      if (toAdd.length === 0) return prev;
      const newRecords = [...cd.records, ...toAdd];
      let ranked = newRecords;
      const affected = new Set(toAdd.map(r => r.lessonNumber));
      affected.forEach(lesson => {
        ranked = rerankLesson(ranked, lesson);
      });
      return { ...prev, [classId]: { ...cd, records: ranked } };
    });
  }, []);

  // 恢复被移除的学生及其全部记录（用于移除学生的撤销）
  const restoreStudent = useCallback((classId: string, studentName: string, records: StudentRecord[]) => {
    setClasses(prev => {
      const classData = prev[classId];
      if (!classData) return prev;

      const students = classData.students.includes(studentName)
        ? classData.students
        : [...classData.students, studentName];

      const existingKeys = new Set(
        classData.records.map(r => `${r.studentName}#${r.lessonNumber}`)
      );
      const toRestore = records.filter(
        r => !existingKeys.has(`${r.studentName}#${r.lessonNumber}`)
      );
      let newRecords = [...classData.records, ...toRestore];

      // 重算受影响课次的排名
      const affectedLessons = new Set(toRestore.map(r => r.lessonNumber));
      affectedLessons.forEach(lesson => {
        newRecords = rerankLesson(newRecords, lesson);
      });

      return { ...prev, [classId]: { ...classData, students, records: newRecords } };
    });
  }, []);

  // 更新应用配置
  const updateAppConfig = useCallback((newConfig: Partial<AppConfig>) => {
    // 模板类字段打戳登记（时间戳合并的依据）；文本没变则不打戳，避免无意义地"变新"
    if (newConfig.defaultFeedbackTemplate !== undefined) stampTemplate(SLOT.globalFeedback, newConfig.defaultFeedbackTemplate);
    if (newConfig.defaultPraiseTemplate !== undefined) stampTemplate(SLOT.globalPraise, newConfig.defaultPraiseTemplate);
    setAppConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // 获取学生的所有记录（跨班型）
  const getStudentAllRecords = useCallback((studentName: string): { classId: string; className: string; records: StudentRecord[] }[] => {
    const result: { classId: string; className: string; records: StudentRecord[] }[] = [];
    
    Object.values(classes).forEach(classData => {
      if (classData.students.includes(studentName)) {
        const studentRecords = classData.records.filter(r => r.studentName === studentName);
        if (studentRecords.length > 0) {
          result.push({
            classId: classData.id,
            className: classData.name,
            records: studentRecords.sort((a, b) => a.lessonNumber - b.lessonNumber)
          });
        }
      }
    });
    
    return result;
  }, [classes]);

  // 获取学生的校内成绩
  const getStudentSchoolScores = useCallback((studentName: string): SchoolScore[] => {
    return schoolScores[studentName] || [];
  }, [schoolScores]);

  // 添加校内成绩
  const addSchoolScore = useCallback((score: Omit<SchoolScore, 'id'>) => {
    const newScore: SchoolScore = { ...score, id: generateId() };
    setSchoolScores(prev => ({
      ...prev,
      [score.studentName]: [...(prev[score.studentName] || []), newScore]
    }));
  }, []);

  // 批量导入校内成绩（从Excel）
  // xlsx 为大体积依赖，改为解析时动态加载，首屏不再携带 vendor-xlsx
  const importSchoolScoresFromExcel = useCallback((file: File, classStudents?: string[]): Promise<{ success: number; failed: number; errors: string[]; unmatched: string[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

          if (jsonData.length < 2) {
            resolve({ success: 0, failed: 0, errors: ['文件格式不正确'], unmatched: [] });
            return;
          }

          const rows = jsonData.slice(1);

          let success = 0;
          let failed = 0;
          const errors: string[] = [];
          const unmatchedSet = new Set<string>();

          // 学生姓名匹配：精确匹配 -> 忽略空格匹配 -> 模糊匹配（包含关系）
          const matchStudentName = (inputName: string): string | null => {
            if (!classStudents || classStudents.length === 0) return inputName;
            const trimmed = inputName.trim();
            // 精确匹配
            const exact = classStudents.find(s => s === trimmed);
            if (exact) return exact;
            // 忽略空格
            const noSpace = classStudents.find(s => s.replace(/\s+/g, '') === trimmed.replace(/\s+/g, ''));
            if (noSpace) return noSpace;
            // 互相包含
            const contains = classStudents.find(s => s.includes(trimmed) || trimmed.includes(s));
            if (contains) return contains;
            return null;
          };

          rows.forEach((row, index) => {
            try {
              const rawName = row[0]?.toString().trim();
              const score = parseFloat(row[10]?.toString() || '0');
              const totalScore = parseFloat(row[11]?.toString() || '0');

              if (!rawName || isNaN(score)) {
                failed++;
                errors.push(`第${index + 2}行: 学生姓名或分数无效`);
                return;
              }

              const matchedName = matchStudentName(rawName);
              if (!matchedName) {
                unmatchedSet.add(rawName);
                failed++;
                errors.push(`第${index + 2}行: 「${rawName}」未匹配到班级学生名单`);
                return;
              }

              const newScore: SchoolScore = {
                id: generateId(),
                studentName: matchedName,
                studentCode: row[1]?.toString(),
                // 考试名固定为「校内考试」时，靠 (姓名+日期+分数) 去重，
                // 否则同一份 Excel 导入两次会让成绩条数翻倍、污染平均分与进步对比
                examName: '校内考试',
                date: new Date().toISOString().split('T')[0],
                campus: row[2]?.toString(),
                grade: row[3]?.toString(),
                subject: row[4]?.toString(),
                classType: row[5]?.toString(),
                teacherName: row[6]?.toString(),
                teacherEmail: row[7]?.toString(),
                fiscalYear: row[8]?.toString(),
                quarter: row[9]?.toString(),
                score,
                totalScore,
                convertedScore: parseFloat(row[12]?.toString() || '0'),
                isRecorded: row[13]?.toString() === '是',
                isImproved: row[14]?.toString() === '是',
                improvementType: row[15]?.toString(),
                auditResult: row[16]?.toString(),
                classRank: parseInt(row[17]?.toString() || '0') || undefined,
                gradeRank: parseInt(row[18]?.toString() || '0') || undefined,
                classSize: parseInt(row[19]?.toString() || '0') || undefined,
                gradeLevel: row[20]?.toString(),
                enrollmentPercent: parseFloat(row[21]?.toString() || '0') || undefined,
                school: row[22]?.toString()
              };

              setSchoolScores(prev => ({
                ...prev,
                [matchedName]: [...(prev[matchedName] || []), newScore]
              }));

              success++;
            } catch (err) {
              failed++;
              errors.push(`第${index + 2}行: ${err}`);
            }
          });

          resolve({ success, failed, errors, unmatched: Array.from(unmatchedSet) });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  // 删除校内成绩
  const deleteSchoolScore = useCallback((studentName: string, scoreId: string) => {
    setSchoolScores(prev => ({
      ...prev,
      [studentName]: (prev[studentName] || []).filter(s => s.id !== scoreId)
    }));
  }, []);

  // 恢复被删除的校内成绩（按原始位置插回，保证列表顺序不变）
  const restoreSchoolScore = useCallback((studentName: string, score: SchoolScore) => {
    setSchoolScores(prev => {
      const list = prev[studentName] || [];
      if (list.some(s => s.id === score.id)) return prev;
      const next = [...list];
      // 按 id 在原始快照中的顺序尽力还原：这里追加后按日期排序，保证展示稳定
      next.push(score);
      next.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return { ...prev, [studentName]: next };
    });
  }, []);

  // 导出数据
  const exportData = useCallback(() => {
    return {
      appConfig,
      classes,
      nicknames,
      schoolScores,
      templates: readTemplateStore(),
    };
  }, [appConfig, classes, nicknames, schoolScores]);

  // 导入数据
  const importData = useCallback((data: {
    appConfig: AppConfig;
    classes: { [key: string]: Class };
    nicknames: { [classId: string]: { [studentName: string]: string } };
    schoolScores: { [studentName: string]: SchoolScore[] };
    /** 模板登记表（时间戳合并用）；旧备份可能没有该字段 */
    templates?: TemplateStore;
  }) => {
    // 防御：字段缺失/为 null 时回退空对象；appConfig 与默认值合并，
    // 避免旧备份缺新字段（如课堂表现选项）导致新课次配置残缺
    // 模板登记表：按时间戳"更新者胜出"合并——旧快照永远无法回退新改的模板
    const incomingTemplates = (data as { templates?: TemplateStore } | null)?.templates;
    const { merged: mergedTemplates, changed: tplChanged } = mergeTemplateStores(readTemplateStore(), incomingTemplates);
    if (tplChanged > 0 || incomingTemplates) writeTemplateStore(mergedTemplates);

    const baseAppConfig = migrateDefaultOptions({ ...defaultAppConfig, ...(data?.appConfig || {}) }, data?.appConfig);
    // 导入期迁移：请假清零 + 以课次真实满分重算正确率
    const migratedClasses = recomputeAllRates(
      normalizeLeaveTotals(migrateLegacyRecordOptions(migrateExcludeFromTotal(data?.classes || {}))),
      baseAppConfig
    );
    // 用合并后的登记表覆盖配置中的模板字段（本地更新者胜出）
    const healed = applyTemplateStore(baseAppConfig, migratedClasses);
    setAppConfig(healed.appConfig);
    setClasses(healed.classes);
    setNicknames(data?.nicknames || {});
    setSchoolScores(data?.schoolScores || {});
  }, []);

  // 导出为HTML（公示页，样式可选：gradient/minimal/dark）
  const exportToHTML = useCallback((classId: string, lessonNumber: number, style: 'gradient' | 'minimal' | 'dark' = 'gradient'): string => {
    const classData = classes[classId];
    if (!classData) return '';

    const lessonConfig = getLessonConfig(classId, lessonNumber);
    // 公示只列当前名单内学员：已转出者不上海报、不计入海报平均
    const roster = new Set(classData.students);
    const records = classData.records.filter(r => r.lessonNumber === lessonNumber && roster.has(r.studentName));
    const getNick = (name: string) => nicknames[classId]?.[name] || name;

    return buildPublicityHTML(classData, lessonNumber, records, lessonConfig.questionTypes, getNick, style, lessonConfig.customFields || []);
  }, [classes, nicknames, getLessonConfig]);

  return {
    appConfig,
    classes,
    currentClassId,
    currentLessonNumber,
    currentClass,
    currentLessonConfig,
    nicknames,
    schoolScores,
    setCurrentClassId,
    setCurrentLessonNumber,
    getLessonConfig,
    getCurrentLessonRecords,
    getAllLessons,
    getStudentNickname,
    setStudentNickname,
    getHomeworkText,
    calculateClassStats,
    calculateWeakPoints,
    createClass,
    updateClass,
    deleteClass,
    addStudentToClass,
    addStudents,
    removeStudentFromClass,
    transferStudent,
    restoreStudentToClass,
    removeStudentFromRoster,
    saveLessonConfig,
    saveRecord,
    syncQuestionFullScores,
    syncQuestionTypesFromImport,
    updateRecordField,
    deleteRecord,
    clearRecordContent,
    inheritPreviousSeasons,
    restoreRecord,
    deleteLessonRecords,
    deleteLesson,
    restoreLesson,
    restoreRecords,
    restoreStudent,
    updateAppConfig,
    getStudentAllRecords,
    getStudentSchoolScores,
    addSchoolScore,
    importSchoolScoresFromExcel,
    deleteSchoolScore,
    restoreSchoolScore,
    exportData,
    importData,
    exportToHTML
  };
}
