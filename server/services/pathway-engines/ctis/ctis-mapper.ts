/**
 * CTIS pathway engine (EU clinical-trial applications — CTR 536/2014)
 *
 * Maps the canonical submission's content (leaves) onto the CTIS dossier
 * structure: Part I (assessed jointly by all concerned Member States) and
 * Part II (assessed per Member State). Produces a completeness report so a
 * sponsor sees CTIS-readiness before touching the portal.
 *
 * CTIS is a STRUCTURED PORTAL, not eCTD (spec §3) — this is a projection of the
 * one canonical core into CTIS's field structure. It does NOT submit; it maps
 * and gap-checks.
 *
 * THE SLOTS ARE THE ROWS OF `CTR_ANNEX_I` (./ctr-annex-i.ts) — there is no
 * second list here. A slot is satisfied only by:
 *   - Part I:  a leaf whose section code (trimmed, lower-cased) equals the
 *              row's `ctisSlug`, or whose documentType is one the row lists;
 *   - Part II: for state X, a leaf at `part-ii.<x>.<segment>`. A Part II
 *              document that carries no state (filed at the state-less slug, or
 *              recognised only by its documentType) is UNDETERMINED for every
 *              state — never present, because one German consent form does not
 *              clear France.
 * Section-code prefixes and title words are never read: a CSR at 5.3.5.1 is not
 * a protocol, a 3.2.P leaf is not GMP evidence, a Form FDA 356h is not the EU
 * application form, and "pipeline" is not a PIP.
 *
 * `ready` is false while anything required is missing OR undetermined — the
 * same rule as the eSTAR engine (W1-5): a question nobody answered is not a
 * section nobody needs. "If applicable" rows are undetermined until filed or
 * recorded not-applicable via `notApplicable`.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM.
 *
 * @module server/services/pathway-engines/ctis/ctis-mapper
 */

import {
  CTR_ANNEX_I_PART_I,
  CTR_ANNEX_I_PART_II,
  partIISegment,
  type CtrAnnexIRow,
} from './ctr-annex-i';

/** A canonical leaf as CTIS-mapping input (subset of the submission leaf). */
export interface CtisInputLeaf {
  sectionCode: string;
  title: string;
  /** Optional document-type id (e.g. 'clinical_protocol', 'investigator_brochure'). */
  documentType?: string;
}

export type CtisPart = 'I' | 'II';

/**
 * - present:             a leaf satisfies the slot (for this state).
 * - missing:             a required row with nothing filed.
 * - undetermined:        an "if applicable" row nobody answered, or a Part II
 *                        document whose Member State cannot be told. Blocks ready.
 * - not-applicable:      the sponsor recorded that the row does not apply.
 * - check-applicability: a conditional row (AxMP, advice, PIP, samples) with
 *                        nothing filed; reported for a human, does not block.
 */
export type CtisSlotState = 'present' | 'missing' | 'undetermined' | 'not-applicable' | 'check-applicability';

export interface CtisSlot {
  id: string;
  label: string;
  part: CtisPart;
  /** Annex I heading letter (or 'Art 7(1)(h)'). */
  letter: string;
  /** The row's requirement kind (see ctr-annex-i.ts). */
  requirement: CtrAnnexIRow['requirement']['kind'];
  /** True when the slot must be filed for readiness: not conditional, and not recorded not-applicable. */
  required: boolean;
}

export interface CtisSlotStatus extends CtisSlot {
  present: boolean;
  status: CtisSlotState;
  /** The placement that satisfies this slot (Part II: with this state's code). */
  expectedSlug: string;
  /** Section codes / titles of the leaves that satisfied this slot. */
  sources: string[];
}

export interface CtisPartIIByState {
  memberState: string;
  slots: CtisSlotStatus[];
  missingRequired: string[];
  undetermined: string[];
}

export interface CtisDossier {
  partI: CtisSlotStatus[];
  partII: CtisPartIIByState[];
  summary: {
    partIMissingRequired: string[];
    partIUndetermined: string[];
    partIIMissingByState: Record<string, string[]>;
    partIIUndeterminedByState: Record<string, string[]>;
    /** Conditional slots with nothing filed, as `I:<id>` / `II:<MS>:<id>`, for a human to confirm. */
    checkApplicability: string[];
    /** True only when no required slot is missing and none is undetermined, in Part I and in every state's Part II. */
    ready: boolean;
  };
}

export interface MapToCtisInput {
  leaves: CtisInputLeaf[];
  /** ISO/EU member-state codes the application targets (e.g. ['DE','FR']). */
  memberStates: string[];
  /**
   * Rows the sponsor has recorded as not applicable, as `I:<slot-id>` or
   * `II:<MS>:<slot-id>` (the same form as assessPathwayReadiness reports gaps).
   * Ignored for required rows: a required Annex I document cannot be waived.
   */
  notApplicable?: string[];
}

const canon = (code: string | undefined | null): string => (code ?? '').trim().toLowerCase();

/** `part-ii.<state>.<segment>` — a Part II placement that names its state. */
const STATE_PLACED = /^part-ii\.[a-z0-9-]+\.[a-z0-9-]+$/;

