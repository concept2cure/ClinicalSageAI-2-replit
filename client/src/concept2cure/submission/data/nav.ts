// Submission gateway nav — the agency-transmission workstream. Surfaces are
// backed by server/routes/mdx-submission-gateway.ts at /api/mdx/gateways. This
// is the transmittal / ACK / pre-flight-findings layer over FDA ESG, EMA CESP,
// EUDAMED, and PMDA Gateway — NOT the package/section/readiness management the
// 'submissions' layoutMode already owns.

export interface SubmissionNavItem {
  id: string;
  label: string;
  icon: string;
}

export const SUBMISSION_NAV: SubmissionNavItem[] = [
  { id: 'overview',     label: 'Submission center', icon: 'send' },
  { id: 'transmittals', label: 'Transmittals',      icon: 'globe' },
  { id: 'validation',   label: 'Pre-flight',        icon: 'shield' },
];

export const HERE_LABEL_SUBMISSION: Record<string, string> = {
  overview:     'Submission center',
  transmittals: 'Transmittals',
  validation:   'Pre-flight',
};

// ── Gateway + region display labels ──────────────────────────────────────────
// The API returns raw region + gateway enum values; these maps carry the
// human-readable labels so the surfaces never hard-code agency strings.

export const REGION_LABEL: Record<string, string> = {
  fda:  'United States',
  ema:  'European Union',
  pmda: 'Japan',
};

export const GATEWAY_LABEL: Record<string, string> = {
  esg:          'FDA ESG',
  cesp:         'EMA CESP',
  eudamed:      'EUDAMED',
  pmda_gateway: 'PMDA Gateway',
};

export function gatewayLabel(gateway: string): string {
  return GATEWAY_LABEL[gateway] ?? gateway;
}

export function regionLabel(region: string): string {
  return REGION_LABEL[region] ?? region;
}

// ── Status taxonomy ──────────────────────────────────────────────────────────
// submission_transmittals.status maps to one stage label; the label carries the
// meaning so a row's state never depends on color alone.

export const STATUS_LABEL: Record<string, string> = {
  pending:           'Pending',
  in_transit:        'In transit',
  received:          'Received',
  rejected:          'Rejected',
  ack1_received:     'ACK1 received',
  ack2_received:     'ACK2 received',
  ack3_received:     'ACK3 received',
  validation_passed: 'Validation passed',
  validation_failed: 'Validation failed',
  review_started:    'In agency review',
  response_required: 'Response required',
  completed:         'Completed',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[(status || '').toLowerCase()] ?? status;
}

// A transmittal is "in flight" while it is on the wire, awaiting ACKs, or under
// review — i.e. not yet a terminal accepted / rejected / completed state.
export function isInFlight(status: string): boolean {
  const v = (status || '').toLowerCase();
  return (
    v === 'in_transit' ||
    v === 'received' ||
    v === 'ack1_received' ||
    v === 'ack2_received' ||
    v === 'ack3_received' ||
    v === 'validation_passed' ||
    v === 'review_started' ||
    v === 'response_required'
  );
}

export function isRejected(status: string): boolean {
  const v = (status || '').toLowerCase();
  return v === 'rejected' || v === 'validation_failed';
}

// FDA ACK chain — the receipt levels reached by a transmittal's status. Used to
// render the ACK 1/2/3 lights. Each level is reached at or after its status.
export function ackLevels(status: string): { a1: AckState; a2: AckState; a3: AckState } {
  const v = (status || '').toLowerCase();
  if (v === 'rejected' || v === 'validation_failed') {
    // Receipt happened but a later level failed — surface ACK1 received, and the
    // failing level as failed. We cannot know which level failed from status
    // alone, so flag ACK2 (virus/structure) as failed by convention.
    return { a1: 'received', a2: 'failed', a3: 'na' };
  }
  const rank: Record<string, number> = {
    pending: 0,
    in_transit: 0,
    received: 1,
    ack1_received: 1,
    ack2_received: 2,
    validation_passed: 2,
    ack3_received: 3,
    review_started: 3,
    response_required: 3,
    completed: 3,
  };
  const r = rank[v] ?? 0;
  const at = (level: number): AckState => (r >= level ? 'received' : 'pending');
  return { a1: at(1), a2: at(2), a3: at(3) };
}

export type AckState = 'received' | 'pending' | 'failed' | 'na';

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const SUBMISSION_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Show the status of every in-flight transmittal across agencies',
    'Which transmittals were rejected and need to be re-transmitted',
    'Summarize what needs my attention in the submission center right now',
  ],
  transmittals: [
    'List every transmittal awaiting an acknowledgement from FDA ESG',
    'Why did the most recent EMA CESP transmittal fail validation',
    'Which programs have a transmittal in agency review right now',
  ],
  validation: [
    'Show every open pre-flight finding I still need to clear',
    'Explain the highest-severity validation finding and how to fix it',
    'Which transmittals are blocked by unresolved errors',
  ],
};
