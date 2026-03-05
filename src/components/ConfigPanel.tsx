import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Save, Settings, GripVertical, ChevronUp, ChevronDown, Variable } from 'lucide-react';
import type { QuestionType, LessonConfig, AppConfig } from '@/types';

interface ConfigPanelProps {
  appConfig: AppConfig;
  lessonConfig: LessonConfig;
  lessonNumber: number;
  onSaveAppConfig: (config: AppConfig) => void;
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
}

// 可用变量列表
const availableVariables = [
  { key: '【学生昵称】', desc: '学生昵称（自定义）' },
  { key: '【学生短昵称】', desc: '学生短昵称（三字取后两字，两字取叠词）' },
  { key: '【课次】', desc: '当前课次' },
  { key: '【考勤】', desc: '考勤状态' },
  { key: '【作业】', desc: '作业状态' },
  { key: '【乐听说】', desc: '乐听说状态' },
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
    <Tabs defaultValue="lesson" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2 lg:w-[400px] liquid-glass">
        <TabsTrigger value="lesson">课次配置</TabsTrigger>
        <TabsTrigger value="default">默认配置</TabsTrigger>
      </TabsList>

      <TabsContent value="lesson" className="space-y-6">
        <Card className="liquid-glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-violet-700">
              <Settings className="w-5 h-5" />
              第{lessonNumber}课配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 题型配置 */}
            <div>
              <Label className="text-base font-medium text-blue-700">题型配置</Label>
              <div className="space-y-2 mt-2">
                {localLessonConfig.questionTypes.map((qt, i) => (
                  <div key={qt.id} className="flex items-center gap-3 bg-white/70 p-3 rounded-xl border border-blue-100">
                    <GripVertical className="w-4 h-4 text-blue-400" />
                    <span className="flex-1 font-medium">{qt.name}</span>
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
                        className="p-1 text-blue-400 hover:text-blue-600 disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveQuestionType(i, 'down')}
                        disabled={i === localLessonConfig.questionTypes.length - 1}
                        className="p-1 text-blue-400 hover:text-blue-600 disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveQuestionType(i)}
                        className="p-1 text-blue-400 hover:text-rose-500"
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

            {/* 乐听说选项 */}
            <div>
              <Label className="text-base font-medium text-violet-700">乐听说选项</Label>
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
                <option value="listening">乐听说</option>
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

            {/* 表彰模板 */}
            <div>
              <Label className="text-base font-medium text-violet-700">班群表彰模板</Label>
              <Textarea
                ref={praiseTextareaRef}
                value={localLessonConfig.praiseTemplate}
                onChange={(e) => setLocalLessonConfig(prev => ({ ...prev, praiseTemplate: e.target.value }))}
                className="min-h-[150px] font-mono text-sm mt-2 liquid-glass-input"
                placeholder="点击上方变量插入到模板中..."
              />
              <VariableSelector 
                textareaRef={praiseTextareaRef}
                isLessonConfig={true}
              />
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
