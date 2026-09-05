import { useState, useMemo, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trophy, Star, TrendingUp, Mic, BookOpen, Users, Copy, Check, Crown, Sparkles, Award, PartyPopper, Download, FileSpreadsheet, FileJson, ChevronDown, ChevronUp, FileText, Image as ImageIcon } from 'lucide-react';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { isAbsentRecord } from '@/lib/attendance';
import { toast } from 'sonner';
import type { StudentRecord, LessonConfig, QuestionType } from '@/types';

interface LeaderboardProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => { maxScore: number; minScore: number; avgScore: number; avgScores: { [key: string]: number } };
}

type LeaderboardMode = 'top10' | 'champion' | 'progress' | 'listening' | 'homework';
type LessonRange = 'current' | 'all' | 'custom';
type ExportFormat = 'text' | 'csv' | 'json';

interface RankingItem {
  id: string;
  studentName: string;
  nickname: string;
  shortNickname: string;
  totalScore: number;
  correctRate: number;
  rank: number;
  listeningScore?: number;
}

interface ProgressItem {
  studentName: string;
  nickname: string;
  shortNickname: string;
  firstLesson: number;
  lastLesson: number;
  firstScore: number;
  lastScore: number;
  improvement: number;
  improvementRate: number;
  firstRank?: number;
  lastRank?: number;
  rankChange?: number;
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
  const [mode, setMode] = useState<LeaderboardMode>('top10');
  const [lessonRange, setLessonRange] = useState<LessonRange>('current');
  const [customStart, setCustomStart] = useState<number>(lessonNumber);
  const [customEnd, setCustomEnd] = useState<number>(lessonNumber);
  const [progressMinLessons, setProgressMinLessons] = useState<number>(2);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const leaderboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // 可用课次列表
  const allLessons = useMemo(() => {
    const lessons = Array.from(new Set(records.map(r => r.lessonNumber)));
    return lessons.sort((a, b) => a - b);
  }, [records]);

  // 当前选择的课次范围
  const effectiveRange = useMemo(() => {
    if (lessonRange === 'current') return [lessonNumber];
    if (lessonRange === 'all') return allLessons;
    const start = Math.min(customStart, customEnd);
    const end = Math.max(customStart, customEnd);
    return allLessons.filter(l => l >= start && l <= end);
  }, [lessonRange, lessonNumber, allLessons, customStart, customEnd]);

  // 范围内的记录
  const rangeRecords = useMemo(() =>
    records.filter(r => effectiveRange.includes(r.lessonNumber)),
    [records, effectiveRange]
  );

  // 当前课次记录（用于显示统计卡片）
  const lessonRecords = useMemo(() =>
    records.filter(r => r.lessonNumber === lessonNumber),
    [records, lessonNumber]
  );

  const stats = useMemo(() =>
    calculateClassStats(lessonRecords, lessonConfig.questionTypes),
    [lessonRecords, lessonConfig.questionTypes, calculateClassStats]
  );

