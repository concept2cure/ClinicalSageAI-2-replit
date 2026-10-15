/**
 * How a placed Module 3 section snapshot is recognised wherever it is read.
 *
 * place-module3-into-submission files each approved section as a
 * coauthor_documents row whose content is the composition's markdown (the same
 * bytes as the governed artifact) and whose metadata.placedFrom is this value.
 * The eCTD leaf resolver reads the marker to typeset that markdown rather than
 * print it. One constant, so the writer and the reader cannot drift apart.
 * Standalone so the ectd layer can import it without loading the placement
 * service and its submission-service graph.
 */
export const MODULE3_PLACED_FROM = 'cmc-module3-os';

export function isModule3PlacementSnapshot(metadata: unknown): boolean {
  let value = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { placedFrom?: unknown }).placedFrom === MODULE3_PLACED_FROM
  );
}
