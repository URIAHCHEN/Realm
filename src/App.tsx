import { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { Toaster, toast } from 'sonner';
import { BarChart3, BookMarked, BookOpen, Cloud, Download, FileText, History, LogOut, Moon, Send, ShieldCheck, Sun, TrendingUp, Trophy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClassData, DEFAULT_CLASS_PERFORMANCE_OPTIONS, DEFAULT_HOMEWORK_OPTIONS, DEFAULT_LISTENING_OPTIONS } from '@/hooks/useClassData';
import { LoginPage } from '@/components/LoginPage';
import { getCachedSession, signOut, subscribeSession } from '@/lib/auth';
import { BrandMark } from '@/components/BrandMark';
import { HeaderMenu, HeaderMenuItem, HeaderMenuLabel } from '@/components/HeaderMenu';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import { ReviewQueueDialog } from '@/components/ReviewQueueDialog';
import { recordVersion, diffSnapshots } from '@/lib/versionStore';
import { BUILD_SCOPE } from '@/lib/config';
import { ensureSelfMembership, myUserId } from '@/lib/members';
import type { Membership } from '@/lib/members';
import { MembersPanel } from '@/components/MembersPanel';
import { SyncStatusBanner } from '@/components/SyncStatusBanner';
import { BackendOfflineBanner } from '@/components/BackendOfflineBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
const FeedbackLibrary = lazy(() => import('@/components/FeedbackLibrary').then(m => ({ default: m.FeedbackLibrary })));
import { ClassSelector } from '@/components/ClassSelector';
import { ClassInfoBand, ClassRosterCard } from '@/components/ClassInfoCard';
import { TransferStudentDialog } from '@/components/TransferStudentDialog';
import { LessonManager } from '@/components/LessonManager';
import { StudentTable } from '@/components/StudentTable';
import { matchOption } from '@/lib/optionMatch';
import { readTemplateStore } from '@/lib/templateStore';
const FeedbackGenerator = lazy(() => import('@/components/FeedbackGenerator').then(m => ({ default: m.FeedbackGenerator })));
import { PraiseGenerator } from '@/components/PraiseGenerator';
import { PraiseTemplateEditor } from '@/components/PraiseTemplateEditor';
import { StudentImportModal } from '@/components/StudentImportModal';
import { GenerateSettingsDialog } from '@/components/GenerateSettingsDialog';
const Leaderboard = lazy(() => import('@/components/Leaderboard').then(m => ({ default: m.Leaderboard })));

// 以下三个模块依赖 recharts（图表库）/ xlsx（Excel）/ html2canvas（截图），
// 体积合计约 1MB，且只在对应 Tab 打开或执行导出时才需要。
// 改为懒加载：首屏不再加载这些块，切到对应 Tab 时按需拉取。
const SchoolScorePanel = lazy(() =>
  import('@/components/SchoolScorePanel').then(m => ({ default: m.SchoolScorePanel }))
);
const StudentReport = lazy(() =>
  import('@/components/StudentReport').then(m => ({ default: m.StudentReport }))
);
const StudentAnalysis = lazy(() =>
  import('@/components/StudentAnalysis').then(m => ({ default: m.StudentAnalysis }))
);

// 懒加载期间的占位，保持与页面一致的留白节奏
const ModuleLoading = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center py-16 text-[#8e8e93] text-sm gap-2">
    <span className="w-4 h-4 rounded-full border-2 border-[rgb(var(--brand-rgb)/0.3)] border-t-[rgb(var(--brand-rgb))] animate-spin" />
    正在加载{label}…
  </div>
);
import { exportToCSV, downloadCSV } from '@/lib/feedbackTemplates';
import { exportToExcel, downloadExcel, exportClassRosterToExcel } from '@/lib/excelExport';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncPanel } from '@/components/CloudSyncPanel';
import { DocSyncPanel, DocSyncInfo } from '@/components/DocSyncPanel';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import type { ParsedRow } from '@/lib/docSync';
import type { SyncSnapshot } from '@/lib/cloudSync';
import type { AppConfig, LessonConfig, StudentRecord } from '@/types';
import './App.css';

