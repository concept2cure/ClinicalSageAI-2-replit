# W3 / D4 — Bound intelligence recall and use canonical refusal parsing

The cached intelligence-prefix loader resolved the project before starting any
recall and had no deadline on client, project or learned-wisdom reads. A stalled
source held up the turn. prefix-red.txt records six failing pre-fix tests.

The loader now starts client recall independently and shares one three-second
budget across project resolution and all dependent intelligence reads. Healthy
context is retained. Failed/late sources are named in a model availability note:
missing recall does not prove prior intelligence or decisions do not exist.
Degraded snapshots are not cached; the next turn retries instead of inheriting
missing recall for the 60-second cache TTL. Healthy empty results still cache.
Late resolution cannot start project/wisdom reads; late dynamic imports are
checked before starting follow-up database work. Existing queries are not
cancelled. Project UUID/anchor identity and tenant scoping stay intact.

The prior AnA refusal formatter also used a hand-rolled error reader, causing the
CI error-envelope guard to fail and losing recovery codes in nested envelopes.
refusal-red.txt reproduces two nested-code failures. It now uses serverMessage
and errorCodeOf from the existing canonical reader, retaining recovery guidance
and filtering enum/infrastructure text. No baseline exemption was added.
error-envelope-green.txt records the repository guard passing with zero reads.
Stale untracked lint scratch files were preserved outside the checkout before
running that guard; they also contained obsolete reads.

prefix-green.txt records 45 tests across six suites: source stalls/rejection,
shared budget, retained wisdom, late cache protection, TTL/invalidation,
org/project identity, actual stream grounding/tool carry-over/turn recording and
memory deadlines. refusal-green.txt records 23 tests across four suites,
including nested/flat refusals, network waits and stale-stream protection.
Changed-file lint has no errors. Full compiler validation remains with GitHub
under the authorized local compiler-memory exception. Dependency/security audit
findings remain unresolved. This bounds optional intelligence recall, not total
request latency; no live speed or model-quality claim. D4 remains open pending
live deployment/provider and launch evidence.

All 26 repository guards passed (repository-gates.json). Publication import and
lint ratchet outcomes are recorded separately in publication-checks.json.

The publication warning ratchet initially caught one new max-function-lines
warning. Extracting the deadline helper restored the original warning count;
all three final publication checks passed. The 16 recall/project tests were
rerun after extraction (prefix-final-verification.txt), with no failures.
