/**
 * Run order of the GA demo seed's domain parts (scripts/seed/ga-demo.d/*.mjs):
 * the number a part's file name starts with, then its name.
 *
 * 2026-09-28 (W5/D7, WO-9): the orchestrator sorted the names as strings, so
 * every 1xx part ran before `20-…`. `111-ind-program.mjs` and
 * `112-ind-authoring-doc.mjs` read the regulatory programs that
 * `80-programs-tlf-pdev.mjs` creates; on a fresh database both found none and
 * skipped, and the demo IND's submission spine and authoring document appeared
 * only after a second seed run. A part without a leading number runs last.
 */
const partNumber = (file) => {
  const m = /^(\d+)-/.exec(file);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

export function orderDomainParts(files) {
  return [...files].sort((a, b) => {
    const byNumber = partNumber(a) - partNumber(b);
    if (byNumber !== 0 && !Number.isNaN(byNumber)) return byNumber;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
