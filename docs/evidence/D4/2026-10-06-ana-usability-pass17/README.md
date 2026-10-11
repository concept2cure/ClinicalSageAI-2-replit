# W3 / D4 — Clear abandoned run controls when switching conversations

Reset and loadThread cleared the transcript and streaming flag before the old
stream settled, but left the old run ID, pause/hold state, sent policy and queued
steers live. During a stalled old read, the new conversation could show Manual
controls from the previous one, and its pause/resume/interject calls still sent
to that old run. red-tests.txt records four failures across reset and thread switch.

Both paths now use one abandonment helper: halt the drive, clear the current run
ID and its pause/hold/policy/pending-steer state, release streaming state, and abort
the previous stream. The previous controller remains available for existing
identity-scoped cleanup and drive_turn_end delivery; a replacement stream owns
a different controller. Delayed old control acknowledgments cannot update the
new state because the old run is no longer current. Old turn-record confirmation
still uses the old turn's own run ID. Existing server permissions, control request
timeouts and Stop's server-cancel-before-disconnect behavior are unchanged.

Six new cases cover immediate UI-state release, no current-conversation control
requests to an abandoned run, and delayed acknowledgments, for both reset and
selection. The complete 25-suite selection passes 217 tests, including all chat
hook tests and both hosts' history/interruption behavior. Existing drive shutdown,
replacement-stream isolation, stopped-turn recording, history deadlines and
final completion tests remain green. All 26 repository guards passed. Explicit
--no-ignore lint has zero errors and 36 existing hook warnings, none in the new
test. Final publication checks and warning comparison are recorded separately.

Pass16 Tier 5 browser smoke passed. Its CI secret scan and security contracts
passed; Lint was still running and Security Scan failed at inspection. Full
TypeScript validation for this pass remains with GitHub CI under the user's
authorized local compiler-memory exception. Earlier broad Test/Integration/
Coverage failures and dependency/security findings remain unresolved. This pass
proves client switch/control behavior under held transport reads; live latency,
provider quality and D4 deployment/launch evidence remain open.
