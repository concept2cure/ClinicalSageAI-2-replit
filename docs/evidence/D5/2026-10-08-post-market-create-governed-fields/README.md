# D5: a post-market document is created as a draft, by the session user

**Row:** D5, `docs/LAUNCH_DEFINITION_OF_DONE.md` (Part 11 attribution and
approval control). Ledger L222.

**Date:** 2026-10-08.

**Found by:** the adversarial review of L195 (`3a8961ca14`). Its sweep lens
reported it, and its skeptic reproduced it with the real `createDocument` and
drizzle query builder, faking only the pg client.

## What was wrong

`POST /api/post-market/programs/:programId/documents` spread the whole request
body into the insert. It overrode only the organization, program and creator.
So a caller could create a PSUR, PMS report or other post-market document that
was already `approved` and `locked`, with any `approvedBy`, `approvedAt` and
`signatureId`. None of that went through `approveDocument` and its gate. The
caller could also set the `version`, which is the supersession lineage's to set.
With no user on the request, the creator was recorded as `'system'`.

Edits were already allow-listed by `DOCUMENT_EDITABLE` (ledger L192); creation
was not. AnA's `post_market.document.create` builds its row from explicit
fields and was not affected. No client calls this route: the product's hook
uses `/documents/:type/generate`.

## The fix

- `DOCUMENT_GOVERNED` sits beside `DOCUMENT_EDITABLE` in
  `server/services/gspr-postmarket/post-market.service.ts`: `status`, `locked`,
  `approvedBy`, `approvedAt`, `signatureId`, `version`, `createdBy` and
  `updatedBy`. A create request that names any of them gets a 422. A silent
  drop would let a caller believe it created an approved document.
- Everything else goes through the same `DOCUMENT_EDITABLE` allow-list an edit
  uses, via the canonical `pickWritable`. Create and edit now share one list.
- The creator is `authedUserId(req)`. With no user, the answer is a 401, not
  `'system'`.

## Red, then green

| Run | Result |
|---|---|
| Unfixed route (`red/create-before.txt`) | 10 of 11 fail. The leak assertions name what would have been stored: *"the body must never write status: expected [ 'approved' ]"*, *"… approvedBy: expected [ 'qa.head@example.com' ]"*, *"… version: expected [ 7 ]"*, *"expected [ 'system' ] to not include 'system'"*. The one that passes is a positive control: a string session subject still records the user. |
| Fixed (`green/create-after.txt`) | 11 of 11. |
| Mutation: the refusal removed, so the fields are silently dropped (`mutation/refusal-removed.txt`) | 8 of 11 fail, each *"expected 201 to be 422"*. |
| Related suites (`green/related-suites.txt`) | 17 files, 238 tests, all pass. |
| ESLint on the three files | 0 errors, and the warning ratchet reports no change. |
| `tsc --noEmit -p tsconfig.json` | Exit 0. |

## Reproduce

```
npx vitest run --config vitest.config.ts tests/post-market-document-create.test.ts
```
