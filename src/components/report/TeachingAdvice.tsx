// 班级教学建议：数字来自当前报告统计；动作写到时间、负责人和复核方式。
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Target, CalendarCheck } from 'lucide-react';

interface AdviseInput {
  className: string;
  validCount: number;
  avgCorrectRate: number;
  weakTypes: { name: string; correctRate: number; count: number }[];
  lowCount: number;
  highCount: number;
  passRate: number;
  excellentRate: number;
}

export function TeachingAdvice({ data }: { data: AdviseInput }) {
  const { className, validCount, avgCorrectRate, weakTypes, lowCount, highCount, passRate, excellentRate } = data;
  const worst = weakTypes[0];
  const second = weakTypes[1];

  return (
    <div className="report-section report-panel teaching-advice">
      <h2 className="report-section-title">
        <Lightbulb className="w-5 h-5 inline mr-2" />
        教学下一步
        <span className="text-xs font-normal text-[color:var(--ink-4)] ml-2">
          {className} · {validCount} 名参评学生（全部课次按学生去重）
        </span>
      </h2>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5">
        <Card className="teaching-facts">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-[color:var(--brand)]" />先看班级现状
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3 text-[color:var(--ink-2)]">
            <div className="teaching-rate-row">
              <span>班级平均正确率</span><strong>{avgCorrectRate}%</strong>
            </div>
            <div className="teaching-rate-row">
              <span>达到课次目标</span><strong>{passRate}%</strong>
            </div>
            <div className="teaching-rate-row">
              <span>正确率 85% 以上</span><strong>{excellentRate}%</strong>
            </div>
            <p className="pt-2 border-t border-black/[0.06]">
              按最近一次有效测评看，前段约 {highCount} 人，后段约 {lowCount} 人。
              后段学生先补基础题和订正过程，前段学生减少细节失分，练习不必同量同难度。
            </p>
            {worst && (
              <p>
                当前得分率较低的是 <b>{worst.name}</b>（{worst.correctRate}%）
                {second ? <>，其次是 <b>{second.name}</b>（{second.correctRate}%）</> : ''}。
                {worst.correctRate < 60 ? '第一项适合安排全班复盘。' : '第一项更适合用短时专项练习巩固。'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="teaching-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[color:var(--brand)]" />按这三个时间点推进
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm teaching-timeline">
            <section>
              <p className="teaching-time">下次课</p>
              <p>{worst ? <>用 15 分钟复盘 <b>{worst.name}</b> 的典型错题，再做一组同类题当堂核对。</> : '用一组基础题回顾上一讲，当堂核对答题过程。'}</p>
              <p>低于班均（{avgCorrectRate}%）的学生，各自在错题旁标出出错步骤；任课老师课后再看一遍。</p>
            </section>
            <section>
              <p className="teaching-time">两周内</p>
              <p>后段约 {lowCount} 人先练基础题，每周复测一次同一板块；目标先看得分率是否连续两次上升。</p>
              <p>{second ? <>针对 <b>{second.name}</b> 补两组变式题，</> : '针对低得分题型补变式题，'}题目由教研组统一，避免各班级难度不一致。</p>
            </section>
            <section>
              <p className="teaching-time">本学期</p>
              <p>每两周整理一次班级错题档案，继续用正确率看变化；跨课次满分不同时，不直接比较原始分。</p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
