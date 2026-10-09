# Honest state lens: the editor family, DocumentWorkbench, 2026-09-28

## Scope actually covered

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — all 5,134 lines, read in full at `7087f46e2`, both branches of every fetch/mutation, every `catch`, every render of server state.
- Prior reports read in full before filing: `docs/evidence/reviews/2026-09-22/honest-state.md`, `2026-09-24/honest-state.md`, `2026-09-24/lenses.md`, `2026-09-28/honest-state.md`, `2026-09-28/ectd-lane-second-pass/honest-state.md`. None of these read this file line by line; the one prior finding actually located in it is P6 (below). The 2026-09-28 report's "clean" note covers only this file's `docsState` branch, not the whole file — re-confirmed as part of this pass, not assumed.
- Server files traced (specific ranges, not the whole file): `server/routes/authoring.router.ts` — auth/tenant/actor helpers (108–505), the `/sections/:sectionId` write-lock middleware and `canEditSection` (299–463), `GET /docs/:docId/sections` (1545–1604), `PATCH /sections/:sectionId` (1647–2029), `GET .../history` and `.../history/verify` (2033–2100), `POST .../revert` (2103–2236), `POST .../cite-source` and `DELETE .../cite-source/:id` (2500–2573), `POST /documents/:id/review` (2724–2805), `POST /docs/:docId/freeze` (3708–3837), `POST /docs/:docId/refresh-all` (4631–4667), `POST /docs/:docId/sections/reorder` (6171–6254).
- `server/services/clinical-regulatory-evidence/source-usage.service.ts:172–260` (`citeSource`, `removeSourceCitation`).
- `server/services/authoring/document-lock.ts:55` (`LOCKED_DOCUMENT_STATUSES`).
- `client/src/lib/queryClient.ts:318–423` (`apiRequest`/`ApiRequestError` throw contract — load-bearing for reading almost every `catch` in the client file).
- `db/migrations/20260725_authoring_document_loop_tables.sql:59–102` (confirms `authoring_sections`/`authoring_citations` have no `revision_count`/`comment_count`/`citation_count` columns — those are query-time joins only).
- `shared/constants/governed-reason.ts:10` (reason-for-change floor).
- Checks run (not asserted): `npm run ci:internals-in-copy` → clean, 0 baselined, 0 matches in this file. `npm run check:microcopy` → clean, 387 files, 0 matches in this file. `PROBE_ONLY='document-authoring' npx vitest run client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx` → 2/2 pass — `DocumentWorkbench` (mounted via the `document-authoring` surface) does not throw under any of the eight hostile payload shapes.
- Grepped this file for `useLive`/`SampleTag`/fixture imports: zero. Ledger L44/L72 (sample-as-live) does not apply here — this file never used that API.

## Findings

| id | severity | file:line | one-line summary |
|---|---|---|---|
| HS-A-1 | medium | `DocumentWorkbench.tsx:2054–2076`, `:2253–2257` | The "History N" badge and "N revisions" meta text never increment after a successful save or revert, because neither server response carries a revision count and the client never re-fetches to get one. |
| HS-A-2 | medium | `DocumentWorkbench.tsx:1836–1868`, `:2361–2395` | Removing a citation or replying to a comment leaves the "Sources N" / "Comments N" badges and citation count overstated/understated — increment-only local bookkeeping with no symmetric decrement or resync. |
| HS-A-3 | medium | `DocumentWorkbench.tsx:2543–2589` | `moveSection`'s comment-promised auto-resync on a reorder conflict ("A 409 means the section list moved under us — adopt the truth") is dead code — `apiRequest` throws before that branch is ever reached — so the tree keeps showing a stale section order after a real conflict. |
| HS-A-4 | medium | `DocumentWorkbench.tsx:3747–3754`, `:4463–4471` | "Re-read all sources" is reachable and effective against a FROZEN/APPROVED document (no client or server guard), contradicting the on-screen "cannot be edited" claim; its own tooltip's safeguard ("Frozen citations are left alone") never actually triggers in production. |

