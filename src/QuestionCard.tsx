import { Bookmark, Check, CheckCircle2, ExternalLink, Eye, EyeOff, Flag, XCircle } from 'lucide-react';
import type { Progress, Question } from './model';
import { isCorrect } from './model';
export function QuestionCard({ question: q, selected, revealed, onSelect, onReveal, onHide, locked = false, progress, onProgress, fontSize, resultOnly = false }: {
  question: Question; selected: string[]; revealed: boolean; onSelect: (key: string) => void;
  onReveal?: () => void; onHide?: () => void; locked?: boolean; progress: Progress; onProgress: (patch: Partial<Progress>) => void; fontSize: number; resultOnly?: boolean;
}) {
  const correct = isCorrect(selected, q.answer);
  return <article className="question-card" style={{ '--question-font': `${fontSize}px` } as React.CSSProperties}>
    <div className="question-heading"><div className="question-label">QUESTION <strong>{String(q.number).padStart(3,'0')}</strong><span className="tag">{q.answer.length > 1 ? `${q.answer.length}개 선택` : '단일 선택'}</span></div>
      <button className={`icon-button ${progress.bookmark ? 'bookmarked' : ''}`} aria-label={progress.bookmark ? '북마크 해제' : '북마크 추가'} title={progress.bookmark ? '북마크 해제' : '북마크 추가'} onClick={() => onProgress({bookmark: !progress.bookmark})}><Bookmark size={20} fill={progress.bookmark ? 'currentColor' : 'none'}/></button></div>
    <div className="question-prompt"><RichText text={q.prompt}/></div>
    <div className="choices" role="group" aria-label={`문제 ${q.number} 보기`}>
      {q.choices.map(c => {
        const chosen = selected.includes(c.key), right = revealed && q.answer.includes(c.key), wrong = revealed && chosen && !right;
        return <label key={c.key} className={`choice ${chosen ? 'selected' : ''} ${right ? 'correct' : ''} ${wrong ? 'incorrect' : ''} ${revealed ? 'locked' : ''}`}>
          <input type={q.answer.length > 1 ? 'checkbox' : 'radio'} name={`answer-${q.id}`} checked={chosen} disabled={revealed || locked} onChange={() => onSelect(c.key)} aria-label={`${c.key}. ${c.text.replace(/\[\[image:[^\]]+\]\]/g,'이미지 보기')}`}/>
          <span className="choice-letter">{c.key}</span><span className="choice-text"><RichText text={c.text}/></span>
          {right ? <span className="choice-status"><Check size={15}/>정답</span> : wrong ? <span className="choice-status">내 선택</span> : chosen ? <Check size={18} className="choice-check"/> : null}
        </label>;
      })}
    </div>
    <div className="question-actions"><button className={`text-button ${progress.unsure ? 'flagged' : ''}`} aria-pressed={!!progress.unsure} onClick={() => onProgress({unsure: !progress.unsure})}><Flag size={16} fill={progress.unsure ? 'currentColor' : 'none'}/>{progress.unsure ? '헷갈리는 문제로 표시됨' : '헷갈려요 · 다시 보기'}</button>
      {q.pageStart > 0 && <a className="source-link" href={`./source.pdf#page=${q.pageStart}`} target="_blank" rel="noreferrer" title="원본 PDF 비밀번호를 입력해 열 수 있습니다">원문 {q.pageStart}p <ExternalLink size={13}/></a>}</div>
    {q.sourceNumber !== q.number && <p className="source-note">원문 표기 Q{q.sourceNumber} · 학습 번호는 문서 순서대로 부여했습니다.</p>}
    {onReveal && !revealed && <button className="reveal-button" onClick={onReveal}><Eye size={18}/>{locked ? '정답·해설 다시 펼치기' : selected.length ? '채점하고 정답·해설 보기' : '정답·해설 펼치기'}</button>}
    {!revealed && !onReveal && <div className="hidden-answer"><EyeOff size={15}/>정답과 해설은 세트를 제출한 뒤 공개됩니다.</div>}
    {revealed && <section className="answer-panel" aria-label="정답 및 해설">
      <div className={`answer-summary ${selected.length ? correct ? 'good' : 'bad' : ''}`}>{selected.length ? correct ? <CheckCircle2 size={22}/> : <XCircle size={22}/> : <Eye size={22}/>}<div><strong>{selected.length ? correct ? '정확해요. 잘 풀었어요!' : '다시 만나면 맞힐 수 있어요.' : resultOnly ? '건너뛴 문제입니다.' : '정답을 확인했어요.'}</strong><p>정답 <b>{q.answer.join(', ')}</b>{selected.length ? ` · 내 선택 ${selected.join(', ')}` : ' · 풀이 점수에는 기록하지 않습니다.'}</p></div></div>
      <div className="explanation"><div className="section-eyebrow">해설 · 문제집 기준 채점</div>{q.explanation.length ? q.explanation.map((p,i) => <div className="explanation-paragraph" key={i}><RichText text={p}/></div>) : <p className="muted">이 문제에는 별도 해설이 없습니다. 원문과 참고 자료를 확인해 주세요.</p>}
        {!!q.links.length && <div className="reference-links">{q.links.map((url,i) => <a key={i} href={url} target="_blank" rel="noreferrer">참고 자료 {i+1} <ExternalLink size={13}/></a>)}</div>}
      </div>
      <label className="note-label" htmlFor={`note-${q.id}`}>나의 한 줄 정리 <span>자동 저장</span></label><textarea id={`note-${q.id}`} maxLength={20000} value={progress.note || ''} onChange={e => onProgress({note:e.target.value})} placeholder="놓쳤던 조건이나 기억할 개념을 적어보세요." rows={3}/>
      {onHide && <button className="reveal-button" onClick={onHide}><EyeOff size={16}/>정답·해설 접기</button>}
    </section>}
  </article>;
}
function linkify(text: string) { return text.split(/(https?:\/\/[^\s]+)/g).map((p,i) => /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p); }
function RichText({text}:{text:string}) { return <>{text.split(/(\[\[image:[^\]]+\]\])/g).map((part,i) => { const match=part.match(/^\[\[image:(.+)\]\]$/); return match ? <img key={i} className="pdf-image" src={`./${match[1]}`} alt="원문에 포함된 코드 또는 도표" loading="lazy"/> : <span key={i}>{linkify(part)}</span>; })}</>; }
