# Design system lens: the editor family, all three groups, 2026-09-28

## Scope actually covered

Commit `7087f46e2` (`concept2cure-v2`), verified as `HEAD` with a clean working tree before and after every command (`git status --short` empty throughout; no `docs/reports/` baseline was rewritten by any gate, so nothing needed `git checkout --`).

**Read in full, every line:**
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — lines 1–5134 (all).
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — lines 1–2716 (all).
- All fifteen `client/src/concept2cure/v2/surfaces/ProtocolDev*.ts(x)` files, 4,250 lines total: `ProtocolDev.tsx` (233), `ProtocolDevCompliance.tsx` (210), `ProtocolDevDerivation.tsx` (457), `ProtocolDevDesign.tsx` (317), `ProtocolDevForms.tsx` (392), `ProtocolDevPanes.tsx` (202), `ProtocolDevProjections.tsx` (304), `ProtocolDevRegisters.tsx` (294), `ProtocolDevReviews.tsx` (158), `ProtocolDevSection.tsx` (283), `ProtocolDevShared.tsx` (55), `ProtocolDevSigning.tsx` (112), `ProtocolDevSoa.tsx` (284), `ProtocolDevWorkspace.tsx` (524), `ProtocolDevWrites.ts` (425).
- The two stylesheets scoped to this family: `client/src/concept2cure/v2/styles/protocol-dev-editing.css` (144 lines) and `client/src/concept2cure/v2/styles/rich-section-editor.css` (97 lines) — both read in full.
- `client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx` (111 lines, current) — read in full to check the Convergence question (it now only hosts `DocumentWorkbench`).

**Read partially, to trace a path (not audited as files in their own right):** `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx` (grepped for hex/rgba — zero hits; confirmed its `Ic` wraps the shared `v2/icons.tsx` map, not a reinvented icon set); `server/routes/protocol-development.ts` (confirmed `POST /documents/:id/finalize` at line 496, behind `requireEditorAccess` + `signingAttempts`); `server/routes/authoring.router.ts` (confirmed `GET /sections/:sectionId/history/verify` at line 2083, tenant-scoped, recomputes the ledger from stored `doc_revisions`); `server/routes/protocol-dev.routes.ts` (confirmed `GET /` at line 33, backed by `assembleOrgPdevDocs`).

**Gates run, read-only, none with `--write-baseline` or `--baseline`:** all seven named in the charge. Exact output quoted below.

**Earlier reports read:** all four — `docs/evidence/reviews/2026-09-22/design-system.md`, `2026-09-24/design-system.md`, `2026-09-28/design-system.md`, `2026-09-28/ectd-lane-second-pass/design-system.md` — plus grepped for every mention of `DocumentWorkbench`, `RichSectionEditor` and `ProtocolDev` across all four.

### Gates (whole-repo; none take a path scope)

