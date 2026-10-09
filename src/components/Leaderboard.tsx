import { useState, useMemo, useRef } from 'react';
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
import { copyToClipboard , csvCell, sanitizeFileName } from '@/lib/feedbackTemplates';
import { isAbsentRecord, attendanceKind } from '@/lib/attendance';
import { optionToneLevel } from '@/lib/optionTone';

import { getLessonFullScore } from '@/lib/lessonFullScore';
import fengyunPoster from '@/assets/fengyun-poster.webp';
import { toast } from 'sonner';
import type { StudentRecord, LessonConfig, QuestionType, ClassStats } from '@/types';

interface LeaderboardProps {
  records: StudentRecord[];
  lessonConfig: LessonConfig;
  lessonNumber: number;
  getNickname: (name: string) => string;
  /** 共用 ClassStats 而非内联结构：新增字段（registeredCounts）时不必逐个组件改 */
  calculateClassStats: (records: StudentRecord[], questionTypes: QuestionType[]) => ClassStats;
}

/** 剧场空状态（4 处同形、仅图标与文案不同 → 抽组件消除重复 JSX） */
function TheaterEmptyState({ icon: Icon, text }: { icon: typeof Trophy; text: string }) {
  return (
    <div className="empty-state">
      <Icon className="w-14 h-14 mb-3 empty-ico" />
      <p className="empty-text">{text}</p>
    </div>
  );
}

type LeaderboardMode = 'top10' | 'fengyun' | 'champion' | 'progress' | 'listening' | 'homework';
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
  /** 该生在此范围内有成绩的课次数 */
  lessonCount: number;
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

