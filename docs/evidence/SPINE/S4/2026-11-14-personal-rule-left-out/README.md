# S4 · P-133 walked: a saved personal rule no longer stops AnA (2026-11-14)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Decision: P-133 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The failure
it fixes was walked on 2026-11-12: `../2026-11-12-personal-rule-stops-turns/`. Code: `db806dfea8`.

The same walk, on the same local app (real server, PostgreSQL with RLS on, real browser; the provider is a local
stand-in, so replies begin `MOCK`), after the change:

| Step | File | What the screen showed |
|---|---|---|
| Saves a personal rule in "What AnA remembers" | `01` | "Standing rule · active". The panel now reads: "AnA uses your personal rules only with an AI model that runs inside this deployment, in a conversation kept private to you. Otherwise she answers without them and says so in the conversation." |
| Starts a new conversation and asks | `02` | AnA answers. Under the answer: "Your personal rules were not applied to this answer: they are sent only to an AI model that runs inside this deployment, and this answer could come from one outside it. Rules that require your approval still apply." |
| Another new conversation | `walk-p132.log.txt` | The same: answered, one note |
| Revokes the rule | `03` | "Standing rule · revoked" |
| A new conversation | `04` | Answered, no note |

**Nothing of the rule reached the provider.** The stand-in recorded 4 requests; none contains the rule's text ("Name
the source document for every figure you state") or the private-instructions heading.

Seen on the way: the conversation's back link reads "← P-95", the open project (finding 99, `57c6d8b957`).

## What already exists (unchanged)

- `server/services/ana-context-router.ts` `issuePrivateRuleModelContext`, `issueLegacyPrivateModelContext`: the issuers.
- `server/services/ana/turn-record.ts` `readCoordinationKey`: the key gate owner-private capture uses.
- `server/services/ai-gateway/sensitive-placement-policy.ts` `decideInputTierPlacement`: the gateway's Tier-3 wall.
- `client/src/concept2cure/v2/AnaMessageWarnings.tsx`: draws a turn's warnings under the answer.

## Limits

- The deployment here has no self-hosted model, so the "path available" branch (the rules used as before) is shown by
  the route test (`stream-personal-context.test.ts`), not in this walk.
- The note is a turn warning: it is on the turn's record, and like every warning it is not redrawn when an old
  conversation is reopened.
