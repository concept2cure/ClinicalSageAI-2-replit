/**
 * Post-Market Documentation Status
 *
 * Aggregates the post-market document set for a program into an HONEST status
 * view: for each EU MDR/IVDR post-market document type, whether it is required
 * for the device class, whether an instance exists, its lifecycle status, and
 * whether its content passes the existing completeness validator.
 *
 * Deliberately NOT a fabricated "readiness %": it reports factual presence,
 * status and gate results per document type, each cited to its MDR/IVDR article.
 * "allRequiredApproved" is a literal AND over the required set — it does not
 * imply Notified-Body readiness or scientific sufficiency.
 */

import { listProgramDocuments, validateDocument } from './post-market.service';
import type {
  PostMarketDocument,
  PostMarketDocumentType,
} from '../../../shared/schema/gspr-postmarket';

export type DocLifecycleStatus =
  | 'missing'
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'superseded'
  | 'withdrawn';

export interface DocTypeStatus {
  documentType: PostMarketDocumentType;
  required: boolean;
  present: boolean;
  status: DocLifecycleStatus;
  latestVersion?: number;
  documentId?: string;
  gatePasses?: boolean;
  criticalFindings?: number;
  citation: string;
}

export interface PostMarketDocStatusReport {
  programId: string;
  deviceClass: string | null;
  regulation: 'MDR' | 'IVDR';
  documents: DocTypeStatus[];
  requiredTotal: number;
  requiredPresent: number;
  requiredApprovedCount: number;
  allRequiredApproved: boolean;
  generatedAt: string;
}

const ALL_TYPES: PostMarketDocumentType[] = [
  'pms_plan',
  'pms_report',
  'pmcf_plan',
  'pmcf_evaluation',
  'psur',
  'sscp',
];

const CITATION: Record<PostMarketDocumentType, string> = {
  pms_plan: 'MDR Art 84 / IVDR Art 78 (Annex III)',
  pms_report: 'MDR Art 85 (Class I)',
  pmcf_plan: 'MDR Annex XIV Part B',
  pmcf_evaluation: 'MDR Annex XIV Part B',
  psur: 'MDR Art 86 / IVDR Art 81 (Class IIa+)',
  sscp: 'MDR Art 32 (Class III + implantable IIb)',
};

function normClass(deviceClass?: string | null): string {
  return (deviceClass ?? '').toUpperCase();
}

/**
 * Which document types are mandatory for a given device class (MDR). Conservative
 * and explicit; PMCF is treated as required for Class IIa and above (absence
 * must be justified separately), SSCP only for Class III / implantable IIb.
 */
function requiredTypes(deviceClass?: string | null): Set<PostMarketDocumentType> {
  const cls = normClass(deviceClass);
  const req = new Set<PostMarketDocumentType>();
  // PMS plan is always required.
  req.add('pms_plan');

  const isClassI = cls === 'I' || cls.includes('CLASS I') || cls === 'A'; // IVD class A ~ low risk
  const isIIaPlus =
    cls.includes('IIA') ||
    cls.includes('IIB') ||
    cls.includes('III') ||
    cls === 'B' ||
    cls === 'C' ||
    cls === 'D';

  // Periodic reporting: PSUR for IIa+, otherwise a PMS report (Class I).
  if (isIIaPlus) req.add('psur');
  else if (isClassI) req.add('pms_report');

  // PMCF for IIa and above.
  if (isIIaPlus) {
    req.add('pmcf_plan');
    req.add('pmcf_evaluation');
  }

  // SSCP for Class III and implantable Class IIb.
  if (cls.includes('III') || (cls.includes('IIB') && cls.includes('IMPLANT'))) {
    req.add('sscp');
  }

  return req;
}

/**
 * Pure computation: collapse the program's documents (all types/versions) into a
 * per-type status report. Exposed for direct testing without a DB.
 */
export function computeDocStatus(
  docs: PostMarketDocument[],
  deviceClass: string | null,
  regulation: 'MDR' | 'IVDR',
  programId: string
): PostMarketDocStatusReport {
  // Latest version per type.
  const latestByType = new Map<PostMarketDocumentType, PostMarketDocument>();
  for (const d of docs) {
    const t = d.documentType as PostMarketDocumentType;
    const cur = latestByType.get(t);
    if (!cur || (d.version ?? 1) > (cur.version ?? 1)) latestByType.set(t, d);
  }

  const required = requiredTypes(deviceClass);

  const documents: DocTypeStatus[] = ALL_TYPES.map(t => {
    const doc = latestByType.get(t);
    const isRequired = required.has(t);
    if (!doc) {
      return {
        documentType: t,
        required: isRequired,
        present: false,
        status: 'missing',
        citation: CITATION[t],
      };
    }
    const validation = validateDocument(doc);
    return {
      documentType: t,
      required: isRequired,
      present: true,
      status: (doc.status as DocLifecycleStatus) ?? 'draft',
      latestVersion: doc.version ?? 1,
      documentId: doc.id,
      gatePasses: validation.passesGate,
      criticalFindings: validation.criticalCount,
      citation: CITATION[t],
    };
  });

  const req = documents.filter(d => d.required);
  const requiredPresent = req.filter(d => d.present).length;
  const requiredApprovedCount = req.filter(
    d => d.present && d.status === 'approved' && d.gatePasses === true
  ).length;

  return {
    programId,
    deviceClass,
    regulation,
    documents,
    requiredTotal: req.length,
    requiredPresent,
    requiredApprovedCount,
    allRequiredApproved: req.length > 0 && requiredApprovedCount === req.length,
    generatedAt: new Date().toISOString(),
  };
}

/** DB-backed wrapper: load the program's documents and compute the status report. */
export async function getPostMarketDocStatus(
  organizationId: number,
  programId: string,
  deviceClass: string | null = null,
  regulation: 'MDR' | 'IVDR' = 'MDR'
): Promise<PostMarketDocStatusReport> {
  const docs = await listProgramDocuments(organizationId, programId);
  return computeDocStatus(docs, deviceClass, regulation, programId);
}
