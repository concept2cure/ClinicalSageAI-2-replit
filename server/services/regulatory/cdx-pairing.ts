/**
 * Companion-diagnostic (CDx) pairing — biomarker-knowledge-aware.
 *
 * Builds on assessCdxReadiness (companion-diagnostics.ts) by resolving the
 * proposed biomarker against the IVD biomarker scientific-validity corpus, so a
 * drug↔Dx pairing is grounded in a real, citable analyte→condition association
 * rather than asserted. This is the concrete wiring of the biomarker knowledge
 * base into the CDx engine.
 *
 * Deterministic; the corpus it reads is static in-code data.
 */

import {
  assessCdxReadiness,
  type CdxElement,
  type CdxReadinessResult,
} from './companion-diagnostics';
import { BIOMARKER_VALIDITY_KNOWLEDGE } from '../ivd-knowledge/scientific/biomarker-validity';
import type { Citation } from '../ivd-knowledge/types';

/** Common biomarker aliases → corpus entry id. */
const BIOMARKER_ALIASES: Record<string, string> = {
  'pd-l1': 'bio.pd-l1', pdl1: 'bio.pd-l1', 'pd l1': 'bio.pd-l1',
  her2: 'bio.her2', erbb2: 'bio.her2', 'her-2': 'bio.her2',
  egfr: 'bio.egfr',
  alk: 'bio.alk',
  kras: 'bio.kras', nras: 'bio.kras', 'kras g12c': 'bio.kras', g12c: 'bio.kras',
  braf: 'bio.braf', 'braf v600': 'bio.braf', v600: 'bio.braf',
  brca: 'bio.brca', brca1: 'bio.brca', brca2: 'bio.brca', 'brca1/2': 'bio.brca', hrd: 'bio.brca',
  msi: 'bio.msi-mmr', 'msi-h': 'bio.msi-mmr', dmmr: 'bio.msi-mmr', mmr: 'bio.msi-mmr',
  tmb: 'bio.tmb', 'tumor mutational burden': 'bio.tmb',
};

const ENTRY_BY_ID = new Map(BIOMARKER_VALIDITY_KNOWLEDGE.map(e => [e.id, e]));

export interface BiomarkerMatch {
  recognized: boolean;
  entryId?: string;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  citations?: Citation[];
  /** Whether the recognized biomarker is documented for CDx use. */
  cdxDocumented?: boolean;
}

/** Resolve a free-text biomarker name to its scientific-validity corpus entry. */
export function lookupBiomarkerValidity(biomarker: string): BiomarkerMatch {
  const norm = biomarker.trim().toLowerCase();
  if (!norm) return { recognized: false };

  // 1) alias table
  let id = BIOMARKER_ALIASES[norm];

  // 2) token/tag/title scan
  if (!id) {
    for (const e of BIOMARKER_VALIDITY_KNOWLEDGE) {
      const hay = `${e.title} ${e.tags.join(' ')} ${e.id}`.toLowerCase();
      if (hay.includes(norm) || norm.includes(e.id.replace(/^bio\./, ''))) {
        id = e.id;
        break;
      }
    }
  }

  const entry = id ? ENTRY_BY_ID.get(id) : undefined;
  if (!entry) return { recognized: false };
  return {
    recognized: true,
    entryId: entry.id,
    title: entry.title,
    summary: entry.summary,
    keyPoints: entry.keyPoints,
    citations: entry.citations,
    cdxDocumented: entry.appliesTo.includes('cdx'),
  };
}

export interface CdxPairingInput {
  biomarker: string;
  therapeuticProduct?: string;
  /** Co-development elements already in place (besides the biomarker). */
  elements?: Partial<Record<CdxElement, boolean>>;
}

export interface CdxPairingResult {
  biomarker: BiomarkerMatch;
  readiness: CdxReadinessResult;
  /** EU classification of a CDx is fixed: Class C (Annex VIII Rule 3). */
  euClassification: 'C';
  /** Ids into the knowledge base supporting the pairing. */
  knowledgeRefs: string[];
  recommendations: string[];
}

/**
 * Assess a drug↔Dx pairing: validate the biomarker against the corpus and fold
 * that into the co-development readiness assessment.
 */
export function pairCompanionDiagnostic(input: CdxPairingInput): CdxPairingResult {
  const biomarker = lookupBiomarkerValidity(input.biomarker);

  // The biomarker being recognized in the validity corpus satisfies the
  // "biomarkerDefined" co-development element; the rest come from the caller.
  const elements: Partial<Record<CdxElement, boolean>> = {
    ...input.elements,
    biomarkerDefined: biomarker.recognized || input.elements?.biomarkerDefined === true,
    therapeuticProductIdentified:
      !!input.therapeuticProduct || input.elements?.therapeuticProductIdentified === true,
  };
  const readiness = assessCdxReadiness(elements);

  const knowledgeRefs = new Set<string>(['fda.ivd.cdx', 'eu.ivdr.companion-diagnostics', 'eu.ivdr.classification-rules']);
  if (biomarker.entryId) knowledgeRefs.add(biomarker.entryId);

  const recommendations: string[] = [];
  if (!biomarker.recognized) {
    recommendations.push(
      `Biomarker "${input.biomarker}" is not in the validated-biomarker corpus — assemble a scientific-validity report (analyte–condition association) before claiming CDx status.`
    );
  } else if (!biomarker.cdxDocumented) {
    recommendations.push(
      `"${biomarker.title}" is documented but not as an established companion diagnostic for this use — confirm the intended-use alignment with the therapeutic.`
    );
  }
  if (!readiness.linkageEstablished) {
    recommendations.push('Drug↔Dx linkage incomplete: confirm therapeutic, device, biomarker, and intended-use alignment.');
  }
  for (const gap of readiness.gaps) {
    if (gap === 'clinicalValidation') {
      recommendations.push('Generate clinical validation in the therapeutic pivotal-trial population (bridge if a clinical-trial assay was used).');
    }
    if (gap === 'contemporaneousReview') {
      recommendations.push('Plan contemporaneous FDA drug+Dx review (and, in the EU, the notified-body medicines-authority/EMA consultation).');
    }
  }

  return {
    biomarker,
    readiness,
    euClassification: 'C',
    knowledgeRefs: [...knowledgeRefs],
    recommendations,
  };
}
