# Durable sharing and review prerequisites: static source phase

W1/D2-D3, 2026-10-14. The existing two sole legacy creator files now reach the
canonical incremental C2C applier before the unchanged isolation tail. No new
creator, blanket manifest, schema model, scanner, baseline or permission
exception was added. Golden prerequisite paths and assertions remain.

The existing review creator adds nullable updated_at without a default or
backfill, then sets NOW only for future inserts. Current whole-model review
SELECT/RETURNING requires the column; the declared model is already nullable.
Older unknown update times must remain NULL. Both creators verify current
columns, integer NOT NULL tenant identity and actual semantic immediate unique
keys, refusing incomplete stores instead of rewriting rows or constraints.
Existing timestamp/default/index-name differences are documented honestly.

The focused static suite was first **4 failed/1 passed** on the prior source.
Final new-plus-role-index neighbour suites passed **9/9**, two files, zero
skips, 1.77 seconds. The first ESLint invocation ignored the MJS file and is
retained without using it as source qualification. Forced --no-ignore lint,
compared against the exact pinned prior file through its canonical filename,
reports **0 errors and the same 4 existing warnings** before and after;
warning growth is zero. The new test has no errors or warnings.

Unchanged journey reachability (all 55 declared files), set ordering,
DROP-safety, duplicate-table creator, model/migration agreement and guard
ordering checks all pass without baseline or scanner changes. These checks
are static; they do not execute the amended SQL or establish physical RLS.

Actual two-pass SQL replay, malformed/duplicate-store refusals, retained
historical NULL and strict blank-provisioning/native qualification remain
**pending** their coordinated slots. Earlier sealed provisioning/golden
evidence remains unchanged as earlier snapshots. The independent role-index
SQL follow-up is filed separately and does not substitute for this proof.

Final source pins, exact prechange source pins, raw hashes and copy
normalization are recorded alongside. All original /tmp logs remain.
