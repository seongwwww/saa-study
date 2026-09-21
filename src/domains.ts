import { shuffled, type Domain, type Question, type StudyState } from './model.ts';

export const EXAM_GUIDE = 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html';
export const DOMAINS: { id: Domain; name: string; weight: number; description: string }[] = [
  { id: 'security', name: '보안 아키텍처', weight: 30, description: '접근 제어 · 데이터 보호 · 네트워크 보안' },
  { id: 'resilience', name: '복원력 있는 아키텍처', weight: 26, description: '고가용성 · 재해 복구 · 느슨한 결합' },
  { id: 'performance', name: '고성능 아키텍처', weight: 24, description: '컴퓨팅 · 스토리지 · 데이터 분석 · 네트워크 성능' },
  { id: 'cost', name: '비용 최적화 아키텍처', weight: 20, description: '비용 효율적인 컴퓨팅 · 저장 · 전송' },
];

// Prompt requirements carry more weight than services in the recorded answer.
// Distractors and explanations are deliberately excluded: they often mention
// unrelated domains or contain mismatched source explanations.
const RULES: { domain: Domain; pattern: RegExp; weight: number; reason: string }[] = [
  { domain: 'security', pattern: /암호화|encrypt|복호화|키 관리|key management|KMS|CloudHSM/i, weight: 8, reason: '암호화·키 관리' },
  { domain: 'security', pattern: /자격 증명|인증|인증서|권한|최소 권한|credential|authentication|authorization|least privilege|IAM|Cognito|SAML|SSO|Secrets Manager/i, weight: 8, reason: '인증·권한·자격 증명' },
  { domain: 'security', pattern: /보안|공격|방화벽|민감|개인.{0,5}정보|규정|규제|감사|준수|무단|안전하게|우발적인 삭제|security|attack|firewall|sensitive|compliance|audit|DDoS|WAF|GuardDuty|Macie|\bPII\b|unauthorized/i, weight: 7, reason: '보안·규정 준수' },
  { domain: 'security', pattern: /액세스[^.?!]{0,100}(제한|허용|방지|차단)|접근[^.?!]{0,100}(제한|허용|차단)|인터넷.{0,15}(없이|거치지)|프라이빗.{0,15}(연결|액세스)|private.{0,15}(access|connect)|restrict.{0,25}access|without.{0,15}internet|트래픽.{0,15}(검사|필터링|보호)|태그.{0,30}(보장|검사)|PrincipalOrgID|버킷 정책/i, weight: 9, reason: '접근 제한·프라이빗 연결' },
  { domain: 'resilience', pattern: /재해|복구.{0,8}(목표|시간|시점)|장애 조치|장애조치|단일 장애|disaster|failover|single point|\bRTO\b|\bRPO\b|pilot light|warm standby/i, weight: 12, reason: '재해 복구·장애 조치' },
  { domain: 'resilience', pattern: /고가용|고 가용|가용성|내결함|내결함성|복원력|탄력성|중단.{0,10}(없이|최소)|high availability|highly available|fault.toleran|resilien/i, weight: 7, reason: '가용성·복원력' },
  { domain: 'resilience', pattern: /느슨.{0,5}결합|분리.{0,10}확장|분리하고|결합.{0,10}(제거|줄)|decoupl|loosely.coupled|상태 비저장|stateless|메시지.{0,20}(손실|순서)|접수된 순서|수신.{0,5}순서/i, weight: 9, reason: '느슨한 결합·메시지 처리' },
  { domain: 'resilience', pattern: /확장성|자동.{0,4}확장|수평.{0,4}확장|scalability|scale automatically|horizontal scal|이벤트 기반|event.driven|마이크로서비스|마이크로 서비스/i, weight: 6, reason: '확장·이벤트 기반 설계' },
  { domain: 'resilience', pattern: /장애.{0,20}(발생|복구)|실패.{0,20}(처리|재시도)|실패하는|내구성|durab|retry|recover.{0,15}failure/i, weight: 6, reason: '장애 복구·내구성' },
  { domain: 'resilience', pattern: /백업|복원|backup|restore|SQS|SNS|EventBridge|Step Functions|다중 AZ|Multi.AZ/i, weight: 3, reason: '백업·복원·분산 처리' },
  { domain: 'performance', pattern: /성능|지연|대기 시간|처리량|IOPS|I\/O|병목|performance|latency|throughput|bottleneck/i, weight: 8, reason: '성능·지연·처리량' },
  { domain: 'performance', pattern: /최대한 빨리|가능한.{0,10}빨리|시간.{0,8}최소화|실시간|real.time|fastest|as quickly|분석|시각화|analytics|visualization|쿼리|query|SQL/i, weight: 6, reason: '신속한 처리·데이터 분석' },
  { domain: 'performance', pattern: /대역폭|캐시|스트리밍|데이터 수집|bandwidth|cach|streaming|ingestion|대규모|대용량/i, weight: 3, reason: '대용량 처리·캐시·네트워크' },
  { domain: 'performance', pattern: /EFS|FSx|NFS|SMB|Lustre|DataSync|Snowball|Athena|Redshift|EMR|Kinesis|QuickSight|ElastiCache|Global Accelerator/i, weight: 3, reason: '스토리지·분석·전송 설계' },
  { domain: 'performance', pattern: /시각화|대시보드|보고 솔루션|visualization|dashboard/i, weight: 9, reason: '데이터 시각화·보고' },
  { domain: 'cost', pattern: /비용.{0,20}(최소|절감|줄|낮|최적|효율)|가장.{0,8}(저렴|경제)|최소.{0,5}비용|최저.{0,5}비용|cost.effectiv|cost.optimi|lowest.cost|minimi.{0,20}cost|reduc.{0,20}cost|비용 효율/i, weight: 18, reason: '비용 최적화 요구사항' },
  { domain: 'cost', pattern: /청구|예산|요금|구매 옵션|예약 인스턴스|스팟|Savings Plans|Reserved Instances|Spot Instances|Cost Explorer|Budgets|billing|budget/i, weight: 8, reason: '요금·구매 옵션·비용 관리' },
  { domain: 'cost', pattern: /수명 주기|수명주기|스토리지 계층|액세스.{0,10}빈도|거의 액세스|거의 접근|아카이브|장기 보관|lifecycle|archiv|infrequent|Glacier|Intelligent.Tiering/i, weight: 5, reason: '저장 계층·데이터 수명 주기' },
];

