# W3 / D4 — Interrupted answers stay visibly incomplete

The founder asked to continue and clarified that AnA should feel like the
assistant in the working conversation. After publishing the conversation history
and command-response fixes, this pass addresses a separate interruption defect.

The hook retains partial answer text on a stream failure and marks it interrupted.
The shared activity projection did not carry that interruption into the rail or
full conversation, and a stored turn record could make the remaining partial
text look like a normally finished answer. The correction carries actual partial
response state into the shared presentation so the person sees that the answer
is incomplete and can explicitly request continuation on the latest settled turn.

A no-text refusal (for example authentication or unavailable service) must retain
its accurate failure message and must not gain a misleading Continue action.
HTTP 401 and 403 responses now explain sign-in/access recovery instead of claiming
a network failure; the generic failure text no longer diagnoses a cause it cannot
know. Existing provider-configuration and usage-limit explanations remain intact.
Nothing retries automatically or changes execution/approval authority. Storing a
turn's audit record is distinct from completing its answer.

Behavioral red/green evidence is under `client/`; repository gate results are
alongside this file. Focused and adjacent coverage totals 120 passing distinct
cases, including the final corrected assertion run documented in `client/`.
No live-provider latency or production end-to-end claim is
made. D4 remains open pending its full launch evidence. The previously approved
local full-typecheck memory exception applies; GitHub's unchanged compiler gate
verifies publication.

The preceding published change is 38c4ce10161b3163567e75acd59b971dafe6e82b.
Its browser smoke and full TypeScript/ESLint workflow both passed:

- https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37401385783
- https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37401385734

The broader CI dependency-risk audit still reports unreviewed high/critical
findings on unchanged dependency versions. No dependency or audit baseline is
modified by these AnA fixes.
