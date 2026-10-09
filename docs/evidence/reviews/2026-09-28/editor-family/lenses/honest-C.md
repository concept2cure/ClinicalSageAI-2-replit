# Honest state lens: the editor family, the ProtocolDev family, 2026-09-28

## Scope actually covered

All fifteen files read in full, top to bottom (line counts confirmed against `wc -l` at `7087f46e2`, which is also `HEAD` — the working tree was not ahead of the reviewed commit):

- `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx` — 1–233
- `client/src/concept2cure/v2/surfaces/ProtocolDevCompliance.tsx` — 1–210
- `client/src/concept2cure/v2/surfaces/ProtocolDevDerivation.tsx` — 1–457
- `client/src/concept2cure/v2/surfaces/ProtocolDevDesign.tsx` — 1–317
- `client/src/concept2cure/v2/surfaces/ProtocolDevForms.tsx` — 1–392
- `client/src/concept2cure/v2/surfaces/ProtocolDevPanes.tsx` — 1–202
- `client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx` — 1–304
- `client/src/concept2cure/v2/surfaces/ProtocolDevRegisters.tsx` — 1–294
- `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx` — 1–158
- `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx` — 1–283
- `client/src/concept2cure/v2/surfaces/ProtocolDevShared.tsx` — 1–55
- `client/src/concept2cure/v2/surfaces/ProtocolDevSigning.tsx` — 1–112
- `client/src/concept2cure/v2/surfaces/ProtocolDevSoa.tsx` — 1–284
- `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx` — 1–524
- `client/src/concept2cure/v2/surfaces/ProtocolDevWrites.ts` — 1–425

Sum: 4,250 lines, matching the charge exactly. `git diff 7087f46e2 HEAD -- <these 15 paths>` is empty, so every line number below is current.

**Server files traced** (only as far as needed to check a client claim):
- `server/routes/protocol-dev.routes.ts` — full (50 lines): `GET /api/protocol-dev`.
- `server/routes/protocol-development.ts` — `governed`/`governedScoped` (95–166), documents/sections/objectives/eligibility routes (168–397), study-design bind/unbind and design-derivation GET/apply (220–351), finalize (490–529), the shared `reason` schema (92).
- `server/routes/protocol-reviews.ts` — disposition route (150–206).
- `server/routes/protocol-soa.ts`, `protocol-risks.ts`, `protocol-budget.ts`, `protocol-deviations.ts` — route table only (`router.(get|post|patch|put)` signatures), to confirm every path `ProtocolDevWrites.ts`'s header comment claims actually exists.
- `server/services/protocol-development/protocol-development-logic.ts` — full (section templates, `evaluateCompleteness`, 1–155).
- `server/services/protocol-development/pdev-view-assembler.ts` — the assembly function, 460–591 (the `completeness`/`pct` computation, section/finding mapping).
- `server/services/protocol-development/protocol-development-service.ts` — `createProtocolDocumentTx` (60–78), `updateSectionTx` incl. `SECTION_CHANGED` (203–241), `getCompleteness`/`snapshotVersionTx`/`finalizeProtocolTx` (352–390).
- `client/src/concept2cure/v2/dataConnect.tsx` — `unwrapEnvelope`, `envelopeMeta`, shape guards, `liveGetOrNull`, `useLiveData`, `useLiveRows` (60–450), read in full to verify the exact mechanics behind `ProtocolDev.tsx`'s read.
- `client/src/lib/queryClient.ts` — `ApiRequestError`, `apiRequest` (1–90, 340–423), to verify `ProtocolDevWrites.ts`'s own documented claim about which statuses throw vs resolve.
- `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx` — `CompletenessGate`, `FindingsList`, `AuditTrail` (55–224), and `ProtocolRegisterForms.tsx` in full (234 lines) — the sibling CREATE-forms module every register drawer in `ProtocolDevWorkspace.tsx` opens.