export type Classification = { domain: Domain; source: 'manual' | 'bank' | 'estimated'; uncertain: boolean; reason: string };
export function classifyQuestion(q: Question, override?: Domain): Classification {
  if (override) return { domain: override, source: 'manual', uncertain: false, reason: '직접 지정한 영역' };
  if (q.domain) return { domain: q.domain, source: 'bank', uncertain: false, reason: '문제집에 지정된 영역' };
  const answer = q.choices.filter(c => q.answer.includes(c.key)).map(c => c.text).join(' ');
  const scores = DOMAINS.map(d => {
    const matches = RULES.filter(r => r.domain === d.id && r.pattern.test(q.prompt));
    const answerScore = RULES.filter(r => r.domain === d.id && r.pattern.test(answer)).reduce((sum,r) => sum + r.weight * .18, 0);
    // The final requirements usually distinguish the design objective from
    // background infrastructure. Boost explicit goals, not service names.
    const goal = q.prompt.slice(-200);
    const goalBonus = matches.filter(r=>r.weight>=6 && r.pattern.test(goal)).reduce((sum,r)=>sum+r.weight*.65,0);
    return { domain: d.id, score: matches.reduce((sum,r) => sum+r.weight, 0) + answerScore + goalBonus, matches };
  }).sort((a,b) => b.score-a.score);
  const best = scores[0];
  return { domain: best.score ? best.domain : 'performance', source: 'estimated', uncertain: best.score < 7 || best.score-scores[1].score < 3,
    reason: best.matches.map(r=>r.reason).slice(0,2).join(' · ') || '명확한 단서가 적어 검토가 필요합니다' };
}

// Largest-remainder allocation keeps both the exact total and the closest
// integer allocation. For 65 questions this is 19 / 17 / 16 / 13.
export function examAllocation(total: number): Record<Domain,number> {
  if (!Number.isInteger(total) || total < 1 || total > 10000) throw Error('문제 수가 올바르지 않습니다.');
  const counts = Object.fromEntries(DOMAINS.map(d=>[d.id, Math.floor(total*d.weight/100)])) as Record<Domain,number>;
  const ordered = [...DOMAINS].sort((a,b)=>(total*b.weight%100)-(total*a.weight%100));
  const remainder = total-Object.values(counts).reduce((a,b)=>a+b,0);
  for(let i=0;i<remainder;i++) counts[ordered[i].id]++;
  return counts;
}
export function examPools(questions: Question[], state: StudyState) {
  return DOMAINS.map(d=>({...d, questions:questions.filter(q=>classifyQuestion(q,state.progress[q.id]?.domain).domain===d.id)}));
}
export function buildMockExam(questions: Question[], state: StudyState, total: number) {
  const allocation=examAllocation(total), domains:Record<string,Domain>={}, ids:string[]=[];
  for(const pool of examPools(questions,state)) {
    if(pool.questions.length<allocation[pool.id]) throw Error(`${pool.name} 문제가 ${allocation[pool.id]-pool.questions.length}개 부족합니다. 문제 수를 줄이거나 영역 분류를 확인해 주세요.`);
    for(const q of shuffled(pool.questions).slice(0,allocation[pool.id])) { ids.push(q.id); domains[q.id]=pool.id; }
  }
  return {ids:shuffled(ids), domains};
}
