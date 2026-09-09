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
import { computeCategoryWeakPoints, type CategoryWeakPoint } from '@/lib/weakPoints';

// 生成唯一ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

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
export const DEFAULT_CLASS_PERFORMANCE_OPTIONS = ['专注高效', '积极互动', '状态一般', '需提醒'];

// 默认配置
const defaultAppConfig: AppConfig = {
  defaultAttendanceOptions: ['按时出勤', '迟到', '缺勤', '请假', '调课'],
  defaultHomeworkOptions: ['超赞完成', '圆满完成', '未完成', '没带'],
  defaultListeningOptions: ['具体分数', '未加入课后任务', '未完成'],
  defaultClassPerformanceOptions: ['专注高效', '积极互动', '状态一般', '需提醒'],
  defaultFeedbackTemplate: `【学生昵称】家长您好！

📚 第【课次】课学习反馈：

🏫 考勤：【考勤】
📝 作业：【作业】
🎙️ 课后任务：【课后任务】

📊 入门测成绩：
【成绩详情】
💯 总分：【总分】/【满分】
📈 班级排名：第【排名】名
📊 正确率：【正确率】%

⚠️ 薄弱项：【薄弱项】

📝 今日作业：
【作业内容】

💪 加油，继续努力！`,
  defaultPraiseTemplate: `🏆 第【课次】课【表彰类型】表扬榜

【表彰内容】

恭喜以上同学！继续加油！💪`,
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

// 旧课次配置缺少「课堂表现」选项时兜底，保证列与配置面板始终可用
const withClassPerformanceDefaults = (cfg: LessonConfig): LessonConfig => ({
  ...cfg,
  classPerformanceOptions: (cfg.classPerformanceOptions && cfg.classPerformanceOptions.length)
    ? cfg.classPerformanceOptions
    : [...DEFAULT_CLASS_PERFORMANCE_OPTIONS],
});

// 总分/正确率统一口径：题型分数 + 计入总分的分数型自定义列
// 考勤含「请假」的记录：分数一律不计入总分与正确率（原始分数仍保留，改回出勤会自动重新计入）
function computeTotals(
  scores: { [k: string]: number },
  customValues: { [k: string]: string | number } | undefined,
  lessonConfig: LessonConfig,
  attendance?: string
): { totalScore: number; correctRate: number } {
  if (attendanceKind(attendance) === 'leave') {
    return { totalScore: 0, correctRate: 0 };
  }
  let total = 0;
  let full = 0;
  lessonConfig.questionTypes.forEach(qt => {
    total += scores?.[qt.id] || 0;
    full += qt.fullScore || 0;
  });
  (lessonConfig.customFields || []).forEach(cf => {
    if (cf.kind === 'number' && cf.includeInTotal) {
      total += Number(customValues?.[cf.id]) || 0;
      full += cf.fullScore || 0;
    }
  });
  const correctRate = full > 0 ? Math.round((total / full) * 100 * 10) / 10 : 0;
  return { totalScore: Math.round(total * 100) / 100, correctRate };
}

// 重算某课次排名（按总分降序），返回新数组（不可变，不改动入参对象）。
// 用 Map 定位代替逐条 findIndex，将 O(n²) 降为 O(n log n)；统一所有写路径的排名口径
function rerankLesson(records: StudentRecord[], lessonNumber: number): StudentRecord[] {
  const posById = new Map<string, number>();
  records
    .filter(r => r.lessonNumber === lessonNumber)
    .sort((a, b) => b.totalScore - a.totalScore)
    .forEach((r, i) => posById.set(r.id, i + 1));
  return records.map(r => {
    if (r.lessonNumber !== lessonNumber) return r;
    const pos = posById.get(r.id);
    return pos != null && r.rank !== pos ? { ...r, rank: pos } : r;
  });
}

// 历史数据规范化：把「请假」记录的已计总分/正确率清零并重排各课次名次（旧数据加载/云端导入时执行）
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

export function useClassData() {
  // 应用配置
  const [appConfig, setAppConfig] = useState<AppConfig>(() => {
    const saved = safeParse<Partial<AppConfig>>('appConfig', {});
    return { ...defaultAppConfig, ...saved };
  });

  // 班级数据
  const [classes, setClasses] = useState<{ [key: string]: Class }>(() => {
    const saved = safeParse<{ [key: string]: Class } | null>('classData', null);
    if (saved && typeof saved === 'object') {
      return normalizeLeaveTotals(saved);
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
    const flush = () => localStorage.setItem('appConfig', JSON.stringify(appConfig));
    const t = setTimeout(flush, 400);
    const onHide = () => { clearTimeout(t); flush(); };
    window.addEventListener('pagehide', onHide);
    return () => { clearTimeout(t); window.removeEventListener('pagehide', onHide); };
  }, [appConfig]);

  useEffect(() => {
    const flush = () => localStorage.setItem('classData', JSON.stringify(classes));
    const t = setTimeout(flush, 400);
    const onHide = () => { clearTimeout(t); flush(); };
    window.addEventListener('pagehide', onHide);
    return () => { clearTimeout(t); window.removeEventListener('pagehide', onHide); };
  }, [classes]);

  useEffect(() => {
    localStorage.setItem('currentClassId', currentClassId || '');
  }, [currentClassId]);

  useEffect(() => {
    localStorage.setItem('currentLessonNumber', currentLessonNumber.toString());
  }, [currentLessonNumber]);

  useEffect(() => {
    localStorage.setItem('studentNicknames', JSON.stringify(nicknames));
  }, [nicknames]);

  useEffect(() => {
    const flush = () => localStorage.setItem('schoolScores', JSON.stringify(schoolScores));
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
    if (config) return withClassPerformanceDefaults(config);
    
    // 如果没有课次配置，尝试使用上一节课的配置
    const prevLesson = lessonNumber - 1;
    if (prevLesson > 0 && classData.lessonConfigs[prevLesson.toString()]) {
      return withClassPerformanceDefaults(classData.lessonConfigs[prevLesson.toString()]);
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
      // 仅统计出勤学员，避免请假学员的 0 分/残留分数拉低题型班均
      const typeScores = present.map(r => r.scores[qt.id] || 0).filter(s => s > 0);
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
    const stats = calculateClassStats(lessonRecords, questionTypes);

    return computeCategoryWeakPoints(record, questionTypes, stats.avgScores);
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

  // 从班级移除学生
  const removeStudentFromClass = useCallback((classId: string, studentName: string) => {
    setClasses(prev => ({
      ...prev,
      [classId]: {
        ...prev[classId],
        students: prev[classId].students.filter(s => s !== studentName),
        records: prev[classId].records.filter(r => r.studentName !== studentName)
      }
    }));
  }, []);

  // 保存课次配置
  const saveLessonConfig = useCallback((classId: string, lessonNumber: number, config: Partial<LessonConfig>) => {
    setClasses(prev => {
      const classData = prev[classId];
      const existingConfig = classData.lessonConfigs[lessonNumber.toString()] || getDefaultLessonConfig(appConfig);
      
      return {
        ...prev,
        [classId]: {
          ...classData,
          lessonConfigs: {
            ...classData.lessonConfigs,
            [lessonNumber.toString()]: { ...existingConfig, ...config }
          }
        }
      };
    });
  }, [appConfig]);

  // 创建或更新记录
  const saveRecord = useCallback((classId: string, record: Partial<StudentRecord>) => {
    const lessonConfig = getLessonConfig(classId, record.lessonNumber || currentLessonNumber);
    
    setClasses(prev => {
      const classData = prev[classId];
      // 防御：班级不存在（如云端导入竞态/被删除）时静默忽略，避免 TypeError
      if (!classData) return prev;
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
          id: generateId(),
          studentName: record.studentName || '',
          lessonNumber: record.lessonNumber || currentLessonNumber,
          seasons: record.seasons || [],
          attendance: record.attendance || '按时出勤',
          homeworkStatus: record.homeworkStatus || '圆满完成',
          listeningStatus: record.listeningStatus || '具体分数',
          listeningScore: record.listeningScore || 0,
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
      const lessonNumber = record.lessonNumber || currentLessonNumber;
      const ranked = rerankLesson(newRecords, lessonNumber);

      return {
        ...prev,
        [classId]: { ...classData, records: ranked }
      };
    });
  }, [currentLessonNumber, getLessonConfig]);

  // 更新记录字段
  const updateRecordField = useCallback((
    classId: string,
    recordId: string,
    field: keyof StudentRecord,
    value: any
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

  // 删除记录
  const deleteRecord = useCallback((classId: string, recordId: string) => {
    setClasses(prev => ({
      ...prev,
      [classId]: {
        ...prev[classId],
        records: prev[classId].records.filter(r => r.id !== recordId)
      }
    }));
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
    const sources = classData.records.filter(r => r.lessonNumber === prevLesson && (r.seasons?.length ?? 0) > 0);
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
        newRecords.push({
          ...src,
          id: 'rec' + generateId(),
          lessonNumber: newLessonNumber,
          seasons: [...src.seasons],
          attendance: '',
          adjustReason: '',
          homeworkStatus: '',
          listeningStatus: '',
          listeningScore: 0,
          scores: {},
          customValues: {},
          totalScore: 0,
          correctRate: 0,
          rank: 0,
          date: new Date().toISOString().slice(0, 10),
          note: ''
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
      schoolScores
    };
  }, [appConfig, classes, nicknames, schoolScores]);

  // 导入数据
  const importData = useCallback((data: {
    appConfig: AppConfig;
    classes: { [key: string]: Class };
    nicknames: { [classId: string]: { [studentName: string]: string } };
    schoolScores: { [studentName: string]: SchoolScore[] };
  }) => {
    // 防御：字段缺失/为 null 时回退空对象；appConfig 与默认值合并，
    // 避免旧备份缺新字段（如课堂表现选项）导致新课次配置残缺
    setAppConfig({ ...defaultAppConfig, ...(data?.appConfig || {}) });
    setClasses(normalizeLeaveTotals(data?.classes || {}));
    setNicknames(data?.nicknames || {});
    setSchoolScores(data?.schoolScores || {});
  }, []);

  // 导出为HTML（公示页，样式可选：gradient/minimal/dark）
  const exportToHTML = useCallback((classId: string, lessonNumber: number, style: 'gradient' | 'minimal' | 'dark' = 'gradient'): string => {
    const classData = classes[classId];
    if (!classData) return '';

    const lessonConfig = getLessonConfig(classId, lessonNumber);
    const records = classData.records.filter(r => r.lessonNumber === lessonNumber);
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
    saveLessonConfig,
    saveRecord,
    updateRecordField,
    deleteRecord,
    clearRecordContent,
    inheritPreviousSeasons,
    restoreRecord,
    deleteLessonRecords,
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
