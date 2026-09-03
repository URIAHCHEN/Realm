// 学情报告话术库 - 参考Excel表格话术

// 题型话术模板
export interface QuestionTypeFeedback {
  highScore: string[];  // 高分话术
  lowScore: string[];   // 低分话术
  threshold: number;    // 高低分阈值（百分比）
}

// 各题型话术库
export const questionTypeFeedbackMap: Record<string, QuestionTypeFeedback> = {
  '语法选择': {
    threshold: 0.79, // 79%以上为高分 (11.9/15)
    highScore: [
      '孩子语法基础扎实，已熟练掌握七下教材中所学语法的要点，加油！在语法上要精益求精，不放过每个得分点。平时遇到语法选择错题时，请积累到错题本，以便系统巩固知识点，提升掌握度。',
      '语法知识掌握牢固，能够准确运用各种语法规则。建议继续保持，同时可以尝试挑战更高难度的语法题目，拓展语法知识面。',
      '语法选择题表现优秀，对各类语法现象理解透彻。建议将错题整理到错题本，定期复习，确保知识点不遗忘。'
    ],
    lowScore: [
      '孩子语法知识需加强，建议重点复习七下校本教材的常考语法。请家长督促孩子整理近三天学习笔记，建立错题本。可通过【亲子问答】与孩子互动检验掌握情况，这样的训练能快速提升孩子的语法水平，让孩子在学习中获得成就感。',
      '语法基础有待巩固，建议系统复习教材中的语法知识点。可以通过做专项练习来强化薄弱环节，逐步提高语法运用能力。',
      '语法选择题失分较多，建议重新梳理语法知识体系。家长可以协助孩子制作语法思维导图，帮助理清知识脉络。'
    ]
  },
  
  '完形填空': {
    threshold: 0.69, // 69%以上为高分 (6.9/10)
    highScore: [
      '孩子完型阅读词汇丰富，擅长联系上下文理解内容，完形填空技巧也较熟练。但还需提升长难句理解力，学会深入分析句子结构，以更精准把握文章细节和逻辑。建议加强这方面训练，以提高整体阅读水平。',
      '完形填空表现良好，能够较好地理解文章大意并做出正确选择。词汇量充足，上下文推理能力强。建议继续保持阅读积累。',
      '完形填空技巧掌握较好，善于利用上下文线索解题。建议在保持现有水平的基础上，多接触不同题材的文章，拓展阅读面。'
    ],
    lowScore: [
      '孩子的词汇量不足，易受生词影响，理解不深入。建议平日多积累短语辨析和高频词汇，并熟练掌握完型填空技巧，善于联系上下文推理理解。这样能有效提升该题型的得分。',
      '完形填空需要加强，建议增加词汇积累量，特别是高频词汇和固定搭配。可以通过背诵单词、阅读英文文章来提升语感。',
      '完形填空失分较多，主要是词汇量不足和对文章理解不够深入。建议每天背诵20个高频词汇，同时多做完形填空专项练习。'
    ]
  },
  
  '阅读理解': {
    threshold: 0.59, // 59%以上为高分 (5.9/10)
    highScore: [
      '孩子阅读中能准确定位答案句，分析选项正确，词汇量足，理解长难句轻松，定位答案段落迅速。有余力时，建议领取弱项提升练习，针对性强化巩固，拓展词汇量，在阅读上取得更大进步。',
      '阅读理解能力强，能够快速准确地找到答案所在。词汇量丰富，对长难句的理解也很到位。建议在保持现有水平的同时，尝试阅读更有挑战性的文章。',
      '阅读技巧掌握熟练，定位准确，理解深入。建议多读英文原版材料，培养英语思维，进一步提升阅读速度和理解能力。'
    ],
    lowScore: [
      '孩子阅读中词汇量不足，易受生词影响，长难句理解困难，影响文章透彻理解，定位答案也显吃力。建议学习句子结构分析，加强翻译练习，多做题积累高频词汇。有余力可领取弱项提升练习，拓展词汇量，提升阅读水平。',
      '阅读理解需要加强，建议从基础做起，先积累足够的词汇量，再学习阅读技巧。可以通过精读和泛读相结合的方式提升阅读能力。',
      '阅读理解失分较多，主要是词汇量不足和缺乏阅读技巧。建议每天阅读一篇英文文章，遇到生词及时查阅并记录，逐步扩大词汇量。'
    ]
  },
  
  '语篇填词': {
    threshold: 0.58, // 58%以上为高分 (2.9/5)
    highScore: [
      '孩子校本词汇掌握佳，能灵活运用。运用时需留意人称、时态、单复数等细节。建议整理错题到错题本，逐个击破知识点，争取考试满分。平日加强练习，提升细节把握能力。',
      '词汇掌握扎实，能够根据语境准确运用单词。建议在保持现有水平的基础上，注意语法细节，争取满分。',
      '语篇填词表现优秀，词汇运用能力强。建议继续巩固课内词汇，同时拓展课外词汇，提升词汇运用的灵活性。'
    ],
    lowScore: [
      '孩子在校本词汇的掌握上还存在一些不足，导致在部分题目中无法准确根据语境运用词汇。为了提升孩子的词汇运用能力，我们建议他更加深入地巩固课内的词汇学习，重点在于多记多背。家长可以打印出【单词短语默写表】，帮助孩子通过反复默写练习来加强校内词汇及短语的记忆。此外，家长还可以通过【亲子问答】的方式与孩子进行互动，以此来考察孩子对词汇的掌握情况。我们相信，这些建议将能有效帮助孩子提升词汇运用能力。',
      '语篇填词需要加强，建议系统复习课内词汇，特别是词性转换和词形变化。可以通过默写、造句等方式加深记忆。',
      '词汇运用能力有待提升，建议每天背诵并默写10个重点词汇，同时注意词性变化和语法搭配。家长可以协助检查默写情况。'
    ]
  },
  
  '完成句子': {
    threshold: 0.59, // 59%以上为高分 (5.9/10)
    highScore: [
      '孩子校本短语和句型积累扎实，能运用语法构建完整句子。但需注意人称、时态和单复数等细节，确保表达准确流畅。不断练习并留意这些细节，将进一步提升孩子的语言运用能力。',
      '完成句子表现良好，短语和句型掌握牢固。建议在保持现有水平的基础上，注意语法细节，提高句子表达的准确性。',
      '能够熟练运用各类短语和句型完成句子，语法基础扎实。建议多进行句子翻译练习，提升语言表达的灵活性。'
    ],
    lowScore: [
      '孩子校本短语和句型积累不足，理解语境和补全句子有困难。建议深入巩固课内短语和句型，家长可打印【单词短语默写表】助孩子反复默写。同时，通过【亲子问答】考察掌握情况。望这些建议能提升孩子语言运用能力。',
      '完成句子需要加强，建议系统复习课内短语和重点句型。可以通过背诵、默写、造句等多种方式加深记忆。',
      '短语和句型积累不足，导致完成句子时困难重重。建议每天背诵5个重点短语和2个重点句型，并进行造句练习。'
    ]
  },
  
  // 通用题型（当没有匹配到具体题型时使用）
  'default': {
    threshold: 0.7,
    highScore: [
      '该题型掌握情况良好，能够准确理解题意并做出正确解答。建议继续保持，同时可以尝试更有挑战性的题目。',
      '表现优秀，对该题型的解题技巧掌握熟练。建议总结解题方法，形成自己的解题思路。',
      '该题型得分较高，基础知识扎实。建议将错题整理到错题本，避免同类错误再次发生。'
    ],
    lowScore: [
      '该题型需要加强，建议系统复习相关知识点，多做专项练习。遇到不懂的地方及时向老师请教。',
      '该题型失分较多，建议分析错题原因，找出薄弱环节进行针对性训练。',
      '该题型掌握不够牢固，建议重新学习相关知识点，并通过大量练习来巩固。家长可以协助监督练习情况。'
    ]
  }
};

