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

> **The editor family, read line by line: `editor-family/`.** This review, and
> the one of 2026-09-24, record that `DocumentWorkbench.tsx`,
> `RichSectionEditor.tsx` and the `ProtocolDev*` family were never read line by
> line. A D4 pass (`…01TTTQ1h`) did that on 2026-09-28 at `7087f46e2`.
> - **Method:** fourteen lens reports, and a refuting verifier for every
>   blocker, high and medium.
> - **Blockers found:** five. A viewer could change a regulated protocol; a
>   signed protocol's schedule still changed; "Re-read source" rewrote any
>   citation's checksum; a comment anchor saved unreasoned prose under a system
>   reason; the co-author body saved with no reason or audit.
> - **Fixed:** the first four, and most highs and mediums, failing first
>   (`editor-family/fixes/`).
> - **Handed on:** the rest, through the work-orders board.
> This README is unchanged apart from this note.

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

## Remediation (same day; five fix agents in parallel on disjoint files, each test shown failing first)

| Finding | Outcome | Red → green |
|---|---|---|
| **Q-0928-1 / SEC-0928-1**: AnA `retire_qms_document` retired a controlled document with no signature ceremony | **Fixed.** The handler refuses through `refuseSignatureInChat` and points to the Retire action, which asks for password and second factor. The register entry is now `refuse`. The model-facing description reads "AnA cannot sign". Pinned in `ana-cannot-sign.test.ts` (`SIGNING_TOOLS`), which also covers the description. | 13 failed → 115 passed across the five QMS/tool test files |
| **Q-0928-2**: AnA `revise_qms_document` had no editor-role check, and its reason floor was 3 characters | **Fixed.** The role comes from `organization_users` for the verified principal and is checked against `GOVERNED_WRITE_ROLES`, the set `requireEditorAccess` uses. A failed lookup refuses. The floor is now `QMS_REASON_MIN` (8). | `revise-qms-document-role.test.ts` (new) |
| **SEC-0928-2**: enterprise sign-in recorded refusals for membership-only accounts in the platform chain (tenant 0) | **Fixed** at the four refusal events via `auditOrganizationOf`, as F-41 did in `auth.ts`. The challenge event is left on the token's organisation on purpose, so one sign-in is not split across two ledgers (see open items). | 4 of 7 failed → 8 of 8 passed (`authEnterprise-audit-organisation.test.ts`) |
| **HS-0928-1**: `GET /api/coauthor/documents` returned the page length as `total`, so a truncated backbone could read "All documents approved" | **Fixed.** Returns the organisation's real `count(*)` under the same predicate, plus a new `returned` field. | 1 failed → 2 passed on PGlite (`coauthorDocumentsListTotal.test.ts`) |
| **M-0928-1**: gateway transmittals turned every refusal into "HTTP 0" | **Fixed.** `readData` keeps the `ApiRequestError` status and payload, so the 409/412/422/400/404 branches are reachable. | new thrown-error tests failed on the old code |
| **Q-0928-3**: the §11.50 meaning declared at transmit was never shown back | **Fixed.** The success message names the signer and meaning, and says nothing about a signature when the ledger rolled back. The meaning is stamped on the transmittal (`metadata.signature`) in the signature's own transaction and shown on the log row. | client and server tests failed first; three guard tests also pass on the old code, as their agent reported |
| **A-0928-1**: the required placement reason was not announced as required | **Fixed.** `aria-required`, the asterisk hidden from screen readers, and the requirement stated before anything is typed. | 6 failed → 80 passed |
| **A-0928-2** (low): the Vault history read failure used `role="status"` | **Fixed** (`role="alert"`). `vaultSurface.test.tsx`'s mock now answers the history read with a real empty history, where a wrong shape had been hidden by the polite region. | as above |
| **M-0928-3** (low): two bare empty states in Publishing Center | **Fixed.** Hints say this is what the service returned, not a failed read. | as above |
| **G2**: TaskBoard raw-hex module palette | **Open.** It needs `--module-*` tokens minted, which is a control-tower decision. | — |

Checks on the whole batch:
- `ci:typecheck-no-regression`: 0 errors.
- `check-security-patterns`: 0 violations.
- `ci:server-error-leaks`, `ci:unkeyed-request-tables`, `ci:column-reachability`, `ci:insert-columns-declared`: green.
- 64 test files, 1,544 tests: pass.

### Open items raised by the fixes (for the control session)

1. **Class-level role gap in AnA's confirmed writes: fixed the same day.** The QMS fix agent matched
   each confirm or conditional register entry against its handler: 93 of 179 wrote a governed record with
   no role check, and service-routed writers were also unchecked. Seventeen were in the launch catalog,
   among them `create_qms_document`, `save_document_to_vault`, `update_vault_document` and
   `create_protocol_document`. `/api/ana-ri` is mounted with `authenticateToken` only, so a `viewer`
   could confirm any of them.

   The fix is one rule in the registry wrapper (`writeRoleRefusal` in `AnaToolExecutor.ts`), beside the
   confirmation gate, which every way of reaching a handler passes through. A call whose register class is
   `confirm` runs only for an identified member whose role in `organization_users` is in
   `GOVERNED_WRITE_ROLES`, the set `requireEditorAccess` uses. It fails closed when the role cannot be read.
   - Platform commands keep their own RBAC (class `command`).
   - Reads and `self` are not asked.
   - The only production caller that marks a write as confirmed (`/api/ana-ri/governed-action`) always
     passes the verified user and organisation.

   Proof:
   - `confirmed-write-role-gate.test.ts`: 6 of 9 fail without the rule, 9 of 9 pass with it.
   - The rule broke 107 existing tests in 32 files. Five agents classified every failure as a harness
     that never modelled a role, or as a gate-subject test. None was a production path.
   - The harnesses now model an editor, and the gate-subject tests pin the new refusal. Each removed
     assertion matched a handler message that is now unreachable, and was replaced with a stricter one.
     Several files pin the viewer case, each shown failing with `member` substituted.
   - All 133 tool-handler test files pass: 2,379 tests.

2. **Enterprise sign-in session organisation.** `verify-password` should choose the session's
   organisation with `signInMembership`, so that the token, the challenge event and `verify-mfa` agree
   for a membership-only account. As it stands, such an account is refused `NO_ORGANIZATION` at that
   door, and nothing is recorded.
   **Fixed 2026-09-28.** verify-password selects the organisation with `signInMembership` (as
   `routes/auth.ts` does); the partial token, the challenge event and the response name that one; no
   membership is refused `NO_ORGANIZATION` with a recorded `no_organization` event. verify-mfa and
   `/refresh-token` read the role strictly (`membershipRoleOf`): no membership refuses (recorded as
   `no_membership` at verify-mfa) instead of issuing a session or successor with an invented `user` role, and
   a failed read is an error, not a role. The hard-coded `organizationName: 'Concept2Cure'` in the
   verify-password response is gone. 5 enterprise auth tests failed on the unfixed route; 36/36 pass.

- **Performed by:** session `session_01KiDof7JE6LiaZhRvh2hJrb`, on `concept2cure-v2` directly per Rule 0.