const naKey = (part: CtisPart, id: string, ms?: string): string =>
  part === 'I' ? `I:${id}` : `II:${(ms ?? '').toUpperCase()}:${id}`;

function normaliseNotApplicable(raw: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const k of Array.isArray(raw) ? raw : []) {
    if (typeof k !== 'string') continue;
    const parts = k.trim().split(':');
    if (parts[0] === 'I' && parts.length === 2) out.add(naKey('I', parts[1]));
    else if (parts[0] === 'II' && parts.length === 3) out.add(naKey('II', parts[2], parts[1]));
  }
  return out;
}

function baseOf(row: CtrAnnexIRow): Omit<CtisSlot, 'required'> {
  return { id: row.id, label: row.title, part: row.part, letter: row.letter, requirement: row.requirement.kind };
}

function decide(
  row: CtrAnnexIRow,
  present: boolean,
  statelessEvidence: boolean,
  markedNotApplicable: boolean,
): CtisSlotState {
  if (present) return 'present';
  const kind = row.requirement.kind;
  if (markedNotApplicable && kind !== 'required') return 'not-applicable';
  if (statelessEvidence) return 'undetermined';
  if (kind === 'required') return 'missing';
  if (kind === 'if-applicable') return 'undetermined';
  return 'check-applicability';
}

function statusOf(
  row: CtrAnnexIRow,
  expectedSlug: string,
  satisfying: CtisInputLeaf[],
  statelessEvidence: boolean,
  markedNotApplicable: boolean,
): CtisSlotStatus {
  const present = satisfying.length > 0;
  const status = decide(row, present, statelessEvidence, markedNotApplicable);
  return {
    ...baseOf(row),
    required: row.requirement.kind !== 'conditional' && status !== 'not-applicable',
    present,
    status,
    expectedSlug,
    sources: satisfying.map((l) => l.sectionCode || l.title),
  };
}

function evalPartI(row: CtrAnnexIRow, leaves: CtisInputLeaf[], na: Set<string>): CtisSlotStatus {
  const satisfying = leaves.filter(
    (l) => canon(l.sectionCode) === row.ctisSlug || (!!l.documentType && row.documentTypes.includes(l.documentType)),
  );
  return statusOf(row, row.ctisSlug, satisfying, false, na.has(naKey('I', row.id)));
}

function evalPartII(row: CtrAnnexIRow, ms: string, leaves: CtisInputLeaf[], na: Set<string>): CtisSlotStatus {
  const expected = `part-ii.${ms.toLowerCase()}.${partIISegment(row)}`;
  const satisfying = leaves.filter((l) => canon(l.sectionCode) === expected);
  const statelessEvidence = leaves.some((l) => {
    const code = canon(l.sectionCode);
    if (code === row.ctisSlug) return true;
    return !!l.documentType && row.documentTypes.includes(l.documentType) && !STATE_PLACED.test(code);
  });
  return statusOf(row, expected, satisfying, statelessEvidence, na.has(naKey('II', row.id, ms)));
}

const idsWith = (slots: CtisSlotStatus[], status: CtisSlotState): string[] =>
  slots.filter((s) => s.status === status).map((s) => s.id);

/** Map canonical leaves onto the CTIS Part I / Part II dossier with a gap report. */
export function mapToCtis(input: MapToCtisInput): CtisDossier {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const memberStates = (Array.isArray(input.memberStates) ? input.memberStates : [])
    .filter((ms): ms is string => typeof ms === 'string')
    .map((ms) => ms.trim())
    .filter(Boolean);
  const na = normaliseNotApplicable(input.notApplicable);

  const partI = CTR_ANNEX_I_PART_I.map((row) => evalPartI(row, leaves, na));
  const partIMissingRequired = idsWith(partI, 'missing');
  const partIUndetermined = idsWith(partI, 'undetermined');
  const checkApplicability = idsWith(partI, 'check-applicability').map((id) => `I:${id}`);

  const partIIMissingByState: Record<string, string[]> = {};
  const partIIUndeterminedByState: Record<string, string[]> = {};
  const partII: CtisPartIIByState[] = memberStates.map((ms) => {
    const slots = CTR_ANNEX_I_PART_II.map((row) => evalPartII(row, ms, leaves, na));
    const missingRequired = idsWith(slots, 'missing');
    const undetermined = idsWith(slots, 'undetermined');
    partIIMissingByState[ms] = missingRequired;
    partIIUndeterminedByState[ms] = undetermined;
    checkApplicability.push(...idsWith(slots, 'check-applicability').map((id) => `II:${ms}:${id}`));
    return { memberState: ms, slots, missingRequired, undetermined };
  });

  const ready =
    memberStates.length > 0 &&
    partIMissingRequired.length === 0 &&
    partIUndetermined.length === 0 &&
    partII.every((st) => st.missingRequired.length === 0 && st.undetermined.length === 0);

  return {
    partI,
    partII,
    summary: {
      partIMissingRequired,
      partIUndetermined,
      partIIMissingByState,
      partIIUndeterminedByState,
      checkApplicability,
      ready,
    },
  };
}

export default { mapToCtis };
