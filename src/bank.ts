import demo from './demo-bank.json' with { type: 'json' };
import type { Question } from './model';
export type QuestionBank = { version: 1; id?: string; title: string; questions: Question[] };
export function validateBank(input: unknown): QuestionBank {
  const b = input as QuestionBank;
  if (!b || b.version !== 1 || typeof b.title !== 'string' || (b.id !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id)) || !Array.isArray(b.questions) || !b.questions.length || b.questions.length > 10000) throw Error('문제집 형식을 확인해 주세요.');
  const seen = new Set<string>();
  b.questions.forEach((q,i) => {
    if (!q || typeof q.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(q.id) || seen.has(q.id) || q.number !== i+1 || !Number.isInteger(q.sourceNumber) || !Number.isInteger(q.pageStart) || q.pageStart < 0 || !Number.isInteger(q.pageEnd) || q.pageEnd < q.pageStart || typeof q.prompt !== 'string' || !q.prompt.trim() || !Array.isArray(q.choices) || q.choices.length < 2 || new Set(q.choices.map(c=>c.key)).size !== q.choices.length || q.choices.some(c=>!c || !/^[A-F]$/.test(c.key) || typeof c.text !== 'string' || !c.text.trim()) || !Array.isArray(q.answer) || !q.answer.length || new Set(q.answer).size !== q.answer.length || !q.answer.every(k=>q.choices.some(c=>c.key===k)) || !Array.isArray(q.explanation) || !q.explanation.every(p=>typeof p==='string') || !Array.isArray(q.links) || !q.links.every(url=>typeof url==='string' && /^https?:\/\//.test(url))) throw Error(`${i+1}번 문제의 형식이 올바르지 않습니다.`);
    seen.add(q.id);
  });
  return b;
}
export async function loadQuestionBank(): Promise<QuestionBank> {
  const response = await fetch('./questions.json');
  // Vite returns its HTML entry point for missing files during development.
  if (response.status === 404 || response.ok && response.headers.get('content-type')?.includes('text/html')) return validateBank(demo);
  if (!response.ok) throw Error('문제집 파일을 불러오지 못했습니다.');
  return validateBank(await response.json());
}
