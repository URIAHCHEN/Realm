// 班群表彰模板编辑器 + 实时预览（并入「表扬榜」tab）
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trophy, Plus, Trash2, Pencil, Eye, Variable } from 'lucide-react';
import type { LessonConfig, PraiseTemplate } from '@/types';

interface PraiseTemplateEditorProps {
  lessonConfig: LessonConfig;
  lessonNumber: number;
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
}

const PREVIEW_CONTENT = '🏆【入门测风云榜】\n🥇 小明：95分（正确率95%）\n🥈 小红：92分（正确率92%）\n\n📚【作业超赞】\n小刚、小丽';

export function PraiseTemplateEditor({ lessonConfig, lessonNumber, onSaveLessonConfig }: PraiseTemplateEditorProps) {
  const [activeTemplateId, setActiveTemplateId] = useState<string>('default');
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  const praiseTemplates = lessonConfig.praiseTemplates || [];
  const activeCustom = praiseTemplates.find(t => t.id === activeTemplateId);
  const activeTemplateText = activeCustom ? activeCustom.template : lessonConfig.praiseTemplate;

  const save = (patch: Partial<LessonConfig>) => onSaveLessonConfig(lessonNumber, patch);

  const updateTemplateText = (text: string) => {
    if (activeCustom) {
      save({ praiseTemplates: praiseTemplates.map(t => (t.id === activeCustom.id ? { ...t, template: text } : t)) });
    } else {
      save({ praiseTemplate: text });
    }
  };

  const handleAdd = () => {
    const newT: PraiseTemplate = {
      id: 'pt_' + Date.now(),
      name: `模板${praiseTemplates.length + 1}`,
      template: lessonConfig.praiseTemplate || '🏆 第【课次】课【表彰类型】表扬榜\n\n【表彰内容】\n\n恭喜以上同学！继续加油！💪',
    };
    save({ praiseTemplates: [...praiseTemplates, newT] });
    setActiveTemplateId(newT.id);
  };

  const handleDelete = (id: string) => {
    save({ praiseTemplates: praiseTemplates.filter(t => t.id !== id) });
    if (activeTemplateId === id) setActiveTemplateId('default');
  };

  const handleRename = (id: string) => {
    save({ praiseTemplates: praiseTemplates.map(t => (t.id === id ? { ...t, name: renameValue.trim() || t.name } : t)) });
    setRenamingTemplateId(null);
  };

  const preview = (activeTemplateText || '')
    .replace(/【课次】/g, String(lessonNumber))
    .replace(/【表彰类型】/g, '综合')
    .replace(/【表彰内容】/g, PREVIEW_CONTENT);

  return (
    <Card className="ios-glass-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-2 text-[color:var(--ink-2)]">
          <span className="flex items-center gap-2">
            <Trophy className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            班群表彰模板 · 第{lessonNumber}课
          </span>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[color:var(--brand)] border-[rgb(var(--brand-rgb)/0.25)]" onClick={handleAdd}>
            <Plus className="w-3.5 h-3.5" />新增模板
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[color:var(--ink-4)]">支持多套模板切换（日常表彰 / 阶段测表彰等）；修改即时保存，右侧实时预览。</p>

        {/* 模板列表 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTemplateId('default')}
            className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
              activeTemplateId === 'default'
                ? 'bg-[rgb(var(--brand-rgb)/0.15)] border-[rgb(var(--brand-rgb)/0.4)] text-[color:var(--brand)] font-medium'
                : 'bg-white/70 border-[rgb(var(--brand-rgb)/0.15)] text-slate-600 hover:border-[rgb(var(--brand-rgb)/0.25)]'
            }`}
          >默认模板</button>
          {praiseTemplates.map(t => (
            <div key={t.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border transition-all ${
              activeTemplateId === t.id
                ? 'bg-[rgb(var(--brand-rgb)/0.15)] border-[rgb(var(--brand-rgb)/0.4)] text-[color:var(--brand)] font-medium'
                : 'bg-white/70 border-[rgb(var(--brand-rgb)/0.15)] text-slate-600'
            }`}>
              {renamingTemplateId === t.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(t.id)}
                  className="h-6 w-24 text-sm px-1"
                />
              ) : (
                <>
                  <button onClick={() => setActiveTemplateId(t.id)}>{t.name}</button>
                  <button onClick={() => { setRenamingTemplateId(t.id); setRenameValue(t.name); }} aria-label="重命名模板" title="重命名" className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-[color:var(--brand)]">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} aria-label="删除模板" title="删除" className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-rose-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 编辑 + 预览 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <Textarea
              value={activeTemplateText}
              onChange={(e) => updateTemplateText(e.target.value)}
              className="min-h-[200px] text-sm ios-input"
              placeholder="编辑表彰模板…"
            />
            <div className="flex items-center gap-2 mt-2 text-xs text-[color:var(--ink-4)]">
              <Variable className="w-3.5 h-3.5" />
              专用变量：【课次】【表彰类型】【表彰内容】生成时自动填充
            </div>
          </div>
          <div className="rounded-xl border border-[rgb(var(--brand-rgb)/0.15)] bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.10)] p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[color:var(--brand)] flex items-center gap-1.5">
                <Eye className="w-4 h-4" />实时预览（示例数据）
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? '收起' : '展开'}
              </Button>
            </div>
            {showPreview && (
              <pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap font-sans flex-1 overflow-auto max-h-[260px]">{preview || '（模板内容为空）'}</pre>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
