import type { StudentRecord, ClassStats, LessonConfig } from '@/types';
import { isAbsentRecord, attendanceKind } from '@/lib/attendance';
import { computeCategoryWeakPoints, formatCategoryWeakPoint, isQtStrong } from '@/lib/weakPoints';
import { getLessonFullScore } from '@/lib/lessonFullScore';

// 生成短昵称（三字取后两字，两字取最后一字叠词）
export function generateShortNickname(fullName: string): string {
  if (fullName.length >= 3) {
    return fullName.slice(-2);
  } else if (fullName.length === 2) {
    const lastChar = fullName.slice(-1);
    return lastChar + lastChar;
  }
  return fullName;
}

// 生成个性化私发反馈
export function generatePersonalFeedback(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  nickname: string,
  templateOverride?: string
): string {
  if (isAbsentRecord(record)) {
    return `${nickname}家长您好！\n\n第${record.lessonNumber}课孩子${record.attendance}，未参与本课入门测。落下的内容与补课安排我会另行同步～`;
  }
  const weakPoints = computeCategoryWeakPoints(record, lessonConfig.questionTypes, stats.avgScores);
  const baseTemplate = (templateOverride != null ? templateOverride : lessonConfig.feedbackTemplate);
  let template = baseTemplate;
  
  // 构建成绩详情
  const scoreDetails = lessonConfig.questionTypes.map(qt => {
    const score = record.scores[qt.id] || 0;
    const avgScore = stats.avgScores[qt.id] || 0;
    const diff = score - avgScore;
    const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    return `• ${qt.name}：${score}/${qt.fullScore}分（班均${avgScore.toFixed(1)}，${diffText}）`;
  }).join('\n');
  
  // 计算满分（统一来源：题型满分 + 计入总分的自定义列满分）
  const fullScore = getLessonFullScore(lessonConfig);
  
  // 生成短昵称
  const shortNickname = generateShortNickname(nickname);
  
  // 处理薄弱项 - 如果没有薄弱项，删除包含【薄弱项】的行
  if (weakPoints.length === 0) {
    // 删除包含【薄弱项】的整行
    template = template.replace(/.*【薄弱项】.*\n?/g, '');
  } else {
    // 构建薄弱项文本（按板块）
    const weakPointsText = weakPoints.map(formatCategoryWeakPoint).join('、');
    template = template.replace(/【薄弱项】/g, weakPointsText);
  }
  
  // 自定义列：占位符替换 + 未使用的自动追加
  const customFields = lessonConfig.customFields || [];
  const customVals = record.customValues || {};
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const customDisplay = (kind: 'select' | 'number', id: string): string => {
    const v = customVals[id];
    if (v === '' || v == null) return '';
    return kind === 'number' ? `${v}分` : String(v);
  };
  const rawTemplate = baseTemplate;
  customFields.forEach(cf => {
    template = template.replace(new RegExp('【' + escRe(cf.name) + '】', 'g'), customDisplay(cf.kind, cf.id));
  });

  // 替换模板变量
  let feedback = template
    .replace(/【学生昵称】/g, nickname)
    .replace(/【学生短昵称】/g, shortNickname)
    .replace(/【课次】/g, record.lessonNumber.toString())
    .replace(/【考勤】/g, record.attendance)
    .replace(/【课堂表现】/g, record.classPerformance || '')
    .replace(/【作业】/g, record.homeworkStatus)
    .replace(/【课后任务】|【乐听说】/g, record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus)
    .replace(/【成绩详情】/g, scoreDetails)
    .replace(/【总分】/g, record.totalScore.toString())
    .replace(/【满分】/g, fullScore.toString())
    .replace(/【排名】/g, record.rank.toString())
    .replace(/【正确率】/g, record.correctRate.toString())
    .replace(/【作业内容】/g, lessonConfig.homeworkText);

  // 模板未引用、但已填写的自定义列 → 末尾自动附上，保证“直接可用”
  const leftover = customFields.filter(cf => {
    const v = customVals[cf.id];
    return (v !== '' && v != null) && !rawTemplate.includes('【' + cf.name + '】');
  });
  if (leftover.length > 0) {
    feedback += '\n\n' + leftover.map(cf => `📋 ${cf.name}：${customDisplay(cf.kind, cf.id)}`).join('\n');
  }

  return feedback;
}

