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
  /** E 列（文本3）内容，仅 includeText3 时写入（可空） */
  text3?: string;
}

export type TeacherElfKind = 'private' | 'fourInOne' | 'advice';
export type TeacherElfTextSlot = TeacherElfKind | 'fourInOnePart2';

/**
 * 把界面所选内容展开为教师精灵的连续文本列。
 * 详细版四个一本身分两段：选中四个一时展开为「文本1 + 文本2」；
 * 若前面还有私发反馈，则最终自然落到 C/D/E 三段，不会互相覆盖。
 */
export function planTeacherElfColumns(
  selected: TeacherElfKind[],
  detailedFourInOne: boolean,
): TeacherElfTextSlot[] {
  return selected.flatMap(kind =>
    kind === 'fourInOne' && detailedFourInOne
      ? ['fourInOne' as const, 'fourInOnePart2' as const]
      : [kind]);
}

export const TEACHER_ELF_TEXT_LIMIT = 1000;

/** 生成可直接写入工作表的表头与数据，独立于文件下载，便于确定性自测。 */
export function buildTeacherElfTable(
  rows: TeacherElfRow[],
  includeText2: boolean,
  includeText3: boolean,
): { header: string[]; data: string[][]; truncated: number } {
  const withText2 = includeText2 === true;
  const withText3 = withText2 && includeText3 === true;
  const clip = (t: string) => {
    const s = String(t || '');
    return s.length > TEACHER_ELF_TEXT_LIMIT ? s.slice(0, TEACHER_ELF_TEXT_LIMIT) : s;
  };
  let truncated = 0;
  const data = rows.map(r => {
    const raw = [r.text1 || ''];
    if (withText2) raw.push(r.text2 || '');
    if (withText3) raw.push(r.text3 || '');
    const texts = raw.map(clip);
    if (texts.some((text, index) => text !== raw[index])) truncated++;
    return ['', r.name, ...texts];
  });
  const header = ['学员号', '学生姓名', '*文本1'];
  if (withText2) header.push('文本2');
  if (withText3) header.push('文本3');
  return { header, data, truncated };
}

/** 按教师精灵模板生成 xlsx 并下载；返回截断条数供调用方提示 */
export async function exportTeacherElfXlsx(opts: {
  className?: string;
  lessonNumber: number;
  rows: TeacherElfRow[];
  /** 是否导出 D 列（文本2）。默认 false —— 只出「姓名 + 文本1」两列 */
  includeText2?: boolean;
  /** 是否继续导出 E 列（文本3）；必须同时 includeText2=true */
  includeText3?: boolean;
}): Promise<{ filename: string; truncated: number }> {
  const XLSX = await import('xlsx');
  const includeText2 = opts.includeText2 === true;
  const includeText3 = includeText2 && opts.includeText3 === true;
  const { header, data, truncated } = buildTeacherElfTable(opts.rows, includeText2, includeText3);
  const aoa: string[][] = [[TEMPLATE_NOTE], header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 90 },
    ...(includeText2 ? [{ wch: 90 }] : []),
    ...(includeText3 ? [{ wch: 90 }] : []),
  ];
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
