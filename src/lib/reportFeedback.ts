// 学情报告话术库
// 写作口径：面向家长，第二人称「您」；先认可具体表现，再给一条可执行的下一步；
// 句子长短交替、少用套话，保留原有信息点（错题本 / 默写表 / 亲子问答 / 长难句等）。

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
      '这部分的语法功底是扎实的，七下教材里学过的要点基本都能用对，说明平时是真的听进去了。想再往上走一步，关键在细节——把每次语法选择的错题记进错题本，按考点归类，考前翻一遍，分数会更稳。',
      '语法规则掌握得比较透，题目怎么变都能接住。学有余力的话，可以挑几道稍难的题练练手，把知识面拓开一些，同时别忘了错题本要继续记。',
      '语法选择做得很干净，看得出来对常考语法点是理解的，不只是背下来的。把错题整理成自己的"易错清单"，定期回头看一眼，这类题基本可以放心了。',
    ],
    lowScore: [
      '目前语法的失分主要集中在七下校本教材的常考知识点上。建议先把近三天的课堂笔记过一遍，再建一个语法错题本——每道错题旁边写上考的是什么。平时您可以用【亲子问答】随口问两句，孩子答得出来，说明是真掌握了，练一段时间会有明显起色。',
      '语法这一块的地基还需要再夯一夯。与其刷很多题，不如挑一个知识点（比如时态或词性）先弄透，用专项练习验证，再换下一个，一步一个脚印反而更快。',
      '语法选择失分偏多，多半是知识框架还没搭起来。可以和孩子一起画一张语法思维导图，把零散的点串起来；错题也及时归到对应的分支下，复习时就有了抓手。',
    ]
  },

  '完形填空': {
    threshold: 0.69, // 69%以上为高分 (6.9/10)
    highScore: [
      '词汇量是够的，也能顺着上下文把文章的意思接起来，完形的技巧用得上。接下来可以专门攻一攻长难句——学会切分句子结构，文章的细节和逻辑就能抓得更准，整体阅读水平也会跟着上一个台阶。',
      '完形做得不错，文章大意抓得住，选择也有依据，看得出语感和推理能力都在线。保持每天的阅读量，这份手感会越来越稳。',
      '解题思路是对的，善于用上下文找线索。建议在保持的同时换换题材，故事类、科普类都读一读，适应不同文章的路数。',
    ],
    lowScore: [
      '目前主要卡在词汇上，一遇到生词就容易断掉理解，文章后半段的信息也跟着漏了。建议每天固定积累一点短语辨析和高频词，做错的完形题回头读两遍，试着讲出"这句为什么选它"——联系上下文推理的习惯养成了，这类题会好做很多。',
      '完形的提升，第一步是词汇，第二步是读懂句与句之间的关系。可以先从高频词和固定搭配入手，配合每天一篇短文，读的时候有意识地问自己"下一句可能说什么"。',
      '完形失分较多，往往是"词不认识"加上"没读透"两件事叠在一起。建议每天背 20 个高频词，同时把错题里的长句抄下来分析结构，坚持两三周就能看到变化。',
    ]
  },

  '阅读理解': {
    threshold: 0.59, // 59%以上为高分 (5.9/10)
    highScore: [
      '阅读的状态挺好的：答案句找得准，选项也分析得清楚，词汇量和长难句都不构成障碍，定位段落很快。有余力的话，可以领一份弱项提升练习，针对性地再拓一拓词汇，阅读还能再往上走。',
      '理解能力在线，能快速锁定答案所在的位置，长难句读起来也不吃力。可以试着读一些稍有挑战的材料，把阅读速度和理解深度都带一带。',
      '定位准、理解深，说明阅读方法已经成型了。建议多接触原版材料，慢慢培养英语思维，读起来会更顺。',
    ],
    lowScore: [
      '阅读目前的困难主要有三处：词汇量不够、长难句读不通、答案位置定不准。这三件事有先后——先把句子结构分析学会，配合每天一小段翻译练习，再做几篇阅读积累高频词，顺序对了见效会快。有余力可以领弱项提升练习，词汇上来了，阅读会轻松很多。',
      '阅读理解需要从基础补起：先保证词汇量，再谈技巧。精读和泛读可以结合——精读抠句子，泛读练速度，两边一起推，进步会更扎实。',
      '阅读失分偏多，主要是词不够、方法也不熟。建议每天读一篇短文，生词当场查、记进本子，一周回头看一次；做题时先看题干再回原文定位。',
    ]
  },

  '语篇填词': {
    threshold: 0.58, // 58%以上为高分 (2.9/5)
    highScore: [
      '校本词汇掌握得不错，放到语境里也能用对。这个题型真正的失分点在细节上——人称、时态、单复数，多留个心眼，分数还能再提一提。建议把错题收进错题本，一个一个把知识点啃下来。',
      '词汇基础扎实，能根据语境判断该用哪个词。接下来把语法细节盯紧一些，满分是够得着的。',
      '语篇填词表现不错，词汇调用的灵活度也够。课内词汇继续巩固，有余力再向课外拓一拓。',
    ],
    lowScore: [
      '目前的短板是校本词汇还不够熟，句子里的语境提示看到了，但一时想不起该填哪个词。办法比较朴实：多记多背。您可以打印【单词短语默写表】，让孩子反复默写课内外的高频词和短语；也可以用【亲子问答】抽查几个，孩子答得上来就是真记住了。这两件事坚持一段时间，这个题型会有明显改善。',
      '语篇填词要补的是词汇的系统性——尤其是词性转换和词形变化。建议按单元梳理课内词汇，默写、造句各来一点，比单纯抄写的记忆更牢。',
      '词汇调用能力还需要练。建议每天默写 10 个课内重点词，顺带注意词形变化和搭配；您帮忙看看默写结果，比老师单方面布置更有效。',
    ]
  },

  '完成句子': {
    threshold: 0.59, // 59%以上为高分 (5.9/10)
    highScore: [
      '校本的短语和句型积累得比较扎实，能用语法把句子搭完整。接下来要抠的是人称、时态、单复数这些小地方——把它们照顾到，表达会更准确、更顺。多练几轮，语言运用的感觉会越来越稳。',
      '短语和句型掌握得牢，句子结构也立得住。在保持的基础上多留意语法细节，表达准确度还能再上一层。',
      '能熟练调用各类短语和句型，语法基础是靠得住的。建议多做句子翻译练习，让表达更灵活。',
    ],
    lowScore: [
      '目前短语和句型的积累还不够，遇到要补全的句子时，理解语境和搭结构都会有点吃力。建议先把课内短语和句型扎扎实实过一遍；您这边可以打印【单词短语默写表】帮助孩子反复默写，再用【亲子问答】考察一下掌握情况。积累补上来，这个题型的进步会比较直观。',
      '完成句子要加强的是"输入量"——先记住足够多的短语和重点句型。背诵、默写、造句轮着来，比单一种方式效果好。',
      '短语和句型储备不足，写句子时就容易卡壳。建议每天记 5 个重点短语和 2 个句型，并各造一个句子，慢慢就顺手了。',
    ]
  },

  // 通用题型（当没有匹配到具体题型时使用）
  'default': {
    threshold: 0.7,
    highScore: [
      '这个题型掌握得不错，题意能读懂，思路也清楚。保持现在的状态，同时可以挑几道有挑战性的题试试。',
      '解题技巧比较熟练，表现是稳的。建议把方法总结下来，形成自己的一套思路。',
      '这部分得分较高，基础比较扎实。把错题收进错题本，同类错误就不会反复出现。',
    ],
    lowScore: [
      '这个题型还需要再练一练。建议先把相关知识点系统过一遍，再做专项练习；有卡住的地方当场问老师，别攒着。',
      '失分偏多，先别急着多做题——把错题的原因分析清楚，找出到底是概念没懂还是方法不熟，再定点突破。',
      '这块掌握得还不算牢。建议回到知识点本身重新过一遍，配合一定量的练习巩固；您在旁边帮着盯一盯进度会更稳妥。',
    ]
  }
};