### HS-A-1 — revision count never updates after a save or a revert

**What the code does.** `saveSectionContent` adopts the server's returned row verbatim:

```
2055	        const adopted = (json as { section?: AuthSection })?.section;
2056	        const persisted = adopted?.content ?? serialized;
2057	        // Adopt the server row (revision counter, updated_at) into the tree.
2058	        setSections(ss =>
2059	          ss.map(s =>
2060	            s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s
2061	          )
2062	        );
```

and the toast already anticipates the field being absent:

```
2072	        fireToast(
2073	          adopted && adopted.revision_count != null
2074	            ? `Section saved — revision ${num(adopted.revision_count)} recorded (${activeSection.code}).`
2075	            : `Section saved (${activeSection.code}) — open History to confirm the revision.`
2076	        );
```

`revert` does the same adopt-verbatim thing at `:2253–2257`. But `PATCH /sections/:sectionId` returns `section: result.rows[0]` from `UPDATE authoring_sections ... RETURNING *` (`server/routes/authoring.router.ts:2010–2013`), and `revert` returns `section: result.rows[0]` from the same kind of raw `UPDATE ... RETURNING *` (`server/routes/authoring.router.ts:2155–2161, 2226–2229`). `authoring_sections` has no `revision_count` column — confirmed against its `CREATE TABLE` (`db/migrations/20260725_authoring_document_loop_tables.sql:59–70`); the count only exists as a query-time `COUNT(DISTINCT r.id)` join in `GET /docs/:docId/sections` (`server/routes/authoring.router.ts:1551–1556`). So `adopted.revision_count` is always `undefined` from these two endpoints, the toast's own defensive branch always fires (harmless — it never asserts a number), but the **badge and meta line, which read the same `sections` state unconditionally**, keep showing the pre-save number:

```
3193	              {I.clock} History
3194	              {activeSection && num(activeSection.revision_count) > 0
3195	                ? ' ' + num(activeSection.revision_count)
3196	                : ''}
...
3657	                    {num(activeSection.revision_count) > 0
3658	                      ? ` · ${num(activeSection.revision_count)} revisions`
```

`sections` (and therefore these counts) is only refreshed by `loadSections`, which only re-fires when `activeDocId` changes (`:1194–1202`) — not on save, not on revert, not on a section switch within the same document.

