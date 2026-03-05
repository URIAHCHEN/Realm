import * as XLSX from 'xlsx';
import type { AppConfig, Class, SchoolScore } from '@/types';

interface ExportData {
  appConfig: AppConfig;
  classes: { [key: string]: Class };
  nicknames: { [classId: string]: { [studentName: string]: string } };
  schoolScores: { [studentName: string]: SchoolScore[] };
}

// 导出所有数据为Excel
export function exportToExcel(data: ExportData, _className: string): { workbook: XLSX.WorkBook; filename: string } {
  const { classes, nicknames, schoolScores } = data;
  const workbook = XLSX.utils.book_new();

  // 1. 班级学生表
  Object.values(classes).forEach(cls => {
    const studentsData = cls.students.map((student, index) => ({
      '序号': index + 1,
      '学生姓名': student,
      '昵称': nicknames[cls.id]?.[student] || student,
      '班级': cls.name
    }));

    const studentsSheet = XLSX.utils.json_to_sheet(studentsData);
    XLSX.utils.book_append_sheet(workbook, studentsSheet, `${cls.name}-学生名单`);

    // 2. 学情记录表
    const allLessons = [...new Set(cls.records.map(r => r.lessonNumber))].sort((a, b) => a - b);
    
    allLessons.forEach(lessonNum => {
      const lessonRecords = cls.records.filter(r => r.lessonNumber === lessonNum);
      const lessonConfig = cls.lessonConfigs[lessonNum.toString()];
      
      if (lessonRecords.length === 0) return;

      const questionTypes = lessonConfig?.questionTypes || [];
      
      const recordsData = lessonRecords.map((record, index) => {
        const row: Record<string, string | number> = {
          '序号': index + 1,
          '学生姓名': record.studentName,
          '昵称': nicknames[cls.id]?.[record.studentName] || record.studentName,
          '课次': `第${record.lessonNumber}课`,
          '学习轨迹': record.seasons.join(''),
          '考勤': record.attendance,
          '书面作业': record.homeworkStatus,
          '乐听说': record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus,
        };

        // 添加各题型分数
        questionTypes.forEach(qt => {
          row[qt.name] = record.scores[qt.id] || 0;
        });

        row['总分'] = record.totalScore;
        row['正确率'] = `${record.correctRate}%`;
        row['排名'] = `第${record.rank}名`;

        return row;
      });

      const recordsSheet = XLSX.utils.json_to_sheet(recordsData);
      XLSX.utils.book_append_sheet(workbook, recordsSheet, `${cls.name}-第${lessonNum}课`);
    });
  });

  // 3. 校内成绩表
  const allSchoolScores: Array<Record<string, string | number | undefined>> = [];
  Object.entries(schoolScores).forEach(([studentName, scores]) => {
    scores.forEach(score => {
      allSchoolScores.push({
        '学生姓名': studentName,
        '考试名称': score.examName,
        '日期': score.date,
        '校区': score.campus,
        '年级': score.grade,
        '科目': score.subject,
        '班型': score.classType,
        '教师': score.teacherName,
        '学年': score.fiscalYear,
        '学期': score.quarter,
        '分数': score.score,
        '总分': score.totalScore,
        '折算分': score.convertedScore,
        '班级排名': score.classRank,
        '年级排名': score.gradeRank,
        '学校': score.school,
        '备注': score.note
      });
    });
  });

  if (allSchoolScores.length > 0) {
    const schoolSheet = XLSX.utils.json_to_sheet(allSchoolScores);
    XLSX.utils.book_append_sheet(workbook, schoolSheet, '校内成绩');
  }

  const filename = `LynnsRealm_数据备份_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  return { workbook, filename };
}

// 下载Excel文件
export function downloadExcel(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
}

// 导出单个课次数据为Excel
export function exportLessonToExcel(
  records: Array<Record<string, string | number>>,
  _className: string,
  lessonNumber: number
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(records);
  XLSX.utils.book_append_sheet(workbook, sheet, `第${lessonNumber}课`);
  return workbook;
}
