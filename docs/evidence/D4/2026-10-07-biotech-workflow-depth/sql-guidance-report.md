# W2 / D4 — IND amendment guidance / SQL scanner regression

The prior source CI run [37561923068](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37561923068), Blank DB job 112605751003, passed provisioning and deploy-smoke, then failed `ci:tables-live-schema` at 2026-10-07T02:47:11Z. The live-schema ratchet reported one new absent relation: `affected`, referenced by `server/services/regulatory/registry/blueprints/usIndAmendmentBlueprint.ts`.

This was an authoring-prose false positive. The existing migration-reachability parser accepts quoted strings containing `Select ` as plausible SQL. The CMC guidance then contained `update affected quality sections`, which its relation scanner read as `UPDATE affected`. The scaffold executes no database query; adding a table or expanding a baseline would conceal the diagnosis.

The production correction changes one word: `update` becomes `revise` in that guidance. Scientific scope, section identity, canonical component references and requirement flags are unchanged. No parser, gate, baseline or migration changed.

`tests/regulatory/ind-amendment-sql-guidance.test.ts` uses the existing exported parser, not a duplicate parser. It preserves a historical sentence demonstrating the detected phantom relation, checks the actual complete scaffold has no SQL references, and checks the entire server scan contains no `affected` relation.

- `sql-guidance-red.txt`: the actual blueprint and whole-server assertions failed before the wording correction (2 failed, 1 passed).
- `sql-guidance-green.txt`: all 20 tests passed in the dedicated regression file and existing migration-reachability parser contract.
- `sql-guidance-lint.txt`: ESLint passed for the two changed source/test files with no errors or warnings.
- `git diff --check` passed for the owned files.

This local verification proves the detected reference is gone without changing the live-schema check. A fresh pushed-source Blank DB CI run is still required to report that entire job green; this note does not assert one ran locally.
