import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Cloud, Home, RotateCcw, Bookmark, History, Settings, CheckCircle2, ClipboardList, ArrowRight, Type, X, AlertCircle } from 'lucide-react';
import { QuestionCard } from './QuestionCard';
import { Dashboard, SessionSetup, Collection, Results, HistoryView, SettingsView, PageHeading } from './views';
import { freshState, getStatus, isCorrect, shuffled, submitSession, validateBackup, type Question, type StudyState, type Progress, type Session } from './model';
import { loadState, saveState } from './store';
import { loadQuestionBank } from './bank';
type View = 'home' | 'study' | 'setup' | 'quiz' | 'review' | 'bookmarks' | 'history' | 'settings' | 'results';
const navigation = [ ['home',Home,'학습 홈'], ['study',BookOpen,'공부하기'], ['setup',ClipboardList,'문제 풀기'], ['review',RotateCcw,'오답노트'], ['bookmarks',Bookmark,'북마크'], ['history',History,'학습 기록'] ] as const;
export default function App() {
  const [questions,setQuestions] = useState<Question[]>([]), [state,setState] = useState<StudyState>(freshState);
  const [bankId,setBankId] = useState('local');
  const [ready,setReady] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const [view,setView] = useState<View>('home'), [resultId,setResultId] = useState<string|null>(null);
  const [notice,setNotice] = useState(''), [confirm,setConfirm] = useState<{title:string;body:string;label:string;action:()=>void}|null>(null);
  const [gridPage,setGridPage] = useState(0), [jump,setJump] = useState('1');
  const saveSequence = useRef(0), stateRef = useRef(state), questionsRef = useRef(questions);
  stateRef.current=state; questionsRef.current=questions;
  useEffect(() => { loadQuestionBank().then(async data => { const key=data.id||'local';const s=await loadState(key);const validated=validateBackup({app:'saa-study',state:s},data.questions,key);setBankId(key);setQuestions(data.questions);setState({...validated,bankId:key});setGridPage(Math.floor(validated.studyIndex/50));setReady(true); }).catch(()=>setError('자료나 저장된 기록을 불러오지 못했습니다. 새로고침하거나 다른 브라우저에서 열어주세요.')); },[]);
  useEffect(() => { if(!ready)return; const seq=++saveSequence.current;setSaving(true);saveState(state,bankId).then(()=>{if(seq===saveSequence.current){setSaving(false);setError('');}}).catch(()=>{setError('기록을 저장하지 못했습니다. 설정에서 백업 파일을 먼저 내려받아 주세요.');setSaving(false);}); },[state,ready,bankId]);
  useEffect(() => { if(!notice)return;const id=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(id); },[notice]);
  useEffect(() => {setJump(String(state.studyIndex+1));},[state.studyIndex]);
  const stats=useMemo(()=>{
    const status=new Map(questions.map(q=>[q.id,getStatus(q.id,state)]));
    return {status,done:new Set(state.attempts.map(a=>a.qid)).size,correct:state.attempts.filter(a=>a.correct).length,review:questions.filter(q=>status.get(q.id)?.needsReview),studied:questions.filter(q=>state.progress[q.id]?.studiedAt).length};
  },[questions,state]);
  const active=state.sessions.find(s=>s.id===state.activeSessionId&&!s.submittedAt);
  function navigate(next:View) {setView(next);window.scrollTo({top:0,behavior:'instant'});}
  function openStudy(index:number) {setState(s=>({...s,studyIndex:index,studyDraft:index===s.studyIndex?s.studyDraft:undefined}));setGridPage(Math.floor(index/50));navigate('study');}
  function progress(qid:string,patch:Partial<Progress>) {setState(s=>({...s,progress:{...s.progress,[qid]:{...s.progress[qid],...patch}}}));}
  function toggleAnswer(q:Question,selected:string[],key:string) {return q.answer.length>1 ? selected.includes(key)?selected.filter(k=>k!==key):[...selected,key].sort():[key];}
  function reveal() {
    const q=questions[state.studyIndex];
    setState(s=>{
      const draft=s.studyDraft?.qid===q.id?s.studyDraft:{qid:q.id,selected:[],revealed:false,graded:false};
      const at=new Date().toISOString(),id=crypto.randomUUID();
      return {...s,studyDraft:{...draft,revealed:true,graded:true},progress:{...s.progress,[q.id]:{...s.progress[q.id],studiedAt:at}},attempts:draft.graded||!draft.selected.length?s.attempts:[...s.attempts,{id,qid:q.id,selected:draft.selected,correct:isCorrect(draft.selected,q.answer),at,mode:'study',sessionId:id}]};
    });
  }
  function startSession(ids:string[],mode:'quiz'|'review') {
    if(!ids.length){setNotice('선택한 조건에 해당하는 문제가 없습니다.');return;}
    const begin=()=>{const session:Session={id:crypto.randomUUID(),mode,ids,answers:{},position:0,startedAt:new Date().toISOString()};setState(s=>({...s,sessions:[...s.sessions,session],activeSessionId:session.id}));navigate('quiz');};
    if(active) setConfirm({title:'새 세트를 시작할까요?',body:'진행 중인 세트는 학습 기록에 보관됩니다. 나중에 다시 이어서 풀 수 있어요.',label:'새 세트 시작',action:begin});else begin();
  }
  function completeSession() {
    if(!active)return;
    const unanswered=active.ids.filter(id=>!active.answers[id]?.length).length;
    setConfirm({title:'제출하고 결과를 확인할까요?',body:unanswered?`${unanswered}문제가 미응답입니다. 건너뛴 문제로 표시되며 오답노트에는 자동으로 추가되지 않습니다.`:'채점 후에는 선택한 답을 변경할 수 없습니다.',label:'제출하고 채점',action:()=>{setState(s=>submitSession(s,active.id,questions));setResultId(active.id);navigate('results');}});
  }
  const apiRef=useRef({openStudy});apiRef.current={openStudy};
  useEffect(()=>{
    if(!ready)return;
    const context=(document as Document & {modelContext?: {registerTool:(tool:unknown,options:unknown)=>unknown}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try {
      Promise.resolve(context.registerTool({name:'get_study_progress',description:'Read local AWS study progress without exposing question answers.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({total:questionsRef.current.length,attempts:stateRef.current.attempts.length,answered:new Set(stateRef.current.attempts.map(a=>a.qid)).size,review:questionsRef.current.filter(q=>getStatus(q.id,stateRef.current).needsReview).length})},{signal:lifecycle.signal})).catch(()=>{});
      Promise.resolve(context.registerTool({name:'open_study_question',description:'Navigate to a numbered question in study mode. Does not submit an answer.',inputSchema:{type:'object',properties:{number:{type:'integer',minimum:1,maximum:questions.length}},required:['number'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:{number:number})=>{if(!Number.isInteger(input?.number)||input.number<1||input.number>questionsRef.current.length)throw Error('Invalid question number');apiRef.current.openStudy(input.number-1);await new Promise(r=>requestAnimationFrame(r));return{opened:input.number};}},{signal:lifecycle.signal})).catch(()=>{});
    } catch { /* Optional browser capability. */ }
    return()=>lifecycle.abort();
  },[ready,questions.length]);
  if(!ready)return <div className="loading"><BookOpen size={36}/><h2>{error || '나의 공부방을 열고 있어요.'}</h2>{error&&<button className="button secondary" onClick={()=>location.reload()}>다시 불러오기</button>}</div>;
  const currentLabel=view==='settings'?'설정 및 백업':view==='results'?'풀이 결과':view==='quiz'?'문제 풀기':navigation.find(x=>x[0]===view)?.[2];
  const q=questions[state.studyIndex],draft=state.studyDraft?.qid===q.id?state.studyDraft:undefined;
  const fontControls=<div className="font-controls"><Type size={15}/><button aria-label="글자 작게" disabled={state.fontSize<=16} onClick={()=>setState(s=>({...s,fontSize:s.fontSize-1}))}>−</button><span>{state.fontSize}</span><button aria-label="글자 크게" disabled={state.fontSize>=22} onClick={()=>setState(s=>({...s,fontSize:s.fontSize+1}))}>+</button></div>;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-icon"><BookOpen size={21}/></span><div>SAA <span>Study</span><small>나의 AWS 공부방</small></div></div><div className="nav-caption">WORKSPACE</div><nav aria-label="주 메뉴">{navigation.map(([key,Icon,label])=><button key={key} className={view===key||key==='setup'&&['quiz','results'].includes(view)?'active':''} onClick={()=>navigate(key)}><Icon size={18}/>{label}{key==='review'&&stats.review.length>0&&<span className="nav-count">{stats.review.length}</span>}</button>)}<button className={`settings-nav ${view==='settings'?'active':''}`} onClick={()=>navigate('settings')}><Settings size={18}/>설정 및 백업</button></nav><div className="sidebar-bottom"><Cloud size={18}/><span>나의 속도로, 한 문제씩.<small>AWS SAA-C03 · {questions.length} questions</small></span></div></aside>
    <div className="workspace"><header className="topbar"><span>내 학습 공간 <span className="breadcrumb">/ {currentLabel}</span></span><span className={`local-status ${error?'save-error':''}`}><CheckCircle2 size={14}/>{error?'저장 상태 확인 필요':saving?'저장 중…':'이 기기에 자동 저장'}</span></header><main>
    {error&&<div className="error-banner" role="alert"><AlertCircle size={18}/>{error}</div>}
    {bankId==='demo-v1'&&<div className="resume-banner"><span>체험용 문제로 실행 중입니다. 내 PDF를 추가하면 개인 문제집으로 공부할 수 있어요.</span><a href="https://github.com/seongwwww/saa-study#내-pdf-가져오기" target="_blank" rel="noreferrer">가져오는 방법</a></div>}
    {view==='home'&&<Dashboard questions={questions} state={state} reviewCount={stats.review.length} done={stats.done} studied={stats.studied} correct={stats.correct} active={active} onStudy={()=>openStudy(state.studyIndex)} onSetup={()=>navigate('setup')} onResume={()=>navigate('quiz')} onReview={()=>navigate('review')} onStart={()=>startSession(shuffled(questions.filter(x=>!stats.status.get(x.id)?.attempts.length)).slice(0,20).map(x=>x.id),'quiz')}/>}
    {view==='study'&&<><PageHeading eyebrow="LEARN AT YOUR PACE" title="한 문제씩, 확실하게." description="먼저 생각하고, 정답과 해설을 확인해 보세요." action={fontControls}/><div className="study-layout"><div><div className="study-toolbar"><span>전체 문제 <b>{q.number} / {questions.length}</b></span><form className="jump-form" onSubmit={e=>{e.preventDefault();const n=Number(jump);if(Number.isInteger(n)&&n>=1&&n<=questions.length)openStudy(n-1);else setNotice(`1~${questions.length} 사이 번호를 입력해 주세요.`);}}><label htmlFor="jump">문제 이동</label><input id="jump" type="number" min={1} max={questions.length} value={jump} onChange={e=>setJump(e.target.value)}/><button type="submit" aria-label="입력한 문제로 이동"><ArrowRight size={15}/></button></form></div>
      <QuestionCard question={q} selected={draft?.selected||[]} revealed={draft?.revealed||false} locked={draft?.graded} onSelect={key=>setState(s=>({...s,studyDraft:{qid:q.id,selected:toggleAnswer(q,s.studyDraft?.qid===q.id?s.studyDraft.selected:[],key),revealed:false,graded:false}}))} onReveal={reveal} onHide={()=>setState(s=>({...s,studyDraft:s.studyDraft?{...s.studyDraft,revealed:false}:undefined}))} progress={state.progress[q.id]||{}} onProgress={patch=>progress(q.id,patch)} fontSize={state.fontSize}/>
      <div className="bottom-navigation"><button className="button secondary" disabled={!state.studyIndex} onClick={()=>openStudy(state.studyIndex-1)}><ChevronLeft size={16}/>이전 문제</button>{draft?.graded&&<button className="text-button" onClick={()=>{setState(s=>({...s,studyDraft:undefined}));window.scrollTo(0,0);}}><RotateCcw size={14}/>다시 풀기</button>}<button className="button primary" disabled={state.studyIndex===questions.length-1} onClick={()=>openStudy(state.studyIndex+1)}>다음 문제<ChevronRight size={16}/></button></div></div>
      <aside className="study-rail"><div className="panel"><div className="section-eyebrow">QUESTION NAVIGATOR</div><div className="panel-title"><h3>문제 둘러보기</h3><select aria-label="문제 번호 범위" value={gridPage} onChange={e=>setGridPage(Number(e.target.value))}>{Array.from({length:Math.ceil(questions.length/50)},(_,i)=><option key={i} value={i}>{i*50+1}–{Math.min((i+1)*50,questions.length)}</option>)}</select></div><div className="question-grid">{questions.slice(gridPage*50,(gridPage+1)*50).map(x=>{const status=stats.status.get(x.id);return <button key={x.id} aria-label={`${x.number}번 문제`} aria-current={q.id===x.id?'true':undefined} className={`${q.id===x.id?'current':''} ${status?.needsReview?'wrong':status?.latest?.correct?'done':''}`} onClick={()=>openStudy(x.number-1)}>{x.number}</button>;})}</div><div className="grid-legend"><span>□ 미풀이</span><span className="green-text">□ 최근 정답</span><span className="red-text">□ 복습 필요</span></div></div><div className="rail-tip"><BookOpen size={19}/><div><strong>정답보다 중요한 건, 이유.</strong><p>헷갈린 문제는 표시해 두세요.<br/>오답노트에서 다시 만날 수 있어요.</p></div></div></aside></div></>}
    {view==='setup'&&<SessionSetup questions={questions} state={state} active={active} onStart={startSession} onResume={()=>navigate('quiz')}/>}
    {view==='quiz'&&(active?<><PageHeading eyebrow={active.mode==='review'?'RECALL & REVIEW':'FOCUS SESSION'} title={active.mode==='review'?'다시 풀며, 내 것으로.':'지금은 문제에만 집중해요.'} description="선택한 답은 자동 저장됩니다. 정답은 세트 제출 후 공개됩니다." action={fontControls}/><div className="study-layout"><div><div className="study-toolbar"><span>{active.mode==='review'?'오답 복습':'문제풀이'} <b>{active.position+1} / {active.ids.length}</b></span><button className="text-button" onClick={()=>navigate('home')}>저장하고 나가기</button></div>{(()=>{const current=questions.find(x=>x.id===active.ids[active.position])!;return <QuestionCard question={current} selected={active.answers[current.id]||[]} revealed={false} onSelect={key=>setState(s=>({...s,sessions:s.sessions.map(session=>session.id===active.id?{...session,answers:{...session.answers,[current.id]:toggleAnswer(current,session.answers[current.id]||[],key)}}:session)}))} progress={state.progress[current.id]||{}} onProgress={patch=>progress(current.id,patch)} fontSize={state.fontSize}/>;})()}<div className="bottom-navigation"><button className="button secondary" disabled={!active.position} onClick={()=>{setState(s=>({...s,sessions:s.sessions.map(x=>x.id===active.id?{...x,position:x.position-1}:x)}));window.scrollTo(0,0);}}><ChevronLeft size={16}/>이전</button>{active.position<active.ids.length-1?<button className="button primary" onClick={()=>{setState(s=>({...s,sessions:s.sessions.map(x=>x.id===active.id?{...x,position:x.position+1}:x)}));window.scrollTo(0,0);}}>다음 문제<ChevronRight size={16}/></button>:<button className="button primary" onClick={completeSession}>제출하고 결과 보기<CheckCircle2 size={16}/></button>}</div></div><aside className="study-rail"><div className="panel"><div className="section-eyebrow">SESSION PROGRESS</div><h3>{active.ids.filter(id=>active.answers[id]?.length).length} <span className="muted">/ {active.ids.length}문제 응답</span></h3><div className="progress-track"><span style={{width:`${active.ids.filter(id=>active.answers[id]?.length).length/active.ids.length*100}%`}}/></div><div className="question-grid">{active.ids.map((id,i)=><button key={id} aria-label={`세트 ${i+1}번째 문제`} className={`${i===active.position?'current':''} ${active.answers[id]?.length?'answered':''}`} onClick={()=>{setState(s=>({...s,sessions:s.sessions.map(x=>x.id===active.id?{...x,position:i}:x)}));window.scrollTo(0,0);}}>{i+1}</button>)}</div><button className="button primary full-width" onClick={completeSession}>제출하고 결과 보기</button><p className="microcopy">비어 있는 번호는 아직 답을 고르지 않은 문제입니다.</p></div></aside></div></>:<div className="empty-state"><ClipboardList size={32}/><h2>진행 중인 세트가 없어요.</h2><button className="button primary" onClick={()=>navigate('setup')}>새 세트 만들기</button></div>)}
    {(view==='review'||view==='bookmarks')&&<Collection key={view} kind={view} questions={questions} state={state} onStudy={openStudy} onStart={ids=>startSession(ids,'review')} onProgress={progress}/>}
    {view==='results'&&<Results key={resultId} session={state.sessions.find(s=>s.id===resultId)} questions={questions} state={state} onProgress={progress} onRetry={ids=>startSession(ids,'review')} onHome={()=>navigate('home')}/>}
    {view==='history'&&<HistoryView state={state} questions={questions} onResults={id=>{setResultId(id);navigate('results');}} onResume={id=>{setState(s=>({...s,activeSessionId:id}));navigate('quiz');}} onStudy={openStudy}/>}
    {view==='settings'&&<SettingsView state={state} questions={questions} onFont={size=>setState(s=>({...s,fontSize:size}))} onImport={s=>setConfirm({title:'백업 기록으로 복원할까요?',body:`현재 기록을 백업 파일의 기록으로 교체합니다. 풀이 ${s.attempts.length}회, 세트 ${s.sessions.length}개가 들어 있습니다. 현재 기록을 보관하려면 취소 후 먼저 백업해 주세요.`,label:'백업으로 복원',action:()=>{setState(s);setNotice('학습 기록을 복원했습니다.');}})} onNotice={setNotice}/>}
    </main></div>{notice&&<div className="toast" role="status"><CheckCircle2 size={18}/>{notice}<button aria-label="알림 닫기" onClick={()=>setNotice('')}><X size={15}/></button></div>}{confirm&&<ConfirmDialog {...confirm} onClose={()=>setConfirm(null)} onConfirm={()=>{const action=confirm.action;setConfirm(null);action();}}/>}</div>;
}
function ConfirmDialog({title,body,label,onClose,onConfirm}:{title:string;body:string;label:string;onClose:()=>void;onConfirm:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog className="confirm-dialog" ref={ref} onCancel={onClose} aria-labelledby="confirm-title"><h2 id="confirm-title">{title}</h2><p>{body}</p><div className="dialog-actions"><button className="button secondary" onClick={onClose} autoFocus>취소</button><button className="button primary" onClick={onConfirm}>{label}</button></div></dialog>;
}
