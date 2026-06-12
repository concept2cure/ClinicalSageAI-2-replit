/**
 * Deterministic cheminformatics — SMILES validation + structural-alert screen.
 *
 * A small, dependency-free layer that turns a SMILES string into (a) a syntactic
 * validity verdict with a heavy-atom inventory and (b) a screen for well-known
 * mutagenic/carcinogenic structural alerts relevant to ICH M7(R2) — most
 * importantly the N-nitrosamine motif, the current regulatory hot button.
 *
 * HONESTY BOUNDARY. This is a substructure *screen*, not a validated (Q)SAR
 * system. ICH M7(R2) expects a hazard assessment from two complementary
 * methodologies (an expert rule-based system such as Derek Nexus and a
 * statistical model such as Sarah Nexus) with expert review. Use this to flag
 * structures for that review and to make the regulatory conversation concrete —
 * never as the M7 classification itself. The nitrosamine and azide detectors are
 * high-confidence (unambiguous motifs); the aromatic-amine / Michael-acceptor /
 * epoxide / aldehyde detectors are heuristic substring matches and are labeled
 * `moderate`/`low` accordingly.
 *
 * No external toolkit is used, so molecular weight / logP / PSA are intentionally
 * NOT computed here (an implicit-hydrogen + aromaticity model is required to do
 * that correctly). Those physicochemical descriptors come from the curated
 * ChEMBL record via the developability reader; this module owns only what can be
 * computed exactly and deterministically from the SMILES itself.
 *
 * @module server/services/chem/structural-alerts
 */

/** Average atomic weights (g/mol) for the common organic subset + frequent heteroatoms. */
const ATOMIC_WEIGHT: Record<string, number> = {
  H: 1.008,
  B: 10.811,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Na: 22.99,
  Mg: 24.305,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  K: 39.098,
  Ca: 40.078,
  Br: 79.904,
  I: 126.904,
};

/** Two-character element symbols recognized outside brackets (order matters for the scanner). */
const TWO_CHAR_ORGANIC = ['Cl', 'Br'];
/** Single-character organic-subset symbols valid without brackets. */
const ONE_CHAR_ORGANIC = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'I']);
/** Aromatic lowercase atoms valid without brackets. */
const AROMATIC_ORGANIC = new Set(['b', 'c', 'n', 'o', 'p', 's']);

export type AlertConfidence = 'high' | 'moderate' | 'low';

export interface StructuralAlert {
  /** Stable id, e.g. "n_nitrosamine". */
  id: string;
  /** Human-readable alert name. */
  name: string;
  /** Broad class, e.g. "mutagenicity". */
  category: string;
  /** Detection confidence — `high` for unambiguous motifs, lower for heuristics. */
  confidence: AlertConfidence;
  /** Whether this alert is in scope for an ICH M7(R2) mutagenic-impurity assessment. */
  ichM7Relevant: boolean;
  /** Why it matters / what to do next. */
  rationale: string;
}

export interface SmilesValidation {
  valid: boolean;
  /** Specific syntactic problems found (empty when valid). */
  errors: string[];
  /** Count of explicitly written atoms by element symbol (heavy atoms + bracket H). */
  atomCounts: Record<string, number>;
  /** Total explicitly written heavy (non-H) atoms. */
  heavyAtomCount: number;
}

export interface StructuralAlertReport {
  smiles: string;
  validation: SmilesValidation;
  alerts: StructuralAlert[];
  /** True when any alert is ICH M7-relevant — i.e. warrants a mutagenicity assessment. */
  hasMutagenicAlert: boolean;
  /** Standing disclaimer about the screening (not classification) nature of this output. */
  disclaimer: string;
}

const DISCLAIMER =
  'Substructure screen only — not an ICH M7(R2) classification. Confirm any alert with a ' +
  'qualified expert rule-based (Q)SAR (e.g. Derek Nexus) and a statistical (Q)SAR (e.g. Sarah ' +
  'Nexus), plus expert review, before drawing a regulatory conclusion.';

/**
 * Validate SMILES syntax (balanced brackets/branches/ring-closures, recognized
 * atoms) and inventory explicitly written atoms. This is a structural sanity
 * check, not a full parse — it will not catch valence errors.
 */
