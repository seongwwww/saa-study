import { freshState, type Question, type StudyState, type Session, validateBackup } from './model.ts';

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const choose = <T>(base: T, local: T, remote: T): T => same(base, local) ? remote : local;

// A three-way merge preserves edits made on different devices without relying on
// client clocks. Conflicting notes keep both texts instead of silently losing one.
export function mergeStudy(base: StudyState, local: StudyState, remote: StudyState): StudyState {
  const progress: StudyState['progress'] = {};
  for (const id of new Set([...Object.keys(base.progress), ...Object.keys(local.progress), ...Object.keys(remote.progress)])) {
    const b = base.progress[id], l = local.progress[id], r = remote.progress[id];
    if (same(b,l)) { if(r) progress[id]=r; continue; }
    if (!l) { if(r && !same(b,r)) progress[id]=r; continue; }
    if (!r) { progress[id]=l; continue; }
    const p = { ...r };
    for (const field of ['bookmark','unsure','note','studiedAt','domain'] as const) {
      const value = choose(b?.[field], l[field], r[field]);
      Object.assign(p, { [field]: value });
    }
    if (l.note && r.note && !same(b?.note,l.note) && !same(b?.note,r.note) && l.note!==r.note) {
      p.note = `${r.note}\n\n[다른 기기에서 작성한 메모]\n${l.note}`;
      if(p.note.length>20000) throw Error('두 기기의 메모가 길어 자동으로 합칠 수 없습니다. 백업을 보관한 뒤 메모를 정리해 주세요.');
    }
    progress[id]=p;
  }
  const mergeRecords = <T extends {id:string}>(b:T[], l:T[], r:T[], resolve:(base:T|undefined,local:T,remote:T)=>T) => {
    const bm=new Map(b.map(x=>[x.id,x])), lm=new Map(l.map(x=>[x.id,x])), rm=new Map(r.map(x=>[x.id,x]));
    return [...new Set([...bm.keys(),...lm.keys(),...rm.keys()])].flatMap(id=>{
      const bv=bm.get(id),lv=lm.get(id),rv=rm.get(id);
      if(same(bv,lv))return rv?[rv]:[];
      if(!lv)return rv&&!same(bv,rv)?[rv]:[];
      if(!rv)return [lv];
      return [resolve(bv,lv,rv)];
    });
  };
  const sessions=mergeRecords(base.sessions,local.sessions,remote.sessions,(b,l,r):Session=>{
    if(r.submittedAt)return r;
    if(l.submittedAt)return l;
    const answers={...r.answers};
    for(const id of new Set([...Object.keys(b?.answers||{}),...Object.keys(l.answers)])) {
      if(!same(b?.answers[id],l.answers[id])) {if(l.answers[id])answers[id]=l.answers[id];else delete answers[id];}
    }
    return {...r,answers,position:choose(b?.position,l.position,r.position)!};
  }).sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.id.localeCompare(b.id));
  const sessionMap=new Map(sessions.map(s=>[s.id,s]));
  const attempts=mergeRecords(base.attempts,local.attempts,remote.attempts,(_b,l,r)=>{
    const s=sessionMap.get(l.sessionId);
    return s && same(s.answers[l.qid],l.selected) && !same(s.answers[r.qid],r.selected)?l:r;
  }).filter(a=>{
    const session=sessionMap.get(a.sessionId);
    return !session?.submittedAt || same(session.answers[a.qid],a.selected);
  }).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  const cursor=(s:StudyState)=>({studyIndex:s.studyIndex,studyOrder:s.studyOrder,studyDraft:s.studyDraft});
  const active=choose(base.activeSessionId,local.activeSessionId,remote.activeSessionId);
  return {...remote,progress,sessions,attempts,...choose(cursor(base),cursor(local),cursor(remote)),
    fontSize:choose(base.fontSize,local.fontSize,remote.fontSize),
    activeSessionId:sessions.some(s=>s.id===active&&!s.submittedAt)?active:null};
}

export type SyncRecord={value:StudyState;base:StudyState|null;revision:number};
export type RemoteRecord={state:StudyState;revision:number};
export type SyncStatus='loading'|'saving'|'synced'|'offline'|'error';
export interface SyncAdapter {
  read(revision:number):Promise<RemoteRecord|null|'unchanged'>;
  write(state:StudyState,revision:number):Promise<RemoteRecord|null>;
  persist(record:SyncRecord):Promise<void>;
}
export class StudySync {
  record:SyncRecord;
  private running:Promise<void>|null=null;
  private disk=Promise.resolve();
  private stopped=false;
  private adapter:SyncAdapter;
  private questions:Question[];
  private bankId:string;
  private notify:(state:StudyState,status:SyncStatus,error?:string)=>void;
  constructor(adapter:SyncAdapter,questions:Question[],bankId:string,record:SyncRecord|null,
    notify:(state:StudyState,status:SyncStatus,error?:string)=>void) {
    this.adapter=adapter;this.questions=questions;this.bankId=bankId;this.notify=notify;
    this.record=record||{value:{...freshState(),bankId},base:null,revision:0};
  }
  private check(state:StudyState){return validateBackup({app:'saa-study',state},this.questions,this.bankId);}
  private emit(status:SyncStatus,error?:string){if(!this.stopped)this.notify(this.record.value,status,error);}
  private persist(){const snapshot=structuredClone(this.record);this.disk=this.disk.catch(()=>{}).then(()=>this.adapter.persist(snapshot));return this.disk;}
  update(value:StudyState){this.record={...this.record,value:this.check(value)};this.emit('saving');void this.persist().catch(()=>this.emit('error','이 기기에 기록을 저장하지 못했습니다. 백업을 내려받아 주세요.'));}
  stop(){this.stopped=true;}
  sync():Promise<void>{
    if(this.running)return this.running;
    this.running=this.run().finally(()=>{this.running=null;});return this.running;
  }
  private async run(){
    try {
      for(let retry=0;retry<5&&!this.stopped;retry++){
        const remote=await this.adapter.read(this.record.revision);
        if(this.stopped)return;
        const base=this.record.base||{...freshState(),bankId:this.bankId};
        const fetched=remote==='unchanged'?{state:base,revision:this.record.revision}:remote;
        if(fetched)this.check(fetched.state);
        const sent=this.record.value;
        const merged=fetched?this.check(mergeStudy(base,sent,fetched.state)):sent;
        if(fetched && same(merged,fetched.state)) {
          this.record={value:merged,base:fetched.state,revision:fetched.revision};
          await this.persist();if(same(this.record.value,this.record.base)){this.emit('synced');return;}continue;
        }
        this.emit('saving');
        const saved=await this.adapter.write(merged,fetched?.revision||0);
        if(this.stopped)return;
        if(!saved)continue; // Another device won the compare-and-swap; fetch and merge again.
        const current=this.record.value;
        this.record={value:this.check(mergeStudy(sent,current,saved.state)),base:saved.state,revision:saved.revision};
        await this.persist();
        if(same(this.record.value,saved.state)){this.emit('synced');return;}
      }
      if(!this.stopped)this.emit('error','다른 기기에서도 기록을 저장 중입니다. 잠시 뒤 다시 동기화해 주세요.');
    }catch(error){this.emit('offline',error instanceof Error?error.message:'동기화하지 못했습니다. 이 기기에 보관하고 다시 시도합니다.');}
  }
}
