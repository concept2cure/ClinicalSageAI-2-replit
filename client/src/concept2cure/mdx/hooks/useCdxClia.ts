/**
 * useCdxPairings / useCliaCategorizations — the two IVD differentiators
 * that were built and invisible.
 *
 * `/api/mdx/cdx` (drug–diagnostic pairings with concordance studies) and
 * `/api/mdx/clia` (complexity categorisation + waiver lifecycle) had no
 * client consumer anywhere — reachable through AnA conversationally,
 * never by clicking (docs/MDX_SURFACE_COVERAGE_FINDING.md). The platform
 * review names companion diagnostics and CLIA as differentiators against
 * the closest competitor, and places both in the IVD programme
 * workspace. These hooks put them there.
 *
 * Both routes take an optional programme filter and both are honest
 * about it: pass the selected programme so the panels follow the header,
 * the same contract the rest of the IVD surface was just converted to.
 * Rows are returned as `DataState`, so empty tenants show empty and a
 * failed fetch shows the failure — never an approval status or a waiver
 * grant that nobody actually recorded.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

/* Server rows arrive snake_case (SELECT *); adapt to display shapes so
   surface code never touches column names. */

export interface CdxPairing {
  id: string;
  drugName: string;
  sponsor: string;
  indication: string;
  biomarker: string;
  /** e.g. draft · submitted · approved — the pairing's own lifecycle. */
  approvalStatus: string;
  fdaApprovalDate: string | null;
  emaApprovalDate: string | null;
}

export interface CliaCategorization {
  id: string;
  testName: string;
  analyte: string;
  /** waived · moderate · high */
  complexity: string;
  /**
   * Waiver lifecycle, collapsed to one honest word:
   *   granted   — CMS letter on record
   *   revoked   — was granted, then revoked
   *   applied   — application submitted, no decision recorded
   *   none      — no waiver activity
   * Derived only from booleans/dates the row actually carries.
   */
  waiver: 'granted' | 'revoked' | 'applied' | 'none';
  cmsLetterRef: string | null;
}

interface Row { [k: string]: unknown }
const s = (v: unknown, fallback = '—'): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback;
const d = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 10) : null);

function adaptPairing(r: Row): CdxPairing {
  return {
    id: String(r.id),
    drugName: s(r.drug_name),
    sponsor: s(r.drug_sponsor),
    indication: s(r.indication),
    biomarker: s(r.biomarker),
    approvalStatus: s(r.approval_status, 'draft'),
    fdaApprovalDate: d(r.fda_approval_date),
    emaApprovalDate: d(r.ema_approval_date),
  };
}

function adaptClia(r: Row): CliaCategorization {
  /* Revocation outranks grant — a revoked waiver rendered as "granted"
     is a lab operating outside its certificate. */
  const waiver: CliaCategorization['waiver'] = r.waiver_revocation_date
    ? 'revoked'
    : r.waiver_granted
      ? 'granted'
      : r.waiver_applied
        ? 'applied'
        : 'none';
  return {
    id: String(r.id),
    testName: s(r.test_name),
    analyte: s(r.analyte),
    complexity: s(r.clia_complexity, 'high'),
    waiver,
    cmsLetterRef: typeof r.cms_letter_ref === 'string' ? r.cms_letter_ref : null,
  };
}

export interface UseRowsResult<T> {
  rows: DataState<T[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** @param programId Narrows to one programme; null = whole portfolio. */
export function useCdxPairings(programId?: string | null): UseRowsResult<CdxPairing> {
  const url = programId
    ? `/api/mdx/cdx/pairings?device_program_id=${encodeURIComponent(programId)}`
    : '/api/mdx/cdx/pairings';
  const { data, loading, error, refresh } = useFetchJson<{ data?: Row[] }>(url);
  const rows = data?.data ? data.data.map(adaptPairing) : null;
  return { rows: toDataState(rows, loading, error), loading, error, refresh };
}

export function useCliaCategorizations(programId?: string | null): UseRowsResult<CliaCategorization> {
  const url = programId
    ? `/api/mdx/clia?program_id=${encodeURIComponent(programId)}`
    : '/api/mdx/clia';
  const { data, loading, error, refresh } = useFetchJson<{ data?: Row[] }>(url);
  const rows = data?.data ? data.data.map(adaptClia) : null;
  return { rows: toDataState(rows, loading, error), loading, error, refresh };
}
