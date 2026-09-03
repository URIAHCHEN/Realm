import { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { Toaster, toast } from 'sonner';
import { Download, Upload, Settings, BookOpen, TrendingUp, FileText, BarChart3, LogOut, Trophy, Cloud, Columns3, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClassData } from '@/hooks/useClassData';
import { LoginPage } from '@/components/LoginPage';
import { getCachedSession, signOut } from '@/lib/auth';
import { BUILD_SCOPE } from '@/lib/config';
import { ensureSelfMembership, myUserId } from '@/lib/members';
import type { Membership } from '@/lib/members';
import { MembersPanel } from '@/components/MembersPanel';
import { ClassSelector } from '@/components/ClassSelector';
import { ClassInfoCard } from '@/components/ClassInfoCard';
import { LessonManager } from '@/components/LessonManager';
import { StudentTable } from '@/components/StudentTable';
import { FeedbackGenerator } from '@/components/FeedbackGenerator';
import { PraiseGenerator } from '@/components/PraiseGenerator';
import { StudentImportModal } from '@/components/StudentImportModal';
import { ConfigPanel } from '@/components/ConfigPanel';
import { PasswordSettings } from '@/components/PasswordSettings';
import { Leaderboard } from '@/components/Leaderboard';

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
    <span className="w-4 h-4 rounded-full border-2 border-[rgb(var(--accent-rgb)/0.3)] border-t-[rgb(var(--accent-rgb))] animate-spin" />
    正在加载{label}…
  </div>
);
import { exportToCSV, downloadCSV } from '@/lib/feedbackTemplates';
import { exportToExcel, downloadExcel, exportClassRosterToExcel } from '@/lib/excelExport';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncPanel } from '@/components/CloudSyncPanel';
import { DocSyncPanel } from '@/components/DocSyncPanel';
import { DisplaySettingsPanel } from '@/components/DisplaySettingsPanel';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import type { ParsedRow } from '@/lib/docSync';
import type { SyncSnapshot } from '@/lib/cloudSync';
import type { AppConfig, LessonConfig } from '@/types';
import './App.css';

// 默认管理员密码
// 默认密码：登录密码（日常使用）与管理员密码（最高权限）
const DEFAULT_LOGIN_PASSWORD = 'Lynn';
const DEFAULT_ADMIN_PASSWORD = 'Chl0131';

