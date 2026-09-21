import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshState, getStatus, isCorrect, submitSession, validateBackup, type Question, type StudyState } from './model.ts';
import { validateBank } from './bank.ts';
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