// 整体表现话术
export const overallFeedback = {
  excellent: {
    minScore: 85,
    messages: [
      '整体表现很稳：知识点掌握得扎实，学习态度也认真。保持这个节奏就好，学有余力时可以适当挑些更有挑战的内容，把知识面再拓开一点。',
      '学习情况是让人放心的，成绩稳定、基础牢固。好习惯继续保持，同时留意从"会做"往"会讲、会用"上走一步。',
      '这一阶段表现突出，方法也对路，掌握得比较全面。建议课堂上多参与互动，把想法说出来，思考会更深入。',
    ]
  },
  good: {
    minScore: 70,
    messages: [
      '整体是好的，大部分知识点都拿下来了，还有一些空间可以挖。把薄弱的地方挑出来集中练一练，进步会来得比想象中快。',
      '学习情况不错，基础也比较扎实。热情保持住，同时别忘了定期回头查漏补缺。',
      '状态在往上走，成绩也稳中有升。可以给孩子拟一份简单的学习计划，把各科时间安排好，效率会更高。',
    ]
  },
  average: {
    minScore: 60,
    messages: [
      '整体处在中等水平，一部分知识点还不够牢。建议回到基础上来，边学边练，把学过的东西真正过一遍手，比往前赶更有效。',
      '现在需要再多花一点力气。可以看看学习方法是不是有调整的空间——比如先理解再记、错题及时整理，必要时找老师聊一聊。',
      '还有不小的提升空间。建议先把薄弱环节找出来，定一两个具体的小目标；您在家多关注一下学习状态，会比单方面要求更管用。',
    ]
  },
  poor: {
    minScore: 0,
    messages: [
      '这一阶段掌握得不太牢，需要重点关注。建议从教材最基础的部分重新过一遍，把地基打稳，先不急着追进度。',
      '目前的状况需要一起想办法。可以约个时间和老师沟通一下，看看孩子具体卡在哪里——找到原因，问题就解决了一半。',
      '成绩暂时不理想，但先别灰心。把知识体系重新梳理一遍，一小步一小步来，只要方向对，进步是迟早的事。',
    ]
  }
};

