/**
 * Client-type (industry) profiles — the PURE preset table for the vertical axis.
 *
 * The platform has ONE self-tailoring workspace (see workspace-config.ts). The
 * client's industry does not fork that workspace — it PRESETS it. Each industry
 * maps to a coarse vertical (MDX / Biopharma / PDEV) that carries defaults the
 * (separately built) UI renders as a "vertical workspace": the persona emphasis
 * the co-author leans into, the terminology the shell speaks, the default
 * approval rigor, and the document type a new project starts from.
 *
 * This is deliberately small and pure (no DB). Server-only client-type data —
 * license entitlements, enabled modules — is overlaid by the enrichment service
 * (server/services/regulatory/workspace-config-enrichment.ts), never here.
 *
 * @module shared/regulatory/client-type-profiles
 */

/** The org's industry, as stored on `organizations.industry_mode`. */
export type IndustryMode =
  | 'biotech'
  | 'pharma'
  | 'cro'
  | 'medtech'
  | 'academic'
  | 'regulatory'
  | 'medical_writing';

/** The coarse vertical a "special workspace" presets to. */
export type Vertical = 'mdx' | 'biopharma' | 'pdev';

/** Default approval rigor for a new artifact (mirrors the document-contract values). */
export type ApprovalRigor =
  | 'single_reviewer'
  | 'regulated_dual_review'
  | 'qa_lock'
  | 'signoff_required';

export interface ClientTypeProfile {
  industry: IndustryMode;
  /** The vertical workspace this industry presets to. */
  vertical: Vertical;
  /** AI co-author emphasis for this industry (mirrors lumen-context-builder). */
  personaEmphasis: string;
  /** Label overrides the shell speaks for this industry. */
  terminology: Record<string, string>;
  /** Default approval rigor a new artifact starts at. */
  defaultApprovalPath: ApprovalRigor;
  /** Document type a new project defaults to selecting. */
  defaultNeed: string;
}

const PROFILES: Record<IndustryMode, ClientTypeProfile> = {
  medtech: {
    industry: 'medtech',
    vertical: 'mdx',
    personaEmphasis:
      '510(k) / PMA / De Novo pathways, ISO 13485 & ISO 14971, IEC 62304/62366, and design controls.',
    terminology: { product: 'Device', submission: 'Submission' },
    defaultApprovalPath: 'regulated_dual_review',
    defaultNeed: 'US_510K',
  },
  biotech: {
    industry: 'biotech',
    vertical: 'biopharma',
    personaEmphasis: 'IND / NDA / BLA pathways, ICH guidelines, and CTD structure.',
    terminology: { product: 'Program', submission: 'Submission' },
    defaultApprovalPath: 'regulated_dual_review',
    defaultNeed: 'US_IND',
  },
  pharma: {
    industry: 'pharma',
    vertical: 'biopharma',
    personaEmphasis: 'IND / NDA / BLA pathways, ICH guidelines, CTD structure, and lifecycle management.',
    terminology: { product: 'Program', submission: 'Submission' },
    defaultApprovalPath: 'regulated_dual_review',
    defaultNeed: 'US_NDA',
  },
  cro: {
    industry: 'cro',
    vertical: 'biopharma',
    personaEmphasis: 'multi-sponsor workflows, SOW compliance, and study management.',
    terminology: { product: 'Study', submission: 'Deliverable', client: 'Sponsor' },
    defaultApprovalPath: 'signoff_required',
    defaultNeed: 'US_IND',
  },
  academic: {
    industry: 'academic',
    vertical: 'biopharma',
    personaEmphasis: 'investigator-initiated IND requirements, IRB processes, and grant compliance.',
    terminology: { product: 'Study', submission: 'Submission' },
    defaultApprovalPath: 'single_reviewer',
    defaultNeed: 'US_IND',
  },
  regulatory: {
    industry: 'regulatory',
    vertical: 'biopharma',
    personaEmphasis: 'balanced, cross-pathway regulatory strategy across drug and device frameworks.',
    terminology: { product: 'Program', submission: 'Submission' },
    defaultApprovalPath: 'regulated_dual_review',
    defaultNeed: 'US_IND',
  },
  medical_writing: {
    industry: 'medical_writing',
    vertical: 'biopharma',
    personaEmphasis: 'document authoring, style/template compliance, and CSR/CER quality.',
    terminology: { product: 'Document', submission: 'Document' },
    defaultApprovalPath: 'regulated_dual_review',
    defaultNeed: 'CSR',
  },
};

/** The profile for an industry, or null when unrecognized. */
export function getClientTypeProfile(industry: string): ClientTypeProfile | null {
  const key = (industry ?? '').trim().toLowerCase() as IndustryMode;
  return PROFILES[key] ?? null;
}

/** The vertical an industry presets to, or null when unrecognized. */
export function verticalForIndustry(industry: string): Vertical | null {
  return getClientTypeProfile(industry)?.vertical ?? null;
}

/** `organizations.client_type`, the client category the shell's lane and AnA's welcome read. */
export type ClientType = 'medtech' | 'biotech' | 'pharma' | 'diagnostics' | 'cro' | 'health';

/**
 * The client type a sign-up states, or null when its industry names none unambiguously.
 * Null leaves the column at its default. A device company that says it works in IVD is
 * diagnostics. Regulatory consultancies, academia and medical writing serve every
 * category, so they state none.
 *
 * Sign-up stored `industry_mode` and never this. So every self-serve organisation started
 * as 'pharma', a device company included (the slice 0 launch walk,
 * docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice0/README.md).
 */
export function clientTypeForSignup(industry: string, mdxSpecialization?: string | null): ClientType | null {
  switch ((industry ?? '').trim().toLowerCase()) {
    case 'medtech':
      return mdxSpecialization === 'ivd_diagnostics' ? 'diagnostics' : 'medtech';
    case 'biotech':
      return 'biotech';
    case 'pharma':
      return 'pharma';
    case 'cro':
      return 'cro';
    default:
      return null;
  }
}

export default { getClientTypeProfile, verticalForIndustry, clientTypeForSignup };
