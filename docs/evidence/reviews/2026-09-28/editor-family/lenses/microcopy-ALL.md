# Microcopy lens: the editor family, all three groups, 2026-09-28

## Scope actually covered

Read in full, every line, at commit `7087f46e23ae763cc88c3ec3a05b3c0575649aec` (confirmed via `.git/refs/heads/concept2cure-v2`; no `git log`/`git show` available — see "What I did NOT get to"):

- **Group A** — `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, lines 1–5134 (whole file, read in four passes).
- **Group B** — `client/src/concept2cure/v2/editor/RichSectionEditor.tsx`, lines 1–2716 (whole file, read in three passes).
- **Group C** — all fifteen `client/src/concept2cure/v2/surfaces/ProtocolDev*.ts(x)` files, whole, 4,250 lines total: `ProtocolDev.tsx` (233), `ProtocolDevShared.tsx` (55), `ProtocolDevSigning.tsx` (112), `ProtocolDevReviews.tsx` (158), `ProtocolDevPanes.tsx` (202), `ProtocolDevCompliance.tsx` (210), `ProtocolDevSection.tsx` (283), `ProtocolDevSoa.tsx` (284), `ProtocolDevRegisters.tsx` (294), `ProtocolDevProjections.tsx` (304), `ProtocolDevDesign.tsx` (317), `ProtocolDevForms.tsx` (392), `ProtocolDevWrites.ts` (425), `ProtocolDevDerivation.tsx` (457), `ProtocolDevWorkspace.tsx` (524).

Server-side traced in support of the findings below: `client/src/lib/queryClient.ts` (`apiRequest`, `ApiRequestError`, `extractApiError`, `serverMessage`, `errorCodeOf`, `redactInternals`, `fallbackMessage`, `INTERNAL_MARKERS` — lines 1–423); `server/middleware/auth.ts:140–234` (`authenticateToken`'s 401 envelope shapes); `server/middleware/tenantContext.ts:220–352`; `server/middleware/authBoundary.ts:100–190`; `server/middleware/requireLicenseAcceptance.ts:25`; `server/routes/tenant-users.ts:1–60,359–374` (the route and `authorizeOrgAccess` behind `listReviewerCandidates`).

Both earlier reports read first: `docs/evidence/reviews/2026-09-24/microcopy.md`, `docs/evidence/reviews/2026-09-28/microcopy.md`.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| M-1 | medium | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1935,2155,2619` | Three refusal paths show a bare, untranslated HTTP status where nine sibling handlers in the same file spell out "your session isn't authenticated." |
| M-2 | medium | `client/src/concept2cure/v2/surfaces/ProtocolDevWrites.ts:337` | `listReviewerCandidates` discards the server's actual refusal sentence and always shows "the server answered 401." |
| M-3 | low | `client/src/concept2cure/v2/surfaces/ProtocolDevForms.tsx:180,222,225,227,229`; `ProtocolDevDesign.tsx:110,122,286`; `ProtocolDev.tsx:64,79,209` | "organisation" and "organization" are both used for the tenant concept, sometimes in the same drawer file. |
| M-4 | low | `client/src/concept2cure/v2/surfaces/ProtocolDevDerivation.tsx:430-431` | Double-negative wording in the failed-read notice is hard to parse on first read. |

---

### M-1 — DocumentWorkbench.tsx: three refusals show a bare HTTP status instead of a sentence

**What the code does.** `apiRequest` (`client/src/lib/queryClient.ts:362–423`) throws `ApiRequestError` — with an already-cleaned `message` from `extractApiError`/`serverMessage` — for every non-2xx status *except* 401, which it returns as a plain non-ok `Response`. Nine handlers in `DocumentWorkbench.tsx` that hit this 401-only branch say so in plain words, e.g.:

- `uncite`, :1849-1852 — `if (res.status === 401) { fireToast('Not removed — your session isn't authenticated. Nothing was changed.', 'error'); return; }`
- `saveSectionContent`, :2030-2033 — `if (res.status === 401) { fireToast('Not saved — your session isn't authenticated. Sign in and retry.', 'error'); throw new Error('unauthenticated'); }`
- the same pattern again at `reresolve:1889-1892`, `revert:2242-2245`, `addComment:2299-2303`, `addReply:2371-2374`, `setCommentStatus:2418-2421`, `saveRename:2495-2498,2511-2514`, `moveSection:2560-2563`.

