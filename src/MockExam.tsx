import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, GraduationCap, Search } from 'lucide-react';
import { classifyQuestion, DOMAINS, EXAM_GUIDE, examAllocation, examPools } from './domains';
import { isCorrect, type Domain, type Progress, type Question, type Session, type StudyState } from './model';
import { PageHeading } from './views';

export function DomainPicker({question,progress,onProgress}:{question:Question;progress:Progress;onProgress:(p:Partial<Progress>)=>void}) {
  const classification=classifyQuestion(question,progress.domain);
  return <div className="domain-picker"><label htmlFor={`domain-${question.id}`}>학습 영역 <span>{classification.source==='manual'?'직접 지정':classification.source==='bank'?'문제집 지정':classification.uncertain?'자동 추정 · 검토 권장':'자동 추정'}</span></label>
    <select id={`domain-${question.id}`} aria-label={`문제 ${question.number} 학습 영역`} value={progress.domain || ''} onChange={e=>onProgress({domain:(e.target.value || undefined) as Domain|undefined})}>
      <option value="">기본 분류 · {DOMAINS.find(d=>d.id===classifyQuestion(question).domain)!.name}</option>
      {DOMAINS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
    </select><p>{classification.reason}</p></div>;
}

export function MockExamSetup({questions,state,active,onStart,onResume,onProgress,onStudy}:{questions:Question[];state:StudyState;active?:Session;onStart:(count:number)=>void;onResume:()=>void;onProgress:(id:string,p:Partial<Progress>)=>void;onStudy:(index:number)=>void}) {
  const [count,setCount]=useState(65),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0);
  const pools=useMemo(()=>examPools(questions,state),[questions,state.progress]);
  const allocation=examAllocation(count);
  const classifications=useMemo(()=>questions.map(q=>({q,...classifyQuestion(q,state.progress[q.id]?.domain)})),[questions,state.progress]);
  const missing=pools.filter(p=>p.questions.length<allocation[p.id]);
  const filtered=classifications.filter(c=>(filter==='all'||filter==='uncertain'&&c.uncertain||filter===c.domain)&&(!query||`${c.q.number} ${c.q.prompt}`.toLowerCase().includes(query.toLowerCase())));
  const lastPage=Math.max(0,Math.ceil(filtered.length/10)-1),currentPage=Math.min(page,lastPage);
  return <><PageHeading eyebrow="SAA-C03 PRACTICE EXAM" title="실전 비율로, 모의고사." description="영역별 비율에 맞춰 무작위 출제하고, 제출 후 한 번에 채점해요." action={<span className="pill"><GraduationCap size={16}/>SAA-C03</span>}/>
    {active?.mode==='mock'&&<div className="resume-banner"><span>진행 중인 {active.ids.length}문제 모의고사가 있어요. 제한 시간은 계속 흐릅니다.</span><button className="text-button" onClick={onResume}>이어서 풀기<ArrowRight size={15}/></button></div>}
    <div className="mock-layout"><section className="panel mock-blueprint"><div className="panel-title"><h2>공식 출제 영역</h2><a href={EXAM_GUIDE} target="_blank" rel="noreferrer">AWS 시험 가이드 ↗</a></div>
      <p className="microcopy">채점 대상 문항의 공식 비중 · 2026.09.21 확인</p>
      <div className="domain-distribution" aria-label="보안 30%, 복원력 26%, 고성능 24%, 비용 최적화 20%">{DOMAINS.map(d=><span key={d.id} className={`domain-${d.id}`} style={{width:`${d.weight}%`}}>{d.weight}%</span>)}</div>
      <div className="domain-rows">{pools.map((d,i)=><div className="domain-row" key={d.id}><span className={`domain-dot domain-${d.id}`}>{i+1}</span><div><strong>{d.name}</strong><p>{d.description}</p><small>보유 {d.questions.length}문제</small></div><div className="domain-quota"><b>{allocation[d.id]}문제</b><span>목표 {d.weight}%</span></div></div>)}</div>
      <p className="microcopy">문항 수에 맞춰 가장 가까운 정수로 배분합니다. 65문제는 19 / 17 / 16 / 13문제로 출제됩니다.</p>
    </section><aside className="panel mock-start"><div className="section-eyebrow">YOUR NEXT CHALLENGE</div><h2>나의 모의고사</h2><label htmlFor="mock-size">문제 수</label><select id="mock-size" value={count} onChange={e=>setCount(Number(e.target.value))}><option value={65}>65문제 · 실전 길이</option><option value={50}>50문제 · 비율 정확히 맞추기</option><option value={20}>20문제 · 짧게 연습</option></select><div className="mock-time"><Clock3 size={19}/><strong>{count*2}분</strong><span>제한 시간</span></div><ul><li>한 회차 안에서 중복 없이 출제</li><li>문제 순서도 매번 무작위</li><li>정답·해설은 제출 후 공개</li><li>시간 만료 시 자동 제출</li><li>오답노트·영역별 결과 제공</li></ul>
      {missing.length>0&&<p className="mock-shortage" role="status">{missing.map(d=>`${d.name} ${allocation[d.id]-d.questions.length}개 부족`).join(' · ')}. 문제 수를 줄이거나 분류를 수정해 주세요. 부족한 영역을 다른 영역으로 대체하지 않습니다.</p>}
      <button className="button primary full-width" disabled={!!missing.length} onClick={()=>onStart(count)}>모의고사 시작<ArrowRight size={17}/></button><p className="microcopy">시작하면 다른 화면으로 이동하거나 브라우저를 닫아도 시간이 흐릅니다. 재접속 시 만료 여부를 확인합니다.</p>
    </aside></div>
    <div className="mock-disclosure"><strong>공식 비율을 적용한 개인 문제집 연습입니다.</strong><p>실제 시험은 65문제 중 50문제가 채점 대상이고 15문제는 비채점 문항입니다. 여기서는 선택한 모든 문항을 채점하며, 정답률을 AWS 환산 점수나 합격 판정으로 바꾸지 않습니다.</p><p>이 PDF에는 공식 영역 표시가 없습니다. 문항의 요구사항과 문제집 정답을 이용한 규칙 기반 자동 추정이므로 오분류가 있을 수 있습니다. 아래에서 분류를 검토·수정하면 다음 모의고사부터 반영됩니다. 여러 영역에 걸친 문제는 대표 영역 하나로 출제합니다.</p></div>
    <details className="panel classification-panel"><summary>문제 영역 검토·수정 <span>{classifications.filter(c=>c.uncertain).length}개 검토 권장 · {questions.length}문제</span></summary><div className="classification-toolbar"><label className="search-input"><Search size={16}/><input aria-label="분류할 문제 검색" placeholder="문제 번호 또는 키워드" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><select aria-label="분류 영역 필터" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">전체 영역</option><option value="uncertain">검토 권장</option>{DOMAINS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <p className="microcopy">{filtered.length}문제 · 분류를 바꿔도 이미 시작한 모의고사의 영역별 결과는 유지됩니다.</p>
      {filtered.slice(currentPage*10,(currentPage+1)*10).map(({q})=><article className="classification-row" key={q.id}><div><button className="text-button" onClick={()=>onStudy(q.number-1)}>Q{String(q.number).padStart(3,'0')} · 문제 보기<ArrowRight size={13}/></button><p>{q.prompt.slice(0,200)}{q.prompt.length>200?'…':''}</p></div><DomainPicker question={q} progress={state.progress[q.id]||{}} onProgress={p=>onProgress(q.id,p)}/></article>)}
      {!filtered.length&&<p className="microcopy">조건에 맞는 문제가 없습니다.</p>}
      {lastPage>0&&<div className="pagination"><button className="button secondary" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>이전</button><span>{currentPage+1} / {lastPage+1}</span><button className="button secondary" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>다음</button></div>}
    </details></>;
}

