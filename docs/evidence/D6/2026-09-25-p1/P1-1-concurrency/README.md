# P1-1 (fourth commit) — the concurrent-session limit (IAM-06, High)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-06. **Plan item:** P1-1, its last open part.
The idle window, the lifetime, the client and the OQ step are in `../P1-1/`.

## What was wrong

Nothing bounded how many sessions one account could hold at once. A credential shared across a team, or one
captured and used beside its owner, opened as many parallel sessions as it liked, each with its own 12 hours, and
no one was told. Annex 11 §12 and 21 CFR 11.10(d) expect access limited to the individual; a session limit is the
ordinary control that makes a shared account visible to its owner and bounds a captured one.

## What is true now

`server/services/session-inactivity.ts` holds the registry beside the activity store (Redis shared by every task,
the in-memory tier behind it).

- **Every sign-in registers its session** against the account through `openSession`, the one door
  (`routes/__tests__/session-open-contract.test.ts` refuses a route that mints `newSessionClaims` on its own):
  the two sign-in paths, sign-up and MFA completion in `routes/auth.ts`; MFA completion in
  `routes/authEnterprise.ts`; both SAML paths in `routes/sso.ts`. A refresh, a rotation and an organisation switch
  continue the same session and register nothing new.
- **The limit** is the tenant's `settings.security.maxConcurrentSessions`, clamped to 1 … 20, **5** when unset. It
  is read from the same settings object as the idle window at the same moment.
- **Beyond the limit the oldest sessions end.** Their ids are marked superseded for the session lifetime plus a
  minute, so nothing revives them: the next request at either authenticator or `verifyLiveToken` is answered
  401 `SESSION_SUPERSEDED` and the token revoked; `POST /api/auth/refresh` refuses with the same code. The newest
  session is never the one that ends.
- **A slot is freed** at sign-out (`POST /api/auth/logout` unregisters the verified token's session) and when a
  session is found idle or past its lifetime; a session older than the lifetime never counts.
- **The client** knows the third reason: `utils/sessionEnd.ts` maps `SESSION_SUPERSEDED` to `superseded`, the
  sign-in page shows `signedOut.superseded` (18 locales), and the auth service ends the session rather than retry,
  as for the other two.
- Tokens minted before sessions had ids hold no slot and are never superseded; they age out within seven days.

## Not in this commit

- The admin-settable knob: `server/routes/tenant-config.ts` (the settings schema and the tier defaults) is inside
  another lane's 24-hour window until 02:42 UTC 2026-09-27. Until it gains `maxConcurrentSessions` (integer,
  1 … 20) the default of five applies to every tenant; a value already present in `settings.security` is honoured.
- The OQ step for the limit (OQ-001) follows the knob: it needs a limit of one to run in bounded time.
- The default of five is an engineering default, recorded here for the founder to confirm or change.

## Follow-up, same day: the security-auditor lens on this change

The repository's `security-auditor` agent read the change and named four things, all fixed in the follow-up commit
(red: `red/followup-before-fix.txt`, five failing cases; green: `green/followup-after-fix.txt`):

- **The Redis registration was six round trips** (prune, add, expire, count, range, remove), so two sign-ins at once
  could both read the same count and one eviction was lost. It is now one Lua script (`REGISTER_SCRIPT`), atomic on
  the Redis side; the double in `session-registry-redis.test.ts` counts the calls.
- **The memory tier's vote was unioned into Redis's decision.** The memory tier knows only the sessions this task
  opened and still lists the ones signed out on another task, so it could end a live session Redis kept. When Redis
  answers, its decision is now the only one; the memory tier decides only when Redis is away.
- **The SAML sign-in opened its session with the platform defaults**, ignoring the tenant's idle window and limit.
  It now reads the config organisation's settings like every other door.
- **`optionalAuth` checked only the revocation list.** It has no caller today, but the next router that reaches for
  it would have attached a user from an idle, superseded, suspended or password-changed session. It now verifies
  through `verifyLiveToken`, as the other authenticators do.

And one pre-existing neighbour: **`POST /select-organization` revoked nothing**, so the old organisation's token and
the new one stayed live together. It now rotates like `/refresh-token`
(`authEnterprise-select-organization-rotation.test.ts`).

**Residual, recorded, not fixed here:** without Redis each task enforces the limit over the sessions it opened
(the activity store degrades the same way). Production runs Redis under plan P1-3, which is the founder's
decision to make a boot requirement; until then a fleet without Redis holds up to the limit per task.
The `InResponseTo` replay cache is per process (node-saml's default), noted in the code; a fleet without sticky
routing needs a shared cache before SAML sign-in is offered at scale.

## Evidence

- `red/before-fix.txt` — the new cases against HEAD `932d4517`: 12 failing, all on the missing limit
  (`openSession is not a function`, `SESSION_SUPERSEDED` unknown to the client).
- `green/after-fix.txt` — the same files after the change, with the locale-integrity test: all passing.
- ESLint warning ratchet: no file changed its warning count. `check-i18n-integrity`: 18 languages × 4 namespaces
  consistent, 116 references resolve.
