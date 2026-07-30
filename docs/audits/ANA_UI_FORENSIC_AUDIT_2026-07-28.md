# AnA UI Forensic Audit — 2026-07-28

> ## ⛔ SUPERSEDED IN PART — read this before acting on §2.1 or §3
>
> **2026-07-28, product owner decision: the rail is NOT to be collapsed. The
> navigation shipping today is the intended navigation.**
>
> This audit's central recommendation — reduce the rail to the constitution's
> five permitted destinations and demote the other ten — was implemented in
> PR #1187 and then **reverted in full at the product owner's direction**.
> `RAIL_CORE`, `RAIL_SPECIALIST`, `RAIL_EXPLORE` and `RAIL_QUICK` are correct as
> they stand. Do not re-collapse them.
>
> The same decision applies to §2.2's typography finding. Three chrome elements
> (`.pj-title`, `.ana-ctx-section`, `.ana-greet-t`) were moved from
> `--font-serif` to `--font-sans` and then reverted. They stay serif.
>
> **Where that leaves the constitution.** `ana-ui-design-constitution` §4
> ("Allowed — Only Five") and §12 (shell typography) are, on this product, design
> *guidance* and not binding law. Where this repository and that document
> disagree about what the user sees, the repository wins. A future reader should
> not treat §4 as an outstanding defect to be closed.
>
> **What in this audit still stands.** Everything factual: the absent files table
> (§0), the real entry chain (§1), the missing `config/ui-surface-registry.json`
> (§4), and the explicit list of what was never measured (§2.3). Those are
> measurements, not recommendations, and none of them was reverted.
>
> Separately, the token-layer cleanup that grew out of §2.2 — deleting three
> stylesheets with zero consumers and removing a duplicated token import — was
> kept, because it is provably invisible: it changes no rendered pixel.
> `tests/ui/token-authority.test.ts` holds that line.

**Phase 1 of the AnA UI Master Work Order.**
Authority: `ana-ui-design-constitution` (design law) · `ana-ui-master-work-order` (phasing).

Every claim below was measured against the working tree at `c38a69f`. Nothing here is
carried over from a prior report. Where a measurement contradicts the work order's
stated premise, the measurement wins and the contradiction is named.

---

## 0. Headline: the work order's premise has moved

**The shell convergence the constitution describes has already happened — by a
different route than the work order anticipated.**

`client/src/concept2cure/router/ZenRouter.tsx:41-44`:

```
// ui-v2 — the full UI replacement shell (design_handoff_c2c_v2_ui_replacement).
// Phase 7: the legacy ZenApp shell is deleted; the v2 shell IS the product.
const V2App = lazy(() => import('../v2/V2App'));
```

**Every file the constitution names for refactor or demotion is absent:**

| File named by the constitution | Status |
|---|---|
| `ZenApp.tsx` | ABSENT |
| `ZenSidebar.tsx` | ABSENT |
| `zen-app-constants.ts` | ABSENT |
| `AnaPersistentPanel.tsx` | ABSENT |
| `ProjectWorkspaceShell.tsx` | ABSENT |
| `EditorPanel.tsx` | ABSENT |
| `GlobalOperatingShell.tsx` | ABSENT |
| `IndustryWorkspaceShell.tsx` | ABSENT |
| `ToolPanel.tsx` | ABSENT |
| `VaultPage.tsx` | ABSENT |
| `ReviewReadiness.tsx` | ABSENT |
| `SubmissionReadiness.tsx` | ABSENT |

`LayoutMode` — the enum the work order targets for 22+ → 5-7 collapse — survives in
exactly two files, neither of which is a shell
(`components/concept2cure-home/Concept2CureHome.tsx`, `hooks/useLicense.ts`).

**Consequence.** Work-order Phases 3.1-3.4 and Phase 4 have no targets. Executing them
literally is impossible. What remains live is the part of the constitution that is
timeless: §3 Product Laws, §4 Information Architecture, §12 Visual System. Those are
the standard this audit measures against, and by that standard the product is **not**
compliant.

---

## 1. The real entry chain

```
client/src/main.tsx:30            import App from './App'
client/src/App.jsx:38             lazy(() => import('./concept2cure/router/ZenRouter'))
router/ZenRouter.tsx:44           lazy(() => import('../v2/V2App'))
client/src/concept2cure/v2/V2App.tsx        298 lines — the shell
client/src/concept2cure/v2/Shell.tsx       1128 lines — Rail, TopBar, AnaRail, CmdK
client/src/concept2cure/v2/registryModel.ts             — the nav source
```

Note `App.jsx`, not `App.tsx`. A `find` for `App.tsx` returns nothing; the JSX file plus
a hand-written `App.d.ts` is what resolves. This is worth knowing before anyone greps
for the entry point and concludes it is missing.

**Answer to work-order Q1 (what owns the top-level shell):** `v2/V2App.tsx`, with chrome
in `v2/Shell.tsx`. **One** shell owner. This is the constitution's Law 6 satisfied.

---

## 2. Where the product violates the constitution

### 2.1 LAW §4 — "Allowed (Only Five)" — VIOLATED

