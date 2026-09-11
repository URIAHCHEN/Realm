import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Settings, GripVertical, ChevronUp, ChevronDown, Variable, Pencil, Eye } from 'lucide-react';
import type { QuestionType, LessonConfig, AppConfig, PraiseTemplate } from '@/types';
import { inferCategory } from '@/lib/weakPoints';
import { DEFAULT_CLASS_PERFORMANCE_OPTIONS } from '@/hooks/useClassData';

/** 默认选项可编辑列表（新增/删除），用于「默认配置」页 */
function DefaultOptionList({ title, desc, options, onChange }: {
  title: string; desc?: string; options: string[]; onChange: (v: string[]) => void;
}) {
  const [val, setVal] = useState('');
  const add = () => {
    const t = val.trim();
    if (!t || options.includes(t)) return;
    onChange([...options, t]);
    setVal('');
  };
  return (
    <div>
      <Label className="text-base font-medium text-[color:var(--brand)]">{title}</Label>
      {desc && <p className="text-xs text-slate-400 mt-1">{desc}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {options.map((o, i) => (
          <span key={o} className="inline-flex items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-xl border border-[rgb(var(--brand-rgb)/0.15)] text-sm">
            {o}
            <button onClick={() => onChange(options.filter((_, idx) => idx !== i))} aria-label="删除默认选项" className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
          </span>
        ))}
        {options.length === 0 && <span className="text-xs text-slate-400">暂无选项</span>}
      </div>
      <div className="flex gap-2 mt-2">
        <Input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="新增选项，回车添加" className="h-9 text-sm liquid-glass-input" />
        <Button variant="outline" onClick={add} className="h-9 liquid-glass-button"><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

interface ConfigPanelProps {
  appConfig: AppConfig;
  lessonConfig: LessonConfig;
  lessonNumber: number;
  onSaveAppConfig: (config: AppConfig) => void;
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
}

// 固定列默认标题
const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  seasons: '学习轨迹',
  attendance: '考勤',
  classPerformance: '课堂表现',
  homework: '书面作业',
  listening: '课后任务',
  note: '备注',
  pass: '是否过关',
};

// 可自定义标题的列定义（随学情表新增列在此同步）
const COLUMN_DEFS: { key: 'seasons' | 'attendance' | 'classPerformance' | 'homework' | 'listening' | 'note' | 'pass'; label: string }[] = [
  { key: 'seasons', label: '学习轨迹列' },
  { key: 'attendance', label: '考勤列' },
  { key: 'classPerformance', label: '课堂表现列' },
  { key: 'homework', label: '书面作业列' },
  { key: 'listening', label: '课后任务列' },
  { key: 'note', label: '备注列' },
  { key: 'pass', label: '是否过关列' },
];

// 选项组 → 课次配置键
const OPTIONS_KEY = {
  attendance: 'attendanceOptions',
  classPerformance: 'classPerformanceOptions',
  homework: 'homeworkOptions',
  listening: 'listeningOptions',
} as const;
type OptGroup = keyof typeof OPTIONS_KEY;

// 选项颜色预设
const COLOR_PRESETS = ['#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#0ea5e9', '#8b5cf6', '#64748b'];

/** 选项 chip：名称 + 颜色标记（点击圆点取色，✕ 清除颜色） + 删除 */
function OptionChip({ label, color, onColor, onRemove }: {
  label: string; color?: string; onColor: (c?: string) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-xl border border-[rgb(var(--brand-rgb)/0.15)]">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(v => !v)} aria-label="设置选项颜色"
        title="设置颜色标记（学情表中该选项单元格自动标色）"
        className="w-4 h-4 rounded-full border shrink-0"
        style={{ background: color || 'transparent', borderColor: color || '#cbd5e1' }}
      />
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-8 z-40 flex gap-1 p-1.5 rounded-xl border border-[rgb(var(--brand-rgb)/0.15)] bg-white shadow-lg">
            {COLOR_PRESETS.map(c => (
              <button key={c} type="button" title={c}
                onClick={() => { onColor(c); setOpen(false); }}
                className="w-5 h-5 rounded-full border border-white shadow-inner" style={{ background: c }} />
            ))}
            <button type="button" title="清除颜色"
              onClick={() => { onColor(undefined); setOpen(false); }}
              className="w-5 h-5 rounded-full border border-slate-200 text-[10px] text-slate-400 flex items-center justify-center">✕</button>
          </span>
        </>
      )}
      <button aria-label="删除选项" onClick={onRemove} className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-rose-500">
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
  );
}

