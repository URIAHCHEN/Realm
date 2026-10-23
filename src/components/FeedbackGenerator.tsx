import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Copy, Check, Wand2, Users, ClipboardList,
  CircleAlert, RotateCcw, Send, Sparkles, Table2, Lightbulb, FileSpreadsheet } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generatePersonalFeedback, generateFourInOne, generateShortNickname, copyToClipboard, DEFAULT_FOUR_IN_ONE_TEMPLATE, FOUR_IN_ONE_VARIABLES, FOUR_IN_ONE_SCENARIOS, FOUR_IN_ONE_VARIANT_COUNT , buildDynamicVariables } from '@/lib/feedbackTemplates';
import { isAbsentRecord, isQuizAssessed } from '@/lib/attendance';
import { exportTeacherElfXlsx } from '@/lib/teacherElfExport';
import { longTermWeakCategories } from '@/lib/longTermWeak';
import { computeStudentReportStats } from '@/lib/reportStats';
import { buildCondensedAdvice } from '@/lib/studentAdvice';
import type { StudentRecord, LessonConfig, QuestionType, ClassStats, OralRatingConfig } from '@/types';

/**
 * 生成可直接粘进表格（Excel / 腾讯文档 / 金山）的 TSV：
 * 单元格内含换行或制表符时按 RFC4180 用双引号包裹并把内部引号转义，
 * 这样粘贴后每份反馈完整落在一个单元格内，不会把版式撑散。
 */
function toTsvCell(text: string): string {
  const t = (text ?? '').replace(/\r\n/g, '\n');
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
  getNickname: (name: string) => string;
  /** 共用 ClassStats 而非内联结构：新增字段（registeredCounts）时不必逐个组件改 */
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => ClassStats;
  /** 口语等附加项的档位判定配置（用于【口语评价】模板参数）；缺省用默认档位 */
  oralRating?: OralRatingConfig;
  /** 班级课次配置表：学习建议要跨课次聚合（与个人报告同口径） */
  lessonConfigs?: { [lesson: string]: LessonConfig };
  libraryLinks?: string[];
  onSaveLessonConfig: (lessonNumber: number, config: Partial<LessonConfig>) => void;
  /** 点击群发列表中的姓名弹出该生学情报告 */
  onViewStudent?: (name: string) => void;
  /** 班级名（仅用于导出文件名） */
  className?: string;
}

type StatusTone = 'none' | 'generated' | 'copied';

