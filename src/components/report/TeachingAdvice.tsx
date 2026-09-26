// 教学建议（3-2-1）：按「学情分析报告 · 初中」技能的口径生成。
//
// 三条硬规矩（来自该技能）：
//  1. 每一条结论都要有数据支撑（"约 30% 学生"而不是"很多学生"）；
//  2. 建议必须落成可执行动作：做什么 / 谁来做 / 什么时候 / 怎么衡量效果；
//  3. 不点名（涉及具体学生时只说人数与编号规则），不用"差生"这类词。
//
// 这里所有数字都来自传入的统计结果，不新增任何事实。

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Target, CalendarCheck } from 'lucide-react';

interface AdviseInput {
  className: string;
  /** 参与统计的有效人数（已排除请假/缺勤） */
  validCount: number;
  /** 班级平均正确率（%） */
  avgCorrectRate: number;
  /** 题型维度：名称 + 平均正确率，按正确率升序 */
  weakTypes: { name: string; correctRate: number; count: number }[];
  /** 低分段人数（后 27%） */
  lowCount: number;
  /** 高分段人数（前 27%） */
  highCount: number;
  /** 及格率、优秀率（%） */
  passRate: number;
  excellentRate: number;
}

export function TeachingAdvice({ data }: { data: AdviseInput }) {
  const { className, validCount, avgCorrectRate, weakTypes, lowCount, highCount, passRate, excellentRate } = data;
  const worst = weakTypes[0];
  const second = weakTypes[1];

  return (
    <div className="report-section">
      <h2 className="report-section-title">
        <Lightbulb className="w-5 h-5 inline mr-2" />
        教学建议（3-2-1）
        <span className="text-xs font-normal text-[color:var(--ink-4)] ml-2">
          依据本班 {validCount} 人的正确率分布与题型得分率生成
        </span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 分段画像：先给事实，再给判断 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-[color:var(--brand)]" />分段画像
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2.5 text-[color:var(--ink-2)]">
            <p>
              <span className="font-semibold">高分段（前 27%，{highCount} 人）：</span>
              班均 {avgCorrectRate}%，优秀率 {excellentRate}%。
              {excellentRate >= 40 ? '拔尖面够宽，重点转向"会而不对"的细节扣分。' : '拔尖人数偏少，需要给前段学生加一组压轴训练。'}
            </p>
            <p>
              <span className="font-semibold">低分段（后 27%，{lowCount} 人）：</span>
              及格率 {passRate}%。
              {lowCount > 0 ? `这 ${lowCount} 人是本阶段重点帮扶对象，建议按题型的得分率排优先级补基础。` : '本次无低分段学生，保持当前节奏即可。'}
            </p>
            {worst && (
              <p>
                <span className="font-semibold">失分集中处：</span>
                {worst.name}（得分率 {worst.correctRate}%）
                {second ? `、${second.name}（${second.correctRate}%）` : ''}
                {worst.correctRate < 60 ? '——均低于 60%，属需要重讲的内容。' : '——已过半，重点是稳定性而非重讲。'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 3-2-1：每条都带负责人、时间点与衡量方式 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[color:var(--brand)]" />下一步动作
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-xs font-semibold text-[color:var(--ink-3)] mb-1.5">立即行动（一周内）</p>
            <ol className="list-decimal ml-5 space-y-1 text-[color:var(--ink-2)]">
              <li>
                {worst ? <>重讲 <b>{worst.name}</b> 的典型错题（得分率 {worst.correctRate}%）。任课老师下次课开头 15 分钟做，用同类型题当堂检验，目标正确率回到 70%。</> : '下次课复习上一讲错题。任课老师执行，用同类题当堂检验。'}
              </li>
              <li>
                把低于班均（{avgCorrectRate}%）的学生名单交给任课老师，做一次错题归因，让每人写出"错在哪一步"。
              </li>
              <li>
                下次课开场 5 分钟做一组针对 <b>{worst ? worst.name : '最低得分题型'}</b> 的小练，当堂批改。
              </li>
            </ol>
            <p className="text-xs font-semibold text-[color:var(--ink-3)] mt-3 mb-1.5">中期调整（本月内）</p>
            <ol className="list-decimal ml-5 space-y-1 text-[color:var(--ink-2)]">
              <li>分层辅导：低分段 {lowCount} 人单独加练基础题，两周后看该题型得分率是否提升 10 个百分点。</li>
              <li>{second ? <>对 <b>{second.name}</b> 做两组变式训练。</> : '对低得分题型做变式训练。'}教研组统一出题，任课老师执行。</li>
            </ol>
            <p className="text-xs font-semibold text-[color:var(--ink-3)] mt-3 mb-1.5">长期机制（本学期）</p>
            <ol className="list-decimal ml-5 space-y-1 text-[color:var(--ink-2)]">
              <li>建立班级错题档案，双周做一次质量监测，用正确率而不是分数看走势（{className}）。</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

