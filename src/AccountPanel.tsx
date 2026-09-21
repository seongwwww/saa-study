import { useState } from 'react';
import { Cloud, LogOut, RefreshCw, Laptop } from 'lucide-react';
import { useAuth } from './Auth';
import { cloud } from './cloud';
import { loadState } from './store';
import { freshState, validateBackup, type Question, type StudyState } from './model';
import { mergeStudy, type SyncStatus } from './sync';

export function AccountPanel({state,questions,status,onImport,onNotice,onSync}:{state:StudyState;questions:Question[];status:SyncStatus;onImport:(state:StudyState)=>void;onNotice:(s:string)=>void;onSync:()=>Promise<void>}){
  const {user}=useAuth();const [busy,setBusy]=useState(false);
  if(!user)return null;
  async function importLocal(){
    try {const legacy=validateBackup({app:'saa-study',state:await loadState(state.bankId)},questions,state.bankId);
      if(!legacy.attempts.length&&!legacy.sessions.length&&!Object.keys(legacy.progress).length&&!legacy.studyDraft&&!legacy.studyOrder&&!legacy.studyIndex){onNotice('이 브라우저에 옮길 기존 학습 기록이 없습니다.');return;}
      onImport(mergeStudy({...freshState(),bankId:state.bankId},legacy,state));
    }catch{onNotice('기존 브라우저 기록을 불러오지 못했습니다. 원래 기록은 변경되지 않았습니다.');}
  }
  return <section className="panel account-panel"><div><div className="section-eyebrow">YOUR SYNCED STUDY SPACE</div><h2><Cloud size={20}/> 계정 및 동기화</h2><p className="account-email">{user.email}</p><p className="muted">같은 계정으로 로그인하면 풀이·메모·북마크·진행 위치를 이어갑니다. 두 기기에서 같은 메모를 동시에 수정하면 두 내용을 함께 보관합니다.</p></div><div className="backup-actions"><button className="button secondary" disabled={busy||status==='saving'} onClick={async()=>{setBusy(true);try{await onSync();}finally{setBusy(false);}}}><RefreshCw size={16}/>지금 동기화</button><button className="button secondary" disabled={busy} onClick={importLocal}><Laptop size={16}/>기존 브라우저 기록 가져오기</button><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await onSync();const {error}=await cloud!.auth.signOut({scope:'local'});if(error)throw error;}catch{onNotice('로그아웃하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}}}><LogOut size={16}/>로그아웃</button></div><p className="microcopy">처음 한 번 ‘기존 브라우저 기록 가져오기’를 누르면 이 주소에서 쌓은 기존 기록을 계정에 합칩니다. 연결이 끊기면 기록을 이 기기에 보관하고 다시 연결할 때 전송합니다.</p></section>;
}
