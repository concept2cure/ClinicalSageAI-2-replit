# /api/claude/* takes the caller's organization from the server, and only from there

**Row:** D6, a client-supplied tenant key (with D3 tenant isolation and D5 attribution).
Found while wiring the AnA turn record into `POST /api/claude/agent`
(`docs/evidence/D5-ANA-RECORD/2026-09-26/`). On its first live run, that door
filed "not recorded — no organization".

## The defect

`server/routes/ana-intelligence.ts` read `(req as any).organizationId` and
`(req as any).userId`. The auth chain on the `/api/claude` mount
(`register-ai-routes.ts`) attaches `tenantContext` and `user`, not
`organizationId`, so every route passed `undefined` to the gateway:

- The tenant's AI placement policy was never applied: allowed vendors, residency
  and zero retention (`gateway.ts` `applyOrgPlacementDefaults`). The ambient
  scope is used only when an explicit id is absent, and only for placement and
  audit.
- Usage was not metered to the tenant.
- The model-provenance audit row (`recordModelProvenance`) was filed under no
  organization.

`POST /api/claude/batch` went further. It is the only drafting path of the
`BatchDraft` surface, and it built each request as
`organizationId: r.organizationId || req.organizationId`, and the same for
`userId`. A value in the request BODY won. A caller could draft their own text
under another organization's placement policy, which might be weaker, and have
it metered to that organization.

## The change

One helper, `identityOf(req)`, built on the canonical `resolveOrgId` /
`resolveUserId` (`server/types/auth-request.ts`). It is used by every route in
the file and by the provenance writer. `/batch` spreads the server's identity
after each request's own fields, so a body-supplied id is overwritten, never
preferred.

## Shown failing on the case it exists to catch

`server/routes/__tests__/ana-intelligence-identity.test.ts` builds each request
the way the real middleware leaves it: `tenantContext` and `user`, with no
`req.organizationId`. Its `/batch` body names organization 99 and user 55.

| Run | Result |
|---|---|
| `1-red-on-old-code.txt` (the file at HEAD) | 3 of 3 fail. `/batch` sent `[99, 55]`; `/draft` and `/quick` sent `[undefined, undefined]` |
| `2-green.txt` (this change, plus the router's existing suites and the turn-record doors) | all pass |
