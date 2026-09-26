# Weekly periodic review: launch catalog, 2026-09-26 — security lens

The second run of the security lens named by `docs/LAUNCH_DEFINITION_OF_DONE.md` (operating cadence), two
days after the first because the remediation tranche it had to re-verify landed in between. The other three
lenses are not repeated here.

- **Head reviewed:** `1463b91a` (`concept2cure-v2`, 2026-09-26 12:25 UTC), the merge that carried P1-8 and the
  two newly wired gates.
- **Lens:** `.claude/agents/security-auditor.md`, invoked by name (`security-auditor`), read-only, no gate run with
  `write-baseline`. Time box ~40 minutes, exceeded; §5 of the report says what that cost.
- **Charge:** re-verify the audit's ten decisive findings and, adversarially, every closure of the 2026-09-24
  tranche (P0-1, P0-12, P1-1 … P1-27, IAM-18 (6)/(7)): for each, look for the second door, the caller that bypasses
  the new helper, the fallback that reopens the hole.
- **Rows informed:** D6 (security posture), D5, D3. No row turns green as a result.
- **Performed by:** the D6 security-audit session (`session_0194UQPxy9Er2ibRAjog8Ven`).

| File | Lens |
|---|---|
| `security.md` | security and tenant isolation: the ten findings re-verified; the tranche's closures re-verified adversarially (a table of verdicts with the failure path looked for); five new ids; gate baselines with direction |

**Outcome in one paragraph.** The tranche's closures hold (P1-1, P1-2, P1-3, P1-4, P1-6, P1-8, P1-9, P1-20,
IAM-18 (6), IAM-18 (7)), each with file:line, with residuals recorded. Two re-verifications changed a register
row: DP-08's closure covers the `execute_platform_command` registry only, and the directly registered AnA write
tools remain outside the propose-only partition (new **DP-36**, High, plan P1-34); the `/ana` socket closed its
handshake under P0-1 but has no periodic session re-check (new **IAM-19**, Medium, P1-33). Three more new ids:
**DP-37** (an unscoped leaf-program lookup in the submission service, the one red tenant-isolation gate, the
submission lane's, P1-35), **DP-38** (`POST /api/audit/signatures` outside the audit-recorder role gate, P1-36),
**DP-39** (the logger's mask covers context values, not the message string or arrays, P1-37). Two items are more
closed than the register said, by the W2 lane's Terraform: DP-06 (the audit flags set and preflighted) and INF-04
(a CloudFront response-headers policy); neither verified against a live deployment. Gates: 17 pass, 1 fail (the
DP-37 finding); `ci:server-error-leaks` and `ci:dead-audit-catch`, the baseline's two reds, are clean.

The five ids are carried in the audit's register (§4.1, §4.2, count 91) and in the plan (P1-33 … P1-38, the last
for the residuals) so there is one register; `security.md` is the evidence behind them.