| Gate | Result (quoted) | Delta vs. last week (2026-09-28 reports) |
|---|---|---|
| `npm run ci:design-system` | `[design-system] OK — no icon-library, spring/bounce or inline <style> violations on live concept2cure surfaces.` | — |
| `npm run ci:token-contrast` | `✅ token-contrast: 67 pairs checked — text ≥ 4.5:1, non-text ≥ 3:1. 15 documented exceptions (brand, muted-text ramp, structural borders) held at or above their recorded ratios.` | 0 (67/15, unchanged) |
| `npm run ci:check-phantom-tokens` | `[ci:phantom-tokens] 9 phantom token(s) across 53 site(s) (baseline 9). [ci:phantom-tokens] OK — no new phantom tokens.` | **0** |
| `npm run ci:check-chip-tones` | `[chip-tones] OK — 139 literal tone use(s), all 28 resolve to a CSS rule.` | unchanged (139) |
| `npm run ci:token-cascade` | `[token-cascade] PASS — all 39 stylesheets resolve cleanly.` (per-file: `protocol-dev-editing.css 14/14`, `rich-section-editor.css 17/17` — every `var()` in both of this family's own stylesheets resolves) | unchanged (39) |
| `npm run ci:check-css-selector-shadowing` | `[css-shadowing] OK — 42 stylesheets, 21 known shadowed selector(s), 0 new.` | **0** |
| `npm run ci:check-orphaned-stylesheets` | `[ci:orphaned-stylesheets] 46 imported / 0 orphaned (0 lines, baseline 0). [ci:orphaned-stylesheets] OK — no new orphaned stylesheets.` | **0** |

All seven pass. Every baselined count is byte-for-byte what both of last week's design-system reports recorded — nothing in this repo, including this pass's own gate runs, moved any of them. I independently confirmed by direct read that none of the 9 phantom-token sites (`--danger` ×37, `--success-subtle` ×3, `--v2-radius-lg` ×3, `--danger-subtle` ×2, `--m` ×2, `--v2-radius-md` ×2, `--v2-radius-xl` ×2, `--accent-050` ×1, `--success-strong` ×1) fall in any of my 17 files or their two stylesheets, and none of the 21 known shadowed selectors involve `protocol-dev-editing.css` or `rich-section-editor.css`.

**What the gates cannot see, and what I found by reading:** the phantom-token gate is explicitly (by its own header comment) scoped to `var(--x, fallback)` where `--x` is declared *nowhere*. A fallback on a token that **is** declared, but declared to a *different* value, is invisible to it by design. That is exactly the category of both findings below.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| DS-1 | medium | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4791` | `var(--accent-100,#2563eb)` — dead fallback on a real token, and the fallback color is off-palette (blue) against a product whose entire design system has exactly one strong color, Claude orange `#d97757`. |
| DS-2 | medium | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3693` | `var(--warning,#b54708)` — same dead-fallback anti-pattern; the real `--warning` is `#955d22` (light) / `#d99a58` (dark), neither of which is `#b54708`. Copy-pasted five more times across two sibling files this component renders. |

Both are **violations the design-CI gates cannot see** (confirmed above), not gate failures. I found nothing at blocker or high severity in these three groups: I did not find a place where a color/token/CSS choice makes a governed state (frozen, signed, ledger-broken, comment-resolved, deviation-assessed, etc.) read as something other than what the server recorded — every status render I traced pairs a color with a plain-English word next to it (the codebase's own stated discipline, e.g. `ProtocolDevCompliance.tsx:24-26`, `"not-assessed" is drawn in the neutral tone, never the success one, and reads in words as "not assessed"... Colour is never the only signal`), so even a wrong fallback color would not, by itself, misrepresent a regulated fact.

### DS-1 — `DocumentWorkbench.tsx:4791` — off-palette dead fallback on `--accent-100`

**What the code does.** The background tint that marks the currently-focused comment row:

```
4787	                  style={
4788	                      focusedCommentId === c.id
4789	                      ? {
4790	                          background:
4791	                            'color-mix(in srgb, var(--accent-100,#2563eb) 7%, transparent)',
4792	                        }
4793	                      : undefined
4794	                  }
```

`--accent-100` aliases `--accent-main-100`, which is `#d97757` in **both** the light and dark theme blocks of `design-system/colors_and_type.css` (lines 84 and 350) — "Claude orange," which `design-system/CLAUDE.md`'s own non-negotiables list as *"the only strong color, used sparingly."* The literal fallback, `#2563eb`, is a saturated blue with no relationship to that value or to anything else in the stone/terracotta palette (`design-system/colors_and_type.css:197-210`).

**Why it matters.** Under normal operation this fallback never renders — `--accent-100` is declared unconditionally at `:root` in `app-v2.css:21,62`. It only fires if the token stylesheet fails to load, and `design-system/CLAUDE.md:45` documents that this exact failure mode has happened to this product before: *"If you skip the global import… every `var(--accent-100)`… resolves to undefined and the UI renders muted/grey. This is the regression that broke the Phase 1 ship on 2026-04-26."* In that scenario this span would be the one thing on screen that is **not** muted grey — a leftover, off-brand blue tint on a comment row, in the one build state the design system's own history log calls out by name. That is a narrow trigger with a named precedent, not a hypothetical.

**Evidence it is not an isolated typo.** `grep -rn "2563eb" client/src/concept2cure/v2/` returns exactly two hits: this line, and `client/src/concept2cure/v2/styles/authoring-v2.css:316` — `box-shadow: -14px 0 0 -12px var(--accent-100, #2563eb);`, which styles `.ed-full-sec[data-active]`, a class `DocumentWorkbench.tsx` itself renders (line ~3487, the "document view" active-section marker). That stylesheet is outside my three assigned groups so I have not audited it, but the identical wrong constant sitting on a class this component renders is worth the orchestrator's attention alongside this line.

**Smallest fix.** Drop the fallback: `var(--accent-100)`. Same remedy already applied to three other sites by the 2026-09-24 review (finding G5) and to this exact component family's own CSS file (`rich-section-editor.css`'s header comment records that its hex fallbacks were removed "verbatim" when the rules were extracted from inline `<style>`). If the sibling `authoring-v2.css:316` site is in scope for whoever picks this up, it should be fixed in the same change — leaving one copy standing is how this pattern keeps recurring.

### DS-2 — `DocumentWorkbench.tsx:3693` — mismatched dead fallback on `--warning`, copy-pasted across the vertical

**What the code does.** The note on the section-check panel, shown only while the canvas is dirty:

```
3692	                      {dirty && (
3693	                        <span style={{ fontSize: 11, color: 'var(--warning,#b54708)' }}>
3694	                          checked the last saved content — unsaved edits are not in it
3695	                        </span>
3696	                      )}
```

`--warning` is `#955d22` in light mode and `#d99a58` in dark mode (`design-system/colors_and_type.css:183,428`) — neither is `#b54708`. Same class of defect as DS-1: the fallback is dead under normal operation (the token is real and always resolves) and wrong when it is not.

**Why it matters, and why I did not file it at high/blocker.** The text itself ("checked the last saved content — unsaved edits are not in it") already states the fact in words; a wrong tint on it would be cosmetic, not a false claim about save state. What raises it above pure polish is the same CSS-failure precedent as DS-1, plus this specific wrong constant's reach: `grep -rn "b54708" client/src/concept2cure/v2/` returns **six** hits — this line, and five more in two files `DocumentWorkbench.tsx` directly imports and renders as part of the same screen: `AuthoringExports.tsx:134,275` and `AuthoringAiDraft.tsx:264,668,679`. Those two files are outside my assigned scope, so I have not audited them as files in their own right, but they are proof this is a standing habit in the Authoring vertical, not a one-off — a fix that touches only line 3693 leaves five sibling copies of the identical wrong literal standing on the same screen.

**Smallest fix.** Drop the fallback: `var(--warning)`. Same remedy as DS-1; if the fix lands only in my scoped file, say so explicitly rather than implying the pattern is closed — the other five sites are the same defect and will keep failing the same (gate-invisible) way.

## Earlier findings re-verified

| Earlier finding | Where | State at `7087f46e2` |
|---|---|---|
| 2026-09-24 **G4**: `DocumentWorkbench.tsx:3771` `borderRadius: 10` (off-scale literal) | `DocumentWorkbench.tsx` | **Still fixed.** Now at line 3779 (shifted by an unrelated intervening edit), reads `borderRadius: 'var(--radius-lg)'` — quoted and confirmed at line 3779 in the full read above. |
| 2026-09-22 "clean" list item: `ProtocolDev.tsx` (part of "Authoring: `DocumentAuthoring.tsx`, `BiopharmaProject.tsx`, `ProtocolDev.tsx`") | `ProtocolDev.tsx` | **Still clean**, reconfirmed by a full line-by-line read: zero hex/rgba, zero Tailwind, all styling through `.pd-*`/`.pde-*`/`.pg-*` classes and the shared `PG.*` / `C2CForm` / `../icons` primitives. |
| 2026-09-22 "clean" list item: `DocumentAuthoring.tsx` | — | **Not directly re-verifiable under that name; the finding did not survive the split.** Commit `e128a6564a2` (2026-09-22 04:09:55 UTC — same day as that review, and an ancestor of every later head including the 2026-09-24/25 one) split the then-5,143-line `DocumentAuthoring.tsx` into today's 111-line host (`DocumentAuthoring.tsx`, read in full above — it now only mounts `DocumentWorkbench`, confirming the Convergence rule held: one editor, not two) and the new 5,272-line `DocumentWorkbench.tsx`, which is where DS-1 and DS-2's lines were introduced (`git log -S -- DocumentWorkbench.tsx` attributes both literals to that same commit). Whether the 2026-09-22 review read pre-split or post-split content, its "clean" verdict against the name `DocumentAuthoring.tsx` does not speak to what is now in `DocumentWorkbench.tsx`. |
| 2026-09-24 report's scope line naming `v2/editor/DocumentWorkbench.tsx` under Authoring, and its closing claim *"Clean, confirmed by reading: every other launch file for hex / rgba / boxShadow literals"* | `DocumentWorkbench.tsx` | **Both DS-1 and DS-2's lines were already present** at that review's head (`42eb291d`, which I confirmed is a descendant of `e128a656`). Stated as fact, not accusation: both literals sit inside a `color-mix(...)` call and a conditional style-object branch rather than a bare `color: '#hex'`, which is a plausible reason a hex/rgba grep-and-read pass would miss them. |
| `RichSectionEditor.tsx` and the other fourteen `ProtocolDev*.ts(x)` files | — | **Never named in any of the four earlier reports.** This is the first design-system-lens read of any of them. All fifteen are clean by my read (see Findings — none listed against them). |
| `RichSectionEditor.tsx`'s own history | `rich-section-editor.css` header comment | Confirms a **prior, already-fixed instance of this exact anti-pattern**: the file's rules used to live in an inline `<style>` with "a hard-coded hex fallback beside its token (ledger L139)"; moved to this stylesheet "verbatim minus the fallbacks." `RichSectionEditor.tsx` itself, read in full, carries **zero** `var(--x, #hex)` fallbacks anywhere — a cleaner state than `DocumentWorkbench.tsx`, which still carries two. |

## What I did NOT get to

- **`AuthoringExports.tsx` and `AuthoringAiDraft.tsx`** — not in my assigned scope; I only grepped them for the two literal strings above (`b54708`) after finding the same string in `DocumentWorkbench.tsx`. I did not read either file, do not know their line-by-line design-system state otherwise, and make no claim about it.
- **`authoring-v2.css`** — not in my assigned scope (only `protocol-dev-editing.css` and `rich-section-editor.css`, the two stylesheets specific to this family, were read in full). I grepped it only for the exact literal `2563eb` after finding it in `DocumentWorkbench.tsx`, and separately noticed (unprompted, while reading the `.ed-guard` rules that `DocumentWorkbench.tsx`'s `UnsavedWorkGuard` renders) a raw `rgb(20 20 19 / 0.38)` modal-backdrop literal at line 1144 and a `var(--radius-lg, 12px)` fallback at line 1156 whose value happens to match the real token (`--radius-lg` = 8px via `--radius` — actually a **mismatch**, 12 vs 8, so a third instance of the same dead/wrong-fallback family, in a file outside my scope). Not filed as a DS item; flagged here only so it isn't lost.
- **`ProtocolGov.tsx`, `biostatBridge.tsx`, `IrbPackage.tsx`, `ProtocolRegisterForms.tsx`** — imported by the ProtocolDev family (`ProtocolDevWorkspace.tsx` renders `StudyDesignStatisticsTab`, `IrbPackageTab`; every pane's `PG.*` primitives come from `ProtocolGov.tsx`). I grepped `ProtocolGov.tsx` for hex/rgba (zero hits) and confirmed its `Ic` wraps the shared icon map, but did not read any of these four files line by line — they do not match the `ProtocolDev*.ts(x)` glob the charge named, and reading them in full would be auditing files outside the assigned three groups.
- **Full server-side mutation tracing.** I traced three representative server routes to ground the "no false governed state" conclusion the design-system lens needed (`POST /documents/:id/finalize` — `server/routes/protocol-development.ts:496`; `GET /sections/:sectionId/history/verify` — `server/routes/authoring.router.ts:2083`; `GET /api/protocol-dev` — `server/routes/protocol-dev.routes.ts:33`). I did **not** trace every mutation, fetch and export call in these 12,100 lines to its server implementation — DocumentWorkbench.tsx alone has on the order of thirty distinct `apiRequest(...)` call sites. A full client-to-server trace of every one of them is a functional/Part-11 audit, not a design-system one, and is presumably what the part11-ux and security lenses of this same periodic review are for; I did not duplicate that work here.
- **A11y-adjacent "color is the only signal" questions** (e.g. the bare `<span className="ed-dot" data-s="ok" title={...} />` tree-row indicators in `DocumentWorkbench.tsx:2919-2921,3061-3067`, which carry a `title` tooltip but no visible text) were noticed but not filed — that is the a11y lens's question, not the design-token one, and a separate `a11y.md` exists in this review's own folder structure.
- **`--font-mono, monospace` fallbacks** (`DocumentWorkbench.tsx:4272,4438`) — noted while reading but not filed as a DS item: a generic CSS keyword as the ultimate link in a font stack is standard practice, unlike a specific hex literal, so I did not treat it as the same class of violation as DS-1/DS-2.
