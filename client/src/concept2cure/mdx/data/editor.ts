/**
 * 510(k) module editor fixtures (OR-801 Orthopedic Screw System) — ported
 * verbatim from data.jsx. Only the eSTAR editor has full content in this
 * kit drop; PMA + CER editors are stubbed.
 */

export type EditorSectionStatus = 'complete' | 'review' | 'draft' | 'na' | 'empty';

export interface EditorProgram {
  id: string;
  title: string;
  code: string;
  productCode: string;
  regulation: string;
  predicate: string;
  lead: string;
  dueLabel: string;
  readiness: number;
}

export interface EditorSectionItem {
  id: number;
  num: string;
  label: string;
  status: EditorSectionStatus;
  required: boolean;
  words: number;
  active?: boolean;
  blocker?: boolean;
}

export interface EditorSectionVolume {
  volume: string;
  items: EditorSectionItem[];
}

export interface EditorMastheadItem {
  lbl: string;
  val: string;
}

export interface EditorBlockSpan {
  t?: string;
  cite?: string;
}

export interface EditorBlockProvenance {
  source: string;
  model: string;
  audit: string;
  foot: string;
}

export interface EditorBlockFlag {
  kind: string;
  severity: 'err' | 'warn' | 'ok';
  msg: string;
}

export interface EditorBlockParagraph {
  id: string;
  kind: 'p';
  confidence: number;
  prov: EditorBlockProvenance;
  spans: EditorBlockSpan[];
  flags?: EditorBlockFlag[] | null;
}

export interface EditorBlockHeading {
  id: string;
  kind: 'h2';
  text: string;
}

export interface EditorBlockTable {
  id: string;
  kind: 'table';
  confidence: number;
  prov: EditorBlockProvenance;
  headers: string[];
  rows: string[][];
}

export type EditorBlock = EditorBlockParagraph | EditorBlockHeading | EditorBlockTable;

export interface EditorContent {
  id: number;
  num: string;
  label: string;
  status: EditorSectionStatus;
  masthead: EditorMastheadItem[];
  blocks: EditorBlock[];
  /** Set when AnA drafted this section via the write_kit_section tool and
   *  the user hasn't accepted yet. The editor renders an AnaDraftBanner
   *  inline so the user can accept-as-is or refine-then-accept. Null on
   *  human-typed content + on already-accepted drafts. */
  anaDraft?: {
    source: 'ana';
    at: string;
    summary?: string;
    rowId: number;
  } | null;
}

export interface EditorComment {
  id: string;
  blockId: string;
  author: string;
  role: string;
  when: string;
  resolved: boolean;
  ai?: boolean;
  body: string;
  suggest?: { blockId: string; text: string };
}

export interface EditorValidation {
  id: string;
  severity: 'err' | 'warn' | 'ok';
  rule: string;
  msg: string;
  blockId?: string;
}

export interface EditorMessage {
  role: 'ana' | 'user';
  mode: string;
  when: string;
  body: string;
}

export interface EditorQuickAction {
  id: string;
  label: string;
  tool: string;
}

export const EDITOR_PROGRAM: EditorProgram = {
  id: 'or801',
  title: 'OR-801 Orthopedic Screw System',
  code: 'Class II · 510(k)',
  productCode: 'HWC',
  regulation: '21 CFR 888.3040',
  predicate: 'K213992 — Stryker VariAx 2 Compression Screw',
  lead: 'Sofia Marchetti',
  dueLabel: 'FDA filing · 22 days',
  readiness: 84,
};

