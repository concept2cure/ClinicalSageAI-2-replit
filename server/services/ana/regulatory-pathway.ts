/**
 * Regulatory-pathway knowledge + advisor for AnA.
 *
 * Encodes the major marketing-authorization routes for drugs/biologics and
 * devices/IVDs across FDA and EU, with the evidentiary basis, typical use case,
 * key requirements and common pitfalls of each. Lets AnA recommend (and QC) a
 * regulatory strategy grounded in the actual statutory/guidance frameworks —
 * 505(b)(1)/(2), ANDA, BLA, 351(k) biosimilar; 510(k), PMA, De Novo; and the
 * EU MDR/IVDR risk classes.
 *
 * Deterministic, dependency-free, data-driven. Advisory only — not a substitute
 * for formal regulatory advice or a pre-submission meeting with the agency.
 *
 * @module server/services/ana/regulatory-pathway
 */

export type ProductDomain = 'drug' | 'biologic' | 'device' | 'ivd';
export type Jurisdiction = 'us' | 'eu';

export interface RegulatoryPathway {
  id: string;
  label: string;
  domain: ProductDomain[];
  jurisdiction: Jurisdiction;
  authority: string;
  basis: string;
  useWhen: string;
  evidence: string[];
  keyRequirements: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

const PATHWAYS: RegulatoryPathway[] = [
  // ── US drugs / biologics ───────────────────────────────────────────────
  {
    id: 'nda_505b1',
    label: 'NDA — 505(b)(1) (full new drug application)',
    domain: ['drug'],
    jurisdiction: 'us',
    authority: 'FDA (CDER)',
    basis: 'FD&C Act §505(b)(1)',
    useWhen: 'A new molecular entity (NME) where the applicant owns/conducts all the safety & efficacy studies.',
    evidence: ['Full preclinical package', 'Adequate and well-controlled Phase 3 efficacy trials', 'Complete CMC', 'Own safety database'],
    keyRequirements: ['Substantial evidence of effectiveness from own studies', 'Complete clinical pharmacology', 'Pre-submission/pre-NDA meeting recommended'],
    commonPitfalls: ['Single pivotal trial without confirmatory support where two are expected', 'CMC readiness lagging clinical', 'Endpoint not agreed with FDA pre-Phase 3'],
    aliases: ['505b1', 'full nda', 'nme nda'],
  },
  {
    id: 'nda_505b2',
    label: 'NDA — 505(b)(2) (relies in part on others’ data)',
    domain: ['drug'],
    jurisdiction: 'us',
    authority: 'FDA (CDER)',
    basis: 'FD&C Act §505(b)(2)',
    useWhen: 'New formulation/route/indication/combination where some safety/efficacy data come from published literature or a listed drug the applicant does not own.',
    evidence: ['Bridging studies (e.g., comparative PK/bioavailability)', 'Targeted studies for the change', 'Reliance on published literature / FDA findings for the reference'],
    keyRequirements: ['Scientific bridge to the relied-upon data', 'Patent certifications to the reference listed drug', 'Justify reliance and the delta studied'],
    commonPitfalls: ['Inadequate bridge to the reference', 'Missing/incorrect patent certifications (Paragraph IV)', 'Treating it as an abbreviated ANDA (it is not)'],
    aliases: ['505b2', 'literature-based nda', 'bridging nda'],
  },
  {
    id: 'anda',
    label: 'ANDA (generic drug)',
    domain: ['drug'],
    jurisdiction: 'us',
    authority: 'FDA (CDER, Office of Generic Drugs)',
    basis: 'FD&C Act §505(j)',
    useWhen: 'A generic duplicate of an approved reference listed drug (same active, strength, route, dosage form, conditions of use).',
    evidence: ['Bioequivalence to the reference listed drug', 'Same labeling (with permitted differences)', 'CMC'],
    keyRequirements: ['Demonstrate bioequivalence', 'Sameness to RLD', 'Patent certifications / exclusivity assessment'],
    commonPitfalls: ['Bioequivalence failure for narrow-therapeutic-index or complex products', 'Labeling carve-out errors', 'Misjudging RLD exclusivity'],
    aliases: ['generic', '505j'],
  },
  {
    id: 'bla_351a',
    label: 'BLA — 351(a) (original biologic)',
    domain: ['biologic'],
    jurisdiction: 'us',
    authority: 'FDA (CDER/CBER)',
    basis: 'PHS Act §351(a)',
    useWhen: 'An original biological product (e.g., mAb, recombinant protein, cell/gene therapy under CBER).',
    evidence: ['Full preclinical + clinical efficacy/safety', 'Comprehensive CMC for a biologic (comparability, potency)', 'Immunogenicity assessment'],
    keyRequirements: ['Demonstrate safety, purity, potency', 'Robust CMC/comparability strategy', 'Immunogenicity plan'],
    commonPitfalls: ['Underestimating CMC/comparability burden', 'Inadequate immunogenicity strategy', 'Process changes without comparability'],
    aliases: ['bla', '351a', 'biologic license application'],
  },
  {
    id: 'bla_351k',
    label: 'BLA — 351(k) (biosimilar / interchangeable)',
    domain: ['biologic'],
    jurisdiction: 'us',
    authority: 'FDA (CDER/CBER)',
    basis: 'PHS Act §351(k) (BPCIA)',
    useWhen: 'A biosimilar to a licensed reference product; optionally seeking interchangeability.',
    evidence: ['Analytical similarity (foundation of the totality-of-evidence)', 'PK/PD comparative studies', 'Comparative clinical study to address residual uncertainty', 'Switching studies for interchangeability'],
    keyRequirements: ['Stepwise totality-of-the-evidence demonstration of no clinically meaningful differences', 'Same MoA/route/strength/dosage form as reference', 'Interchangeability requires additional switching data'],
    commonPitfalls: ['Over-relying on clinical study instead of strong analytical foundation', 'Mismatched conditions of use vs reference', 'Patent dance (BPCIA) missteps'],
    aliases: ['biosimilar', '351k', 'interchangeable'],
  },

  // ── US devices / IVDs ──────────────────────────────────────────────────
  {
    id: 'fda_510k',
    label: '510(k) Premarket Notification (device)',
    domain: ['device', 'ivd'],
    jurisdiction: 'us',
    authority: 'FDA (CDRH)',
    basis: 'FD&C Act §510(k)',
    useWhen: 'A device that is substantially equivalent to a legally marketed predicate (typically Class II).',
    evidence: ['Substantial equivalence to a predicate', 'Performance/bench testing', 'Sometimes limited clinical data', 'Biocompatibility/software as applicable'],
    keyRequirements: ['Identify a suitable predicate', 'Demonstrate same intended use and equivalent technological characteristics (or no new safety/effectiveness questions)', 'Conformance to special controls'],
    commonPitfalls: ['Predicate creep / unsuitable predicate', 'New intended use that breaks substantial equivalence', 'Underpowered performance testing'],
    aliases: ['510k', 'premarket notification', 'substantial equivalence'],
  },
  {
    id: 'fda_pma',
    label: 'PMA Premarket Approval (device)',
    domain: ['device', 'ivd'],
    jurisdiction: 'us',
    authority: 'FDA (CDRH)',
    basis: 'FD&C Act §515',
    useWhen: 'High-risk (Class III) device that supports/sustains life or presents high risk; no suitable predicate.',
    evidence: ['Valid scientific evidence of safety and effectiveness', 'Pivotal clinical investigation (often under an IDE)', 'Full manufacturing/QMS information'],
    keyRequirements: ['Independent demonstration of safety & effectiveness (not equivalence)', 'IDE for the clinical study', 'Pre-Submission (Q-Sub) to align on study design'],
    commonPitfalls: ['Treating it like a 510(k)', 'Pivotal endpoint not agreed via Q-Sub', 'Manufacturing/QMS gaps at PMA panel'],
    aliases: ['pma', 'premarket approval', 'class iii'],
  },
  {
    id: 'fda_de_novo',
    label: 'De Novo classification (device)',
    domain: ['device', 'ivd'],
    jurisdiction: 'us',
    authority: 'FDA (CDRH)',
    basis: 'FD&C Act §513(f)(2)',
    useWhen: 'A novel low-/moderate-risk device with no predicate — to obtain a Class I/II classification (creating a new predicate).',
    evidence: ['Evidence of safety/effectiveness for general/special controls', 'Risk-based rationale for low-to-moderate risk'],
    keyRequirements: ['No legally marketed predicate exists', 'Demonstrate risks are mitigable by general/special controls', 'Define the special controls'],
    commonPitfalls: ['Risk actually warrants PMA (Class III)', 'Weak special-controls proposal', 'Choosing De Novo when a predicate exists (use 510(k))'],
    aliases: ['de novo', 'de-novo', 'novel device classification'],
  },

  // ── EU drugs ───────────────────────────────────────────────────────────
  {
    id: 'eu_ma_centralised',
    label: 'EU Marketing Authorisation — Centralised Procedure',
    domain: ['drug', 'biologic'],
    jurisdiction: 'eu',
    authority: 'EMA / European Commission',
    basis: 'Regulation (EC) No 726/2004',
    useWhen: 'Mandatory for biotech, advanced therapies, orphan, and certain new active substances (e.g., oncology, HIV); a single authorisation valid across the EU.',
    evidence: ['Full eCTD dossier (quality, non-clinical, clinical)', 'Risk Management Plan (EU RMP)', 'Benefit-risk per EMA guidelines'],
    keyRequirements: ['CHMP scientific assessment', 'EU RMP', 'Paediatric Investigation Plan (PIP) as applicable', 'Scientific advice recommended'],
    commonPitfalls: ['PIP not addressed', 'RMP insufficient', 'Choosing national/MRP/DCP when CP is mandatory'],
    aliases: ['centralised', 'centralized procedure', 'ema ma', 'cp'],
  },

  // ── EU devices / IVDs ──────────────────────────────────────────────────
  {
    id: 'eu_mdr',
    label: 'EU MDR conformity (CE marking) — device',
    domain: ['device'],
    jurisdiction: 'eu',
    authority: 'Notified Body / Competent Authority',
    basis: 'Regulation (EU) 2017/745 (MDR)',
    useWhen: 'CE marking of a medical device in the EU; route depends on risk class (I, IIa, IIb, III).',
    evidence: ['Clinical evaluation (MEDDEV 2.7/1 rev4 / MDCG) and clinical evidence', 'Technical documentation (Annexes II/III)', 'PMS & PMCF plan'],
    keyRequirements: ['Correct risk classification (Annex VIII)', 'Notified Body conformity assessment for Class IIa+', 'GSPR conformity, UDI, EUDAMED registration'],
    commonPitfalls: ['Under-classifying the device', 'Insufficient clinical evidence (equivalence claims under MDR are stricter)', 'Weak PMS/PMCF'],
    aliases: ['mdr', 'ce mark device', '2017/745'],
  },
  {
    id: 'eu_ivdr',
    label: 'EU IVDR conformity (CE marking) — IVD',
    domain: ['ivd'],
    jurisdiction: 'eu',
    authority: 'Notified Body / Competent Authority',
    basis: 'Regulation (EU) 2017/746 (IVDR)',
    useWhen: 'CE marking of an in-vitro diagnostic in the EU; route depends on risk class (A, B, C, D).',
    evidence: ['Performance evaluation: scientific validity + analytical + clinical performance', 'Technical documentation', 'PMS & PMPF plan'],
    keyRequirements: ['Correct classification (Annex VIII, rules-based A–D)', 'Notified Body involvement for Class B and above', 'Performance evaluation report; EUDAMED'],
    commonPitfalls: ['Assuming self-certification (most IVDs now need a Notified Body)', 'Conflating analytical vs clinical performance', 'Underestimating Class D requirements (EU reference labs, CTS)'],
    aliases: ['ivdr', 'ce mark ivd', '2017/746'],
  },
];

function score(p: RegulatoryPathway, domain?: ProductDomain, jurisdiction?: Jurisdiction): number {
  let s = 0;
  if (domain && p.domain.includes(domain)) s += 2;
  if (jurisdiction && p.jurisdiction === jurisdiction) s += 1;
  return s;
}

export interface PathwayQuery {
  pathway?: string; // direct id/alias lookup
  domain?: string; // drug | biologic | device | ivd
  jurisdiction?: string; // us | eu
}

export interface PathwayResult {
  resolved: { pathway: string | null; domain: ProductDomain | null; jurisdiction: Jurisdiction | null };
  pathway: RegulatoryPathway | null;
  candidates: { id: string; label: string; authority: string; basis: string }[];
  brief: string;
}

function findPathway(key?: string): RegulatoryPathway | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    PATHWAYS.find(p => p.id === k) ||
    PATHWAYS.find(p => p.aliases?.some(a => a.toLowerCase() === k)) ||
    PATHWAYS.find(p => p.label.toLowerCase() === k) ||
    PATHWAYS.find(p => p.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(p.id))
  );
}

