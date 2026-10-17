// 教师精灵（企鹅教师助手）个性化文本模板导出（2026-10-17）
//
// 背景：用户要把「反馈生成」里每个学生的私发反馈/四个一，直接灌进教师精灵的上传模板。
// 模板布局（与 教师精灵_个性化文本模板.xlsx 完全一致）：
//   第 1 行：填写说明（A1 单元格）
//   第 2 行：表头 —— 学员号 | 学生姓名 | *文本1 [| 文本2]
//   第 3 行起：数据 —— 学员号留空（模板允许只填姓名） | 姓名 | C 列内容 [| D 列内容]
// 说明：文本1 必填、单条上限 1000 字 —— 超长会截断并回报条数，避免上传被拒。
//
// 列可配（2026-10-17 改）：默认只导出「B 姓名 + C 文本1」两列（私发反馈场景）；
// 需要时由调用方传 includeText2=true 追加 D 列。C/D 列放什么内容由调用方决定，
// 本函数只负责把文本写进对应列。
const TEMPLATE_NOTE = '填写说明：\n'
  + '1-学员限制：学员号、学生姓名至少填写一项，最多上传2000条数据。\n'
  + '2-匹配规则：有学员号时优先按学员号匹配；未填学员号时，才按学生姓名匹配。\n'
  + '3-文本限制：每个学生可填写1-5条文本（至少填写1个），单条文本字数上限为1000字。';

export interface TeacherElfRow {
  name: string;
  /** C 列（*文本1）内容，必填 */
  text1: string;
  /** D 列（文本2）内容，仅 includeText2 时写入（可空） */
  text2?: string;
}

export const TEACHER_ELF_TEXT_LIMIT = 1000;

/** 按教师精灵模板生成 xlsx 并下载；返回截断条数供调用方提示 */
export async function exportTeacherElfXlsx(opts: {
  className?: string;
  lessonNumber: number;
  rows: TeacherElfRow[];
  /** 是否导出 D 列（文本2）。默认 false —— 只出「姓名 + 文本1」两列 */
  includeText2?: boolean;
}): Promise<{ filename: string; truncated: number }> {
  const XLSX = await import('xlsx');
  const includeText2 = opts.includeText2 === true;
  const clip = (t: string) => {
    const s = String(t || '');
    return s.length > TEACHER_ELF_TEXT_LIMIT ? s.slice(0, TEACHER_ELF_TEXT_LIMIT) : s;
  };
  let truncated = 0;
  const data = opts.rows.map(r => {
    const raw1 = r.text1 || '';
    const raw2 = r.text2 || '';
    const t1 = clip(raw1);
    // 只有真正导出的列才参与截断统计（D 列没导出时不该报它的截断）
    const t2 = includeText2 ? clip(raw2) : '';
    if (t1 !== raw1 || (includeText2 && t2 !== raw2)) truncated++;
    return includeText2 ? ['', r.name, t1, t2] : ['', r.name, t1];
  });

  const aoa: (string)[][] = [
    [TEMPLATE_NOTE],
    includeText2
      ? ['学员号', '学生姓名', '*文本1', '文本2']
      : ['学员号', '学生姓名', '*文本1'],
    ...data,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = includeText2
    ? [{ wch: 10 }, { wch: 12 }, { wch: 90 }, { wch: 90 }]
    : [{ wch: 10 }, { wch: 12 }, { wch: 90 }];
  // 说明行与表头行加高，便于打开时阅读（不影响上传解析）
  ws['!rows'] = [{ hpt: 78 }, { hpt: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const cls = (opts.className || '').trim();
  const filename = `教师精灵_个性化文本_${cls ? cls + '_' : ''}第${opts.lessonNumber}课_${ymd}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { filename, truncated };
}
