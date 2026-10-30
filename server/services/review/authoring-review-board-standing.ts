import { signedOnRoute, type AuthoringReviewStanding } from '../../../shared/authoring/peer-review';
import { sectionsDigest } from '../authoring/authoring-content-digests';
import type { RouteRound } from './review-route-standing';

type ReviewFact = {status:string;standing?:AuthoringReviewStanding;routeSignedAt?:string|null};

const reviewed=(r:ReviewFact)=>(r.standing==='current' && r.status==='approved') || signedOnRoute(r);

/** Recorded signature completion remains authoritative. Human verdicts describe
 * today's text only when their retained full snapshot verifies as current. */
export function deriveState(docStatus:string,reviews:ReviewFact[]):'in-review'|'approved'|'changes-requested'|'rejected' {
  if (String(docStatus).toUpperCase()==='APPROVED') return 'approved';
  if (reviews.some(r=>r.standing==='current' && r.status==='rejected')) return 'rejected';
  if (reviews.some(r=>r.standing==='current' && r.status==='changes_requested')) return 'changes-requested';
  if (reviews.length>0 && reviews.every(reviewed)) return 'approved';
  return 'in-review';
}

/** Stale and legacy unbound facts remain visible work, never current approval. */
export function isOpenWork(docStatus:string,reviews:ReviewFact[],steps:Array<{status:string}>):boolean {
  if (String(docStatus).toUpperCase()==='IN_REVIEW') return true;
  if (reviews.some(r=>!reviewed(r))) return true;
  return steps.some(s=>String(s.status).toUpperCase()==='PENDING');
}

/** Real users use PostgreSQL integer identities. Partial numbers never admit. */
export function boardActorId(userId:string):number|undefined {
  if (!/^[1-9]\d*$/.test(userId)) return undefined;
  const value=Number(userId);
  return Number.isSafeInteger(value) && value<=2_147_483_647 ? value : undefined;
}

/**
 * The reviewers who signed REVIEWER on the document's latest review route
 * (RR5), by account id, with when. Only while the route is about the sections
 * the document has today: a signature over earlier content is not a review of
 * this one. The member outcome is the route reader's, which verifies each
 * signature (its signer, document, meaning and digest).
 */
export function routeSignaturesOf(round:RouteRound|undefined,sections:Array<{code:string;content:string|null}>):Map<string,string> {
  const out=new Map<string,string>();
  if (!round || round.route.contentDigest!==sectionsDigest(sections)) return out;
  for (const m of round.members) {
    if (m.role==='reviewer' && m.outcome==='signed' && m.signature) out.set(String(m.userId),m.signature.signedAt);
  }
  return out;
}

/** The caller's own review signature on the route, when it is their review. */
export function mySignedReviewAt(view:ReviewFact|undefined):string|null {
  return view && signedOnRoute(view) ? view.routeSignedAt ?? null : null;
}

type ReviewerRow = {id:string;reviewer_id:unknown;reviewer_name:string|null;reviewer_email:string|null;review_status:string};

/**
 * How a reviewer is named on screen. One place, because the queue row, the
 * request list and the "waiting on" line must agree on the fallback order.
 */
export function reviewerLabel(r:ReviewerRow):string {
  return r.reviewer_name || r.reviewer_email || String(r.reviewer_id);
}

/**
 * Who the row is waiting on, and in what capacity: the pending reviewer who
 * has not signed on the route, else the current signer, else the last reviewer
 * on record. Its own function because the fallback order is the rule, not an
 * accident of statement order.
 */
export function pickReviewerAndRole(
  reviews:ReviewerRow[], reviewViews:Array<ReviewFact&{id:string}>, currentStep:{approver_email:string|null;role:string}|null,
):{reviewer:string;role:string} {
  const signed=new Set(reviewViews.filter(signedOnRoute).map((v)=>v.id));
  const pendingReview=reviews.find((r)=>r.review_status==='pending' && !signed.has(r.id)) ?? null;
  if (pendingReview) return {reviewer:reviewerLabel(pendingReview),role:'Reviewer'};
  if (currentStep) return {reviewer:currentStep.approver_email ?? '',role:`${currentStep.role} sign-off`};
  if (reviews[0]) return {reviewer:reviewerLabel(reviews[0]),role:'Reviewer'};
  return {reviewer:'',role:''};
}