Three call sites in the same file skip this and fall straight to a numeric fallback instead:
- `refreshAllSources`, :1932-1938 — `if (!res.ok || json?.ok !== true) { fireToast('Couldn't re-read this document's sources — ' + (serverMessage(json) ?? \`HTTP ${res.status}\`) + '. Nothing was changed.', 'error'); return; }`
- `runCheck`, :2616-2622 — `if (!res.ok || !json?.scan_results) { fireToast('Couldn't check the section — ' + (serverMessage(json) ?? \`HTTP ${res.status}\`) + '. No result is shown because none was produced.', 'error'); return; }`
- `uploadSectionImage`, :2151-2156 — this one bypasses `apiRequest` entirely (raw `fetch`, for multipart) so it is reachable on *any* refusal whose body doesn't parse to a usable message, not only 401: `throw new Error(serverMessage(json) ?? \`the image store returned HTTP ${res.status}\`);`. The caller (`RichSectionEditor.tsx` `insertImageFile:1769-1776`) wraps this in `redactInternals(...)`, but `redactInternals`'s only HTTP-status marker is anchored to the *start* of the string (`queryClient.ts:95`, `/^\s*HTTP\s+\d{3}\b/`), so "the image store returned HTTP 500" — status embedded mid-sentence — passes through unredacted.

