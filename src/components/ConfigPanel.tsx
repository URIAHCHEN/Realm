import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Save, Settings, GripVertical, ChevronUp, ChevronDown, Variable, Pencil, Eye } from 'lucide-react';
import type { QuestionType, LessonConfig, AppConfig, PraiseTemplate } from '@/types';

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
  homework: '书面作业',
  listening: '课后任务',
  note: '备注',
  pass: '是否过关',
};

// 可自定义标题的列定义（随学情表新增列在此同步）
const COLUMN_DEFS: { key: 'seasons' | 'attendance' | 'homework' | 'listening' | 'note' | 'pass'; label: string }[] = [
  { key: 'seasons', label: '学习轨迹列' },
  { key: 'attendance', label: '考勤列' },
  { key: 'homework', label: '书面作业列' },
  { key: 'listening', label: '课后任务列' },
  { key: 'note', label: '备注列' },
  { key: 'pass', label: '是否过关列' },
];

// 可用变量列表
const availableVariables = [  { key: '【学生昵称】', desc: '学生昵称（自定义）' },
  { key: '【学生短昵称】', desc: '学生短昵称（三字取后两字，两字取叠词）' },
  { key: '【课次】', desc: '当前课次' },
  { key: '【考勤】', desc: '考勤状态' },
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
  const [newOptionType, setNewOptionType] = useState<'attendance' | 'homework' | 'listening'>('attendance');
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

  // 添加选项
  const handleAddOption = () => {
    if (!newOption.trim()) return;
    
    const key = newOptionType === 'attendance' ? 'attendanceOptions' 
      : newOptionType === 'homework' ? 'homeworkOptions' 
      : 'listeningOptions';
    
    if (localLessonConfig[key].includes(newOption.trim())) return;
    
    setLocalLessonConfig(prev => ({
      ...prev,
      [key]: [...prev[key], newOption.trim()]
    }));
    setNewOption('');
  };

  // 移除选项
  const handleRemoveOption = (type: 'attendance' | 'homework' | 'listening', index: number) => {
    const key = type === 'attendance' ? 'attendanceOptions' 
      : type === 'homework' ? 'homeworkOptions' 
      : 'listeningOptions';
    
    setLocalLessonConfig(prev => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index)
    }));
  };

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
    <div className="flex flex-wrap gap-2 mt-3 p-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 rounded-xl border border-violet-100">
      <div className="w-full flex items-center gap-2 mb-2 text-sm text-violet-700 font-medium">
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
        <TabsTrigger value="fields">表格字段</TabsTrigger>
        <TabsTrigger value="default">默认配置</TabsTrigger>
      </TabsList>

      <TabsContent value="fields" className="space-y-6">
        <Card className="liquid-glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-violet-700">
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

            <Separator className="bg-violet-100" />

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
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMoveQuestionType(i, 'up')}
                        disabled={i === 0}
                        className="p-1 text-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveQuestionType(i, 'down')}
                        disabled={i === localLessonConfig.questionTypes.length - 1}
                        className="p-1 text-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveQuestionType(i)}
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

            <Separator className="bg-violet-100" />

            {/* 列标题自定义（支持新增 / 编辑 / 清除） */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium text-violet-700">列标题自定义</Label>
                <span className="text-xs text-slate-400">已配置 {Object.entries(localLessonConfig.columnLabels || {}).filter(([, v]) => v && v.trim()).length} 项</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 mb-2">修改已有列的显示名称，或为尚未命名的列新增自定义标题；清空输入即恢复默认名称，保存后学情记录表表头实时同步。</p>

              {/* 已配置标题列表（可编辑 / 可清除） */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {COLUMN_DEFS.map(({ key, label }) => {
                  const val = localLessonConfig.columnLabels?.[key] || '';
                  return (
                    <div key={key} className={`p-2.5 rounded-xl border ${val && val.trim() ? 'bg-violet-50/70 border-violet-200' : 'bg-white/70 border-violet-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-500">{label}</label>
                        {val && val.trim() && (
                          <button
                            onClick={() => setLocalLessonConfig(prev => {
                              const next = { ...(prev.columnLabels || {}) };
                              delete next[key as keyof typeof next];
                              return { ...prev, columnLabels: next };
                            })}
                            className="text-violet-400 hover:text-rose-500 text-xs"
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

            <Separator className="bg-violet-100" />

            {/* 考勤选项 */}
            <div>
              <Label className="text-base font-medium text-violet-700">考勤选项</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {localLessonConfig.attendanceOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1 bg-white/70 px-3 py-1.5 rounded-xl border border-violet-100">
                    <span className="text-sm">{opt}</span>
                    <button
                      onClick={() => handleRemoveOption('attendance', i)}
                      className="text-violet-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 作业选项 */}
            <div>
              <Label className="text-base font-medium text-violet-700">作业选项</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {localLessonConfig.homeworkOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1 bg-white/70 px-3 py-1.5 rounded-xl border border-violet-100">
                    <span className="text-sm">{opt}</span>
                    <button
                      onClick={() => handleRemoveOption('homework', i)}
                      className="text-violet-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 课后任务选项 */}
            <div>
              <Label className="text-base font-medium text-violet-700">课后任务选项</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {localLessonConfig.listeningOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1 bg-white/70 px-3 py-1.5 rounded-xl border border-violet-100">
                    <span className="text-sm">{opt}</span>
                    <button
                      onClick={() => handleRemoveOption('listening', i)}
                      className="text-violet-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 添加新选项 */}
            <div className="flex gap-2">
              <select
                value={newOptionType}
                onChange={(e) => setNewOptionType(e.target.value as any)}
                className="px-3 py-2 border rounded-xl text-sm liquid-glass-input"
              >
                <option value="attendance">考勤</option>
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

            <Separator className="bg-violet-100" />

            {/* 反馈模板 */}
            <div>
              <Label className="text-base font-medium text-violet-700">私发反馈模板</Label>
              <Textarea
                ref={feedbackTextareaRef}
                value={localLessonConfig.feedbackTemplate}
                onChange={(e) => setLocalLessonConfig(prev => ({ ...prev, feedbackTemplate: e.target.value }))}
                className="min-h-[200px] font-mono text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={feedbackTextareaRef}
                isLessonConfig={true}
              />
            </div>

            {/* 表彰模板（多模板管理） */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium text-violet-700">班群表彰模板</Label>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-violet-600 border-violet-200" onClick={handleAddPraiseTemplate}>
                  <Plus className="w-3.5 h-3.5" />新增模板
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1 mb-2">支持多套模板切换：日常表彰、阶段测表彰可分别配置；在「反馈生成 → 班群公示表彰」中生成时可选择使用哪套模板。</p>

              {/* 模板列表 */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => setActiveTemplateId('default')}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
                    activeTemplateId === 'default' ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium' : 'bg-white/70 border-violet-100 text-slate-600 hover:border-violet-200'
                  }`}
                >默认模板</button>
                {praiseTemplates.map(t => (
                  <div key={t.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border transition-all ${
                    activeTemplateId === t.id ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium' : 'bg-white/70 border-violet-100 text-slate-600'
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
                          onClick={() => { setRenamingTemplateId(t.id); setRenameValue(t.name); }}
                          className="text-violet-400 hover:text-violet-600"
                          title="重命名"
                        ><Pencil className="w-3 h-3" /></button>
                        <button
                          onClick={() => handleDeletePraiseTemplate(t.id)}
                          className="text-violet-400 hover:text-rose-500"
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
                    className="min-h-[200px] font-mono text-sm liquid-glass-input"
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
                <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40 p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-violet-700 flex items-center gap-1.5">
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
              <Label className="text-base font-medium text-violet-700">作业内容</Label>
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
            <CardTitle className="text-violet-700">默认配置（用于新课次）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 默认反馈模板 */}
            <div>
              <Label className="text-base font-medium text-violet-700">默认私发反馈模板</Label>
              <Textarea
                ref={defaultFeedbackTextareaRef}
                value={localAppConfig.defaultFeedbackTemplate}
                onChange={(e) => setLocalAppConfig(prev => ({ ...prev, defaultFeedbackTemplate: e.target.value }))}
                className="min-h-[200px] font-mono text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={defaultFeedbackTextareaRef}
                isLessonConfig={false}
              />
            </div>

            {/* 默认表彰模板 */}
            <div>
              <Label className="text-base font-medium text-violet-700">默认班群表彰模板</Label>
              <Textarea
                ref={defaultPraiseTextareaRef}
                value={localAppConfig.defaultPraiseTemplate}
                onChange={(e) => setLocalAppConfig(prev => ({ ...prev, defaultPraiseTemplate: e.target.value }))}
                className="min-h-[150px] font-mono text-sm mt-2 liquid-glass-input"
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
