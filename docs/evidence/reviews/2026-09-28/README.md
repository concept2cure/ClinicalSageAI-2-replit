# Weekly periodic review: launch catalog, 2026-09-28 — all six lenses

The weekly review `docs/LAUNCH_DEFINITION_OF_DONE.md` (operating cadence) requires, run on the six launch
apps (Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents).

> **A second, independent pass ran the same day: `ectd-lane-second-pass/`.**
> Another session picked up the same 2026-09-24 debt concurrently and swept the
> eCTD / Submission Center lane alone, at `c1cd656b2`, with four lenses. Neither
> session knew of the other. **Their findings do not overlap** — that pass found
> the Freeze button gated on the dispatch verdict (unreachable for IND/NDA/BLA/MAA)
> and the tenant-isolation gate carrying no submission-lane table at all. Both
> are fixed there; two further findings are filed, not fixed. This README is
> unchanged apart from this note. The duplication was not coordinated and is
> recorded in that directory's README.

- **Head reviewed:** `aff7eae16` (`concept2cure-v2`, 2026-09-28 01:16 UTC).
- **Lenses:** the repo's auditors invoked by name, read-only, no gate run with `write-baseline`:
  `part11-ux-auditor`, `honest-state-auditor`, `security-auditor`, `a11y-auditor`,
  `design-system-auditor`, `microcopy-reviewer`. All six ran to completion (15 agents in total).
- **Charge:**
  - Re-verify every finding each lens left open on 2026-09-24 and 2026-09-26.
  - Sweep what changed since then, with Authoring, Submission Center and Submission Readiness first,
    because 2026-09-24 recorded that they had never been swept under Part 11 or honest state.
- **Verification:** every blocker, high or medium finding went to a separate agent told to refute it,
  defaulting to refuted. Each report ends with that verdict. Low findings were not independently verified.
- **Rows informed:** D2, D5, D6. No row turns green as a result.

## Result

| Lens | Re-verified | New, confirmed | Refuted | Low, unverified |
|---|---|---|---|---|
| `part11-ux.md` | Q1–Q6 still fixed; last week's open note traced | Q-0928-1 (blocker), Q-0928-2 (high), Q-0928-3 (medium) | — | — |
| `honest-state.md` | last week's fixes hold | HS-0928-1 (high) | — | — |
| `security.md` | DP-36, DP-37, DP-38, DP-39 closed; IAM-19 per report | SEC-0928-1 (= Q-0928-1), SEC-0928-2 (high) | — | — |
| `a11y.md` | last week's fixes hold | A-0928-1 (verifier: major, not blocker) | — | A-0928-2 |
| `design-system.md` | G2 (TaskBoard raw-hex palette) **still open**, a token decision | none | — | — |
| `microcopy.md` | M1, M2 hold | M-0928-1 (high) | M-0928-2 | M-0928-3 |

Distinct confirmed defects: **seven**. Q-0928-1 and SEC-0928-1 are the same defect: AnA's
`retire_qms_document` retires a controlled document without the signature ceremony that its HTTP route
requires (the deferred Part B of DP-32 / P1-29).

Each report's own "What I did NOT get to" section names what it did not cover. The main gaps:

- no browser or assistive-technology pass;
- `DocumentWorkbench.tsx`, `RichSectionEditor.tsx` and the `ProtocolDev*` family were not read line by line;
- Projects, Vault and QMS were spot-checked, not re-read;
- no live AWS or GitHub for the infrastructure items.

## Remediation

In progress in the same session, one fix per finding, each shown failing first. The table below is
updated when the fixes land.

| Finding | Status |
|---|---|
| Q-0928-1 / SEC-0928-1, Q-0928-2 (AnA QMS tools) | in progress |
| SEC-0928-2 (enterprise sign-in audit tenant) | in progress |
| HS-0928-1 (coauthor `total`) | in progress |
| M-0928-1, Q-0928-3 (gateway transmittals) | in progress |
| A-0928-1, A-0928-2, M-0928-3 | in progress |
| G2 | open — needs `--module-*` tokens minted (control-tower decision) |

- **Performed by:** session `session_01KiDof7JE6LiaZhRvh2hJrb`, on `concept2cure-v2` directly per Rule 0.