**Why it matters to a regulated user.** `runCheck`'s and `refreshAllSources`'s `!res.ok` branches can, per the contract above, only ever fire on a 401 — i.e. a session that has ended (the idle window is 15 minutes per `auth.ts`'s own comments). A person mid-draft who clicks Check or Re-read all after stepping away reads "Couldn't check the section — HTTP 401. No result is shown because none was produced." — a code with no cause or next action, on the very surface whose nine sibling handlers already say "sign in and retry" for the identical condition. This is a defect the file's own authors have already fixed nine times; it is missing in exactly three places.

**Smallest fix.** Give `runCheck` and `refreshAllSources` the same `if (res.status === 401) { fireToast('<verb> — your session isn't authenticated. Sign in and retry.', 'error'); return; }` branch their nine siblings already have, ahead of the generic `!res.ok` check (401 is the only status either branch can ever see). For `uploadSectionImage`, phrase the fallback with the status in a trailing parenthetical the way `fallbackMessage()` already does elsewhere in the same file (e.g. "the image store did not explain the refusal (HTTP 500)"), so `redactInternals`'s existing anchored marker actually catches it.

### M-2 — ProtocolDevWrites.ts: the server's own sentence is discarded for a bare status number

**What the code does.** `listReviewerCandidates` (:330-344) calls `GET /api/tenant-users/:organizationId` directly — not through this same file's careful `send()`/`refusal()` wrapper (:74-96, which special-cases 401 into a full sentence) — and never reads the response body at all:
```
if (!res.ok) throw new Error(`the server answered ${res.status}`);
```
Per the same `apiRequest` contract as M-1, this can only fire on 401. The route it calls, `server/routes/tenant-users.ts:362` (`router.get('/:tenantId', ...)`), guards with `authorizeOrgAccess` (:374), which on an authentication failure answers `res.status(401).json({ error: 'Authentication required' })` (:60) — a perfectly usable sentence. (If the platform's own gate intercepts first, `server/middleware/auth.ts:148-232` sends `{error:{code, message}}` with messages like "Invalid or expired token" / "This session has ended. Sign in again." — also usable.) Either way, `serverMessage()` (`queryClient.ts:205-227`) would extract a real sentence from either shape; `listReviewerCandidates` never calls it.

**Why it matters.** This is the "Request a review" drawer's reviewer-account picker (`ProtocolDevForms.tsx` `useReviewerChoice`, `reviewerFieldFor`). On a lapsed session the field's help text reads, verbatim (`ProtocolDevForms.tsx:225`): *"The organization's members could not be loaded (the server answered 401), so only a reviewer without an account can be named here."* — a number substituted for a sentence the server had already written.

**Evidence.** `ProtocolDevWrites.ts:330-344`; consumed at `ProtocolDevForms.tsx:213-230` (`reviewerFieldFor`'s `'failed'` case) and `:353-368` (`useReviewerChoice`); server side `server/routes/tenant-users.ts:359-374` (route + `authorizeOrgAccess` call) and `:60` (the 401 body); the platform-gate alternative at `server/middleware/auth.ts:148-232`; the apiRequest 401-passthrough contract at `client/src/lib/queryClient.ts:390-423`.

**Smallest fix.** Read the body the way this same module's `detailOf()` (:74-81) already does, and use that; fall back to a plain "your session isn't authenticated — sign in and retry" only when the body truly carries nothing — never the literal template string with the numeric status.

### M-3 — "organisation" / "organization" named two ways in the same surface

**What the code does.** Seven user-visible strings spell the tenant concept "organisation": a cover-page placeholder (`ProtocolDevForms.tsx:180`, *"The organisation sponsoring the study"*), two bind-drawer sub-texts and a refusal alert (`ProtocolDevDesign.tsx:110,122,286`), and two AnA-context summaries (`ProtocolDev.tsx:64,79` — surfaced through AnA's paraphrase rather than drawn directly, so weighted accordingly). Elsewhere in the *same three files* the concept is "organization": four strings three lines apart in `ProtocolDevForms.tsx` (:222,225,227,229 — the review-request drawer's own help text), and the empty/error-state hint three lines... actually 130 lines below one of the "organisation" hits in `ProtocolDev.tsx` (:209, *"This is the organization's in-development clinical protocol"*). Repo-wide, "organization" is the codebase's own overwhelming convention — 844 hits across 198 files versus 69 across 39 (including the variable name `organizationId` used throughout these same fifteen files).

**Why it matters.** Opening `ProtocolDevForms.tsx`'s cover-page drawer and its review-request drawer minutes apart, on the same protocol, shows the same word spelled two ways. Not a factual error, but exactly the class of finding the 2026-09-24 report raised for "project"/"programme" in `TaskBoard.tsx` — one term per concept, and here the codebase's own majority makes clear which term that is.

**Smallest fix.** Change the seven "organisation" spellings cited above to "organization." No other wording change needed.

### M-4 — ProtocolDevDerivation.tsx: a double negative in the failed-read notice

**What the code does.** `ProtocolDevDerivation.tsx:428-433`:
```
{state.kind === 'failed' && (
  <div className="pde-refusal" role="alert">
    {'The derivation could not be read — ' + state.message} Nothing below is a derivation, and
    this is not a protocol with nothing to propose.
  </div>
)}
```

**Why it matters.** The file's own header comment states the intent correctly: a read failure "is never ... drawn as an empty diff." But "this is not a protocol with nothing to propose" is a double negative on the one screen whose entire job is telling the reader which of two states — "nothing to propose" vs. "couldn't be read" — they are looking at.

**Smallest fix.** State it in one direction: "Nothing below is a derivation. That does not mean this protocol has nothing to propose — the read failed, so nothing could be checked."

## Earlier findings re-verified

- **2026-09-24 M1** (unredacted-catch internals leak) and **M2** (Project/programme naming in `TaskBoard.tsx`), and **2026-09-28 M-0928-1** (`GatewayTransmittals.tsx`) and **M-0928-3** (`PublishingCenter.tsx`) — none of these touch any file in this lens's scope; not re-verified here.
- **`DocumentWorkbench.tsx`** — listed "Clean, read" in *both* earlier reports (42eb291d and aff7eae16), with 2026-09-28 specifically praising "the empty-state history comment at line 2945" as deliberate, considered copy work. At `7087f46e2` that commentary is present (now at :2952-2962, ~7 lines of drift) and the defect it documents fixing — interpolating the status filter mid-sentence to print "No ALL documents in this project" — remains fixed: the live strings at :2963-2974 read "No documents yet" / "Nothing at this stage." Holds. This pass read the file end-to-end rather than spot-checking it and surfaces one item neither earlier pass reported (M-1 above).
- **`RichSectionEditor.tsx`** — both earlier reports explicitly listed this file under "what I did NOT get to." Nothing to re-verify; this is its first line-by-line read, and it reads clean throughout — no finding in this file.
- **2026-09-28 M-0928-2** (seven ProtocolDev files using `e instanceof Error ? e.message : String(e)` with no `redactInternals`, at `ProtocolDevWorkspace.tsx:351`, `ProtocolDevDesign.tsx:74,147,182`, `ProtocolDevProjections.tsx:258`, `ProtocolDevDerivation.tsx:300,380`, `ProtocolDevForms.tsx:363,388`, and the `ProtocolDevSection.tsx`/`ProtocolDevSoa.tsx` shared pattern) — that report's own independent-verification round already refuted this (server refusals arrive pre-sanitised through `apiRequest`/`extractApiError`/`serverMessage`; the one unsanitised path, a raw browser "Failed to fetch," contains nothing `redactInternals` is built to catch either way). Re-verified by reading every cited file in full at `7087f46e2`: the pattern is unchanged, and I independently retraced the same `queryClient.ts:169-227,362-423` chain and reached the same conclusion. **Refuted, still holds.**
- Also from 2026-09-28, the adjacent-but-"not established" note that local `refusal()`/`detailOf()` helpers bypassing `serverMessage` (`ProtocolDevWorkspace.tsx:158-164`, `ProtocolDevDesign.tsx:44-49`, `ProtocolDevProjections.tsx:~177`, `ProtocolDevDerivation.tsx:~85`, `ProtocolDevWrites.ts:73-80`) might let a bare enum code like `UNAUTHORIZED` reach a toast — I traced this further this pass. Every 401 envelope these helpers can actually see (`auth.ts:148-232`, `tenantContext.ts:234-350`, `authBoundary.ts:127-129`) is either `{error:{code,message}}` or a plain-sentence string, never a bare code alone, so the theorised leak still does not materialise; in `ProtocolDevWrites.ts` specifically, `refusal()` (:84-96) special-cases every 401 sub-case before `detailOf()`'s value would ever be shown, so it is unreachable there. **Remains not established.** What I found in the same neighbourhood instead is a different, concrete mechanism (M-1/M-2 above: a bare *number* substituted when a message is genuinely absent, not a leaked *code*) — new this pass, not a restatement.

## What I did NOT get to

- I read every line of all seventeen named files; I did not sample or skip any of them.
- I did not read the imported components beyond confirming a specific call site: `ProtocolGov.tsx` (imported as `PG` by all fifteen ProtocolDev files — `PG.Btn`, `PG.StatusBadge`, `PG.FindingsList`, `PG.CompletenessGate`, `PG.Citation`, `PG.labelize` all carry their own copy I did not audit), the shared `C2CForm` (every ProtocolDev write drawer's generic chrome/validation text), and `AssignReviewDialog.tsx`, `FileToVaultDialog.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `DocumentCanvas.tsx`, `AuthoredHtml.tsx` (mounted by `DocumentWorkbench.tsx`'s rail/canvas host, each with its own unaudited strings).
- For M-1/M-2 I traced the client `apiRequest` contract and the platform's 401 envelope shapes plus one concrete route (`server/routes/tenant-users.ts`). I did not read the business-logic route handlers behind the editor family's other mutations (`server/routes/authoring.router.ts`, `server/routes/protocol-development.ts`, `server/routes/study-design.ts`, or the protocol-soa/risks/budget/reviews/consent route files) to independently confirm every *other* quoted server sentence in these files (e.g. the exact frozen-document wording, 409 `SECTION_CHANGED`, 409 `INVALID_STATE`) is verbatim what the server sends. Those strings are consistent with the client code's own extensive inline commentary describing having traced them, and nothing in the client code casts doubt on them, but I have not independently verified them against server source — noted rather than guessed.
- No CI gate (`check:microcopy`, `ci:internals-in-copy`, or any other) was run: this session had no shell/Bash tool at all, only Read/Grep/Glob, so no command-line check of any kind was available.
- I did not run `git log`/`git blame`; the commit was confirmed only via `.git/refs/heads/concept2cure-v2`.
