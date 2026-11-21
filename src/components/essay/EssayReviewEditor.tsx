import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { correctionKinds, coverageStatuses, essayRubric, essayTotals, essayWordCount, type EssayReview, type EssayRubric } from '@/lib/essayReview';

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export function EssayReviewEditor({ review, rubric, onChange }: {
  review: EssayReview;
  rubric: EssayRubric;
  onChange: (next: EssayReview) => void;
}) {
  function update<K extends keyof EssayReview>(field: K, value: EssayReview[K]) {
    onChange({ ...review, [field]: value });
  }

  const { earned, gradedMax, full } = essayTotals(review, rubric);
  return (
    <div className="space-y-5">
      <label className="essay-field">作文主题<Input maxLength={180} value={review.topic} onChange={event => update('topic', event.target.value)} /></label>
      <div className="essay-form-grid">
        <label className="essay-field">识别的题目
          <Textarea rows={5} value={review.promptText} onChange={event => update('promptText', event.target.value)} />
        </label>
        <label className="essay-field">学生原文 · 约 {essayWordCount(review.original)} 词
          <Textarea rows={5} value={review.original} onChange={event => update('original', event.target.value)} />
        </label>
      </div>
      <label className="essay-field">识别疑点
        <Textarea value={review.transcriptionNote} onChange={event => update('transcriptionNote', event.target.value)} />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">
          参考评分 · {gradedMax > 0 ? `${earned} / ${gradedMax}` : '待评'}{gradedMax !== full ? `（满分 ${full}，含待评维度）` : ''}
        </legend>
        {essayRubric.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-end gap-2">
            <label className="essay-field">{label} / {rubric[key]}
              <Input type="number" placeholder="待评" min={0} max={rubric[key]} step="any" value={review.scores[key].score ?? ''}
                onChange={event => {
                  const number = event.target.valueAsNumber;
                  const score = Number.isFinite(number) ? Math.min(rubric[key], Math.max(0, number)) : null;
                  update('scores', { ...review.scores, [key]: { ...review.scores[key], score } });
                }} />
            </label>
            <Input aria-label={`${label}给分依据`} placeholder="给分依据" value={review.scores[key].reason}
              onChange={event => update('scores', { ...review.scores, [key]: { ...review.scores[key], reason: event.target.value } })} />
          </div>
        ))}
      </fieldset>
      <label className="essay-field">总体评价
        <Textarea value={review.overall} onChange={event => update('overall', event.target.value)} />
      </label>
      <div className="essay-form-grid">
        {([{ key: 'strengths', label: '亮点' }, { key: 'issues', label: '主要问题' }, { key: 'suggestions', label: '提升建议' }] as const)
          .map(({ key, label }) => (
            <label key={key} className="essay-field">{label}（每行一条）
              <Textarea value={review[key].join('\n')} onChange={event => update(key, event.target.value.split('\n'))} />
            </label>
          ))}
        <label className="essay-field">鼓励语
          <Textarea value={review.encouragement} onChange={event => update('encouragement', event.target.value)} />
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">重点句子修改</legend>
        {review.corrections.map((item, index) => {
          const change = (patch: Partial<typeof item>) => update('corrections', review.corrections.map((x, i) => i === index ? { ...x, ...patch } : x));
          return (
            <div className="essay-editor-row" key={index}>
              <div className="flex items-center gap-2">
                <select aria-label={`第 ${index + 1} 条修改的类型`} className={selectClass} value={item.kind}
                  onChange={event => change({ kind: event.target.value === '必须订正' ? '必须订正' : '表达优化' })}>
                  {correctionKinds.map(kind => <option key={kind}>{kind}</option>)}
                </select>
                <Button size="sm" variant="ghost" onClick={() => update('corrections', review.corrections.filter((_, i) => i !== index))}>移除</Button>
              </div>
              <div className="essay-form-grid">
                <Textarea aria-label={`第 ${index + 1} 条学生原句`} placeholder="学生原句" value={item.original} onChange={event => change({ original: event.target.value })} />
                <Textarea aria-label={`第 ${index + 1} 条建议改法`} placeholder="建议改法" value={item.revision} onChange={event => change({ revision: event.target.value })} />
              </div>
              <Input aria-label={`第 ${index + 1} 条修改说明`} placeholder="简短中文说明" value={item.reason} onChange={event => change({ reason: event.target.value })} />
            </div>
          );
        })}
        <Button size="sm" variant="outline" disabled={review.corrections.length >= 20}
          onClick={() => update('corrections', [...review.corrections, { kind: '必须订正', original: '', revision: '', reason: '' }])}>添加修改</Button>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">审题要点</legend>
        {review.coverage.map((item, index) => {
          const change = (patch: Partial<typeof item>) => update('coverage', review.coverage.map((x, i) => i === index ? { ...x, ...patch } : x));
          return (
            <div className="essay-editor-row" key={index}>
              <div className="flex items-center gap-2">
                <select aria-label={`第 ${index + 1} 项审题状态`} className={selectClass} value={item.status}
                  onChange={event => change({ status: coverageStatuses.find(status => status === event.target.value) ?? '待核对' })}>
                  {coverageStatuses.map(status => <option key={status}>{status}</option>)}
                </select>
                <Button size="sm" variant="ghost" onClick={() => update('coverage', review.coverage.filter((_, i) => i !== index))}>移除</Button>
              </div>
              <Input aria-label={`第 ${index + 1} 项题目要求`} placeholder="题目要求" value={item.requirement} onChange={event => change({ requirement: event.target.value })} />
              <Input aria-label={`第 ${index + 1} 项作文依据`} placeholder="作文中的依据或缺失说明" value={item.evidence} onChange={event => change({ evidence: event.target.value })} />
            </div>
          );
        })}
        <Button size="sm" variant="outline" disabled={review.coverage.length >= 20}
          onClick={() => update('coverage', [...review.coverage, { requirement: '', status: '待核对', evidence: '' }])}>添加要点</Button>
      </fieldset>
    </div>
  );
}