  // 入门测排名（前十名）
  const entranceRankings: RankingItem[] = useMemo(() => {
    // 如果是当前课次或自定义范围，按最后一次记录排序
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => r.totalScore > 0 && !isAbsentRecord(r))
      .forEach(r => {
        const existing = latestByStudent.get(r.studentName);
        if (!existing || r.lessonNumber > existing.lessonNumber) {
          latestByStudent.set(r.studentName, r);
        }
      });

    return Array.from(latestByStudent.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10)
      .map((r, i) => ({
        id: r.id,
        studentName: r.studentName,
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName)),
        totalScore: r.totalScore,
        correctRate: r.correctRate,
        rank: i + 1
      }));
  }, [rangeRecords, getNickname]);

  // 状元（第一名）
  const champion = useMemo(() =>
    entranceRankings[0] || null,
    [entranceRankings]
  );

  // 进步之星（跨课次真实提升）
  const progressStars: ProgressItem[] = useMemo(() => {
    const studentRecords = new Map<string, StudentRecord[]>();
    rangeRecords
      .filter(r => r.totalScore > 0 && !isAbsentRecord(r))
      .forEach(r => {
        if (!studentRecords.has(r.studentName)) {
          studentRecords.set(r.studentName, []);
        }
        studentRecords.get(r.studentName)!.push(r);
      });

    return Array.from(studentRecords.entries())
      .map(([name, recs]) => {
        recs.sort((a, b) => a.lessonNumber - b.lessonNumber);
        const first = recs[0];
        const last = recs[recs.length - 1];
        const improvement = last.totalScore - first.totalScore;
        const improvementRate = first.totalScore > 0
          ? (improvement / first.totalScore) * 100
          : 0;
        return {
          studentName: name,
          nickname: getNickname(name),
          shortNickname: generateShortNickname(getNickname(name)),
          firstLesson: first.lessonNumber,
          lastLesson: last.lessonNumber,
          firstScore: first.totalScore,
          lastScore: last.totalScore,
          improvement,
          improvementRate,
          firstRank: first.rank,
          lastRank: last.rank,
          rankChange: first.rank && last.rank ? first.rank - last.rank : undefined
        };
      })
      .filter(item => rangeRecords.length === lessonRecords.length ? true : (item.lastLesson - item.firstLesson + 1) >= progressMinLessons)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10);
  }, [rangeRecords, getNickname, lessonRecords.length, progressMinLessons]);

  // 课后任务排名
  const listeningRankings: RankingItem[] = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => r.listeningStatus === '具体分数' && r.listeningScore > 0)
      .forEach(r => {
        const existing = latestByStudent.get(r.studentName);
        if (!existing || r.lessonNumber > existing.lessonNumber) {
          latestByStudent.set(r.studentName, r);
        }
      });

    return Array.from(latestByStudent.values())
      .sort((a, b) => b.listeningScore - a.listeningScore)
      .slice(0, 5)
      .map((r, i) => ({
        id: r.id,
        studentName: r.studentName,
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName)),
        totalScore: r.listeningScore,
        correctRate: r.correctRate,
        rank: i + 1,
        listeningScore: r.listeningScore
      }));
  }, [rangeRecords, getNickname]);

  // 作业优秀学生
  const homeworkExcellent = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => r.homeworkStatus === '超赞完成')
      .forEach(r => {
        const existing = latestByStudent.get(r.studentName);
        if (!existing || r.lessonNumber > existing.lessonNumber) {
          latestByStudent.set(r.studentName, r);
        }
      });

    return Array.from(latestByStudent.values()).map(r => ({
      name: r.studentName,
      nickname: getNickname(r.studentName),
      shortNickname: generateShortNickname(getNickname(r.studentName))
    }));
  }, [rangeRecords, getNickname]);

  // 全勤学生
  const allPresent = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => r.attendance === '按时出勤')
      .forEach(r => {
        const existing = latestByStudent.get(r.studentName);
        if (!existing || r.lessonNumber > existing.lessonNumber) {
          latestByStudent.set(r.studentName, r);
        }
      });

    return Array.from(latestByStudent.values()).map(r => ({
      name: r.studentName,
      nickname: getNickname(r.studentName),
      shortNickname: generateShortNickname(getNickname(r.studentName))
    }));
  }, [rangeRecords, getNickname]);

  // 范围显示文本
  const rangeText = useMemo(() => {
    if (lessonRange === 'current') return `第${lessonNumber}课`;
    if (lessonRange === 'all') return '全部课次';
    const start = Math.min(customStart, customEnd);
    const end = Math.max(customStart, customEnd);
    return `第${start}–${end}课`;
  }, [lessonRange, lessonNumber, customStart, customEnd]);

  // 生成表彰文本
  const generatePraiseText = () => {
    let text = `🏆 ${rangeText}`;
    if (mode === 'top10') {
      text += ' 入门测前十名\n\n';
      if (entranceRankings.length > 0) {
        const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        entranceRankings.forEach((r, i) => {
          text += `${rankEmojis[i]} ${r.nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
        });
      } else {
        text += '暂无数据\n';
      }
    } else if (mode === 'champion') {
      text += ' 入门测状元\n\n';
      if (champion) {
        text += `👑 ${champion.nickname}：${champion.totalScore}分（正确率${champion.correctRate}%）\n`;
        text += '独占鳌头，实至名归！\n';
      } else {
        text += '暂无数据\n';
      }
    } else if (mode === 'progress') {
      text += ' 进步之星\n\n';
      if (progressStars.length > 0) {
        progressStars.forEach((s, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
          text += `${medal} ${s.nickname}：${s.firstScore}分 → ${s.lastScore}分（+${s.improvement}分`;
          if (s.rankChange && s.rankChange > 0) {
            text += `，排名前进${s.rankChange}名`;
          }
          text += `）\n`;
        });
      } else {
        text += '暂无数据\n';
      }
    } else if (mode === 'listening') {
      text += ' 课后任务达人\n\n';
      if (listeningRankings.length > 0) {
        const rankIcons = ['🏆', '🥈', '🥉', '📌', '📌'];
        listeningRankings.forEach((r, i) => {
          text += `${rankIcons[i]} ${r.nickname}：${r.listeningScore}分\n`;
        });
      } else {
        text += '暂无数据\n';
      }
    } else if (mode === 'homework') {
      text += ' 作业与出勤表彰\n\n';
      if (homeworkExcellent.length > 0) {
        text += `📚【作业超赞】\n${homeworkExcellent.map(s => s.nickname).join('、')}\n\n`;
      }
      if (allPresent.length > 0) {
        text += `✅【全勤之星】\n${allPresent.map(s => s.nickname).join('、')}\n\n`;
      }
    }

    text += '\n恭喜以上同学！继续加油！💪';
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

  // 导出数据
  const handleExport = (format: ExportFormat) => {
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'text') {
      content = generatePraiseText();
      filename = `表扬榜_${rangeText}.txt`;
      mimeType = 'text/plain;charset=utf-8';
    } else if (format === 'csv') {
      if (mode === 'top10' || mode === 'champion') {
        content = '排名,姓名,昵称,总分,正确率\n';
        const rows = mode === 'champion' && champion ? [champion] : entranceRankings;
        rows.forEach(r => {
          content += `${r.rank},${r.studentName},${r.nickname},${r.totalScore},${r.correctRate}%\n`;
        });
      } else if (mode === 'progress') {
        content = '排名,姓名,昵称,起始课次,起始分数,结束课次,结束分数,提升分数,提升率\n';
        progressStars.forEach((s, i) => {
          content += `${i + 1},${s.studentName},${s.nickname},第${s.firstLesson}课,${s.firstScore},第${s.lastLesson}课,${s.lastScore},${s.improvement},${s.improvementRate.toFixed(1)}%\n`;
        });
      } else if (mode === 'listening') {
        content = '排名,姓名,昵称,课后任务分数\n';
        listeningRankings.forEach(r => {
          content += `${r.rank},${r.studentName},${r.nickname},${r.listeningScore}\n`;
        });
      } else if (mode === 'homework') {
        content = '类别,姓名,昵称\n';
        homeworkExcellent.forEach(s => {
          content += `作业超赞,${s.name},${s.nickname}\n`;
        });
        allPresent.forEach(s => {
          content += `全勤之星,${s.name},${s.nickname}\n`;
        });
      }
      filename = `表扬榜_${rangeText}_${mode}.csv`;
      mimeType = 'text/csv;charset=utf-8';
    } else if (format === 'json') {
      let data: unknown;
      if (mode === 'top10') data = { type: 'top10', range: rangeText, rankings: entranceRankings };
      else if (mode === 'champion') data = { type: 'champion', range: rangeText, champion };
      else if (mode === 'progress') data = { type: 'progress', range: rangeText, stars: progressStars };
      else if (mode === 'listening') data = { type: 'listening', range: rangeText, rankings: listeningRankings };
      else data = { type: 'homework', range: rangeText, homeworkExcellent, allPresent };
      content = JSON.stringify(data, null, 2);
      filename = `表扬榜_${rangeText}_${mode}.json`;
      mimeType = 'application/json;charset=utf-8';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${format.toUpperCase()}`);
    setShowExportMenu(false);
  };

  // 导出当前榜单为图片（过滤控制栏与彩带层，保证完整清晰）
  const handleExportImage = async () => {
    setShowExportMenu(false);
    if (!leaderboardRef.current || isExportingImage) return;
    setIsExportingImage(true);
    // 关闭彩带层，避免动画元素被截入图片
    setShowConfetti(false);
    try {
      await new Promise(r => setTimeout(r, 120));
      const target = leaderboardRef.current;
      const canvas = await html2canvas(target, {
        backgroundColor: '#f1f5f9',
        scale: 2,
        useCORS: true,
        logging: false,
        width: target.offsetWidth,
        height: target.offsetHeight,
        ignoreElements: (el) => el.nodeType === 1 && (el as HTMLElement).hasAttribute('data-h2c-ignore')
      });
      const link = document.createElement('a');
      const modeLabel = mode === 'top10' ? '前十名' : mode === 'champion' ? '状元' : mode === 'progress' ? '进步之星' : mode === 'listening' ? '课后任务达人' : '作业表彰';
      link.download = `表扬榜_${modeLabel}_${rangeText}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('榜单图片已导出');
    } catch (err) {
      console.error('导出图片失败:', err);
      toast.error('图片导出失败：' + err);
    } finally {
      setIsExportingImage(false);
    }
  };

  const fullScore = lessonConfig.questionTypes.reduce((sum, qt) => sum + qt.fullScore, 0);

  // 渲染主内容
  const renderContent = () => {
    if (mode === 'top10') {
      return (
        <div className="theater-stage">
          <div className="spotlight spotlight-left" />
          <div className="spotlight spotlight-right" />
          <div className="theater-header">
            <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
            <h2 className="theater-title">{rangeText} 入门测前十名</h2>
            <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
          </div>
          {entranceRankings.length > 0 ? (
            <>
              {entranceRankings.slice(0, 3).length >= 3 && (
                <div className="podium-stage">
                  {entranceRankings[1] && (
                    <div className="podium-item second-place">
                      <div className="torn-paper-card silver-paper">
                        <div className="medal-badge silver">2</div>
                        <p className="student-name">{entranceRankings[1].shortNickname}</p>
                        <p className="student-fullname">{entranceRankings[1].nickname}</p>
                        <p className="score-text">{entranceRankings[1].totalScore}分</p>
                        <p className="rate-text">{entranceRankings[1].correctRate}%</p>
                      </div>
                      <div className="podium-base silver-base">🥈</div>
                    </div>
                  )}
                  {entranceRankings[0] && (
                    <div className="podium-item first-place">
                      <div className="trophy-float">
                        <Trophy className="w-16 h-16 text-yellow-300" />
                      </div>
                      <div className="torn-paper-card gold-paper">
                        <div className="crown-icon">👑</div>
                        <p className="student-name champion">{entranceRankings[0].shortNickname}</p>
                        <p className="student-fullname">{entranceRankings[0].nickname}</p>
                        <p className="score-text champion">{entranceRankings[0].totalScore}分</p>
                        <p className="rate-text">{entranceRankings[0].correctRate}%</p>
                      </div>
                      <div className="podium-base gold-base">🥇</div>
                    </div>
                  )}
                  {entranceRankings[2] && (
                    <div className="podium-item third-place">
                      <div className="torn-paper-card bronze-paper">
                        <div className="medal-badge bronze">3</div>
                        <p className="student-name">{entranceRankings[2].shortNickname}</p>
                        <p className="student-fullname">{entranceRankings[2].nickname}</p>
                        <p className="score-text">{entranceRankings[2].totalScore}分</p>
                        <p className="rate-text">{entranceRankings[2].correctRate}%</p>
                      </div>
                      <div className="podium-base bronze-base">🥉</div>
                    </div>
                  )}
                </div>
              )}
              {entranceRankings.length > 3 && (
                <div className="rank-list">
                  {entranceRankings.slice(3).map((r) => (
                    <div key={r.id} className="rank-item">
                      <span className="rank-number">{r.rank}</span>
                      <span className="rank-name">{r.shortNickname}</span>
                      <span className="rank-fullname">{r.nickname}</span>
                      <span className="rank-score">{r.totalScore}分</span>
                      <span className="rank-rate">{r.correctRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Trophy className="w-20 h-20 text-yellow-300/50 mb-4" />
              <p className="text-white/70 text-lg">暂无入门测数据</p>
            </div>
          )}
        </div>
      );
    }

    if (mode === 'champion') {
      return (
        <div className="theater-stage">
          <div className="spotlight spotlight-left" />
          <div className="spotlight spotlight-right" />
          <div className="theater-header">
            <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
            <h2 className="theater-title">{rangeText} 入门测状元</h2>
            <Crown className="w-10 h-10 text-yellow-300 crown-shine" />
          </div>
          {champion ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-40 h-40 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 flex items-center justify-center shadow-2xl mb-8 animate-pulse">
                <Trophy className="w-20 h-20 text-red-900" />
              </div>
              <div className="torn-paper-card gold-paper scale-110">
                <div className="crown-icon text-4xl">👑</div>
                <p className="student-name champion text-3xl">{champion.shortNickname}</p>
                <p className="student-fullname text-lg">{champion.nickname}</p>
                <p className="score-text champion text-3xl mt-4">{champion.totalScore}分</p>
                <p className="rate-text text-lg">正确率 {champion.correctRate}%</p>
              </div>
              <p className="mt-8 text-white/90 text-xl font-medium">独占鳌头，实至名归！</p>
            </div>
          ) : (
            <div className="empty-state">
              <Crown className="w-20 h-20 text-yellow-300/50 mb-4" />
              <p className="text-white/70 text-lg">暂无数据</p>
            </div>
          )}
        </div>
      );
    }

    if (mode === 'progress') {
      return (
        <div className="theater-stage green-stage">
          <div className="spotlight spotlight-left" />
          <div className="spotlight spotlight-right" />
          <div className="theater-header">
            <TrendingUp className="w-10 h-10 text-yellow-300 crown-shine" />
            <h2 className="theater-title">{rangeText} 进步之星</h2>
            <TrendingUp className="w-10 h-10 text-yellow-300 crown-shine" />
          </div>
          {progressStars.length > 0 ? (
            <div className="progress-list">
              {progressStars.map((s, i) => (
                <div key={s.studentName} className={`progress-card rank-${i + 1}`}>
                  <div className="progress-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </div>
                  <div className="progress-info">
                    <p className="progress-name">{s.shortNickname}</p>
                    <p className="progress-fullname">{s.nickname}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 text-white">
                      <span className="text-white/70">{s.firstScore}分</span>
                      <TrendingUp className="w-4 h-4 text-emerald-300" />
                      <span className="font-bold text-emerald-300">{s.lastScore}分</span>
                    </div>
                    <span className="text-sm text-emerald-200">
                      +{s.improvement}分 ({s.improvementRate.toFixed(1)}%)
                      {s.rankChange && s.rankChange > 0 ? ` · 排名前进了${s.rankChange}名` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <TrendingUp className="w-20 h-20 text-yellow-300/50 mb-4" />
              <p className="text-white/70 text-lg">暂无足够数据（至少需要2个课次记录）</p>
            </div>
          )}
        </div>
      );
    }

    if (mode === 'listening') {
      return (
        <div className="theater-stage purple-stage">
          <div className="spotlight spotlight-left" />
          <div className="spotlight spotlight-right" />
          <div className="theater-header">
            <Mic className="w-10 h-10 text-yellow-300 crown-shine" />
            <h2 className="theater-title">{rangeText} 课后任务达人</h2>
            <Mic className="w-10 h-10 text-yellow-300 crown-shine" />
          </div>
          {listeningRankings.length > 0 ? (
            <div className="listening-grid">
              {listeningRankings.map((r, i) => (
                <div key={r.id} className={`listening-card rank-${i + 1}`}>
                  <div className="listening-rank">
                    {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </div>
                  <div className="listening-content">
                    <p className="listening-name">{r.shortNickname}</p>
                    <p className="listening-fullname">{r.nickname}</p>
                  </div>
                  <div className="listening-score">
                    <span className="score-number">{r.listeningScore}</span>
                    <span className="score-label">分</span>
                  </div>
                  {i === 0 && <Sparkles className="sparkle-icon" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Mic className="w-20 h-20 text-yellow-300/50 mb-4" />
              <p className="text-white/70 text-lg">暂无课后任务数据</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="honor-wall">
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
    );
  };

  return (
    <div className="space-y-6" ref={leaderboardRef}>
      {showConfetti && <Confetti />}

      {/* 顶部统计卡片（含入截图区域） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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

      {/* 控制栏：榜单类型 + 课次范围 + 操作按钮（导出图片时忽略此区域） */}
      <div data-h2c-ignore className="relative z-30 flex flex-wrap items-end gap-4 p-4 sm:p-5 ios-glass-card rounded-[var(--r-lg)]">
        <div className="space-y-1.5">
          <Label className="text-sm text-[color:var(--ink-2)]">榜单类型</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as LeaderboardMode)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top10">🏆 前十名</SelectItem>
              <SelectItem value="champion">👑 状元</SelectItem>
              <SelectItem value="progress">📈 进步之星</SelectItem>
              <SelectItem value="listening">🎙️ 课后任务达人</SelectItem>
              <SelectItem value="homework">📚 作业表彰</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-[color:var(--ink-2)]">课次范围</Label>
          <Select value={lessonRange} onValueChange={(v) => setLessonRange(v as LessonRange)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">当前课次</SelectItem>
              <SelectItem value="all">全部课次</SelectItem>
              <SelectItem value="custom">自定义范围</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {lessonRange === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-sm text-[color:var(--ink-2)]">起始课次</Label>
              <Input
                type="number"
                min={1}
                value={customStart}
                onChange={(e) => setCustomStart(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-[color:var(--ink-2)]">结束课次</Label>
              <Input
                type="number"
                min={1}
                value={customEnd}
                onChange={(e) => setCustomEnd(Number(e.target.value))}
                className="w-24"
              />
            </div>
          </>
        )}

        {mode === 'progress' && lessonRange !== 'current' && (
          <div className="space-y-1.5">
            <Label className="text-sm text-[color:var(--ink-2)]">最少课次数</Label>
            <Input
              type="number"
              min={2}
              max={20}
              value={progressMinLessons}
              onChange={(e) => setProgressMinLessons(Number(e.target.value))}
              className="w-24"
            />
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button onClick={handleCopy} className="gap-2 theater-button">
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制榜单
              </>
            )}
          </Button>

          <div className="relative">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <Download className="w-4 h-4" />
              导出
              {showExportMenu ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-lg shadow-xl border border-black/[0.06] overflow-hidden z-50">
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2"
                  onClick={() => handleExport('text')}
                >
                  <FileText className="w-4 h-4 text-[color:var(--ink-4)]" />
                  导出文本
                </button>
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2"
                  onClick={() => handleExport('csv')}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  导出 CSV
                </button>
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2"
                  onClick={() => handleExport('json')}
                >
                  <FileJson className="w-4 h-4 text-blue-500" />
                  导出 JSON
                </button>
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-black/[0.04] flex items-center gap-2 border-t border-black/[0.06]"
                  onClick={handleExportImage}
                  disabled={isExportingImage}
                >
                  <ImageIcon className="w-4 h-4 text-violet-500" />
                  {isExportingImage ? '生成中...' : '导出图片'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 榜单内容 */}
      {renderContent()}
    </div>
  );
}
