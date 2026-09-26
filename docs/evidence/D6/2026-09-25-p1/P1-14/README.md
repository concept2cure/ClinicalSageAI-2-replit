# P1-14 — the disclosure surface said things the code did not (INF-32; claims register §7.1, §7.2)

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` INF-32 and the claims register (§7.1 SIG-Lite,
§7.2 trust statement). **Plan item:** P1-14 (the parts this session owns: `security.txt`, the questionnaire, the trust
statement; `SECURITY.md` was corrected in Phase A and again with P0-4).

## What was wrong

`/.well-known/security.txt` (`server/routes/well-known.ts`) advertised `Policy: <base>/SECURITY.md`, a URL nothing
served, and built `Canonical` from the request's Host header unless `APP_BASE_URL` was set, which the deployment does
not set (Terraform sets `APP_URL`). A vendor-assessment tool following the file found a dead policy link and a canonical
URL that any client could steer.

The SIG-Lite questionnaire and the trust statement answered "Implemented" or "in place" for controls the audit found
partial or absent: account lockout (a race), role-based access (a stale JWT role), encryption at rest (the AWS-managed
RDS key), the runtime role's audit grants, the e-signature ceremony (23 writers outside it), SAST (Semgrep advisory),
secrets in source (a credential in history), the append-only claim (the session-settable bypass, since closed), and the
sub-processor and breach-notification statements. A questionnaire answered wrongly to a regulated buyer is a contractual
exposure, not a documentation nit.

## What is true now

- `security.txt` builds `Canonical` and `Policy` on `APP_URL` (then `APP_BASE_URL`, then the request host only when
  neither is configured) and points `Policy` at `/.well-known/security-policy`, served by the same router: `SECURITY.md`
  when the file is present, otherwise its reporting section reproduced in the route with a pointer to the repository.
- Fourteen SIG-Lite rows (B.3, B.4, B.5, C.3, C.4, C.6, C.7, D.2, E.1, E.4, F.1, F.2, F.4, G.4) state the control as
  built at head, name the finding and the plan item where a gap remains, and record what the P0 tranche changed on
  2026-09-25 (embedding placement, the archive door, session termination, the revocation trigger).
- The trust statement's "what is in place today" bullets say the same: which stores are sealed and which is not, the
  archive door, the boot refusals that now exist and the accepted-risk flags that do not refuse, the legacy sign writers,
  Semgrep's advisory status and the unprotected branch; the contact address is published. `check:compliance-claims` OK.

| | File | Result |
|---|---|---|
| red | `red/security-txt-before-fix.txt` | HEAD `f47aa229`, route unchanged: `Canonical` follows a forged Host header when `APP_URL` is set; the advertised Policy URL is not under `/.well-known/` and is not served; 2 of 4 fail |
| green | `green/security-txt-after-fix.txt` | 4 of 4 |

Test: `server/__tests__/security/well-known-security-txt.test.ts` (two cases added).

## Not done here

- `SECURITY.md`'s remaining line about field-level encryption was corrected in Phase A; no further change.
- **One sub-processor list** referenced by the trust statement, the DPA and VM-006: the DPA (`docs/commercial/`) and the
  policy are legal documents for counsel and the founder (INF-21); the trust statement's list is unchanged pending that.
- **The DPA Annex II** rows the register refuted ("JWT session tokens with short expiry", "CSRF double-submit",
  "protected product branch") are counsel's to correct (plan P1-13 / P2-2); this session did not edit the DPA.
- The Semgrep and branch-protection gaps the answers now disclose are INF-10 and INF-01, not closed here.
