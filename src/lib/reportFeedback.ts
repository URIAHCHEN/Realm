// 学情报告话术库：只写数据能支持的事实与可执行动作。
// 同一输入固定输出同一变体，避免切图、排序或导出前话术突然变化。

export interface QuestionTypeFeedback {
  highScore: string[];
  lowScore: string[];
  threshold: number;
}

export const questionTypeFeedbackMap: Record<string, QuestionTypeFeedback> = {
  '语法选择': {
    threshold: 0.79,
    highScore: [
      '语法选择这部分比较稳，常考规则基本能用对。接下来把剩余错题按时态、词性等考点归类，每周回头做一次，减少重复失分。',
      '这部分得分不错，说明课内语法点掌握得比较清楚。建议把做错的题单独留出来，隔几天不看答案再做一次，确认不是记住了选项。',
      '语法选择完成得较好。后面可以继续练稍有变化的题，同时在错题旁补一句“这道题考什么”，复习时会更有效率。',
    ],
    lowScore: [
      '语法选择目前失分较多，建议先从不确定的考点入手，每次只补一类。错题旁写清题干里的判断依据，再做两道同类题核对。',
      '这部分先不用急着加题量。把近期错题按时态、词性、固定搭配分开，找出错得最多的一类，重新看笔记后再练一组。',
      '语法规则还需要回到题目里核对。建议每天选几道错题，说出为什么选这个答案；说不清的地方标出来，下节课集中解决。',
    ],
  },
  '完形填空': {
    threshold: 0.69,
    highScore: [
      '完形填空整体较稳，能利用上下文判断词义和逻辑。建议保留这手感，同时把犹豫过的选项再做一次对比，说清楚另几个为什么不合适。',
      '这部分完成情况不错，文章主线和上下文线索抓得比较准。后续可换不同题材练习，避免只在熟悉的文章类型里表现稳定。',
      '完形得分较好。接下来可以把错题里的句子和上下句一起读，标出真正起作用的提示词，方法会更清楚。',
    ],
    lowScore: [
      '完形失分时，建议先别逐题背答案。把错题所在段落重新读一遍，标出上下文提示，再核对是词义、搭配还是逻辑判断出了问题。',
      '这部分可以先练“通读再作答”：第一遍抓人物和事情发展，第二遍再填词。错题隔天重做，看看能否说出选项依据。',
      '目前做完形容易丢上下文线索。建议每次选一篇错题较多的文章，先口述大意，再逐题核对词义和前后句关系。',
    ],
  },
  '阅读理解': {
    threshold: 0.59,
    highScore: [
      '阅读理解完成情况较好，答案定位和信息比对比较准确。接下来可适当缩短做题时间，但每题仍要保留原文依据。',
      '这部分得分不错，说明文章信息和题目要求能对应起来。建议继续接触不同题材，把不熟悉的表达顺手记下来。',
      '阅读部分比较稳。后面可以挑一两篇稍难的文章做精读，重点看长句结构和选项之间的细微差别。',
    ],
    lowScore: [
      '阅读目前需要先把“找依据”这一步做稳。建议先看题干，再回原文划出对应句，最后逐项核对，不凭印象选答案。',
      '这部分建议用少量文章做精读：先读通长句，再定位答案句。错题要分清是词汇没看懂，还是选项比对漏了条件。',
      '阅读失分较多时，先别追求一天做很多篇。每天选一篇，把错题对应的原文和选项逐句对齐，过程比题量更重要。',
    ],
  },
  '语篇填词': {
    threshold: 0.58,
    highScore: [
      '语篇填词完成得较好，词汇放进语境后基本能用对。接下来重点检查词形、时态和单复数，减少会选词但写错形式的失分。',
      '这部分掌握较稳。建议把仍有犹豫的词整理出来，连同原句一起复习，既记词义，也记它在句中的用法。',
      '语篇填词得分不错。后续保持课内词汇复习，同时在提交前留一分钟逐空检查词性变化。',
    ],
    lowScore: [
      '语篇填词建议分两步检查：先根据语境确定词义，再看空格前后决定词性和词形。错题保留原句，别只抄孤立的单词。',
      '这部分需要把词汇记忆和句子语境连起来。每天可默写少量重点词，再各造一个句子，检查词形是否写对。',
      '目前可以先练课内高频词和常见词形变化。做完后逐空问自己“为什么用这个形式”，把说不清的留下次课解决。',
    ],
  },
  '完成句子': {
    threshold: 0.59,
    highScore: [
      '完成句子这部分较稳，常用短语和句型能准确调用。接下来继续检查时态、人称和单复数，保持表达完整。',
      '这部分得分不错，句子结构基本能搭起来。建议多做几句中英互译，比较表达顺序，减少受中文语序影响的小错误。',
      '完成句子完成情况较好。后续可把错题改成新的语境再写一遍，确认掌握的是句型而不是原题答案。',
    ],
    lowScore: [
      '完成句子建议先找主干，再补短语和时态。每天写几句就够，但写完要逐词核对，避免知道句型却在细节上丢分。',
      '这部分先回到课内短语和重点句型。每个句型配一个自己的例句，再隔几天默写一次，比只看书更容易发现问题。',
      '目前写句子时可以先划“谁、做什么”，再补其余成分。错题旁边注明错在词汇、结构还是词形，下一轮只练对应问题。',
    ],
  },
  default: {
    threshold: 0.7,
    highScore: [
      '这个题型完成得较好。建议把剩余错题隔几天再做一次，确认方法稳定，而不是刚好记住了答案。',
      '这部分得分不错。后面保留少量同类练习即可，把时间分给目前更容易失分的板块。',
      '这一题型目前比较稳。可以继续按现有方法练，同时把犹豫过的题标出来复查。',
    ],
    lowScore: [
      '这个题型建议先回到错题，分清是知识点没理解，还是做题步骤漏了。每次集中改一类问题，再做几道同类题检验。',
      '这部分先不用大量加练。把最近几道错题重做一遍，写清卡在哪一步，下次课带着问题来核对。',
      '目前可以先减少题量，把做过的题弄懂。错题隔天再做，看看是否还会在同一个地方停下来。',
    ],
  },
};

