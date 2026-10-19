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
import { serverMessage } from '@/lib/queryClient';
import type { PostMarketDocumentType } from '@shared/schema/gspr-postmarket';
import type { RegulatoryBasis } from '@shared/regulatory/regulatory-basis';
import { buildAuthHeaders, useFetchJson } from './useFetchJson';

/** The server's document-type vocabulary (shared/schema/gspr-postmarket.ts POST_MARKET_DOCUMENT_TYPES). */
export type PostMarketDocType = PostMarketDocumentType;

export const POST_MARKET_DOC_LABELS: Record<PostMarketDocType, string> = {
  pms_plan: 'PMS plan',
  pms_report: 'PMS report',
  pmcf_plan: 'PMCF plan',
  pmcf_evaluation: 'PMCF evaluation report',
  psur: 'PSUR',
  sscp: 'SSCP',
  ssp: 'SSP',
  pmpf_plan: 'PMPF plan',
  pmpf_evaluation: 'PMPF evaluation report',
};

export interface PostMarketDocTypeStatus {
  documentType: PostMarketDocType;
  /** true for 'required' and 'required-or-justified'. */
  required: boolean;
  /** 'undetermined' = a fact the rule needs was not stated, or the class is not recognised. */
  obligation: 'required' | 'required-or-justified' | 'not-required' | 'undetermined';
  present: boolean;
  status: 'missing' | 'draft' | 'under_review' | 'approved' | 'superseded' | 'withdrawn';
  latestVersion?: number;
  documentId?: string;
  gatePasses?: boolean;
  criticalFindings?: number;
  citation: string;
  basis: RegulatoryBasis[];
  cadence?: string;
  recipient?: string;
  note?: string;
}

export interface PostMarketStatusReport {
  programId: string;
  deviceClass: string | null;
  regulation: 'MDR' | 'IVDR';
  /** 'class_unrecognised' = the server could not tell what the device owes. */
  status: 'assessed' | 'class_unrecognised';
  normalisedClass: string | null;
  classProblem?: string;
  implantable: boolean | null;
  customMade: boolean | null;
  assumptions: string[];
  documents: PostMarketDocTypeStatus[];
  requiredTotal: number;
  requiredPresent: number;
  requiredApprovedCount: number;
  undeterminedTotal: number;
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
 * The documentation-status query string: the regulation, and nothing else
 * (pinned by __tests__/useCerPostMarket.query.test.ts).
 *
 * 2026-10-19: this also sent `deviceClass`, `implantable` and `customMade`, so
 * the obligation set the server computed came from whatever this surface held
 * — and what it held was `device_class`, the US 21 CFR 860 class, which an MDR
 * assessment rightly refused. Those three facts now come from the programme
 * record on the server (programme-eu-device-record.ts); the regulation stays
 * here because it is this surface's view, not a fact about the device.
 */
export function postMarketStatusQuery(regulation: 'MDR' | 'IVDR'): string {
  return new URLSearchParams({ regulation }).toString();
}

/**
 * Fetch the per-type documentation status. The server decides what the device
 * owes from the regulation and the class, implantable and custom-made facts
 * the programme record states. A record with no EU class for the regulation
 * reports 'class_unrecognised' rather than inventing one; an unstated
 * `implantable` leaves the SSCP of a non-Class-III device 'undetermined'
 * rather than assumed.
 */
export function useCerPostMarketStatus(
  programId: string | null,
  regulation: 'MDR' | 'IVDR' = 'MDR',
): UseCerPostMarketStatusResult {
  const query = postMarketStatusQuery(regulation);
  const url = programId
    ? `/api/post-market/programs/${encodeURIComponent(programId)}/documentation-status?${query}`
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
  /* No `deviceClass`: the drafted document cites the class the programme
     record states, read server-side. Sending one from here is what put the US
     class into an MDR PMS plan. */
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
          regulation: args.regulation ?? undefined,
        }),
      },
    );
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      // This one read `error` BEFORE `message`, so a refusal shaped { error:
      // '<CODE>', message: '<why the draft was refused>' } showed the author
      // the token and never the reason. The envelope reader inverts that and
      // rejects the token outright; the fallback is a sentence rather than the
      // bare `HTTP <status>` this used to fall through to.
      const message = serverMessage(json) ?? `the server gave no reason (HTTP ${res.status})`;
      return { ok: false, draft: null, error: message };
    }
    return { ok: true, draft: (json as unknown as GeneratedPostMarketDraft) ?? null, error: null };
  } catch {
    // A throw here is the fetch itself failing (offline, DNS, abort). Its
    // native message is "Failed to fetch" / "Load failed", so the hook's own
    // wording is the only thing worth showing.
    return {
      ok: false,
      draft: null,
      error: 'Draft generation request failed',
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
