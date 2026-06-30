/**
 * Client-type configurations — Phase 10.2 (docs/legacy/PHASE_10_2_INSTALL.md §3.1).
 *
 * One shell, three tenant types. The tenant type drives: rail filter,
 * tab filter, Overview greeting state + starters, and AnA dock suggestion
 * scope. In v2 the active type comes from `organizations.client_type`
 * (read via GET /api/users/me → organizationClientType) — the kit-only
 * top-bar switcher is stripped per the brief.
 *
 * Port of ui_kits/biopharma/data.jsx > CLIENT_TYPES.
 *
 * @module client/src/concept2cure/biopharma/data/clientTypes
 */

export type ClientType = 'medtech' | 'biotech' | 'pharma';

export interface ClientTypeOverview {
  /** First-line state-of-portfolio summary (sample copy — live surfaces
   *  derive their state line from live program data and only fall back to
   *  this with a visible sample-data label). */
  greetingState: string;
  /** Four conversational starters for the Overview composer. */
  starters: string[];
}

export interface ClientTypeConfig {
  label: string;
  domainLabel: string;
  /** Allowed rail/tab ids in the workstream group. Empty = use MDX instead. */
  workstream: string[];
  /** Allowed rail ids in the lifecycle group. */
  lifecycle: string[];
  /** Medtech only — tenants of this type are redirected to the MDX shell. */
  redirectTo?: string;
  overview: ClientTypeOverview;
}

export const CLIENT_TYPES: Record<ClientType, ClientTypeConfig> = {
  medtech: {
    label: 'Medical device and diagnostics',
    domainLabel: 'Medical Device and Diagnostics',
    /* Medtech tenants use the MDX shell for their primary domain; this entry
     * exists so the chassis stays generic. Empty workstream means "use MDX". */
    workstream: [],
    lifecycle: [],
    redirectTo: '/mdx',
    overview: {
      greetingState:
        'Two 510(k) submissions in review, three IVDR audits in flight, and post-market signals queued.',
      starters: [
        '30-second status on each device for the 9 AM standup',
        'Triage every open MDR across the portfolio',
        'What overnight from FDA, EU Notified Body, MHRA?',
        'Show me every blocker on the 510(k) pipeline',
      ],
    },
  },
  biotech: {
    label: 'Biotech',
    domainLabel: 'Biotech',
    /* Biotech-specific: biologics (BLA), gene/cell therapy (ATMP), heavy
     * orphan/rare focus, breakthrough designations, fewer NDAs. */
    workstream: ['overview', 'ind', 'bla', 'maa', 'jnda', 'precedent'],
    lifecycle: ['cmc', 'clinical', 'pharmacov', 'pediatric', 'orphan', 'meetings', 'biostat'],
    overview: {
      greetingState:
        'BX-301 BLA assembly · 64% ready. BX-256 gene therapy pre-IND in 28 days. BX-420 PIP modification pending CHMP advice.',
      starters: [
        'Open the active BLA — show comparability gaps with the new DS supplier',
        'Status of every orphan designation across the portfolio',
        'Prep the next pre-IND briefing book',
        'What FDA breakthrough designations could our lead program qualify for?',
      ],
    },
  },
  pharma: {
    label: 'Pharma',
    domainLabel: 'Pharma',
    /* Pharma-specific: small molecules (NDA), generic/biosimilar variations,
     * heavy lifecycle (PSUR, supplements, label updates), large portfolios. */
    workstream: ['overview', 'ind', 'nda', 'maa', 'jnda', 'lifecycle', 'precedent'],
    lifecycle: ['cmc', 'clinical', 'pharmacov', 'pediatric', 'biostat', 'meetings'],
    overview: {
      greetingState:
        'NDA 212345 (BX-204) · 41 days to PDUFA. Two PSUR cycles open. CMC supplement for BX-099 filed yesterday.',
      starters: [
        '30-second status on each program for the 9 AM CMO standup',
        'Why is our lead NDA readiness stuck?',
        'List every CMC change-control in flight across the portfolio',
        'Compile the next PSUR §15 risk-evaluation update',
      ],
    },
  },
};

/** Normalize an arbitrary string (org row / legacy localStorage) to a known
 *  client type, defaulting to pharma — the migration default. */
export function asClientType(value: string | null | undefined): ClientType {
  return value === 'medtech' || value === 'biotech' || value === 'pharma' ? value : 'pharma';
}

export function getClientTypeConfig(value: string | null | undefined): ClientTypeConfig {
  return CLIENT_TYPES[asClientType(value)];
}