export const overallFeedback = {
  excellent: {
    minScore: 85,
    messages: [
      '这一阶段的整体正确率较高，课内内容掌握得比较稳。后续保持订正和复习节奏，再逐步增加稍有变化的练习。',
      '几次记录放在一起看，基础部分比较扎实。接下来重点关注偶尔失分的地方，减少会做的题丢分。',
      '目前整体表现稳定。可以把更多时间用在薄弱题型的细节上，优势板块保持少量复习即可。',
    ],
  },
  good: {
    minScore: 70,
    messages: [
      '整体已有一定基础，大部分内容能够跟上。下一步更适合集中补一两个失分较多的板块，不必所有内容平均用力。',
      '这一阶段的表现比较平稳，但各板块还不够齐。建议先抓最容易改的一类错题，再观察后两次课的得分率。',
      '课内内容基本能接住，仍有部分题型需要巩固。把每周练习集中在这些具体位置，会比笼统加量更有效。',
    ],
  },
  average: {
    minScore: 60,
    messages: [
      '目前能完成一部分基础题，但稳定性还不够。建议先回到课内知识和近期错题，每次解决一个小问题。',
      '这一阶段的掌握情况有起伏，先不用追求难题和题量。把基础题做明白、把错题讲清楚，是眼下更重要的两步。',
      '现阶段需要把基础重新过一遍，但不必全面重来。先选失分最多的一类内容，练习后再用同类题检查。',
    ],
  },
  poor: {
    minScore: 0,
    messages: [
      '目前基础内容还比较吃力，建议先缩小练习范围，从课本和最近一张卷子的基础题开始，逐项确认哪里没理解。',
      '这几次记录显示，现阶段更需要补基础而不是赶进度。先固定每天一小段复习时间，完成后再检查掌握情况。',
      '当前先不用看一次性提高多少分。把最基础的一类题做稳，并让孩子能说出解题过程，变化会更可持续。',
    ],
  },
};

export const attendanceFeedback = {
  excellent: { rate: 0.95, message: '出勤记录很稳定，学习内容衔接得比较完整。继续保持现有时间安排即可。' },
  good: { rate: 0.85, message: '大部分课次都能按时参加。偶尔落下的内容要及时补齐，避免和后面的新知识叠在一起。' },
  needsImprovement: { rate: 0, message: '近期缺课对学习衔接已有影响。建议先调整时间安排，缺席课次的笔记和练习我会协助补齐。' },
};