**Checks run** (not asserted): `npm run ci:internals-in-copy` — clean, 0 baselined repo-wide. `npm run check:microcopy` — clean, 387 files. `node scripts/ci/check-ungated-fixture-fallback.mjs --list` — zero hits for any ProtocolDev file. `grep` across all 15 files for `from '.*fixtures'` — exactly one hit, `ProtocolDev.tsx:17`, `import type { PdevDoc }` — type-only, no runtime fixture data anywhere in this family. `PROBE_ONLY='protocol-dev' npx vitest run .../hostilePayloadProbe.test.tsx` — 2/2 pass (does not crash under any of the 8 hostile payload shapes). I additionally wrote a scratch Vitest harness (outside the repo, in the session scratchpad only — no repository file was created, edited or deleted) that mounts the real `ProtocolWorkspace` component from this commit against the same payload set and asserts on *rendered text*, not just "did it throw." That run is the direct evidence for HS-C-1 below.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| HS-C-1 | high | `ProtocolDev.tsx:189` (+ `dataConnect.tsx:229-237,442,448`) | The one live read this whole family depends on carries no response-shape guard, so a malformed-but-200 answer is indistinguishable on screen from "this organisation has no protocol" — or, for a different malformed shape, from a genuine, complete, ready-to-finalize one. |
| HS-C-2 | medium | `ProtocolDev.tsx:71,84` (+ `pdev-view-assembler.ts:495,551,553`) | The sentence AnA is given about protocol completeness divides by required sections but counts "sections complete" over all sections, with no label distinguishing the two, so the two numbers in the same sentence can disagree. |
| HS-C-3 | medium | `ProtocolDevDerivation.tsx:99-108` (+ `ProtocolDevDesign.tsx:72`) | The Design-derivation read treats any 200 with a truthy body as a completed derivation; a malformed one renders as five empty buckets — "nothing proposed, nothing conflicting, nothing incomplete" — rather than as a failed read. |

---

### HS-C-1 (high) — the primary read has no shape guard; a malformed 200 reads as "no protocol" or as "ready to finalize"

**What the code does.** `ProtocolWorkspace` reads the org's protocol via:

```
189:  const { rows, loading, error, empty } = useLiveRows<PdevDoc>('/api/protocol-dev', ['/api/protocol-dev', reloadKey]);
```

— two arguments only; `useLiveRows<T>(path, deps, guard?)` (`dataConnect.tsx:433`) takes an optional third `guard`, and none is passed. Mechanically, this is what happens without one:

- `unwrapEnvelope` (`dataConnect.tsx:74-86`) unwraps any single-key or `data`+`meta`/`success`/`total` object to its `.data`, with no check on what `.data` actually is.
- `liveGetOrNull` (`:251-273`) only rejects the shape when a `guard` is passed (`:266`); with none, any parsed body is accepted as `T`.
- `useLiveRows` then does `const rows = Array.isArray(st.data) ? st.data : (NO_ROWS as unknown as T[]);` (`:442`) and `empty: !st.loading && !st.error && rows.length === 0` (`:448`).

So a 200 response whose body is anything other than a bare array or a `{data:[...]}` envelope around an array — `{}`, `{ data: {} }`, `{ data: null }`, a JSON scalar, or a 200 that explicitly carries `{ error: '...' }` — collapses to `rows: [], error: undefined, empty: true`: bit-for-bit the same state a tenant with a genuinely empty protocol register produces. `ProtocolDev.tsx`'s own honest-state ladder —

```
201:  if (loading && !doc) { … "Loading protocol…" … }
204:  if (error && !doc) { … "Couldn't load the protocol" … }
212:  if (!doc) return <ProtocolEmptyState … />;
```

— never sees an `error`, so it falls straight to `!doc` and renders (`:139-179`) "No protocol in development for {program}" with "Start a protocol" / "Ask AnA to draft the synopsis".

A *different* malformed shape — the probe's own "rows present, fields absent" case, `{ data: [{}, {}] }`, modelling (per that test file's own comment) "a nullable column, a narrowed SELECT, or a partially migrated row" — does not hit the empty branch at all: `rows = [{}, {}]`, `doc = rows[0] = {}` is truthy, so the full `ProtocolWorkspaceDoc` renders on a document with no `id`, no `sections`, no `completenessFindings`.

**Why it matters to a regulated user.** In the first case, a person whose read failed or returned a malformed body for any reason external to this code (a caching proxy, a WAF page, a version-skewed deploy, a future regression in the route) is told their organisation has **no protocol in development** — indistinguishable from the truth for a brand-new org, false for one with real, possibly far-advanced work under way, and the screen then *invites* the exact wrong next action ("Start a protocol", or asks AnA to draft a synopsis "from the evidence already in this programme" that already has a real protocol). In the second case, the person sees a real-looking, apparently governed record.

