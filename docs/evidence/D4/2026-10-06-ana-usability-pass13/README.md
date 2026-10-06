# W3 / D4 — Verify conversation access before private memory recall

Both AnA chat paths assembled working memory from the raw caller-supplied
thread ID before the existing caller-scoped thread check. The stream could
retain that summary when subsequent thread persistence failed; the shared
builder could retain it even when its later history check found no accessible
thread. red-tests.txt records seven failing regressions before the fix.

The stream now performs its existing thread resolution and user-message save
before private memory assembly. A foreign-thread refusal ends the turn before
memory or the model runs. A persistence failure leaves the verified ID empty,
so conversation memory cannot read the supplied ID. Organization/project
memory remains available. The shared builder starts one access-check promise,
uses its resolved ID for memory, and reuses it for history. Failed or missing
access contributes no private thread ID. Existing client-history fallback and
thread creation behavior remain unchanged. Mandatory access checks have no
optional timeout; independent org/project recall retains its earlier overlap.

Seven new regressions cover verified IDs, failed/missing access, pending access,
single-check reuse, stream persistence failure, and foreign-thread refusal.
validation-tests.txt records 71 passing tests across seven suites, including
memory deadlines/mode, thread program keys, chat-path parity and stream follow-up
behavior. All 26 repository guards passed. Changed-file lint has zero errors
and the same 28 existing production-file warnings, with none in tests. Final
import and lint ratchet checks are recorded in publication-checks.json.

Scope is the two AnA chat context paths, not a certification of every memory
API. No new capability, dependency, model or policy gate is introduced. This
proves caller ordering and prompt exclusion under failures, not measured live
latency, deployed RLS behavior or response quality. Full TypeScript validation
remains with GitHub CI under the user's authorized local-memory exception.
The preceding pass12 CI cleared full/beta TypeScript, lint, security contracts,
AnA readiness and production boot jobs; dependency audit and Trivy filesystem
failures remain open. D4 live deployment/provider and launch evidence remain open.