export const EDITOR_SECTIONS: EditorSectionVolume[] = [
  { volume: 'Administrative', items: [
    { id: 1,  num: '§01', label: 'User fee cover sheet',                status: 'complete', required: true,  words: 180 },
    { id: 2,  num: '§02', label: 'CDRH submission cover sheet',         status: 'complete', required: true,  words: 420 },
    { id: 3,  num: '§03', label: '510(k) cover letter',                 status: 'draft',    required: true,  words: 640 },
    { id: 4,  num: '§04', label: 'Indications for use statement',       status: 'complete', required: true,  words: 210 },
    { id: 5,  num: '§05', label: '510(k) summary',                      status: 'draft',    required: true,  words: 1840 },
    { id: 6,  num: '§06', label: 'Truthful and accuracy statement',     status: 'complete', required: true,  words: 150 },
    { id: 7,  num: '§07', label: 'Class III summary and certification', status: 'na',       required: false, words: 0 },
    { id: 8,  num: '§08', label: 'Financial certification',             status: 'complete', required: true,  words: 220 },
    { id: 9,  num: '§09', label: 'Declarations of conformity',          status: 'complete', required: true,  words: 1120 },
  ]},
  { volume: 'Device description', items: [
    { id: 10, num: '§10', label: 'Device description',                   status: 'draft',  required: true, words: 2840, active: true },
    { id: 11, num: '§11', label: 'Substantial equivalence discussion',   status: 'draft',  required: true, words: 3210, blocker: true },
    { id: 12, num: '§12', label: 'Proposed labeling',                    status: 'review', required: true, words: 1960 },
  ]},
  { volume: 'Performance data', items: [
    { id: 13, num: '§13', label: 'Sterilization and shelf life',         status: 'complete', required: true,  words: 840 },
    { id: 14, num: '§14', label: 'Biocompatibility',                     status: 'review',   required: true,  words: 1410 },
    { id: 15, num: '§15', label: 'Software',                             status: 'draft',    required: false, words: 680 },
    { id: 16, num: '§16', label: 'Electromagnetic compatibility',        status: 'complete', required: false, words: 520 },
    { id: 17, num: '§17', label: 'Performance testing — bench',          status: 'review',   required: true,  words: 4120 },
    { id: 18, num: '§18', label: 'Performance testing — animal',         status: 'na',       required: false, words: 0 },
    { id: 19, num: '§19', label: 'Performance testing — clinical',       status: 'draft',    required: true,  words: 3840, blocker: true },
  ]},
  { volume: 'Closing', items: [
    { id: 20, num: '§20', label: 'References', status: 'complete', required: true, words: 720 },
  ]},
];