**The evidence.** I did not just trace this by hand; I executed the real `ProtocolWorkspace` component from this commit (via a scratch Vitest harness in the session scratchpad — no repository file was touched) against the payload set `hostilePayloadProbe.test.tsx` uses:

- `{ data: [] }` (genuinely empty) and `{ data: {} }`, `{}`, `{ error: 'Something went wrong' }` (all malformed-but-200) rendered **byte-identical** text:
  `"No protocol in development for BX204Sections, objectives, the schedule of assessments, the risk register, the budget, amendments and review threads are all governed on one protocol document.Serves the ICH M11 protocol recordStart a protocolAsk AnA to draft the synopsis"`
- `{ data: [{}, {}] }` rendered:
  `"…Sections0/00%Finalization readiness0 of 0 required sections complete Ready to finalizeNo findings.Finalize protocolThis protocol has no sections yet."`

That second string is composed from `ProtocolDevPanes.tsx`'s `Outline` (`Sections {complete}/{total}`, :50) and `ProtocolGov.tsx`'s `CompletenessGate` (`{pct}%`, "{complete} of {total} required sections complete", "Ready to finalize" when `ready`, :109-124) plus `FindingsList`'s `"No findings."` for an empty array (`ProtocolGov.tsx:83`) — the exact composite shape the charge names as the sharpest instance of this defect class in this codebase's history, reproduced here by a malformed response rather than a genuinely empty assessment.

**Mitigating factor I verified rather than assumed.** The actual finalize act does not trust this display. `finalizeProtocolTx` (`protocol-development-service.ts:374-381`) independently re-derives `evaluateCompleteness()` from the database's own rows and throws `INVALID_STATE` if it disagrees, so this defect cannot by itself let an incomplete protocol actually be signed as finalized. In the exact `[{}, {}]` reproduction, `doc.id` is also missing, so `numericDocId = Number(doc.id)` is `NaN`, `canWrite` is `false`, and clicking "Finalize protocol" only raises a toast ("no numeric document id — governed writes need the governed store", `ProtocolDevWorkspace.tsx:331-334`), not the signing modal. A more surgical malformed response — a valid `id`, only `sections`/`completenessFindings` missing or wrong-shaped — would reach the real `ProtocolSignModal` and only be refused after a full password/meaning/reason re-entry. That real cost to a Part-11 user, not a corrupted record, is what I am rating high rather than blocker: the charge's blocker clause ("the person is shown a governed state that is false") is met on its face, but the trigger is a malformed 200 body, not anything a normal user or the current, correct server code produces in the ordinary course — closer to the rubric's own "narrow trigger" language for medium than to the every-tenant-every-day trigger of the canonical NDA-cockpit blocker. I am flagging the tension rather than resolving it unilaterally.

**Smallest fix.** Pass the guard the codebase already built for exactly this: `useLiveRows<PdevDoc>('/api/protocol-dev', deps, isRowsWith('id'))` (`isRowsWith`, `dataConnect.tsx:229-237`) — an empty array still passes (line 232: "an EMPTY array passes… zero rows is the honest empty state"), but a non-array or a fields-absent row now sets `error`, which the already-correct `error && !doc` branch (`:204-211`) already renders honestly.

---

### HS-C-2 (medium) — the AnA narrative divides by required sections but counts "complete" over all sections

**What the code does.** `anaContextFor`'s summary sentence for AnA:

```
71:  const done = secs.filter((sec) => sec.status === 'complete').length;
…
84:      `${doc.status}, ${doc.completeness}% complete — ${done} of ${secs.length} ` +
85:      `section(s) complete. …`
```

`done`/`secs.length` count **every** section regardless of `required`. `doc.completeness`, however, is computed server-side from **required** sections only:

```
495:    const pct = requiredSecs.length ? Math.round((100 * requiredComplete) / requiredSecs.length) : 0;
…
551:      completeness: pct,
```

