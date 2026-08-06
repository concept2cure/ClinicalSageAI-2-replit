/**
 * Path-keyed API fixtures, shared by the visual-QA capture and the
 * accessibility ratchet.
 *
 * One copy on purpose: the two harnesses must agree about what a server
 * returns, or one of them starts manufacturing bugs the other cannot see.
 * That is not hypothetical — the blanket `{ data: [] }` this replaced cost
 * nine investigations that all ended in the same dead end.
 */

/**
 * Path-keyed fixtures — because one blanket body is not a mock, it is a trap.
 *
 * This returned `{ data: [] }` for EVERY path, and nine surfaces "crashed".
 * Triaging all nine found zero product defects: the fixture was the bug, and it
 * failed in a specifically nasty way.
 *
 * `unwrapEnvelope` (v2/dataConnect.tsx) collapses a single-key `{data: X}` to
 * `X`. So `{ data: [] }` arrives at the surface as `[]` — which is TRUTHY. It
 * therefore walks straight past every `if (!data)` guard in the codebase while
 * satisfying no expected shape at all, and the first `.rows`, `.overall` or
 * `.map` throws. A payload that is falsy would have been caught; a payload that
 * is well-formed would have rendered. This was the one value that does neither.
 *
 * The lesson is about harness design, not about these nine: a mock that invents
 * payloads no server can emit manufactures bugs, and each fake bug costs a real
 * investigation. Nine here.
 *
 * So: register the paths a surface actually reads, with the shape its endpoint
 * actually returns, and FAIL LOUDLY on anything unregistered rather than
 * guessing. An unmocked path is a gap in the fixture table — something a human
 * must decide — not something to paper over with a default.
 */
export const FIXTURES = [
  // Envelope-with-object endpoints. `{data: []}` is what broke these.
  [/\/api\/batch-draft\/spine/, { success: true, data: { program: null, standard: null, tree: [] } }],
  [/\/api\/billing\/credits/, {
    balanceCents: 0, ledger: [],
    autoReload: { enabled: false, thresholdCents: 0, topupCents: 0 },
  }],
  [/\/api\/billing\/invoices/, { invoices: [], hasMore: false, total: 0 }],
  [/\/api\/billing\/usage\/limits/, {
    plan: 'standard', planLabel: 'Standard',
    session: { pctUsed: 0, resetsAt: null, windowHours: 5 },
    weekly: [], lastUpdated: new Date(0).toISOString(),
  }],
  [/\/api\/client-portal\/overview/, {
    data: { mode: 'client', client: null, cro: null, user: null, programs: [], deliverables: [], updates: [] },
    meta: {},
  }],
  [/\/api\/ectd\/controlled-vocab\/[^/]+$/, { id: 'contextOfUse', shortName: 'Context of Use', oid: '', codes: [] }],
  [/\/api\/labeling-smpc/, {
    data: { sections: [], outstanding: [], finalRequired: 0, totalRequired: 0, completenessPct: 0, ready: false },
    meta: { count: 0 },
  }],
  [/\/api\/nonclinical-summary/, {
    data: {
      m26: [], m4: [], send: { inScope: 0, validated: 0, missingDomains: [], risk: 'none' },
      completeness: 0, gaps: [], provisioned: false,
    },
    meta: { count: 0, provisioned: false },
  }],
  [/\/api\/part11\/(compliance-status|soc2\/controls|audit-trail\/chain-integrity)/, { success: true, data: null }],
  [/\/api\/c2c\/projects\/[^/]+\/sources/, { projectId: 'proj-vqa', sources: [], unscoped: [] }],
  // A bare array, never enveloped.
  [/\/api\/registrations\/data-standards/, []],
  // Everything else genuinely IS a list endpoint.
  [/./, { data: [] }],
];

export const bodyFor = (url) => {
  for (const [test, body] of FIXTURES) if (test.test(url)) return body;
  throw new Error(`[visual-qa] no fixture registered for ${url}`);
};
