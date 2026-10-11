# F20: New submission takes the project's filing

Launch row **D2**. Slice F20 of `docs/design/FILING_SPINE.md` §7.2. Claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`. F20 is also step 6 of the proposed `docs/design/WORKFLOW_DECISION_2026-10-08.md`.

## What was wrong

- **Every project got the same defaults.** The New submission form in the Submission Center opened on **IND · FDA (US) · Biotech** whatever project was open (`SubmissionCenter.tsx`: `default: 'ind'`, `'fda'`, `'biotech'`).
  - An EMA MAA project's new submission started as a US IND, and a Health Canada project's started at FDA.
  - A person who did not look filed the wrong market.
- **The region options said nothing about the market.** The F19 statement (what the platform can carry for each market) was not on them.

## What changed

- **`surfaces/NewSubmissionForm.tsx` (new).** The form, moved out of `SubmissionCenter.tsx`, whose inline config is deleted in the same change.
  - **Defaults from the project.** With a project open, the application type and region come from the project's own record: `program_type` and `primary_agency`, read from `GET /api/c2c/projects/:id`. The client type comes from the open workspace (Pharma, Biotech, MDX), or else from a device or IVD product type.
  - **Regions resolve once.** A region is resolved through the shared `canonicalRegionOf` (`@shared/regulatory/region-identity`), so `Health_Canada`, `Health Canada` and `HC` all reach Health Canada. There is no private region map.
  - **No preselection when the market already exists.** If that market (application type × region) already exists on the project, no region is preselected.
  - **Nothing guessed.** A program type the form does not offer (J-NDA) is left unselected.
  - **Failed reads stated, not hidden.**
    - A project record that could not be read preselects nothing.
    - A list of the project's submissions that could not be read preselects no region, because whether the market exists is not known.
    - Both say so inside the drawer, as an alert. That uses a new `notice` on `C2CForm`'s config, rendered as the first child of the dialog body in the drawer's existing `.de-gov` style.
  - **No defaults without a project.** With no project open, nothing is preselected.
  - **Region options carry F19.** Each region option carries the server's statement for that market and the application type now chosen (`useMarketSupport`), for example "EU (EMA) · Flat Module 1, no channel".
    - The statements follow a change of application type. A previous type's statements never label the new type's options.
    - The field's description says which state it is in: no type chosen, checking, could not be read, or "Each region says what the platform can carry…".
  - **The form waits for its reads.** It opens once the project's record and submissions have settled, because its defaults are fixed when it mounts. After that it stays mounted, so a later re-read cannot take what has been typed.
- **`C2CForm.tsx`.**
  - New optional `onFieldChange(key, value)`, so the region options can follow the application type.
  - New optional `notice` (above).
- **Tests.**
  - `__tests__/submissionCenterNewFromProject.test.tsx` (new): 9 cases.
  - `submissionCenterOpenProject.test.tsx` now chooses a client type. It relied on the removed `biotech` default.

## Review by subagent

A design-system audit ran 9 design gates, all green. It raised 1 must-fix and 5 should-fixes, all done before commit:
- The "could not be read" note sat outside the dialog, behind its scrim. It now goes through `notice`, as an alert, and the test asserts it is inside the dialog.
- The region description was static, and untrue in four states.
- Stale statements were shown under a new application type.
- The half-width selects clipped "no channel". Both now take the full width.
- A failed submissions read counted as settled and preselected the region anyway (fail-open).
- The region vocabulary was a private copy instead of `canonicalRegionOf`.

## Runs

| File | Result |
|---|---|
| `red/vitest.txt` | The first 8 cases at `a3dd2889`, before the change: **8 failed**. Each one opened on `ind`/`fda`/`biotech` or carried no statement. |
| `green/vitest.txt` | **9 passed**, including the failed-submissions-read case added after the audit. |

- Every test under `client/src/concept2cure/v2`, plus `tests/ui` and `shared`: **5630 passed, 527 files**.
- `tsc --noEmit -p tsconfig.json`: **0 errors**.
- Lint:
  - `SubmissionCenter.tsx` and `C2CForm.tsx` are at their HEAD counts (5 and 2).
  - The new form and its test add none, after the form was split into `useProjectFiling`, `useRegionStatements` and small pure helpers.