and `doc.sections` sent to the client (`pdev-view-assembler.ts:553`) is the full, unfiltered list, each row carrying its own `required` flag — the client has what it needs to compute a matching pair, and does, two components away: `ProtocolDevPanes.tsx`'s `Outline` computes `reqTotal`/`reqComplete` from `.required` (`:44-45`) and `ProtocolGov.tsx`'s `CompletenessGate` labels them explicitly "required sections" (`:113`). `anaContextFor`'s sentence carries no such qualifier — the word "required" does not appear in it at all.

**Why it matters to a regulated user.** Every protocol-kind template seeds 1–2 explicitly optional sections alongside 5–12 required ones (`protocol-development-logic.ts:24-76`; e.g. clinical: 12 required + `data_management`/`references` optional). An author who has completed every required section but not yet touched the optional ones is reported to AnA as, e.g., "100% complete — 12 of 14 section(s) complete" — two figures over two different denominators, worded as if they describe the same thing. A reviewer, or an LLM relaying that sentence, has no way from the sentence alone to know "100%" excludes two sections that are not started. This is the on-screen UI's own correctly-labelled pair, un-labelled, in the one channel (AnA's context) that is meant to be the canonical description of the screen.

**The evidence.** Quoted above, file:line `ProtocolDev.tsx:71,84-85`, `pdev-view-assembler.ts:495,551,553`, `ProtocolDevPanes.tsx:44-45,64`, `ProtocolGov.tsx:113`.

**Smallest fix.** In `anaContextFor`, compute `done`/`len` from `secs.filter(s => s.required)` so both halves of the sentence share `doc.completeness`'s own population — or state both figures with their own labels ("required sections" vs. "sections overall") the way the pixel UI already does.

---

### HS-C-3 (medium) — a malformed design-derivation read renders as "everything already reconciled"

**What the code does.**

```
99:  async function loadDerivation(documentId: number): Promise<LoadState> {
…
103:    if (!res.ok || !json) return { kind: 'failed', message: refusal(json, res.status) };
104:    return {
105:      kind: 'ready',
106:      studyDesignId: String(json.studyDesignId ?? ''),
107:      derivation: asDerivation(json.derivation),
108:    };
109:  }
```

`!res.ok || !json` only catches a non-2xx status or an unparseable body; it does not check that `json` actually looks like `{studyDesignId, derivation}`. `asDerivation` (`:88-97`) turns an absent/malformed `json.derivation` into `{proposed:[], conflicts:[], unchanged:[], unevidenced:[], incomplete:[]}` — every bucket empty, silently, with no error. The render (`:435-442`) then shows "Derived against study design not named by the server" followed by all five `Bucket`s, each printing `"Nothing in this bucket."` (`:162`) once.

**Why it matters to a regulated user.** Someone opening the Design derivation tab after a malformed-but-200 read is told, in five separate panels, that the protocol proposes nothing new, conflicts with nothing, agrees on everything already unchanged, evidences nothing else, and has nothing incomplete — a comprehensive-sounding "everything already reconciled" verdict that in fact reflects a broken read, not a real comparison between the protocol and its bound design. The identical shape recurs at `ProtocolDevDesign.tsx:72` — `(Array.isArray(j.designs) ? j.designs : [])` inside `useTenantDesigns` — which would tell an author trying to bind a design "This organisation has no persisted study design yet" on the same class of malformed response, rather than "the read failed."

**The evidence.** File:line as quoted: `ProtocolDevDerivation.tsx:88-97,99-108,155-166,435-442`; `ProtocolDevDesign.tsx:63-79` (function), `:72` (the fallback). This finding is verified by reading the code, not by execution (unlike HS-C-1) — the logic is short and unambiguous enough that I am confident in it, but I want to be explicit about the difference in verification method per the evidence standard.

**Mitigating factor.** No incorrect write can result from this specific display bug: the "Apply accepted" action is disabled while `paths.length === 0` (`:414`, and with every bucket empty there is nothing to select), and even where paths exist, `applyDerivationTx` (server, `design-derivation-service.ts`, not fully read this pass — see below) re-derives from live rows at apply time and refuses any path it can no longer evidence, per the module's own header (`:10-15`), which I confirmed is enforced by `POST .../design-derivation/apply` (`protocol-development.ts:328-351`) returning the server's own `applied`/`rejected`/`derivation`, never trusting the client's copy.

