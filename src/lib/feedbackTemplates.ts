import type { StudentRecord, ClassStats, WeakPoint, LessonConfig } from '@/types';

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
  weakPoints: WeakPoint[],
  nickname: string
): string {
  let template = lessonConfig.feedbackTemplate;
  
  // 构建成绩详情
  const scoreDetails = lessonConfig.questionTypes.map(qt => {
    const score = record.scores[qt.id] || 0;
    const avgScore = stats.avgScores[qt.id] || 0;
    const diff = score - avgScore;
    const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    return `• ${qt.name}：${score}/${qt.fullScore}分（班均${avgScore.toFixed(1)}，${diffText}）`;
  }).join('\n');
  
  // 计算满分
  const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);
  
  // 生成短昵称
  const shortNickname = generateShortNickname(nickname);
  
  // 处理薄弱项 - 如果没有薄弱项，删除包含【薄弱项】的行
  if (weakPoints.length === 0) {
    // 删除包含【薄弱项】的整行
    template = template.replace(/.*【薄弱项】.*\n?/g, '');
  } else {
    // 构建薄弱项文本
    const weakPointsText = weakPoints.map(wp => `${wp.questionTypeName}（低${Math.abs(wp.diff).toFixed(1)}分）`).join('、');
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
  const rawTemplate = lessonConfig.feedbackTemplate;
  customFields.forEach(cf => {
    template = template.replace(new RegExp('【' + escRe(cf.name) + '】', 'g'), customDisplay(cf.kind, cf.id));
  });

  // 替换模板变量
  let feedback = template
    .replace(/【学生昵称】/g, nickname)
    .replace(/【学生短昵称】/g, shortNickname)
    .replace(/【课次】/g, record.lessonNumber.toString())
    .replace(/【考勤】/g, record.attendance)
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

// “四个一”反馈（可直接发送版）：优秀表现 / 待提升 / 下一步 / 素材，三种措辞版本
export function generateFourInOne(
  record: StudentRecord,
  lessonConfig: LessonConfig,
  stats: ClassStats,
  weakPoints: WeakPoint[],
  nickname: string,
  scenarioLabel: string,
  isNewStudent = false,
  candidateLinks: string[] = [],
  variant = 0
): string {
  const v = ((variant % 3) + 3) % 3;

  const strong = lessonConfig.questionTypes
    .map(qt => ({ name: qt.name, s: record.scores[qt.id] || 0, avg: stats.avgScores[qt.id] || 0, full: qt.fullScore }))
    .filter(x => x.avg > 0 && x.s - x.avg >= 5)
    .sort((a, b) => (b.s - b.avg) - (a.s - a.avg));
  const weak = [...weakPoints].sort((a, b) => a.diff - b.diff);
  const homeworkGood = record.homeworkStatus === '超赞完成';
  const homeworkBad = record.homeworkStatus === '未完成' || record.homeworkStatus === '没带';
  const attendBad = record.attendance === '缺勤' ? '缺勤' : record.attendance === '迟到' ? '迟到' : record.attendance === '请假' ? '请假' : '';

  let praise: string;
  if (strong.length) praise = `${strong[0].name}掌握得不错（${strong[0].s}/${strong[0].full}，高出班级平均${(strong[0].s - strong[0].avg).toFixed(0)}分）`;
  else if (record.correctRate >= 90) praise = `入门测正确率 ${record.correctRate}%，整体掌握扎实`;
  else if (homeworkGood) praise = '书面作业完成质量很高';
  else praise = '课堂状态稳定，能跟上节奏';

  const issueParts: string[] = [];
  if (weak.length) issueParts.push(`${weak[0].questionTypeName}还有提升空间（${weak[0].studentScore}分，低于班级平均${Math.abs(weak[0].diff).toFixed(0)}分）`);
  if (homeworkBad) issueParts.push(`书面作业${record.homeworkStatus}`);
  if (attendBad) issueParts.push(`本课${attendBad}`);
  const issue = issueParts.length ? issueParts.join('；') : '暂未发现明显薄弱点，继续保持';

  let plan: string;
  if (weak.length) plan = `课后针对${weak[0].questionTypeName}做同类练习巩固，把错题整理进错题本并试着讲一遍`;
  else if (homeworkBad) plan = '今晚把本次作业补齐并订正，下次课前提交';
  else if (attendBad) plan = '课后回看本讲回放和笔记，补齐落下的内容';
  else plan = '保持当前节奏，按课后任务继续巩固即可';

  const openers = [
    '孩子您好，跟您反馈下这堂课的情况：',
    '跟您同步一下孩子这堂课的表现：',
    '本堂课学情反馈：'
  ];

  const lines: string[] = [
    `【第${record.lessonNumber}课 · ${nickname}${scenarioLabel ? ' · ' + scenarioLabel : ''}】`,
    openers[v],
    `🌟 优秀表现：${praise}`,
    `🔍 待提升：${issue}`,
    `🛠 下一步：${plan}`,
    `🎬 课堂照片/视频：${candidateLinks[0] || '见附件'}`,
  ];
  if (isNewStudent) lines.push('也欢迎跟我说说孩子这堂课的感受，方便我们更快适配节奏～');
  lines.push('感谢配合，我们一起帮孩子进步！');
  return lines.join('\n');
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
    // 入门测排名
    const rankedStudents = records
      .filter(r => r.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    
    if (rankedStudents.length > 0) {
      praiseContent += '🏆【入门测风云榜】\n';
      const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '📌', '📌', '📌', '📌', '📌', '📌'];
      rankedStudents.forEach((r, i) => {
        const nickname = getNickname(r.studentName);
        praiseContent += `${rankIcons[i]} ${nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
      });
      praiseContent += '\n';
    }
  }
  
  if (praiseType === 'listening' || praiseType === 'comprehensive') {
    // 课后任务排名
    const listeningRanked = records
      .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
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
      .filter(r => r.homeworkStatus === '超赞完成')
      .map(r => getNickname(r.studentName));
    
    if (homeworkExcellent.length > 0) {
      praiseContent += `📚【作业超赞】\n`;
      praiseContent += homeworkExcellent.join('、');
      praiseContent += '\n\n';
    }
    
    // 全勤学生
    const allPresent = records
      .filter(r => r.attendance === '按时出勤')
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
  let praise = template
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
  const headers = ['学生姓名', '课次', '学习轨迹', '考勤', '书面作业', '课后任务', ...lessonConfig.questionTypes.map(qt => qt.name), ...customFields.map(cf => cf.name), '总分', '正确率', '排名'];
  
  let csv = headers.join(',') + '\n';
  
  records.forEach(record => {
    const row = [
      record.studentName,
      `第${record.lessonNumber}课`,
      record.seasons.join(''),
      record.attendance,
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
