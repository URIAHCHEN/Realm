import { useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet, FileText, ClipboardCopy, ClipboardPaste, Table2,
  CloudCog, Timer, HardDriveDownload, GitCompareArrows, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { buildMarkdown, buildTSV, parseClipboardTable, type ParsedRow } from '@/lib/docSync';
import type { LessonConfig, StudentRecord } from '@/types';
import type { useDisplaySettings } from '@/hooks/useDisplaySettings';

type Display = ReturnType<typeof useDisplaySettings>;

interface DocSyncPanelProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  className?: string;
  getNickname: (name: string) => string;
  display: Display;
  onImportRows: (rows: ParsedRow[]) => void;
  onExportExcel: () => void;
}

export function DocSyncPanel({
  records, lessonConfig, lessonNumber, className, getNickname, display, onImportRows, onExportExcel,
}: DocSyncPanelProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);

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
    if (!pasteText.trim()) { toast.error('请先粘贴从在线表格复制的内容（含表头）'); return; }
    setParsing(true);
    try {
      const result = parseClipboardTable(pasteText, lessonConfig.questionTypes);
      if (result.rows.length === 0) {
        toast.error(result.errors[0] || '未解析到有效数据行');
      } else {
        onImportRows(result.rows);
        const errNote = result.errors.length > 0 ? `，${result.errors.length} 条提示` : '';
        toast.success(`解析成功 ${result.rows.length} 行（匹配列：${result.matchedColumns.join('、')}${errNote}）`);
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
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            推送到腾讯文档 / 金山文档
            <Badge variant="secondary" className="rounded-full">第{lessonNumber}课</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-[rgb(var(--accent-rgb)/0.06)] p-4 text-sm text-[#3a3a3c] space-y-1.5">
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
            <ClipboardPaste className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            从在线表格导入（双向回环）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#8e8e93]">
            在腾讯文档/金山文档中选中含表头的数据区复制，粘贴到下面，系统按列名自动匹配（姓名/考勤/作业/课后任务/{lessonConfig.questionTypes.map(qt => qt.name).join('/')}），同名学生数据会被更新。
          </p>
          <Textarea
            placeholder={'排名\t姓名\t考勤\t书面作业\t单词默写\t…\n1\t张三\t按时出勤\t超赞完成\t95\t…'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[120px] font-mono text-xs ios-input"
          />
          <Button className="ios-button gap-2" disabled={parsing} onClick={handleParse}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
            解析并导入到第{lessonNumber}课
          </Button>
        </CardContent>
      </Card>

      {/* 同步机制说明 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[#1c1c1e]">
            <CloudCog className="w-5 h-5" style={{ color: 'var(--accent)' }} />
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
          <div className="flex items-center justify-between rounded-xl bg-[rgb(var(--accent-rgb)/0.06)] px-4 py-3">
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
