/**
 * Medical-information / standard-response advisor for AnA.
 *
 * Encodes how Medical Information teams handle unsolicited HCP/patient enquiries:
 * the structure of a Standard Response Document (SRD), the on-label vs off-label
 * distinction (and the compliance guardrails for responding to unsolicited
 * off-label requests), adverse-event/product-complaint capture obligations, and
 * the required referencing/fair-balance conventions. Lets AnA scaffold and QC a
 * medical-information response grounded in MI good practice.
 *
 * Deterministic, dependency-free, data-driven. Advisory — MI/compliance review
 * is authoritative; off-label responses are subject to strict regulation.
 *
 * @module server/services/ana/medical-information
 */

export interface SrdStructure {
  id: string;
  label: string;
  components: string[];
}

export interface ResponseTypeRecord {
  id: string;
  label: string;
  describe: string;
  guardrails: string[];
  aliases?: string[];
}

const SRD_STRUCTURE: SrdStructure = {
  id: 'srd',
  label: 'Standard Response Document (SRD)',
  components: [
    'Question/topic (the precise enquiry being answered)',
    'Direct, balanced response — factual, non-promotional, scientific in tone',
    'Supporting evidence (cite primary literature; note strength/limitations)',
    'Approved-label context (link to the relevant USPI/SmPC section)',
    'Fair balance (safety information alongside efficacy)',
    'References (full citations) and version/approval/expiry metadata',
  ],
};

const RESPONSE_TYPES: ResponseTypeRecord[] = [
  {
    id: 'on_label',
    label: 'On-label enquiry',
    describe: 'The question concerns the approved indication/population/dosing as in the label.',
    guardrails: [
      'Answer factually and consistently with the approved label.',
      'Maintain fair balance — include relevant safety information.',
      'Cite the label and supporting evidence.',
    ],
    aliases: ['on label', 'in-label', 'approved use'],
  },
  {
    id: 'off_label',
    label: 'Off-label (unsolicited) enquiry',
    describe: 'The question concerns a use outside the approved label, raised UNSOLICITED by the HCP.',
    guardrails: [
      'Respond only to genuinely unsolicited requests; never proactively raise off-label use.',
      'Provide non-promotional, balanced, scientific information (data on both sides), not a recommendation.',
      'Route through Medical Information/Medical Affairs (not sales/commercial); document the unsolicited nature.',
      'Disclose that the use is not approved; reference the approved label.',
      'Follow applicable FDA guidance on responding to unsolicited requests / SIUU communications and local regulation.',
    ],
    aliases: ['off label', 'unsolicited', 'off-label request'],
  },
  {
    id: 'product_complaint',
    label: 'Product quality complaint / technical enquiry',
    describe: 'The enquiry reports a possible product quality defect (appearance, packaging, device malfunction).',
    guardrails: [
      'Capture and route to Quality per SOP; obtain product/lot details where possible.',
      'Assess whether an associated adverse event also occurred (and capture it if so).',
    ],
    aliases: ['product complaint', 'quality complaint', 'pqc', 'technical complaint'],
  },
];

/** Pharmacovigilance/AE capture obligation that overlays ALL MI interactions. */
const AE_OBLIGATION: string[] = [
  'Every interaction must be screened for adverse events and product complaints.',
  'If an AE is identified, capture the four valid-case minimum criteria (identifiable reporter, identifiable patient, suspect product, event) and forward to PV within the required timeframe.',
  'AE reporting obligations apply regardless of whether the enquiry is on- or off-label.',
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findType(key?: string): ResponseTypeRecord | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    RESPONSE_TYPES.find(t => t.id === k) ||
    RESPONSE_TYPES.find(t => t.aliases?.some(a => a.toLowerCase() === k)) ||
    RESPONSE_TYPES.find(t => t.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(t.id))
  );
}

export interface MedInfoQuery {
  responseType?: string;
}

export interface MedInfoResult {
  resolved: { responseType: string | null };
  responseType: ResponseTypeRecord | null;
  brief: string;
}

export function listMedInfoResponseTypes() {
  return RESPONSE_TYPES.map(t => ({ id: t.id, label: t.label }));
}

export function adviseMedicalInformation(q: MedInfoQuery): MedInfoResult {
  const t = findType(q.responseType) ?? null;
  const parts: string[] = [];

  parts.push(`# Medical-information response${t ? `: ${t.label}` : ' guidance'}`);
  if (t) {
    parts.push(`\n${t.describe}`);
    parts.push(bullets('Compliance guardrails', t.guardrails));
  } else {
    parts.push('\n_Specify a response type: on_label, off_label, product_complaint._');
    for (const rt of RESPONSE_TYPES) parts.push(`\n## ${rt.label}\n${rt.describe}`);
  }

  parts.push(bullets(`${SRD_STRUCTURE.label} structure`, SRD_STRUCTURE.components));
  parts.push(bullets('Pharmacovigilance overlay (applies to every interaction)', AE_OBLIGATION));

  parts.push(
    '\n## Note\nAdvisory only — MI/compliance review is authoritative and off-label responses are strictly ' +
      'regulated. Keep language non-promotional (screen_promotional_language), ground claims in the ' +
      'literature (search_literature) and the approved label (advise_labeling_structure), and route any ' +
      'adverse event with draft_safety_narrative / advise_pharmacovigilance.'
  );

  return { resolved: { responseType: t?.id ?? null }, responseType: t, brief: parts.filter(Boolean).join('\n') };
}
