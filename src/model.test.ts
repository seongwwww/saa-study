import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshState, getStatus, isCorrect, submitSession, validateBackup, type Question, type StudyState } from './model.ts';
import { validateBank } from './bank.ts';
import { buildMockExam, classifyQuestion, DOMAINS, examAllocation } from './domains.ts';
import { expireMockExams, startRandomStudy, studySequence, type Domain } from './model.ts';
const questions: Question[]=JSON.parse(readFileSync(new URL('./demo-bank.json',import.meta.url),'utf8')).questions;
test('question-bank validation rejects empty banks and missing choice content',()=>{
  assert.equal(validateBank({version:1,id:'demo-v1',title:'Demo',questions}).questions.length,3);
  assert.throws(()=>validateBank({version:1,title:'Empty',questions:[]}));
  const bad=structuredClone(questions);bad[0].choices[0].text='';
  assert.throws(()=>validateBank({version:1,title:'Bad',questions:bad}));
});
test('redistributable demo has unique IDs, valid answer sets and multiple-choice coverage',()=>{
  assert.equal(questions.length,3);assert.equal(new Set(questions.map(q=>q.id)).size,3);
  for(const q of questions){assert.ok(q.prompt);assert.ok(q.choices.length>=4);assert.ok(q.choices.every(c=>c.text));assert.equal(new Set(q.choices.map(c=>c.key)).size,q.choices.length);assert.ok(q.answer.every(key=>q.choices.some(c=>c.key===key)));}
  assert.ok(questions.some(q=>q.answer.length>1));
});
test('multiple choice grading requires exactly the full answer set in any order',()=>{
  assert.equal(isCorrect(['C','A'],['A','C']),true);assert.equal(isCorrect(['A'],['A','C']),false);assert.equal(isCorrect(['A','C','D'],['A','C']),false);assert.equal(isCorrect(['A','A'],['A']),false);assert.equal(isCorrect([],['A']),false);
});
test('submission is atomic, skips unanswered questions, and cannot double-count',()=>{
  const s=freshState();s.activeSessionId='s1';s.sessions=[{id:'s1',mode:'quiz',ids:questions.slice(0,3).map(q=>q.id),answers:{[questions[0].id]:questions[0].answer,[questions[1].id]:['A']},position:2,startedAt:'2026-09-21T00:00:00Z'}];
  const result=submitSession(s,'s1',questions,'2026-09-21T01:00:00Z');
  assert.equal(result.attempts.length,2);assert.deepEqual(result.attempts.map(a=>a.correct),[true,false]);assert.equal(result.activeSessionId,null);assert.ok(result.sessions[0].submittedAt);assert.equal(submitSession(result,'s1',questions),result);assert.equal(s.attempts.length,0);
});
test('wrong history is retained after two distinct correct sessions; unsure overrides mastery',()=>{
  const s=freshState(),qid=questions[0].id;
  const add=(correct:boolean,id:string)=>s.attempts.push({id,qid,selected:correct?['A']:['B'],correct,at:'2026-09-21T00:00:00Z',mode:'review',sessionId:id});
  add(false,'1');add(true,'2');assert.equal(getStatus(qid,s).needsReview,true);add(true,'3');assert.equal(getStatus(qid,s).needsReview,false);assert.equal(getStatus(qid,s).everWrong,true);s.progress[qid]={unsure:true};assert.equal(getStatus(qid,s).needsReview,true);
});
test('backup round trip preserves drafts, notes and in-progress sessions; rejects bad data',()=>{
  const state:StudyState=freshState();state.progress[questions[0].id]={bookmark:true,note:'메모',unsure:true};state.studyDraft={qid:questions[0].id,selected:['A'],revealed:false,graded:false};
  state.sessions=[{id:'s',mode:'quiz',ids:[questions[0].id],answers:{[questions[0].id]:['A']},position:0,startedAt:'2026-09-21T00:00:00Z'}];state.activeSessionId='s';
  const envelope=JSON.parse(JSON.stringify({app:'saa-study',state}));assert.deepEqual(validateBackup(envelope,questions),state);
  envelope.state.sessions[0].answers[questions[0].id]=['Z'];assert.throws(()=>validateBackup(envelope,questions));
  assert.throws(()=>validateBackup({app:'saa-study',state:{...freshState(),studyIndex:questions.length}},questions));
  assert.throws(()=>validateBackup({app:'saa-study',state:{...freshState(),activeSessionId:'missing'}},questions));
  assert.throws(()=>validateBackup({app:'saa-study',state:{...freshState(),bankId:'another-bank'}},questions,'demo-v1'));
});

