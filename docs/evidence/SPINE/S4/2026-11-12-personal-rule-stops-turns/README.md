# S4 · One saved personal rule stops every later AnA turn for that person (2026-11-12)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Found by the demo-day sweep
(`../2026-11-09-claude-path-walk/FINDINGS.md`, founder decision 1), reproduced here in the running app on trunk
`cbc2294717`. **Not fixed: the fix is a founder decision.**

## What a person does, and what happens

Real server, real PostgreSQL with RLS on, real browser. The provider is a local stand-in, so no call reached
Anthropic (`mock-anthropic-tools.cjs.txt`; its replies begin `MOCK`).

| Step | File | What the screen showed |
|---|---|---|
| Asks a question | `01` | AnA answers |
| Opens "What AnA remembers", adds a personal rule ("Name the source document for every figure you state") | `02` | "Standing rule · active · Version 1", "Personal rule change recorded." |
| Starts a new conversation and asks a question | `03` | "AnA couldn't complete this request. Try again, or ask an administrator for help if it keeps happening." Progress: "Did not finish · 0s" |
| Starts another new conversation and asks again | `walk-rule.log.txt` | The same |
| Revokes the rule | `04` | "Standing rule · revoked · Version 2" |
| Starts a new conversation and asks | `05` | AnA answers again |

The server's own reason, in its log and not on the screen: `Conversation preparation failed:
COORDINATION_TENANT_KEY_REQUIRED`. This local environment has no tenant encryption key.

In `walk-rule.log.txt` the last entry is named `07-after-revoking`. That run did not find the Revoke button, so the
rule was still active when it asked: it is a third failed question, not a result after revoking. The revocation and
the question after it are `walk-revoke.cjs.txt` and `walk-revoke.log.txt`.

## What already exists

- `client/src/concept2cure/v2/WhatAnaRemembers.tsx`: the rules panel. It says: "Personal instructions are limited to
  protected conversations. AnA pauses if privacy or model approval cannot be verified."
- `server/routes/client-intelligence.ts` `POST /ana/user-profile`, `server/services/ana-context-router.ts`
  `writePrivateUserRule`: the save. It needs no key.
- `server/routes/ana-ri/stream.ts` `preparePrivateConversation`: on every turn, a person with an active rule gets a
  private context, which needs an encrypted, owner-private path (P-104).

## Why it happens

The pause the panel describes is the design. What the design did not weigh is how often the protected path is
missing:

- **With no tenant key** (this environment, and a Codespace): the turn's preparation fails. Walked here.
- **With a tenant key and only an outside provider** (by reading, not run): the private context is Tier 3, and the
  gateway refuses to send it to a provider that is not self-hosted. No local model has passed PQ (plan §1d), so this
  is every deployment today.

So saving a rule costs the person AnA, in every conversation, until they revoke it. Nothing on the failing screen
says the rule is the cause.

## The decision

May a person's own rule be sent to the outside model that serves their turn? If not, three things can be done with
what exists, and the founder chooses:

1. Leave the person's rules out of a turn the protected path cannot serve, say so in the conversation, and answer.
2. Do not let a rule be saved while no protected path exists, and say why in the panel.
3. Keep the pause, and make the failing turn say that personal rules are the cause and how to revoke them.

Sending the rule to the outside model is a fourth course, and it changes what P-104 promised.