export const homeworkFeedback = {
  excellent: { rate: 0.8, message: '课堂练习和课后任务完成得比较稳定。订正时再把错题原因写清楚，复习会更有针对性。' },
  good: { rate: 0.6, message: '练习基本能够完成。下一步把“做完”再往前走一步：错题当天订正，隔几天重新做一次。' },
  needsImprovement: { rate: 0, message: '近期练习完成度不够稳定。建议固定一个完成作业的时间，先保证按量完成，再逐步检查订正质量。' },
};

export const listeningFeedback = {
  excellent: { minScore: 85, message: '课后听说任务完成得较好。保持目前的练习频率即可，不必额外加太多材料。' },
  good: { minScore: 70, message: '课后任务已有一定基础。每天保留一小段听读练习，注意模仿语音和停顿。' },
  needsImprovement: { minScore: 0, message: '课后听说练习还需要补上。可先用短材料，每天听读十分钟，完成后再录一小段检查。' },
};

export const trajectoryFeedback = {
  improving: { message: '后几课的正确率比前段高，说明近期做法有效。先保持当前节奏，再观察能否连续稳定。' },
  stable: { message: '几课的正确率比较接近，整体较平稳。接下来可挑一个失分较多的板块集中练，寻找新的提升点。' },
  declining: { message: '后几课的正确率有所回落。建议先对照最近的错题、出勤和练习完成情况，找到变化发生在哪个环节。' },
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 稳定选句：不再使用 Math.random，报告重渲染与重复导出保持一致。 */
export function getRandomFeedback(feedbackArray: string[], seed = ''): string {
  if (feedbackArray.length === 0) return '';
  const key = seed || feedbackArray.join('|');
  return feedbackArray[stableHash(key) % feedbackArray.length];
}

export function getQuestionTypeFeedback(questionTypeName: string, score: number, fullScore: number): string {
  const feedback = questionTypeFeedbackMap[questionTypeName] || questionTypeFeedbackMap.default;
  const scoreRate = fullScore > 0 ? score / fullScore : 0;
  const pool = scoreRate >= feedback.threshold ? feedback.highScore : feedback.lowScore;
  return getRandomFeedback(pool, `${questionTypeName}|${score}|${fullScore}`);
}

export function getOverallFeedback(totalScore: number, fullScore: number): string {
  const scoreRate = fullScore > 0 ? (totalScore / fullScore) * 100 : 0;
  const band = scoreRate >= overallFeedback.excellent.minScore
    ? overallFeedback.excellent
    : scoreRate >= overallFeedback.good.minScore
      ? overallFeedback.good
      : scoreRate >= overallFeedback.average.minScore
        ? overallFeedback.average
        : overallFeedback.poor;
  return getRandomFeedback(band.messages, `overall|${totalScore}|${fullScore}`);
}

export function getAttendanceFeedback(attendanceRate: number): string {
  if (attendanceRate >= attendanceFeedback.excellent.rate) return attendanceFeedback.excellent.message;
  if (attendanceRate >= attendanceFeedback.good.rate) return attendanceFeedback.good.message;
  return attendanceFeedback.needsImprovement.message;
}

export function getHomeworkFeedback(excellentRate: number): string {
  if (excellentRate >= homeworkFeedback.excellent.rate) return homeworkFeedback.excellent.message;
  if (excellentRate >= homeworkFeedback.good.rate) return homeworkFeedback.good.message;
  return homeworkFeedback.needsImprovement.message;
}

export function getListeningFeedback(avgScore: number): string {
  if (avgScore >= listeningFeedback.excellent.minScore) return listeningFeedback.excellent.message;
  if (avgScore >= listeningFeedback.good.minScore) return listeningFeedback.good.message;
  return listeningFeedback.needsImprovement.message;
}

/** 输入应为正确率（0-100），避免不同满分课次直接比较原始分。 */
export function getTrajectoryFeedback(rates: number[]): string {
  const valid = rates.filter(Number.isFinite);
  if (valid.length < 3) return '目前可比较的课次还不多，再积累几次记录后，趋势会更清楚。';
  const firstHalf = valid.slice(0, Math.floor(valid.length / 2));
  const secondHalf = valid.slice(Math.floor(valid.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = secondAvg - firstAvg;
  if (diff > 3) return trajectoryFeedback.improving.message;
  if (diff < -3) return trajectoryFeedback.declining.message;
  return trajectoryFeedback.stable.message;
}