export function FeedbackGenerator({
  students,
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats,
  oralRating,
  lessonConfigs = {},
  libraryLinks = [],
  onSaveLessonConfig,
  onViewStudent,
  className
}: FeedbackGeneratorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [copiedSet, setCopiedSet] = useState<Set<string>>(new Set());

  // 模板旁编辑 + 实时预览
  const [showTemplate, setShowTemplate] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState(lessonConfig.feedbackTemplate);
  const [draftFourInOne, setDraftFourInOne] = useState(lessonConfig.fourInOneTemplate || DEFAULT_FOUR_IN_ONE_TEMPLATE);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // 反馈模式：常规模板 / 四个一
  const [feedbackMode, setFeedbackMode] = useState<'normal' | 'fourInOne'>('normal');
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

  const stats = useMemo(() =>
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  // 切换课次时重置批量状态
  useEffect(() => {
    setGenerated({});
    setCopiedSet(new Set());
    setSelected(null);
  }, [lessonNumber]);

  const recordOf = (name: string) =>
    lessonRecords.find(r => r.studentName === name);

  // 表格字段 → 可选参数（题型含口语得分等附加项、自定义列），与 lib 的替换逻辑同一份定义
  const dynamicVars = useMemo(
    () => buildDynamicVariables(lessonConfig),
    [lessonConfig]
  );

  // 长期薄弱板块（跨课次）：给「附参考教辅」挑资料用
  const weakOf = (name: string): string[] =>
    longTermWeakCategories(records.filter(r => r.studentName === name), lessonConfigs);

  const generateFor = (name: string): string | null => {
    const record = recordOf(name);
    if (!record) return null;
    if (feedbackMode === 'fourInOne') {
      return generateFourInOne(record, lessonConfig, stats, getNickname(name), isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, { '【学习建议】': adviceMap[name] || '' }, weakOf(name));
    }
    return generatePersonalFeedback(record, lessonConfig, stats, getNickname(name), draftFeedback, oralRating, { '【学习建议】': adviceMap[name] || '' });
  };

  // 模板 / 场景 / 变体 / 开关改动：已生成的内容**自动按新规则重算**
  //（2026-10-23：原实现是"清空全部已生成"，切换开关后预览直接空白、还得重新点一键生成；
  //  且只刷新当前选中 → 复制对照表/导出时其他学员仍是旧话术，用户反馈"改了模板没看到效果"）
  useEffect(() => {
    setGenerated(prev => {
      const names = Object.keys(prev);
      if (names.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      names.forEach(n => {
        const t = generateFor(n);
        if (t != null && t !== next[n]) { next[n] = t; changed = true; }
      });
      return changed ? next : prev;
    });
    // 内容变了，"已发送"标记失效
    setCopiedSet(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeedback, draftFourInOne, scenario, variant, isNewStudent, withMaterials, feedbackMode]);

  // 外部模板变化（保存成功 / 切换课次或班级）时回填草稿
  useEffect(() => { setDraftFeedback(lessonConfig.feedbackTemplate); }, [lessonConfig.feedbackTemplate]);
  useEffect(() => { setDraftFourInOne(lessonConfig.fourInOneTemplate || DEFAULT_FOUR_IN_ONE_TEMPLATE); }, [lessonConfig.fourInOneTemplate]);

  const isFourInOne = feedbackMode === 'fourInOne';
  const activeTemplate = isFourInOne ? draftFourInOne : draftFeedback;
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

  // 保存当前模式模板到课次配置，并按新模板重算所有已生成反馈
  const handleSaveTemplate = () => {
    if (isFourInOne) {
      onSaveLessonConfig(lessonNumber, { fourInOneTemplate: draftFourInOne });
    } else {
      onSaveLessonConfig(lessonNumber, { feedbackTemplate: draftFeedback });
    }
    setGenerated(prev => {
      const next: Record<string, string> = {};
      Object.keys(prev).forEach(name => { const t = generateFor(name); if (t) next[name] = t; });
      return next;
    });
    toast.success('模板已保存，已按新模板重新生成');
  };

  const resetTemplateToDefault = () => {
    if (isFourInOne) setDraftFourInOne(DEFAULT_FOUR_IN_ONE_TEMPLATE);
    else setDraftFeedback(lessonConfig.feedbackTemplate);
    toast.info('已恢复模板草稿');
  };

  const ensureGenerated = (name: string): string | null => {
    if (generated[name]) return generated[name];
    const text = generateFor(name);
    if (text) {
      setGenerated(prev => ({ ...prev, [name]: text }));
    }
    return text;
  };

  const handleSelect = (name: string) => {
    setSelected(name);
    ensureGenerated(name);
  };

  const handleGenerateAll = () => {
    const withRecords = students.filter(s => recordOf(s));
    if (withRecords.length === 0) {
      toast.error(`第${lessonNumber}课还没有学情记录，请先到「学情记录」保存`);
      return;
    }
    const next = { ...generated };
    let fresh = 0;
    withRecords.forEach(name => {
      if (!next[name]) {
        const text = generateFor(name);
        if (text) {
          next[name] = text;
          fresh++;
        }
      }
    });
    setGenerated(next);
    if (!selected) setSelected(withRecords[0]);
    toast.success(fresh > 0
      ? `已生成 ${fresh} 份新反馈，共 ${Object.keys(next).length} 份`
      : '全部反馈已是最新，无需重新生成'
    );
    const absentCount = withRecords.filter(n => {
      const r = recordOf(n);
      return r && isAbsentRecord(r);
    }).length;
    if (absentCount > 0) toast.info(`其中 ${absentCount} 名本课请假/缺勤，已按请假处理（不计入平均分）`);
  };

  const handleCopyOne = async (name: string) => {
    const text = generated[name] ?? ensureGenerated(name);
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => new Set(prev).add(name));
      toast.success(`已复制 ${getNickname(name)} 的私发反馈`);
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const handleResetStatus = () => {
    setCopiedSet(new Set());
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
      const srs = records.filter(r => r.studentName === name).sort((a, b) => a.lessonNumber - b.lessonNumber);
      if (srs.length === 0) { map[name] = ''; return; }
      const st = computeStudentReportStats(srs, lessonConfigs, opts);
      map[name] = buildCondensedAdvice(generateShortNickname(getNickname(name)), srs, st, lessonConfigs);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, records, lessonConfigs, lessonConfig]);

  // 一键复制某生的学习建议（精简版）
  const handleCopyAdvice = async (name: string) => {
    const rec = recordOf(name);
    if (!rec || !isQuizAssessed(rec)) { toast.error('本课不在课（请假/缺勤/调课调出），无法生成学习建议'); return; }
    const text = adviceMap[name];
    if (!text) { toast.error('暂无可复制的学习建议'); return; }
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`已复制 ${getNickname(name)} 的学习建议（精简版）`);
    else toast.error('复制失败，请手动选择复制');
  };

  // 一键复制全班学习建议（学生 | 学习建议 两列表格）
  const handleCopyAdviceBatch = async () => {
    const rows = students
      .map(name => ({ name, rec: recordOf(name) }))
      .filter(x => x.rec && isQuizAssessed(x.rec))
      .map(x => ({ name: x.name, text: adviceMap[x.name] || '' }))
      .filter(x => x.text);
    if (rows.length === 0) { toast.error('没有可复制的学习建议（本课暂无到课学员）'); return; }
    const text = buildTsvTable(['学生姓名', '学习建议'], rows.map(r => [getNickname(r.name), r.text]));
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`已复制 ${rows.length} 位学员的学习建议（两列表格）`);
    else toast.error('复制失败，请手动选择复制');
  };

  // 群发预览：仅含有记录且非请假/缺勤的学员；内容按当前模板（课次配置/默认/界面修改后的草稿）实时生成
  // 注意：withMaterials 必须进依赖 —— 否则取消勾选「附参考教辅」后群发预览仍带旧文本（历史缺陷）
  const batchRows = useMemo(() => {
    return students
      .map(name => ({ name, record: recordOf(name) }))
      // 2026-10-17：批量复制/群发只保留「在课」学员 —— 请假/缺勤排除；调课按调入/调出分流，调出（无小测数据）也排除
      .filter(x => x.record && isQuizAssessed(x.record))
      .map(x => ({ name: x.name, text: generateFor(x.name) ?? '' }));
    // 依赖必须覆盖所有内容源（2026-10-17 补全）：else 改模板/资料库/昵称后
    // 群发预览与教师精灵表导出的文本还是旧值。
    // · adviceMap 随 lessonConfigs 变化（【学习建议】来源）
    // · libraryLinks 由父级内联生成（每次新数组），用内容指纹比较避免每次都重算
    // · getNickname 是父级内联箭头函数，直接放依赖会让 memo 永久失效，
    //   但输入模板时本就每次重算，额外成本可忽略；不加则改名后导出仍是旧昵称
    // eslint-disable-next-line react-hooks/exhaustive-deps -- libraryLinks 用内容指纹比较，避免父级内联数组每次触发重算
  }, [students, lessonRecords, stats, draftFeedback, draftFourInOne, feedbackMode, scenario, isNewStudent, variant, withMaterials, lessonConfig, adviceMap, oralRating, getNickname, libraryLinks.join('\u0001')]);

  // 自动排除「不在课」学员并在复制后明确提示，避免漏发：
  //   请假/缺勤 + 调课-调出（无小测数据，成绩以原班级为准）；调课-调入照常复制
  const absentNames = useMemo(
    () => lessonRecords.filter(r => isAbsentRecord(r)).map(r => getNickname(r.studentName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonRecords]
  );
  const transferOutNames = useMemo(
    () => lessonRecords.filter(r => !isQuizAssessed(r) && !isAbsentRecord(r)).map(r => getNickname(r.studentName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonRecords]
  );
  const excludedNames = useMemo(() => [...absentNames, ...transferOutNames], [absentNames, transferOutNames]);
  const excludedAbsentCount = absentNames.length;

  // 一键复制全班（表格）：一列学生 / 一列私发 / 一列四个一，直接粘进表格即可对照
  const handleCopyBatchTable = async () => {
    if (batchRows.length === 0) {
      toast.error('没有可复制的反馈（本课暂无到课学员记录）');
      return;
    }
    const rows = batchRows.map(r => {
      const rec = recordOf(r.name);
      const privateText = rec ? generatePersonalFeedback(rec, lessonConfig, stats, getNickname(r.name), draftFeedback, oralRating, { '【学习建议】': adviceMap[r.name] || '' }) : '';
      const fourInOneText = rec
        ? generateFourInOne(rec, lessonConfig, stats, getNickname(r.name), isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, { '【学习建议】': adviceMap[r.name] || '' }, weakOf(r.name))
        : '';
      return [getNickname(r.name), privateText, fourInOneText];
    });
    const text = buildTsvTable(['学生姓名', '私发反馈', '四个一反馈'], rows);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => { const n = new Set(prev); batchRows.forEach(r => n.add(r.name)); return n; });
      toast.success(`已复制 ${rows.length} 位学员的对照表（学生 / 私发 / 四个一）`, {
        description: excludedNames.length
          ? `已自动排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）：${excludedNames.join('、')}`
          : '粘贴到表格即可按列对照；含多行的反馈会整体落在一个单元格内',
      });
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  // 一键复制全班（单列）：按当前模式只导出私发或只导出四个一
  const handleCopyBatchSingle = async () => {
    if (batchRows.length === 0) {
      toast.error('没有可复制的反馈（本课暂无到课学员记录）');
      return;
    }
    const isFour = feedbackMode === 'fourInOne';
    const rows = batchRows.map(r => {
      const rec = recordOf(r.name);
      const text = rec
        ? (isFour
          ? generateFourInOne(rec, lessonConfig, stats, getNickname(r.name), isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, { '【学习建议】': adviceMap[r.name] || '' }, weakOf(r.name))
          : generatePersonalFeedback(rec, lessonConfig, stats, getNickname(r.name), draftFeedback, oralRating, { '【学习建议】': adviceMap[r.name] || '' }))
        : '';
      return [getNickname(r.name), text];
    });
    const text = buildTsvTable(['学生姓名', isFour ? '四个一反馈' : '私发反馈'], rows);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => { const n = new Set(prev); batchRows.forEach(r => n.add(r.name)); return n; });
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
  const ELF_KIND_LABEL: Record<'private' | 'fourInOne' | 'advice', string> = {
    private: '私发反馈', fourInOne: '四个一反馈', advice: '学习建议',
  };
  const buildElfText = (name: string, kind: 'private' | 'fourInOne' | 'advice'): string => {
    if (kind === 'advice') return adviceMap[name] || '';
    const rec = recordOf(name);
    if (!rec) return '';
    const adviceRef = { '【学习建议】': adviceMap[name] || '' };
    return kind === 'fourInOne'
      ? generateFourInOne(rec, lessonConfig, stats, getNickname(name), isNewStudent, libraryLinks, variant, draftFourInOne, scenario, withMaterials, oralRating, adviceRef, weakOf(name))
      : generatePersonalFeedback(rec, lessonConfig, stats, getNickname(name), draftFeedback, oralRating, adviceRef);
  };
  const handleExportTeacherElf = async () => {
    if (batchRows.length === 0) {
      toast.error('没有可导出的反馈（本课暂无在课学员记录）');
      return;
    }
    if (elfWithD && elfColD === elfColC) {
      toast.error('C 列与 D 列选了同一种内容，请换一个');
      return;
    }
    try {
      const rows = batchRows.map(r => ({
        name: getNickname(r.name),
        text1: buildElfText(r.name, elfColC),
        text2: elfWithD ? buildElfText(r.name, elfColD) : undefined,
      })).filter(r => r.text1 || r.text2);
      const { filename, truncated } = await exportTeacherElfXlsx({ className, lessonNumber, rows, includeText2: elfWithD });
      const colDesc = elfWithD
        ? `B-D 列 = 学生姓名 / ${ELF_KIND_LABEL[elfColC]} / ${ELF_KIND_LABEL[elfColD]}`
        : `B-C 列 = 学生姓名 / ${ELF_KIND_LABEL[elfColC]}`;
      const notes = [
        `${colDesc}，共 ${rows.length} 人`,
        excludedNames.length ? `已排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）` : '',
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
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => { const n = new Set(prev); batchRows.forEach(r => n.add(r.name)); return n; });
      toast.success(`已复制 ${batchRows.length} 份反馈（纯文本，分隔线隔开）`, {
        description: excludedNames.length ? `已自动排除 ${excludedNames.length} 位不在课学员（请假/缺勤/调课调出）：${excludedNames.join('、')}` : undefined,
      });
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const handleCopyBatchRow = async (name: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSet(prev => new Set(prev).add(name));
      toast.success(`已复制 ${getNickname(name)} 的反馈`);
    } else {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const statusTone = (name: string): StatusTone => {
    if (copiedSet.has(name)) return 'copied';
    if (generated[name]) return 'generated';
    return 'none';
  };

  const withRecordsCount = students.filter(s => recordOf(s)).length;
  const generatedCount = students.filter(s => generated[s]).length;
  const copiedCount = copiedSet.size;
  const progressPct = withRecordsCount > 0
    ? Math.round((generatedCount / withRecordsCount) * 100)
    : 0;

  const selectedRecord = selected ? recordOf(selected) : undefined;

  const statusBadge = (name: string) => {
    const tone = statusTone(name);
    if (tone === 'copied') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 rounded-full">
          <Check className="w-3 h-3" />已发送
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
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ background: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgb(var(--brand-rgb)/0.7))' }}>
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">私发反馈工作台 · 第{lessonNumber}课</p>
                <p className="text-xs text-[color:var(--ink-4)]">一键生成全班话术；复制为「学生 / 私发 / 四个一」三列对照表，或直接导出教师精灵模板（请假 / 缺勤 / 调课调出自动排除）</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2 bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90" onClick={handleGenerateAll}>
                <Wand2 className="w-4 h-4" />
                一键生成全班
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2 border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)]"
                onClick={handleCopyBatchTable}
                title="一列学生、一列私发、一列四个一；粘贴到 Excel / 腾讯文档即成对照表"
              >
                <Table2 className="w-4 h-4" />
                复制对照表（三列）
              </Button>
              <Button
                variant="outline"
                className={`h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2 border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.06)] ${elfOpen ? 'bg-[rgb(var(--brand-rgb)/0.08)]' : ''}`}
                onClick={() => setElfOpen(v => !v)}
                title="按教师精灵（企鹅教师助手）模板导出：默认「学生姓名 + 私发反馈」两列，可选内容与是否再加一列"
              >
                <FileSpreadsheet className="w-4 h-4" />
                导出教师精灵表
              </Button>
              <Button variant="outline" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2" onClick={handleCopyBatchSingle}
                title={feedbackMode === 'fourInOne' ? '只导出「学生 / 四个一」两列' : '只导出「学生 / 私发」两列'}>
                <Copy className="w-4 h-4" />
                仅复制{feedbackMode === 'fourInOne' ? '四个一' : '私发'}（两列）
              </Button>
              <Button variant="outline" className="h-9 px-3.5 text-sm rounded-[var(--r-md)] gap-2" onClick={handleCopyAdviceBatch}
                title="学生 | 学习建议（精简版）两列表格，粘贴进 Excel / 腾讯文档即成对照表">
                <Lightbulb className="w-4 h-4" />
                复制学习建议（两列）
              </Button>
              <Button variant="ghost" className="h-9 px-3 text-sm rounded-[var(--r-md)] gap-1.5 text-[color:var(--ink-4)]" onClick={handleCopyBatch} title="纯文本 + 分隔线，适合直接发群里">
                <ClipboardList className="w-4 h-4" />
                复制纯文本
              </Button>
              <div role="tablist" className="inline-flex gap-1 p-1 rounded-[var(--r-md)] bg-black/[0.05]">
              <button
              role="tab" aria-selected={feedbackMode === 'normal'}
              onClick={() => setFeedbackMode('normal')}
              className={`px-3 h-8 rounded-lg text-sm font-medium transition-all ${feedbackMode === 'normal' ? 'bg-white shadow-sm text-[color:var(--ink)]' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
              >常规反馈</button>
              <button
              role="tab" aria-selected={feedbackMode === 'fourInOne'}
              onClick={() => setFeedbackMode('fourInOne')}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-all ${feedbackMode === 'fourInOne' ? 'bg-white shadow-sm text-[color:var(--ink)]' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
              ><Sparkles className="w-3.5 h-3.5" />四个一</button>
              </div>
              <Button variant="ghost" className="rounded-xl gap-1.5 h-9 text-[color:var(--ink-4)]" onClick={handleResetStatus}>
                <RotateCcw className="w-4 h-4" />
                重置状态
              </Button>
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
              <span className="text-[11px] text-[color:var(--ink-4)]">内容按当前模板草稿实时生成；请假 / 缺勤 / 调课调出自动排除</span>
            </div>
          )}

          {/* 反馈模式 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {feedbackMode === 'fourInOne' && (
              <>
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
              </>
            )}
          </div>

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
                已发送 <span className="font-semibold text-emerald-600">{copiedCount}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
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
                    const hasRecord = !!recordOf(s);
                    const tone = statusTone(s);
                    const isActive = selected === s;
                    return (
                      <div
                        key={s}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(s)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(s); } }}
                        className={`group w-full cursor-pointer flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${
                          isActive
                            ? 'bg-[rgb(var(--brand-rgb)/0.1)] ring-1 ring-[rgb(var(--brand-rgb)/0.35)]'
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
                            {hasRecord ? `${recordOf(s)!.totalScore}分 · 第${recordOf(s)!.rank}名` : '本课无记录'}
                          </span>
                        </span>
                        {/* 一键复制学习建议（精简版）—— 与「四个一」复制的同级快捷入口 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleCopyAdvice(s); }}
                          title="复制学习建议（精简版，可直接发家长）"
                          className="p-1.5 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.08)] flex-shrink-0 transition-opacity"
                        >
                          <Lightbulb className="w-4 h-4" />
                        </button>
                        {tone === 'copied' ? (
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : tone === 'generated' ? (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--brand-rgb))' }} />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* 编辑区 */}
        <Card className="ios-glass-card border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between gap-2 text-[color:var(--ink)]">
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                {selected ? `${getNickname(selected)} 的反馈内容` : '反馈内容'}
              </span>
              <span className="flex items-center gap-2">
                {selected && statusBadge(selected)}
                <button
                  onClick={() => setShowTemplate(v => !v)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-all ${showTemplate ? 'bg-[rgb(var(--brand-rgb)/0.12)] border-[rgb(var(--brand-rgb)/0.35)] text-[color:var(--brand)]' : 'bg-black/[0.04] border-transparent text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'}`}
                  title="在右侧编辑并预览反馈模板"
                >
                  <Wand2 className="w-3.5 h-3.5" />{isFourInOne ? '四个一模板' : '反馈模板'}
                </button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
          <div className={showTemplate ? 'grid gap-5 lg:grid-cols-2 items-start' : ''}>
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
                <Textarea
                  value={generated[selected] ?? ''}
                  onChange={(e) => setGenerated(prev => ({ ...prev, [selected]: e.target.value }))}
                  className="min-h-[280px] text-sm leading-relaxed rounded-[var(--r-md)]"
                  placeholder="点击上方「一键生成全班」或直接输入反馈内容…"
                />
                {(lessonConfig.customFields || []).length > 0 && selectedRecord && (
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
                          onClick={() => setGenerated(prev => ({ ...prev, [selected]: `${prev[selected] ?? ''}\n📋 ${cf.name}：${disp}` }))}
                          className="px-2 py-0.5 rounded-lg text-xs bg-[rgb(var(--brand-rgb)/0.1)] text-[color:var(--brand)] hover:bg-[rgb(var(--brand-rgb)/0.18)] border border-[rgb(var(--brand-rgb)/0.2)] transition-colors"
                        >+ {cf.name}：{disp}</button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[color:var(--ink-4)]">
                    内容可自由编辑；薄弱项与成绩详情已按班均自动计算
                  </p>
                  <Button className="ios-button gap-2" onClick={() => handleCopyOne(selected)}>
                    <Copy className="w-4 h-4" />
                    复制并发送
                  </Button>
                </div>
              </>
            )}
          </div>
          {showTemplate && (
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
挺安静的——本课还没有到课学员的学情记录。去「学情记录」录入后，这里会自动生成每一份私发反馈
            </p>
          ) : (
            <ScrollArea className="h-[380px] pr-2">
              <div className="grid grid-cols-[140px_1fr] gap-x-3 text-xs font-semibold text-[color:var(--ink-4)] pb-2 border-b border-black/10">
                <span>同学</span>
                <span>私发反馈内容</span>
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
