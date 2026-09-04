// 批量导入学员：上传「学员编码、学员名称、班级编码、班级名称」四列表格文件，自动解析、校验、按班级编码分班导入
import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, Users, AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import type { Class } from '@/types';

interface ParsedStudentRow {
  rowNumber: number;
  studentCode: string;
  studentName: string;
  classCode: string;
  className: string;
  status: 'valid' | 'error' | 'duplicate';
  message?: string;
}

interface ImportResult {
  createdClasses: string[];
  importedCount: number;
  skippedCount: number;
}

interface BulkStudentImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classes: { [key: string]: Class };
  onCreateClass: (name: string, term?: string, batchCode?: string) => string;
  onAddStudents: (classId: string, studentNames: string[]) => void;
}

const norm = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

export function BulkStudentImportDialog({
  isOpen,
  onClose,
  classes,
  onCreateClass,
  onAddStudents
}: BulkStudentImportDialogProps) {
  const [rows, setRows] = useState<ParsedStudentRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [newClassTerm, setNewClassTerm] = useState('FY27Q1');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => r.status === 'valid');
  const errorRows = rows.filter(r => r.status === 'error' || r.status === 'duplicate');

  const reset = () => {
    setRows([]);
    setFileName('');
    setResult(null);
  };

  // 根据表头匹配四列索引；无表头时按 0-3 列顺序
  const matchColumns = (headerRow: string[] | undefined): { code: number; name: number; classCode: number; className: number } => {
    if (headerRow) {
      const h = headerRow.map(c => norm(c).replace(/\s/g, ''));
      const findIdx = (pred: (s: string) => boolean) => h.findIndex(pred);
      const codeIdx = findIdx(s => s === '学员编码' || (s.includes('编码') && s.includes('学员')));
      const nameIdx = findIdx(s => s === '学员名称' || s === '姓名' || (s.includes('名称') && s.includes('学员')));
      const classCodeIdx = findIdx(s => s === '班级编码' || (s.includes('编码') && s.includes('班级')));
      const classNameIdx = findIdx(s => s === '班级名称' || (s.includes('名称') && s.includes('班级') && !s.includes('编码')));
      if (nameIdx >= 0 && classCodeIdx >= 0) {
        return { code: codeIdx, name: nameIdx, classCode: classCodeIdx, className: classNameIdx };
      }
    }
    return { code: 0, name: 1, classCode: 2, className: 3 };
  };

  const parseWorkbook = (data: Uint8Array | string, isString: boolean) => {
    const workbook = isString ? XLSX.read(data as string, { type: 'string' }) : XLSX.read(data as Uint8Array, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    if (grid.length === 0) throw new Error('表格内容为空');

    const hasHeader = norm(grid[0]?.[0]).includes('编码') || norm(grid[0]?.[0]).includes('名称') || norm(grid[0]?.[1]).includes('名称');
    const colIdx = matchColumns(hasHeader ? grid[0] as string[] : undefined);
    const dataRows = (hasHeader ? grid.slice(1) : grid) as unknown[][];

    const seenCodes = new Set<string>();
    const parsed: ParsedStudentRow[] = [];
    dataRows.forEach((row, i) => {
      const rowNumber = i + (hasHeader ? 2 : 1);
      const studentCode = norm(row[colIdx.code]);
      const studentName = norm(row[colIdx.name]);
      const classCode = norm(row[colIdx.classCode]);
      const className = norm(row[colIdx.className]) || classCode;
      const allEmpty = !studentCode && !studentName && !classCode;
      if (allEmpty) return; // 空行静默跳过

      if (!studentName) {
        parsed.push({ rowNumber, studentCode, studentName, classCode, className, status: 'error', message: '学员名称为空' });
        return;
      }
      if (!classCode) {
        parsed.push({ rowNumber, studentCode, studentName, classCode, className, status: 'error', message: '班级编码为空' });
        return;
      }
      if (!studentCode) {
        parsed.push({ rowNumber, studentCode, studentName, classCode, className, status: 'error', message: '学员编码为空' });
        return;
      }
      if (seenCodes.has(studentCode)) {
        parsed.push({ rowNumber, studentCode, studentName, classCode, className, status: 'duplicate', message: `学员编码 ${studentCode} 重复出现` });
        return;
      }
      seenCodes.add(studentCode);
      parsed.push({ rowNumber, studentCode, studentName, classCode, className, status: 'valid' });
    });
    return parsed;
  };

  const handleFile = (file: File) => {
    setParsing(true);
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result;
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        const parsed = parseWorkbook(
          isCsv ? String(raw) : new Uint8Array(raw as ArrayBuffer),
          isCsv
        );
        setRows(parsed);
        if (parsed.length === 0) toast.warning('未解析到有效数据行');
        else toast.success(`解析完成：共 ${parsed.length} 行数据`);
      } catch (err) {
        toast.error('文件解析失败：' + (err instanceof Error ? err.message : err));
        setRows([]);
      } finally {
        setParsing(false);
      }
    };
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const createdClasses: string[] = [];
      // 按班级编码分组导入
      const groups = new Map<string, { className: string; students: string[] }>();
      validRows.forEach(r => {
        const g = groups.get(r.classCode) || { className: r.className, students: [] };
        if (!g.students.includes(r.studentName)) g.students.push(r.studentName);
        groups.set(r.classCode, g);
      });

      let importedCount = 0;
      groups.forEach((g, classCode) => {
        const existing = Object.values(classes).find(c => c.batchCode === classCode);
        let classId: string;
        if (existing) {
          classId = existing.id;
        } else {
          classId = onCreateClass(g.className || classCode, newClassTerm, classCode);
          createdClasses.push(`${g.className || classCode}（${classCode}）`);
        }
        onAddStudents(classId, g.students);
        importedCount += g.students.length;
      });

      const res: ImportResult = { createdClasses, importedCount, skippedCount: errorRows.length };
      setResult(res);
      toast.success(`导入完成：${importedCount} 名学员，新建 ${createdClasses.length} 个班级`);
    } catch (err) {
      toast.error('导入失败：' + (err instanceof Error ? err.message : err));
    } finally {
      setImporting(false);
    }
  };

  // 下载四列模板
  const handleDownloadTemplate = () => {
    const template = [
      ['学员编码', '学员名称', '班级编码', '班级名称'],
      ['S0001', '张三', 'TG3ZY078', '初三双语班'],
      ['S0002', '李四', 'TG3ZY078', '初三双语班'],
      ['S0003', '王五', 'TG2ZY132', '初二C2S双语班'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学员名单');
    XLSX.writeFile(wb, '批量导入学员模板.xlsx');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[color:var(--brand)]" />
            批量导入学员
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 格式说明 */}
          <div className="p-3 rounded-xl bg-[rgb(var(--brand-rgb)/0.06)] border border-[rgb(var(--brand-rgb)/0.15)] text-sm text-slate-600 space-y-1.5">
            <p className="font-medium text-[color:var(--brand)]">表格格式要求（四列）</p>
            <p>第 1 列：学员编码（必填，不可重复） · 第 2 列：学员名称（必填）</p>
            <p>第 3 列：班级编码（必填，相同编码自动归入同班） · 第 4 列：班级名称（选填）</p>
          </div>

          {/* 上传区 */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2 ios-button" disabled={parsing}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {parsing ? '解析中...' : '上传表格文件'}
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2 rounded-xl">
              <Download className="w-4 h-4" />下载模板
            </Button>
            {fileName && <Badge variant="secondary" className="gap-1"><FileSpreadsheet className="w-3 h-3" />{fileName}</Badge>}
          </div>

          {/* 新班级默认学期 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">新班级默认学期：</span>
            <Input value={newClassTerm} onChange={(e) => setNewClassTerm(e.target.value)} className="w-32 h-8" placeholder="如 FY27Q1" />
            <span className="text-xs text-slate-400">已有班级（按班级编码匹配）不受影响</span>
          </div>

          {/* 解析结果 */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />有效 {validRows.length} 行</Badge>
                  {errorRows.length > 0 && (
                    <Badge className="bg-rose-100 text-rose-700 border-0"><AlertCircle className="w-3 h-3 mr-1" />异常 {errorRows.length} 行</Badge>
                  )}
                </div>
                <Button onClick={reset} variant="ghost" size="sm" className="h-7 text-slate-400">重新上传</Button>
              </div>
              <ScrollArea className="h-56 border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">行号</th>
                      <th className="px-3 py-2 text-left font-medium">学员编码</th>
                      <th className="px-3 py-2 text-left font-medium">学员名称</th>
                      <th className="px-3 py-2 text-left font-medium">班级编码</th>
                      <th className="px-3 py-2 text-left font-medium">班级名称</th>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.rowNumber} className={`border-t ${r.status === 'valid' ? '' : 'bg-rose-50/60'}`}>
                        <td className="px-3 py-1.5 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.studentCode || '-'}</td>
                        <td className="px-3 py-1.5">{r.studentName || <span className="text-rose-400">空</span>}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.classCode || <span className="text-rose-400">空</span>}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.className || '-'}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'valid' ? (
                            <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />待导入</span>
                          ) : (
                            <span className="text-rose-600 flex items-center gap-1" title={r.message}><AlertCircle className="w-3.5 h-3.5" />{r.message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* 导入结果 */}
          {result && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 space-y-1">
              <p className="font-semibold">✅ 导入完成：共导入 {result.importedCount} 名学员</p>
              {result.createdClasses.length > 0 && <p>新建班级：{result.createdClasses.join('、')}</p>}
              {result.skippedCount > 0 && <p className="text-amber-600">跳过异常行 {result.skippedCount} 行，可修正后重新上传</p>}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleImport} className="flex-1 gap-2 ios-button" disabled={validRows.length === 0 || importing}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              导入 {validRows.length} 名学员
            </Button>
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>关闭</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
