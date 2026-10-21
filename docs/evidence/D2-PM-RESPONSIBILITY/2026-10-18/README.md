# D2 Projects — PM-03 responsibility and identity

This slice improves the existing Project home → Team & activity panel and its
existing team endpoint. It separates recorded project leadership and ownership
from sharing membership, and carries those distinctions into AnA's project
facts. The [frozen contract](contract.md) defines the response and the
responsibility/authority matrix.

## Client value

- Sponsor teams (biotech/pharma) can distinguish the coordinating lead, recorded
  project owner, and people with shared access without assuming review approval.
- Device and IVD teams retain document-specific review/signing controls while
  seeing the same account identity distinctions used elsewhere in the product.
- CRO/consultancy teams can distinguish recorded client contacts from linked
  accounts. A legacy name is never silently converted to a client observer,
  contributor, reviewer, or approver.

The panel reports linked current accounts, unconfirmed account references, and
unlinked recorded names explicitly. Same-name accounts are disambiguated. Owner,
creator, lead, and explicit member sources are independent facts. The roster is
not a list of every possible reader: organization administration, public project
visibility, and document review admission remain governed by existing policies.

## Bounds

This is a read-only projection. It adds no team assignment, delegation, access
write, generic approval control, signing eligibility calculation, assignment
date, migration, production dependency, or new navigation surface. Specialized
functional responsibility assignments and governed team changes belong to the
next PM-04 slice. Historical account references remain recorded, but current
membership must be confirmed before account details or sharing roles appear.

Each request reads on its pinned database client, uses the uniquely admitted
project anchor, and repeats canonical actor/program/sharing admission before
returning data. A changed anchor or actor snapshot withholds the roster. This
qualifies a read, not serialization of every concurrent membership change or a
persistent entitlement grant.

## Evidence

Red/green service, interface, and native HTTP/SQL logs are filed in this folder.
The native suite uses PostgreSQL 16, a disposable restricted runtime role, FORCE
RLS on tenant source fixtures, and the real route/admission implementation.
Authentication middleware and the full deployed schema are outside that narrow
fixture's proof. Synthetic identities use `example.test` addresses.

The native baseline log ran an earlier 17-case fixture: its eight failures came
from the legacy handler requiring `public.actor_name`, absent from this narrow
fixture. It is fixture-limited baseline evidence, not a red isolation of the
final 19-case suite's privacy assertions. The final native run requires healthy
200 responses and proves mid-read changes actually occurred before refusal.

The initial access-regression run exposed one stale existing test assertion:
the current actor query now explicitly binds `includePendingDeletion=false`.
The assertion records that third argument; no authorization policy was changed.
The failed and corrected runs are retained as `access-initial.txt` and
`access-green.txt`.

The first combined ProjectHome/editor run found two generic "Try again"
buttons when both document and team reads failed. The team control now says
"Retry team"; focused recovery tests and the combined run qualify that fix.
The first run is retained as `integrated-initial.txt`.

Independent review caught email and email-bearing labels entering the expanded
AnA facts. The final publisher excludes them, including names containing `@`,
and the integration suite pins that exclusion. It retains IDs, ordinary names,
source/identity distinctions, and roster totals/truncation.

`browser-check.mjs` renders the actual extracted component with synthetic data
and the product styles in Chromium. `browser-result.json` and the desktop/mobile
screenshots cover layout, separate identity states, empty/error rendering, and
retry. This is isolated component evidence, not a production browser session.

Source hashes and final verification results accompany the implementation.
Direct publication to `concept2cure-v2` does not deploy production.