// 「四个一」默认模板与可用占位符（可在反馈工作台旁边直接改写；留空即用此默认结构）
// 参考教辅推荐（家长常问「该买什么资料」，这里给一份精选清单）
// 原则：只留最值得买的、按需自选；听说练习与难度调节各并成一行，不堆砌。
export const FOUR_IN_ONE_MATERIALS =
`📚 参考教辅（按需自选，不必都买）：语法《哈佛英语》（买初中全一册，不分年级）｜完型《哈佛英语》（分年级）｜阅读《英语时文阅读》（期刊，主题新颖贴近时事）｜写作《新东方中考英语满分作文》
🎧 听说练习：想多做题可买《蓝皮英语》；想多输入，可以跟读校本课文、在家当背景放英文歌/英文电影（看孩子兴趣），或用【每日英语听力】App 按自己的程度挑喜欢的材料听读跟读～
💡 想加难度：完型与《英语时文阅读》都有年级版本，买高 1-2 个年级即可`;

export const DEFAULT_FOUR_IN_ONE_TEMPLATE =
`【第【课次】课 · 【昵称】】
【开场】
【场景引导】🌟 优秀表现：【优秀表现】
🔍 待提升：【待提升】
🛠 下一步：【下一步】【新学员补充】
【参考教辅】
【结尾】`;

export const FOUR_IN_ONE_VARIABLES: { key: string; desc: string }[] = [
  { key: '【课次】', desc: '当前课次' },
  { key: '【昵称】', desc: '学生昵称' },
  { key: '【开场】', desc: '开场语，随「换一版措辞」轮换' },
  { key: '【场景引导】', desc: '按课次阶段自动带的一句引导语' },
  { key: '【优秀表现】', desc: '自动：本讲亮点' },
  { key: '【待提升】', desc: '自动：薄弱板块 / 作业 / 考勤' },
  { key: '【下一步】', desc: '自动：巩固动作' },
  { key: '【素材】', desc: '课堂照片 / 视频链接' },
  { key: '【新学员补充】', desc: '勾选「新学员」时自动补一句，否则留空' },
  { key: '【参考教辅】', desc: '教辅推荐清单（3 行），可通过「附参考教辅」开关整块隐藏' },
  { key: '【结尾】', desc: '按场景轮换的收尾语 / 行动召唤' },
];

// 三类场景各自的话术包：开场（6 版）、结尾（3-4 版）、场景引导语
type FourInOnePack = { openers: string[]; closings: string[]; intro: string };
export const FOUR_IN_ONE_PACKS: Record<'daily' | 'afterclass' | 'comm', FourInOnePack> = {
  daily: {
    intro: '',
    openers: [
      '家长您好，跟您反馈下孩子这堂课的情况：',
      '跟您同步一下孩子这堂课的课堂表现：',
      '本堂课学情反馈来啦，您瞧瞧：',
      '今天的课上完啦，孩子的情况跟您说几句：',
      '这堂课的课堂观察整理如下，供您参考：',
      '家长好，反馈一下孩子这节课的上课状态：',
    ],
    closings: [
      '感谢配合，我们一起帮孩子进步！',
      '家里有什么情况随时跟我说，咱们同步着来～',
      '孩子有进步我会第一时间告诉您，一起加油！',
    ],
  },
  afterclass: {
    intro: '这一讲在行课中段，重点是前后知识的衔接和错题复盘。\n',
    openers: [
      '家长您好，课程进行到这里，跟您同步下孩子这堂课的状态：',
      '这堂课接着上次的进度，孩子的表现跟您聊聊：',
      '行课中阶段，反馈一下孩子这堂课的掌握情况：',
      '本讲内容承接前面，孩子的落实情况如下：',
      '课程推进中，这堂课的课堂观察跟您说说：',
      '阶段巩固关键期，先反馈孩子这堂课的情况：',
    ],
    closings: [
      '阶段内容环环相扣，落下的我课上帮着补，家里按节奏督促就好。',
      '这个阶段巩固比赶进度更重要，咱们一起盯紧错题。',
      '下次课前记得让孩子回看本讲笔记，有问题随时找我。',
    ],
  },
  comm: {
    intro: '',
    openers: [
      '家长您好，想跟您简单沟通下孩子最近的情况：',
      '借用您一点时间，反馈并了解下孩子的学习：',
      '家长好，关于孩子这阵子的状态，想跟您对齐一下：',
      '跟您聊聊孩子这堂课的表现，也想听听您的观察：',
      '孩子近况想跟您同步，也方便我们一起配合：',
      '有几句关于孩子的反馈，顺便想跟您沟通下：',
    ],
    closings: [
      '您方便的话，咱们可以约个时间细聊孩子的情况～',
      '家里观察到什么也随时告诉我，咱们一起想办法。',
      '感谢您的时间，有问题我们及时沟通！',
    ],
  },
};
export const FOUR_IN_ONE_VARIANT_COUNT = 6;
export const FOUR_IN_ONE_SCENARIOS: { key: 'daily' | 'afterclass' | 'comm'; label: string }[] = [
  { key: 'daily', label: '首课&日常' },
  { key: 'afterclass', label: '行课中' },
  { key: 'comm', label: '沟通' },
];

