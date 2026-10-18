import type { DeliverableSourceEvidence, DeliverableSourceRef } from '../../../shared/types/submission-api';

/** Optional retained-source proof. Legacy callers retain their existing ABI. */
export interface PathwayEvidenceLeaf {
  sourceRef?: DeliverableSourceRef;
  contentEvidence?: DeliverableSourceEvidence;
}
export interface PathwayEvidenceSlot {
  sourceRefs?: DeliverableSourceRef[];
  contentUndetermined?: boolean;
}

/** Identity follows the actual matched objects; display labels never resolve it.
 * A verified substantive source satisfies a slot even when another matched
 * source is unavailable. The unavailable source remains inspectable in refs. */
export function matchedSourceEvidence(
  matched: PathwayEvidenceLeaf[], sourceAware: boolean | undefined, legacyPresent: boolean,
): { present: boolean } & PathwayEvidenceSlot {
  if (!sourceAware) return { present: legacyPresent };
  const evidence = (leaf: PathwayEvidenceLeaf) => leaf.contentEvidence;
  const present = matched.some(leaf => {
    const proof = evidence(leaf);
    return !!leaf.sourceRef && proof?.content === 'substantive' && proof.pin === 'match' && proof.lifecycle === 'finalized';
  });
  const unknown = matched.some(leaf => {
    const proof = evidence(leaf);
    return !leaf.sourceRef || !proof || proof.content === 'undetermined' || proof.pin === 'mismatch' ||
      (proof.content !== 'non-substantive' && (proof.pin !== 'match' || proof.lifecycle === 'unverified'));
  });
  return {
    present,
    sourceRefs: matched.flatMap(leaf => leaf.sourceRef ? [leaf.sourceRef] : []),
    contentUndetermined: !present && unknown,
  };
}
