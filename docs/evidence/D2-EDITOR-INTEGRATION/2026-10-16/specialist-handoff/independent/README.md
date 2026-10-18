# Independent specialist handoff evaluation

W1 / D2, 2026-10-16. Initial canonical source `990a687c6` on
`concept2cure-v2`. This evaluator owns the new
`client/src/concept2cure/v2/__tests__/specialistHandoffInteraction.test.tsx`
and this evidence directory. Production changes belong to the separate
implementation agent.

The final focused run passes **19/19** cases; strict lint reports **0 errors
and 0 warnings**. Eleven source/test SHA-256 pins match before and after the
final run. `summary.json` records receipt hashes and boundaries.

The unchanged-production RED run demonstrates **9 failures and 1 pass**:
Reporting navigation did not publish a target; late project, project-away-and-back,
account and organization completions still navigated; an older refusal changed
the next project's status; an unmounted specialist still navigated; and
Biostatistics called an unbound or unconfirmed-binding document filed into the
dossier. The existing same-button duplicate guard passed.

`red-initial-includes-test-assumption.txt` retains an earlier run with one
additional test mistake: the second button lookup used its pre-busy label.
Retaining the actual DOM button corrected that test without changing product
code; `red.txt` is the meaningful corrected RED. The historical test pin belongs
to the initial ten-case version. The suite subsequently grew to nineteen cases.
`expanded-caller.txt` is a seventeen-case candidate result, not a separate RED
claim. `green-18-before-refresh-case.txt` retains the eighteen-case result
before the actual token-refresh positive was added; `green.txt` supersedes it. The initial lint receipt also retains a fixture complexity warning;
extracting the synthetic response helper removed it.

| Actual caller | Exercised outcome |
| --- | --- |
| Reporting & analytics | Exact saved doc/program/code consumed from the real editor channel at navigation; duplicate click; account/org/project changes; project away and back; same-project metadata update; actual token refresh; refusal status; unmount |
| Biostatistics | Exact editor target; false or absent binding cannot become a dossier-filed claim |
| CMC change | Exact saved doc/program/code at navigation |
| CMC quality | Exact saved doc/program/code at navigation |
| CMC correspondence | Exact target after lifecycle update; a late lifecycle refusal cannot leak status/navigation into the next project |
| Biostatistics workbench | Actual calculator insertion cannot toast an old section completion into the next project |
| Pharmacovigilance cockpit | Actual screener insertion cannot toast an old section completion into the next project |

Only API transport is synthetic. The suite renders the actual controls and
uses the canonical writer, actual AuthService session adoption/revision guard,
shell project channel and editor target writer/consumer. Successful navigation
consumes the target in its callback, so passing cannot depend on a newly-created
document sorting first. It does not mount DocumentWorkbench, run real SQL or
call a provider. Engine results are fixtures; their scientific validity is
outside this suite. Account adoption is real client service behavior over a
synthetic authenticated session receipt. The real AuthService token-refresh flow is exercised with a synthetic refresh
receipt while the section write is pending; that response retains the same
account revision and the exact target remains valid. Same-project metadata is
exercised with the actual project channel.

The existing two-request writer can still leave an empty document or an
unknown committed outcome. These cases do not establish repeat-creation
recovery or idempotency. Provider-backed AnA, independent human review and
agency acceptance remain separate work.

Reproduce with Node 22 and the repository's existing dependencies:

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run client/src/concept2cure/v2/__tests__/specialistHandoffInteraction.test.tsx
./node_modules/.bin/eslint --max-warnings=0 client/src/concept2cure/v2/__tests__/specialistHandoffInteraction.test.tsx
```

Execution used Node `22.23.3` and Vitest `4.1.7`. The stored logs retain every
diagnostic line; only trailing whitespace at EOF was normalized for repository
whitespace checks. `summary.json` preserves each original raw hash and stored
copy hash so normalization does not silently rebind historical receipts.