// “四个一”反馈（可直接发送版）：按首课/行课中/沟通场景区分，每场景 6 版措辞
export function generateFourInOne(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  nickname: string,
  isNewStudent = false,
  candidateLinks: string[] = [],
  variant = 0,
  templateOverride?: string,
  scenarioKey: 'daily' | 'afterclass' | 'comm' = 'daily',
  /** 是否附「参考教辅」清单（关闭时整行移除） */
  withMaterials = true
): string {
  if (isAbsentRecord(record)) {
    return `【第${record.lessonNumber}课 · ${nickname}】\n孩子这堂课${record.attendance}，没有参与本讲的测评。落下的内容和补课安排我会单独跟您同步，也欢迎您随时跟我说说孩子的情况～`;
  }
  const pack = FOUR_IN_ONE_PACKS[scenarioKey] || FOUR_IN_ONE_PACKS.daily;
  const n = FOUR_IN_ONE_VARIANT_COUNT;
  const v = ((variant % n) + n) % n;
  const opener = pack.openers[v % pack.openers.length];
  const closing = pack.closings[Math.floor(v / 2) % pack.closings.length];

  const strong = lessonConfig.questionTypes
    .map(qt => ({ qt, name: qt.name, s: record.scores[qt.id] || 0, avg: stats.avgScores[qt.id] || 0, full: qt.fullScore }))
    .filter(x => x.avg > 0 && isQtStrong(x.qt, x.s, x.avg))
    .sort((a, b) => (b.s - b.avg) - (a.s - a.avg));
  const weak = computeCategoryWeakPoints(record, lessonConfig.questionTypes, stats.avgScores);
  const homeworkGood = record.homeworkStatus === '超赞完成';
  const homeworkBad = record.homeworkStatus === '未完成' || record.homeworkStatus === '没带';
  const attendKind = attendanceKind(record.attendance);
  const attendBad = attendKind === 'absent' ? '缺勤' : attendKind === 'late' ? '迟到' : attendKind === 'leave' ? '请假' : '';

  // 亮点：同一档位备两种说法，随「换一版措辞」轮换，避免每位家长收到同一句
  const pick = <T,>(pair: [T, T]): T => pair[v % 2];
  let praise: string;
  if (strong.length) {
    const s0 = strong[0];
    const gap = Math.max(0, Math.round(s0.s - s0.avg));
    praise = pick([
      `${s0.name}这次很亮眼——${s0.s}/${s0.full}，比班级平均高出 ${gap} 分`,
      `${s0.name}是这次的强项，${s0.s}/${s0.full}，高出班均 ${gap} 分，看得出是真会了`,
    ]);
  } else if (record.correctRate >= 90) {
    praise = pick([
      `入门测正确率 ${record.correctRate}%，整张卷子掌握得比较扎实`,
      `这次正确率 ${record.correctRate}%，整体很稳，没有明显短板`,
    ]);
  } else if (homeworkGood) {
    praise = pick(['书面作业完成质量很高', '书面作业做得认真，完成质量很高']);
  } else {
    praise = pick(['课堂状态稳定，能跟上节奏', '这堂课跟得比较稳，课堂状态在线']);
  }

  const issueParts: string[] = [];
  if (weak.length) {
    const w0 = weak[0];
    const rate = Math.round(w0.studentRate * 100);
    const gap = Math.max(0, Math.round(Math.abs(w0.diffRate) * 100));
    issueParts.push(pick([
      `${w0.category}是最值得再补的一块：得分率 ${rate}%，比班级平均低 ${gap} 个百分点`,
      `${w0.category}这块可以再抓一抓——得分率 ${rate}%，低于班均 ${gap} 个百分点`,
    ]));
  }
  if (homeworkBad) issueParts.push(`书面作业${record.homeworkStatus}`);
  if (attendBad) issueParts.push(`本课${attendBad}`);
  const issue = issueParts.length ? issueParts.join('；') : '这次没发现明显的薄弱环节，整体状态是稳的';

  const nextAction = weak.length
    ? `针对${weak[0].category}板块（${weak[0].questionTypeNames.join('、')}）做几道同类练习，错题收进错题本；有余力的话，让孩子把思路讲给您听一遍，比再做十道都管用`
    : homeworkBad
      ? '今晚把这次的作业补齐并订正，下次课带来我看一下'
      : attendBad
        ? '课后回看一下本讲的笔记和回放，把落下的内容补上，有不清楚的地方随时问我'
        : '照现在的节奏走就好，课后任务按计划完成、错题及时过一遍';
  const planLead = scenarioKey === 'afterclass' ? '这阶段重点抓一下：' : scenarioKey === 'comm' ? '最想请您配合的是：' : '课后建议：';
  const plan = `${planLead}${nextAction}`;

  const raw = (templateOverride != null ? templateOverride : lessonConfig.fourInOneTemplate);
  const base = (raw && raw.trim()) ? raw : DEFAULT_FOUR_IN_ONE_TEMPLATE;
  // 兼容历史模板：剔除「🎬 课堂照片/视频」整行
  const tpl = base
    .split('\n')
    .filter(l => !l.includes('课堂照片/视频'))
    // 关闭教辅清单：先摘掉占位符本身，再丢弃「只剩标签」的空行（如「📚 参考教辅：」）；
    // 同一行若还有「下一步」等其他内容则保留，不会误删
    .map(l => (withMaterials ? l : l.replace(/【参考教辅】/g, '')))
    .filter(l => {
      if (withMaterials) return true;
      const stripped = l.replace(/[\s:：📚🎧💡|｜·—\-*]/gu, '');
      return stripped.length > 0;
    })
    .join('\n');

  return tpl
    .replace(/【课次】/g, String(record.lessonNumber))
    .replace(/【昵称】/g, nickname)
    .replace(/【场景】/g, '')
    .replace(/【开场】/g, opener)
    .replace(/【场景引导】/g, pack.intro)
    .replace(/【优秀表现】/g, praise)
    .replace(/【待提升】/g, issue)
    .replace(/【下一步】/g, plan)
    .replace(/【素材】/g, candidateLinks[0] || '见附件')
    .replace(/【结尾】/g, closing)
    .replace(/【新学员补充】/g, isNewStudent ? '\n孩子刚加入不久，也欢迎您跟我说说他的感受和习惯，方便我们更快对上节奏～' : '')
    .replace(/【参考教辅】/g, withMaterials ? `\n${FOUR_IN_ONE_MATERIALS}` : '');
}

