import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { freshState, validateBackup, type Question, type StudyState } from './model';
import { loadState, saveState, loadSyncRecord } from './store';
import { StudySync, type SyncStatus } from './sync';
import { cloudAdapter } from './cloud';

export function useStudyStorage(questions:Question[],bankId:string,userId?:string) {
  const [state,render]=useState<StudyState>(freshState),[ready,setReady]=useState(false);
  const [status,setStatus]=useState<SyncStatus>('loading'),[error,setError]=useState('');
  const engine=useRef<StudySync|null>(null),current=useRef(state),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const localWrites=useRef(Promise.resolve());
  useEffect(()=>{
    if(!questions.length)return;
    let live=true;
    const publish=(s:StudyState,status:SyncStatus,error='')=>{if(live){current.current=s;render(s);setStatus(status);setError(error);}};
    const validate=(s:StudyState)=>validateBackup({app:'saa-study',state:s},questions,bankId);
    (async()=>{
      if(!userId){const s=validate(await loadState(bankId));publish({...s,bankId},'synced');}
      else {
        const record=await loadSyncRecord(bankId,userId);
        if(!live)return;
        if(record){validate(record.value);if(record.base)validate(record.base);}
        const sync=new StudySync(cloudAdapter(userId,bankId),questions,bankId,record,publish);
        engine.current=sync;
        publish(sync.record.value,'loading');await sync.sync();
      }
      if(live)setReady(true);
    })().catch(()=>{if(live)setError('저장된 기록을 불러오지 못했습니다. 새로고침하거나 백업을 확인해 주세요.');});
    const sync=()=>{if(document.visibilityState==='visible')void engine.current?.sync();};
    const interval=setInterval(sync,30000);
    window.addEventListener('focus',sync);window.addEventListener('online',sync);document.addEventListener('visibilitychange',sync);
    return()=>{live=false;engine.current?.stop();engine.current=null;clearTimeout(timer.current);clearInterval(interval);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',sync);};
  },[questions,bankId,userId]);
  const setState=useCallback((action:SetStateAction<StudyState>)=>{
    const next=typeof action==='function'?action(current.current):action;
    if(next===current.current)return;
    current.current=next;render(next);
    if(engine.current){engine.current.update(next);clearTimeout(timer.current);timer.current=setTimeout(()=>void engine.current?.sync(),900);}
    else {setStatus('saving');localWrites.current=localWrites.current.catch(()=>{}).then(()=>saveState(next,bankId)).then(()=>{if(current.current===next){setStatus('synced');setError('');}}).catch(()=>{setStatus('error');setError('기록을 저장하지 못했습니다. 백업을 내려받아 주세요.');});}
  },[bankId]);
  const syncNow=async()=>{clearTimeout(timer.current);await engine.current?.sync();};
  return {state,setState,ready,status,error,syncNow};
}