function App() {
  // 认证状态：以 Supabase Auth 真实会话为准（不再用 localStorage 密码门）
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!getCachedSession();
  });

  // 应用数据
  const {
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
  calculateClassStats,
  createClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  addStudents,
  removeStudentFromLessonOnward,
  removeStudentFromClass,
  transferStudent,
  restoreStudentToClass,
  removeStudentFromRoster,
  saveLessonConfig,
  saveRecord,
  syncQuestionTypesFromImport,
  updateRecordField,
  deleteRecord,
  clearRecordContent,
  inheritPreviousSeasons,
  restoreRecord,
  deleteLesson,
  restoreLesson,
  restoreRecords,
  restoreStudent,
  updateAppConfig,
  getStudentSchoolScores,
  addSchoolScore,
  importSchoolScoresFromExcel,
  deleteSchoolScore,
  restoreSchoolScore,
  exportData,
  importData,
  exportToHTML,
  getStudentAllRecords,
} = useClassData();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('records');
  const [analysisStudent, setAnalysisStudent] = useState<string | null>(null);

  // 团队权限：是否已登录、当前会话用户、成员身份（服务端 RLS 为准）
  const sessionKey = isAuthenticated ? (getCachedSession()?.user_id ?? null) : null;
  const [membership, setMembership] = useState<Membership>({ member: false, admin: false });
  const refreshMembership = useCallback(async () => {
    if (!isAuthenticated) { setMembership({ member: false, admin: false }); return; }
    const res = await ensureSelfMembership(BUILD_SCOPE);
    setMembership(res.ok && res.data ? res.data : { member: false, admin: false });
  }, [isAuthenticated]);

  // 云同步：全量快照变化时自动推送到云端
  const syncSnapshot = useMemo<SyncSnapshot>(() => ({
    appConfig,
    classes,
    nicknames,
    schoolScores,
    templates: readTemplateStore(),
  }), [appConfig, classes, nicknames, schoolScores]);

  const cloudSync = useCloudSync({
    snapshot: syncSnapshot,
    onImport: (snap) => importData(snap),
    enabled: isAuthenticated,
    sessionKey,
    canWrite: isAuthenticated && membership.member,
    isAdmin: !!membership?.admin,
  });

  const displaySettings = useDisplaySettings();
  // 「生成设置」对话框（原在反馈生成页，现由学情记录 → 配置题型打开）
  const [showGenerateSettings, setShowGenerateSettings] = useState(false);

  // 会话变更订阅：服务端明确拒绝凭证时会清会话，
  // 此处立刻把界面切回登录页（否则仍显示已登录并持续报错）
  useEffect(() => subscribeSession(has => { if (!has) setIsAuthenticated(false); }), []);

  // 登录后：自举首个管理员 / 刷新成员身份
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 未登录时需同步落回只读身份；已登录走异步请求后置 setState
  useEffect(() => { refreshMembership(); }, [refreshMembership, sessionKey]);

  // 成员身份自动刷新：被管理员加入名单后，无需刷新页面即可恢复可写
  useEffect(() => {
    if (!isAuthenticated) return;
    const maybeRefresh = () => { if (document.visibilityState === 'visible') refreshMembership(); };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    const id = setInterval(maybeRefresh, 60_000);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
      clearInterval(id);
    };
  }, [isAuthenticated, refreshMembership]);

  // 从在线表格粘贴导入：
  // ① 先按表格的分数列对齐目标课次题型配置（新增/改名/排序/满分），拿到「列名 → 题型 id」
  // ② 再把每行分数落到对应题型上（未匹配列也能导入，无需先手工补建题型）
  // ③ 考勤/课堂表现/作业/课后任务等选项文本归一化到系统配置项，避免下拉显示为空
  const handleImportDocRows = (
    rows: ParsedRow[],
    target: { classId: string; lessonNumber: number },
    scoreColumns: { name: string; suggestedFullScore: number; matchedQtId?: string }[] = []
  ) => {
    const { classId, lessonNumber } = target;
    const classData = classes[classId];
    if (!classData) { toast.error('目标班级不存在'); return; }

    // 导入前的差异盘点（不自动删人，只提示）：
    //  · 表中有、名单无 → 视为新学员（会在下方被新建）
    //  · 名单有、表中无 → 视为"本次课未出现"。这类学员很可能已离班，
    //    提示老师用「从本课次起移除」处理，而不是继续保留/新建空记录
    {
      const inTable = new Set(rows.map(r => r.studentName).filter(Boolean));
      const rosterNames = classData.students || [];
      const missing = rosterNames.filter(n => !inTable.has(n));
      const toAdd = [...inTable].filter(n => !rosterNames.includes(n));
      if (toAdd.length > 0) {
        toast.info('本次表格有 ' + toAdd.length + ' 位新学员将加入名单：' + toAdd.slice(0, 6).join('、') + (toAdd.length > 6 ? ' 等' : ''));
      }
      if (missing.length > 0) {
        toast.info(
          '另外有 ' + missing.length + ' 位名单内学员未出现在本次表格：' + missing.slice(0, 6).join('、') + (missing.length > 6 ? ' 等' : '')
          + '。若他们已离班，请在表格中勾选后点「从本课次起移除」（历史课次记录会保留）。',
          { duration: 12000 }
        );
      }
    }

    const cfg = getLessonConfig(classId, lessonNumber);
    const normTo = (options: string[]) => (v?: string) => {
      if (!v) return undefined;
      if (options.includes(v)) return v;
      // 「准时/按时」类语义等价项优先
      if (options.length && /准时|按时/.test(v)) {
        const hit = options.find(o => /准时|按时/.test(o));
        if (hit) return hit;
      }
      return matchOption(v, options) ?? v;
    };

    // ① 题型配置对齐（返回 列名 → qtId）
    let qtIdByColumn: { [name: string]: string } = {};
    const syncable = scoreColumns.filter(c => c.name && c.suggestedFullScore >= 0);
    if (syncable.length > 0) {
      qtIdByColumn = syncQuestionTypesFromImport(classId, lessonNumber, syncable);
    }
    const skippedQtIds = new Set(cfg.questionTypes.map(qt => qt.id));

    // ②③ 写记录
    const normAttendance = normTo(cfg.attendanceOptions || []);
    const normClassPerf = normTo(cfg.classPerformanceOptions?.length ? cfg.classPerformanceOptions : DEFAULT_CLASS_PERFORMANCE_OPTIONS);
    const normHomework = normTo(cfg.homeworkOptions?.length ? cfg.homeworkOptions : DEFAULT_HOMEWORK_OPTIONS);
    const normListening = normTo(cfg.listeningOptions?.length ? cfg.listeningOptions : DEFAULT_LISTENING_OPTIONS);

    const missing = Array.from(new Set(rows.map(r => r.studentName).filter(n => n && !classData.students.includes(n))));
    if (missing.length > 0) addStudents(classId, missing, lessonNumber);

    rows.forEach(row => {
      if (!row.studentName) return;
      const att = normAttendance(row.attendance);
      // 分数：优先按「列名 → 新题型 id」映射；映射不到时回退到解析阶段已命中的 id
      const scores: { [qtId: string]: number } = {};
      Object.entries(row.scoreValues || {}).forEach(([colName, v]) => {
        const qtId = qtIdByColumn[colName];
        if (qtId) scores[qtId] = v;
      });
      Object.entries(row.scores || {}).forEach(([qtId, v]) => {
        if (!(qtId in scores) && skippedQtIds.has(qtId)) scores[qtId] = v;
      });

      saveRecord(classId, {
        studentName: row.studentName,
        lessonNumber,
        ...(row.seasons && row.seasons.length ? { seasons: row.seasons } : {}),
        ...(att ? { attendance: att } : {}),
        ...(row.classPerformance ? { classPerformance: normClassPerf(row.classPerformance) } : {}),
        ...(row.homeworkStatus ? { homeworkStatus: normHomework(row.homeworkStatus) } : {}),
        ...(row.listeningStatus
          ? { listeningStatus: row.listeningStatus === '具体分数' ? '具体分数' : normListening(row.listeningStatus) }
          : {}),
        ...(row.listeningScore !== undefined ? { listeningScore: row.listeningScore } : {}),
        scores
      });
    });

    setCurrentClassId(classId);
    setCurrentLessonNumber(lessonNumber);
    const typeCount = Object.keys(qtIdByColumn).length;
    toast.success(
      `已导入 ${rows.length} 条到第${lessonNumber}课${missing.length ? `，新增 ${missing.length} 名学生` : ''}`
      + (typeCount ? `，题型配置已按表格对齐（${typeCount} 列）` : '')
    );
  };



  const handleDeleteLesson = () => {
    if (!currentClassId) { toast.error('请先选择班级'); return; }
    const classId = currentClassId;
    const lesson = currentLessonNumber;
    const snap = deleteLesson(classId, lesson);
    if (snap.records.length === 0 && !snap.config) { toast.info('本课还没有可删除的记录或配置'); return; }
    toast.success(`已删除第${lesson}课（${snap.records.length} 条记录及课次配置），该课次可重新新增`, {
      action: { label: '撤销', onClick: () => restoreLesson(classId, lesson, snap.records, snap.config) },
      duration: 8000,
    });
  };

  // 登录成功（Supabase Auth 会话已建立，由 LoginPage 调用）
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    toast.success('登录成功');
  };

  // 登出处理：清除 Supabase 会话
  const handleLogout = () => {
    signOut();
    setIsAuthenticated(false);
    setMembership({ member: false, admin: false });
    toast.success('已登出');
  };

  // —— 学生转班（hook 必须在早返回之前声明，避免登录态切换时 hook 数量变化）——
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // 已转出学员：有历史记录但不在本班名单
  const transferredOutStudents = useMemo(() => {
    if (!currentClass) return [];
    const roster = new Set(currentClass.students);
    const map = new Map<string, { name: string; recordCount: number; lastLesson: number }>();
    currentClass.records.forEach(r => {
      if (roster.has(r.studentName)) return;
      const cur = map.get(r.studentName) || { name: r.studentName, recordCount: 0, lastLesson: 0 };
      cur.recordCount += 1;
      cur.lastLesson = Math.max(cur.lastLesson, r.lessonNumber);
      map.set(r.studentName, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.lastLesson - a.lastLesson);
  }, [currentClass]);

  // 未登录显示登录页面
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-center" richColors />
        <LoginPage onSuccess={handleLoginSuccess} />
      </>
    );
  }

  // 获取当前数据
  const currentRecords = getCurrentLessonRecords();
  const allLessons = getAllLessons();

  // 处理保存当前课次
  const handleSaveCurrentLesson = () => {
    if (!currentClass) {
      toast.error('请先选择班级');
      return;
    }
    if (currentClass.students.length === 0) {
      toast.error('请先添加学生');
      return;
    }

    // 为每个学生创建记录（如果不存在）
    // 但不为"当时还没加入"的学员补建更早课次的空记录：
    // 中途加入的学员按 TA 实际有记录的第一个课次起算（否则会被当成 0 分参与早前课次统计）
    const firstLessonOf = new Map<string, number>();
    currentClass.records.forEach(r => {
      const cur = firstLessonOf.get(r.studentName);
      if (cur == null || r.lessonNumber < cur) firstLessonOf.set(r.studentName, r.lessonNumber);
    });
    currentClass.students.forEach(studentName => {
      const existingRecord = currentRecords.find(r => r.studentName === studentName);
      const joinedAt = currentClass.studentJoinLesson?.[studentName] ?? firstLessonOf.get(studentName);
      if (!existingRecord && joinedAt != null && joinedAt > currentLessonNumber) {
        return;   // 该学员本次课还没加入 → 不补建
      }
      if (!existingRecord) {
        saveRecord(currentClass.id, {
          studentName,
          lessonNumber: currentLessonNumber,
          // 只建"空记录"：考勤/课堂表现/作业/课后任务一律留空由老师填。
          // （原实现写入 按时出勤/圆满完成/具体分数 三个 v1 废弃值，
          //   在下拉里表现为"看得见却选不中"的幽灵值）
          listeningScore: 0,
          scores: {},
          seasons: []
        });
      }
    });

    toast.success(`第${currentLessonNumber}课已保存！`);
  };

  // 处理增加新课次：自动带入上一课的学习轨迹；列选项与反馈模板锁定「全局默认」，
  // 题型/自定义列沿用上一课（支持新题型动态延续），避免新课次还原旧的已修改全局默认
  const handleAddLesson = (lesson: number) => {
    if (allLessons.includes(lesson)) {
      toast.error(`第${lesson}课已存在`);
      return;
    }
    setCurrentLessonNumber(lesson);
    if (currentClassId) {
      const prevCfg = getLessonConfig(currentClassId, lesson - 1);
      saveLessonConfig(currentClassId, lesson, {
        attendanceOptions: [...appConfig.defaultAttendanceOptions],
        homeworkOptions: [...appConfig.defaultHomeworkOptions],
        listeningOptions: [...appConfig.defaultListeningOptions],
        classPerformanceOptions: [...(appConfig.defaultClassPerformanceOptions || DEFAULT_CLASS_PERFORMANCE_OPTIONS)],
        feedbackTemplate: appConfig.defaultFeedbackTemplate,
        praiseTemplate: appConfig.defaultPraiseTemplate,
        questionTypes: prevCfg ? prevCfg.questionTypes.map(q => ({ ...q })) : [...appConfig.defaultQuestionTypes],
        customFields: prevCfg ? (prevCfg.customFields || []).map(cf => ({ ...cf })) : [],
        homeworkText: prevCfg ? prevCfg.homeworkText : '',
        passThreshold: prevCfg?.passThreshold ?? 80,
      });
    }
    const inherited = currentClassId ? inheritPreviousSeasons(currentClassId, lesson) : null;
    if (inherited) {
      toast.success(`已切换到第${lesson}课`, {
        description: `列选项/反馈模板已锁定全局默认；带入第${inherited.fromLesson}课学习轨迹（${inherited.count} 名学员）`
      });
    } else {
      toast.success(`已切换到第${lesson}课（列选项/反馈模板锁定全局默认）`);
    }
  };

  // 处理添加学生
  const handleAddStudent = (studentName: string) => {
    if (!currentClassId) return;
    if (currentClass?.students.includes(studentName)) {
      toast.error('该学生已存在');
      return;
    }
    addStudentToClass(currentClassId, studentName);
    toast.success(`已添加学生：${studentName}`);
  };

  // 处理删除单条学情记录（提供撤销，保留原记录 id 与排名）
  const handleDeleteRecord = (recordId: string) => {
    if (!currentClass) return;
    const removed = currentClass.records.find(r => r.id === recordId);
    if (!removed) return;
    const classId = currentClass.id;
    deleteRecord(classId, recordId);
    toast.success(`已删除第${removed.lessonNumber}课 ${getStudentNickname(removed.studentName, classId)} 的记录`, {
      action: {
        label: '撤销',
        onClick: () => {
          restoreRecord(classId, removed);
          toast.success('记录已恢复');
        }
      }
    });
  };

  // 清空某条记录的全部内容（保留考勤/学习轨迹，提供撤销）——适合请假生什么都不记
  const handleClearRecord = (recordId: string) => {
    if (!currentClass) return;
    const rec = currentClass.records.find(r => r.id === recordId);
    if (!rec) return;
    const classId = currentClass.id;
    const snapshot = {
      scores: rec.scores,
      customValues: rec.customValues,
      homeworkStatus: rec.homeworkStatus,
      listeningStatus: rec.listeningStatus,
      listeningScore: rec.listeningScore,
      classPerformance: rec.classPerformance,
      note: rec.note,
      adjustReason: rec.adjustReason,
    };
    clearRecordContent(classId, recordId);
    // 清空属于破坏性操作，先记录一个版本（便于回退）
    setTimeout(() => snapshotVersion('清空记录'), 0);
    toast.success(`已清空 ${getStudentNickname(rec.studentName, classId)} 第${rec.lessonNumber}课的记录内容`, {
      description: '考勤与学习轨迹已保留；误清空可点「撤销」恢复',
      action: {
        label: '撤销',
        onClick: () => {
          Object.entries(snapshot).forEach(([field, value]) => updateRecordField(classId, recordId, field as keyof StudentRecord, value));
          toast.success('记录内容已恢复');
        }
      },
      duration: 8000,
    });
  };

  // 一键删除所选学员本课次的学情记录（先快照再删除，撤销时原样恢复）
  const handleDeleteStudentRecords = (studentNames: string[]) => {
    if (!currentClass || studentNames.length === 0) return;
    const classId = currentClass.id;
    const removed = currentClass.records.filter(
      r => r.lessonNumber === currentLessonNumber && studentNames.includes(r.studentName)
    );
    if (removed.length === 0) {
      toast.info('所选学员在本课还没有可删除的记录');
      return;
    }
    removed.forEach(r => deleteRecord(classId, r.id));
    toast.success(`已删除 ${removed.length} 条第${currentLessonNumber}课记录（${studentNames.length} 名学员）`, {
      description: '误删可点击「撤销」一键恢复',
      action: {
        label: '撤销',
        onClick: () => {
          restoreRecords(classId, removed);
          toast.success(`已恢复 ${removed.length} 条记录`);
        }
      },
      duration: 8000,
    });
  };

  // 处理移除学生（连带删除其全部记录，提供撤销）
  const handleRemoveStudent = (studentName: string) => {
    if (!currentClassId) return;
    // 先快照该学生的全部记录，撤销时原样恢复
    const removedRecords = (currentClass?.records || []).filter(r => r.studentName === studentName);
    removeStudentFromClass(currentClassId, studentName);
    toast.success(`已移除学生：${studentName}`, {
      description: removedRecords.length > 0 ? `同时移除 ${removedRecords.length} 条学情记录` : undefined,
      action: {
        label: '撤销',
        onClick: () => {
          restoreStudent(currentClassId, studentName, removedRecords);
          toast.success(`已恢复学生：${studentName}`);
        }
      }
    });
  };

  const handleTransferStudent = (studentName: string, toClassId: string | null) => {
    if (!currentClassId) return;
    const fromClassId = currentClassId;
    const fromName = currentClass?.name || '';
    const toName = toClassId ? (classes[toClassId]?.name || '') : '';
    transferStudent(studentName, fromClassId, toClassId);
    setIsTransferModalOpen(false);
    toast.success(toClassId ? `${studentName} 已从「${fromName}」转入「${toName}」` : `${studentName} 已从「${fromName}」转出`, {
      description: '本班历史记录已保留（以往课次统计不变）；新班级学情从下一课次起重新统计',
      action: {
        label: '撤销',
        onClick: () => {
          restoreStudentToClass(studentName, fromClassId);
          if (toClassId) removeStudentFromRoster(toClassId, studentName);
          toast.success(`${studentName} 已恢复回「${fromName}」`);
        }
      },
      duration: 8000,
    });
  };

  const handleRestoreTransferred = (studentName: string) => {
    if (!currentClassId) return;
    restoreStudentToClass(studentName, currentClassId);
    toast.success(`${studentName} 已恢复到本班名单，历史记录自动接续`);
  };

  // 处理删除校内成绩（提供撤销，恢复原成绩记录）
  const handleDeleteScore = (studentName: string, scoreId: string) => {
    const removed = (schoolScores[studentName] || []).find(s => s.id === scoreId);
    if (!removed) return;
    deleteSchoolScore(studentName, scoreId);
    toast.success(`已删除 ${getStudentNickname(studentName, currentClassId || undefined)} 的「${removed.examName}」成绩`, {
      action: {
        label: '撤销',
        onClick: () => {
          restoreSchoolScore(studentName, removed);
          toast.success('成绩已恢复');
        }
      }
    });
  };

  // 处理导入学生
  const handleImportStudents = (students: string[]) => {
    if (!currentClassId) return;
    addStudents(currentClassId, students, currentLessonNumber);
    toast.success(`成功导入${students.length}名学生！`);
  };

  // 处理导出CSV数据
  const handleExportData = () => {
    if (!currentClass) {
      toast.error('请先选择班级');
      return;
    }

    const csv = exportToCSV(
      currentRecords,
      currentLessonConfig,
      currentClass.name,
      currentLessonNumber
    );

    downloadCSV(csv, `${currentClass.name}第${currentLessonNumber}课学情记录.csv`);
    toast.success('数据导出成功！');
  };

  // 处理导出当前课次 Excel 名单
  const handleExportRosterExcel = async () => {
    if (!currentClass) {
      toast.error('请先选择班级');
      return;
    }

    const lessonRecords = currentClass.records.filter(r => r.lessonNumber === currentLessonNumber);
    const nickMap = nicknames[currentClass.id] || {};
    const workbook = await exportClassRosterToExcel({
      className: currentClass.name,
      lessonNumber: currentLessonNumber,
      students: currentClass.students,
      records: lessonRecords,
      nicknames: nickMap,
      questionTypes: currentLessonConfig.questionTypes,
      customFields: currentLessonConfig.customFields || []
    });
    downloadExcel(workbook, `${currentClass.name}第${currentLessonNumber}课名单.xlsx`);
    toast.success('Excel 名单已导出！');
  };

  // 处理导出所有数据为Excel（用于查看/分析，不可用于恢复）
  const handleExportAllData = async () => {
    const data = exportData();
    const { workbook, filename } = await exportToExcel(data, currentClass?.name || '所有班级');
    await downloadExcel(workbook, filename);
    toast.success('数据已导出为Excel！');
  };

  // ============ 版本历史（修订版本 / 回退） ============
  const [versionOpen, setVersionOpen] = useState(false);
  // 暗色模式（Apple 风）：持久化到 localStorage，切换时给 <html> 加 .dark
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('uiDarkMode') === '1'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('uiDarkMode', darkMode ? '1' : '0'); } catch { /* ignore */ }
  }, [darkMode]);

  // 滚动淡入：零依赖 IntersectionObserver（尊重 prefers-reduced-motion）
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    const attach = () => {
      document.querySelectorAll('[data-slot="card"]:not(.reveal), .report-section:not(.reveal)').forEach(el => {
        el.classList.add('reveal'); io.observe(el);
      });
    };
    const t = window.setTimeout(attach, 120);
    const mo = new MutationObserver(() => { window.clearTimeout(t); window.setTimeout(attach, 150); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); window.clearTimeout(t); };
  }, [activeTab]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const actor = (getCachedSession()?.email || '本机').split('@')[0];
  /**
   * 本课次"应在读"的名单：过滤掉尚未加入的学员（中途插班）。
   * 判断依据优先用 studentJoinLesson（新增学员时登记），缺失时退回"该生最早的记录课次"。
   * 作用：① 早于加入课次的课次里不显示该学员（避免被当成 0 分/离班）；
   *       ② 离班提醒不会把"还没来的新生"误报成离班。
   */
  const firstLessonByStudent = useMemo(() => {
    const map = new Map<string, number>();
    (currentClass?.records || []).forEach(r => {
      const cur = map.get(r.studentName);
      if (cur == null || r.lessonNumber < cur) map.set(r.studentName, r.lessonNumber);
    });
    return map;
  }, [currentClass]);
  const rosterForLesson = useMemo(() => {
    const list = currentClass?.students || [];
    const joinMap = currentClass?.studentJoinLesson || {};
    return list.filter(name => {
      const start = joinMap[name] ?? firstLessonByStudent.get(name);
      return start == null || start <= currentLessonNumber;
    });
  }, [currentClass, firstLessonByStudent, currentLessonNumber]);
  /** 组装当前全量快照（与云同步同一份结构） */
  const makeSnapshot = useCallback(() => ({
    appConfig,
    classes,
    nicknames,
    schoolScores,
    templates: readTemplateStore(),
  }), [appConfig, classes, nicknames, schoolScores]);
  /** 记录一个版本（reason 说明触发原因；summary 省略时自动算变动明细） */
  const snapshotVersion = useCallback((reason: string) => {
    const snap = makeSnapshot();
    const entry = recordVersion(snap, { actor, reason });
    if (entry) toast.success('已记录版本：' + reason, { description: entry.summary.slice(0, 2).join('；'), duration: 4000 });
  }, [makeSnapshot, actor]);

  // 处理导出完整备份（JSON 快照，可被「导入备份」读回，用于恢复与多端迁移）
  const handleExportBackupJson = () => {
    const data = exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学情数据备份_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const classCount = Object.keys(data.classes || {}).length;
    toast.success(`备份已导出（${classCount} 个班级）`, {
      description: '该文件可用于「导入备份」恢复，也可拷贝到其他设备'
    });
  };

  // 处理导入所有数据（JSON 备份恢复）
  // 依据：该操作会全量覆盖本地数据且不可撤销，因此先校验文件结构、再二次确认
  const handleImportAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          // 结构校验：必须是本系统导出的备份（含 classes 对象）
          if (!data || typeof data !== 'object' || !data.classes || typeof data.classes !== 'object') {
            toast.error('这不是本系统的备份文件（缺少班级数据）', {
              description: '请使用顶栏「导出备份」生成的 .json 文件'
            });
            return;
          }

          const incomingClassCount = Object.keys(data.classes).length;
          const currentClassCount = Object.keys(classes).length;
          const confirmed = window.confirm(
            `即将用备份文件覆盖当前全部数据：\n\n` +
            `备份包含：${incomingClassCount} 个班级\n` +
            `当前本机：${currentClassCount} 个班级\n\n` +
            `覆盖后本机现有数据将无法找回，确定继续吗？`
          );
          if (!confirmed) return;

          importData(data);
          toast.success(`已从备份恢复 ${incomingClassCount} 个班级的数据`);
        } catch {
          toast.error('数据导入失败，请检查文件是否为有效的 JSON 备份');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 处理保存课次配置
  const handleSaveLessonConfig = (lessonNum: number, config: Partial<LessonConfig>) => {
    if (!currentClassId) return;
    saveLessonConfig(currentClassId, lessonNum, config);
    toast.success(`第${lessonNum}课配置已保存！`);
  };

  // 处理保存应用配置
  const handleSaveAppConfig = (config: AppConfig) => {
    updateAppConfig(config);
    toast.success('默认配置已保存！');
  };

  // 处理查看学生分析
  const handleViewStudentAnalysis = (studentName: string) => {
    setAnalysisStudent(studentName);
  };

  // 处理导入Excel
  const handleImportExcel = async (file: File) => {
    try {
      const result = await importSchoolScoresFromExcel(file, currentClass?.students);
      if (result.success > 0) {
        toast.success(`成功导入${result.success}条成绩`);
      }
      if (result.unmatched && result.unmatched.length > 0) {
        toast.warning(`${result.unmatched.length} 名学生未匹配，请检查名单`, {
          description: result.unmatched.slice(0, 5).join('、') + (result.unmatched.length > 5 ? ` 等${result.unmatched.length}人` : '')
        });
      }
      return result;
    } catch (error) {
      toast.error('导入失败：' + error);
      return { success: 0, failed: 0, errors: [String(error)], unmatched: [] };
    }
  };

  return (
    <div className="min-h-screen ios-glass-bg">
      <Toaster position="top-center" richColors />

      {/* 顶部导航栏 */}
      <header className="liquid-glass-header sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <BrandMark />
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const id = myUserId();
                  if (!id) return;
                  try { await navigator.clipboard.writeText(id); toast.success('已复制我的用户ID'); } catch { toast.error('复制失败'); }
                }}
                title="点击复制我的用户ID（发送给管理员以加入可写名单）"
                className="flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border text-xs transition-colors border-[#e5e5ea] bg-white/60 hover:bg-white text-[#3c3c43]"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    membership.admin ? 'bg-emerald-500' : membership.member ? 'bg-blue-500' : 'bg-amber-500'
                  }`}
                />
                {membership.admin ? '管理员' : membership.member ? '成员' : '只读'}
                <span className="font-mono text-[#8e8e93] hidden sm:inline">{myUserId().slice(0, 8)}</span>
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('cloud')}
                className={`gap-2 relative ${
                  cloudSync.status === 'connected' ? 'border-emerald-400/40 text-emerald-600' :
                  cloudSync.status === 'conflict' || cloudSync.status === 'error' || cloudSync.status === 'readonly' ? 'border-amber-400/40 text-amber-600' :
                  ''
                }`}
              >
                <Cloud className="w-4 h-4" />
                <span className="hidden sm:inline">云同步</span>
                <span
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    cloudSync.status === 'connected' ? 'bg-emerald-500' :
                    cloudSync.status === 'conflict' || cloudSync.status === 'error' || cloudSync.status === 'readonly' ? 'bg-amber-500' :
                    cloudSync.status === 'connecting' ? 'bg-blue-500 animate-pulse' :
                    'bg-slate-300'
                  }`}
                />
              </Button>
              <HeaderMenu>
                <HeaderMenuLabel>数据备份</HeaderMenuLabel>
                <HeaderMenuItem icon={<Upload className="w-4 h-4" />} onClick={handleImportAllData}>导入备份（.json）</HeaderMenuItem>
                <HeaderMenuItem icon={<Download className="w-4 h-4" />} onClick={handleExportBackupJson}>导出备份（.json）</HeaderMenuItem>
                <HeaderMenuItem icon={<FileText className="w-4 h-4" />} onClick={handleExportAllData}>导出数据（Excel）</HeaderMenuItem>
                <HeaderMenuLabel>记录与留痕</HeaderMenuLabel>
                <HeaderMenuItem icon={<History className="w-4 h-4" />} onClick={() => setVersionOpen(true)}>版本历史 / 回退</HeaderMenuItem>
                <HeaderMenuLabel>外观</HeaderMenuLabel>
                <HeaderMenuItem icon={darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} onClick={() => setDarkMode(!darkMode)}>
                  {darkMode ? '切换到浅色模式' : '切换到暗色模式'}
                </HeaderMenuItem>
              </HeaderMenu>
              {membership?.admin ? (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full" onClick={async () => { await cloudSync.refreshPending(); setReviewOpen(true); }} title="查看其他成员提交的修订并批准/驳回">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">审核队列{cloudSync.pending.length > 0 ? " (" + cloudSync.pending.length + ")" : ""}</span>
                </Button>
              ) : (
                <Button size="sm" className="h-8 gap-1.5 rounded-full" onClick={() => {
                  const note = window.prompt("提交审核说明（会显示给管理员，可留空）：", "") ?? "";
                  void cloudSync.submitForReview(note || undefined);
                }} title="把当前这一版提交管理员审核；批准前不会写入线上数据">
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">提交审核</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-2 text-slate-500 hover:text-rose-600"
              >
                <LogOut className="w-4 h-4" />
                登出
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 班级选择栏：外层加 class-band —— 让背景色整宽延伸，卡片不再"悬在半空" */}
      <div className="class-band max-w-[1600px] mx-auto px-4 py-4 sm:px-6 sm:py-5">
        <ClassSelector
          classes={classes}
          currentClassId={currentClassId}
          onSelectClass={setCurrentClassId}
          onCreateClass={createClass}
          onUpdateClass={updateClass}
          onDeleteClass={deleteClass}
          onAddStudents={addStudents}
        />
      </div>

      {/* 主内容区 */}
      <div className="max-w-[1600px] mx-auto px-4 pb-10 sm:px-6 sm:pb-12">
        {/* 云端不可达时的全局提示（与同步状态横幅独立，避免误以为系统坏了） */}
        <div className="mb-5">
          <BackendOfflineBanner
            // 注意：这里必须是"对账"，不能直接 pull ——
            // 断网期间的本地改动用 pull 会被云端旧快照整包覆盖且不提示（历史缺陷）
            onRetry={() => { refreshMembership(); void cloudSync.reconcileNow(); }}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="ios-tabs-list">
            <TabsTrigger value="records" className="ios-tab-trigger">
              <BookOpen className="w-5 h-5" />
              学情记录
            </TabsTrigger>
            <TabsTrigger value="feedback" className="ios-tab-trigger">
              <FileText className="w-5 h-5" />
              反馈生成
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="ios-tab-trigger">
              <Trophy className="w-5 h-5" />
              表扬榜
            </TabsTrigger>
            <TabsTrigger value="school" className="ios-tab-trigger">
              <TrendingUp className="w-5 h-5" />
              校内成绩
            </TabsTrigger>
            <TabsTrigger value="report" className="ios-tab-trigger">
              <BarChart3 className="w-5 h-5" />
              学情报告
            </TabsTrigger>
            <TabsTrigger value="cloud" className="ios-tab-trigger">
              <Cloud className="w-5 h-5" />
              同步中心
            </TabsTrigger>
            <TabsTrigger value="library" className="ios-tab-trigger">
              <BookMarked className="w-5 h-5" />
              反馈素材
            </TabsTrigger>
          </TabsList>

          {/* 学情记录 Tab：班级信息条（上）→ 课次管理 → 全宽学情记录表 → 学员名单卡（下） */}
          <TabsContent value="records" className="space-y-6">
            <ErrorBoundary label="学情记录">
            <div className="space-y-4 min-w-0">
              <ClassInfoBand
                classData={currentClass}
                onManageStudents={() => setIsImportModalOpen(true)}
                onTransferStudent={() => setIsTransferModalOpen(true)}
                getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                lessonNumber={currentLessonNumber}
              />
              <LessonManager
                currentLessonNumber={currentLessonNumber}
                allLessons={allLessons}
                onSelectLesson={setCurrentLessonNumber}
                onAddLesson={handleAddLesson}
                onSaveCurrentLesson={handleSaveCurrentLesson}
              />

              {/* 全宽学情记录表：min-w-0 防止表格 min-content 宽度撑出横向滚动 */}
              <div className="min-w-0">
                <StudentTable
                  students={rosterForLesson}
                  records={currentClass?.records || []}
                  lessonConfig={currentLessonConfig}
                  lessonNumber={currentLessonNumber}
                  getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                  calculateClassStats={calculateClassStats}
                  oralRating={appConfig.oralRating}
                  onDeleteLessonRecords={handleDeleteLesson}
                  onUpdateRecord={(recordId, field, value) => currentClass && updateRecordField(currentClass.id, recordId, field, value)}
                  onCreateRecord={(studentName, record) => currentClass && saveRecord(currentClass.id, { ...record, studentName })}
                  onDeleteRecord={handleDeleteRecord}
                  onClearRecord={handleClearRecord}
                  onDeleteStudentRecords={handleDeleteStudentRecords}
                  onRemoveStudentsFromLesson={(names: string[], fromLesson: number) => {
                    if (!currentClass) return;
                    let n = 0;
                    names.forEach(nm => { n += removeStudentFromLessonOnward(currentClass.id, nm, fromLesson); });
                    toast.success('已从第 ' + fromLesson + ' 课起移除 ' + names.length + ' 位学员（共 ' + n + ' 条记录），历史课次记录保留');
                  }}
                  onAddStudent={handleAddStudent}
                  onRemoveStudent={handleRemoveStudent}
                  onExportData={handleExportData}
                  onExportExcel={handleExportRosterExcel}
                  getPublicityHTML={() => currentClass ? exportToHTML(currentClass.id, currentLessonNumber, displaySettings.settings.exportStyle) : ''}
                  onViewStudentAnalysis={handleViewStudentAnalysis}
                  onOpenConfig={() => setShowGenerateSettings(true)}
                />
              </div>

              <ClassRosterCard
                classData={currentClass}
                transferredOut={transferredOutStudents}
                onRestoreStudent={handleRestoreTransferred}
                onViewStudent={handleViewStudentAnalysis}
                getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              />
            </div>
          </ErrorBoundary>
          </TabsContent>

          {/* 表扬榜 Tab：榜单 + 班群表彰生成 + 表彰模板编辑/预览 */}
          <TabsContent value="leaderboard" className="space-y-6">

            <Suspense fallback={<ModuleLoading label="表扬榜" />}>
            <ErrorBoundary label="表扬榜">
            <Leaderboard
              records={currentClass?.records || []}
              lessonConfig={currentLessonConfig}
              lessonNumber={currentLessonNumber}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              calculateClassStats={calculateClassStats}
            />
            <PraiseGenerator
              records={currentClass?.records || []}
              lessonConfig={currentLessonConfig}
              lessonNumber={currentLessonNumber}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              calculateClassStats={calculateClassStats}
            />
            <PraiseTemplateEditor
              lessonConfig={currentLessonConfig}
              lessonNumber={currentLessonNumber}
              onSaveLessonConfig={handleSaveLessonConfig}
            />
          </ErrorBoundary>
          
            </Suspense>
          </TabsContent>

          {/* 反馈生成 Tab */}
          <TabsContent value="feedback">

            <Suspense fallback={<ModuleLoading label="反馈生成" />}>
            <ErrorBoundary label="反馈生成">
            <div className="max-w-6xl mx-auto space-y-5">
            <FeedbackGenerator
                key={currentClassId || 'none'}
              students={currentClass?.students || []}
              records={currentClass?.records || []}
              lessonConfig={currentLessonConfig}
              lessonNumber={currentLessonNumber}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              calculateClassStats={calculateClassStats}
              oralRating={appConfig.oralRating}
              libraryLinks={Array.from(new Set((appConfig.savedFeedbacks || []).filter(f => f.lessonNumber === currentLessonNumber).flatMap(f => f.links || [])))}
              onSaveLessonConfig={handleSaveLessonConfig}
              onViewStudent={handleViewStudentAnalysis}
            />


            


            </div>
          </ErrorBoundary>
          
            </Suspense>
          </TabsContent>

          {/* 反馈素材 Tab */}
          <TabsContent value="library" className="space-y-6">

            <Suspense fallback={<ModuleLoading label="反馈素材" />}>
            <ErrorBoundary label="反馈素材">
            <FeedbackLibrary
              items={appConfig.savedFeedbacks || []}
              onChange={(list) => updateAppConfig({ savedFeedbacks: list })}
              currentLesson={currentLessonNumber}
            />
          </ErrorBoundary>
          
            </Suspense>
          </TabsContent>

          {/* 校内成绩 Tab（懒加载：仅切到本 Tab 时才加载图表与 Excel 依赖） */}
          <TabsContent value="school">

            <Suspense fallback={<ModuleLoading label="校内成绩" />}>
            <ErrorBoundary label="校内成绩">
            <Suspense fallback={<ModuleLoading label="校内成绩" />}>
              <SchoolScorePanel
                students={currentClass?.students || []}
                scores={currentClass
                  ? currentClass.students.flatMap(s => schoolScores[s] || [])
                  : []}
                onAddScore={addSchoolScore}
                onDeleteScore={handleDeleteScore}
                onImportExcel={handleImportExcel}
                getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              />
            </Suspense>
          </ErrorBoundary>
          
            </Suspense>
          </TabsContent>

          {/* 学情报告 Tab（懒加载：仅切到本 Tab 时才加载图表与截图依赖） */}
          <TabsContent value="report">
            <ErrorBoundary label="学情报告">
            <Suspense fallback={<ModuleLoading label="学情报告" />}>
              <StudentReport
                students={currentClass?.students || []}
                records={currentClass?.records || []}
                schoolScores={schoolScores}
                lessonConfigs={currentClass?.lessonConfigs || {}}
                getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                currentClassName={currentClass?.name || ''}
                oralRating={appConfig.oralRating}
              />
            </Suspense>
          </ErrorBoundary>
          </TabsContent>

          {/* 系统配置已并入「反馈生成 → 生成设置」 */}

          {/* 同步中心 Tab */}
          <TabsContent value="cloud">
            <ErrorBoundary label="同步中心">
            <div className="max-w-6xl mx-auto space-y-5">
              <SyncStatusBanner
                status={cloudSync.status}
                message={cloudSync.message}
                onKeepLocal={cloudSync.resolveConflictKeepLocal}
                onKeepCloud={cloudSync.resolveConflictKeepCloud}
                onRefresh={refreshMembership}
              />
              {membership.admin && (
                <>
                  {/* 顶部显眼位：推送 / 导入 并排双卡 */}
                  <DocSyncPanel
                    records={currentClass?.records.filter(r => r.lessonNumber === currentLessonNumber) || []}
                    lessonConfig={currentLessonConfig}
                    lessonNumber={currentLessonNumber}
                    getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                    classes={Object.values(classes).map(c => ({ id: c.id, name: c.name }))}
                    currentClassId={currentClassId}
                    getQuestionTypes={(classId, lesson) => getLessonConfig(classId, lesson).questionTypes}
                    knownLessons={getAllLessons(currentClassId || undefined)}
                    onImportRows={handleImportDocRows}
                    onExportExcel={handleExportAllData}
                  />
                  {/* 云同步状态与连接配置（与上方双卡互换位置） */}
                  <CloudSyncPanel sync={cloudSync} />
                </>
              )}
              <MembersPanel isAdmin={membership.admin} onChanged={refreshMembership} />
              {membership.admin && <DocSyncInfo display={displaySettings} />}
            </div>
          </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>

      {/* 学生导入模态框 */}
      <GenerateSettingsDialog
        open={showGenerateSettings}
        onOpenChange={setShowGenerateSettings}
        display={displaySettings}
        appConfig={appConfig}
        lessonConfig={currentLessonConfig}
        lessonNumber={currentLessonNumber}
        onSaveAppConfig={handleSaveAppConfig}
        onSaveLessonConfig={handleSaveLessonConfig}
      />

      <StudentImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        students={currentClass?.students || []}
        onSave={handleImportStudents}
      />

      {/* 学生转班对话框 */}
      {currentClass && (
        <TransferStudentDialog
          open={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          fromClassId={currentClass.id}
          fromClassName={currentClass.name}
          students={currentClass.students}
          classes={Object.values(classes).map(c => ({
            id: c.id, name: c.name, students: c.students, recordCount: c.records.length
          }))}
          getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
          onConfirm={handleTransferStudent}
        />
      )}

      <ReviewQueueDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        pending={cloudSync.pending}
        currentSnapshot={makeSnapshot()}
        canReview={!!membership?.admin}
        onApprove={(item) => { void cloudSync.approvePending(item).then(() => snapshotVersion('审核通过：' + item.by)); }}
        onReject={(item) => { void cloudSync.rejectPending(item); }}
      />

      <VersionHistoryDialog
            open={versionOpen}
            onClose={() => setVersionOpen(false)}
            currentSnapshot={makeSnapshot()}
            actor={actor}
            canRollback={!!membership?.admin}
            onRecordCurrent={() => snapshotVersion('手动保存版本')}
            onRollback={(entry) => {
              if (!membership?.admin) { toast.error('回退需要管理员权限'); return; }
              const before = makeSnapshot();
              const detail = diffSnapshots(before, entry.snapshot);
              importData(entry.snapshot);
              recordVersion(entry.snapshot, { actor, reason: '回退到 ' + new Date(entry.at).toLocaleString('zh-CN'), summary: ['回退前状态与本次回退共 ' + detail.length + ' 处差异（已存为新版本，可再退回）'] });
              toast.success('已回退到该版本', { description: '回退动作已记为新版本，可再次回退', duration: 5000 });
              setVersionOpen(false);
            }}
      />

      {/* 学生分析模态框（懒加载：仅点开分析时才加载图表依赖） */}
      {analysisStudent && currentClass && (
        <Suspense fallback={<ModuleLoading label="学生分析" />}>

          <StudentAnalysis
            isOpen={!!analysisStudent}
            onClose={() => setAnalysisStudent(null)}
            studentName={analysisStudent}
            nickname={getStudentNickname(analysisStudent, currentClassId || undefined)}
            allRecords={(() => {
              // 引用该生在所有班级的记录：调课学生能看到原班级的课次与成绩（无同名记录时自然为空）
              const cross = getStudentAllRecords(analysisStudent);
              if (cross.length > 0) return cross;
              const recs = currentClass.records.filter(r => r.studentName === analysisStudent);
              // 名单内学员或已转出但有历史记录者，都可查看分析
              return (currentClass.students.includes(analysisStudent) || recs.length > 0)
                ? [{ classId: currentClass.id, className: currentClass.name, records: recs }]
                : [];
            })()}
            schoolScores={getStudentSchoolScores(analysisStudent)}
            classRecords={currentClass?.records || []}
            getLessonConfig={getLessonConfig}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;

