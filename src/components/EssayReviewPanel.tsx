import { useEffect, useId, useRef, useState } from 'react';
import { Check, Download, PencilLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { copyToClipboard } from '@/lib/feedbackTemplates';
import { blankEssayReview, buildEssayReviewPrompt, defaultEssayRubric, essayRubric, parseEssayReview, type EssayReview } from '@/lib/essayReview';
import { isEssayModelAvailable, requestEssayReview } from '@/lib/essayReviewApi';
import { EssayFeedbackCard } from './essay/EssayFeedbackCard';
import { EssayReviewEditor } from './essay/EssayReviewEditor';
import './essay/essayReview.css';

type Photo = { name: string; dataUrl: string };

async function preparePhoto(file: File): Promise<Photo> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 图片');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理图片');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.80) };
  } finally {
    bitmap.close();
  }
}

function PhotoInput({ label, photos, onChange, limit, disabled, onBusy, onError }: {
  label: string; photos: Photo[]; onChange: (photos: Photo[]) => void; limit: number;
  disabled: boolean; onBusy: (busy: boolean) => void; onError: (message: string) => void;
}) {
  return (
    <div className="essay-photos">
      <label className="essay-field">{label}
        <Input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= limit}
          onChange={async event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (!files.length) return;
            if (files.length + photos.length > limit) {
              onError(`${label}最多可添加 ${limit} 张`);
              return;
            }
            onBusy(true);
            onError('');
            try {
              const added = await Promise.all(files.map(preparePhoto));
              onChange([...photos, ...added]);
            } catch (error) {
              onError(error instanceof Error ? error.message : '无法读取图片');
            } finally {
              onBusy(false);
            }
          }} />
      </label>
      {photos.length > 0 && (
        <ul>{photos.map((photo, index) => (
          <li key={index}>
            <a href={photo.dataUrl} download={photo.name.replace(/\.[^.]+$/, '') + '.jpg'} title="下载处理后的图片">
              <img src={photo.dataUrl} alt={`${label}第 ${index + 1} 张`} />
            </a>
            <span>{index + 1}. {photo.name}</span>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(photos.filter((_, i) => i !== index))}
              aria-label={`移除${label}第 ${index + 1} 张`}>移除</Button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

export default function EssayReviewPanel({ className, students }: { className: string; students: string[] }) {
  const materialsId = useId();
  const reviewId = useId();
  const [student, setStudent] = useState('');
  const [topic, setTopic] = useState('');
  const [promptText, setPromptText] = useState('');
  const [original, setOriginal] = useState('');
  const [criteria, setCriteria] = useState('');
  const [rubric, setRubric] = useState(defaultEssayRubric);
  const [promptPhotos, setPromptPhotos] = useState<Photo[]>([]);
  const [essayPhotos, setEssayPhotos] = useState<Photo[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [review, setReview] = useState<EssayReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const printArea = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const check = new AbortController();
    void isEssayModelAvailable(check.signal).then(setModelReady).catch(() => {});
    return () => {
      check.abort();
      activeRequest.current?.abort();
    };
  }, []);

  const selectedStudent = students.includes(student) ? student : '';
  const full = essayRubric.reduce((sum, { key }) => sum + rubric[key], 0);
  const ready = full > 0 && Boolean(promptText.trim() || promptPhotos.length) && Boolean(original.trim() || essayPhotos.length);
  const locked = photoBusy || working || exporting;
  const prompt = () => buildEssayReviewPrompt({
    topic: topic.trim(), promptText: promptText.trim(), original: original.trim(), rubric, criteria: criteria.trim(),
    promptImages: promptPhotos.length, essayImages: essayPhotos.length,
  });

  function clearStatus() {
    setError('');
    setMessage('');
  }

  function setDraft(next: EssayReview) {
    setReview(next);
    setConfirmed(false);
  }

  function prepareReview(raw: string) {
    if (full <= 0) throw new Error('请先设置大于 0 的作文满分');
    const draft = parseEssayReview(raw, rubric);
    setDraft({
      ...draft,
      topic: topic.trim() || draft.topic,
      promptText: promptText.trim() || draft.promptText,
      original: original.trim() || draft.original,
    });
  }

  async function grade() {
    clearStatus();
    const controller = new AbortController();
    activeRequest.current = controller;
    setWorking(true);
    try {
      const raw = await requestEssayReview(prompt(), [...promptPhotos, ...essayPhotos].map(photo => photo.dataUrl), controller.signal);
      if (!controller.signal.aborted) prepareReview(raw);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : '批改超时，请稍后重试');
    } finally {
      activeRequest.current = null;
      setWorking(false);
    }
  }

  function confirmReview() {
    if (!review) return;
    clearStatus();
    try {
      const verified = parseEssayReview(JSON.stringify(review), rubric);
      if (!verified.original || !verified.topic || !verified.overall) {
        throw new Error('请核对并填写作文主题、学生原文和总体评价');
      }
      const plain = (text: string) => text.replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
      if (verified.corrections.some(item => !item.original || !item.revision || !plain(verified.original).includes(plain(item.original)))) {
        throw new Error('请核对每条订正的原句是否确实出现在学生原文中，并填写建议改法');
      }
      if (verified.coverage.some(item => !item.requirement)) throw new Error('请填写每条审题要点的题目要求');
      setReview(verified);
      setConfirmed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请检查批改草稿');
    }
  }

  async function exportCard() {
    if (!printArea.current || !confirmed) return;
    clearStatus();
    setExporting(true);
    try {
      const target = printArea.current;
      const html2canvas = (await import('html2canvas')).default;
      await document.fonts.ready;
      const scale = Math.min(2, 8192 / target.offsetHeight, Math.sqrt(8_000_000 / (target.offsetWidth * target.offsetHeight)));
      const canvas = await html2canvas(target, { scale, backgroundColor: '#fff6db', logging: false });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('无法生成 PNG')), 'image/png',
      ));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = [...[className, selectedStudent].filter(Boolean), '作文评价.png'].join('_').replace(/[\\/:*?"<>|]/g, '_');
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('评价卡已生成');
    } catch {
      setError('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }

  const status = error
    ? <p role="alert" className="essay-status" data-error="true">{error}</p>
    : message && <p role="status" className="essay-status">{message}</p>;

  return (
    <div className="essay-workspace">
      <header className="essay-workspace-header">
        <span className="essay-workspace-icon"><PencilLine aria-hidden="true" size={22} /></span>
        <div><h2>作文批改</h2><p>初中英语写作 · 单篇批改与评价卡</p></div>
      </header>
      <section className="essay-workspace-section space-y-4" aria-labelledby={materialsId}>
        <h3 id={materialsId}>作文材料</h3>
        <label className="essay-field">学员（可选）
          <select className="essay-student-select" value={selectedStudent} disabled={locked} onChange={event => setStudent(event.target.value)}>
            <option value="">匿名评价卡</option>
            {students.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {review ? (
          <details>
            <summary>查看原始材料</summary>
            {promptText && <p className="mt-2 whitespace-pre-wrap">{promptText}</p>}
            {original && <p className="mt-2 whitespace-pre-wrap" lang="en">{original}</p>}
            <div className="essay-source-images">{[...promptPhotos, ...essayPhotos].map((photo, index) => (
              <img key={index} src={photo.dataUrl} alt={photo.name} />
            ))}</div>
          </details>
        ) : (
          <fieldset disabled={locked} className="space-y-4">
            <label className="essay-field">作文主题（可选）
              <Input maxLength={180} value={topic} onChange={event => setTopic(event.target.value)} placeholder="如 My Favourite Season" />
            </label>
            <div className="essay-form-grid">
              <div className="space-y-3">
                <label className="essay-field">题目要求
                  <Textarea rows={5} maxLength={12000} value={promptText} onChange={event => setPromptText(event.target.value)}
                    placeholder="输入题目和写作要求，或上传题目图片" />
                </label>
                <PhotoInput label="题目图片" photos={promptPhotos} onChange={setPromptPhotos} limit={2} disabled={locked} onBusy={setPhotoBusy} onError={setError} />
              </div>
              <div className="space-y-3">
                <label className="essay-field">作文原文
                  <Textarea rows={5} maxLength={12000} value={original} onChange={event => setOriginal(event.target.value)}
                    placeholder="粘贴学生原文，或依次上传手写作文图片" />
                </label>
                <PhotoInput label="作文图片" photos={essayPhotos} onChange={setEssayPhotos} limit={4} disabled={locked} onBusy={setPhotoBusy} onError={setError} />
              </div>
            </div>
            <details>
              <summary>评分标准 · 满分 {full} 分</summary>
              <div className="essay-rubric-fields">
                {essayRubric.map(({ key, label }) => (
                  <label key={key} className="essay-field">{label}
                    <Input type="number" min={0} max={100} step={1} value={rubric[key]} onChange={event => {
                      const max = Math.min(100, Math.max(0, Math.floor(event.target.valueAsNumber || 0)));
                      setRubric({ ...rubric, [key]: max });
                    }} />
                  </label>
                ))}
              </div>
              <label className="essay-field">补充评分细则
                <Textarea value={criteria} maxLength={4000} onChange={event => setCriteria(event.target.value)} placeholder="例如按学校要求计分，给定的开头不计入字数" />
              </label>
            </details>
            <div className="flex flex-wrap gap-2">
              {modelReady && (
                <Button disabled={!ready || locked} onClick={() => void grade()}><Sparkles size={16} />{working ? '批改中…' : '交给 OpenAI 批改'}</Button>
              )}
              <Button variant={modelReady ? 'outline' : 'default'} disabled={!ready || locked} onClick={async () => {
                clearStatus();
                if (await copyToClipboard(prompt())) {
                  setMessage(promptPhotos.length || essayPhotos.length ? '任务已复制。请按题目图、作文图的顺序随任务附上图片。' : '任务已复制。将 AI 返回的 JSON 粘贴到下方。');
                } else {
                  setError('复制失败，请检查剪贴板权限');
                }
              }}>复制 AI 批改任务</Button>
              <Button variant="outline" disabled={full <= 0 || locked} onClick={() => {
                clearStatus();
                setDraft({ ...blankEssayReview, topic: topic.trim(), original: original.trim(), promptText: promptText.trim() });
              }}>手动填写评价</Button>
            </div>
            <p className="essay-help">{modelReady
              ? '点击在线批改会将题目、原文及选中的图片发送给 OpenAI。请先遮盖图片中的姓名等个人信息。'
              : '可把批改任务与去除个人信息的图片交给 ChatGPT，再将返回结果粘贴到这里。'}</p>
            <details open={modelReady ? undefined : true}>
              <summary>导入 AI 批改结果</summary>
              <label className="essay-field mt-3">批改 JSON
                <Textarea rows={4} value={manualJson} maxLength={100000} disabled={locked} onChange={event => setManualJson(event.target.value)} placeholder="粘贴 AI 返回的完整 JSON" />
              </label>
              <Button className="mt-2" variant="outline" disabled={!manualJson.trim() || locked} onClick={() => {
                clearStatus();
                try { prepareReview(manualJson); }
                catch (cause) { setError(cause instanceof Error ? cause.message : '无法导入批改结果'); }
              }}>导入并复核</Button>
            </details>
            {status}
          </fieldset>
        )}
      </section>
      {review && (
        <section className="essay-workspace-section space-y-4" aria-labelledby={reviewId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={reviewId}>{confirmed ? '评价卡预览' : '教师复核'}</h3>
            <Button variant="outline" size="sm" disabled={locked} onClick={() => {
              clearStatus();
              if (confirmed) {
                setConfirmed(false);
              } else {
                setTopic(review.topic);
                setOriginal(review.original);
                setPromptText(review.promptText);
                setManualJson('');
                setReview(null);
              }
            }}>{confirmed ? '继续修改' : '用校对稿返回材料'}</Button>
          </div>
          {confirmed ? (
            <>
              <EssayFeedbackCard review={review} rubric={rubric} student={selectedStudent} className={className} />
              <div className="essay-export-stage" aria-hidden="true">
                <div ref={printArea}><EssayFeedbackCard review={review} rubric={rubric} student={selectedStudent} className={className} wide /></div>
              </div>
              <Button disabled={locked} onClick={() => void exportCard()}><Download size={16} />{exporting ? '正在导出…' : '下载 PNG'}</Button>
              <Button className="ml-2" variant="outline" disabled={locked} onClick={() => {
                clearStatus();
                setReview(null);
                setConfirmed(false);
                setStudent('');
                setTopic(review.topic);
                setPromptText(review.promptText);
                setOriginal('');
                setEssayPhotos([]);
                setManualJson('');
              }}>批改下一篇</Button>
            </>
          ) : (
            <>
              <p className="essay-help">核对识别原文、给分依据和订正类型，确认后生成评价卡。</p>
              <EssayReviewEditor review={review} rubric={rubric} onChange={setDraft} />
              <Button onClick={confirmReview}><Check size={16} />确认并预览评价卡</Button>
            </>
          )}
          {status}
        </section>
      )}
    </div>
  );
}
