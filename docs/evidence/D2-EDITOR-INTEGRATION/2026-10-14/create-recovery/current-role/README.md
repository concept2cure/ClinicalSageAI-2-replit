# Current organization role in Authoring

W1 / D2, local human-testing preparation, 2026-10-14. The actual Codespaces
runtime smoke found that a member downgraded from administrator to viewer could
still save an owned section and create a blank document. A freshly issued viewer
token reproduced both writes; the durable `OWNER`/`AUTHOR` grants, rather than
the membership-cache window, were sufficient to authorize the save.

The canonical Authoring permission decision now applies the existing explicit
organization read-only policy (`viewer`, `readonly`, `read_only`, `guest`) before
any non-view action can use a document grant or administrator claim. The
organization-role predicate is shared with the existing program-creation policy;
its role vocabulary and unknown-role behavior are unchanged. Creation through
the existing object middleware uses the same read-only predicate, even though
there is no document ACL yet. Existing ACLs still determine which writing
members may edit, review, approve or manage a particular record.

The principal reader uses the global authenticator's uncached role only when
its account and organization both match the verified request principal. That
role takes precedence over stale JWT claims and the cached membership role.
An isolated legacy route retains its existing claims when neither current-role
source is present. This adds no authentication path, SQL lookup, cache, role
grant, migration, provider call, editor, route or dependency.

## Evidence and qualifications

- `red-complete.txt`: actual pre-change tests, 16 failures and 7 passes. Fifteen
  failures expose missing current-principal/read-only behavior: ten unit cases,
  four SQL save cases and the blank-create case. The remaining failure is an
  expected response-code shape mismatch on `/docs/from-draft`; its existing
  program-admission service already refused this viewer with HTTP 403.
- `first-green.txt`: all 23 focused cases pass after the production fix.
- `regression-before-fixture-alignment.txt`: the first 18-file regression run
  passed 289 of 291 cases. Both failures were in the existing document-access
  fixture: its old denial-copy expectation preceded the new read-only floor,
  and its mocked global gate omitted the uncached request identity after a
  direct SQL role promotion. The fixture now reads current membership into the
  request identity, as the deployed global auth gate does. It retains every
  ACL, signing-authority and sealed-record assertion.
- `access-fixture-after.txt`: all eight document-access cases pass, including
  role promotion to reviewer followed by demotion to viewer and the existing
  current-grant/signing-role restrictions.
- `regression-final.txt`: final full selection, all 291 tests across 18 files
  pass in one run. This includes the 23 new focused cases, existing object ACL
  and creation classification tests, real section-save/evidence tests,
  authentication and revision contracts, program policy, source import,
  from-draft, peer review, signing authority and permission management.
- `post-sync-verification.json`: the same full 18-file / 291-case selection
  passes again after synchronization to canonical base
  `4997d35ebd6a17bfb33df7860195d832bc094921` (99.83 seconds, exit 0).
  All seven stored current-role source pins match, and strict six-file lint
  again has zero errors and warnings. `post-sync-regression.txt` and
  `post-sync-lint.json` retain the actual outputs. No production or test source
  was changed for this recheck; earlier receipts keep their original bases.
- `lint.json`: six changed implementation/test files have zero errors and zero
  warnings. `router-lint.json` retains the router's existing 23 warnings; no
  baseline was changed.

The SQL route regression verifies no document, section, revision, audit or
permission changes on refusal; current-owner reads continue to return the saved
record. A current member with the existing Author grant can save and receives
one additional revision and audit. Foreign-tenant and frozen records retain
their existing refusal. Unit cases additionally exercise all six non-view
actions, foreign-account/foreign-organization identity rejection, explicit
read-only aliases, and narrower ACLs for ordinary, signing and custom roles.

PGlite uses the actual canonical migrations and production Authoring router and
object middleware. Its small outer authentication fixture verifies the JWT and
reads membership through SQL; it models the global gate rather than loading the
entire application. It does not prove native PostgreSQL RLS or concurrency.
The independent actual Node 22 / PostgreSQL `app_service` runtime replay is in
[`../local-runtime/final-node22/summary.json`](../local-runtime/final-node22/summary.json).
That replay verifies original administrator and fresh viewer tokens both receive
HTTP 403 for save and blank creation, existing document reads return HTTP 200,
and durable owner grants and document counts stay unchanged.

For repository whitespace checks, the six stored `.txt` test receipts have one
terminal newline: exactly one redundant trailing LF was removed from each raw
tool output. Every preceding byte is unchanged. `receipt-normalization.json`
retains each original `rawSha256` and the normalized `storedCopySha256`; the
receipt indexes also retain `rawSha256` and use `sha256` for the stored file.
This normalization changes no source, test result or prior source qualification.
