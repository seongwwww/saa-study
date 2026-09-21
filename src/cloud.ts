import { createClient } from '@supabase/supabase-js';
import type { SyncAdapter, RemoteRecord } from './sync';
import { saveSyncRecord } from './store';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured=Boolean(url&&key);
export const cloud=cloudConfigured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(15000)})}}):null;

export function cloudAdapter(userId:string,bankId:string):SyncAdapter {
  const db=()=>cloud!.from('study_records');
  const fail=(error:{code?:string;message:string})=>{
    if(error.code==='42P01'||error.code==='PGRST205')throw Error('클라우드 DB 초기 설정이 필요합니다. 관리자에게 문의해 주세요.');
    if(error.code==='42501')throw Error('계정의 저장 권한을 확인할 수 없습니다. 다시 로그인해 주세요.');
    throw Error('클라우드에 연결하지 못했습니다. 기록은 이 기기에 보관하며 다시 연결하면 동기화합니다.');
  };
  return {
    async read(revision){
      const version=await db().select('revision').eq('user_id',userId).eq('bank_id',bankId).maybeSingle();
      if(version.error)fail(version.error);
      if(!version.data)return null;
      if(version.data.revision===revision)return 'unchanged';
      const row=await db().select('state,revision').eq('user_id',userId).eq('bank_id',bankId).maybeSingle();
      if(row.error)fail(row.error);return row.data as RemoteRecord|null;
    },
    async write(state,revision){
      const result=revision===0?
        await db().insert({user_id:userId,bank_id:bankId,state,revision:1}).select('state,revision').single():
        await db().update({state,revision:revision+1}).eq('user_id',userId).eq('bank_id',bankId).eq('revision',revision).select('state,revision').maybeSingle();
      if(result.error){if(result.error.code==='23505')return null;fail(result.error);}
      return result.data as RemoteRecord|null;
    },
    persist:record=>saveSyncRecord(bankId,userId,record),
  };
}