export const EDITOR_CONTENT_11: EditorContent = {
  id: 11,
  num: '§11',
  label: 'Substantial equivalence discussion',
  status: 'draft',
  masthead: [
    { lbl: 'Predicate',    val: 'K213992 · Stryker VariAx 2' },
    { lbl: 'Product code', val: 'HWC' },
    { lbl: 'Regulation',   val: '21 CFR 888.3040' },
    { lbl: 'Last edited',  val: '30 minutes ago · S. Marchetti' },
  ],
  blocks: [
    { id: 'b1', kind: 'p', confidence: 0.94,
      prov: { source: 'Subject device specification · DSP-OR801-v3.2', model: 'Opus 4.5', audit: 'AUD-8841', foot: 'Drafted from device spec §2.1' },
      spans: [
        { t: 'The OR-801 Orthopedic Screw System is substantially equivalent to the legally marketed predicate device, ' },
        { cite: 'K213992' },
        { t: ', the Stryker VariAx 2 Compression Screw System. Both devices are classified as Class II under ' },
        { cite: '21 CFR 888.3040' },
        { t: ' and share the product code HWC. The subject and predicate devices have the same intended use and identical indications for use.' },
      ],
    },
    { id: 'b2', kind: 'h2', text: 'Intended use comparison' },
    { id: 'b3', kind: 'p', confidence: 0.97,
      prov: { source: 'FDA 510(k) Summary · K213992', model: 'Sonnet 4.5', audit: 'AUD-8842', foot: 'Verified against predicate summary' },
      spans: [
        { t: 'The OR-801 is indicated for fixation of fractures, osteotomies, and arthrodeses of small bones and small bone fragments in the foot, ankle, hand, and wrist. This indication statement is identical in scope to the predicate (' },
        { cite: 'K213992, §IV' },
        { t: '), with no expansion to new anatomical sites, patient populations, or clinical conditions.' },
      ],
    },
    { id: 'b4', kind: 'h2', text: 'Technological characteristics' },
    { id: 'b5', kind: 'p', confidence: 0.88,
      prov: { source: 'Engineering drawing package · ENG-OR801 rev D', model: 'Opus 4.5', audit: 'AUD-8843', foot: 'Cross-referenced with predicate drawings where public' },
      spans: [
        { t: 'Both devices are cannulated, self-drilling, self-tapping headless compression screws machined from Ti-6Al-4V ELI per ASTM F136. The OR-801 is available in diameters of 2.5, 3.0, 3.5, and 4.0 mm and lengths of 10 to 40 mm in 2 mm increments, bracketing the predicate’s 2.5–4.0 mm diameter and 10–40 mm length range. Thread pitch, drive interface (hexalobular T8), and cannulation diameter are equivalent.' },
      ],
    },
    { id: 'b6', kind: 'table', confidence: 0.91,
      prov: { source: 'SE matrix · K510_SE_ROWS', model: 'Sonnet 4.5', audit: 'AUD-8844', foot: 'Generated from SE matrix' },
      headers: ['Characteristic', 'Subject · OR-801', 'Predicate · K213992', 'Verdict'],
      rows: [
        ['Material',        'Ti-6Al-4V ELI per ASTM F136', 'Ti-6Al-4V ELI per ASTM F136', 'same'],
        ['Diameter range',  '2.5–4.0 mm',             '2.5–4.0 mm',             'same'],
        ['Length range',    '10–40 mm',               '10–40 mm',               'same'],
        ['Thread design',   'Variable pitch compression',  'Variable pitch compression',  'same'],
        ['Drive interface', 'Hexalobular T8',              'Hexalobular T8',              'same'],
        ['Cannulation',     '1.1 mm',                      '1.1 mm',                      'same'],
        ['Surface finish',  'Anodized Type II (gold)',     'Anodized Type II (blue)',     'equivalent'],
        ['Sterilization',   'Gamma 25–40 kGy',        'Gamma 25–40 kGy',        'same'],
        ['Shelf life',      '5 years',                     '5 years',                     'same'],
      ],
    },
    { id: 'b7', kind: 'h2', text: 'Performance data' },
    { id: 'b8', kind: 'p', confidence: 0.72,
      flags: [{ kind: 'claim-evidence', severity: 'warn', msg: 'Pull-out force claim cites TR-OR801-009 but that report is not yet attached to §17.' }],
      prov: { source: 'Drafted from bench test protocol', model: 'Opus 4.5', audit: 'AUD-8845', foot: 'Awaiting report attachment' },
      spans: [
        { t: 'Bench performance testing per ASTM F543 demonstrates equivalent axial pull-out strength (mean 1,842 N ± 140, n = 30 per diameter) to the predicate (1,780 N ± 165, n = 30). Torsional yield strength, insertion torque, and driver-engagement fatigue were evaluated per ' },
        { cite: 'ASTM F543' },
        { t: ' and ' },
        { cite: 'ISO 6475' },
        { t: '. Full reports are provided in §17 Performance testing — bench.' },
      ],
    },
    { id: 'b9', kind: 'p', confidence: 0.58,
      flags: [{ kind: 'claim-evidence', severity: 'err', msg: 'Biocompatibility claim implies completed -11 testing; §14 shows report status “review”. Claude suggested a safer phrasing — see comments.' }],
      prov: { source: 'Drafted from biocompat test plan', model: 'Opus 4.5', audit: 'AUD-8846', foot: 'Blocker — see §14 status' },
      spans: [
        { t: 'Biocompatibility was established per ISO 10993-1 with testing of cytotoxicity (-5), sensitization (-10), and acute systemic toxicity (-11). Results meet or exceed the predicate profile, and no new or additional biological risks are introduced.' },
      ],
    },
    { id: 'b10', kind: 'h2', text: 'Conclusion' },
    { id: 'b11', kind: 'p', confidence: 0.86,
      prov: { source: 'Drafted from §11 blocks 1–9', model: 'Opus 4.5', audit: 'AUD-8847', foot: 'Stock closing — review for device-specific risk language' },
      spans: [
        { t: 'The OR-801 Orthopedic Screw System has the same intended use, the same indications for use, and the same technological characteristics as the predicate device. Any differences in physical dimensions, surface treatment, and manufacturing process do not raise new questions of safety or effectiveness. Bench performance, biocompatibility, and sterilization data support the conclusion that the OR-801 is substantially equivalent to ' },
        { cite: 'K213992' },
        { t: '.' },
      ],
    },
  ],
};

