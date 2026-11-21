import type { ReactNode } from 'react';
import { essayRubric, essayTotals, essayWordCount, type EssayReview, type EssayRubric } from '@/lib/essayReview';

function CardSection({ title, tone, children }: { title: string; tone?: string; children: ReactNode }) {
  return <section className="essay-card-section" data-tone={tone}><h4>{title}</h4>{children}</section>;
}

function CardList({ items }: { items: string[] }) {
  return <ul>{items.filter(item => item.trim()).map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

export function EssayFeedbackCard({ review, rubric, student, className, wide }: {
  review: EssayReview; rubric: EssayRubric; student: string; className: string; wide?: boolean;
}) {
  const { earned, gradedMax, full } = essayTotals(review, rubric);
  return (
    <article className="essay-feedback-card" data-wide={wide ? 'true' : undefined}>
      <header className="essay-card-header">
        <div>
          <p>{[className, student].filter(Boolean).join(' · ') || '英语写作'}</p>
          <h3>英语作文评价小结</h3>
          {review.topic && <div className="essay-card-topic">{review.topic}</div>}
        </div>
        <div className="essay-score-sticker">
          <span>{gradedMax === full ? '参考得分' : '已评分项'}</span>
          <strong>{gradedMax > 0 ? earned : '—'} <small>{gradedMax > 0 ? `/ ${gradedMax}` : ''}</small></strong>
          {gradedMax !== full && <span>卷面满分 {full} · 部分维度待评</span>}
        </div>
      </header>
      <div className="essay-card-grid">
        <div>
          {review.overall && <CardSection title="总体评价"><p>{review.overall}</p></CardSection>}
          <CardSection title="分项得分">
            <dl>{essayRubric.map(({ key, label }) => (
              <div key={key}><dt>{label}</dt><dd>{review.scores[key].score ?? '待评'} / {rubric[key]}</dd></div>
            ))}</dl>
          </CardSection>
          {review.strengths.some(Boolean) && <CardSection title="亮点" tone="mint"><CardList items={review.strengths} /></CardSection>}
          {review.issues.some(Boolean) && <CardSection title="主要问题" tone="coral"><CardList items={review.issues} /></CardSection>}
        </div>
        <div>
          <CardSection title="重点句子修改" tone="peach">
            {review.corrections.length === 0 && <p>本次未列重点订正句。</p>}
            {review.corrections.map((item, index) => (
              <div className="essay-card-correction" key={index}>
                <span data-kind={item.kind}>{item.kind}</span>
                <p lang="en">{item.original}</p>
                <p lang="en"><b>→ {item.revision}</b></p>
                {item.reason && <p>{item.reason}</p>}
              </div>
            ))}
          </CardSection>
        </div>
        <div>
          {review.coverage.length > 0 && (
            <CardSection title="审题完成情况" tone="lilac">
              <ul>{review.coverage.map((item, index) => (
                <li key={index}><strong>{item.status}</strong> · {item.requirement}{item.evidence && <div>{item.evidence}</div>}</li>
              ))}</ul>
            </CardSection>
          )}
          {review.suggestions.some(Boolean) && <CardSection title="下一步怎么练" tone="mint"><CardList items={review.suggestions} /></CardSection>}
          {review.encouragement && <CardSection title="送给你的一句话" tone="peach"><p>{review.encouragement}</p></CardSection>}
        </div>
      </div>
      <footer>原文约 {essayWordCount(review.original)} 词 · 教师已复核</footer>
    </article>
  );
}
