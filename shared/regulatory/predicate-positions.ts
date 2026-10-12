/**
 * The predicate strategy a 510(k) programme takes, as positions
 * (founder's directive, 2026-10-12).
 *
 * ── Why this is its own question ────────────────────────────────────────────
 * Every 510(k) rests on a predicate, and which predicate — and how many —
 * decides what the submission has to argue. The interview asked for the
 * predicate's NAME, its 510(k) number and its manufacturer as three required
 * text fields, and never asked the question those answers presuppose: whether
 * there is a predicate at all.
 *
 * That gap reached further than this flow. The marking rules
 * (`pathway-cautions.ts`) could say "you have named a predicate, so a De Novo
 * needs a basis", but could not say the stronger and more useful thing — *you
 * have said there is no predicate, so a 510(k) is not the route* — because
 * nothing in any interview could state it. An empty text box is an unanswered
 * question, not a statement, and a rule nothing can reach reads as a check
 * that passes. This is where that fact comes from.
 *
 * ── What the positions are ──────────────────────────────────────────────────
 * Unlike the route positions, these are not registry filings: they are the
 * strategies FDA's own 510(k) programme recognises, and the authority for each
 * is the regulation or the guidance that recognises it. The split predicate is
 * among them BECAUSE sponsors consider it and FDA does not accept it — a
 * position that says plainly what taking it costs is worth more than its
 * absence, which teaches nobody anything.
 *
 * @module shared/regulatory/predicate-positions
 */

/** What a programme says about the device it is comparing itself to. */
export type PredicateStrategy =
  | 'single_predicate'
  | 'multiple_predicates'
  | 'split_predicate'
  | 'reference_device_only'
  | 'no_predicate'
  | 'nse_received';

export interface PredicatePosition {
  value: PredicateStrategy;
  label: string;
  /** What taking this position commits the submission to. Consequence first. */
  commits: string;
  /** The regulation or guidance that recognises it — or, for the split predicate, refuses it. */
  authority: string;
}

/**
 * What each strategy commits a submission to. Nothing here is written by a
 * model, and each entry's authority is the part or guidance it comes from.
 */
const POSITIONS: readonly PredicatePosition[] = [
  {
    value: 'single_predicate',
    label: 'One predicate',
    commits:
      'Substantial equivalence to a single legally marketed device with the same intended use: every technological difference is bridged to that one device, and the comparison carries the whole submission.',
    authority: '21 CFR 807.87(f), 807.100(b); FDA, The 510(k) Program: Evaluating Substantial Equivalence (2014)',
  },
  {
    value: 'multiple_predicates',
    label: 'A primary predicate and additional predicates',
    commits:
      'A primary predicate for the intended use, with further predicates for separate technological features — each of which must itself have the same intended use. It widens what you may rely on and widens what FDA will compare.',
    authority: 'FDA, The 510(k) Program: Evaluating Substantial Equivalence (2014), § V',
  },
  {
    value: 'split_predicate',
    label: 'A split predicate — indications from one device, technology from another',
    commits:
      'FDA does not accept this. The 2014 substantial-equivalence guidance states that a split predicate is not a permissible basis, so naming one invites a Refuse to Accept decision or a finding of not substantially equivalent. If the indications and the technology come from different devices, the honest readings are a De Novo or a new intended use.',
    authority: 'FDA, The 510(k) Program: Evaluating Substantial Equivalence (2014) — split predicates not permitted',
  },
  {
    value: 'reference_device_only',
    label: 'A reference device for supporting data, with no predicate claimed',
    commits:
      'A reference device supports a method, a standard or a test approach; it is not a basis for substantial equivalence. On its own it is not a 510(k): a predicate is still to be named, or another route taken.',
    authority: 'FDA, The 510(k) Program: Evaluating Substantial Equivalence (2014) — reference devices',
  },
  {
    value: 'no_predicate',
    label: 'There is no legally marketed device to compare to',
    commits:
      'A 510(k) is a comparison, so with nothing to compare to there is no 510(k) to make. This is the first of the two conditions for a De Novo request, which asks FDA to classify the device and to hold it to special controls you propose.',
    /* The DIRECT De Novo — a request without a 510(k) first — is the (ii)
       condition. This cited (i), which is the post-NSE route, and cited
       860.220(a), which is the request's content and format rather than who
       may make one; the regulation is cited at subpart level because this
       module will not state a section it has not verified. */
    authority: 'FD&C Act 513(f)(2)(A)(ii); 21 CFR 860 Subpart D',
  },
  {
    value: 'nse_received',
    label: 'FDA has already found the device not substantially equivalent',
    commits:
      'An NSE determination on a 510(k) you have filed is the second condition for a De Novo request. The 510(k) is closed; what follows is the classification request, and the NSE letter is part of its record.',
    /* An NSE determination on a 510(k) already filed is the (i) condition. */
    authority: 'FD&C Act 513(f)(2)(A)(i); 21 CFR 860 Subpart D',
  },
];

/** The strategies that state there is no predicate to compare to. */
export const WITHOUT_PREDICATE: readonly PredicateStrategy[] = ['no_predicate', 'nse_received'];

/** Every position, in the order a submission would consider them. */
export function predicatePositions(): readonly PredicatePosition[] {
  return POSITIONS;
}

/** The positions as a question's options — the shape a flow puts in a field. */
export function predicateOptions(): Array<{ value: string; label: string; commits: string; authority: string }> {
  return POSITIONS.map(position => ({ ...position, value: String(position.value) }));
}

/** One position, or null for a value this module does not hold. */
export function predicatePositionFor(value: string): PredicatePosition | null {
  return POSITIONS.find(position => position.value === value) ?? null;
}

/**
 * What the answers say about the device being compared to: a predicate named,
 * none at all, or an NSE already received. Null where nothing was said —
 * which is not the same as "there is none", and must not be read as it.
 */
export function predicateStateOf(input: {
  strategy?: string | null;
  named?: string | null;
}): 'named' | 'none' | 'nse' | null {
  const strategy = typeof input.strategy === 'string' ? input.strategy.trim() : '';
  if (strategy === 'no_predicate') return 'none';
  if (strategy === 'nse_received') return 'nse';
  if (typeof input.named === 'string' && input.named.trim()) return 'named';
  if (strategy === 'single_predicate' || strategy === 'multiple_predicates' || strategy === 'split_predicate') {
    return 'named';
  }
  /* 'reference_device_only' says a predicate has NOT been claimed, but it does
     not say none exists — the sponsor may still name one. Nothing is read
     from it. */
  return null;
}
