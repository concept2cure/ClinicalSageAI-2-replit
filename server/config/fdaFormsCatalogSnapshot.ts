/**
 * FDA Forms — Candidate Catalog Snapshot.
 *
 * This is the reviewed-catalog INPUT for `reconcileFdaCatalogSnapshot()` in
 * `FDAFormsRegistry.ts`. It enumerates the FDA forms the platform builds across
 * the drug/biologic and device submission lifecycle, by official form number.
 *
 * PROVENANCE — READ BEFORE RELYING ON THIS:
 *   `reviewed: false`. These entries are a *candidate* list curated to seed the
 *   acquisition job and the reconciliation gate. They are NOT a network-verified
 *   snapshot of the live FDA catalog, and no official PDF asset is represented as
 *   downloaded here. Per `docs/audits/FDA_FORMS_IMPLEMENTATION_AUDIT_2026-07-29.md`
 *   (findings F-01/F-02), promotion to release requires (1) a reviewed snapshot
 *   taken from the live FDA catalog with per-form edition/expiration + checksum,
 *   and (2) official AcroForm assets installed with matching SHA-256. Running the
 *   pure reconciliation gate over this candidate list shows registry↔catalog
 *   alignment only; it does not establish currency or asset fidelity.
 *
 * The authoritative source is the FDA forms catalog:
 *   https://www.fda.gov/about-fda/forms
 * Each form is listed there; a reviewer resolves the current edition and the
 * direct PDF download URL, records them, and runs `scripts/fetch-fda-forms.ts`.
 *
 * @module server/config/fdaFormsCatalogSnapshot
 */

import {
  reconcileFdaCatalogSnapshot,
  type FDAOfficialCatalogEntry,
  type FDACatalogReconciliation,
} from './FDAFormsRegistry.js';

/** Authoritative FDA forms catalog (the single source of truth for editions). */
export const FDA_FORMS_CATALOG_URL = 'https://www.fda.gov/about-fda/forms';

/**
 * Extra per-entry acquisition metadata layered on top of the reconciliation
 * entry shape. `directDownloadUrl` is left undefined until a reviewer resolves
 * and verifies the current PDF URL from the FDA catalog — the fetch job refuses
 * to guess it.
 */
export interface FdaFormCandidate extends FDAOfficialCatalogEntry {
  /** Canonical form ID used by `FDAFormsRegistry` (e.g. `FDA_1571`). */
  formId: string;
  /** Whether a human reviewer has verified number, title, edition, and URL against the live FDA catalog. */
  verified: boolean;
  /** Direct PDF download URL on fda.gov, filled in by a reviewer. Undefined ⇒ fetch job skips (fail-closed). */
  directDownloadUrl?: string;
}

/**
 * Candidate catalog. `sourceUrl` points at the authoritative FDA forms catalog
 * (an https fda.gov URL, which the reconciliation gate requires). Titles mirror
 * the corrected canonical registry titles; `verified: false` on every row.
 */
export const FDA_FORMS_CANDIDATE_SNAPSHOT: FdaFormCandidate[] = [
  // ── Drug / biologic clinical + marketing (priority: full builders exist) ──
  { formId: 'FDA_1571', formNumber: '1571', title: 'Investigational New Drug Application (IND)', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_1572', formNumber: '1572', title: 'Statement of Investigator', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_1574', formNumber: '1574', title: 'Assurance of IRB Review', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3454', formNumber: '3454', title: 'Certification: Financial Interests and Arrangements of Clinical Investigators', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3455', formNumber: '3455', title: 'Disclosure: Financial Interests and Arrangements of Clinical Investigators', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_356H', formNumber: '356h', title: 'Application to Market a New or Abbreviated New Drug or Biologic for Human Use', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3674', formNumber: '3674', title: 'Certification of Compliance, under 42 U.S.C. § 282(j)(5)(B) (ClinicalTrials.gov)', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_2891', formNumber: '2891', title: 'Truthful and Accuracy Statement (21 CFR 807.87(k)) — not FDA form 2891, which is the device establishment registration', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3654', formNumber: '3654', title: 'Standards Data Report for 510(k)s', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },

  // ── Device: 510(k) / PMA / De Novo / special ──
  { formId: 'FDA_3514', formNumber: '3514', title: 'CDRH Premarket Notification 510(k) Cover Sheet', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3601', formNumber: '3601', title: 'Medical Device User Fee Cover Sheet (MDUFA)', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3881', formNumber: '3881', title: 'Indications for Use', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3872', formNumber: '3872', title: '510(k) Summary or Statement', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3663', formNumber: '3663', title: 'Premarket Approval (PMA) Cover Sheet', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3667', formNumber: '3667', title: 'PMA Amendment', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3847', formNumber: '3847', title: 'Q-Submission Cover Sheet', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3898', formNumber: '3898', title: 'De Novo Classification Request', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
  { formId: 'FDA_3853', formNumber: '3853', title: 'Breakthrough Device Designation Request', sourceUrl: FDA_FORMS_CATALOG_URL, verified: false },
];

/** True only when every candidate row has been reviewer-verified against the live FDA catalog. */
export function isSnapshotReviewed(): boolean {
  return FDA_FORMS_CANDIDATE_SNAPSHOT.length > 0 && FDA_FORMS_CANDIDATE_SNAPSHOT.every((e) => e.verified);
}

/** Run the canonical reconciliation gate over the candidate snapshot. */
export function reconcileCandidateSnapshot(): FDACatalogReconciliation {
  return reconcileFdaCatalogSnapshot(
    FDA_FORMS_CANDIDATE_SNAPSHOT.map(({ formNumber, title, sourceUrl, revisionDate }) => ({
      formNumber,
      title,
      sourceUrl,
      revisionDate,
    })),
  );
}
