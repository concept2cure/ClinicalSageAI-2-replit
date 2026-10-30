# Existing project profile cards: UI qualification

The existing Author-side Memory and Instructions cards now share one scoped read of the current project's saved intelligence profile. Readiness and ProjectSkills keep their existing owners. The UI adds no surface, writer, model call or context injection.

## Recorded executions

Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, standard repository Vitest configuration. Runtime files remained frozen. Test files were frozen during each final execution; the dedicated fixture was corrected and its focused cohort rerun after the separately retained compiler diagnostic.

| Evidence | Result | Scope |
| --- | --- | --- |
| `ui-fail-first.txt` | 1 meaningful failed case | Existing ProjectSide could not display the returned recorded strategy; it still rendered the not-read cards. This was an actual mounted product boundary, not a missing-provider failure. |
| `ui-first.txt` | 79 passed, 2 failed | Intermediate fixture diagnosis: a profile value duplicated its heading, and a recovered MDx assertion expected an old heading. These are not reported as production defects or final qualification. |
| `ui-focused-final.txt` | **81 passed / 5 files**, exit 0, 12.57s | Final corrected fixture: recorded-context suite 26, unselected-side case 1, settings 36, Home settings 4, current LaunchScope 14. |
| `ui-retained-final.txt` | **120 passed / 12 files**, exit 0, 27.26s | Existing team, identity, readiness, Submit, sharing, task-assignment, CSS, MDx and catalog consumers. |
| `ui-lint.txt` | Exit 0; empty output, **0 errors / 0 warnings** | All five owned source/test files. The earlier unused-import warning is retained in `ui-lint-first.txt`. |

The two final test selections do not overlap: **201 distinct cases across 17 files**, from separate runs. Historical 2026-10-23 counts and repeated intermediate checks are not added to this result. The focused log retains two React `act(...)` warnings from fixture-side asynchronous updates; the retained log contains nine existing parent/MDx asynchronous-update warnings. They are preserved as emitted, not assertion failures or lint diagnostics.

Root's full compiler found four genuine type errors in the new test fixture: the current auth user has `roles: string[]`, and identity changes use `publishShellProject`, while `updateShellProject` excludes `id`. The fixture now supplies the actual role shape and calls the canonical project publisher for real switches and same-frame roundtrips. Every assertion is retained, without casts or suppressions. `ui-focused-before-fixture-corrections.txt` preserves the preceding passing runtime run; it is not represented as compiler-qualified. No runtime or retained-suite source changed for this correction, so the 120-case retained run remains separately applicable.

## Proven boundaries

The dedicated suite mounts actual ProjectSide, ProjectRecordedContext, existing ProjectSkills/readiness consumers, canonical auth service/session helpers and shared wire guards with route-aware synthetic API/tenant seams. It checks one GET for both cards, exact bearer/org/client headers, all recorded field categories, explicit source and instruction separation, nullable confidence, escaped text, bounded lists with shown/total counts, authoritative no-profile versus empty fields, loading, malformed/foreign receipts, HTTP refusal/failure, retry and an unselected workspace binding the response's actual saved parent.

Ownership checks cover delayed account, role, organization, workspace, project and same-frame A→B→A changes; token-only replacement before React rerenders; loaded workspace withdrawal; a retained retry action after bearer replacement; and ordinary canonical same-account refresh. Old replies supply no saved text or false absence claim. No create/update request is dispatched.

The recovered Home test keeps the actual auth-service fixture, removes its duplicate anonymous mock and expects the accepted six project steps. Both generic and IVD settings-save cases preserve their prior metadata/activity, Review retention and no-navigation assertions. The IVD case returns to the current Plan step to inspect its analytical work package under the current “What this 510(k) needs” heading.

Root's real-component synthetic browser first exposed a long-source overflow. The owned two-card wrapper now permits shrinking and wraps every recorded source/list field. Root separately retained the failed capture and reports green 1280px/390px checks and visual inspection. Browser evidence and its exact synthetic boundaries are root-owned; these unit counts do not claim deployed-client acceptance.

## Owned source list and limits

- `client/src/concept2cure/v2/surfaces/ProjectRecordedContext.tsx` — one current scoped read, two recorded-profile cards; 129 lines.
- `client/src/concept2cure/v2/surfaces/ProjectSide.tsx` — reaches that reader in the existing cards' location.
- `client/src/concept2cure/v2/__tests__/ProjectRecordedContext.test.tsx` — 26 cases; 189 lines.
- `client/src/concept2cure/v2/__tests__/projectSideNotRead.test.tsx` — unselected-project read/absence protection.
- `client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx` — recovered fixture/current-journey assertions only.

Saved profile content is not verified evidence, a readiness verdict or a grant. Profile instructions remain distinct from authored project instructions and ProjectSkills. The display is segment-neutral and does not combine or change those sources. No CSS file, dependency, schema, persistent cache, provider call or instruction writer was added. Root owns server/native qualification, source bindings, final build/TypeScript and ordinary direct publication; the UI agent performed no Git mutation, build or whole-project TypeScript run.
