import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshState, submitSession, validateBackup, type Question, type StudyState } from './model.ts';
import { mergeStudy, StudySync, type RemoteRecord, type SyncRecord, type SyncAdapter } from './sync.ts';
const questions:Question[]=JSON.parse(readFileSync(new URL('./demo-bank.json',import.meta.url),'utf8')).questions;
const q1=questions[0].id,q2=questions[1].id;
const fresh=():StudyState=>({...freshState(),bankId:'demo-v1'});
test('devices merge different notes and fields, preserve conflicting note text and coherent cursor',()=>{
 const b=fresh(),l=fresh(),r=fresh();
 l.progress[q1]={note:'phone',bookmark:true};r.progress[q1]={note:'PC',unsure:true};r.progress[q2]={note:'second'};
 l.studyIndex=1;l.studyDraft={qid:q2,selected:['A'],revealed:false,graded:false};r.studyIndex=2;
 const result=mergeStudy(b,l,r);
 assert.match(result.progress[q1].note!,/PC/);assert.match(result.progress[q1].note!,/phone/);
 assert.equal(result.progress[q1].bookmark,true);assert.equal(result.progress[q1].unsure,true);assert.equal(result.progress[q2].note,'second');
 assert.equal(result.studyIndex,1);assert.equal(result.studyDraft?.qid,q2);validateBackup({app:'saa-study',state:result},questions,'demo-v1');
});
test('stale device cannot revert a submitted exam and duplicate submissions keep matching answers',()=>{
 const b=fresh();b.sessions=[{id:'exam',ids:[q1,q2],answers:{[q1]:['A']},position:0,mode:'quiz',startedAt:new Date().toISOString()}];b.activeSessionId='exam';
 const local=structuredClone(b);local.sessions[0].answers[q1]=['B'];
 const r=submitSession(b,'exam',questions),l=submitSession(local,'exam',questions);
 const result=mergeStudy(b,l,r);
 assert.equal(result.sessions[0].answers[q1][0],'A');assert.equal(result.attempts[0].selected[0],'A');assert.equal(result.activeSessionId,null);
 assert.equal(mergeStudy(b,local,r).sessions[0].submittedAt,r.sessions[0].submittedAt);
});
test('concurrent submissions with different skipped questions do not create phantom graded attempts',()=>{
 const b=fresh();b.sessions=[{id:'exam',ids:[q1,q2],answers:{},position:0,mode:'quiz',startedAt:new Date().toISOString()}];b.activeSessionId='exam';
 const l=structuredClone(b),r=structuredClone(b);l.sessions[0].answers[q1]=['A'];r.sessions[0].answers[q2]=['B'];
 const result=mergeStudy(b,submitSession(l,'exam',questions),submitSession(r,'exam',questions));
 assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].qid,q2);assert.equal(result.sessions[0].answers[q1],undefined);
});
function harness(initial:RemoteRecord|null=null){
 let remote=initial,disk:SyncRecord|null=null,online=true;
 const adapter:SyncAdapter={read:async revision=>{if(!online)throw Error('offline');return remote?.revision===revision?'unchanged':structuredClone(remote);},
 write:async(state,revision)=>{if((remote?.revision||0)!==revision)return null;remote={state:structuredClone(state),revision:revision+1};return structuredClone(remote);},
 persist:async record=>{disk=structuredClone(record);}};
 const make=(record:SyncRecord|null=null)=>new StudySync(adapter,questions,'demo-v1',record,()=>{});
 return {adapter,make,get remote(){return remote;},get disk(){return disk;},setOnline:(value:boolean)=>{online=value;}};
}
test('new login downloads existing cloud history instead of overwriting it with an empty device',async()=>{
 const state=fresh();state.progress[q1]={note:'existing'};const h=harness({state,revision:7}),s=h.make();await s.sync();
 assert.equal(s.record.value.progress[q1].note,'existing');assert.equal(h.remote?.revision,7);
});
test('offline edits survive restart and merge with another device after reconnection',async()=>{
 const h=harness(),first=h.make();await first.sync();h.setOnline(false);
 const local=structuredClone(first.record.value);local.progress[q1]={note:'offline'};first.update(local);await first.sync();
 await new Promise(r=>setTimeout(r,0));assert.equal(h.disk?.value.progress[q1].note,'offline');
 h.setOnline(true);const other=h.make();await other.sync();const otherState=structuredClone(other.record.value);otherState.progress[q2]={note:'online'};other.update(otherState);await other.sync();
 const resumed=h.make({value:local,base:first.record.base,revision:first.record.revision});await resumed.sync();
 assert.equal(h.remote?.state.progress[q1].note,'offline');assert.equal(h.remote?.state.progress[q2].note,'online');
});
test('compare-and-swap conflict retries without losing either device changes',async()=>{
 const h=harness({state:fresh(),revision:1}),s=h.make();await s.sync();
 const write=h.adapter.write;let injected=false;
 h.adapter.write=async(state,revision)=>{if(!injected){injected=true;const concurrent=fresh();concurrent.progress[q2]={note:'concurrent'};await write(concurrent,revision);return null;}return write(state,revision);};
 const next=fresh();next.progress[q1]={note:'mine'};s.update(next);await s.sync();
 assert.equal(h.remote?.state.progress[q1].note,'mine');assert.equal(h.remote?.state.progress[q2].note,'concurrent');
});
test('editing while a save is in flight keeps the latest local edit and sends it next',async()=>{
 const h=harness({state:fresh(),revision:1}),s=h.make();await s.sync();
 const write=h.adapter.write;let edited=false;
 h.adapter.write=async(state,revision)=>{if(!edited){edited=true;const later=structuredClone(s.record.value);later.progress[q1]={note:'newer'};s.update(later);}return write(state,revision);};
 const next=fresh();next.progress[q1]={note:'first'};s.update(next);await s.sync();
 assert.equal(s.record.value.progress[q1].note,'newer');assert.equal(h.remote?.state.progress[q1].note,'newer');
});
