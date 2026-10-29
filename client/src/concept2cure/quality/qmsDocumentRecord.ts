import type {DocStatus,DocType,PeriodicReviewSummary,QmsDoc} from './data';
import type {RouteRoundView} from '../v2/surfaces/VaultReviewRoute';
export interface ServerDoc {
  id:number;doc_number:string;title:string;doc_type:string;category:string|null;version:string;status:string;
  effective_date:string|null;next_review_date:string|null;updated_at:string|null;authoring_document_id?:string|null;
  metadata?:{programId?:string}|null;overdue?:boolean;
  /** The signed version still in force while this row's successor is drafted or reviewed. */
  in_force?:{version:string;effectiveDate:string|null}|null;
  /** When the version in force is next due, after its last signed periodic review (server periodic-review.ts). */
  next_review_due?:string|null;
  periodic_review?:{signatureId:number;outcome:PeriodicReviewSummary['outcome'];reviewedAt:string;reviewerName:string|null;reason?:string|null;
    nextReviewDate:string|null;version:string}|null;
  /** The latest review route and its round (RR4); `review_route_unread` when it could not be read. */
  review_route?:RouteRoundView|null;review_route_unread?:boolean;
}
/** The last signed periodic review, as the register shows it. */
export function adaptPeriodicReview(r:ServerDoc):PeriodicReviewSummary|null {
  const p=r.periodic_review;
  return p?{signatureId:p.signatureId,outcome:p.outcome,reviewedAt:p.reviewedAt,reviewerName:p.reviewerName??null,reason:p.reason??null,
    nextReviewDate:p.nextReviewDate??null,version:p.version}:null;
}
/** The next review is the one due after the last signed review; the row's own date is what its approval signed. */
export const nextReviewDueOf=(r:ServerDoc):string|null=>r.next_review_due!==undefined?r.next_review_due:r.next_review_date;
/** The register and exact-object reader share one canonical record adapter. */
export function adaptDoc(r:ServerDoc):QmsDoc {
  return {id:r.id,docNumber:r.doc_number,title:r.title,docType:r.doc_type as DocType,category:r.category,
    version:r.version,status:r.status as DocStatus,effectiveDate:r.effective_date,nextReviewDate:nextReviewDueOf(r),
    updatedAt:r.updated_at,authoringDocumentId:r.authoring_document_id??null,programId:r.metadata?.programId??null,
    inForce:r.in_force?{version:r.in_force.version,effectiveDate:r.in_force.effectiveDate??null}:null,lastReview:adaptPeriodicReview(r),
    signedReviewDate:r.next_review_date,reviewRoute:r.review_route??null,reviewRouteUnread:r.review_route_unread===true};
}
