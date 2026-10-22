# 1 — Secret scan (full history): 7 findings → 0

CI run `39533094089` (`3c93f44f9`), job "Secret scan (full history)":
`gitleaks … --log-opts="--full-history --diff-filter=tuxdb HEAD"` → **leaks found: 7**
(redacted in the log).

**Reproduced locally**, gitleaks v8.28.0 (the version `ci.yml` pins), same command
and config. This clone is shallow, so its six grafted roots show their whole
tree as added. Their findings are already recorded in `.gitleaksignore` under
the original commits; CI's full checkout does not see them that way. Excluding
those roots leaves **exactly 7**, matching CI:

| Rule | File | Lines | Commit |
|---|---|---|---|
| generic-api-key | `docs/evidence/D2-AUTHORING-VAULT-CONTINUITY/2026-10-21/artifact-manifest.json` | 53, 79, 81 | `5bf4aef01` |
| generic-api-key | `docs/evidence/D2-ASSEMBLY-FILING-SCOPE/2026-10-20/artifact-manifest.json` | 46, 80, 125 | `9a4da8500` |
| generic-api-key | the same file | 122 | `463181413` |

**What they are.** Each is one JSON pair: an evidence file's name keyed to its
SHA-256, e.g. `"gate-check-phantom-tokens.log.gz": "<64 hex>"`.
`.gitleaks.toml` already admits exactly this shape ("file digests in evidence
manifests", `64d83390`). Its extension list had no `.gz`, so compressed gate
logs fell through. They are not credentials.

**Fix.** The rule admits an optional `.gz` after a listed extension. Nothing
else changes: the line must still be one pair whose key is a file path and
whose value is exactly 64 lowercase hex digits.

**Red → green.** `tests/ci/secret-history-scan.contract.test.ts` gains three
cases:
- two `.gz` digest lines must be admitted;
- `"api_key.gz": "sk-live-…"` must still be a finding.

Before the rule change: 1 failed / 8 passed. After: 9 / 9. gitleaks over every
non-grafted commit: **0**.
