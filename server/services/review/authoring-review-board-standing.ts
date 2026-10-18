import type { AuthoringReviewStanding } from '../../../shared/authoring/peer-review';

type ReviewFact = {status:string;standing?:AuthoringReviewStanding};

/** Recorded signature completion remains authoritative. Human verdicts describe
 * today's text only when their retained full snapshot verifies as current. */
export function deriveState(docStatus:string,reviews:ReviewFact[]):'in-review'|'approved'|'changes-requested'|'rejected' {
  if (String(docStatus).toUpperCase()==='APPROVED') return 'approved';
  if (reviews.some(r=>r.standing==='current' && r.status==='rejected')) return 'rejected';
  if (reviews.some(r=>r.standing==='current' && r.status==='changes_requested')) return 'changes-requested';
  if (reviews.length>0 && reviews.every(r=>r.standing==='current' && r.status==='approved')) return 'approved';
  return 'in-review';
}

/** Stale and legacy unbound facts remain visible work, never current approval. */
export function isOpenWork(docStatus:string,reviews:ReviewFact[],steps:Array<{status:string}>):boolean {
  if (String(docStatus).toUpperCase()==='IN_REVIEW') return true;
  if (reviews.some(r=>r.status!=='approved' || r.standing!=='current')) return true;
  return steps.some(s=>String(s.status).toUpperCase()==='PENDING');
}

/** Real users use PostgreSQL integer identities. Partial numbers never admit. */
export function boardActorId(userId:string):number|undefined {
  if (!/^[1-9]\d*$/.test(userId)) return undefined;
  const value=Number(userId);
  return Number.isSafeInteger(value) && value<=2_147_483_647 ? value : undefined;
}