// 考勤反馈
export const attendanceFeedback = {
  excellent: {
    rate: 0.95,
    message: '出勤很稳定，每节课都按时到，这份坚持本身就是好成绩的基础。继续保持这份节奏。'
  },
  good: {
    rate: 0.85,
    message: '出勤情况总体不错，大部分课都按时到。尽量把偶尔的缺课也补上，别让落下的内容影响后面的进度。'
  },
  needsImprovement: {
    rate: 0,
    message: '这阵子缺课稍多了一些，落下内容对学习节奏的影响不小。建议把时间安排调整一下，尽量保证出勤；缺的课我这边也会帮孩子补上。'
  }
};

// 作业反馈
export const homeworkFeedback = {
  excellent: {
    rate: 0.8,
    message: '作业完成得很到位，看得出是用心做的。作业是把课堂内容真正变成自己的过程，这份认真很宝贵，继续保持。'
  },
  good: {
    rate: 0.6,
    message: '作业基本都能按时完成，完成质量也在线。如果能在订正上再细一点——错题弄懂再改，效果还能更好。'
  },
  needsImprovement: {
    rate: 0,
    message: '作业完成情况需要抓一抓。作业是巩固知识最直接的一环，落下几次，课堂上学的东西就容易淡掉。建议每天固定时间做作业，您帮忙看一眼是否完成。'
  }
};

// 课后任务反馈
export const listeningFeedback = {
  excellent: {
    minScore: 85,
    message: '课后任务完成得很出色，听说这块的优势已经出来了。每天保持一点听说练习，语感会越来越顺。'
  },
  good: {
    minScore: 70,
    message: '课后任务完成得不错，听说能力是在线的。建议每天固定 15-20 分钟练习，坚持下来提升会很明显。'
  },
  needsImprovement: {
    minScore: 0,
    message: '课后任务还需要再上心一些。可以从短一点、简单一点的材料开始，每天听读 10 分钟，先把手感找回来，再慢慢加量。'
  }
};

// 学习轨迹反馈
export const trajectoryFeedback = {
  improving: {
    message: '这段时间的轨迹是往上走的，进步看得出来。把现在的学习节奏保持住，后面还会有更大的空间。'
  },
  stable: {
    message: '成绩比较平稳，说明基础是稳的。接下来可以找一个突破口——挑一个最想提升的板块，集中发力试试。'
  },
  declining: {
    message: '最近两次的成绩有些回落，值得留意一下。先别急着加压，和孩子聊聊最近的听课状态和作业情况，找到原因再调整，比硬练更有效。'
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
    return '目前记录的次数还不多，等数据再攒几节课，趋势会看得更清楚。';
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