// 整体表现话术
export const overallFeedback = {
  excellent: {
    minScore: 85,
    messages: [
      '孩子整体表现非常优秀，各科知识点掌握扎实，学习态度认真。建议继续保持，同时可以适当挑战更高难度的内容，拓展知识面。',
      '整体学习情况良好，成绩稳定，基础知识牢固。建议保持良好的学习习惯，在巩固基础的同时注重能力提升。',
      '表现突出，学习方法得当，知识掌握全面。建议多参与课堂互动，积极思考问题，培养批判性思维。'
    ]
  },
  good: {
    minScore: 70,
    messages: [
      '孩子整体表现良好，大部分知识点掌握较好，但仍有提升空间。建议针对薄弱环节加强练习，争取更大进步。',
      '整体学习情况不错，基础知识掌握较为扎实。建议继续保持学习热情，同时注意查漏补缺。',
      '学习状态良好，成绩稳中有升。建议制定合理的学习计划，平衡各科学习时间。'
    ]
  },
  average: {
    minScore: 60,
    messages: [
      '孩子整体表现中等，部分知识点掌握不够牢固。建议加强基础知识学习，多做练习题巩固所学内容。',
      '学习情况一般，需要付出更多努力。建议调整学习方法，提高学习效率，必要时可以寻求老师帮助。',
      '成绩还有较大提升空间，建议分析薄弱环节，制定针对性的学习计划。家长可以多关注孩子的学习情况。'
    ]
  },
  poor: {
    minScore: 0,
    messages: [
      '孩子整体表现需要重点关注，基础知识掌握不够扎实。建议系统复习教材内容，从最基础的知识点开始补起。',
      '学习情况需要改善，建议家长与老师沟通，了解孩子的具体困难，共同帮助孩子提升成绩。',
      '成绩不理想，但不要气馁。建议重新梳理知识体系，一步一个脚印地打好基础。相信通过努力一定会有进步。'
    ]
  }
};

