// 考勤类型
export type AttendanceType = string;

// 作业状态类型
export type HomeworkStatusType = string;

// 乐听说状态类型
export type ListeningStatusType = string;

// 季节类型
export type SeasonType = '暑' | '秋' | '寒' | '春';

// 题型
export interface QuestionType {
  id: string;
  name: string;
  fullScore: number;
  order: number;
}

// 课次配置
export interface LessonConfig {
  questionTypes: QuestionType[];
  attendanceOptions: string[];
  homeworkOptions: string[];
  listeningOptions: string[];
  feedbackTemplate: string;
  praiseTemplate: string;
  homeworkText: string;
}

// 学生记录
export interface StudentRecord {
  id: string;
  studentName: string;
  lessonNumber: number;
  seasons: SeasonType[];
  attendance: string;
  adjustReason?: string;
  homeworkStatus: string;
  listeningStatus: string;
  listeningScore: number;
  scores: { [questionTypeId: string]: number };
  totalScore: number;
  correctRate: number;
  rank: number;
  date: string;
}

// 全局学生（跨班型同步）
export interface GlobalStudent {
  name: string;
  nicknames: { [classId: string]: string };
}

// 班级
export interface Class {
  id: string;
  name: string;
  students: string[];
  records: StudentRecord[];
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
}

// 应用配置
export interface AppConfig {
  defaultAttendanceOptions: string[];
  defaultHomeworkOptions: string[];
  defaultListeningOptions: string[];
  defaultFeedbackTemplate: string;
  defaultPraiseTemplate: string;
  defaultQuestionTypes: QuestionType[];
}

// 校内成绩
export interface SchoolScore {
  id: string;
  studentName: string;
  studentCode?: string;
  examName: string;
  date: string;
  campus?: string;
  grade?: string;
  subject?: string;
  classType?: string;
  teacherName?: string;
  teacherEmail?: string;
  fiscalYear?: string;
  quarter?: string;
  score: number;
  totalScore: number;
  convertedScore?: number;
  isRecorded: boolean;
  isImproved: boolean;
  improvementType?: string;
  auditResult?: string;
  classRank?: number;
  gradeRank?: number;
  classSize?: number;
  gradeLevel?: string;
  enrollmentPercent?: number;
  school?: string;
  note?: string;
}

// 班级统计数据
export interface ClassStats {
  maxScore: number;
  minScore: number;
  avgScore: number;
  avgScores: { [questionTypeId: string]: number };
}

// 学生薄弱项
export interface WeakPoint {
  questionTypeId: string;
  questionTypeName: string;
  studentScore: number;
  classAvgScore: number;
  diff: number;
}
