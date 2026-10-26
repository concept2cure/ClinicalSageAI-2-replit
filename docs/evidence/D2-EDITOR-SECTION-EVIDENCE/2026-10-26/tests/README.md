# Exact-section evidence query: focused pure checks

W1 / D2, local/Codespaces. Contract:
`docs/design/EDITOR_SECTION_EVIDENCE_2026-10-26.md`.

## What already exists

`authoring-assembly-plan.ts` owns normalized template-row selection, structural
validation and plan fingerprints. The completion adds `assemblySourceQuery`
inside that same owner and reuses its existing selection validation.
`ana/draft-source-window.ts` already owns deterministic relevance, Japanese
compound/bigram grouping, the forty-term bound and opening/whole fallback.
`authoring-assembly-sources.ts` already enforces exact actor/source admission,
eight-thousand-character spans, hashes and manifest replay.

The new `services/authoring/__tests__/assembly-source-query.test.ts` calls the
actual query helper, existing planner and existing source-window selector. It
does not mirror a tokenizer, validator or relevance algorithm. Its source
passages are synthetic engineering cases, not expert relevance judgments.

## Execution boundary

This worker prepared its cases before the helper existed and deliberately did
not execute them then. `prepared-inputs.json` and its gzip snapshots retain that
preparation epoch; it is not RED evidence. The root's existing authenticated
HTTP/SQL route tests supply the meaningful pre-fix failures in the sibling
`http/` packet. A missing export is not counted as a product failure.

After root reported the helper ready, `GREEN.txt` records all eighteen focused
cases passing with exit 0. `LINT.txt` is intentionally empty: strict ESLint
`--max-warnings=0` exited 0 with no warnings or errors. Both result JSON files
record exact commands, UTC times, durations and unchanged pinned inputs. No
focused test changes were needed after the helper became available.

The focused cases cover canonical normalized input while retaining raw title
and guidance, separation from renamed saved headings, generic/other-section
exclusion, title-first term ordering, persisted title-only templates, English
and Japanese guidance-only matches, no-match and stop-only opening fallback,
short-source whole fallback, exact unchanged document-target queries, missing
selection and invalid/duplicate/empty templates.

## Independent source review and integrity

A read-only comparison of the two production owners against the prepared
snapshots found no blocking issue. Both planning and query selection reuse the
private normalized row validator. Exact-section queries contain only raw
canonical title and guidance; document-target queries retain the exact previous
string. Pure structural planning precedes selected source body reads. Failed
source verification still throws instead of returning the temporary plan, and
the final source-bound fingerprint is rebuilt through the same planner.
Source admission, reservation, manifest schema, pinned replay and selector
semantics are unchanged.

`green-inputs.json` pins the exact production, test, selector, manifest,
configuration and contract bytes exercised. `final-inputs.json` records their
final agreement with that epoch and identifies changes since preparation. The
unchanged lockfile is hashed only. Every retained gzip snapshot was decompressed
and verified against its phase hash; `ARTIFACTS-SHA256.json` hashes all other
files in this worker packet.

No HTTP provider, generated prose, citation, approval, model-consumption or
whole-source-review claim is created by these checks. This worker runs no
production build, compiler, global gate, Git operation or live provider call.
