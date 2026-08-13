/**
 * useCerPostMarket — Article 83 / Annex XIV Part B data for the CER
 * workbench's PMS/PMCF tab, consuming server/routes/gspr-postmarket.ts
 * (mounted at /api/post-market):
 *
 *   GET  /programs/:id/documentation-status    honest per-type presence report
 *   GET  /programs/:id/documents               the program's document rows
 *   POST /programs/:id/documents/:type/generate   author a DRAFT (never approves)
 *
 * The status report is the server's factual view — per document type: required
 * for the device class, present or missing, lifecycle status, validation-gate
 * result — deliberately not a fabricated readiness score. Draft generation
 * requires a real device name (from the program's device profile); without one
 * the mutator refuses locally rather than sending a request the server 422s.
 */

import { useCallback, useState } from 'react';
import { buildAuthHeaders, useFetchJson } from './useFetchJson';

export type PostMarketDocType =
  | 'pms_plan'
  | 'pms_report'
  | 'pmcf_plan'
  | 'pmcf_evaluation'
  | 'psur'
  | 'sscp';

export const POST_MARKET_DOC_LABELS: Record<PostMarketDocType, string> = {
  pms_plan: 'PMS plan',
  pms_report: 'PMS report',
  pmcf_plan: 'PMCF plan',
  pmcf_evaluation: 'PMCF evaluation report',
  psur: 'PSUR',
  sscp: 'SSCP',
};

export interface PostMarketDocTypeStatus {
  documentType: PostMarketDocType;
  required: boolean;
  present: boolean;
  status: 'missing' | 'draft' | 'under_review' | 'approved' | 'superseded' | 'withdrawn';
  latestVersion?: number;
  documentId?: string;
  gatePasses?: boolean;
  criticalFindings?: number;
  citation: string;
}

export interface PostMarketStatusReport {
  programId: string;
  deviceClass: string | null;
  regulation: 'MDR' | 'IVDR';
  documents: PostMarketDocTypeStatus[];
  requiredTotal: number;
  requiredPresent: number;
  requiredApprovedCount: number;
  allRequiredApproved: boolean;
  generatedAt: string;
}

export interface UseCerPostMarketStatusResult {
  report: PostMarketStatusReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch the per-type documentation status. deviceClass sharpens which types
 * count as required (e.g. PSUR for IIa+, SSCP for III); omitting it keeps the
 * server's conservative default rather than inventing a class.
 */
export function useCerPostMarketStatus(
  programId: string | null,
  deviceClass: string | null,
  regulation: 'MDR' | 'IVDR' = 'MDR',
): UseCerPostMarketStatusResult {
  const params = new URLSearchParams({ regulation });
  if (deviceClass) params.set('deviceClass', deviceClass);
  const url = programId
    ? `/api/post-market/programs/${encodeURIComponent(programId)}/documentation-status?${params.toString()}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<PostMarketStatusReport>(url);
  return { report: data ?? null, loading, error, refresh };
}

export interface GeneratedPostMarketDraft {
  document: { id: string; documentType: string; title?: string; version?: number; status?: string };
  validation?: { passesGate?: boolean; criticalCount?: number };
}

export interface GenerateDraftArgs {
  programId: string;
  documentType: PostMarketDocType;
  deviceName: string;
  deviceClass?: string | null;
  regulation?: 'MDR' | 'IVDR';
}

export interface GenerateDraftOutcome {
  ok: boolean;
  draft: GeneratedPostMarketDraft | null;
  error: string | null;
}

/**
 * Author a DRAFT post-market document server-side. The server persists it in
 * `draft` status and returns the document plus its conformance validation —
 * it never approves, locks, or asserts sufficiency, and neither does this.
 */
export async function generatePostMarketDraft(args: GenerateDraftArgs): Promise<GenerateDraftOutcome> {
  const deviceName = args.deviceName.trim();
  if (!deviceName) {
    return {
      ok: false,
      draft: null,
      error: 'A device name is required — set the product name on the device profile first',
    };
  }
  try {
    const res = await fetch(
      `/api/post-market/programs/${encodeURIComponent(args.programId)}/documents/${encodeURIComponent(
        args.documentType,
      )}/generate`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({
          deviceName,
          deviceClass: args.deviceClass ?? undefined,
          regulation: args.regulation ?? undefined,
        }),
      },
    );
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const message =
        (typeof json?.error === 'string' && json.error) ||
        (typeof json?.message === 'string' && json.message) ||
        `HTTP ${res.status}`;
      return { ok: false, draft: null, error: message };
    }
    return { ok: true, draft: (json as unknown as GeneratedPostMarketDraft) ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      draft: null,
      error: err instanceof Error ? err.message : 'Draft generation request failed',
    };
  }
}

export interface UseGeneratePostMarketDraftResult {
  busy: PostMarketDocType | null;
  outcome: GenerateDraftOutcome | null;
  generate: (args: GenerateDraftArgs) => Promise<GenerateDraftOutcome>;
}

export function useGeneratePostMarketDraft(onDone?: () => void): UseGeneratePostMarketDraftResult {
  const [busy, setBusy] = useState<PostMarketDocType | null>(null);
  const [outcome, setOutcome] = useState<GenerateDraftOutcome | null>(null);

  const generate = useCallback(
    async (args: GenerateDraftArgs) => {
      setBusy(args.documentType);
      try {
        const result = await generatePostMarketDraft(args);
        setOutcome(result);
        if (result.ok) onDone?.();
        return result;
      } finally {
        setBusy(null);
      }
    },
    [onDone],
  );

  return { busy, outcome, generate };
}
