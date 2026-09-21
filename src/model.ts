export type Domain = 'security' | 'resilience' | 'performance' | 'cost';
export type Choice = { key: string; text: string };
export type Question = { id: string; number: number; sourceNumber: number; pageStart: number; pageEnd: number; prompt: string; choices: Choice[]; answer: string[]; explanation: string[]; links: string[]; domain?: Domain };
export type Progress = { bookmark?: boolean; unsure?: boolean; note?: string; studiedAt?: string; domain?: Domain };
export type Attempt = { id: string; qid: string; selected: string[]; correct: boolean; at: string; mode: 'study' | 'quiz' | 'review' | 'mock'; sessionId: string };
export type Session = { id: string; mode: 'quiz' | 'review' | 'mock'; ids: string[]; answers: Record<string, string[]>; position: number; startedAt: string; submittedAt?: string; mock?: { durationMinutes: number; deadlineAt: string; domains: Record<string, Domain> } };
export type StudyState = { version: 1; bankId?: string; progress: Record<string, Progress>; attempts: Attempt[]; sessions: Session[]; activeSessionId: string | null; studyIndex: number; fontSize: number; studyOrder?: string[]; studyDraft?: { qid: string; selected: string[]; revealed: boolean; graded: boolean } };
export const freshState = (): StudyState => ({ version: 1, progress: {}, attempts: [], sessions: [], activeSessionId: null, studyIndex: 0, fontSize: 17 });
export function isCorrect(selected: string[], correct: string[]) {
  return selected.length > 0 && new Set(selected).size === correct.length && selected.length === correct.length && selected.every(key => correct.includes(key));
}
export function getStatus(qid: string, state: StudyState) {
  const attempts = state.attempts.filter(a => a.qid === qid);
  const everWrong = attempts.some(a => !a.correct);
  let streak = 0;
  const sessions = new Set<string>();
  for (const a of [...attempts].reverse()) {
    if (!a.correct) break;
    if (!sessions.has(a.sessionId)) { streak++; sessions.add(a.sessionId); }
  }
  return { attempts, everWrong, streak, needsReview: Boolean(state.progress[qid]?.unsure || (everWrong && streak < 2)), latest: attempts.at(-1) };
}
export function submitSession(state: StudyState, sessionId: string, questions: Question[], now = new Date().toISOString()): StudyState {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session || session.submittedAt) return state;
  const byId = new Map(questions.map(q => [q.id, q]));
  const attempts: Attempt[] = session.ids.flatMap(qid => {
    const q = byId.get(qid), selected = session.answers[qid] || [];
    if (!q || !selected.length) return [];
    return [{ id: `${session.id}:${qid}`, qid, selected: [...selected], correct: isCorrect(selected, q.answer), at: now, mode: session.mode, sessionId: session.id }];
  });
  return { ...state, attempts: [...state.attempts, ...attempts], activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId, sessions: state.sessions.map(s => s.id === sessionId ? { ...s, submittedAt: now } : s) };
}
export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function validateBackup(value: unknown, questions: Question[], bankId?: string): StudyState {
  const fail = (): never => { throw new Error('올바른 SAA Study 백업 파일이 아닙니다. 기존 기록은 변경되지 않았습니다.'); };
  if (!value || typeof value !== 'object') return fail();
  const envelope = value as Record<string, unknown>;
  if (envelope.app !== 'saa-study' || !envelope.state || typeof envelope.state !== 'object') return fail();
  const s = envelope.state as StudyState;
  if (s.bankId !== undefined && (typeof s.bankId !== 'string' || bankId !== undefined && s.bankId !== bankId)) return fail();
  const ids = new Map(questions.map(q => [q.id, q]));
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const selection = (qid: string, a: unknown): a is string[] => Array.isArray(a) && new Set(a).size === a.length && a.every(k => typeof k === 'string' && ids.get(qid)?.choices.some(c => c.key === k));
  if (s.version !== 1 || !record(s.progress) || !Array.isArray(s.attempts) || !Array.isArray(s.sessions) || !Number.isInteger(s.studyIndex) || s.studyIndex < 0 || s.studyIndex >= questions.length || ![16,17,18,19,20,21,22].includes(s.fontSize)) return fail();
  if (s.attempts.length > 1000000 || s.sessions.length > 100000) return fail();
  for (const [id,p] of Object.entries(s.progress)) {
    if (!ids.has(id) || !record(p) || (p.bookmark !== undefined && typeof p.bookmark !== 'boolean') || (p.unsure !== undefined && typeof p.unsure !== 'boolean') || (p.note !== undefined && (typeof p.note !== 'string' || p.note.length > 20000)) || (p.studiedAt !== undefined && !date(p.studiedAt))) return fail();
  }
  const isDomain = (v: unknown) => ['security','resilience','performance','cost'].includes(v as string);
  if(s.studyOrder !== undefined && (!Array.isArray(s.studyOrder) || s.studyOrder.length !== questions.length || new Set(s.studyOrder).size !== questions.length || !s.studyOrder.every(id=>ids.has(id)))) return fail();
  for(const p of Object.values(s.progress)) if(p.domain !== undefined && !isDomain(p.domain)) return fail();
  const seenAttempts = new Set<string>();
  for (const a of s.attempts) {
    if (!record(a) || typeof a.id !== 'string' || seenAttempts.has(a.id) || typeof a.qid !== 'string' || !ids.has(a.qid) || !selection(a.qid,a.selected) || !a.selected.length || typeof a.correct !== 'boolean' || a.correct !== isCorrect(a.selected,ids.get(a.qid)!.answer) || !date(a.at) || !['study','quiz','review','mock'].includes(a.mode as string) || typeof a.sessionId !== 'string') return fail();
    seenAttempts.add(a.id);
  }
  const seenSessions = new Set<string>();
  for (const session of s.sessions) {
    if (!record(session) || typeof session.id !== 'string' || seenSessions.has(session.id) || !['quiz','review','mock'].includes(session.mode as string) || !Array.isArray(session.ids) || !session.ids.length || new Set(session.ids).size !== session.ids.length || !session.ids.every(id => typeof id === 'string' && ids.has(id)) || !record(session.answers) || !Number.isInteger(session.position) || session.position < 0 || session.position >= session.ids.length || !date(session.startedAt) || (session.submittedAt !== undefined && !date(session.submittedAt))) return fail();
    for (const [id,selected] of Object.entries(session.answers)) if (!session.ids.includes(id) || !selection(id,selected)) return fail();
    if(session.mode === 'mock') {
      const m=session.mock;
      if(!record(m) || !Number.isInteger(m.durationMinutes) || m.durationMinutes < 1 || m.durationMinutes > 1440 || !date(m.deadlineAt) || Date.parse(m.deadlineAt) !== Date.parse(session.startedAt)+m.durationMinutes*60000 || !record(m.domains) || Object.keys(m.domains).length !== session.ids.length || !session.ids.every(id=>isDomain(m.domains[id]))) return fail();
    } else if(session.mock !== undefined) return fail();
    seenSessions.add(session.id);
  }
  if (s.activeSessionId !== null && (typeof s.activeSessionId !== 'string' || !s.sessions.some(session => session.id === s.activeSessionId && !session.submittedAt))) return fail();
  if (s.studyDraft && (!record(s.studyDraft) || !ids.has(s.studyDraft.qid) || !selection(s.studyDraft.qid,s.studyDraft.selected) || typeof s.studyDraft.revealed !== 'boolean' || typeof s.studyDraft.graded !== 'boolean')) return fail();
  return structuredClone(s);
}

export function studySequence(questions: Question[], state: StudyState): string[] {
  return state.studyOrder || questions.map(q=>q.id);
}
export function startRandomStudy(state: StudyState, questions: Question[]): StudyState {
  const studyOrder=shuffled(questions.map(q=>q.id));
  return {...state,studyOrder,studyIndex:questions.findIndex(q=>q.id===studyOrder[0]),studyDraft:undefined};
}
export function expireMockExams(state: StudyState, questions: Question[], now=Date.now()): StudyState {
  return state.sessions.filter(s=>s.mode==='mock' && !s.submittedAt && Date.parse(s.mock!.deadlineAt)<=now).reduce((next,s)=>submitSession(next,s.id,questions,s.mock!.deadlineAt),state);
}