function App() {
  // 认证状态：以 Supabase Auth 真实会话为准（不再用 localStorage 密码门）
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!getCachedSession();
  });
  // 登录密码：用于登录校验
  const [loginPassword, setLoginPassword] = useState(() => {
    return localStorage.getItem('loginPassword') || DEFAULT_LOGIN_PASSWORD;
  });
  // 管理员密码：用于修改登录密码等高权限操作
  const [adminPassword, setAdminPassword] = useState(() => {
    return localStorage.getItem('adminPassword') || DEFAULT_ADMIN_PASSWORD;
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
    removeStudentFromClass,
    saveLessonConfig,
    saveRecord,
    updateRecordField,
    deleteRecord,
    restoreRecord,
    restoreStudent,
    updateAppConfig,
    getStudentSchoolScores,
    addSchoolScore,
    importSchoolScoresFromExcel,
    deleteSchoolScore,
    restoreSchoolScore,
    exportData,
    importData,
    exportToHTML
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
    schoolScores
  }), [appConfig, classes, nicknames, schoolScores]);

  const cloudSync = useCloudSync({
    snapshot: syncSnapshot,
    onImport: (snap) => importData(snap),
    enabled: isAuthenticated,
    sessionKey,
    canWrite: isAuthenticated && membership.member
  });

  const displaySettings = useDisplaySettings();

  // 登录后：自举首个管理员 / 刷新成员身份
  useEffect(() => { refreshMembership(); }, [refreshMembership, sessionKey]);

  // 从在线表格粘贴导入：逐行合并到当前课次
  const handleImportDocRows = (rows: ParsedRow[]) => {
    if (!currentClassId) {
      toast.error('请先选择班级');
      return;
    }
    rows.forEach(row => {
      saveRecord(currentClassId, {
        studentName: row.studentName,
        lessonNumber: currentLessonNumber,
        ...(row.attendance ? { attendance: row.attendance } : {}),
        ...(row.homeworkStatus ? { homeworkStatus: row.homeworkStatus } : {}),
        ...(row.listeningStatus ? { listeningStatus: row.listeningStatus } : {}),
        ...(row.listeningScore !== undefined ? { listeningScore: row.listeningScore } : {}),
        scores: row.scores || {}
      });
    });
  };

  // 保存密码到localStorage
  useEffect(() => {
    localStorage.setItem('loginPassword', loginPassword);
  }, [loginPassword]);

  useEffect(() => {
    localStorage.setItem('adminPassword', adminPassword);
  }, [adminPassword]);

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

  // 修改登录密码（需先通过管理员密码校验，由 PasswordSettings 内部完成）
  const handleChangeLoginPassword = (newPassword: string) => {
    setLoginPassword(newPassword);
  };

  // 修改管理员密码
  const handleChangeAdminPassword = (newPassword: string) => {
    setAdminPassword(newPassword);
  };

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
    currentClass.students.forEach(studentName => {
      const existingRecord = currentRecords.find(r => r.studentName === studentName);
      if (!existingRecord) {
        saveRecord(currentClass.id, {
          studentName,
          lessonNumber: currentLessonNumber,
          attendance: '按时出勤',
          homeworkStatus: '圆满完成',
          listeningStatus: '具体分数',
          listeningScore: 0,
          scores: {},
          seasons: []
        });
      }
    });

    toast.success(`第${currentLessonNumber}课已保存！`);
  };

  // 处理增加新课次
  const handleAddLesson = (lesson: number) => {
    if (allLessons.includes(lesson)) {
      toast.error(`第${lesson}课已存在`);
      return;
    }
    setCurrentLessonNumber(lesson);
    toast.success(`已切换到第${lesson}课`);
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
    addStudents(currentClassId, students);
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
  const handleExportRosterExcel = () => {
    if (!currentClass) {
      toast.error('请先选择班级');
      return;
    }

    const lessonRecords = currentClass.records.filter(r => r.lessonNumber === currentLessonNumber);
    const nickMap = nicknames[currentClass.id] || {};
    const workbook = exportClassRosterToExcel({
      className: currentClass.name,
      lessonNumber: currentLessonNumber,
      students: currentClass.students,
      records: lessonRecords,
      nicknames: nickMap,
      questionTypes: currentLessonConfig.questionTypes
    });
    downloadExcel(workbook, `${currentClass.name}第${currentLessonNumber}课名单.xlsx`);
    toast.success('Excel 名单已导出！');
  };

  // 处理导出所有数据为Excel（用于查看/分析，不可用于恢复）
  const handleExportAllData = () => {
    const data = exportData();
    const { workbook, filename } = exportToExcel(data, currentClass?.name || '所有班级');
    downloadExcel(workbook, filename);
    toast.success('数据已导出为Excel！');
  };

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
        } catch (error) {
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
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 rounded-xl flex items-center justify-center shadow-lg liquid-glass text-3xl">
                🏫
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 bg-clip-text text-transparent">Lynn's Realm</h1>
              </div>
            </div>
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
                <span className="font-mono text-[#8e8e93]">{myUserId().slice(0, 8)}</span>
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
                云同步
                <span
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    cloudSync.status === 'connected' ? 'bg-emerald-500' :
                    cloudSync.status === 'conflict' || cloudSync.status === 'error' || cloudSync.status === 'readonly' ? 'bg-amber-500' :
                    cloudSync.status === 'connecting' ? 'bg-blue-500 animate-pulse' :
                    'bg-slate-300'
                  }`}
                />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportAllData}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                导入备份
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBackupJson}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                导出备份
              </Button>
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

      {/* 班级选择栏 */}
      <div className="max-w-[1600px] mx-auto px-6 py-4">
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
      <div className="max-w-[1600px] mx-auto px-6 pb-8">
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
            <TabsTrigger value="config" className="ios-tab-trigger">
              <Settings className="w-5 h-5" />
              系统配置
            </TabsTrigger>
            <TabsTrigger value="cloud" className="ios-tab-trigger">
              <Cloud className="w-5 h-5" />
              同步中心
            </TabsTrigger>
          </TabsList>

          {/* 学情记录 Tab */}
          <TabsContent value="records" className="space-y-6">
            <div className="flex gap-6">
              {/* 左侧边栏 */}
              <div className="w-72 flex-shrink-0 space-y-4">
                <ClassInfoCard
                  classData={currentClass}
                  onManageStudents={() => setIsImportModalOpen(true)}
                />
                <LessonManager
                  currentLessonNumber={currentLessonNumber}
                  allLessons={allLessons}
                  onSelectLesson={setCurrentLessonNumber}
                  onAddLesson={handleAddLesson}
                  onSaveCurrentLesson={handleSaveCurrentLesson}
                />
              </div>

              {/* 右侧主内容 */}
              <div className="flex-1">
                <StudentTable
                  students={currentClass?.students || []}
                  records={currentClass?.records || []}
                  lessonConfig={currentLessonConfig}
                  lessonNumber={currentLessonNumber}
                  getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                  calculateClassStats={calculateClassStats}
                  onUpdateRecord={(recordId, field, value) => currentClass && updateRecordField(currentClass.id, recordId, field, value)}
                  onCreateRecord={(studentName, record) => currentClass && saveRecord(currentClass.id, { ...record, studentName })}
                  onDeleteRecord={handleDeleteRecord}
                  onAddStudent={handleAddStudent}
                  onRemoveStudent={handleRemoveStudent}
                  onExportData={handleExportData}
                  onExportExcel={handleExportRosterExcel}
                  getPublicityHTML={() => currentClass ? exportToHTML(currentClass.id, currentLessonNumber, displaySettings.settings.exportStyle) : ''}
                  onViewStudentAnalysis={handleViewStudentAnalysis}
                  onSaveLessonConfig={handleSaveLessonConfig}
                />
              </div>
            </div>
          </TabsContent>

          {/* 表扬榜 Tab */}
          <TabsContent value="leaderboard">
            <Leaderboard
              records={currentClass?.records || []}
              lessonConfig={currentLessonConfig}
              lessonNumber={currentLessonNumber}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              calculateClassStats={calculateClassStats}
            />
          </TabsContent>

          {/* 反馈生成 Tab */}
          <TabsContent value="feedback" className="space-y-6">
            <FeedbackGenerator
              students={currentClass?.students || []}
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
          </TabsContent>

          {/* 校内成绩 Tab（懒加载：仅切到本 Tab 时才加载图表与 Excel 依赖） */}
          <TabsContent value="school">
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
          </TabsContent>

          {/* 学情报告 Tab（懒加载：仅切到本 Tab 时才加载图表与截图依赖） */}
          <TabsContent value="report">
            <Suspense fallback={<ModuleLoading label="学情报告" />}>
              <StudentReport
                students={currentClass?.students || []}
                records={currentClass?.records || []}
                schoolScores={schoolScores}
                lessonConfigs={currentClass?.lessonConfigs || {}}
                getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                currentClassName={currentClass?.name || ''}
              />
            </Suspense>
          </TabsContent>

          {/* 系统配置 Tab */}
          <TabsContent value="config" className="space-y-6">
            <Tabs defaultValue="visualization" className="space-y-4">
              <TabsList className="grid w-full max-w-2xl grid-cols-4">
                <TabsTrigger value="visualization" className="gap-1.5">
                  <BarChart3 className="w-4 h-4" />数据可视化
                </TabsTrigger>
                <TabsTrigger value="fields" className="gap-1.5">
                  <Columns3 className="w-4 h-4" />表格字段
                </TabsTrigger>
                <TabsTrigger value="publicity" className="gap-1.5">
                  <FileText className="w-4 h-4" />公示样式
                </TabsTrigger>
                <TabsTrigger value="security" className="gap-1.5">
                  <Lock className="w-4 h-4" />密码
                </TabsTrigger>
              </TabsList>
              <TabsContent value="visualization">
                <div className="max-w-4xl">
                  <DisplaySettingsPanel display={displaySettings} />
                </div>
              </TabsContent>
              <TabsContent value="fields">
                <div className="max-w-4xl">
                  <ConfigPanel
                    appConfig={appConfig}
                    lessonConfig={currentLessonConfig}
                    lessonNumber={currentLessonNumber}
                    onSaveAppConfig={handleSaveAppConfig}
                    onSaveLessonConfig={handleSaveLessonConfig}
                  />
                </div>
              </TabsContent>
              <TabsContent value="publicity">
                <div className="max-w-4xl">
                  <PublicityStylePanel display={displaySettings} />
                </div>
              </TabsContent>
              <TabsContent value="security">
                <div className="max-w-md">
                  <PasswordSettings
                    adminPassword={adminPassword}
                    onChangeLoginPassword={handleChangeLoginPassword}
                    onChangeAdminPassword={handleChangeAdminPassword}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* 同步中心 Tab */}
          <TabsContent value="cloud" className="space-y-6">
            <MembersPanel isAdmin={membership.admin} onChanged={refreshMembership} />
            {membership.admin && (
              <div className="space-y-6">
                <CloudSyncPanel sync={cloudSync} />
                <DocSyncPanel
                  records={currentClass?.records.filter(r => r.lessonNumber === currentLessonNumber) || []}
                  lessonConfig={currentLessonConfig}
                  lessonNumber={currentLessonNumber}
                  getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
                  display={displaySettings}
                  onImportRows={handleImportDocRows}
                  onExportExcel={handleExportAllData}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 学生导入模态框 */}
      <StudentImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        students={currentClass?.students || []}
        onSave={handleImportStudents}
      />

      {/* 学生分析模态框（懒加载：仅点开分析时才加载图表依赖） */}
      {analysisStudent && currentClass && (
        <Suspense fallback={<ModuleLoading label="学生分析" />}>
          <StudentAnalysis
            isOpen={!!analysisStudent}
            onClose={() => setAnalysisStudent(null)}
            studentName={analysisStudent}
            nickname={getStudentNickname(analysisStudent, currentClassId || undefined)}
            allRecords={currentClass.students.includes(analysisStudent) 
              ? [{ classId: currentClass.id, className: currentClass.name, records: currentClass.records.filter(r => r.studentName === analysisStudent) }]
              : []}
            schoolScores={getStudentSchoolScores(analysisStudent)}
            getLessonConfig={getLessonConfig}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;

// 公示样式设置面板
function PublicityStylePanel({ display }: { display: ReturnType<typeof useDisplaySettings> }) {
  const { settings, update } = display;
  const options: { id: 'gradient' | 'minimal' | 'dark'; name: string; desc: string; preview: React.ReactNode }[] = [
    { id: 'gradient', name: '渐变蓝', desc: '经典蓝色渐变模板', preview: <div className="w-full h-12 rounded-md" style={{ background: 'linear-gradient(135deg, #3b8beb 0%, #1e5fd6 100%)' }} /> },
    { id: 'minimal', name: '简约白', desc: '浅色简洁风格', preview: <div className="w-full h-12 rounded-md bg-slate-100 border" /> },
    { id: 'dark', name: '暗夜模式', desc: '深色护眼风格', preview: <div className="w-full h-12 rounded-md" style={{ background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)' }} /> },
  ];
  return (
    <div className="ios-glass-card rounded-2xl border-0 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h2 className="font-semibold text-[#1c1c1e]">公示导出样式</h2>
        <span className="text-xs text-[#8e8e93]">影响学情公示 HTML / 图片的视觉风格</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => update({ exportStyle: o.id })}
            className={`text-left rounded-xl border-2 p-3 transition-all ${
              settings.exportStyle === o.id ? 'border-[rgb(var(--accent-rgb)/0.6)] shadow-md' : 'border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="mb-2">{o.preview}</div>
            <p className="font-medium text-sm text-slate-800">{o.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{o.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