**Smallest fix.** Same shape as HS-C-1: check that `json` actually carries a `derivation` object (or `studyDesignId`) before treating a 200 as `ready`, rather than defaulting silently; and gate `useTenantDesigns` on the response actually carrying a `designs` array rather than falling back to `[]` unconditionally.

## Earlier findings re-verified

- **2026-09-22, `ProtocolDev.tsx:50-125`: "`loading && !doc` / `error && !doc` are checked ahead of `!doc`."** — **Holds, moved.** Same three-branch ladder exists today at `ProtocolDev.tsx:201,204,212` (`loading && !doc`, `error && !doc`, `!doc`). The line-number drift (50-125 → 201-212) is explained by the file's own header comment: this file used to be the single, much shorter `ProtocolDev.tsx`; the 15-file split "happened when the registers stopped being read-only on 2026-09-21," and subsequent documentation growth (the `anaContextFor` block, module header) pushed this ladder down without changing it.

- **2026-09-24, `honest-state.md`: "ProtocolDev / BiopharmaProject: completeness and readiness narratives require server state and use `typeof === 'number'` / non-null checks, not truthiness."** — **Partially holds; the bullet carries no file:line in the source report, so I could only check it against current code rather than against what was originally seen.** What holds: the `studyDesign` narrative (`ProtocolDev.tsx:75-80`) correctly discriminates absent (`!sd`) from unresolved (`!sd.resolved`) from resolved — a genuine non-null discrimination. What I could not confirm: `doc.completeness` itself is coerced with `Number(doc.completeness ?? 0)` both in `anaContextFor` (`:84`) and in `ProtocolDevPanes.tsx:64`; I found no `typeof doc.completeness === 'number'` gate anywhere in these 15 files. If the original bullet meant that literal pattern for `doc.completeness` specifically, it does not hold as stated — see HS-C-1, where exactly this coercion is what lets a missing `doc.completeness` render as a plain 0%. I did not re-read `BiopharmaProject.tsx` (out of this charge's file list), so I cannot speak to that half of the bullet.

- **2026-09-24, `lenses.md`: "`ci:error-envelope` failed on … `ProtocolDevSoa.tsx:57` … fixed in `2fb69da5`."** — **Holds fixed**, at current line 60: `return serverMessage(j) ?? 'Your session has ended. Sign in again; the cell was not changed.';`, with the fix narrated in the comment immediately above it (`:56-58`).

- **2026-09-24, `lenses.md`, P1 (critical, "holds fixed"): `protocol-development.ts:496-518` and `protocol-reviews.ts:165-195` run `signProtocolAct` (reauth…).** — **Re-verified, holds**, at current lines 496-529 and 165-206: both routes call `signProtocolAct` carrying `reauth: parsed.data.reauth`, gated by `requireEditorAccess` + `signingAttempts`. I re-confirmed this at the route-call-site level only; I did not re-open `protocol-signature.ts` itself this pass, so the "SoD before the write" half of that finding is carried forward rather than independently re-derived this time.

- **2026-09-28, `honest-state.md`: `ProtocolDev` (+ `pdev-view-assembler.ts`) listed under "Clean, read end to end this week (both branches)."** — **Does not hold at the depth this pass was charged to reach.** HS-C-1 above is a concrete counterexample in the exact file and read path that report examined. The three honest-state branches (loading/error/empty) *are* ordered correctly as written, which is presumably what a same-day read confirmed — but `useLiveRows` is called with no shape guard (`:189`), so a malformed-but-200 response never reaches the `error` branch and instead satisfies `empty`. That week's own `hostilePayloadProbe.test.tsx` run (scoped to "the 12 Authoring/Submission Center/Readiness surface ids," 13/13 pass) — which I independently re-ran for `protocol-dev` alone and also got 2/2 — only proves the surface does not crash under these payloads; it asserts nothing about *which honest-state branch* a malformed response lands in (I confirmed this by reading the probe's own assertions, `hostilePayloadProbe.test.tsx:199-228`: it checks for `[data-dead]` or non-empty HTML, never for specific rendered text), so it could not have caught HS-C-1 either. This is exactly the "not read line by line" gap the charge names as this pass's reason to exist.

## What I did NOT get to