export function validateSmiles(input: string): SmilesValidation {
  const smiles = (input ?? '').trim();
  const errors: string[] = [];
  const atomCounts: Record<string, number> = {};

  if (!smiles) {
    return { valid: false, errors: ['Empty SMILES string.'], atomCounts, heavyAtomCount: 0 };
  }

  // Balanced parentheses (branches).
  let depth = 0;
  for (const ch of smiles) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) {
        errors.push('Unbalanced branch parentheses — a ")" has no matching "(".');
        break;
      }
    }
  }
  if (depth > 0) errors.push('Unbalanced branch parentheses — an unclosed "(".');

  // Balanced square brackets (atom specs).
  const openBrackets = (smiles.match(/\[/g) || []).length;
  const closeBrackets = (smiles.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) errors.push('Unbalanced atom brackets "[" / "]".');

  // Ring-bond closures: each ring number must be paired. Two-digit closures use %NN.
  const ringDigits: Record<string, number> = {};
  const ringMatches = smiles.replace(/\[[^\]]*\]/g, ''); // ignore digits inside bracket atoms (charges, isotopes)
  const twoDigit = ringMatches.match(/%\d{2}/g) || [];
  for (const t of twoDigit) ringDigits[t] = (ringDigits[t] || 0) + 1;
  const singleDigitScan = ringMatches.replace(/%\d{2}/g, '');
  for (const ch of singleDigitScan) {
    if (ch >= '0' && ch <= '9') ringDigits[ch] = (ringDigits[ch] || 0) + 1;
  }
  for (const [num, count] of Object.entries(ringDigits)) {
    if (count % 2 !== 0) errors.push(`Unpaired ring-closure label "${num}".`);
  }

  // Atom inventory + symbol recognition.
  inventoryAtoms(smiles, atomCounts, errors);

  const heavyAtomCount = Object.entries(atomCounts)
    .filter(([el]) => el !== 'H')
    .reduce((sum, [, n]) => sum + n, 0);

  if (heavyAtomCount === 0 && errors.length === 0) {
    errors.push('No atoms recognized in SMILES.');
  }

  return { valid: errors.length === 0, errors, atomCounts, heavyAtomCount };
}

/** Tokenize atoms (bracketed and bare) and accumulate element counts. */
function inventoryAtoms(smiles: string, counts: Record<string, number>, errors: string[]): void {
  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];

    // Bracket atom: [<isotope><symbol><...>]
    if (ch === '[') {
      const end = smiles.indexOf(']', i);
      if (end === -1) {
        // already reported as unbalanced; stop inventorying to avoid garbage.
        return;
      }
      const body = smiles.slice(i + 1, end);
      const sym = parseBracketElement(body);
      if (sym) {
        const canonical = sym[0].toUpperCase() + sym.slice(1);
        counts[canonical] = (counts[canonical] || 0) + 1;
        // Explicit H count inside the bracket, e.g. [NH2], [CH3].
        const hMatch = body.match(/H(\d*)/);
        if (hMatch) {
          const hCount = hMatch[1] ? parseInt(hMatch[1], 10) : 1;
          if (canonical !== 'H') counts['H'] = (counts['H'] || 0) + hCount;
        }
      } else {
        errors.push(`Unrecognized bracket atom "[${body}]".`);
      }
      i = end + 1;
      continue;
    }

    // Two-character bare organic symbol (Cl, Br).
    const two = smiles.slice(i, i + 2);
    if (TWO_CHAR_ORGANIC.includes(two)) {
      counts[two] = (counts[two] || 0) + 1;
      i += 2;
      continue;
    }

    // Single-character bare organic symbol (upper = aliphatic, lower = aromatic).
    if (ONE_CHAR_ORGANIC.has(ch)) {
      counts[ch] = (counts[ch] || 0) + 1;
      i += 1;
      continue;
    }
    if (AROMATIC_ORGANIC.has(ch)) {
      const up = ch.toUpperCase();
      counts[up] = (counts[up] || 0) + 1;
      i += 1;
      continue;
    }

    // Structural/bond/ring characters that are legal between atoms.
    if (/[()\-=#$:/\\@+%.0-9HhA-Za-z*]/.test(ch)) {
      i += 1;
      continue;
    }

    errors.push(`Unexpected character "${ch}" in SMILES.`);
    i += 1;
  }
}

/** Extract the element symbol from a bracket-atom body (handles isotope prefix). */
function parseBracketElement(body: string): string | null {
  const m = body.match(/^\d*([A-Z][a-z]?|[bcnops])/);
  if (!m) return null;
  return m[1];
}

