// 家长能直接照做的练习。题型和分数可以决定先练哪项，错因要回到原题核对。
const PRACTICES: { question: RegExp; instruction: string }[] = [
  { question: /笔记默写/, instruction: '先从笔记里挑一条没写全的规则，合上本子用自己的话讲一遍，再写一个例句来验一验。' },
  { question: /句子默写|课文默写/, instruction: '挑一句写错的，先读出完整意思，再遮住原句写一遍，最后只核对这次出错的地方。' },
  { question: /默写|单词|词汇听写|听写|词汇/, instruction: '把这次写错的词挑出来，今天看中文自默一遍。隔一天再默一次，两次都对的就先放一放。' },
  { question: /连词成句|句子排序|词序|句子重组/, instruction: '挑一道错题，先找谁在做、做了什么，把主干排出来。写完读一遍，再看词序、大写和标点。' },
  { question: /完成句子|句子填空|翻译/, instruction: '挑一道错题，先圈中文提示里要表达的意思，再把整句补齐。写完对照提示读一遍，看看信息有没有漏。' },
  { question: /七选五|阅读填空|段落还原/, instruction: '重做一个错空，先读空前空后，看看后一句是在解释、举例还是转折。选完把三句连起来读一遍。' },
  { question: /信息匹配/, instruction: '选一道错题，把题干里的要求和原文对应句划出来，再说说两边意思哪里对得上。' },
  { question: /语篇填词|短文填空|语法填空|词形/, instruction: '挑一个错空，把空前空后连起来读，先判断这里缺什么成分，再核对词形。填完把整句读一遍。' },
  { question: /完形/, instruction: '挑一个选错的空，往前后各读一句，圈出能支持答案的词或句子，再把选项放回去试读。' },
  { question: /阅读/, instruction: '重做一道错题，先回原文划出能支持答案的句子，再用自己的话说说原文和选项是怎么对应的。' },
  { question: /语法选择|语法|单项选择|选择|单选/, instruction: '挑一道选错的题，圈出题干里的线索。除了讲为什么选正确项，也请孩子说说原来选的那一项错在哪。' },
  { question: /写作|书面表达|作文/, instruction: '先改原文里一个最想写清楚的要点，补上一句具体的事例或理由。读给自己听一遍，看看两句接不接得上。' },
  { question: /听力/, instruction: '重听一小段前先看题干要找什么，听到答案时记下关键词。回放一次，确认是在哪句话听到的。' },
  { question: /口语|朗读|跟读|口头表达|演讲/, instruction: '挑一两句先听后跟读，再录一遍自己听。先选一处想改的停顿或重音，改好再往下练。' },
];

export function practiceForQuestion(name: string): string {
  return PRACTICES.find(entry => entry.question.test(name))?.instruction
    ?? `从「${name}」挑一道错题，遮住答案重做。对完答案，让孩子说说自己改了哪一步。`;
}

// 一组表情可能含肤色、国旗字母或连接符，只删图形会在家长消息里留下方块。
const EMOJI_PARTS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Variation_Selector}\p{Default_Ignorable_Code_Point}\u20E3]/gu;

export function cleanFeedbackStatus(value?: string): string {
  return (value ?? '').replace(EMOJI_PARTS, '').trim().replace(/[。！!]+$/, '');
}