// 考勤反馈
export const attendanceFeedback = {
  excellent: {
    rate: 0.95,
    message: '考勤情况优秀，能够按时参加每一次课程，良好的出勤习惯是取得好成绩的基础。'
  },
  good: {
    rate: 0.85,
    message: '考勤情况良好，大部分课程都能按时参加。建议继续保持，避免因缺课影响学习进度。'
  },
  needsImprovement: {
    rate: 0,
    message: '考勤情况需要改善，缺课次数较多可能会影响学习效果。建议合理安排时间，保证出勤率。'
  }
};

// 作业反馈
export const homeworkFeedback = {
  excellent: {
    rate: 0.8,
    message: '作业完成情况优秀，能够高质量地完成作业，这有助于巩固课堂所学知识。'
  },
  good: {
    rate: 0.6,
    message: '作业完成情况良好，大部分作业都能按时完成。建议继续保持，争取每次作业都能高质量完成。'
  },
  needsImprovement: {
    rate: 0,
    message: '作业完成情况需要改善，作业是巩固知识的重要途径。建议重视每一次作业，认真完成。'
  }
};

// 课后任务反馈
export const listeningFeedback = {
  excellent: {
    minScore: 85,
    message: '课后任务成绩优秀，听说能力较强。建议继续保持每天的听说练习，提升英语语感。'
  },
  good: {
    minScore: 70,
    message: '课后任务成绩良好，听说能力不错。建议每天安排15-20分钟的听说练习，进一步提升。'
  },
  needsImprovement: {
    minScore: 0,
    message: '课后任务成绩需要提升，建议每天坚持听说练习，可以从简单的材料开始，逐步提高难度。'
  }
};

// 学习轨迹反馈
export const trajectoryFeedback = {
  improving: {
    message: '学习轨迹呈上升趋势，进步明显！继续保持这种良好的学习状态，相信会有更大的突破。'
  },
  stable: {
    message: '学习轨迹较为平稳，成绩保持稳定。建议在巩固现有水平的基础上，寻求新的突破点。'
  },
  declining: {
    message: '学习轨迹有所下滑，需要引起重视。建议分析原因，调整学习方法，尽快回到上升轨道。'
  }
};

// 获取随机话术
export function getRandomFeedback(feedbackArray: string[]): string {
  return feedbackArray[Math.floor(Math.random() * feedbackArray.length)];
}

// 根据分数和题型获取话术
export function getQuestionTypeFeedback(
  questionTypeName: string, 
  score: number, 
  fullScore: number
): string {
  const feedback = questionTypeFeedbackMap[questionTypeName] || questionTypeFeedbackMap['default'];
  const scoreRate = score / fullScore;
  
  if (scoreRate >= feedback.threshold) {
    return getRandomFeedback(feedback.highScore);
  } else {
    return getRandomFeedback(feedback.lowScore);
  }
}

// 根据整体得分获取反馈
export function getOverallFeedback(totalScore: number, fullScore: number): string {
  const scoreRate = (totalScore / fullScore) * 100;
  
  if (scoreRate >= overallFeedback.excellent.minScore) {
    return getRandomFeedback(overallFeedback.excellent.messages);
  } else if (scoreRate >= overallFeedback.good.minScore) {
    return getRandomFeedback(overallFeedback.good.messages);
  } else if (scoreRate >= overallFeedback.average.minScore) {
    return getRandomFeedback(overallFeedback.average.messages);
  } else {
    return getRandomFeedback(overallFeedback.poor.messages);
  }
}

// 根据考勤率获取反馈
export function getAttendanceFeedback(attendanceRate: number): string {
  if (attendanceRate >= attendanceFeedback.excellent.rate) {
    return attendanceFeedback.excellent.message;
  } else if (attendanceRate >= attendanceFeedback.good.rate) {
    return attendanceFeedback.good.message;
  } else {
    return attendanceFeedback.needsImprovement.message;
  }
}

// 根据作业优秀率获取反馈
export function getHomeworkFeedback(excellentRate: number): string {
  if (excellentRate >= homeworkFeedback.excellent.rate) {
    return homeworkFeedback.excellent.message;
  } else if (excellentRate >= homeworkFeedback.good.rate) {
    return homeworkFeedback.good.message;
  } else {
    return homeworkFeedback.needsImprovement.message;
  }
}

// 根据课后任务平均分获取反馈
export function getListeningFeedback(avgScore: number): string {
  if (avgScore >= listeningFeedback.excellent.minScore) {
    return listeningFeedback.excellent.message;
  } else if (avgScore >= listeningFeedback.good.minScore) {
    return listeningFeedback.good.message;
  } else {
    return listeningFeedback.needsImprovement.message;
  }
}

// 根据学习轨迹趋势获取反馈
export function getTrajectoryFeedback(scores: number[]): string {
  if (scores.length < 3) {
    return '学习数据还不够充分，建议继续记录，以便更好地分析学习趋势。';
  }
  
  // 计算趋势
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const diff = secondAvg - firstAvg;
  
  if (diff > 3) {
    return trajectoryFeedback.improving.message;
  } else if (diff < -3) {
    return trajectoryFeedback.declining.message;
  } else {
    return trajectoryFeedback.stable.message;
  }
}
