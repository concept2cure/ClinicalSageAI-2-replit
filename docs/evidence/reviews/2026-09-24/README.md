# Weekly periodic review: launch catalog, 2026-09-24 — security lens only

The DoD's weekly review names four lenses (`docs/LAUNCH_DEFINITION_OF_DONE.md`, operating cadence). The
2026-09-22 run recorded that **no security auditor existed** and substituted the deterministic gates. This folder
holds the first run of the missing lens; the other three lenses were run on 2026-09-22 and are not repeated here.

- **Head reviewed:** `adbf2d18` (remote `concept2cure-v2`, 2026-09-24 19:34 UTC), the same commit the full audit
  (`docs/security/SECURITY_AUDIT_2026-09-24.md`) is pinned to.
- **Lens:** `.claude/agents/security-auditor.md`, created today from the audit's checklist. This first run executed the
  definition through a general-purpose agent, because the session began before the file existed and the harness loads
  agent definitions at session start; later sessions invoke it by name.
- **Rows informed:** D6 (security posture), D3, D5. No row turns green as a result.
- **Performed by:** the D6 security-audit session (`session_0194UQPxy9Er2ibRAjog8Ven`).

| File | Lens |
|---|---|
| `security.md` | security and tenant isolation: re-verification of the audit's ten decisive findings at head, object-level authorization on a sample of launch-catalog mutation routes, the AnA write tools the six apps delegate to, second doors added in the last 48 hours, and the gate table with baseline sizes |
| `lenses.md` | *added later the same day by a second session, see below:* re-verification of the sixteen 2026-09-22 findings at head; the Part 11 and honest-state lenses over Projects, Tasks, Vault and QMS; two security findings the first lens did not raise (DP-34, DP-35) |
| `gate-proofs.md` | *added by the same second session:* each of the seventeen 2026-09-22 security and tenant gates shown failing on its own defect shape and passing once it is removed; D2's two fixture gates moved into `.husky/pre-push` (`6f2694b1`) |

The lens raised three ids (DP-31, DP-32, DP-33). They are carried in the audit's register (§4.4) and in the plan
(P1-28…P1-30) so there is one register; `security.md` is the evidence behind them.

## Second pass, same day

After this lens was filed, the periodic-review session (`session_015oLV2vDRUbUF8eLLs8zyGt`) ran the other three
lenses and the re-verification at `5117c0cf`, re-reading every verdict at `dac69d76`. This README's text above is
unchanged. Seven of that run's eighteen agents stopped on a session limit. `lenses.md` lists which lens and app group
did not run. **Authoring, Submission Center and Readiness were not swept under Part 11 or honest state, and the
design-system lens did not run anywhere**, so the next weekly review owes those first. The two new security ids are
added to the audit register (§4.5) so there is still one register.

---

## Addendum, 2026-09-25 01:10–03:00 UTC: the other lenses, and what closed

The three lenses this folder said were "not repeated here" were run against `f14f5510` by
the repo's auditors (`part11-ux-auditor`, `honest-state-auditor`, `a11y-auditor`; the
`security-auditor` run above stands), each re-verifying last week's open findings before
looking for new ones. Their reports are filed beside `security.md`, every finding kept and
carrying its status:

| File | Lens | Result at head, after remediation |
|---|---|---|
| `part11-ux.md` | Part 11 / GxP compliance UX | two new blockers (Q1 quorum-version binding, Q2 QMS retire) and Q3, Q4, Q6 **fixed** (`42eb291d`, `6582e3a3`, `fde9d704`, `896e96fb`); Q5 (a reason on vault filing) open; eight of last week's findings confirmed closed |
| `honest-state.md` | honest state | one medium (HS1, Template Library null confidence) **fixed** `896e96fb`; all 21 launch surfaces otherwise clean; last week's fixes hold |
| `a11y.md` | WCAG 2.2 AA | one blocker (Submission Center table row, pointer-only) and two advisories **fixed** `4f0becb6`; no other blocker in scope |
| `design-system.md` | design-system conformance and its gates | every gate green; last week's shadowing FAIL gone; G1, G3, G4, G5 **fixed** (`0f389d77`), phantom-token baseline ratcheted 14 → 9; G2 (TaskBoard's raw-hex module palette) **open as a token decision**; the auditor's report that one gate rewrites files was re-checked and is wrong (see the report's process note) |
| `microcopy.md` | voice and copy | eight unredacted error messages and one naming inconsistency **fixed** (`164f52ef`); copy gates green |

Also closed from `../2026-09-22`: D1 (phantom `--danger` in TSX) by `02beeb59`, which swept
every token referenced from TSX inline styles against the token definitions.

All six lenses are filed. Q5 (a reason on vault filing) closed after the addendum was first
written (`95fcbffc`); every Part 11 finding in `part11-ux.md` is now fixed. The first fan-out of all six auditors on 2026-09-24
23:xx UTC died on a session rate limit and produced nothing; this is the second run.

- **Rows informed:** D2 (launch catalog), D5 (Part 11 evidence). No row turns green as a result.
- **Performed by:** the design-system/CXO remediation session (`session_01FSu2RLBeJSq46vhQcJh85M`), on `concept2cure-v2` directly per Rule 0.
