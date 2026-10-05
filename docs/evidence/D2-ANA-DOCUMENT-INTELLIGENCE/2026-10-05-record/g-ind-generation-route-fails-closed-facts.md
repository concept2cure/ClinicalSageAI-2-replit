# g-ind-generation-route-fails-closed — facts relied on

Step: `/api/ind-generation` stops reporting a save it never made (record item 75,
`devices-ind-generate-section-auth`; DECISIONS.md decision 8: the route is not
retired, it fails closed).

## Regulator facts

None. This step changes how one route reports persistence and read failures. It
makes no claim about any regulator's requirements. The drafting prompt is
`buildSectionGenerationPrompt`, which this step does not change. Step
`g-generation-prompt-parent-codes` (23eac90f) changed it.

## Platform facts (read in this checkout, HEAD d68ab20b)

| Fact | Where |
|---|---|
| The router is mounted behind `authenticateToken`. | `server/bootstrap/register-ai-routes.ts:50` `app.use('/api/ind-generation', authenticateToken, indGenerationRoutes)` |
| `authenticateToken` reads only the `Authorization: Bearer` header. With none it answers 401 `AUTH_001`. | `server/middleware/auth.ts:145-151` |
| The artifact routes are also mounted behind `authenticateToken`. | `server/bootstrap/register-concept2cure-routes.ts:36` |
| The artifact routes authorize the URL's project for the caller's organization. | `server/routes/c2c/artifacts.ts`: GET `/projects/:projectId/artifacts` at 358-373 and POST at 379ff, both through `authorizedProjectId` (`artifact-project-scope.ts`). Each answers 404 "Project not found" for a project that is not the caller's. |
| A successful POST answers 201 with the new artifact. Its id is in `data.id`. | `server/routes/c2c/artifacts.ts:749` `sendSuccess(res.status(201), newArtifact)`, with `newArtifact.id = artifactId` |
| A successful GET answers with a list in `data`. Each entry has `id`, `status` and `ctdSection`. | `getArtifactsFromDb` mapping, `server/routes/c2c/artifacts.ts:245-266` |
| Before this change, all three loopbacks sent only `Content-Type`. Failures were swallowed: `catch {}` led to `success: true` with `fullContent` and no `artifactId`, and `catch { artifacts = [] }` reported every section as `not_started`. | `git show HEAD:server/routes/ind-generation.ts` lines 182-195, 229-245 and 330-384 |
| `gw.route` received no `organizationId` or `userId`. | Same file, lines 303-317 |
| `GatewayRequest` carries `organizationId`, `userId` and `projectId` for tenant isolation and audit. | `server/services/ai-gateway/types.ts:518-525` |
| `resolveOrgId` and `resolveUserId` read the org and user that `authenticateToken` attaches as `req.user`. | `server/types/auth-request.ts:39-60`; `server/middleware/auth.ts:253-261` |
| After d68ab20b the route has no in-repo caller. AnA's two tools were retired. | d68ab20b commit body; `grep -rn ind-generation client server` |

## What the change does

- **Credentials.** The loopbacks to the artifact route carry the caller's own
  `Authorization` header. The route therefore authorizes the project for the
  caller, through `authorizedProjectId`. Nothing in this router decides access
  on its own.
- **projectId validation.** `projectId` must match `^[A-Za-z0-9_-]{1,64}$`
  before it is put in a URL path. This covers both an integer id and a program
  UUID. Anything else, missing included, is a 400. On POST this happens before
  the model call.
- **POST outcome.** POST answers `success: true` only with the `artifactId` the
  store returned. Anything else is `success: false`, `code: SECTION_NOT_SAVED`.
  The status is the artifact route's own 403 or 404, otherwise 502. The unsaved
  text is not returned.
- **Status reads.** GET `/status` and `/device-status` answer
  `success: false`, `code: ARTIFACTS_UNREADABLE` when the read fails. The status
  is 403, 404 or 502. They never return an all-`not_started` table built from a
  read that failed.
- **Error text.** Caught error text from a save or read goes to the log, never
  into the body. This is pinned in `ind-generation-error-containment.test.ts`.

## Open, recorded rather than decided here

- **Loopback.** The route still reaches the artifact store over HTTP to
  `localhost:$PORT`, not in-process. The in-process, governed write is the
  verified proposal. It persists through `executeGovernedAnaOperation`, with a
  request-free project authorization. The step scoped it out because it depends
  on founder decision 8: which drafting engine survives.
- **Unauthorized project.** An unauthorized `projectId` is still discovered only
  at save time, after the model call. The artifact route's 404 is passed
  through.