- **Service-layer internals for the non-signing write routes.** I confirmed every route `ProtocolDevWrites.ts`'s header comment claims exists (visits, assessments, risk residual, budget items/params, reviewer request, deviation assessment, cover page, start-protocol) by grepping each router's registered paths, and read the request/response *contract* (schema, status codes) for the ones most load-bearing for honesty (`updateSectionTx`'s `SECTION_CHANGED` check, `finalizeProtocolTx`'s gate). I did **not** open the DB-query internals of `protocol-soa.ts`'s cell-write handlers, `protocol-risks.ts`'s risk service, `protocol-budget.ts`'s budget service, `protocol-reviews.ts`'s reviewer-assignment service, or `protocol-deviations.ts`'s deviation service, nor `design-derivation-service.ts` or `protocol-signature.ts` (the internals of `signProtocolAct`). Nothing I read contradicts the earlier reports' claims about them; I simply did not re-derive those claims from scratch this pass.
- **Imported tab components reachable from these files but not named in the charge's fifteen.** `IrbPackage.tsx` (`ProtocolDevWorkspace.tsx`'s `irb-package` tab), `biostatBridge.tsx` (`StudyDesignStatisticsTab`), `RichSectionEditor`, `EsignModal`, `C2CForm` — I traced only the props/contract each ProtocolDev* file hands them, per the charge's own instruction to read an imported component only as far as needed. `ProtocolRegisterForms.tsx`, not one of the fifteen but directly opened by `ProtocolDevWorkspace.tsx`'s `openReg`, I did read in full — it is clean, and notably models "not assessed" as an explicitly absent value rather than a defaulted "no" (`declared()`, `:54-56`), which is the correct write-side counterpart to the read-side distinction this lens cares about most.
- **A possible access-control gap I noticed but did not pursue, because it is not an honesty finding.** `requireEditorAccess` (or any role check beyond authentication) appears only on the two signing routes (`protocol-development.ts:496`, `protocol-reviews.ts:165`); none of the other mutation routes across `protocol-development.ts`, `protocol-soa.ts`, `protocol-risks.ts`, `protocol-budget.ts`, `protocol-reviews.ts`, or `protocol-deviations.ts` appear to have a role gate at the route or router level (no `router.use(...)` in any of the six files). If a `viewer` can call these today, that is a Part 11 / RBAC-lens question (whether the *control* exists), not a question of whether the *screen* is honest about what happened — outside this lens by the charge's own framing. I am naming it so it is not lost, not filing it as HS-C-anything.
- **A full click-through of every tab under a live document.** I hand-verified `ComplianceTab`, `StudyDesignTab`, `DerivationTab`, `ProjectionsPanel`, `SoaTab`, `RiskTab`/`BudgetTab`, `ReviewsTab`/`ConsentTab` by reading every line and, for the read paths, tracing to the server; I did not mount a fully-loaded document and click through every tab in a browser/RTL session (only the default "Document" tab and the empty/malformed top-level states were executed, per HS-C-1's scratch harness).
- **Everything outside these fifteen files and their most immediate server dependents** — this pass did not touch Authoring, Submission Center, Submission Readiness, Vault, Projects or QMS, all covered (or explicitly left open) by the earlier reports cited above.

**Clean, read end to end, both branches, no finding:** `ProtocolDevShared.tsx`, `ProtocolDevWorkspace.tsx`, `ProtocolDevSection.tsx`, `ProtocolDevPanes.tsx`, `ProtocolDevForms.tsx`, `ProtocolDevWrites.ts`, `ProtocolDevSigning.tsx`, `ProtocolDevSoa.tsx` (the grid's optimistic cell-toggle at `:78-103` reconciles correctly: `flip` then `writeCell`, and a refusal calls `flip` again — `:94-101` — before reporting it, so a rejected write is never left showing the unconfirmed state), `ProtocolDevRegisters.tsx`, `ProtocolDevReviews.tsx`, `ProtocolDevCompliance.tsx` (the one pane in this family that deliberately refuses to compute a percentage at all — three counts, never divided), `ProtocolDevProjections.tsx`. Every governed write in this family re-reads `GET /api/protocol-dev` on confirmation rather than appending locally; every signed act (`finalize`, `disposition`) runs the shared re-auth ceremony and is independently re-validated server-side against live rows, not against whatever the client last displayed.
