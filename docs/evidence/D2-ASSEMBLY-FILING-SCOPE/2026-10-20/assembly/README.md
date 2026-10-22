# Assembly filing scope evidence

Scope: the existing assembly resolver, its internal target fingerprint and the
existing preparation compatibility validator. No editor, public DTO, schema,
provider, template identity or creation/binding policy was added.

## What already exists

The existing HTTP service authorizes the current project and document before
resolving a template or reading selected sources. It previews and recomputes an
append/preserve plan inside the canonical writer transaction. The resolver already
handled built-in, global and tenant templates, module placement and recorded
parent template scope. The preparation service already owned exact device
component compatibility. The plan already had separate target and template
snapshots. These paths were extended in place, using the canonical catalog,
document-class, program registry context and region identity helpers.

The initial resolver did not verify a saved bound filing, and its recorded parent
check did not reject same-region incompatible components. Tests reproduce both
before implementation. Searches and the complete scope contract are recorded in
the parent packet and design document.

## Implemented behavior

- A saved bound identity is read in the actual tenant/project before template
  sections or selected source text. Missing/foreign bindings return 404;
  unreadable, incoherent or unmapped recorded operations return an explicit 503.
  Neither condition becomes an unbound fallback.
- The eight exact regional device application classes retain their exact agency
  or registered certification body. Full registry templates and components use
  existing canonical classes and preparation compatibility. Same-region PMA /
  510(k) and MDR / IVDR conflicts are refused.
- Stored templates retain their current manual assembly behavior. Explicit
  regions and receiving authority must fit the verified bound scope. Unknown
  region/body declarations are unverified. Multi-region and GLOBAL/ICH generic
  worksheets are preserved. ICH storage fallback cannot borrow FDA authority for
  a Canadian home project, and a truly GLOBAL recipient cannot establish US scope.
- Legacy IND Module 1 and whole-phase sources require verified US IND bound
  scope. Common medicinal Modules 2–5 remain available. Deliberately unbound
  regional working documents, including Canadian NDS, remain available in any
  otherwise authorized project with the appropriate module.
- Actual bound id, owner, project, class, body, filing scope and consulted program
  inputs are included in the target snapshot. Changing the bound class after a
  valid common-module preview invalidates commit. Unbound target fingerprints and
  immutable template snapshots are unchanged.
- The actual HTTP producer is exercised through Canadian manual assembly into a
  blank, no-parent document and then the saved whole-document critique consumer
  on the same fixture connection. Bounded pages retain every appended section's
  exact source identity and limitations. Parent template ID stays null; empty
  structure still needs authored text; writing precision is separate from
  approval/evidence verification; review performs no section/evidence writes.

## Command records

Each JSON receipt records the exact argv, actual child exit code, elapsed time,
raw output name and compressed-output SHA-256, source SHA-256 values and source
drift. Raw output is retained as deterministic gzip (`mtime=0`). The wrapper's
successful process exit is not the Vitest/ESLint child result; use `exitCode`.
Node 22 is selected through
`PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH`; Vitest uses
`NODE_OPTIONS=--max-old-space-size=4096`.

| Receipt | Actual result | Purpose |
| --- | --- | --- |
| `red.json` | exit 1; 41 failed / 63 passed | Original bound identity, component and stored-scope failures; exact regional positives require a scoped locked read. |
| `scope-snapshot-red.json` | exit 1; 1 failed / 53 skipped | Otherwise compatible common template committed after actual bound class changed. |
| `chosen-operation-red.json` | exit 1; 1 failed / 52 skipped | Saved US EUA choice borrowed the PMA program class. |
| `implicit-regional-scope-red.json` | exit 1; 5 failed / 2 passed / 55 skipped | Implicit IND M1/whole-phase and explicit regional sources entered other or unresolved bound scopes. |
| `declared-authority-red.json` | exit 1; 1 failed / 1 passed / 62 skipped | Explicit FDA authority bypassed Canadian home scope through ICH storage; matching Canadian authority remained valid. |
| `green.json` | exit 0; 226 passed / 6 files | All owned scope, actual HTTP, plan, guidance, transaction and preparation regressions before test-only extraction. |
| `lint-green.json` | exit 0; 0 errors / 0 warnings in 6 files | Final owned production/tests, including extracted HTTP case registration helper. |
| `fixed-sql-lint.json` | exit 0; 0 errors / 0 warnings in 6 files | Subsequent SQL static-gate spelling fix; two complete query literals retain the same predicates, parameters and commit lock. |

Intermediate failed candidates remain recorded. `candidate.json` (106 passed /
1 failed) expected a mismatch rather than the correct unverified refusal for an
unmapped saved clinical-investigation authority; the test was corrected to the
approved partial canonical mapping. `regional-review-candidate.json` (116 passed /
1 failed) exposed canonical stored `hc` normalization for a non-exact regional
class. The resolver now derives that authority's region from existing
`AGENCY_TO_CODE` keys. `lint-candidate.json` exposed new complexity and file-length
warnings; small local helpers and extracting only new HTTP cases into the
existing fixture's registration helper removed every warning.

The repository advanced to canonical `38c7f1606` during this work, with no owned
source overlap. Root then installed that canonical lock (Vite 6.4.4 and
follow-redirects 1.16.1). The 226/6 receipt predates the test-only extraction and
that install; it is not a post-extraction/new-lock regression claim. The
post-extraction scoped lint is GREEN. Root owns the required final combined
verification, which includes all six suites and the actual HTTP registration
consumer. Its separate combined receipt must be used for the final qualified
source state. The earlier `final-source-pins.json` is retained;
`fixed-sql-source-pins.json` supersedes it after the query-only static-gate fix.
No earlier GREEN receipt is represented as testing that subsequent spelling.

## Practical limits

Known saved choices without an existing canonical document-class/authority
mapping (for example US EUA or the clinical-investigation authority) explicitly
remain unverified on bound targets. No deficiency-only alias or nearest FDA
class is substituted. The remedy is to check the saved filing or use a matching
unbound working document; all regional working-copy templates remain available.

Stored organization/global assembly receipts still lack full immutable source
and guidance metadata. This change does not invent it; whole-document oversight
must report that limitation rather than borrow unrelated parent guidance.

Fixtures verify deterministic behavior, current access and transaction/evidence
preservation on single-connection PGlite. They do not establish native PostgreSQL
concurrency, fresh production installation, live providers, human acceptance,
current complete agency forms, regulatory completeness, approval or transmission.