**Why it matters.** Save and Cmd/Ctrl-S "can each fire many times while working through one section, and each one is a real write" (the file's own words, `:660`). Every one of those real, Part‑11‑governed writes mints exactly one new revision, and the visible "History N" count does not move. A reviewer glancing at the badge, or the meta line under the section title, reads a revision count that under-states how many times the record has actually been amended in the current session — with nothing on screen to suggest it might be stale. The true count is one click away (opening History re-reads it correctly), so the underlying record is never wrong — only the at-a-glance figure is.

**The false sentence a user would read.** "History 3" / "· 3 revisions" on a section that has, in this sitting, already been saved a fourth (or fifth, sixth…) time.

**The smallest fix.** Either have `PATCH /sections/:sectionId` and `POST /sections/:sectionId/revert` return the same joined `revision_count` (`comment_count`, `citation_count`) the list endpoint computes, or — cheaper — increment `revision_count` locally by 1 on every successful content-changing save and every successful revert, the same one-line pattern already used for `citation_count` in `citeSource` (`:1821`) and for `comment_count` in `addComment` (`:2328–2330`).

### HS-A-2 — citation/comment counts drift stale after removal/reply (asymmetric bookkeeping)

**What the code does.** `citeSource` explicitly patches the local count on success, with a comment that names the general hazard:

```
1816	        setPicking(false);
1817	        if ((json as any)?.created) {
1818	          // Same staleness as the comment count: the section row is the only
1819	          // source of the rail button's number.
1820	          setSections(ss =>
1821	            ss.map(s => (s.id === activeSectionId ? { ...s, citation_count: num(s.citation_count) + 1 } : s))
1822	          );
1823	        }
```

`uncite` (`:1836–1868`) has no such counterpart — on a successful `DELETE`, it fires a toast and calls `loadSources` only; it never touches `sections`, so `citation_count` is never decremented. `addReply` (`:2361–2395`) is the same shape: it posts to the same `POST /sections/:sectionId/comment` endpoint `addComment` uses (which server-side inserts another row into `authoring_citations`/`authoring_comments` respectively, per `server/routes/authoring.router.ts:2549–2571` and the comment-creation route at `2254`), but never bumps `comment_count` the way `addComment` does at `:2328–2330`. The server-computed counts (`server/routes/authoring.router.ts:1551–1556`) count every row regardless of whether it is a reply or a top-level comment, so a reply genuinely raises the true count. `DELETE /sections/:sectionId/cite-source/:sourceId` genuinely removes the row (`server/services/clinical-regulatory-evidence/source-usage.service.ts:246–260`, confirmed non-soft-delete), so the true count genuinely drops.

**Why it matters.** "Sources N" (`:3205–3208`) and "· N citations" (`:3660–3662`) overstate the section's recorded evidentiary basis after a source is removed, for the rest of the session on that document (since, as in HS-A-1, nothing but a document switch reloads `sections`). "Comments N" (`:3182–3186`) understates the number of messages in a review thread after a reply. Both are read at a glance as a fact about the record.

**The false sentence a user would read.** "Sources 2" after the author removed one of three recorded citations (true count: 2 remaining, coincidentally, or worse if more were removed) shown as if unchanged from before the removal; "Comments 1" on a thread that already has a reply in it.

**The smallest fix.** Mirror the existing pattern symmetrically: decrement `citation_count` in `uncite`'s success branch, increment `comment_count` in `addReply`'s success branch — the same one line each that `citeSource`/`addComment` already use.

### HS-A-3 — `moveSection`'s 409 auto-resync is dead code

**What the code does.**

```
2543	  const [reordering, setReordering] = useState(false);
2544	  const moveSection = useCallback(
2545	    async (dir: -1 | 1) => {
...
2560	        if (res.status === 401) {
2561	          fireToast('Not moved — your session isn’t authenticated.', 'error');
2562	          return;
2563	        }
2564	        if (!res.ok) {
2565	          fireToast(
2566	            'Couldn’t move the section — ' +
2567	              (serverMessage(json) ?? 'the server refused it') +
2568	              ' The order is unchanged.',
2569	            'error'
2570	          );
2571	          // A 409 means the section list moved under us — adopt the truth.
2572	          if (res.status === 409) void loadSections(activeDocId);
2573	          return;
2574	        }
2575	        await loadSections(activeDocId);
...
2579	      } catch (e) {
2580	        fireToast(
2581	          'Couldn’t move the section — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
2582	          'error'
2583	        );
2584	      } finally {
2585	        setReordering(false);
2586	      }
```

`apiRequest` throws an `ApiRequestError` for **every** non-2xx status except 401 (`client/src/lib/queryClient.ts:398–419`: `if (!response.ok && response.status !== 401) { ... throw new ApiRequestError(...) }`). `POST /docs/:docId/sections/reorder` answers a genuine conflict with a real, reachable 409 (`server/routes/authoring.router.ts:6218–6225`: *"The document's sections changed since you loaded them — reload and retry. Nothing was reordered."*). Because that 409 makes `apiRequest` throw, execution never reaches line 2564's `if (!res.ok)` block at all for a 409 — it jumps straight to the `catch` at `:2579`, which has no `loadSections` call and no `res.status === 409` check. The line-2572 branch — the one that would "adopt the truth" — is unreachable.

**Why it matters.** This is the same class of bug the file's own comment (`:2034–2053`) describes fixing once already for `saveSectionContent`: an `!res.ok` branch written under the assumption that `apiRequest` returns rather than throws. Here it was not fixed, so on a genuine concurrent reorder (two people, or two tabs, working the same document's section order — a realistic case on a CTD document with a writer and a reviewer), the section tree's displayed order — and the Up/Down buttons' enabled state, both derived from `sections` — stay exactly as they were before the failed attempt, silently diverging from what the server now holds, until something else (a document switch, a page reload) reloads `sections`. The toast the user actually sees (built from `e.message`, which is the server's real 409 text) does correctly say "reload and retry," so the user is not left with no information — but the screen itself does not self-correct or flag that its own displayed order may now be wrong.

**The false sentence a user would read.** The section tree continues to present a specific ordering (and specific Up/Down affordances) as current immediately after a failed reorder attempt, when the server's own response — already received — said that ordering had changed underneath the client.

**The smallest fix.** Move the resync into the `catch` block, gated on `(e as Partial<ApiRequestError>)?.status === 409` — the only place `apiRequest`'s throw contract can ever actually deliver that status — mirroring the fix already applied once in this same file to `saveSectionContent`.

### HS-A-4 — "Re-read all sources" is reachable and effective on a frozen/approved document

**What the code does.** The sealed-document banner makes a blanket claim:

```
3747	{docSealed && (
3748	  <div className="scaf-note" role="status" style={{ marginBottom: 12 }}>
3749	    {I.lock}{' '}
3750	    {String(activeDoc?.status).toUpperCase() === 'APPROVED'
3751	      ? 'This document has been approved and frozen. Its content is part of the signed record and cannot be edited.'
3752	      : 'This document is frozen. Its content is sealed under a content hash and cannot be edited.'}{' '}
3753	    Create a new version to make further changes.
3754	  </div>
3755	)}
```

Every other mutating control in the file is disabled under `docSealed` — Save (`:3316`), Revert (`:4282`, fixed this cycle, see below), Rename (`:3602`), Move up/down (`:3612`), Draft with AnA (`:3332`), Draft from sources (`:3362`) — but the Sources rail's document-wide "Re-read all" is not:

```
4463	            <button
4464	              className="nda-open"
4465	              onClick={() => void refreshAllSources()}
4466	              disabled={!activeDocId || refreshingAll}
4467	              data-testid="refresh-all-sources"
4468	              title="Re-read every unfrozen citation in this document against its stored source. Frozen citations are left alone."
4469	            >
4470	              {refreshingAll ? 'Re-reading…' : 'Re-read all'}
4471	            </button>
```

Server-side, `POST /docs/:docId/refresh-all` (`server/routes/authoring.router.ts:4631–4667`) never checks the parent document's status — it only excludes citations where `c.frozen_at IS NULL` is false (`:4638–4645`). I verified this exclusion is inert in production: `authoring_citations.frozen_at` is set nowhere in any server code path or migration trigger — the only two writers of it anywhere in the repository are raw SQL in `source-usage.service.pglite.integration.test.ts:362,440`, poking the column directly to simulate a state nothing in production ever produces. So on a real deployment, **no citation is ever frozen**, and the tooltip's own safeguard ("Frozen citations are left alone") never activates.

This is not because the product lacks the concept of a write-lock: `POST /sections/:sectionId/cite-source` and `DELETE /sections/:sectionId/cite-source/:sourceId` (which do the same kind of citation mutation, per-citation rather than document-wide) *are* protected — via a prefix-matched `router.use('/sections/:sectionId', ...)` middleware (`server/routes/authoring.router.ts:413–463`) that runs `canEditSection` (`:299–378`), which joins section→document by tenant and refuses on `LOCKED_DOCUMENT_STATUSES` (`FROZEN`/`APPROVED`, `server/services/authoring/document-lock.ts:55`) "for EVERY caller... at every flag setting" (`:332–336`). `/docs/:docId/refresh-all` simply is not under that path prefix, and (unlike `/docs/:docId/sections/reorder`, which added its own explicit `LOCKED_DOCUMENT_STATUSES` check at `:6201`) never got an equivalent check of its own.

**Why it matters.** I traced the actual blast radius carefully before rating this: refreshing a citation's checksum against its *external* source's current content does not rewrite the frozen document's own sealed text, and the freeze snapshot (`frozenContent` at `:3830–3834`) does not itself capture citation state either, so this is not a way to alter what was signed. What it does do is contradict, in the same view, the banner's unqualified claim that the document "cannot be edited" — a click away, for a document a reviewer has just been told is sealed.

**The false sentence a user would read.** "This document is frozen. Its content is sealed under a content hash and cannot be edited," read while the "Re-read all" control in the same pane remains fully live and will succeed — with no refusal, client or server — at changing a stored fact (a citation's recorded checksum/state) associated with that document; and the button's own tooltip, "Frozen citations are left alone," describing a safeguard that never triggers.

**The smallest fix.** Either add `LOCKED_DOCUMENT_STATUSES` check to `POST /docs/:docId/refresh-all` (mirroring `:6201`) and gate the button on `docSealed` like its siblings, or — if refreshing evidence checksums post-freeze is intentionally allowed as a monitoring action independent of the content seal — say that explicitly in the banner and the tooltip instead of the current unqualified claims.

**Read clean, no finding.** Every failed-read branch I traced (sections, comments, audit, sources, revisions, docs list) carries a distinct `'error'` state that is never collapsed into an empty array, both in the state-setting code and at every render site (`:2940–2988`, `:3453–3480`, `:3522–3545`, `:4231–4250`, `:4349–4372`, `:4506–4521`, `:4757–4778`) — confirmed by reading each `catch`, not just asserted, and consistent with the hostile-payload-probe pass. This file computes no readiness/completeness percentage, so distinction 3 does not arise here; its one heuristic score is explicitly and repeatedly labeled "heuristic signals, not a compliance determination" (`:340`, `:3689`), and its zero-deficiency sentence names the server's own `checks_run` denominator rather than asserting "0 issues" with an unstated one (`:3701–3708`). AI-drafted text enters the record only as a tracked, pending suggestion, never as settled text (`:4084–4112`), and the accepted-draft attribution toast is explicitly framed as "the server's own count, not a claim of correctness" (`:2654–2663`). The §11.10(d)/(e) reason-for-change floor matches exactly between client (`:1987`, 8 chars) and server (`GOVERNED_REASON_MIN = 8`, `shared/constants/governed-reason.ts:10`, enforced independently at `authoring.router.ts:1809–1812`), so a client bypass cannot produce an unreasoned save.

## Earlier findings re-verified

- **P6** (`2026-09-24/lenses.md`, low, was open) — *"`DocumentWorkbench.tsx:4270-4276`: Revert has no `disabled`, although `docSealed` (`:868`) already disables Save and Insert."* **Fixed.** At head the Revert button reads:
  ```
  4278	                  <button
  4279	                    className="nda-open"
  4280	                    style={{ marginLeft: 'auto' }}
  4281	                    onClick={() => revert(r.id)}
  4282	                    disabled={docSealed}
  4283	                    title={docSealed ? 'This document is frozen — its content cannot be reverted.' : undefined}
  4284	                  >
  ```
  `docSealed` is now computed at `:869–870`, matching every other disablement check in the file.

- **2026-09-28/honest-state.md**'s note that "DocumentAuthoring (+ `DocumentWorkbench`'s `docsState` branch)" was clean — **still holds**, now verified against the *whole* file rather than just that branch: `docsState`/`sectionsState` are threaded honestly through every render path I found (tree pane `:2940–2988`, document view `:3453–3480`, empty-selection state `:3522–3545`), and no new regression was introduced elsewhere.

- **Adjacent to this lens, verified opportunistically because the same code was already open in front of me:**
  - **P5** (`2026-09-24/lenses.md`, medium, Part‑11 lens, was open) — *"the section save (`:1645`), freeze (`:3673`) and review verdict (`:2710`) validate no reason. The freeze falls back to a canned `'Document frozen for compliance'`."* **Fixed, at all three sites, at head:** section save now requires a reason via `requireGovernedReason(req.body?.changeReason)` and refuses 400 before writing (`authoring.router.ts:1806–1813`); freeze now requires one via `requireGovernedReason(reason)` and refuses 400 (`:3712–3716`), and the canned fallback string no longer exists anywhere in the repository (`grep -rn "Document frozen for compliance"` → 0 matches); the review-verdict route now requires one for a rejection/changes-requested and allows an optional one on approval, both validated server-side (`:2731–2737`). This is a Part‑11/governance finding, not strictly an honest-state one by this lens's own four distinctions, but it bears directly on the same "claims a control it doesn't enforce" failure mode, and I had the code open for HS-A-1/HS-A-4, so I checked it rather than leaving it stale.
  - **DP-35** (`2026-09-24/lenses.md`, medium, security lens) — *freeze calls neither `assertSigningAuthority` nor `reverifyAuthoringSigner`.* **Still open, unchanged**: grepped the full freeze handler (`:3708–3924`) for both names and `reauthenticat`/`mfa`/`password` — zero matches. Out of this lens's charter (it's an authorization/signing-authority gap, not one of the four honest-state distinctions), so not independently re-derived beyond confirming the code is unchanged; the founder-decision framing the second-pass report gave it still applies.

