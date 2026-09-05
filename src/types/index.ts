// 考勤类型
export type AttendanceType = string;

// 作业状态类型
export type HomeworkStatusType = string;

// 课后任务状态类型
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

// 自定义列：选项型（下拉）或分数型（数值，可含满分）
export interface CustomField {
  id: string;
  name: string;
  kind: 'select' | 'number';
  /** kind==='select' 时的可选项 */
  options?: string[];
  /** kind==='number' 时的满分（可选，用于比例/数据条） */
  fullScore?: number;
  /** 仅分数型：是否计入总分与正确率分母 */
  includeInTotal?: boolean;
  order: number;
}

// 固定列的自定义标题（可留空使用默认名）
export interface ColumnLabels {
  seasons?: string;
  attendance?: string;
  homework?: string;
  listening?: string;
  note?: string;
  pass?: string;
}

// 班群公示表彰模板
export interface PraiseTemplate {
  id: string;
  name: string;
  template: string;
}

// 课次配置
export interface LessonConfig {
  questionTypes: QuestionType[];
  attendanceOptions: string[];
  homeworkOptions: string[];
  listeningOptions: string[];
  feedbackTemplate: string;
  praiseTemplate: string;
  /** 多套表彰模板（优先于 praiseTemplate 使用；为空时回退 praiseTemplate） */
  praiseTemplates?: PraiseTemplate[];
  homeworkText: string;
  /** 自定义列定义（选项型/分数型），按课次配置 */
  customFields?: CustomField[];
  /** 固定列自定义标题，如将"课后任务"改为其他名称 */
  columnLabels?: ColumnLabels;
  /** 过关正确率阈值（百分比），达到或超过判定为过关；默认 80 */
  passThreshold?: number;
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
  /** 自定义列的值：选项字符串 或 分数数字，按 CustomField.id 存储 */
  customValues?: { [fieldId: string]: string | number };
  totalScore: number;
  correctRate: number;
  rank: number;
  date: string;
  /** 备注 */
  note?: string;
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
  /** 财年季度，如 FY27Q1 / FY27Q2 */
  term?: string;
  /** 班级批次编号，如 TG3ZY078 */
  batchCode?: string;
  students: string[];
  records: StudentRecord[];
  lessonConfigs: { [lessonNumber: string]: LessonConfig };
}

// 预存反馈素材（全局按课次组织；素材以链接形式存储）
export interface SavedFeedback {
  id: string;
  /** 课次序号，用于按第几次课排列 */
  lessonNumber: number;
  /** 标题/场景说明 */
  title: string;
  /** 正文文本 */
  content: string;
  /** 素材链接（图片/视频等，仅存链接） */
  links: string[];
  updatedAt: string;
}

// 应用配置
export interface AppConfig {
  defaultAttendanceOptions: string[];
  defaultHomeworkOptions: string[];
  defaultListeningOptions: string[];
  defaultFeedbackTemplate: string;
  defaultPraiseTemplate: string;
  defaultQuestionTypes: QuestionType[];
  /** 预存反馈素材库（全局按课次） */
  savedFeedbacks?: SavedFeedback[];
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
