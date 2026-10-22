import type {DocStatus,DocType,QmsDoc} from './data';
export interface ServerDoc {
  id:number;doc_number:string;title:string;doc_type:string;category:string|null;version:string;status:string;
  effective_date:string|null;next_review_date:string|null;updated_at:string|null;authoring_document_id?:string|null;
  metadata?:{programId?:string}|null;overdue?:boolean;
  /** The signed version still in force while this row's successor is drafted or reviewed. */
  in_force?:{version:string;effectiveDate:string|null}|null;
}
/** The register and exact-object reader share one canonical record adapter. */
export function adaptDoc(r:ServerDoc):QmsDoc {
  return {id:r.id,docNumber:r.doc_number,title:r.title,docType:r.doc_type as DocType,category:r.category,
    version:r.version,status:r.status as DocStatus,effectiveDate:r.effective_date,nextReviewDate:r.next_review_date,
    updatedAt:r.updated_at,authoringDocumentId:r.authoring_document_id??null,programId:r.metadata?.programId??null,
    inForce:r.in_force?{version:r.in_force.version,effectiveDate:r.in_force.effectiveDate??null}:null};
}
