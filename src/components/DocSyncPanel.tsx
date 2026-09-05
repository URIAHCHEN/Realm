import { useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet, FileText, ClipboardCopy, ClipboardPaste, Table2,
  CloudCog, Timer, HardDriveDownload, GitCompareArrows, Loader2, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { buildMarkdown, buildTSV, parseClipboardTable, type ParsedRow } from '@/lib/docSync';
import type { LessonConfig, StudentRecord, QuestionType } from '@/types';
import type { useDisplaySettings } from '@/hooks/useDisplaySettings';

type Display = ReturnType<typeof useDisplaySettings>;

interface DocSyncPanelProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  className?: string;
  getNickname: (name: string) => string;
  display: Display;
  classes: { id: string; name: string }[];
  currentClassId: string | null;
  getQuestionTypes: (classId: string, lessonNumber: number) => QuestionType[];
  knownLessons: number[];
  onImportRows: (rows: ParsedRow[], target: { classId: string; lessonNumber: number }) => void;
  onCreateQuestionTypes: (target: { classId: string; lessonNumber: number }, columns: { name: string; suggestedFullScore: number }[]) => void;
  onExportExcel: () => void;
}

export function DocSyncPanel({
  records, lessonConfig, lessonNumber, className, getNickname, display, classes, currentClassId, getQuestionTypes, knownLessons, onImportRows, onCreateQuestionTypes, onExportExcel,
}: DocSyncPanelProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [unmatched, setUnmatched] = useState<{ name: string; suggestedFullScore: number }[]>([]);
  const [targetClass, setTargetClass] = useState<string>(currentClassId || classes[0]?.id || '');
  const [targetLesson, setTargetLesson] = useState<number>(lessonNumber);

  const handleCopyTSV = async () => {
    if (records.length === 0) { toast.error('当前课次还没有数据'); return; }
    const tsv = buildTSV(records, lessonConfig.questionTypes, getNickname);
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success(`已复制 ${records.length} 名学生的学情表，去腾讯文档/金山文档表格里 Ctrl+V 即可成表`);
    } catch {
      toast.error('复制失败，请重试');
    }
  };

  const handleCopyMarkdown = async () => {
    if (records.length === 0) { toast.error('当前课次还没有数据'); return; }
    const md = buildMarkdown(records, lessonConfig.questionTypes, getNickname);
    try {
      await navigator.clipboard.writeText(md);
      toast.success('Markdown 表格已复制，可粘贴到腾讯文档/金山文档的智能文档中');
    } catch {
      toast.error('复制失败，请重试');
    }
  };

  const handleParse = () => {
    if (!targetClass) { toast.error('请选择导入的目标班级'); return; }
    if (!pasteText.trim()) { toast.error('请先粘贴从在线表格复制的内容（含表头）'); return; }
    setParsing(true);
    try {
      const qts = getQuestionTypes(targetClass, targetLesson);
      const result = parseClipboardTable(pasteText, qts);
      setUnmatched(result.unmatchedColumns || []);
      if (result.rows.length === 0) {
        toast.error(result.errors[0] || '未解析到有效数据行');
      } else {
        const clsName = classes.find(c => c.id === targetClass)?.name || '目标班级';
        onImportRows(result.rows, { classId: targetClass, lessonNumber: targetLesson });
        const errNote = result.errors.length > 0 ? `，${result.errors.length} 条提示` : '';
        toast.success(`已导入 ${result.rows.length} 行到「${clsName} · 第${targetLesson}课」（匹配列：${result.matchedColumns.join('、')}${errNote}）`);
        setPasteText('');
        result.errors.slice(0, 5).forEach(e => toast.warning(e));
      }
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* 推送到在线文档 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[#1c1c1e]">
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            推送到腾讯文档 / 金山文档
            <Badge variant="secondary" className="rounded-full">第{lessonNumber}课</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-[rgb(var(--brand-rgb)/0.06)] p-4 text-sm text-[#3a3a3c] space-y-1.5">
            <p className="font-medium">使用方式（约 30 秒成表）：</p>
            <p>1️⃣ 点下方按钮复制学情表 → 2️⃣ 打开腾讯文档/金山文档新建在线表格 → 3️⃣ Ctrl+V 粘贴，行列自动对齐 → 4️⃣ 分享公示链接</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="ios-button gap-2" onClick={handleCopyTSV}>
              <ClipboardCopy className="w-4 h-4" />
              复制表格（粘贴到在线表格）
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={handleCopyMarkdown}>
              <FileText className="w-4 h-4" />
              复制 Markdown（智能文档）
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={onExportExcel}>
              <Table2 className="w-4 h-4" />
              下载 Excel 文件
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 从在线表格回导 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[#1c1c1e]">
            <ClipboardPaste className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            从在线表格导入（双向回环）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#8e8e93]">
            在腾讯文档/金山文档中选中含表头的数据区复制，粘贴到下面，系统按列名自动匹配（姓名/成长轨迹/课次/考勤/作业/课后任务/{lessonConfig.questionTypes.map(qt => qt.name).join('/')}）；不在名单的学生会自动补录到目标班级。
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[color:var(--ink-4)]">目标班级</Label>
              <Select value={targetClass} onValueChange={setTargetClass}>
                <SelectTrigger className="w-44 h-9 text-sm ios-input"><SelectValue placeholder="选择班级" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[color:var(--ink-4)]">目标课次</Label>
              <Select value={String(targetLesson)} onValueChange={(v) => setTargetLesson(Number(v))}>
                <SelectTrigger className="w-24 h-9 text-sm ios-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([...(knownLessons || []), targetLesson, 1].filter(Boolean))).sort((a, b) => a - b).map(n => (
                    <SelectItem key={n} value={String(n)}>第{n}课</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            placeholder={'姓名\t成长轨迹\t课次\t考勤\t语法\t完形填空\t…\n陈志佳\t暑,秋\t1\t准时👍\t15\t8\t…'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[120px] font-mono text-xs ios-input"
          />
          <Button className="ios-button gap-2" disabled={parsing} onClick={handleParse}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
            解析并导入到「{classes.find(c => c.id === targetClass)?.name || '班级'} · 第{targetLesson}课」
          </Button>
          {unmatched.length > 0 && (
            <div className="rounded-[var(--r-md)] bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800">
                检测到 <b>{unmatched.length}</b> 个未匹配分数列：{unmatched.map(c => c.name).join('、')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => {
                    onCreateQuestionTypes({ classId: targetClass, lessonNumber: targetLesson }, unmatched);
                    toast.success(`已补建 ${unmatched.length} 个题型，请再点一次“解析并导入”写入这些列`);
                    setUnmatched([]);
                  }}
                >
                  <Plus className="w-4 h-4" />一键补建为题型
                </Button>
                <span className="text-xs text-amber-700">补建后再点“解析并导入”即可写入这些列的分值</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 同步机制说明 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[#1c1c1e]">
            <CloudCog className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            同步机制与冲突策略
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#3a3a3c]">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-[#f2f2f7] p-4">
              <p className="font-semibold flex items-center gap-1.5 mb-1.5"><CloudCog className="w-4 h-4" />实时双向（主通道）</p>
              <p className="text-[#8e8e93] text-xs leading-relaxed">Supabase 云端实时同步：多设备数据自动对账，冲突时明确提示二选一，绝不静默覆盖。</p>
            </div>
            <div className="rounded-xl bg-[#f2f2f7] p-4">
              <p className="font-semibold flex items-center gap-1.5 mb-1.5"><FileSpreadsheet className="w-4 h-4" />在线文档（快照通道）</p>
              <p className="text-[#8e8e93] text-xs leading-relaxed">腾讯/金山文档按上表方式推送快照、回贴导入更新，适合公示与协作场景。</p>
            </div>
            <div className="rounded-xl bg-[#f2f2f7] p-4">
              <p className="font-semibold flex items-center gap-1.5 mb-1.5"><HardDriveDownload className="w-4 h-4" />离线缓存</p>
              <p className="text-[#8e8e93] text-xs leading-relaxed">所有数据本地常驻（localStorage），断网可正常录入，恢复联网后自动补传云端。</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[rgb(var(--brand-rgb)/0.06)] px-4 py-3">
            <div>
              <p className="font-medium flex items-center gap-1.5"><Timer className="w-4 h-4" />自动同步频率</p>
              <p className="text-xs text-[#8e8e93]">数据变化后延迟该时长自动上传云端</p>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(display.settings.syncIntervalSec)}
                onValueChange={(v) => display.update({ syncIntervalSec: parseInt(v) })}
              >
                <SelectTrigger className="w-28 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 秒（即时）</SelectItem>
                  <SelectItem value="3">3 秒（默认）</SelectItem>
                  <SelectItem value="10">10 秒</SelectItem>
                  <SelectItem value="30">30 秒</SelectItem>
                  <SelectItem value="60">1 分钟</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  id="autosync"
                  checked={!!display.settings.syncIntervalSec}
                  onCheckedChange={(v) => display.update({ syncIntervalSec: v ? 3 : 0 })}
                />
                <Label htmlFor="autosync" className="text-xs text-[#8e8e93]">启用</Label>
              </div>
            </div>
          </div>
          <p className="text-xs text-[#8e8e93] flex items-start gap-1.5">
            <GitCompareArrows className="w-4 h-4 mt-0.5 flex-shrink-0" />
            冲突处理优先级：本地未推送改动 + 云端有更新 → 提示手动选择；仅一端有改动 → 自动同步该端。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
