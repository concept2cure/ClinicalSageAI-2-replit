# Current IND placement inventory and readiness

Launch workstream W5; supports D2/D7. Enhancement of the existing checklist and
Ana context. No new module, provider, production dependency, schema, or model.

## Scope and semantics

The checklist represents **current working placement inventory**, folded in
sequence-number order. It does not represent an agency-accepted dossier and
includes working sequences. Agency receipt and dispatch retain their independent
gates. Initial-IND requirement applicability remains the existing evaluator's
responsibility; this change does not qualify amendment-specific completeness.

The old aggregation kept the most advanced status across all historical leaves.
An approved document could hide a later draft, and a withdrawn authored or
sponsor-completed FDA form could still receive completion credit.

The read now:

* uses the publisher's existing document source identity, normalized section
  codes, and sequence numbers rather than insertion IDs;
* carries untouched placements forward and folds repeated identities once;
* removes a named withdrawal's matching document only;
* binds a section-only withdrawal only when exactly one current leaf matches;
* keeps separate document identities separate, including within one section;
* derives section status from the least complete current authored document;
* blocks readiness for unbound replace/append/delete or unknown operations;
* gives Ana the same blocker reasons the readiness screen receives.

A different document ID is not automatically a replacement of another document
merely because its section matches. The publisher would also refuse that
identity guess. The checklist reports an unbound declared replacement as a
blocker. Retained files, historical leaf rows, and approval records are not
changed or deleted by this read.

The earlier tests expecting one document's approval to outweigh another current
unsigned freeze/draft now assert conservative completion. Both documents remain
current unless lifecycle identity establishes otherwise. A signed upload still
satisfies the form through the existing sponsor-completed-form rule.

## Evidence

Before implementation, four new PGlite regressions failed: a hidden later draft,
a named withdrawal retaining an approval, a withdrawn authored form remaining
complete, and a section-only withdrawal retaining the old section.

The expanded tests cover sequence IDs inserted out of order; untouched section
carry-forward; named and unique/ambiguous section withdrawals; unknown withdrawal
targets; append deduplication; unbound replacement; soft-deleted sequences; and
withdrawn official forms whose retained bytes and history remain intact. A UI
regression verifies that 100% section/form completion with an unresolved lifecycle
still says NOT YET FILEABLE and gives Ana the explicit blockers.

Final scoped run: **121 tests passed in seven files**, including the authoring
journey, tenant/status-write protections, checklist SQL integration, readiness,
route authorization, and program/readiness UI tests. Production build passed.
Changed-file ESLint passed with no errors. The warning ratchet passed with
no increase in warnings across the five changed TypeScript files.

Full TypeScript runs in the existing GitHub CI Lint job. The preceding session
reproduced the local compiler exceeding this workspace's 8 GB memory limit; that
resource failure is not a successful type check. No compiler configuration,
baseline, workflow, or gate was weakened. Check CI before calling this fully
validated.

## Remaining work

Batch draft persistence, canonical review projection, document deletion
UI/API enforcement, and live provider/tenant/reviewer qualification remain
separate unfinished findings. This evidence does not claim an IND submission,
agency acceptance, full platform qualification, or production deployment.
