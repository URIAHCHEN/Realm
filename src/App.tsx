import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { Download, Upload, Settings, BookOpen, TrendingUp, FileText, BarChart3, LogOut, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClassData } from '@/hooks/useClassData';
import { LoginPage } from '@/components/LoginPage';
import { ClassSelector } from '@/components/ClassSelector';
import { ClassInfoCard } from '@/components/ClassInfoCard';
import { LessonManager } from '@/components/LessonManager';
import { StudentTable } from '@/components/StudentTable';
import { FeedbackGenerator } from '@/components/FeedbackGenerator';
import { PraiseGenerator } from '@/components/PraiseGenerator';
import { StudentImportModal } from '@/components/StudentImportModal';
import { ConfigPanel } from '@/components/ConfigPanel';
import { SchoolScorePanel } from '@/components/SchoolScorePanel';
import { StudentAnalysis } from '@/components/StudentAnalysis';
import { PasswordSettings } from '@/components/PasswordSettings';
import { Leaderboard } from '@/components/Leaderboard';
import { StudentReport } from '@/components/StudentReport';
import { exportToCSV, downloadCSV, downloadHTML } from '@/lib/feedbackTemplates';
import { exportToExcel, downloadExcel } from '@/lib/excelExport';
import type { AppConfig, LessonConfig } from '@/types';
import './App.css';

// 默认管理员密码
const DEFAULT_PASSWORD = 'Lynn';

function App() {
  // 认证状态
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [password, setPassword] = useState(() => {
    return localStorage.getItem('adminPassword') || DEFAULT_PASSWORD;
  });

  // 应用数据
  const {
    appConfig,
    classes,
    currentClassId,
    currentLessonNumber,
    currentClass,
    currentLessonConfig,
    schoolScores,
    setCurrentClassId,
    setCurrentLessonNumber,
    getLessonConfig,
    getCurrentLessonRecords,
    getAllLessons,
    getStudentNickname,
    calculateClassStats,
    createClass,
    deleteClass,
    addStudentToClass,
    addStudents,
    removeStudentFromClass,
    saveLessonConfig,
    saveRecord,
    updateRecordField,
    deleteRecord,
    updateAppConfig,
    getStudentSchoolScores,
    addSchoolScore,
    importSchoolScoresFromExcel,
    deleteSchoolScore,
    exportData,
    importData,
    exportToHTML
  } = useClassData();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('records');
  const [analysisStudent, setAnalysisStudent] = useState<string | null>(null);

  // 保存密码到localStorage
  useEffect(() => {
    localStorage.setItem('adminPassword', password);
  }, [password]);

  // 登录处理
  const handleLogin = (inputPassword: string): boolean => {
    if (inputPassword === password) {
      setIsAuthenticated(true);
      localStorage.setItem('isAuthenticated', 'true');
      toast.success('登录成功');
      return true;
    }
    return false;
  };

  // 登出处理
  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
    toast.success('已登出');
  };

  // 修改密码
  const handleChangePassword = (newPassword: string) => {
    setPassword(newPassword);
  };

  // 未登录显示登录页面
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-center" richColors />
        <LoginPage onLogin={handleLogin} />
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

  // 处理移除学生
  const handleRemoveStudent = (studentName: string) => {
    if (!currentClassId) return;
    removeStudentFromClass(currentClassId, studentName);
    toast.success(`已移除学生：${studentName}`);
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

  // 处理导出HTML
  const handleExportHTML = () => {
    if (!currentClass) {
      toast.error('请先选择班级');
      return;
    }

    const html = exportToHTML(currentClass.id, currentLessonNumber);
    downloadHTML(html, `${currentClass.name}第${currentLessonNumber}课学情公示.html`);
    toast.success('HTML导出成功！');
  };

  // 处理导出所有数据为Excel
  const handleExportAllData = () => {
    const data = exportData();
    const { workbook, filename } = exportToExcel(data, currentClass?.name || '所有班级');
    downloadExcel(workbook, filename);
    toast.success('数据已导出为Excel！');
  };

  // 处理导入所有数据
  const handleImportAllData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          importData(data);
          toast.success('数据导入成功！');
        } catch (error) {
          toast.error('数据导入失败，请检查文件格式');
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
      const result = await importSchoolScoresFromExcel(file);
      if (result.success > 0) {
        toast.success(`成功导入${result.success}条成绩`);
      }
      return result;
    } catch (error) {
      toast.error('导入失败：' + error);
      return { success: 0, failed: 0, errors: [String(error)] };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 liquid-glass-bg">
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
                onClick={handleExportAllData}
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
          onDeleteClass={deleteClass}
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
                  onDeleteRecord={(recordId) => currentClass && deleteRecord(currentClass.id, recordId)}
                  onAddStudent={handleAddStudent}
                  onRemoveStudent={handleRemoveStudent}
                  onExportData={handleExportData}
                  onExportHTML={handleExportHTML}
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
            <div className="grid grid-cols-2 gap-6">
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
            </div>
          </TabsContent>

          {/* 校内成绩 Tab */}
          <TabsContent value="school">
            <SchoolScorePanel
              students={currentClass?.students || []}
              scores={currentClass ? (schoolScores[currentClass.students[0]] || []) : []}
              onAddScore={addSchoolScore}
              onDeleteScore={deleteSchoolScore}
              onImportExcel={handleImportExcel}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
            />
          </TabsContent>

          {/* 学情报告 Tab */}
          <TabsContent value="report">
            <StudentReport
              students={currentClass?.students || []}
              records={currentClass?.records || []}
              schoolScores={schoolScores}
              lessonConfigs={currentClass?.lessonConfigs || {}}
              getNickname={(name) => getStudentNickname(name, currentClassId || undefined)}
              currentClassName={currentClass?.name || ''}
            />
          </TabsContent>

          {/* 系统配置 Tab */}
          <TabsContent value="config">
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

          {/* 安全设置 Tab */}
          <TabsContent value="security">
            <div className="max-w-md mx-auto">
              <PasswordSettings
                currentPassword={password}
                onChangePassword={handleChangePassword}
              />
            </div>
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

      {/* 学生分析模态框 */}
      {analysisStudent && currentClass && (
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
      )}
    </div>
  );
}

export default App;