const mockBank:Question[]=DOMAINS.flatMap((d,i)=>Array.from({length:40},(_,j)=>({...questions[0],id:`${d.id}-${j}`,number:i*40+j+1,domain:d.id})));
test('exam allocation follows official weights, exact totals and largest remainders',()=>{
  assert.deepEqual(examAllocation(50),{security:15,resilience:13,performance:12,cost:10});
  assert.deepEqual(examAllocation(65),{security:19,resilience:17,performance:16,cost:13});
  for(let total=1;total<=725;total++) {
    const allocation=examAllocation(total);assert.equal(Object.values(allocation).reduce((a,b)=>a+b),total);
    for(const d of DOMAINS) assert.ok(Math.abs(allocation[d.id]-total*d.weight/100)<1);
  }
  assert.throws(()=>examAllocation(0));assert.throws(()=>examAllocation(2.5));
});
test('mock sampling has no duplicates, exact quotas, and respects manual domains',()=>{
  const state=freshState();state.progress[mockBank[0].id]={domain:'cost'};
  for(let run=0;run<25;run++) {
    const plan=buildMockExam(mockBank,state,65);assert.equal(plan.ids.length,65);assert.equal(new Set(plan.ids).size,65);
    for(const d of DOMAINS) assert.equal(Object.values(plan.domains).filter(x=>x===d.id).length,examAllocation(65)[d.id]);
    if(plan.ids.includes(mockBank[0].id)) assert.equal(plan.domains[mockBank[0].id],'cost');
  }
  assert.throws(()=>buildMockExam(mockBank.filter(q=>q.domain!=='security'),state,65),/부족/);
  assert.throws(()=>buildMockExam(questions,freshState(),65),/부족/);
});
test('classification uses requirements, ignores distractors, and allows overrides',()=>{
  const classify=(prompt:string)=>classifyQuestion({...questions[0],domain:undefined,prompt,choices:[{key:'A',text:'solution'},{key:'B',text:'KMS WAF IAM encryption security'}]}).domain;
  assert.equal(classify('조직 내 계정 사용자로만 액세스를 제한해야 합니다.'),'security');
  assert.equal(classify('재해 복구 RTO 10분과 RPO 1분을 충족해야 합니다.'),'resilience');
  assert.equal(classify('분석 쿼리의 성능을 개선하고 대기 시간을 줄여야 합니다.'),'performance');
  assert.equal(classify('파일을 무기한 보관하는 가장 비용 효율적인 방법은 무엇입니까?'),'cost');
  assert.equal(classifyQuestion(mockBank[0],'cost').source,'manual');
  assert.equal(classifyQuestion(mockBank[0],'cost').domain,'cost');
});
test('random study covers a whole bank once and survives backup without losing notes or drafts',()=>{
  const state=freshState();state.progress[mockBank[0].id]={note:'keep',domain:'security'};
  const random=startRandomStudy(state,mockBank);assert.equal(random.studyOrder!.length,mockBank.length);assert.equal(new Set(random.studyOrder).size,mockBank.length);assert.equal(mockBank[random.studyIndex].id,random.studyOrder![0]);assert.equal(random.progress[mockBank[0].id].note,'keep');
  random.studyIndex=mockBank.findIndex(q=>q.id===random.studyOrder![12]);random.studyDraft={qid:mockBank[random.studyIndex].id,selected:['A'],revealed:false,graded:false};
  const restored=validateBackup({app:'saa-study',state:random},mockBank);assert.deepEqual(restored,random);assert.equal(studySequence(mockBank,restored).indexOf(mockBank[restored.studyIndex].id),12);
  assert.throws(()=>validateBackup({app:'saa-study',state:{...random,studyOrder:random.studyOrder!.slice(1)}},mockBank));
  assert.throws(()=>validateBackup({app:'saa-study',state:{...random,studyOrder:random.studyOrder!.map(()=>mockBank[0].id)}},mockBank));
});
test('timed exams expire even when inactive, grade once, and keep domain snapshots',()=>{
  const state=freshState(),plan=buildMockExam(mockBank,state,20),start='2026-09-21T00:00:00.000Z',deadline='2026-09-21T00:40:00.000Z';
  state.sessions=[{id:'mock',mode:'mock',...plan,position:0,answers:{[plan.ids[0]]:['A']},startedAt:start,mock:{durationMinutes:40,deadlineAt:deadline,domains:plan.domains}}];state.activeSessionId='mock';
  assert.equal(expireMockExams(state,mockBank,Date.parse(deadline)-1),state);
  const restored=validateBackup({app:'saa-study',state},mockBank);const result=expireMockExams(restored,mockBank,Date.parse(deadline)+10000);
  assert.equal(result.sessions[0].submittedAt,deadline);assert.equal(result.activeSessionId,null);assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].mode,'mock');assert.equal(expireMockExams(result,mockBank,Date.parse(deadline)+20000),result);
  assert.deepEqual(validateBackup({app:'saa-study',state:result},mockBank),result);
  state.activeSessionId=null;assert.ok(expireMockExams(state,mockBank,Date.parse(deadline)).sessions[0].submittedAt);
  const id=plan.ids[0],before=state.sessions[0].mock!.domains[id];state.progress[id]={domain:before==='cost'?'security':'cost'};assert.equal(state.sessions[0].mock!.domains[id],before);
  const bad=structuredClone(state);bad.sessions[0].mock!.domains[id]='invalid' as Domain;assert.throws(()=>validateBackup({app:'saa-study',state:bad},mockBank));
  const badDeadline=structuredClone(state);badDeadline.sessions[0].mock!.deadlineAt=start;assert.throws(()=>validateBackup({app:'saa-study',state:badDeadline},mockBank));
});
