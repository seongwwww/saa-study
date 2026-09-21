import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { BookOpen, Cloud, LockKeyhole } from 'lucide-react';
import { cloud } from './cloud';

const AuthContext=createContext<{user:User|null}>({user:null});
const emailDelivery=import.meta.env.VITE_AUTH_EMAIL_DELIVERY==='true';
export const useAuth=()=>useContext(AuthContext);
export function AuthGate({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(!cloud),[recovery,setRecovery]=useState(false);
  useEffect(()=>{
    if(!cloud)return;
    let live=true;
    const {data}=cloud.auth.onAuthStateChange((event,session)=>{if(!live)return;setUser(session?.user||null);setReady(true);if(event==='PASSWORD_RECOVERY')setRecovery(true);});
    cloud.auth.getSession().then(({data})=>{if(live){setUser(data.session?.user||null);setReady(true);}}).catch(()=>{if(live)setReady(true);});
    return()=>{live=false;data.subscription.unsubscribe();};
  },[]);
  if(!ready)return <div className="loading"><Cloud size={36}/><h2>로그인 확인 중…</h2></div>;
  if(cloud&&(!user||recovery))return <Login recovery={recovery} onRecovered={()=>setRecovery(false)}/>;
  return <AuthContext.Provider value={{user}}><div key={user?.id||'local'}>{children}</div></AuthContext.Provider>;
}
function Login({recovery,onRecovered}:{recovery:boolean;onRecovered:()=>void}) {
  const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const redirectTo=location.origin+location.pathname;
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try {
      if(recovery){const {error}=await cloud!.auth.updateUser({password});if(error)throw error;setPassword('');onRecovered();return;}
      if(mode==='reset'){const {error}=await cloud!.auth.resetPasswordForEmail(email.trim(),{redirectTo});if(error)throw error;setMessage('등록된 계정이면 비밀번호 재설정 메일이 발송됩니다. 메일함을 확인해 주세요.');}
      else if(mode==='signup'){const {data,error}=await cloud!.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirectTo}});if(error)throw error;if(!data.session)setMessage('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.');}
      else {const {error}=await cloud!.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;}
      setPassword('');
    }catch(err){const code=(err as {code?:string}).code;setError(code==='invalid_credentials'?'이메일 또는 비밀번호를 확인해 주세요.':code==='email_not_confirmed'?'가입 확인 메일의 링크를 먼저 눌러 주세요.':code==='over_email_send_rate_limit'?'메일 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.':'요청을 완료하지 못했습니다. 입력 내용과 인터넷 연결을 확인해 주세요.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card"><span className="brand-icon"><BookOpen size={25}/></span><div className="section-eyebrow">SAA STUDY</div><h1>{recovery?'새 비밀번호 설정':mode==='signup'?'나의 공부방 만들기':mode==='reset'?'비밀번호 재설정':'공부하던 곳에서, 이어서.'}</h1><p className="muted">PC에서도 휴대폰에서도 같은 계정으로.<br/>풀이 기록과 필기를 자동으로 이어갑니다.</p><form onSubmit={submit}>
    {!recovery&&<label>이메일<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>}
    {(recovery||mode!=='reset')&&<label>비밀번호<input type="password" autoComplete={recovery||mode==='signup'?'new-password':'current-password'} minLength={recovery||mode==='signup'?8:1} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={recovery||mode==='signup'?'8자 이상':'비밀번호 입력'}/></label>}
    {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-message" role="status">{message}</p>}
    <button className="button primary full-width" disabled={busy}>{busy?'처리 중…':recovery?'비밀번호 저장':mode==='signup'?'회원가입':mode==='reset'?'재설정 메일 받기':'로그인'}</button>
    </form>{!recovery&&<div className="auth-links"><button className="text-button" disabled={busy} onClick={()=>{setMode(mode==='signup'?'login':'signup');setError('');setMessage('');}}>{mode==='signup'?'이미 계정이 있어요 · 로그인':'처음 오셨나요? 회원가입'}</button>{emailDelivery?<button className="text-button" disabled={busy} onClick={()=>{setMode(mode==='reset'?'login':'reset');setError('');setMessage('');}}>{mode==='reset'?'로그인으로 돌아가기':'비밀번호를 잊었어요'}</button>:<p className="microcopy">이메일은 로그인 ID로 사용해요. 비밀번호를 잊었다면 관리자에게 문의해 주세요.</p>}</div>}<p className="auth-foot"><LockKeyhole size={14}/> 학습 기록은 본인 계정에서만 볼 수 있어요.</p></section></main>;
}