export function ExamClock({deadlineAt}:{deadlineAt:string}) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const seconds=Math.max(0,Math.ceil((Date.parse(deadlineAt)-now)/1000));
  return <div className={`exam-clock ${seconds<=300?'time-low':''}`} aria-label="모의고사 남은 시간"><Clock3 size={18}/><span>남은 시간</span><strong>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</strong></div>;
}

export function DomainResults({session,questions}:{session:Session;questions:Question[]}) {
  if(!session.mock)return null;
  return <section className="panel domain-results"><h2>영역별 결과</h2><p className="microcopy">출제 당시의 분류 기준 · 건너뛴 문제도 정답률의 전체 문항 수에 포함됩니다.</p><div className="domain-result-grid">{DOMAINS.map(d=>{const ids=session.ids.filter(id=>session.mock!.domains[id]===d.id);const right=ids.filter(id=>isCorrect(session.answers[id]||[],questions.find(q=>q.id===id)!.answer)).length;return <div key={d.id}><span className={`domain-label ${d.id}`}>{d.name}</span><strong>{right}<small> / {ids.length}</small></strong><div className="progress-track"><span className={`domain-${d.id}`} style={{width:`${ids.length?right/ids.length*100:0}%`}}/></div><p>{ids.length?`${Math.round(right/ids.length*100)}% 정답`:'출제 없음'}</p></div>;})}</div></section>;
}