/**
 * Sum the average molecular weight of the *explicitly written* atoms only
 * (heavy atoms + any hydrogens given in brackets). This is NOT the full
 * molecular weight, because implicit hydrogens are not modeled here. Prefer the
 * curated ChEMBL `full_mwt` when a record exists; use this only as a floor /
 * sanity figure for novel structures. Returns null if any element is unknown.
 */
export function explicitAtomWeight(atomCounts: Record<string, number>): number | null {
  let total = 0;
  for (const [el, n] of Object.entries(atomCounts)) {
    const w = ATOMIC_WEIGHT[el];
    if (w == null) return null;
    total += w * n;
  }
  return Math.round(total * 1000) / 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural-alert detectors
// ─────────────────────────────────────────────────────────────────────────────

interface AlertDef {
  id: string;
  name: string;
  category: string;
  confidence: AlertConfidence;
  ichM7Relevant: boolean;
  rationale: string;
  /** Returns true if the alert motif is present in the SMILES. */
  test: (smiles: string) => boolean;
}

/** N–N=O motif (N-nitrosamine), written N=O or O=N adjacent to an amine N. */
function hasNitrosamine(s: string): boolean {
  return /N(?:\([^()]*\))?N=O/.test(s) || /O=N(?:\([^()]*\))?N/.test(s);
}

/** Azide: N=[N+]=[N-] (also covers the neutral N=N=N representation). */
function hasAzide(s: string): boolean {
  return /N=\[?N\+?\]?=\[?N/.test(s) || /N=N=N/.test(s);
}

/** Aromatic primary/secondary amine (aniline-type): lowercase aromatic atom bonded to an amino N. */
function hasAromaticAmine(s: string): boolean {
  // aromatic atom directly bonded to N or [NH2]/[NH]; exclude obvious nitro/nitroso by requiring no '=O' on that N.
  if (/[cnops]\[NH2?\]/.test(s) || /\[NH2?\][cnops]/.test(s)) return true;
  // bare 'N' adjacent to aromatic atom, not part of N=O / nitro.
  return /[cnops]N(?![=H])/.test(s) || /(?<![=])N[cnops]/.test(s);
}

/** Aromatic nitro group: aromatic atom bearing [N+](=O)[O-] or N(=O)=O (ring-closure digits allowed between). */
function hasAromaticNitro(s: string): boolean {
  const nitro = '(?:\\[N\\+\\]\\(=O\\)\\[O-\\]|N\\(=O\\)=O)';
  return new RegExp(`[cnops][0-9%]*${nitro}`).test(s) || new RegExp(`${nitro}[0-9%]*[cnops]`).test(s);
}

/**
 * Three-membered ring containing O or N (epoxide / aziridine). Detects a ring
 * formed by an opener atom, one or two ring atoms, and a closer sharing the same
 * ring-closure label, where the ring contains a heteroatom — so cyclopropane
 * (all-carbon) does not fire.
 */
function hasSmallHeterocycle(s: string): boolean {
  const re = /([CON])(\d)([CON])([CON])?\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const ringAtoms = [m[1], m[3], m[4]].filter(Boolean).join('');
    if (ringAtoms.length <= 3 && /[ON]/.test(ringAtoms)) return true;
  }
  // Backstop for common explicit encodings.
  return /C1OC1|C1CO1|O1CC1|C1NC1|C1CN1|N1CC1/.test(s);
}

/** α,β-unsaturated carbonyl (Michael acceptor): C=C–C=O. */
function hasMichaelAcceptor(s: string): boolean {
  return /C=CC\(=O\)/.test(s) || /C=CC=O/.test(s) || /O=CC=C/.test(s) || /\(=O\)C=C/.test(s);
}

/** Azo coupling: N=N (excludes diazonium/azide forms handled separately). */
function hasAzo(s: string): boolean {
  return /N=N(?![=+])/.test(s) && !hasAzide(s);
}

/** Alkyl halide on sp3 carbon (potential alkylating agent) — low confidence, often benign. */
function hasAlkylHalide(s: string): boolean {
  return /C\(?(Cl|Br|I)\)?/.test(s) && !/c.?(Cl|Br|I)/.test(s.replace(/C\((Cl|Br|I)\)/g, ''));
}

const ALERT_DEFS: AlertDef[] = [
  {
    id: 'n_nitrosamine',
    name: 'N-nitrosamine (N–N=O)',
    category: 'mutagenicity',
    confidence: 'high',
    ichM7Relevant: true,
    rationale:
      'N-nitrosamines are a "cohort of concern" under ICH M7(R2); many are potent mutagenic ' +
      'carcinogens with very low acceptable intakes (AI). Presence demands a nitrosamine risk ' +
      'assessment, root-cause evaluation of nitrosating conditions, and likely a compound-specific ' +
      'AI (CPCA / read-across / in-vitro confirmation).',
    test: hasNitrosamine,
  },
  {
    id: 'organic_azide',
    name: 'Organic azide (N3)',
    category: 'reactivity/safety',
    confidence: 'high',
    ichM7Relevant: true,
    rationale:
      'Azides are potentially mutagenic and present process-safety (energetic) hazards; flag for ' +
      'control as a mutagenic impurity and for manufacturing safety review.',
    test: hasAzide,
  },
  {
    id: 'aromatic_amine',
    name: 'Aromatic amine (aniline-type)',
    category: 'mutagenicity',
    confidence: 'moderate',
    ichM7Relevant: true,
    rationale:
      'Primary aromatic amines are a classic Ashby–Tennant mutagenicity alert (metabolic activation ' +
      'to nitrenium ions). Heuristic match — confirm the amine is primary/secondary and not an amide ' +
      'or heteroaromatic ring nitrogen.',
    test: hasAromaticAmine,
  },
  {
    id: 'aromatic_nitro',
    name: 'Aromatic nitro group',
    category: 'mutagenicity',
    confidence: 'moderate',
    ichM7Relevant: true,
    rationale:
      'Aromatic nitro compounds are a well-established mutagenicity alert (nitroreduction to reactive ' +
      'intermediates). Confirm with (Q)SAR before drawing an M7 conclusion.',
    test: hasAromaticNitro,
  },
  {
    id: 'epoxide_aziridine',
    name: 'Epoxide / aziridine (strained 3-ring)',
    category: 'mutagenicity',
    confidence: 'moderate',
    ichM7Relevant: true,
    rationale:
      'Strained three-membered O/N heterocycles are direct-acting alkylating agents and a standard ' +
      'mutagenicity alert. Heuristic ring detection — verify ring size and heteroatom.',
    test: hasSmallHeterocycle,
  },
  {
    id: 'michael_acceptor',
    name: 'α,β-unsaturated carbonyl (Michael acceptor)',
    category: 'reactivity',
    confidence: 'low',
    ichM7Relevant: false,
    rationale:
      'Michael acceptors are electrophilic and protein-reactive (potential idiosyncratic toxicity / ' +
      'covalent-warhead consideration), though many approved drugs contain them by design. Heuristic.',
    test: hasMichaelAcceptor,
  },
  {
    id: 'azo',
    name: 'Azo linkage (N=N)',
    category: 'mutagenicity',
    confidence: 'low',
    ichM7Relevant: true,
    rationale:
      'Azo compounds can be reduced to aromatic amines in vivo; a recognized alert when aryl-substituted. Heuristic.',
    test: hasAzo,
  },
  {
    id: 'alkyl_halide',
    name: 'Alkyl halide (sp3 C–X)',
    category: 'reactivity',
    confidence: 'low',
    ichM7Relevant: true,
    rationale:
      'Aliphatic halides can act as alkylating agents (potential mutagenic impurity), but many are ' +
      'benign. Low-confidence flag — assess leaving-group ability and context.',
    test: hasAlkylHalide,
  },
];

/**
 * Screen a SMILES string for structural alerts. Validation runs first; if the
 * SMILES is syntactically invalid the alert list is empty (matching on garbage
 * would be misleading) and the validation errors explain why.
 */
export function screenStructuralAlerts(input: string): StructuralAlertReport {
  const smiles = (input ?? '').trim();
  const validation = validateSmiles(smiles);

  const alerts: StructuralAlert[] = validation.valid
    ? ALERT_DEFS.filter(def => def.test(smiles)).map(({ test: _t, ...rest }) => rest)
    : [];

  return {
    smiles,
    validation,
    alerts,
    hasMutagenicAlert: alerts.some(a => a.ichM7Relevant),
    disclaimer: DISCLAIMER,
  };
}