// 生成班群表彰
export function generatePraise(
  lessonNumber: number,
  records: StudentRecord[],
  lessonConfig: LessonConfig,
  stats: ClassStats,
  getNickname: (name: string) => string,
  praiseType: 'entrance' | 'listening' | 'comprehensive' = 'comprehensive',
  /** 指定模板内容（多模板管理时传入所选模板），缺省用 lessonConfig.praiseTemplate */
  templateOverride?: string
): string {
  const template = templateOverride ?? lessonConfig.praiseTemplate;
  
  let praiseContent = '';
  
  if (praiseType === 'entrance' || praiseType === 'comprehensive') {
    // 入门测风云榜（请假/缺勤学员不计入）
    // 默认表彰前三名；同分并列一并纳入；表彰总人数控制在 6 人以内
    const scored = records
      .filter(r => r.totalScore > 0 && !isAbsentRecord(r))
      .sort((a, b) => b.totalScore - a.totalScore);
    const distinctScores = Array.from(new Set(scored.map(r => r.totalScore)));
    const thirdScore = distinctScores[2];
    const tiered = thirdScore != null ? scored.filter(r => r.totalScore >= thirdScore) : scored;
    const rankedStudents = tiered.slice(0, 6);
    const medalFor = (score: number): string => {
      const rk = distinctScores.indexOf(score) + 1;
      return rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : `${rk}️⃣`;
    };

    if (rankedStudents.length > 0) {
      praiseContent += '🏆【入门测风云榜】\n';
      rankedStudents.forEach(r => {
        const nickname = getNickname(r.studentName);
        praiseContent += `${medalFor(r.totalScore)} ${nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if (praiseType === 'listening' || praiseType === 'comprehensive') {
    // 课后任务排名
    const listeningRanked = records
      .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0 && !isAbsentRecord(r))
      .sort((a, b) => b.listeningScore - a.listeningScore)
      .slice(0, 5);
    
    if (listeningRanked.length > 0) {
      praiseContent += '🎙️【课后任务达人】\n';
      const rankIcons = ['🏆', '🥈', '🥉', '📌', '📌'];
      listeningRanked.forEach((r, i) => {
        const nickname = getNickname(r.studentName);
        praiseContent += `${rankIcons[i]} ${nickname}：${r.listeningScore}分\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if (praiseType === 'comprehensive') {
    // 作业优秀
    const homeworkExcellent = records
      .filter(r => r.homeworkStatus === '超赞完成' && !isAbsentRecord(r))
      .map(r => getNickname(r.studentName));
    
    if (homeworkExcellent.length > 0) {
      praiseContent += `📚【作业超赞】\n`;
      praiseContent += homeworkExcellent.join('、');
      praiseContent += '\n\n';
    }
    
    // 全勤学生（按考勤关键词归类，忽略 emoji 后缀）
    const allPresent = records
      .filter(r => attendanceKind(r.attendance) === 'onTime')
      .map(r => getNickname(r.studentName));
    
    if (allPresent.length > 0) {
      praiseContent += `✅【全勤之星】\n`;
      praiseContent += allPresent.join('、');
      praiseContent += '\n\n';
    }
    
    // 进步之星（与平均分差距最小的）
    const progressStudents = records
      .filter(r => r.totalScore > 0)
      .map(r => ({
        name: r.studentName,
        nickname: getNickname(r.studentName),
        diff: Math.abs(r.totalScore - stats.avgScore)
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3);
    
    if (progressStudents.length > 0) {
      praiseContent += `📈【稳步前进】\n`;
      praiseContent += progressStudents.map(s => s.nickname).join('、');
      praiseContent += '\n\n';
    }
  }
  
  // 替换模板变量
  const praise = template
    .replace(/【课次】/g, lessonNumber.toString())
    .replace(/【表彰类型】/g, praiseType === 'entrance' ? '入门测' : praiseType === 'listening' ? '课后任务' : '综合')
    .replace(/【表彰内容】/g, praiseContent);
  
  return praise;
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('复制失败:', err);
    return false;
  }
}

// 导出CSV
export function exportToCSV(
  records: StudentRecord[],
  lessonConfig: LessonConfig,
  _className: string,
  _lessonNumber: number
): string {
  const customFields = lessonConfig.customFields || [];
  const headers = ['学生姓名', '课次', '学习轨迹', '考勤', '课堂表现', '书面作业', '课后任务', ...lessonConfig.questionTypes.map(qt => qt.name), ...customFields.map(cf => cf.name), '总分', '正确率', '排名'];
  
  let csv = headers.join(',') + '\n';
  
  records.forEach(record => {
    const row = [
      record.studentName,
      `第${record.lessonNumber}课`,
      record.seasons.join(''),
      record.attendance,
      record.classPerformance || '',
      record.homeworkStatus,
      record.listeningStatus === '具体分数' ? `${record.listeningScore}分` : record.listeningStatus,
      ...lessonConfig.questionTypes.map(qt => record.scores[qt.id] || 0),
      ...customFields.map(cf => { const v = (record.customValues || {})[cf.id]; return (v === '' || v == null) ? '' : v; }),
      record.totalScore,
      `${record.correctRate}%`,
      `第${record.rank}名`
    ];
    csv += row.join(',') + '\n';
  });
  
  return '\ufeff' + csv;
}

// 下载HTML文件
export function downloadHTML(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// 下载CSV文件
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