function asDomain(v?: string): ProductDomain | undefined {
  const k = v?.trim().toLowerCase();
  return k === 'drug' || k === 'biologic' || k === 'device' || k === 'ivd' ? k : undefined;
}
function asJurisdiction(v?: string): Jurisdiction | undefined {
  const k = v?.trim().toLowerCase();
  if (k === 'us' || k === 'usa' || k === 'fda') return 'us';
  if (k === 'eu' || k === 'europe' || k === 'ema') return 'eu';
  return undefined;
}

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

export function listRegulatoryPathways() {
  return PATHWAYS.map(p => ({
    id: p.id,
    label: p.label,
    domain: p.domain,
    jurisdiction: p.jurisdiction,
    authority: p.authority,
  }));
}

export function adviseRegulatoryPathway(q: PathwayQuery): PathwayResult {
  const domain = asDomain(q.domain);
  const jurisdiction = asJurisdiction(q.jurisdiction);
  const direct = findPathway(q.pathway) ?? null;

  // Candidate set filtered by domain/jurisdiction, ranked.
  const candidates = PATHWAYS
    .filter(p => (domain ? p.domain.includes(domain) : true) && (jurisdiction ? p.jurisdiction === jurisdiction : true))
    .sort((a, b) => score(b, domain, jurisdiction) - score(a, domain, jurisdiction));

  const parts: string[] = [];
  const focus = direct;

  if (focus) {
    parts.push(`# Regulatory pathway: ${focus.label}`);
    parts.push(`\n**Authority.** ${focus.authority}`);
    parts.push(`**Statutory basis.** ${focus.basis}`);
    parts.push(`**Use when.** ${focus.useWhen}`);
    parts.push(bullets('Evidence expected', focus.evidence));
    parts.push(bullets('Key requirements', focus.keyRequirements));
    parts.push(bullets('Common pitfalls', focus.commonPitfalls));
  } else {
    const scope = [domain ? `domain=${domain}` : null, jurisdiction ? `jurisdiction=${jurisdiction}` : null]
      .filter(Boolean)
      .join(', ');
    parts.push(`# Candidate regulatory pathways${scope ? ` (${scope})` : ''}`);
    if (candidates.length === 0) {
      parts.push('\n_No pathway matched the supplied filters. Specify domain (drug|biologic|device|ivd) and/or jurisdiction (us|eu)._');
    } else {
      for (const p of candidates) {
        parts.push(`\n## ${p.label}\n**Basis.** ${p.basis} · **Authority.** ${p.authority}\n**Use when.** ${p.useWhen}`);
      }
    }
  }

  parts.push(
    '\n## Note\nAdvisory only — confirm strategy with a formal pre-submission/scientific-advice meeting ' +
      '(FDA Pre-Sub/Type B, EMA scientific advice). Ground precedent with assess_regulatory_landscape and ' +
      'search_clinical_evidence.'
  );

  return {
    resolved: { pathway: focus?.id ?? null, domain: domain ?? null, jurisdiction: jurisdiction ?? null },
    pathway: focus,
    candidates: candidates.map(p => ({ id: p.id, label: p.label, authority: p.authority, basis: p.basis })),
    brief: parts.filter(Boolean).join('\n'),
  };
}