The constitution permits exactly five top-level destinations: **Chats, Projects,
Communication Center, Apps, Settings.**

`v2/registryModel.ts` ships four rail groups plus three nav tiers:

| Group | Line | Destinations |
|---|---|---|
| `RAIL_CORE` | :92 | projects, vault, submission-center, tasks, insights |
| `RAIL_SPECIALIST` | :100 | rbm, crl-library |
| `RAIL_EXPLORE` | :105 | ana-command, ana-memory, apps, artifacts-center, conversation-thread |
| `RAIL_QUICK` | :113 | recent, document-authoring, starred (+ projects/tasks repeated) |
| `NAV_TIERS_V2` | :27 | mdx, biopharma, admin |

**~15 unique top-level destinations, in 4 groups, under 3 tiers.** 51 surfaces are
registered (`registryModel.ts`), 32 are in `NAV_HIDDEN` (:119), leaving ~19 visible.

**Against the five-destination law:**

| Required destination | Status |
|---|---|
| Chats | **MISSING as a destination.** `conversation-thread` sits inside `RAIL_EXPLORE`, not top-level. Chat is not the primary surface. |
| Projects | present |
| Communication Center | **MISSING entirely.** No such destination exists. |
| Apps | present, but demoted into `RAIL_EXPLORE` |
| Settings | **MISSING from every rail.** |

**Explicitly forbidden as global top-level, currently shipping as exactly that:**
`vault`, `submission-center`, `artifacts-center`, `document-authoring`, `insights`
(analytics dashboard), `crl-library`. The constitution names Vault, Submit/Export,
Documents, and "Analytics dashboard" in its forbidden list (§4).

**This is the central finding.** The shell is singular and clean in *ownership*; it is
non-compliant in *information architecture*. Three of five required destinations are
absent and six forbidden ones are present. Chat — the constitution's Law 1, "chat is the
primary operating surface" — is a third-tier item.

### 2.2 LAW §12 — Visual System Reset — PARTIALLY VIOLATED

Terracotta `#d97757`, which §12 forbids as shell identity, survives in **16 files**,
including two inside the v2 tree:

```
client/src/concept2cure/v2/styles/editor-core.css
client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx
```

and in the shared token layer that the shell inherits:

```
client/src/styles/theme.css          client/src/concept2cure/design/zen.css
client/src/concept2cure/design/claude-design.css
design-system/ui_kits/mdx_phase2/app.css
design-system/ui_kits/ectd_coauthor/styles.css
```

Serif `Lora` — forbidden for shell typography, permitted only inside the document
editor — appears in **7 files**, two of them in `v2/`. `Poppins` is down to a single
file and is effectively retired.

### 2.3 Not yet measured

Right-drawer tab conformance (§9), center-canvas state count (§8), responsive behaviour
at the seven widths (§13), and composer `@app` / slash-command support (§10) are **not**
assessed in this pass. They require running the app, not reading it. Recording that
plainly rather than asserting compliance.

---

## 3. Corrected authority map

Supersedes the work order's Phase 2 table, which addresses files that no longer exist.

| Concern | Real owner today | Constitutional target | Action |
|---|---|---|---|
| App shell | `v2/V2App.tsx` | same | **Already canonical** — no change |
| Chrome (rail/topbar/cmdk) | `v2/Shell.tsx` | same | Refactor in place |
| Nav source | `v2/registryModel.ts` (4 rails, 3 tiers, ~15 dests) | one source, 5 dests | **Collapse** |
| Chats | `conversation-thread` in RAIL_EXPLORE | top-level destination #1 | **Promote** |
| Communication Center | does not exist | top-level destination #3 | **Build** |
| Settings | absent from rails | top-level destination #5 | **Promote/build** |
| Vault, Submission Center, Artifacts Center, Document Authoring, Insights, CRL Library | top-level rail items | inside projects / drawers / apps | **Demote** |
| Shell tokens | terracotta in 16 files, Lora in 7 | neutral + sans | **Reset** |
| `LayoutMode` collapse | no shell uses it | n/a | **Void — target absent** |
| `IndustryWorkspaceShell` etc. | absent | n/a | **Void — already deleted** |

---

## 4. Work-order artifacts that do not exist

`config/ui-surface-registry.json` — required by the work order's Phase 4 and its
completion checklist — **does not exist**. The nearest real artifacts are
`shared/constants/ui-surface-registry.ts` and `…ui-surface-registry.ui-v2.ts`. Either
the work order means those files under a stale name, or the JSON registry was never
created. Flagged rather than silently substituted.

---

## 5. What this audit does not claim

- That the v2 shell is bad. It is one shell with one owner and a coherent registry —
  the hardest part of the constitution (Law 6) is **done**.
- That the visual system is wholly non-compliant. Poppins is gone; the terracotta and
  Lora residue is concentrated in a small, enumerable file set.
- Anything about runtime behaviour. §8, §9, §10 and §13 need the app running.

The gap is information architecture, not shell architecture. That is a smaller and much
better-defined problem than the work order assumed, and it is the one worth solving next.