- **Distinction-1 legacy vector (`useLive`/`<SampleTag>`, ledger L44/L72):** not applicable to this file — grepped for `sample`/`fixture`/`mock`/`useLive`/`SampleTag`, zero relevant matches (the one "sample" hit, `:281`, is `changes.slice(0,3)` naming a text excerpt, unrelated).

## What I did NOT get to

- The ~15 imported sibling components this file mounts were read only as far as needed to trace a specific claim, not line-by-line: `RichSectionEditor.tsx` (the canonical editor — I traced its `onSave`/`readOnly`/`track`/`imagesApi`/`crossRefsApi` contract points but not its internal save-state or suggestion-mark implementation), `AuthoringSignatures.tsx`, `AuthoringExports.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `FileToVaultDialog.tsx`, `AssignReviewDialog.tsx`, `AuthoringCreateExport.tsx`, `AuthoringCollab.tsx`, `AuthoringFilingBar.tsx`, `AuthoringPlaceIntoFiling.tsx`, `AuthoringAiDraft.tsx` (I did not independently re-derive its `attribution.sourceSpans`/`coverage` computation — only that `DocumentWorkbench.tsx`'s own consumption of it is honestly framed), `AuthoringRevisionDiff.tsx`, `useFilingOutline.ts`, `programSummary.ts`, `provenance.ts`, `useAnaChat.ts`.
- `editor/DocumentCanvas.tsx` — the second host this file's header comment names — was not separately read or probed. It is not a `SURFACE_VIEWS` entry, so `hostilePayloadProbe` does not exercise that mount path; I relied on this file's own header comment for what differs there (no separate AnA rail, `onAsk` routed to the conversation) rather than reading the host file.
- `createAuditTrail`'s internal implementation was not re-derived from scratch; I confirmed the actor/tenant sourcing it depends on (`getTenantId`/`getActorId`/`getActorEmail`, `:468–505`) comes only from the verified JWT, and treated the rest as consistent with the Part‑11 lens's prior, more thorough passes over the audit infrastructure.
- Did not run the full test suite, `ci:migration-drop-safety`, or any gate beyond the two static checks and the one scoped `hostilePayloadProbe` invocation named above.
- Did not check whether `verifyLedger`'s hash-chain recomputation (`server/routes/authoring.router.ts:2083–2100`) is itself correct cryptography — only that the client (`:1677–1691`, `:4199–4229`) renders its `intact`/`broken`/`error` verdict without ever substituting a client-side guess.
