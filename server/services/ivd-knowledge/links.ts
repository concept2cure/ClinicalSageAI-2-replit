/**
 * Knowledge linkage — connects the lifecycle engines to the IVD knowledge base.
 *
 * Maps a lifecycle "concept" (an engine/calculator output area) to the
 * knowledge-base entry ids that explain and justify it, and resolves them into
 * compact citations. This keeps the pure engines dependency-free (they never
 * import the corpus) while letting the route layer surface authoritative
 * sources alongside computed results.
 */

import { getEntry } from './knowledge.service';
import type { Citation } from './types';

export type LifecycleConcept =
  | 'ivdr-classification'
  | 'analytical.stability'
  | 'analytical.carryover'
  | 'analytical.hook-effect'
  | 'analytical.recovery'
  | 'analytical.cutoff'
  | 'analytical.traceability'
  | 'scientific-validity'
  | 'software.safety-class'
  | 'software.sdlc'
  | 'software.cybersecurity'
  | 'change.fda-510k'
  | 'change.eu-significant'
  | 'process-validation'
  | 'signal.disproportionality'
  | 'authoring.psur'
  | 'authoring.emdr'
  | 'authoring.mir'
  | 'authoring.fsn'
  | 'registration.fda'
  | 'registration.eu'
  | 'declaration-of-conformity';

const CONCEPT_TO_ENTRIES: Record<LifecycleConcept, string[]> = {
  'ivdr-classification': ['eu.ivdr.classification-rules', 'mdcg.2020-16-classification', 'eu.ivdr.conformity-routes'],
  'analytical.stability': ['sci.ivd.stability', 'std.iso-23640'],
  'analytical.carryover': ['sci.ivd.interference', 'std.clsi-ep05'],
  'analytical.hook-effect': ['sci.ivd.interference', 'sci.ivd.linearity'],
  'analytical.recovery': ['sci.ivd.linearity', 'sci.ivd.analytical-performance-overview'],
  'analytical.cutoff': ['sci.ivd.roc-cutoff', 'sci.ivd.reference-intervals'],
  'analytical.traceability': ['sci.ivd.traceability', 'std.iso-17511'],
  'scientific-validity': ['sci.ivd.scientific-validity', 'eu.ivdr.performance-evaluation', 'mdcg.2022-2-performance-evaluation'],
  'software.safety-class': ['std.iec-62304', 'mdcg.2019-11-software'],
  'software.sdlc': ['std.iec-62304'],
  'software.cybersecurity': ['fda.ivd.expedited-programs', 'std.iec-62304'],
  'change.fda-510k': ['legal.ivd.change-significant', 'fda.ivd.510k-pathway'],
  'change.eu-significant': ['legal.ivd.change-significant', 'mdcg.2020-3-significant-change', 'eu.ivdr.transition-timeline'],
  'process-validation': ['std.iso-13485'],
  'signal.disproportionality': ['eu.ivdr.pms-pmpf'],
  'authoring.psur': ['eu.ivdr.pms-pmpf'],
  'authoring.emdr': ['fda.ivd.classification', 'eu.ivdr.pms-pmpf'],
  'authoring.mir': ['eu.ivdr.pms-pmpf'],
  'authoring.fsn': ['eu.ivdr.pms-pmpf'],
  'registration.fda': ['fda.ivd.definition-and-ruo-iuo', 'label.fda.udi'],
  'registration.eu': ['eu.ivdr.notified-bodies', 'eu.ivdr.conformity-routes'],
  'declaration-of-conformity': ['eu.ivdr.conformity-routes', 'label.eu.ivdr-annex-i-ch3'],
};

export interface KnowledgeLink {
  id: string;
  title: string;
  summary: string;
  citations: Citation[];
}

/** Resolve a lifecycle concept (or explicit ids) into compact knowledge links. */
export function knowledgeFor(concept: LifecycleConcept | string[]): KnowledgeLink[] {
  const ids = Array.isArray(concept) ? concept : CONCEPT_TO_ENTRIES[concept] ?? [];
  return ids
    .map(id => {
      const e = getEntry(id);
      return e ? { id: e.id, title: e.title, summary: e.summary, citations: e.citations } : null;
    })
    .filter((x): x is KnowledgeLink => x !== null);
}
