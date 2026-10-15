/**
 * The correspondence drafter's view of a REAL letter.
 *
 * This file used to be `CORRESP_DETAIL`: four agency and notified-body letters
 * that were never sent — a CDRH AI-Hold on "K-251401" asking for MARD by age
 * decile, an RTA, a Day-100 letter on "P250048", notified-body GSPR questions —
 * each with a named signatory, a deficiency decomposition, and for one of them
 * a fully drafted "AnA" response with a sign-off roster. The drafter opened ONLY
 * for those ids, so it never once showed a tenant's own letter.
 *
 * It now maps GET /api/regulatory-correspondence/correspondence/:id — the
 * c2c_correspondence row, its parsed c2c_correspondence_issues and its
 * c2c_response_packages — into what the drafter renders. Nothing here is
 * invented: a field the record does not carry is left out.
 */

import type { CorrespondenceRef } from '../types';
import type {
  CorrespondenceDetail as LiveCorrespondenceDetail,
  CorrespondenceIssue,
} from '../../services/programTabsService';

export interface LetterSignature {
  sign_off: string;
  name: string;
  title: string;
  cc?: string[];
}

/** The letter as the drafter shows it. Optional fields are optional because a
 *  received letter's record does not always carry them; the drafter shows a
 *  field only when the record does. */
export interface DrafterLetterDoc {
  from_name: string;
  from_title?: string;
  from_office?: string;
  ref?: string;
  dated?: string;
  received_at?: string;
  our_ref?: string;
  via?: string;
  body: string[];
  signature?: LetterSignature;
}

export interface DeficiencyReg {
  ref: string;
  title: string;
}

export interface Deficiency {
  id: string;
  n: number;
  title: string;
  body: string;
  refs: CorrespondenceRef[];
  regs: DeficiencyReg[];
  severity: 'major' | 'minor';
  complete?: boolean;
}

export interface DraftTable {
  cols: string[];
  rows: Array<Array<string | number>>;
}

export interface DraftEvidence {
  name: string;
  kind: string;
  size: number;
  source: string;
  new?: boolean;
}

export interface DraftUpdate {
  section: string;
  diff: string;
  summary?: string;
}

export interface DraftDeficiency {
  id: string;
  response: string;
  table?: DraftTable;
  discussion?: string;
  evidence: DraftEvidence[];
  updates: DraftUpdate[];
}

export interface DraftReviewer {
  role: string;
  name: string;
  status: 'pending' | 'approved';
  signed_at?: string | null;
}

export interface ResponseDraft {
  status: 'unstarted' | 'drafted' | 'in_review' | 'approved' | 'sent';
  generated_at?: string;
  generated_by?: string;
  intro?: string;
  deficiencies?: DraftDeficiency[];
  closing?: string;
  reviewers?: DraftReviewer[];
  send_to?: string;
  due?: string;
  acknowledged_by?: string;
  sent_at?: string;
}

/** A response package filed against the letter (c2c_response_packages). */
export interface DrafterResponsePackage {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
}

/** What the drafter renders: the received letter, its parsed issues, and any
 *  response packages filed against it — all read from the correspondence
 *  record. There is no stored per-issue response prose to show. */
export interface DrafterView {
  letter: DrafterLetterDoc;
  deficiencies: Deficiency[];
  packages: DrafterResponsePackage[];
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/* The issue parser's severities (device-issue-taxonomy): low | medium | high |
   critical. The drafter distinguishes two; a blocker is always major. */
const MAJOR = new Set(['critical', 'high', 'major']);

function ctdRefs(v: unknown): CorrespondenceRef[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .map((section) => ({ section, label: `CTD ${section}` }));
}

function toDeficiency(iss: CorrespondenceIssue, i: number): Deficiency {
  const r = iss as Record<string, unknown>;
  return {
    id: String(iss.id),
    n: i + 1,
    title: [text(r.category), text(r.subcategory)].filter(Boolean).join(' · ') || 'Issue',
    body: text(r.source_excerpt) ?? text(r.issue_text) ?? text(r.summary) ?? '',
    refs: ctdRefs(r.mapped_ctd_sections),
    regs: [],
    severity: r.blocker === true || MAJOR.has(String(r.severity ?? '').toLowerCase()) ? 'major' : 'minor',
    complete: String(r.resolution_status ?? '') === 'resolved',
  };
}

/** Map a live correspondence detail read. null when the read carried no row. */
export function toDrafterView(detail: LiveCorrespondenceDetail): DrafterView | null {
  const row = detail.data as Record<string, unknown> | null;
  if (!row) return null;
  const body = (text(row.parsed_text) ?? text(row.summary) ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const letter: DrafterLetterDoc = {
    from_name: text(row.sender) ?? '—',
    ...(text(row.source_channel) ? { via: text(row.source_channel), from_office: text(row.source_channel) } : {}),
    ...(text(row.received_at) ? { received_at: text(row.received_at), dated: text(row.received_at) } : {}),
    body,
  };
  return {
    letter,
    deficiencies: detail.issues.map(toDeficiency),
    packages: detail.responsePackages.map((p) => {
      const pr = p as Record<string, unknown>;
      return {
        id: String(pr.id),
        title: text(pr.title) ?? 'Response package',
        status: text(pr.status) ?? 'draft',
        ...(text(pr.created_at) ? { createdAt: text(pr.created_at) } : {}),
      };
    }),
  };
}