// 可用变量列表
const availableVariables = [  { key: '【学生昵称】', desc: '学生昵称（自定义）' },
  { key: '【学生短昵称】', desc: '学生短昵称（三字取后两字，两字取叠词）' },
  { key: '【课次】', desc: '当前课次' },
  { key: '【考勤】', desc: '考勤状态' },
  { key: '【课堂表现】', desc: '课堂表现选项' },
  { key: '【作业】', desc: '作业状态' },
  { key: '【课后任务】', desc: '课后任务状态' },
  { key: '【成绩详情】', desc: '各题型成绩详情' },
  { key: '【总分】', desc: '入门测总分' },
  { key: '【满分】', desc: '入门测满分' },
  { key: '【排名】', desc: '班级排名' },
  { key: '【正确率】', desc: '正确率百分比' },
  { key: '【薄弱项】', desc: '薄弱题型' },
  { key: '【作业内容】', desc: '作业内容' },
];

export function ConfigPanel({
  appConfig,
  lessonConfig,
  lessonNumber,
  onSaveAppConfig,
  onSaveLessonConfig
}: ConfigPanelProps) {
  const [localAppConfig, setLocalAppConfig] = useState<AppConfig>(appConfig);
  const [localLessonConfig, setLocalLessonConfig] = useState<LessonConfig>(lessonConfig);
  const [newOption, setNewOption] = useState('');
  const [newOptionType, setNewOptionType] = useState<OptGroup>('attendance');
  const [newQuestionType, setNewQuestionType] = useState({ name: '', fullScore: 100 });
  // 表彰模板多模板管理：'default' 表示默认模板，其余为 praiseTemplates 中的 id
  const [activeTemplateId, setActiveTemplateId] = useState<string>('default');
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showPraisePreview, setShowPraisePreview] = useState(false);
  
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const praiseTextareaRef = useRef<HTMLTextAreaElement>(null);
  const defaultFeedbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const defaultPraiseTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalAppConfig(appConfig);
  }, [appConfig]);

  useEffect(() => {
    setLocalLessonConfig(lessonConfig);
  }, [lessonConfig]);

  // 插入变量到文本框
  const insertVariable = (textareaRef: React.RefObject<HTMLTextAreaElement | null>, variable: string, isLessonConfig: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const newValue = value.substring(0, start) + variable + value.substring(end);
    
    if (isLessonConfig) {
      if (textareaRef === feedbackTextareaRef) {
        setLocalLessonConfig(prev => ({ ...prev, feedbackTemplate: newValue }));
      } else {
        setLocalLessonConfig(prev => ({ ...prev, praiseTemplate: newValue }));
      }
    } else {
      if (textareaRef === defaultFeedbackTextareaRef) {
        setLocalAppConfig(prev => ({ ...prev, defaultFeedbackTemplate: newValue }));
      } else {
        setLocalAppConfig(prev => ({ ...prev, defaultPraiseTemplate: newValue }));
      }
    }

    // 恢复焦点并设置光标位置
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  // 添加选项（考勤/课堂表现/作业/课后任务通用）
  const handleAddOption = () => {
    if (!newOption.trim()) return;
    const key = OPTIONS_KEY[newOptionType];
    if ((localLessonConfig[key] || []).includes(newOption.trim())) return;
    setLocalLessonConfig(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newOption.trim()]
    }));
    setNewOption('');
  };

  // 移除选项
  const handleRemoveOption = (type: OptGroup, index: number) => {
    const key = OPTIONS_KEY[type];
    setLocalLessonConfig(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter((_, i) => i !== index)
    }));
  };

  // 选项颜色标记：group 可为 attendance/classPerformance/homework/listening 或 cf:<fieldId>
  const updateOptionColor = (group: string, option: string, color?: string) => {
    setLocalLessonConfig(prev => {
      const g = { ...(prev.optionColors?.[group] || {}) };
      if (color) g[option] = color; else delete g[option];
      return { ...prev, optionColors: { ...(prev.optionColors || {}), [group]: g } };
    });
  };
  const colorOf = (group: string, option: string) => localLessonConfig.optionColors?.[group]?.[option];

  // 添加题型
  const handleAddQuestionType = () => {
    if (!newQuestionType.name.trim()) return;

    const newQt: QuestionType = {
      id: 'qt_' + Date.now(),
      name: newQuestionType.name.trim(),
      fullScore: newQuestionType.fullScore,
      order: localLessonConfig.questionTypes.length
    };

    setLocalLessonConfig(prev => ({
      ...prev,
      questionTypes: [...prev.questionTypes, newQt]
    }));
    setNewQuestionType({ name: '', fullScore: 100 });
  };

  // —— 表彰模板多模板管理 ——
  const praiseTemplates = localLessonConfig.praiseTemplates || [];
  const activeCustom = praiseTemplates.find(t => t.id === activeTemplateId);
  const activeTemplateText = activeCustom ? activeCustom.template : localLessonConfig.praiseTemplate;

  const updateTemplateText = (text: string) => {
    if (activeCustom) {
      setLocalLessonConfig(prev => ({
        ...prev,
        praiseTemplates: (prev.praiseTemplates || []).map(t => t.id === activeCustom.id ? { ...t, template: text } : t)
      }));
    } else {
      setLocalLessonConfig(prev => ({ ...prev, praiseTemplate: text }));
    }
  };

  const handleAddPraiseTemplate = () => {
    const newT: PraiseTemplate = {
      id: 'pt_' + Date.now(),
      name: `模板${praiseTemplates.length + 1}`,
      template: localLessonConfig.praiseTemplate || '🏆 第【课次】课【表彰类型】表扬榜\n\n【表彰内容】\n\n恭喜以上同学！继续加油！💪'
    };
    setLocalLessonConfig(prev => ({ ...prev, praiseTemplates: [...(prev.praiseTemplates || []), newT] }));
    setActiveTemplateId(newT.id);
  };

  const handleDeletePraiseTemplate = (id: string) => {
    setLocalLessonConfig(prev => ({ ...prev, praiseTemplates: (prev.praiseTemplates || []).filter(t => t.id !== id) }));
    if (activeTemplateId === id) setActiveTemplateId('default');
  };

  const handleRenameTemplate = (id: string) => {
    setLocalLessonConfig(prev => ({
      ...prev,
      praiseTemplates: (prev.praiseTemplates || []).map(t => t.id === id ? { ...t, name: renameValue.trim() || t.name } : t)
    }));
    setRenamingTemplateId(null);
  };

  // 表彰模板实时预览（示例数据渲染）
  const praisePreview = activeTemplateText
    .replace(/【课次】/g, String(lessonNumber))
    .replace(/【表彰类型】/g, '综合')
    .replace(/【表彰内容】/g, '🏆【入门测风云榜】\n🥇 小明：95分（正确率95%）\n🥈 小红：92分（正确率92%）\n\n📚【作业超赞】\n小刚、小丽');

  // 移除题型
  const handleRemoveQuestionType = (index: number) => {
    setLocalLessonConfig(prev => ({
      ...prev,
      questionTypes: prev.questionTypes.filter((_, i) => i !== index)
    }));
  };

  // 移动题型顺序
  const handleMoveQuestionType = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localLessonConfig.questionTypes.length - 1) return;
    
    const newTypes = [...localLessonConfig.questionTypes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newTypes[index], newTypes[targetIndex]] = [newTypes[targetIndex], newTypes[index]];
    
    setLocalLessonConfig(prev => ({
      ...prev,
      questionTypes: newTypes.map((qt, i) => ({ ...qt, order: i }))
    }));
  };

  // —— 自定义列 customFields 管理 ——
  const [newCustomField, setNewCustomField] = useState<{ name: string; kind: 'select' | 'number' }>({ name: '', kind: 'select' });
  const customFieldsOf = () => localLessonConfig.customFields || [];
  const handleAddCustomField = () => {
    const name = newCustomField.name.trim();
    if (!name) return;
    if (customFieldsOf().some(f => f.name === name)) return;
    const field: import('@/types').CustomField = {
      id: 'cf_' + Date.now(),
      name,
      kind: newCustomField.kind,
      order: customFieldsOf().length,
      ...(newCustomField.kind === 'select' ? { options: ['优秀', '良好', '待提升'] } : { fullScore: 100 }),
    };
    setLocalLessonConfig(prev => ({ ...prev, customFields: [...(prev.customFields || []), field] }));
    setNewCustomField({ name: '', kind: newCustomField.kind });
  };
  const updateCustomField = (index: number, patch: Partial<import('@/types').CustomField>) => {
    setLocalLessonConfig(prev => ({
      ...prev,
      customFields: (prev.customFields || []).map((f, i) => i === index ? { ...f, ...patch } : f)
    }));
  };
  const removeCustomField = (index: number) => {
    setLocalLessonConfig(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i }))
    }));
  };
  const moveCustomField = (index: number, dir: 'up' | 'down') => {
    const list = [...customFieldsOf()];
    const j = dir === 'up' ? index - 1 : index + 1;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    setLocalLessonConfig(prev => ({ ...prev, customFields: list.map((f, i) => ({ ...f, order: i })) }));
  };

  // 保存课次配置
  const handleSaveLessonConfig = () => {
    onSaveLessonConfig(lessonNumber, localLessonConfig);
  };

  // 保存应用配置
  const handleSaveAppConfig = () => {
    onSaveAppConfig(localAppConfig);
  };

  // 变量选择器组件
  const VariableSelector = ({ 
    textareaRef, 
    isLessonConfig 
  }: { 
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isLessonConfig: boolean;
  }) => (
    <div className="flex flex-wrap gap-2 mt-3 p-3 bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.12)] rounded-xl border border-[rgb(var(--brand-rgb)/0.15)]">
      <div className="w-full flex items-center gap-2 mb-2 text-sm text-[color:var(--brand)] font-medium">
        <Variable className="w-4 h-4" />
        点击插入变量：
      </div>
      {availableVariables.map((variable) => (
        <button
          key={variable.key}
          onClick={() => insertVariable(textareaRef, variable.key, isLessonConfig)}
          className="variable-tag"
          title={variable.desc}
        >
          {variable.key}
        </button>
      ))}
    </div>
  );

  return (
    <Tabs defaultValue="fields" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2 lg:w-[400px] liquid-glass">
        <TabsTrigger value="fields">本课字段</TabsTrigger>
        <TabsTrigger value="default">全局默认</TabsTrigger>
      </TabsList>

      <TabsContent value="fields" className="space-y-6">
        <Card className="liquid-glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[color:var(--brand)]">
              <Settings className="w-5 h-5" />
              第{lessonNumber}课字段配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 是否过关阈值 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">是否过关阈值</Label>
              <p className="text-xs text-slate-400 mt-1 mb-2">学员正确率达到或超过此百分比即判定为过关；学情记录表「是否过关」列将依据此阈值实时联动。</p>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={localLessonConfig.passThreshold ?? 80}
                  onChange={(e) => setLocalLessonConfig(prev => ({ ...prev, passThreshold: Math.max(0, Math.min(100, parseInt(e.target.value) || 80)) }))}
                  className="w-24 liquid-glass-input"
                />
                <span className="text-sm text-slate-600">%</span>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">≥{localLessonConfig.passThreshold ?? 80}% 标记为过关</Badge>
              </div>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 列标题自定义（自动同步当前记录表所有固定列） */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">题型配置</Label>
              <div className="space-y-2 mt-2">
                {localLessonConfig.questionTypes.map((qt, i) => (
                  <div key={qt.id} className="flex items-center gap-3 bg-white/70 p-3 rounded-xl border border-[rgb(var(--brand-rgb)/0.22)]">
                    <GripVertical className="w-4 h-4 text-[color:var(--brand)]" />
                    <Input
                      value={qt.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setLocalLessonConfig(prev => ({
                          ...prev,
                          questionTypes: prev.questionTypes.map((t, idx) =>
                            idx === i ? { ...t, name: newName } : t
                          )
                        }));
                      }}
                      placeholder="题型名称"
                      className="flex-1 h-8 text-sm font-medium liquid-glass-input"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">满分：</span>
                      <Input
                        type="number"
                        value={qt.fullScore}
                        onChange={(e) => {
                          const newScore = parseInt(e.target.value) || 0;
                          setLocalLessonConfig(prev => ({
                            ...prev,
                            questionTypes: prev.questionTypes.map((t, idx) =>
                              idx === i ? { ...t, fullScore: newScore } : t
                            )
                          }));
                        }}
                        className="w-20 h-8 text-sm liquid-glass-input"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">板块：</span>
                      <Input
                        list="qt-category-options"
                        value={qt.category || ''}
                        placeholder={inferCategory(qt)}
                        title="留空则按题型名称自动归类"
                        onChange={(e) => {
                          const cat = e.target.value;
                          setLocalLessonConfig(prev => ({
                            ...prev,
                            questionTypes: prev.questionTypes.map((t, idx) =>
                              idx === i ? { ...t, category: cat } : t
                            )
                          }));
                        }}
                        className="w-24 h-8 text-sm liquid-glass-input"
                      />
                    </div>
                    <datalist id="qt-category-options">
                      {Array.from(new Set([
                        '语法', '词汇', '阅读', '完形', '写作', '听力', '口语',
                        ...localLessonConfig.questionTypes.map(t => inferCategory(t)),
                      ])).map(c => <option key={c} value={c} />)}
                    </datalist>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMoveQuestionType(i, 'up')} aria-label="上移题型"
                        disabled={i === 0}
                        className="p-1 text-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveQuestionType(i, 'down')} aria-label="下移题型"
                        disabled={i === localLessonConfig.questionTypes.length - 1}
                        className="p-1 text-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveQuestionType(i)} aria-label="删除题型"
                        className="p-1 text-[color:var(--brand)] hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="题型名称"
                  value={newQuestionType.name}
                  onChange={(e) => setNewQuestionType(prev => ({ ...prev, name: e.target.value }))}
                  className="liquid-glass-input"
                />
                <Input
                  type="number"
                  placeholder="满分"
                  value={newQuestionType.fullScore}
                  onChange={(e) => setNewQuestionType(prev => ({ ...prev, fullScore: parseInt(e.target.value) || 100 }))}
                  className="w-24 liquid-glass-input"
                />
                <Button onClick={handleAddQuestionType} variant="outline" className="liquid-glass-button">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 自定义列 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">自定义列</Label>
              <p className="text-xs text-[color:var(--ink-4)] mt-1 mb-2">为学情表增加可自定义的列（如“作业质量”）：选项型可下拉、分数型可录入分值；配置后可在「反馈模板」里以【字段名】引用，或在反馈中自动带上。</p>
              <div className="space-y-2 mt-2">
                {(localLessonConfig.customFields || []).map((cf, i) => (
                  <div key={cf.id} className="flex flex-wrap items-center gap-2 bg-white/70 p-3 rounded-xl border border-[rgb(var(--brand-rgb)/0.22)]">
                    <GripVertical className="w-4 h-4 text-[color:var(--brand)]" />
                    <Input
                      value={cf.name}
                      onChange={(e) => updateCustomField(i, { name: e.target.value })}
                      placeholder="列名称"
                      className="flex-1 min-w-28 h-8 text-sm font-medium liquid-glass-input"
                    />
                    <Select value={cf.kind} onValueChange={(v) => updateCustomField(i, { kind: v as 'select' | 'number' })}>
                      <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="select">选项型</SelectItem>
                        <SelectItem value="number">分数型</SelectItem>
                      </SelectContent>
                    </Select>
                    {cf.kind === 'select' ? (
                      <Input
                        value={(cf.options || []).join('、')}
                        onChange={(e) => updateCustomField(i, { options: e.target.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean) })}
                        placeholder="选项，用、或逗号分隔"
                        className="flex-[2] min-w-40 h-8 text-sm liquid-glass-input"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-[color:var(--ink-4)]">满分</span>
                        <Input
                          type="number"
                          value={cf.fullScore ?? 100}
                          onChange={(e) => updateCustomField(i, { fullScore: parseFloat(e.target.value) || 0 })}
                          className="w-20 h-8 text-sm liquid-glass-input"
                        />
                      </div>
                    )}
                    {cf.kind === 'select' && (
                      <div className="w-full flex flex-wrap gap-1.5 pl-6 pt-1">
                        {(cf.options || []).map(op => (
                          <OptionChip
                            key={`${cf.id}-${op}`}
                            label={op}
                            color={colorOf(`cf:${cf.id}`, op)}
                            onColor={c => updateOptionColor(`cf:${cf.id}`, op, c)}
                            onRemove={() => updateCustomField(i, { options: (cf.options || []).filter(o => o !== op) })}
                          />
                        ))}
                      </div>
                    )}
                    {cf.kind === 'number' && (
                      <label className="flex items-center gap-1.5 text-xs text-[color:var(--ink-2)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!cf.includeInTotal}
                          onChange={(e) => updateCustomField(i, { includeInTotal: e.target.checked })}
                          className="accent-[color:var(--brand)]"
                        />
                        计入总分
                      </label>
                    )}
                    <div className="flex gap-1">
                      <button onClick={() => moveCustomField(i, 'up')} aria-label="上移自定义列" disabled={i === 0} className="p-1 text-[color:var(--brand)] disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveCustomField(i, 'down')} aria-label="下移自定义列" disabled={i === (localLessonConfig.customFields || []).length - 1} className="p-1 text-[color:var(--brand)] disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeCustomField(i)} aria-label="删除自定义列" className="p-1 text-[color:var(--ink-4)] hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="列名称，如 作业质量"
                  value={newCustomField.name}
                  onChange={(e) => setNewCustomField(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 liquid-glass-input"
                />
                <Select value={newCustomField.kind} onValueChange={(v) => setNewCustomField(prev => ({ ...prev, kind: v as 'select' | 'number' }))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="select">选项型</SelectItem>
                    <SelectItem value="number">分数型</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleAddCustomField} variant="outline" className="liquid-glass-button"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 列标题自定义（支持新增 / 编辑 / 清除） */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium text-[color:var(--brand)]">列标题自定义</Label>
                <span className="text-xs text-slate-400">已配置 {Object.entries(localLessonConfig.columnLabels || {}).filter(([, v]) => v && v.trim()).length} 项</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 mb-2">修改已有列的显示名称，或为尚未命名的列新增自定义标题；清空输入即恢复默认名称，保存后学情记录表表头实时同步。</p>

              {/* 已配置标题列表（可编辑 / 可清除） */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {COLUMN_DEFS.map(({ key, label }) => {
                  const val = localLessonConfig.columnLabels?.[key] || '';
                  return (
                    <div key={key} className={`p-2.5 rounded-xl border ${val && val.trim() ? 'bg-[rgb(var(--brand-rgb)/0.08)] border-[rgb(var(--brand-rgb)/0.25)]' : 'bg-white/70 border-[rgb(var(--brand-rgb)/0.15)]'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-500">{label}</label>
                        {val && val.trim() && (
                          <button
                            onClick={() => setLocalLessonConfig(prev => {
                              const next = { ...(prev.columnLabels || {}) };
                              delete next[key as keyof typeof next];
                              return { ...prev, columnLabels: next };
                            })}
                            className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-rose-500 text-xs"
                            title="清除自定义，恢复默认"
                          >✕</button>
                        )}
                      </div>
                      <Input
                        value={val}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLocalLessonConfig(prev => ({
                            ...prev,
                            columnLabels: { ...(prev.columnLabels || {}), [key]: v }
                          }));
                        }}
                        placeholder={DEFAULT_COLUMN_LABELS[key]}
                        className="h-8 text-sm liquid-glass-input"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 选项组（考勤/课堂表现/作业/课后任务）：支持颜色标记 */}
            {([
              { type: 'attendance' as OptGroup, label: '考勤选项', hint: '点击色点可为选项设置颜色，学情表单元格将自动标色' },
              { type: 'classPerformance' as OptGroup, label: '课堂表现选项', hint: '课堂表现为固定列（层级同考勤）；导出公示图片时不包含该列' },
              { type: 'homework' as OptGroup, label: '作业选项', hint: '' },
              { type: 'listening' as OptGroup, label: '课后任务选项', hint: '' },
            ]).map(({ type, label, hint }) => (
              <div key={type}>
                <Label className="text-base font-medium text-[color:var(--brand)]">{label}</Label>
                {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(localLessonConfig[OPTIONS_KEY[type]] || []).map((opt, i) => (
                    <OptionChip
                      key={`${type}-${opt}-${i}`}
                      label={opt}
                      color={colorOf(type, opt)}
                      onColor={c => updateOptionColor(type, opt, c)}
                      onRemove={() => handleRemoveOption(type, i)}
                    />
                  ))}
                  {(localLessonConfig[OPTIONS_KEY[type]] || []).length === 0 && (
                    <span className="text-xs text-slate-400">暂无选项，可在下方添加</span>
                  )}
                </div>
              </div>
            ))}

            {/* 添加新选项 */}
            <div className="flex gap-2">
              <select
                value={newOptionType}
                onChange={(e) => setNewOptionType(e.target.value as OptGroup)}
                className="px-3 py-2 border rounded-xl text-sm liquid-glass-input"
              >
                <option value="attendance">考勤</option>
                <option value="classPerformance">课堂表现</option>
                <option value="homework">作业</option>
                <option value="listening">课后任务</option>
              </select>
              <Input
                placeholder="新选项名称"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
                className="liquid-glass-input"
              />
              <Button onClick={handleAddOption} variant="outline" className="liquid-glass-button">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 反馈模板 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">私发反馈模板</Label>
              <Textarea
                ref={feedbackTextareaRef}
                value={localLessonConfig.feedbackTemplate}
                onChange={(e) => setLocalLessonConfig(prev => ({ ...prev, feedbackTemplate: e.target.value }))}
                className="min-h-[200px] text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={feedbackTextareaRef}
                isLessonConfig={true}
              />
              {(localLessonConfig.customFields || []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-[color:var(--ink-4)]">自定义列参数：</span>
                  {(localLessonConfig.customFields || []).map(cf => (
                    <button
                      key={cf.id}
                      type="button"
                      onClick={() => insertVariable(feedbackTextareaRef, `【${cf.name}】`, true)}
                      className="px-2 py-0.5 rounded-lg text-xs font-mono bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                    >【{cf.name}】</button>
                  ))}
                </div>
              )}
            </div>

            {/* 表彰模板（多模板管理） */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium text-[color:var(--brand)]">班群表彰模板</Label>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-[color:var(--brand)] border-[rgb(var(--brand-rgb)/0.25)]" onClick={handleAddPraiseTemplate}>
                  <Plus className="w-3.5 h-3.5" />新增模板
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1 mb-2">支持多套模板切换：日常表彰、阶段测表彰可分别配置；在「反馈生成 → 班群公示表彰」中生成时可选择使用哪套模板。</p>

              {/* 模板列表 */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => setActiveTemplateId('default')}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
                    activeTemplateId === 'default' ? 'bg-[rgb(var(--brand-rgb)/0.15)] border-[rgb(var(--brand-rgb)/0.4)] text-[color:var(--brand)] font-medium' : 'bg-white/70 border-[rgb(var(--brand-rgb)/0.15)] text-slate-600 hover:border-[rgb(var(--brand-rgb)/0.25)]'
                  }`}
                >默认模板</button>
                {praiseTemplates.map(t => (
                  <div key={t.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border transition-all ${
                    activeTemplateId === t.id ? 'bg-[rgb(var(--brand-rgb)/0.15)] border-[rgb(var(--brand-rgb)/0.4)] text-[color:var(--brand)] font-medium' : 'bg-white/70 border-[rgb(var(--brand-rgb)/0.15)] text-slate-600'
                  }`}>
                    {renamingTemplateId === t.id ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameTemplate(t.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameTemplate(t.id)}
                        className="h-6 w-24 text-sm px-1"
                      />
                    ) : (
                      <>
                        <button onClick={() => setActiveTemplateId(t.id)}>{t.name}</button>
                        <button
                          onClick={() => { setRenamingTemplateId(t.id); setRenameValue(t.name); }} aria-label="重命名模板"
                          className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-[color:var(--brand)]"
                          title="重命名"
                        ><Pencil className="w-3 h-3" /></button>
                        <button
                          onClick={() => handleDeletePraiseTemplate(t.id)} aria-label="删除模板"
                          className="text-[rgb(var(--brand-rgb)/0.55)] hover:text-rose-500"
                          title="删除"
                        ><Trash2 className="w-3 h-3" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* 模板编辑区 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                <div>
                  <Textarea
                    ref={praiseTextareaRef}
                    value={activeTemplateText}
                    onChange={(e) => updateTemplateText(e.target.value)}
                    className="min-h-[200px] text-sm liquid-glass-input"
                    placeholder="点击下方变量插入到模板中..."
                  />
                  <VariableSelector
                    textareaRef={praiseTextareaRef}
                    isLessonConfig={true}
                  />
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <Variable className="w-3.5 h-3.5" />
                    表彰模板专用变量：【课次】【表彰类型】【表彰内容】在生成时自动填充
                  </div>
                </div>

                {/* 实时预览 */}
                <div className="rounded-xl border border-[rgb(var(--brand-rgb)/0.15)] bg-gradient-to-br from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-rgb)/0.10)] p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[color:var(--brand)] flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />实时预览（示例数据）
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowPraisePreview(!showPraisePreview)}>
                      {showPraisePreview ? '收起' : '展开'}
                    </Button>
                  </div>
                  {showPraisePreview && (
                    <pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap font-sans flex-1 overflow-auto max-h-[260px]">{praisePreview || '（模板内容为空）'}</pre>
                  )}
                </div>
              </div>
            </div>

            {/* 作业内容 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">作业内容</Label>
              <Textarea
                value={localLessonConfig.homeworkText}
                onChange={(e) => setLocalLessonConfig(prev => ({ ...prev, homeworkText: e.target.value }))}
                className="min-h-[100px] text-sm mt-2 liquid-glass-input"
              />
            </div>

            <Button onClick={handleSaveLessonConfig} className="w-full gap-2 liquid-glass-button">
              <Save className="w-4 h-4" />
              保存第{lessonNumber}课配置
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="default" className="space-y-6">
        <Card className="liquid-glass-card">
          <CardHeader>
            <CardTitle className="text-[color:var(--brand)]">默认配置（用于新课次）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 默认选项（用于新课次） */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="w-4 h-4 text-[color:var(--brand)]" />
                <Label className="text-base font-semibold text-[color:var(--brand)]">默认选项（用于新课次）</Label>
              </div>
              <p className="text-xs text-slate-400 mb-3">修改后保存，新建课次的考勤 / 课堂表现 / 作业 / 课后任务选项将采用这里的默认值；已存在的课次配置不受影响，可在「表格字段」单独调整。</p>
              <div className="grid gap-5 md:grid-cols-2">
                <DefaultOptionList
                  title="考勤选项"
                  options={localAppConfig.defaultAttendanceOptions}
                  onChange={v => setLocalAppConfig(p => ({ ...p, defaultAttendanceOptions: v }))}
                />
                <DefaultOptionList
                  title="课堂表现选项"
                  options={localAppConfig.defaultClassPerformanceOptions || DEFAULT_CLASS_PERFORMANCE_OPTIONS}
                  onChange={v => setLocalAppConfig(p => ({ ...p, defaultClassPerformanceOptions: v }))}
                />
                <DefaultOptionList
                  title="作业选项"
                  options={localAppConfig.defaultHomeworkOptions}
                  onChange={v => setLocalAppConfig(p => ({ ...p, defaultHomeworkOptions: v }))}
                />
                <DefaultOptionList
                  title="课后任务选项"
                  options={localAppConfig.defaultListeningOptions}
                  onChange={v => setLocalAppConfig(p => ({ ...p, defaultListeningOptions: v }))}
                />
              </div>
            </div>

            <Separator className="bg-[rgb(var(--brand-rgb)/0.15)]" />

            {/* 默认反馈模板 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">默认私发反馈模板</Label>
              <Textarea
                ref={defaultFeedbackTextareaRef}
                value={localAppConfig.defaultFeedbackTemplate}
                onChange={(e) => setLocalAppConfig(prev => ({ ...prev, defaultFeedbackTemplate: e.target.value }))}
                className="min-h-[200px] text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={defaultFeedbackTextareaRef}
                isLessonConfig={false}
              />
            </div>

            {/* 默认表彰模板 */}
            <div>
              <Label className="text-base font-medium text-[color:var(--brand)]">默认班群表彰模板</Label>
              <Textarea
                ref={defaultPraiseTextareaRef}
                value={localAppConfig.defaultPraiseTemplate}
                onChange={(e) => setLocalAppConfig(prev => ({ ...prev, defaultPraiseTemplate: e.target.value }))}
                className="min-h-[150px] text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={defaultPraiseTextareaRef}
                isLessonConfig={false}
              />
            </div>

            <Button onClick={handleSaveAppConfig} className="w-full gap-2 liquid-glass-button">
              <Save className="w-4 h-4" />
              保存默认配置
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
