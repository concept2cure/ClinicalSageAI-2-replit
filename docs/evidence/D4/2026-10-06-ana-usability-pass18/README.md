# W3 / D4 — Keep retained drive Stop controls bound to their original stream

The shell can retain a turn's drive controls after that turn ends or is replaced.
Reports, steering and move acknowledgments already check their original run's
ownership. Stop alone read stopRef without ownership, so a retained old control
cancelled whichever reply was current. red-tests.txt records two failures after
completion/reset, with the two active-Stop controls passing before the fix.

The drive Stop callback now compares its own stream controller with the current
one before calling the existing Stop path. Stream identity is deliberate: active
Stop must also work before run_started supplies a run ID. A completed or replaced
turn cannot stop a newer reply. This changes no server control policy, approval,
permission or timeout behavior. The active Stop still halts screen driving,
awaits bounded server cancellation when a run exists, and then disconnects its
stream; report, steer and move channels remain unchanged.

Four new tests exercise old controls after completion/reset and active Stop both
before and after run_started. The final 26-suite selection passes 221 tests,
covering all chat hooks and both hosts' interruption/history behavior, queued
controls, replacement streams, stopped-turn records and the preceding fixes.
All 26 repository guards passed. Explicit --no-ignore lint has zero errors and
36 existing hook warnings, none in the new test. Publication checks and an
explicit hook warning comparison are recorded separately.

Pass17 Tier 5 browser smoke passed. Its CI secret scan and security contracts
passed; Lint was still running and Security Scan failed at inspection. Full
TypeScript validation remains with GitHub CI under the user's authorized local
compiler-memory exception. Earlier broad Test/Integration/Coverage failures,
dependency/security findings and D4 deployment/launch evidence remain open.
This verifies client Stop ownership under controlled streams, not live provider
quality, latency or a regulatory qualification claim.
