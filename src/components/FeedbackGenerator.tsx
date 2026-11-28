import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LearningWorkspaceHeading } from '@/components/LearningWorkspaceHeader';
import {
  BookOpen, FileText, Copy, Check, Wand2, Users, ClipboardList,
  CircleAlert, RotateCcw, Send, Sparkles, FileSpreadsheet } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generatePrivateFeedback, generateFourInOne, generateShortNickname, copyToClipboard, DEFAULT_FOUR_IN_ONE_TEMPLATE, FOUR_IN_ONE_VARIABLES, FOUR_IN_ONE_SCENARIOS, FOUR_IN_ONE_VARIANT_COUNT , buildDynamicVariables } from '@/lib/feedbackTemplates';
import { buildClassMedianRates } from '@/lib/adaptiveFeedback';
import { isAbsentRecord, isQuizAssessed, isRecordedQuiz } from '@/lib/attendance';
import { exportTeacherElfXlsx, planTeacherElfColumns, type TeacherElfTextSlot } from '@/lib/teacherElfExport';
import { longTermWeakCategories } from '@/lib/longTermWeak';
import { buildDetailedFeedback } from '@/lib/detailedFeedback';
import { computeStudentReportStats } from '@/lib/reportStats';
import { buildCondensedAdvice } from '@/lib/studentAdvice';
import type { StudentRecord, LessonConfig, QuestionType, ClassStats, OralRatingConfig } from '@/types';
import './FeedbackGenerator.css';

/**
 * 生成可直接粘进表格（Excel / 腾讯文档 / 金山）的 TSV：
 * 单元格内含换行或制表符时按 RFC4180 用双引号包裹并把内部引号转义，
 * 这样粘贴后每份反馈完整落在一个单元格内，不会把版式撑散。
 */
