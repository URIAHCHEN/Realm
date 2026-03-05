import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, Star, TrendingUp, Mic, BookOpen, Users, Copy, Check, Crown, Sparkles, Award, PartyPopper } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { toast } from 'sonner';
import type { StudentRecord, LessonConfig, QuestionType } from '@/types';

interface LeaderboardProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
}

// 生成短昵称
function generateShortNickname(fullName: string): string {
  if (fullName.length >= 3) {
    return fullName.slice(-2);
  } else if (fullName.length === 2) {
    const lastChar = fullName.slice(-1);
    return lastChar + lastChar;
  }
  return fullName;
}

// 彩带组件
function Confetti() {
  const [confetti, setConfetti] = useState<Array<{ id: number; left: number; delay: number; color: string }>>([]);

  useEffect(() => {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFE66D', '#FF6B9D', '#C7CEEA'];
    const newConfetti = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setConfetti(newConfetti);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confetti.map((c) => (
        <div
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            backgroundColor: c.color
          }}
        />
      ))}
    </div>
  );
}

export function Leaderboard({
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: LeaderboardProps) {
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const lessonRecords = useMemo(() => 
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() => 
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  // 入门测排名
  const entranceRankings = useMemo(() => {
    return lessonRecords
      .filter(r => r.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
  }, [lessonRecords]);

  // 乐听说排名
  const listeningRankings = useMemo(() => {
    return lessonRecords
      .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
      .sort((a, b) => b.listeningScore - a.listeningScore)
      .slice(0, 5);
  }, [lessonRecords]);

  // 作业优秀学生
  const homeworkExcellent = useMemo(() => {
    return lessonRecords
      .filter(r => r.homeworkStatus === '超赞完成')
      .map(r => ({ 
        name: r.studentName, 
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName))
      }));
  }, [lessonRecords, getNickname]);

  // 全勤学生
  const allPresent = useMemo(() => {
    return lessonRecords
      .filter(r => r.attendance === '按时出勤')
      .map(r => ({ 
        name: r.studentName, 
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName))
      }));
  }, [lessonRecords, getNickname]);

  // 进步之星（与平均分差距最小的前3名）
  const progressStars = useMemo(() => {
    return lessonRecords
      .filter(r => r.totalScore > 0)
      .map(r => ({
        name: r.studentName,
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName)),
        diff: Math.abs(r.totalScore - stats.avgScore)
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3);
  }, [lessonRecords, stats.avgScore, getNickname]);

  // 生成表彰文本
  const generatePraiseText = () => {
    let text = `🏆 第${lessonNumber}课综合表扬榜\n\n`;

    // 入门测风云榜
    if (entranceRankings.length > 0) {
      text += '📊【入门测风云榜】\n';
      const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      entranceRankings.forEach((r, i) => {
        const shortName = generateShortNickname(getNickname(r.studentName));
        text += `${rankEmojis[i]} ${shortName}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
      });
      text += '\n';
    }

    // 乐听说达人
    if (listeningRankings.length > 0) {
      text += '🎙️【乐听说达人】\n';
      const rankEmojis = ['🏆', '🥈', '🥉', '📌', '📌'];
      listeningRankings.forEach((r, i) => {
        const shortName = generateShortNickname(getNickname(r.studentName));
        text += `${rankEmojis[i]} ${shortName}：${r.listeningScore}分\n`;
      });
      text += '\n';
    }

    // 作业超赞
    if (homeworkExcellent.length > 0) {
      text += `📚【作业超赞】\n`;
      text += homeworkExcellent.map(s => s.shortNickname).join('、');
      text += '\n\n';
    }

    // 全勤之星
    if (allPresent.length > 0) {
      text += `✅【全勤之星】\n`;
      text += allPresent.map(s => s.shortNickname).join('、');
      text += '\n\n';
    }

    // 稳步前进
    if (progressStars.length > 0) {
      text += `📈【稳步前进】\n`;
      text += progressStars.map(s => s.shortNickname).join('、');
      text += '\n\n';
    }

    text += '恭喜以上同学！继续加油！💪';
    return text;
  };

  // 复制表彰文本
  const handleCopy = async () => {
    const text = generatePraiseText();
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('表扬榜已复制！');
    }
  };

  const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);

  return (
    <div className="space-y-6">
      {showConfetti && <Confetti />}
      
      {/* 顶部统计卡片 - 剧场风格 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="theater-stat-card gold-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shadow-lg trophy-pulse">
              <Trophy className="w-6 h-6 text-red-900" />
            </div>
            <div>
              <p className="text-sm text-amber-700 font-medium">最高分</p>
              <p className="text-2xl font-bold text-red-800">{stats.maxScore}</p>
            </div>
          </div>
        </div>
        <div className="theater-stat-card gold-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-lg">
              <TrendingUp className="w-6 h-6 text-red-900" />
            </div>
            <div>
              <p className="text-sm text-amber-700 font-medium">平均分</p>
              <p className="text-2xl font-bold text-red-800">{stats.avgScore}</p>
            </div>
          </div>
        </div>
        <div className="theater-stat-card gold-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-red-900" />
            </div>
            <div>
              <p className="text-sm text-amber-700 font-medium">参考人数</p>
              <p className="text-2xl font-bold text-red-800">{lessonRecords.filter(r => r.totalScore > 0).length}</p>
            </div>
          </div>
        </div>
        <div className="theater-stat-card gold-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg">
              <Star className="w-6 h-6 text-red-900" />
            </div>
            <div>
              <p className="text-sm text-amber-700 font-medium">满分</p>
              <p className="text-2xl font-bold text-red-800">{fullScore}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 复制按钮 */}
      <div className="flex justify-end">
        <Button onClick={handleCopy} className="gap-2 theater-button">
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              复制表扬榜
            </>
          )}
        </Button>
      </div>

      {/* 表扬榜内容 - 剧场风格 */}
      <Tabs defaultValue="entrance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 theater-tabs">
          <TabsTrigger value="entrance" className="gap-2 theater-tab">
            <Trophy className="w-4 h-4" />
            入门测风云榜
          </TabsTrigger>
          <TabsTrigger value="listening" className="gap-2 theater-tab">
            <Mic className="w-4 h-4" />
            乐听说达人
          </TabsTrigger>
          <TabsTrigger value="homework" className="gap-2 theater-tab">
            <BookOpen className="w-4 h-4" />
            作业表彰
          </TabsTrigger>
          <TabsTrigger value="comprehensive" className="gap-2 theater-tab">
            <Medal className="w-4 h-4" />
            综合表彰
          </TabsTrigger>
        </TabsList>

        {/* 入门测风云榜 - 领奖台布局 */}
        <TabsContent value="entrance">
          <div className="theater-stage">
            {/* 聚光灯效果 */}
            <div className="spotlight spotlight-left" />
            <div className="spotlight spotlight-right" />
            
            <div className="theater-header">
              <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
              <h2 className="theater-title">第{lessonNumber}课入门测风云榜</h2>
              <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
            </div>
            
            {entranceRankings.length > 0 ? (
              <div className="podium-container">
                {/* 领奖台 - 前三名特殊展示 */}
                {entranceRankings.slice(0, 3).length >= 3 && (
                  <div className="podium-stage">
                    {/* 第二名 */}
                    {entranceRankings[1] && (
                      <div className="podium-item second-place">
                        <div className="torn-paper-card silver-paper">
                          <div className="medal-badge silver">2</div>
                          <p className="student-name">{generateShortNickname(getNickname(entranceRankings[1].studentName))}</p>
                          <p className="student-fullname">{getNickname(entranceRankings[1].studentName)}</p>
                          <p className="score-text">{entranceRankings[1].totalScore}分</p>
                          <p className="rate-text">{entranceRankings[1].correctRate}%</p>
                        </div>
                        <div className="podium-base silver-base">🥈</div>
                      </div>
                    )}
                    {/* 第一名 */}
                    {entranceRankings[0] && (
                      <div className="podium-item first-place">
                        <div className="trophy-float">
                          <Trophy className="w-16 h-16 text-yellow-300" />
                        </div>
                        <div className="torn-paper-card gold-paper">
                          <div className="crown-icon">👑</div>
                          <p className="student-name champion">{generateShortNickname(getNickname(entranceRankings[0].studentName))}</p>
                          <p className="student-fullname">{getNickname(entranceRankings[0].studentName)}</p>
                          <p className="score-text champion">{entranceRankings[0].totalScore}分</p>
                          <p className="rate-text">{entranceRankings[0].correctRate}%</p>
                        </div>
                        <div className="podium-base gold-base">🥇</div>
                      </div>
                    )}
                    {/* 第三名 */}
                    {entranceRankings[2] && (
                      <div className="podium-item third-place">
                        <div className="torn-paper-card bronze-paper">
                          <div className="medal-badge bronze">3</div>
                          <p className="student-name">{generateShortNickname(getNickname(entranceRankings[2].studentName))}</p>
                          <p className="student-fullname">{getNickname(entranceRankings[2].studentName)}</p>
                          <p className="score-text">{entranceRankings[2].totalScore}分</p>
                          <p className="rate-text">{entranceRankings[2].correctRate}%</p>
                        </div>
                        <div className="podium-base bronze-base">🥉</div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* 4-10名列表 */}
                {entranceRankings.length > 3 && (
                  <div className="rank-list">
                    {entranceRankings.slice(3).map((r, i) => (
                      <div key={r.id} className="rank-item">
                        <span className="rank-number">{i + 4}</span>
                        <span className="rank-name">{generateShortNickname(getNickname(r.studentName))}</span>
                        <span className="rank-fullname">{getNickname(r.studentName)}</span>
                        <span className="rank-score">{r.totalScore}分</span>
                        <span className="rank-rate">{r.correctRate}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <Trophy className="w-20 h-20 text-yellow-300/50 mb-4" />
                <p className="text-white/70 text-lg">暂无入门测数据</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 乐听说达人 */}
        <TabsContent value="listening">
          <div className="theater-stage purple-stage">
            <div className="spotlight spotlight-left" />
            <div className="spotlight spotlight-right" />
            
            <div className="theater-header">
              <Mic className="w-10 h-10 text-yellow-300 crown-shine" />
              <h2 className="theater-title">第{lessonNumber}课乐听说达人</h2>
              <Mic className="w-10 h-10 text-yellow-300 crown-shine" />
            </div>
            
            {listeningRankings.length > 0 ? (
              <div className="listening-grid">
                {listeningRankings.map((r, i) => {
                  const nickname = getNickname(r.studentName);
                  const shortName = generateShortNickname(nickname);
                  
                  return (
                    <div key={r.id} className={`listening-card rank-${i + 1}`}>
                      <div className="listening-rank">
                        {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </div>
                      <div className="listening-content">
                        <p className="listening-name">{shortName}</p>
                        <p className="listening-fullname">{nickname}</p>
                      </div>
                      <div className="listening-score">
                        <span className="score-number">{r.listeningScore}</span>
                        <span className="score-label">分</span>
                      </div>
                      {i === 0 && <Sparkles className="sparkle-icon" />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <Mic className="w-20 h-20 text-yellow-300/50 mb-4" />
                <p className="text-white/70 text-lg">暂无乐听说数据</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 作业表彰 */}
        <TabsContent value="homework">
          <div className="honor-wall">
            {/* 作业超赞 */}
            <div className="honor-section">
              <div className="honor-header red-ribbon">
                <BookOpen className="w-6 h-6" />
                <h3>作业超赞</h3>
                <Award className="w-6 h-6" />
              </div>
              <div className="honor-content">
                {homeworkExcellent.length > 0 ? (
                  <div className="honor-badges">
                    {homeworkExcellent.map((s, i) => (
                      <div key={i} className="honor-badge gold-badge">
                        <Star className="w-4 h-4" />
                        <span>{s.shortNickname}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="honor-empty">暂无数据</p>
                )}
              </div>
            </div>

            {/* 全勤之星 */}
            <div className="honor-section">
              <div className="honor-header green-ribbon">
                <Users className="w-6 h-6" />
                <h3>全勤之星</h3>
                <PartyPopper className="w-6 h-6" />
              </div>
              <div className="honor-content">
                {allPresent.length > 0 ? (
                  <div className="honor-badges">
                    {allPresent.map((s, i) => (
                      <div key={i} className="honor-badge emerald-badge">
                        <Check className="w-4 h-4" />
                        <span>{s.shortNickname}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="honor-empty">暂无数据</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 综合表彰 */}
        <TabsContent value="comprehensive">
          <div className="theater-stage blue-stage">
            <div className="spotlight spotlight-left" />
            <div className="spotlight spotlight-right" />
            
            <div className="theater-header">
              <Medal className="w-10 h-10 text-yellow-300 crown-shine" />
              <h2 className="theater-title">稳步前进</h2>
              <Medal className="w-10 h-10 text-yellow-300 crown-shine" />
            </div>
            
            {progressStars.length > 0 ? (
              <div className="progress-list">
                {progressStars.map((s, i) => (
                  <div key={i} className={`progress-card rank-${i + 1}`}>
                    <div className="progress-rank">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </div>
                    <div className="progress-info">
                      <p className="progress-name">{s.shortNickname}</p>
                      <p className="progress-fullname">{s.nickname}</p>
                    </div>
                    <div className="progress-diff">
                      <span className="diff-label">与平均分差距</span>
                      <span className="diff-value">{s.diff.toFixed(1)}分</span>
                    </div>
                    <TrendingUp className="progress-icon" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <TrendingUp className="w-20 h-20 text-yellow-300/50 mb-4" />
                <p className="text-white/70 text-lg">暂无数据</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