export const EDITOR_COMMENTS: EditorComment[] = [
  { id: 'c1', blockId: 'b9', author: 'Linh Tran',        role: 'Reg Affairs', when: '2h ago',     resolved: false,
    body: 'Biocompat report for -11 is still out for internal review — can we soften this to "testing conducted per…" and move the conclusion to §14?' },
  { id: 'c2', blockId: 'b9', author: 'Claude',           role: 'Opus 4.5',    when: '2h ago',     resolved: false, ai: true,
    body: 'Suggested rewrite: "Biocompatibility testing per ISO 10993-1 included cytotoxicity (-5) and sensitization (-10); acute systemic toxicity (-11) testing is complete and the final report is under internal quality review (see §14)." Apply?',
    suggest: { blockId: 'b9', text: 'Biocompatibility testing per ISO 10993-1 included cytotoxicity (-5) and sensitization (-10); acute systemic toxicity (-11) testing is complete and the final report is under internal quality review (see §14). Results meet or exceed the predicate profile, and no new or additional biological risks are introduced.' } },
  { id: 'c3', blockId: 'b8', author: 'Jordan Chen',      role: 'Lead',        when: 'yesterday',  resolved: true,
    body: 'Pull-out numbers look right. Make sure TR-OR801-009 attaches before we lock §17.' },
  { id: 'c4', blockId: 'b6', author: 'Sofia Marchetti',  role: 'Author',      when: '3d ago',     resolved: true,
    body: 'Anodizing color differs from predicate (gold vs blue). Confirmed with reviewer — cosmetic only, no SE impact.' },
];

export const EDITOR_VALIDATION_11: EditorValidation[] = [
  { id: 'v1', severity: 'err',  rule: 'CE-01',     msg: 'Claim in ¶ 9 references §14 evidence that is not yet locked (status = review).', blockId: 'b9' },
  { id: 'v2', severity: 'warn', rule: 'CE-02',     msg: 'Claim in ¶ 8 cites TR-OR801-009 — attachment missing in §17.',                  blockId: 'b8' },
  { id: 'v3', severity: 'ok',   rule: 'eSTAR-11.1',msg: 'Predicate K-number cited in first paragraph.' },
  { id: 'v4', severity: 'ok',   rule: 'eSTAR-11.2',msg: 'Product code and regulation cited.' },
  { id: 'v5', severity: 'ok',   rule: 'eSTAR-11.3',msg: 'SE matrix present with ≥ 6 characteristics.' },
  { id: 'v6', severity: 'ok',   rule: 'eSTAR-11.4',msg: 'Conclusion paragraph references predicate K-number.' },
];

export const EDITOR_SEED_MESSAGES: EditorMessage[] = [
  { role: 'ana', mode: 'deep-research', when: '2h ago',
    body: 'Reading §11 Substantial equivalence. I flagged two claim-evidence mismatches. Want me to walk through the blocker in ¶ 9?' },
];

export const EDITOR_QUICK: EditorQuickAction[] = [
  { id: 'q1', label: 'Draft from selected predicate',     tool: 'draft_section' },
  { id: 'q2', label: 'Check claim against §17 evidence',  tool: 'get_evidence_chain' },
  { id: 'q3', label: 'Rewrite for FDA tone',              tool: 'draft_section' },
  { id: 'q4', label: 'Run §11 validation',                tool: 'get_rim_signals' },
];