function toTsvCell(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const t = /^[\s\uFEFF]*[=+@-]/.test(normalized) ? "'" + normalized : normalized;
  if (/[\n\t"]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

/** 多列对照表：首行表头，之后每个学生一行 */
function buildTsvTable(headers: string[], rows: string[][]): string {
  const head = headers.map(toTsvCell).join('\t');
  const body = rows.map(r => r.map(toTsvCell).join('\t')).join('\n');
  return `${head}\n${body}`;
}

interface FeedbackGeneratorProps {
  students: string[];
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  lessonNumbers?: number[];
  onSelectLesson: (lesson: number) => void;
  getNickname: (name: string) => string;
  /** 共用 ClassStats 而非内联结构：新增字段（registeredCounts）时不必逐个组件改 */
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[], customFields?: LessonConfig['customFields']) => ClassStats;
  /** 口语等附加项的档位判定配置（用于【口语评价】模板参数）；缺省用默认档位 */
  oralRating?: OralRatingConfig;
  /** 班级课次配置表：学习建议要跨课次聚合（与个人报告同口径） */
  lessonConfigs?: { [lesson: string]: LessonConfig };
  libraryLinks?: string[];
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
  /** 点击群发列表中的姓名弹出该生学情报告 */
  onViewStudent?: (name: string) => void;
  onImportRecords?: () => void;
  /** 视图切换（反馈生成 / 反馈素材），并入工具栏，避免单独一行灰 pill */
  viewSwitch?: React.ReactNode;
  /** 题型名 → 板块覆盖（appConfig.qtCategoryOverrides）：让反馈的薄弱项与报告同口径 */
  qtCategoryOverrides?: Record<string, string>;
  /** 班级名（仅用于导出文件名） */
  className?: string;
}

type StatusTone = 'none' | 'generated' | 'copied';
type FeedbackParts = { text1: string; text2: string };
const joinFeedbackParts = ({ text1, text2 }: FeedbackParts) => [text1, text2].filter(Boolean).join('\n\n');

export function FeedbackGenerator({
  students,
  records,
  lessonConfig: lessonConfigProp,
  lessonNumber,
  lessonNumbers,
  onSelectLesson,
  getNickname,
  calculateClassStats,
  oralRating,
  lessonConfigs = {},
  libraryLinks = [],
  onSaveLessonConfig,
  onViewStudent,
  onImportRecords,
  viewSwitch,
  qtCategoryOverrides,
  className
}: FeedbackGeneratorProps) {
  // 2026-10-24：把「题型名 → 板块」覆盖表注入题型，下游（薄弱项/长期弱项/建议）与报告完全同口径，
  // 避免同一个题型在报告里是"语法"、在反馈里变成"其他"
  const lessonConfig = useMemo(() => ({
    ...lessonConfigProp,
    questionTypes: (lessonConfigProp.questionTypes || []).map(qt => ({
      ...qt,
      category: qt.category?.trim() || qtCategoryOverrides?.[qt.name || ''] || '',
    })),
  }), [lessonConfigProp, qtCategoryOverrides]);

  const [selected, setSelected] = useState<string | null>(null);
  const [generatedNames, setGeneratedNames] = useState(() => new Set<string>());
  const [edits, setEdits] = useState(() => new Map<string, { source: string; text: string; detail?: FeedbackParts }>());
  const [copied, setCopied] = useState(() => new Map<string, string>());
  const copySession = useRef<AbortController | null>(null);

  useEffect(() => {
    const session = new AbortController();
    copySession.current = session;
    return () => session.abort();
  }, []);

  // 模板旁编辑 + 实时预览
  const [showTemplate, setShowTemplate] = useState(false);
  const [privateTemplateDraft, setPrivateTemplateDraft] = useState<{ source: string; text: string }>();
  const [fourInOneTemplateDraft, setFourInOneTemplateDraft] = useState<{ source: string; text: string }>();
  const savedPrivateTemplate = lessonConfig.feedbackTemplate;
  const savedFourInOneTemplate = lessonConfig.fourInOneTemplate || DEFAULT_FOUR_IN_ONE_TEMPLATE;
  const draftFeedback = privateTemplateDraft?.source === savedPrivateTemplate ? privateTemplateDraft.text : savedPrivateTemplate;
  const draftFourInOne = fourInOneTemplateDraft?.source === savedFourInOneTemplate ? fourInOneTemplateDraft.text : savedFourInOneTemplate;
  const setDraftFeedback = (text: string) => setPrivateTemplateDraft({ source: savedPrivateTemplate, text });
  const setDraftFourInOne = (text: string) => setFourInOneTemplateDraft({ source: savedFourInOneTemplate, text });
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // 反馈模式：常规模板 / 四个一
  const [feedbackMode, setFeedbackMode] = useState<'normal' | 'fourInOne'>('normal');
  // 四个一下的「精简版 / 详细版」：详细版走四段式生成器（2026-10-24）
  const [detailLevel, setDetailLevel] = useState<'brief' | 'detailed'>('brief');
  const [scenario, setScenario] = useState<'daily' | 'afterclass' | 'comm'>('daily');
  const [isNewStudent, setIsNewStudent] = useState(false);
  // 是否附「参考教辅」清单（默认不附——四个一以正文为主，需要时再勾选，避免消息过长）
  const [withMaterials, setWithMaterials] = useState(false);
  // 教师精灵表导出配置（2026-10-17）：默认「B 姓名 + C 私发反馈」两列；
  // C 列内容可换（私发 / 四个一 / 学习建议），需要时可勾选再追加一列 D 列
  const [elfOpen, setElfOpen] = useState(false);
  const [elfColC, setElfColC] = useState<'private' | 'fourInOne' | 'advice'>('private');
  const [elfWithD, setElfWithD] = useState(false);
  const [elfColD, setElfColD] = useState<'private' | 'fourInOne' | 'advice'>('fourInOne');
  const [variant, setVariant] = useState(0);
  const SCENARIOS: { value: 'daily' | 'afterclass' | 'comm'; label: string }[] =
    FOUR_IN_ONE_SCENARIOS.map(s => ({ value: s.key, label: s.label }));

  const lessonRecords = useMemo(() =>
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );
  const lessonRecordsByName = useMemo(() => new Map(lessonRecords.map(r => [r.studentName, r])), [lessonRecords]);
  const recordOf = (name: string) => lessonRecordsByName.get(name);

  const stats = useMemo(() =>
    calculateClassStats(lessonRecords, lessonConfig.questionTypes, lessonConfig.customFields),
    [lessonRecords, lessonConfig.questionTypes, lessonConfig.customFields, calculateClassStats]
  );
  const assessedCount = lessonRecords.filter(r => isRecordedQuiz(r, lessonConfig)).length;
  const usesTemplate = lessonConfig.privateFeedbackMode === 'template';

  // 表格字段 → 可选参数（题型含口语得分等附加项、自定义列），与 lib 的替换逻辑同一份定义
  const dynamicVars = useMemo(
    () => buildDynamicVariables(lessonConfig),
    [lessonConfig]
  );

  // 按学生分组一次（原来每个学生都 filter 一遍全量记录 → O(人数 × 记录数)）
  const recordsByName = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    records.forEach(r => {
      const arr = map.get(r.studentName);
      if (arr) arr.push(r); else map.set(r.studentName, [r]);
    });
    return map;
  }, [records]);

  // 长期薄弱板块（跨课次）：给「附参考教辅」挑资料用；按学生缓存，避免每次生成重算
  const weakByStudent = useMemo(() => {
    const map = new Map<string, string[]>();
    recordsByName.forEach((recs, name) => map.set(name, longTermWeakCategories(recs, lessonConfigs, 2, qtCategoryOverrides)));
    return map;
  }, [recordsByName, lessonConfigs, qtCategoryOverrides]);
  const weakOf = (name: string): string[] => weakByStudent.get(name) || [];

  const isFourInOne = feedbackMode === 'fourInOne';
  const activeTemplate = isFourInOne ? draftFourInOne : draftFeedback;
  const templateVisible = showTemplate && (isFourInOne ? detailLevel === 'brief' : usesTemplate);
  const setActiveTemplate = (v: string) => isFourInOne ? setDraftFourInOne(v) : setDraftFeedback(v);

  // 在光标处插入变量到模板
  const insertTemplateVar = (token: string) => {
    const ta = templateRef.current;
    if (!ta) { setActiveTemplate(activeTemplate + token); return; }
    const start = ta.selectionStart ?? activeTemplate.length;
    const end = ta.selectionEnd ?? activeTemplate.length;
    const next = activeTemplate.slice(0, start) + token + activeTemplate.slice(end);
    setActiveTemplate(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + token.length, start + token.length); });
  };

  const handleSaveTemplate = () => {
    onSaveLessonConfig(lessonNumber, isFourInOne
      ? { fourInOneTemplate: draftFourInOne }
      : { feedbackTemplate: draftFeedback });
  };

  const resetTemplateToDefault = () => {
    if (isFourInOne) setDraftFourInOne(DEFAULT_FOUR_IN_ONE_TEMPLATE);
    else setPrivateTemplateDraft(undefined);
    toast.info('已恢复模板草稿');
  };

  const handleSelect = (name: string) => {
    setSelected(name);
    if (recordOf(name)) setGeneratedNames(previous => new Set([...previous, name]));
  };

  const handleGenerateAll = () => {
    const withRecords = students.filter(s => recordOf(s));
    if (withRecords.length === 0) {
      toast.error(`第${lessonNumber}课还没有学情记录，请先到「学情记录」保存`);
      return;
    }
    setGeneratedNames(new Set(withRecords));
    if (!selected || !recordOf(selected)) setSelected(withRecords[0]);
    toast.success(`已生成 ${withRecords.length} 份反馈`);
  };

  const copyFeedback = async (text: string, rows: { name: string; text: string }[]) => {
    const session = copySession.current;
    const ok = await copyToClipboard(text);
    if (ok && !session?.signal.aborted) {
      setCopied(previous => new Map([...previous, ...rows.map(row => [row.name, row.text] as const)]));
    }
    return ok;
  };

  const handleCopyOne = async (name: string) => {
    const row = feedbackByName.get(name);
    if (!row?.text.trim()) return;
    if (await copyFeedback(row.text, [row])) toast.success(`已复制 ${getNickname(name)} 的私发反馈`);
    else toast.error('复制失败，请手动选择复制');
  };

  const handleResetStatus = () => {
    setCopied(new Map());
    toast.success('已重置复制状态');
  };

  // 学习建议（精简版）：与个人报告「学习建议」同口径（该生全部课次记录），
  // 供三个入口使用 —— 行内一键复制 / 批量复制 / 模板参数【学习建议】
  const adviceMap = useMemo(() => {
    const map: Record<string, string> = {};
    const opts = {
      attendanceOptions: lessonConfig.attendanceOptions || [],
      homeworkOptions: lessonConfig.homeworkOptions || [],
      listeningOptions: lessonConfig.listeningOptions || [],
    };
    students.forEach(name => {
      const srs = [...(recordsByName.get(name) || [])].sort((a, b) => a.lessonNumber - b.lessonNumber);
      if (srs.length === 0) { map[name] = ''; return; }
      const st = computeStudentReportStats(srs, lessonConfigs, opts);
      map[name] = buildCondensedAdvice(generateShortNickname(getNickname(name)), srs, st, lessonConfigs);
    });
    return map;
  }, [students, recordsByName, lessonConfigs, lessonConfig, getNickname]);

  // 各课次班级得分率中位数：判断「在班里是进步还是退步」要拿它扣掉卷子难度的起伏
  const classMedian = useMemo(() => buildClassMedianRates(records, lessonConfigs), [records, lessonConfigs]);
  const detailedFourInOne = isFourInOne && detailLevel === 'detailed';
  const draftMode = isFourInOne ? detailLevel : usesTemplate ? 'template' : 'adaptive';
  const baseByName = useMemo(() => {
    const map = new Map<string, { source: string; detail?: FeedbackParts }>();
    students.forEach(name => {
      const record = lessonRecordsByName.get(name);
      if (!record) return;
      const nickname = getNickname(name);
      const advice = { '【学习建议】': adviceMap[name] || '' };
      if (detailedFourInOne) {
        const detail = buildDetailedFeedback(record, lessonConfig, stats, nickname, variant, assessedCount);
        map.set(name, { source: joinFeedbackParts(detail), detail });
        return;
      }
      const source = isFourInOne
        ? generateFourInOne(record, lessonConfig, stats, nickname, isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, advice, weakByStudent.get(name) ?? [])
        : generatePrivateFeedback(record, lessonConfig, stats, nickname, draftFeedback, oralRating, advice, {
          // 给上历史记录和各课配置，「按学情生成」才能说出「比第 N 课进步了」
          history: recordsByName.get(record.studentName) ?? [],
          lessonConfigs,
          classMedian,
        });
      map.set(name, { source });
    });
    return map;
  }, [students, lessonRecordsByName, recordsByName, lessonConfigs, classMedian, getNickname, adviceMap, detailedFourInOne, isFourInOne, lessonConfig, stats, variant, assessedCount, isNewStudent, libraryLinks, draftFourInOne, scenario, withMaterials, oralRating, weakByStudent, draftFeedback]);
  const feedbackByName = new Map(Array.from(baseByName, ([name, base]) => {
    const edit = edits.get(`${draftMode}:${name}`);
    return [name, edit?.source === base.source
      ? { name, ...edit }
      : { name, ...base, text: base.source }] as const;
  }));
  const updateDraft = (name: string, text: string, detail?: FeedbackParts) => {
    const base = feedbackByName.get(name);
    if (base) setEdits(previous => new Map(previous).set(`${draftMode}:${name}`, { source: base.source, text, detail }));
  };
  const exportCandidates = Array.from(feedbackByName.values()).filter(row => {
    const record = recordOf(row.name);
    return record && isQuizAssessed(record, lessonConfig);
  });
  const batchRows = exportCandidates.filter(row => row.text.trim());
  const excludedRecords = lessonRecords.filter(r => !isQuizAssessed(r, lessonConfig));
  const excludedNames = excludedRecords.map(r => getNickname(r.studentName));
  const excludedAbsentCount = excludedRecords.filter(isAbsentRecord).length;

  // 一键复制全班（表格）：一列学生 / 一列私发 / 一列四个一，直接粘进表格即可对照
  // 一键复制全班（单列）：按当前模式只导出私发或只导出四个一
  const handleCopyBatchSingle = async () => {
    if (batchRows.length === 0) {
      toast.error('本课还没有可复制的反馈（到课学员暂无记录）');
      return;
    }
    const isFour = feedbackMode === 'fourInOne';
    const rows = batchRows.map(r => [getNickname(r.name), r.text]);
    const text = buildTsvTable(['学生姓名', isFour ? '四个一反馈' : '私发反馈'], rows);
    const ok = await copyFeedback(text, batchRows);
    if (ok) {
      toast.success(`已复制 ${rows.length} 位学员的${isFour ? '四个一' : '私发'}反馈（单列表格）`, {
        description: excludedNames.length ? `已自动排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）：${excludedNames.join('、')}` : undefined,
      });
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  // 导出教师精灵（企鹅教师助手）个性化文本模板（2026-10-17）
  // 范围与「复制对照表」完全一致：只含在课学员（请假/缺勤/调课调出排除）。
  // 默认 B 列姓名 + C 列私发反馈两列；C/D 列内容可换，内容按当前模板草稿实时生成。
  const ELF_SLOT_LABEL: Record<TeacherElfTextSlot, string> = {
    private: '私发反馈',
    fourInOne: detailedFourInOne ? '四个一·文本1' : '四个一反馈',
    fourInOnePart2: '四个一·文本2',
    advice: '学习建议',
  };
  const buildElfText = (name: string, kind: 'private' | 'fourInOne' | 'advice'): string => {
    if (kind === 'advice') return adviceMap[name] || '';
    const rec = recordOf(name);
    if (!rec) return '';
    const adviceRef = { '【学习建议】': adviceMap[name] || '' };
    const source = kind === 'fourInOne'
      ? generateFourInOne(rec, lessonConfig, stats, getNickname(name), isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, adviceRef, weakOf(name))
      : generatePrivateFeedback(rec, lessonConfig, stats, getNickname(name), draftFeedback, oralRating, adviceRef, {
        history: recordsByName.get(rec.studentName) ?? [],
        lessonConfigs,
        classMedian,
      });
    const mode = kind === 'fourInOne' ? 'brief' : usesTemplate ? 'template' : 'adaptive';
    const edit = edits.get(`${mode}:${name}`);
    return edit?.source === source ? edit.text : source;
  };
  const handleExportTeacherElf = async () => {
    if (exportCandidates.length === 0) {
      toast.error('没有可导出的反馈（本课暂无在课学员记录）');
      return;
    }
    if (elfWithD && elfColD === elfColC) {
      toast.error('C 列与 D 列选了同一种内容，请换一个');
      return;
    }
    try {
      // 所选内容决定列位置；详细版四个一会展开为两段，后续内容顺延到下一列。
      const slots = planTeacherElfColumns(
        [elfColC, ...(elfWithD ? [elfColD] : [])],
        detailedFourInOne,
      );
      const rows = exportCandidates.map(r => {
        const texts = slots.map(slot => {
          if (slot === 'fourInOnePart2') return r.detail?.text2 ?? '';
          if (slot === 'fourInOne' && detailedFourInOne) return r.detail?.text1 ?? '';
          if ((slot === 'private' && !isFourInOne) || (slot === 'fourInOne' && isFourInOne)) return r.text;
          return buildElfText(r.name, slot);
        });
        return { name: getNickname(r.name), text1: texts[0] || '', text2: texts[1], text3: texts[2] };
      }).filter(r => r.text1.trim());
      const skipped = exportCandidates.length - rows.length;
      if (!rows.length) {
        toast.error('所选 C 列没有可导出的正文，请检查后重试');
        return;
      }
      const { filename, truncated } = await exportTeacherElfXlsx({
        className,
        lessonNumber,
        rows,
        includeText2: slots.length >= 2,
        includeText3: slots.length >= 3,
      });
      const endColumn = String.fromCharCode(67 + slots.length - 1);
      const colDesc = `B-${endColumn} 列 = 学生姓名 / ${slots.map(slot => ELF_SLOT_LABEL[slot]).join(' / ')}`;
      const notes = [
        `${colDesc}，共 ${rows.length} 人`,
        excludedNames.length ? `已排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）` : '',
        skipped ? `已跳过 ${skipped} 条 C 列为空的记录` : '',
        truncated ? `${truncated} 条文本超过模板 1000 字上限，已截断` : '',
      ].filter(Boolean).join('；');
      toast.success(`已导出 ${filename}`, { description: notes, duration: 9000 });
    } catch (e) {
      toast.error('导出失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // 纯文本版（分隔线）：适合直接发群里，便于逐条阅读
  const handleCopyBatch = async () => {
    if (batchRows.length === 0) {
      toast.error('没有可群发的反馈（本课暂无到课学员记录）');
      return;
    }
    const text = batchRows.map(r => `【${getNickname(r.name)}】\n${r.text}`).join('\n\n──────────────\n\n');
    const ok = await copyFeedback(text, batchRows);
    if (ok) {
      toast.success(`已复制 ${batchRows.length} 份反馈（纯文本，分隔线隔开）`, {
        description: excludedNames.length ? `已自动排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）：${excludedNames.join('、')}` : undefined,
      });
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const handleCopyBatchRow = async (name: string, text: string) => {
    const ok = await copyFeedback(text, [{ name, text }]);
    if (ok) {
      toast.success(`已复制 ${getNickname(name)} 的反馈`);
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const statusTone = (name: string): StatusTone => {
    const current = feedbackByName.get(name);
    if (!current) return 'none';
    if (copied.get(name) === current.text) return 'copied';
    if (generatedNames.has(name)) return 'generated';
    return 'none';
  };

  const withRecordsCount = students.filter(s => recordOf(s)).length;
  const generatedCount = students.filter(s => statusTone(s) !== 'none').length;
  const copiedCount = students.filter(s => statusTone(s) === 'copied').length;
  const progressPct = withRecordsCount > 0
    ? Math.round((generatedCount / withRecordsCount) * 100)
    : 0;

  const selectedRecord = selected ? recordOf(selected) : undefined;
  const selectedFeedback = selected ? feedbackByName.get(selected) : undefined;

  const selectableLessons = lessonNumbers
    ? [...new Set([...lessonNumbers, ...Object.keys(lessonConfigs).map(Number), lessonNumber])]
        .filter(lesson => Number.isInteger(lesson) && lesson > 0)
        .sort((a, b) => a - b)
    : [];


  const statusBadge = (name: string) => {
    const tone = statusTone(name);
    if (tone === 'copied') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 rounded-full">
          <Check className="w-3 h-3" />已复制
        </Badge>
      );
    }
    if (tone === 'generated') {
      return (
        <Badge className="border-0 rounded-full gap-1 bg-[rgb(var(--brand-rgb)/0.12)]" style={{ color: 'var(--brand)' }}>
          已生成
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="rounded-full text-[color:var(--ink-4)] bg-black/[0.05]">
        未生成
      </Badge>
    );
  };

  return (
    <div className="space-y-5">
      {/* 顶部：标题 + 批量操作 */}
      <Card className="ios-glass-card border-0">
        <CardContent className="feedback-workbench-content pt-5 pb-4">
          <div className="feedback-workbench-header">
            <LearningWorkspaceHeading
              title={`私发反馈工作台 · 第${lessonNumber}课`}
              description="按本课学情生成逐生反馈，可编辑、批量复制或导出教师精灵表。"
              icon={FileText}
            />
            <div className="feedback-workbench-controls">
              <div className="feedback-workbench-actions">
                <div className="feedback-workbench-batch">
                  <Button size="sm" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2 bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90" onClick={handleGenerateAll}>
                    <Wand2 className="w-4 h-4" />
                    一键生成全班
                  </Button>
                  <Button
                    variant="outline"
                    className={`h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2 border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)] ${elfOpen ? 'bg-[rgb(var(--brand-rgb)/0.08)]' : ''}`}
                    aria-expanded={elfOpen}
                    onClick={() => setElfOpen(v => !v)}
                    title="按教师精灵（企鹅教师助手）模板导出：默认「学生姓名 + 私发反馈」两列，可选内容与是否再加一列"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    教师精灵表
                  </Button>
                  {onImportRecords && (
                    <Button variant="outline" size="sm" className="h-9 px-3.5 text-sm gap-2" onClick={onImportRecords}>
                      <ClipboardList className="w-4 h-4" />粘贴学情表
                    </Button>
                  )}
                  <Button variant="outline" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2" onClick={handleCopyBatchSingle}
                    title={feedbackMode === 'fourInOne' ? '只导出「学生 / 四个一」两列' : '只导出「学生 / 私发」两列'}>
                    <Copy className="w-4 h-4" />
                    仅复制{feedbackMode === 'fourInOne' ? '四个一' : '私发'}
                  </Button>
                  <details className="fb-more">
                    <summary title="更多批量操作" aria-label="更多批量操作">⋯</summary>
                    <div className="fb-more-menu" role="menu">
                      <button role="menuitem" onClick={handleCopyBatch} title="纯文本 + 分隔线，适合直接发群里"><ClipboardList className="w-4 h-4" />复制纯文本</button>
                      <button role="menuitem" onClick={handleResetStatus} title="清除已复制标记"><RotateCcw className="w-4 h-4" />重置状态</button>
                    </div>
                  </details>
                </div>
                <div className="feedback-workbench-modes">
                  <div role="tablist" aria-label="反馈模式" className="mode-seg mode-seg--sm">
                    <button
                      role="tab" aria-selected={feedbackMode === 'normal'}
                      onClick={() => setFeedbackMode('normal')}
                      className={`mode-seg-item ${feedbackMode === 'normal' ? 'is-active' : ''}`}
                    >私发反馈</button>
                    <button
                      role="tab" aria-selected={feedbackMode === 'fourInOne'}
                      onClick={() => setFeedbackMode('fourInOne')}
                      className={`mode-seg-item inline-flex items-center gap-1.5 ${feedbackMode === 'fourInOne' ? 'is-active' : ''}`}
                    ><Sparkles className="w-3.5 h-3.5" />四个一</button>
                  </div>
                  {isFourInOne && (
                    <div role="tablist" className="mode-seg mode-seg--sm" aria-label="详细程度">
                      <button role="tab" aria-selected={detailLevel === 'brief'} className={`mode-seg-item ${detailLevel === 'brief' ? 'is-active' : ''}`} onClick={() => setDetailLevel('brief')}>精简版</button>
                      <button role="tab" aria-selected={detailLevel === 'detailed'} className={`mode-seg-item ${detailLevel === 'detailed' ? 'is-active' : ''}`} onClick={() => setDetailLevel('detailed')}>详细版</button>
                    </div>
                  )}
                  {!isFourInOne && (
                    <Select value={usesTemplate ? 'template' : 'adaptive'} onValueChange={(value: 'adaptive' | 'template') => {
                      setShowTemplate(value === 'template');
                      onSaveLessonConfig(lessonNumber, { privateFeedbackMode: value });
                    }}>
                      <SelectTrigger aria-label="私发反馈生成方式" size="sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adaptive">按学情生成</SelectItem>
                        <SelectItem value="template">使用自定义模板</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {viewSwitch && <span className="tb-divider" aria-hidden="true" />}
                  {viewSwitch}
                </div>
              </div>
              {selectableLessons.length > 0 && (
                <div className="feedback-lesson-switch" role="group" aria-label="切换课次">
                  <span className="feedback-lesson-label">
                    <BookOpen size={15} aria-hidden="true" />课次
                  </span>
                  <div className="feedback-lesson-options">
                    {selectableLessons.map(lesson => (
                      <button
                        key={lesson}
                        type="button"
                        className="lesson-chip"
                        aria-label={`第${lesson}课`}
                        aria-pressed={lesson === lessonNumber}
                        onClick={() => onSelectLesson(lesson)}
                      >
                        {lesson}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 教师精灵表导出配置（默认 B 姓名 + C 私发 两列；C/D 列内容可选，实时按当前模板生成） */}
          {elfOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[var(--r-md)] border border-[rgb(var(--brand-rgb)/0.25)] bg-[rgb(var(--brand-rgb)/0.05)] px-3.5 py-2.5">
              <span className="text-xs font-semibold text-[color:var(--ink-2)]">教师精灵表</span>
              <span className="text-xs text-[color:var(--ink-4)]">B 列 = 学生姓名</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--ink-2)]">
                C 列 =
                <Select value={elfColC} onValueChange={(v) => setElfColC(v as typeof elfColC)}>
                  <SelectTrigger className="h-8 w-32 text-xs rounded-[var(--r-md)] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">私发反馈</SelectItem>
                    <SelectItem value="fourInOne">四个一反馈</SelectItem>
                    <SelectItem value="advice">学习建议</SelectItem>
                  </SelectContent>
                </Select>
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs text-[color:var(--ink-2)] cursor-pointer select-none">
                <input type="checkbox" checked={elfWithD} onChange={(e) => setElfWithD(e.target.checked)} className="accent-[color:var(--brand)]" />
                再加一列 D
              </label>
              {elfWithD && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--ink-2)]">
                  D 列 =
                  <Select value={elfColD} onValueChange={(v) => setElfColD(v as typeof elfColD)}>
                    <SelectTrigger className="h-8 w-32 text-xs rounded-[var(--r-md)] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">私发反馈</SelectItem>
                      <SelectItem value="fourInOne">四个一反馈</SelectItem>
                      <SelectItem value="advice">学习建议</SelectItem>
                    </SelectContent>
                  </Select>
                </span>
              )}
              <Button size="sm" className="h-8 px-3 text-xs rounded-[var(--r-md)] gap-1.5 bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90" onClick={handleExportTeacherElf}>
                <FileSpreadsheet className="w-3.5 h-3.5" />
                立即导出
              </Button>
              <span className="text-[11px] text-[color:var(--ink-4)]">已编辑的正文随当前模式导出；请假 / 缺勤 / 调课调出自动排除</span>
            </div>
          )}

          {isFourInOne && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Select value={scenario} onValueChange={(v) => setScenario(v as typeof scenario)}>
                <SelectTrigger className="w-32 h-8 text-sm rounded-[var(--r-md)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-2)] cursor-pointer select-none">
                <input type="checkbox" checked={isNewStudent} onChange={(e) => setIsNewStudent(e.target.checked)} className="accent-[color:var(--brand)]" />
                新学员（补充孩子感受）
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-2)] cursor-pointer select-none" title="附上语法/完型/阅读/写作/听力的精选教辅清单">
                <input type="checkbox" checked={withMaterials} onChange={(e) => setWithMaterials(e.target.checked)} className="accent-[color:var(--brand)]" />
                附参考教辅
              </label>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[var(--r-md)]" onClick={() => setVariant(v => (v + 1) % FOUR_IN_ONE_VARIANT_COUNT)}>
                <RotateCcw className="w-3.5 h-3.5" />换一版措辞（{variant + 1}/{FOUR_IN_ONE_VARIANT_COUNT}）
              </Button>
            </div>
          )}

          {/* 进度条 */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[color:var(--ink-4)]">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                有记录学生 {withRecordsCount} / 共 {students.length} 人
              </span>
              <span>
                已生成 <span className="font-semibold" style={{ color: 'var(--brand)' }}>{generatedCount}</span>
                <span className="mx-1.5">·</span>
                已复制 <span className="font-semibold text-emerald-600">{copiedCount}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden" role="progressbar" aria-label="反馈生成进度" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-full motion-progress-fill"
                style={{
                  transform: `scaleX(${progressPct / 100})`,
                  background: 'linear-gradient(90deg, rgb(var(--brand-rgb)/0.6), rgb(var(--brand-rgb)))'
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 主体：左列表 + 右编辑 */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* 学生列表 */}
        <Card className="ios-glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-[color:var(--ink)]">
              <ClipboardList className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              学生列表
              <Badge variant="secondary" className="rounded-full ml-auto">{students.length} 人</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {students.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-4)] text-center py-8">班级暂无学生</p>
            ) : (
              <ScrollArea className="h-[420px] pr-2">
                <div className="space-y-1">
                  {students.map(s => {
                    const record = recordOf(s);
                    const assessed = record && isRecordedQuiz(record, lessonConfig);
                    const tone = statusTone(s);
                    const isActive = selected === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => handleSelect(s)}
                        className={`group w-full cursor-pointer flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                          isActive
                            ? 'bg-[rgb(var(--brand-rgb)/0.1)] ring-1 ring-[rgb(var(--brand-rgb)/0.35)]'
                            : tone === 'copied'
                              ? 'bg-emerald-50/80 hover:bg-emerald-100/80'
                              : 'hover:bg-black/[0.04]'
                        }`}
                      >
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                          style={{
                            background: tone === 'copied'
                              ? 'linear-gradient(135deg,#34d399,#10b981)'
                              : 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))'
                          }}
                        >
                          {getNickname(s).slice(0, 1) || s.slice(0, 1)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-[color:var(--ink)] truncate">{getNickname(s)}</span>
                          <span className="block text-[11px] text-[color:var(--ink-4)] truncate">
                            {assessed ? `${record.totalScore}分${record.rank > 0 ? ` · 第${record.rank}名` : ''}` : record?.attendance || '本课无记录'}
                          </span>
                        </span>
                        {tone === 'copied' ? (
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : tone === 'generated' ? (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--brand-rgb))' }} />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* 编辑区（纸张化预览） */}
        <Card className="ios-glass-card border-0 feedback-paper">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between gap-2 text-[color:var(--ink)]">
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                {selected ? `${getNickname(selected)} 的反馈内容` : '反馈内容'}
              </span>
              <span className="flex items-center gap-2">
                {selected && statusBadge(selected)}
                {(isFourInOne ? detailLevel === 'brief' : usesTemplate) && <button
                  type="button"
                  aria-expanded={templateVisible}
                  onClick={() => setShowTemplate(v => !v)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors ${showTemplate ? 'bg-[rgb(var(--brand-rgb)/0.12)] border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)]' : 'bg-black/[0.04] border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
                  title="在右侧编辑并预览反馈模板"
                >
                  <Wand2 className="w-3.5 h-3.5" />{isFourInOne ? '四个一模板' : '反馈模板'}
                </button>}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
          <div className={templateVisible ? 'grid gap-5 lg:grid-cols-2 items-start' : ''}>
          <div className="space-y-3">
            {!selected ? (
              <div className="py-16 text-center text-[color:var(--ink-4)]">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">从左侧选择学生，或点「一键生成全班」开始</p>
              </div>
            ) : !selectedRecord ? (
              <div className="py-16 text-center">
                <CircleAlert className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                <p className="text-sm text-[color:var(--ink-2)] font-medium">{getNickname(selected)} 在第{lessonNumber}课还没有学情记录</p>
                <p className="text-xs text-[color:var(--ink-4)] mt-1.5">请先到「学情记录」为该生建档后再生成反馈</p>
              </div>
            ) : (
              <>
                {selectedFeedback?.detail ? (
                  <div className="space-y-3">
                    {(['text1', 'text2'] as const).map((key, index) => (
                      <label key={key} className="block space-y-1.5">
                        <span className="text-xs font-medium text-[color:var(--ink-3)]">文本 {index + 1}</span>
                        <Textarea
                          value={selectedFeedback.detail?.[key] ?? ''}
                          data-preview-text
                          onChange={event => {
                            const detail = selectedFeedback.detail;
                            if (!detail) return;
                            const next = { ...detail, [key]: event.target.value };
                            updateDraft(selected, joinFeedbackParts(next), next);
                          }}
                          className="min-h-[170px] text-sm leading-relaxed rounded-[var(--r-md)]"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <Textarea
                    aria-label="反馈正文"
                    value={selectedFeedback?.text ?? ''}
                    data-preview-text
                    onChange={event => updateDraft(selected, event.target.value)}
                    className="min-h-[280px] text-sm leading-relaxed rounded-[var(--r-md)]"
                  />
                )}
                {!selectedFeedback?.detail && (lessonConfig.customFields || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[color:var(--ink-4)]">可选参数（点击追加）：</span>
                    {(lessonConfig.customFields || []).map(cf => {
                      const v = (selectedRecord.customValues || {})[cf.id];
                      if (v === '' || v == null) return null;
                      const disp = cf.kind === 'number' ? `${v}分` : String(v);
                      return (
                        <button
                          key={cf.id}
                          type="button"
                          onClick={() => updateDraft(selected, `${selectedFeedback?.text ?? ''}\n${cf.name}：${disp}`)}
                          className="px-2 py-0.5 rounded-lg text-xs bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                        >+ {cf.name}：{disp}</button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[color:var(--ink-4)]">
                    正文可编辑，修改会同步到本页的批量预览。
                  </p>
                  <Button className="ios-button gap-2" disabled={!selectedFeedback?.text.trim()} onClick={() => handleCopyOne(selected)}>
                    <Copy className="w-4 h-4" />
                    复制反馈
                  </Button>
                </div>
              </>
            )}
          </div>
          {templateVisible && (
            <div className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--ink)] flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                  {isFourInOne ? '四个一 · 模板编辑' : '私发反馈 · 模板编辑'}
                </p>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg gap-1 text-[color:var(--ink-4)]" onClick={resetTemplateToDefault}>
                    <RotateCcw className="w-3.5 h-3.5" />恢复默认
                  </Button>
                  <Button size="sm" className="ios-button h-7 text-xs rounded-lg gap-1" onClick={handleSaveTemplate}>
                    <Check className="w-3.5 h-3.5" />保存模板
                  </Button>
                </div>
              </div>
              <Textarea
                ref={templateRef}
                data-preview-text
                aria-label="反馈模板正文"
                value={activeTemplate}
                onChange={(e) => setActiveTemplate(e.target.value)}
                className="min-h-[280px] text-sm leading-relaxed rounded-[var(--r-md)]"
                placeholder="编辑模板，点击变量可插入…"
              />
              <div className="flex flex-wrap gap-1.5">
                {(isFourInOne ? [...FOUR_IN_ONE_VARIABLES, ...dynamicVars] : [
                  { key: '【学生昵称】', desc: '' }, { key: '【课次】', desc: '' },
                  { key: '【考勤】', desc: '' }, { key: '【课堂表现】', desc: '' },
                  { key: '【作业】', desc: '' }, { key: '【课后任务】', desc: '' },
                  { key: '【成绩详情】', desc: '' }, { key: '【总分】', desc: '' }, { key: '【满分】', desc: '' },
                  { key: '【排名】', desc: '' }, { key: '【正确率】', desc: '' }, { key: '【薄弱项】', desc: '' },
                  { key: '【学习建议】', desc: '' },
                  { key: '【作业内容】', desc: '' },
                  ...dynamicVars,
                ]).map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertTemplateVar(v.key)}
                    title={v.desc || undefined}
                    className="px-2 py-0.5 rounded-lg text-xs font-mono bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                  >{v.key}</button>
                ))}
                {!isFourInOne && (lessonConfig.customFields || []).map(cf => (
                  <button
                    key={cf.id}
                    type="button"
                    onClick={() => insertTemplateVar(`【${cf.name}】`)}
                    className="px-2 py-0.5 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >【{cf.name}】</button>
                ))}
              </div>
              <p className="text-xs text-[color:var(--ink-4)] leading-relaxed">
                {isFourInOne
                  ? '留空将使用内置默认结构；自动内容由当期成绩、薄弱板块、作业与考勤实时生成。编辑后点「保存模板」写入本课并即时重算全班预览。'
                  : '编辑后左侧预览实时更新；点「保存模板」写入本课，未保存的改动仅用于预览。此处编辑与「生成设置 → 表格字段」的模板互通。'}
              </p>
            </div>
          )}
          </div>
          </CardContent>
        </Card>
      </div>

      {/* 群发预览：左列姓名 / 右列对应私发反馈，排除请假与缺勤 */}
      <Card className="ios-glass-card border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2 text-[color:var(--ink)]">
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              群发预览 · 第{lessonNumber}课
              <Badge variant="secondary" className="rounded-full">{batchRows.length} 人</Badge>
              {excludedAbsentCount > 0 && (
                <Badge className="rounded-full bg-blue-50 text-blue-600 border-0">已排除请假/缺勤 {excludedAbsentCount} 人</Badge>
              )}
            </span>
            <Button variant="outline" size="sm" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-1.5" onClick={handleCopyBatch}>
              <Copy className="w-3.5 h-3.5" />复制全部（群发）
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batchRows.length === 0 ? (
            <p className="text-sm text-[color:var(--ink-4)] text-center py-8">
本课暂无可用于群发的反馈。录入学情后，这里会自动更新。
            </p>
          ) : (
            <ScrollArea className="h-[380px] pr-2">
              <div className="grid grid-cols-[140px_1fr] gap-x-3 text-xs font-semibold text-[color:var(--ink-4)] pb-2 border-b border-black/10">
                <span>同学</span>
                <span>{isFourInOne ? '四个一反馈内容' : '私发反馈内容'}</span>
              </div>
              <div className="divide-y divide-black/5">
                {batchRows.map(row => (
                  <div key={row.name} className="grid grid-cols-[140px_1fr] gap-x-3 py-3 items-start">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 text-white"
                        style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}
                      >
                        {getNickname(row.name).slice(0, 1) || row.name.slice(0, 1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onViewStudent?.(row.name)}
                        aria-label={`查看 ${getNickname(row.name)} 的学情报告`}
                        title="点击查看该生学情报告"
                        className="text-sm font-medium text-[color:var(--ink)] truncate hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb)/0.5)]"
                      >
                        {getNickname(row.name)}
                      </button>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[color:var(--ink-2)] bg-black/[0.02] rounded-xl border border-black/10 p-3 font-sans">
                        {row.text}
                      </pre>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg gap-1 text-[color:var(--ink-4)]" onClick={() => handleCopyBatchRow(row.name, row.text)}>
                          <Copy className="w-3.5 h-3.5" />复制
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