export function Leaderboard({
  records,
  lessonConfig,
  lessonNumber,
  getNickname,
  calculateClassStats
}: LeaderboardProps) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<LeaderboardMode>('top10');
  const [lessonRange, setLessonRange] = useState<LessonRange>('current');
  const [customStart, setCustomStart] = useState<number>(lessonNumber);
  const [customEnd, setCustomEnd] = useState<number>(lessonNumber);
  const [progressMinLessons, setProgressMinLessons] = useState<number>(2);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const leaderboardRef = useRef<HTMLDivElement>(null);

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

    const sorted = Array.from(latestByStudent.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    // 并列同名次：与学情表 / 公示导出 / 分析弹窗保持同一口径
    let lastScore: number | null = null;
    let lastRank = 0;
    return sorted.map((r, i) => {
      const rank = lastScore !== null && r.totalScore === lastScore ? lastRank : i + 1;
      lastScore = r.totalScore;
      lastRank = rank;
      return {
        id: r.id,
        studentName: r.studentName,
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName)),
        totalScore: r.totalScore,
        correctRate: r.correctRate,
        rank,
      };
    });
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
        // 保留一位小数：浮点减法会产出 4.899999999999999 这类噪声，直接显示很扎眼
        const improvement = Math.round((last.totalScore - first.totalScore) * 10) / 10;
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
          rankChange: first.rank && last.rank ? first.rank - last.rank : undefined,
          // 该生在当前范围内有成绩的课次数（进步至少需要两个课次）
          lessonCount: recs.length,
        };
      })
      // 用"该生自己的课次数"判断是否够对比，而不是比较数组长度 ——
      // 原写法在默认的"当前课次"范围下恒为 true，导致全员以 +0 分上榜
      .filter(item => item.lessonCount >= progressMinLessons)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10);
  }, [rangeRecords, getNickname, progressMinLessons]);

  // 课后任务排名
  const listeningRankings: RankingItem[] = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => !isAbsentRecord(r) && Number(r.listeningScore) > 0)
      .forEach(r => {
        const existing = latestByStudent.get(r.studentName);
        if (!existing || r.lessonNumber > existing.lessonNumber) {
          latestByStudent.set(r.studentName, r);
        }
      });

    const top = Array.from(latestByStudent.values())
      .sort((a, b) => b.listeningScore - a.listeningScore)
      .slice(0, 5);
    // 并列同名次：同分复用前一名次（修复原 `rank || (i>0?0:1)` 并列恒 0 并写进导出的 bug）
    let lastScore: number | null = null;
    let lastRank = 0;
    return top.map((r, i) => {
      const rank = lastScore !== null && r.listeningScore === lastScore ? lastRank : i + 1;
      lastScore = r.listeningScore;
      lastRank = rank;
      return {
        id: r.id,
        studentName: r.studentName,
        nickname: getNickname(r.studentName),
        shortNickname: generateShortNickname(getNickname(r.studentName)),
        totalScore: r.listeningScore,
        correctRate: r.correctRate,
        rank,
        listeningScore: r.listeningScore,
      };
    });
  }, [rangeRecords, getNickname]);

  // 作业优秀学生
  const homeworkExcellent = useMemo(() => {
    const latestByStudent = new Map<string, StudentRecord>();
    rangeRecords
      .filter(r => !isAbsentRecord(r) && optionToneLevel(r.homeworkStatus) === 'good')
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

  // 全勤学生：区间内该生所有记录考勤均为「按时」（关键词归类），而非仅最近一条
  const allPresent = useMemo(() => {
    const byStudent = new Map<string, StudentRecord[]>();
    rangeRecords.forEach(r => {
      const arr = byStudent.get(r.studentName) || [];
      arr.push(r);
      byStudent.set(r.studentName, arr);
    });
    const list: { name: string; nickname: string; shortNickname: string }[] = [];
    byStudent.forEach((recs, name) => {
      if (recs.length === 0) return;
      // 先排除请假/缺勤/调课：否则"有一次请假"就会让全勤榜恒为 0
      const presentRecs = recs.filter(r => !isAbsentRecord(r));
      if (presentRecs.length === 0) return;
      if (!presentRecs.every(r => attendanceKind(r.attendance) === 'onTime')) return;
      list.push({ name, nickname: getNickname(name), shortNickname: generateShortNickname(getNickname(name)) });
    });
    return list;
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
    } else if (mode === 'fengyun') {
      text += ' 风云榜\n\n';
      if (entranceRankings.length > 0) {
        entranceRankings.slice(0, 3).forEach((r) => {
          const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `第${r.rank}名`;
          text += `${medal} ${r.nickname}：${r.totalScore}分（正确率${r.correctRate}%）\n`;
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
          text += `${medal} ${s.nickname}：${s.firstScore}分 → ${s.lastScore}分（${s.improvement >= 0 ? '+' : ''}${s.improvement}分`;
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
      if (mode === 'fengyun') {
        content = '排名,姓名,昵称,总分,正确率\n';
        entranceRankings.slice(0, 3).forEach(r => {
          content += [r.rank, r.studentName, r.nickname, r.totalScore, `${r.correctRate}%`].map(csvCell).join(',') + '\n';
        });
      } else if (mode === 'top10' || mode === 'champion') {
        content = '排名,姓名,昵称,总分,正确率\n';
        const rows = mode === 'champion' && champion ? [champion] : entranceRankings;
        rows.forEach(r => {
          content += [r.rank, r.studentName, r.nickname, r.totalScore, `${r.correctRate}%`].map(csvCell).join(',') + '\n';
        });
      } else if (mode === 'progress') {
        content = '排名,姓名,昵称,起始课次,起始分数,结束课次,结束分数,提升分数,提升率\n';
        progressStars.forEach((s, i) => {
          content += [i + 1, s.studentName, s.nickname, `第${s.firstLesson}课`, s.firstScore, `第${s.lastLesson}课`, s.lastScore, s.improvement, `${s.improvementRate.toFixed(1)}%`].map(csvCell).join(',') + '\n';
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
      else if (mode === 'fengyun') data = { type: 'fengyun', range: rangeText, rankings: entranceRankings.slice(0, 3) };
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
    a.download = sanitizeFileName(filename);
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
    try {
      await new Promise(r => setTimeout(r, 120));
      const target = leaderboardRef.current;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, {
        backgroundColor: document.documentElement.classList.contains('dark') ? '#101826' : '#f3f6fb',
        scale: 2,
        useCORS: true,
        logging: false,
        width: target.offsetWidth,
        height: target.offsetHeight,
        ignoreElements: (el) => el.nodeType === 1 && (el as HTMLElement).hasAttribute('data-h2c-ignore')
      });
      const link = document.createElement('a');
      const modeLabel = mode === 'top10' ? '前十名' : mode === 'fengyun' ? '风云榜' : mode === 'champion' ? '状元' : mode === 'progress' ? '进步之星' : mode === 'listening' ? '课后任务达人' : '作业表彰';
      link.download = sanitizeFileName(`表扬榜_${modeLabel}_${rangeText}.png`);
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

  const fullScore = getLessonFullScore(lessonConfig);

  // 渲染主内容
  const renderContent = () => {
    // 风云榜：底图 = 用户提供的正式模板 PNG（红幕/奖杯/人偶全保留），人名与奖牌动态叠加。
    // 名次规则：同分并列同牌；若并列第 1 的人数 ≥5（含满分大丰收），只显示 2 行（不展示铜牌位）。
    if (mode === 'fengyun') {
      const tieCountAt1 = entranceRankings.filter(r => r.rank === 1).length;
      const shown = entranceRankings.slice(0, tieCountAt1 >= 5 ? 2 : 3);
      const medalOf = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `第${rank}名`;
      return (
        <div className="fengyun-wrap">
          <div className="fengyun-poster">
            <img src={fengyunPoster} alt="本次测试风云榜" className="fengyun-bg" />
            <div className={`fengyun-slots slots-${shown.length}`}>
              {shown.map((r, i) => (
                <div key={r.id} className={`fengyun-row row-${i + 1}`}>
                  <span className="fengyun-medal">{medalOf(r.rank)}</span>
                  <span className="fengyun-name">{r.nickname}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="fengyun-hint">
            {shown.length === 0
              ? '当日小测暂无到课学员数据'
              : shown.length < 3
                ? (tieCountAt1 >= 5 ? `并列第一 ${tieCountAt1} 人，展示前 2 名` : `当日到课 ${shown.length} 人，空位留白`)
                : '名单随当日小测成绩自动更新 · 同分并列' }
          </p>
        </div>
      );
    }

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
                  {[1, 0, 2].map((slot) => {
                    const item = entranceRankings[slot];
                    if (!item) return null;
                    // 名次驱动：同分并列 → 同号同色（如并列第一 → 三张卡片都是金色「1」）
                    const tone = item.rank === 1 ? 'gold' : item.rank === 2 ? 'silver' : item.rank === 3 ? 'bronze' : 'plain';
                    const place = slot === 0 ? 'first' : slot === 1 ? 'second' : 'third';
                    return (
                      <div key={item.id} className={`podium-item place-${place}`}>
                        <div className={`podium-card tone-${tone}`}>
                          <div className={`podium-medal tone-${tone}`}>{item.rank}</div>
                          <p className="podium-short">{item.shortNickname}</p>
                          <p className="podium-full">{item.nickname}</p>
                          <p className="podium-score">{item.totalScore}<span className="podium-unit">分</span></p>
                          <p className="podium-rate">正确率 {item.correctRate}%</p>
                        </div>
                        <div className={`podium-stand tone-${tone}`} />
                      </div>
                    );
                  })}
                </div>
              )}
              {entranceRankings.length > 3 && (
                <div className="rank-list">
                  {entranceRankings.slice(3).map((r) => (
                    <div key={r.id} className="rank-item">
                      <span className="rank-number">{r.rank}</span>
                      <span className="rank-name-cell">
                        <span className="rank-name">{r.shortNickname}</span>
                        <span className="rank-fullname">{r.nickname}</span>
                      </span>
                      <span className="rank-score">{r.totalScore}分</span>
                      <span className="rank-rate">{r.correctRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <TheaterEmptyState icon={Trophy} text="暂无入门测数据" />
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
            <div className="champion-wrap">
              <div className="podium-card champion-card tone-gold">
                <div className="podium-medal tone-gold champion-medal">1</div>
                <div className="champion-crown"><Trophy className="w-6 h-6" /></div>
                <p className="podium-short champion-short">{champion.shortNickname}</p>
                <p className="podium-full">{champion.nickname}</p>
                <p className="podium-score champion-score">{champion.totalScore}<span className="podium-unit">分</span></p>
                <p className="podium-rate">正确率 {champion.correctRate}%</p>
              </div>
              <p className="champion-line">独占鳌头，实至名归！</p>
            </div>
          ) : (
            <TheaterEmptyState icon={Crown} text="暂无数据" />
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
                    <div className="flex items-center gap-2 progress-pts">
                      <span className="progress-from">{s.firstScore}分</span>
                      <TrendingUp className="w-4 h-4 progress-arrow" />
                      <span className="progress-to">{s.lastScore}分</span>
                    </div>
                    <span className="text-sm progress-delta">
                      {s.improvement >= 0 ? '+' : ''}{s.improvement}分 ({s.improvementRate >= 0 ? '+' : ''}{s.improvementRate.toFixed(1)}%)
                      {s.rankChange && s.rankChange > 0 ? ` · 排名前进了${s.rankChange}名` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <TheaterEmptyState icon={TrendingUp} text="暂无足够数据（至少需要2个课次记录）" />
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
                    {r.rank === 1 ? '🏆' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : (r.rank || i + 1)}
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
            <TheaterEmptyState icon={Mic} text="暂无课后任务数据" />
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
    <div className={`space-y-6 praise-root${isExportingImage ? ' praise-exporting' : ''}`} ref={leaderboardRef}>
      {/* 顶部统计（含入截图区域）：干净瓷贴，与全站卡片语言一致 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="praise-kpi">
          <span className="praise-kpi-ico tone-gold"><Trophy className="w-5 h-5" /></span>
          <span className="praise-kpi-text">
            <span className="praise-kpi-label">最高分</span>
            <span className="praise-kpi-value">{stats.maxScore}</span>
          </span>
        </div>
        <div className="praise-kpi">
          <span className="praise-kpi-ico tone-blue"><TrendingUp className="w-5 h-5" /></span>
          <span className="praise-kpi-text">
            <span className="praise-kpi-label">平均分</span>
            <span className="praise-kpi-value">{stats.avgScore}</span>
          </span>
        </div>
        <div className="praise-kpi">
          <span className="praise-kpi-ico tone-violet"><Users className="w-5 h-5" /></span>
          <span className="praise-kpi-text">
            <span className="praise-kpi-label">参考人数</span>
            <span className="praise-kpi-value">{lessonRecords.filter(r => r.totalScore > 0).length}</span>
          </span>
        </div>
        <div className="praise-kpi">
          <span className="praise-kpi-ico tone-emerald"><Star className="w-5 h-5" /></span>
          <span className="praise-kpi-text">
            <span className="praise-kpi-label">满分</span>
            <span className="praise-kpi-value">{fullScore}</span>
          </span>
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
              <SelectItem value="fengyun">🏅 风云榜</SelectItem>
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
