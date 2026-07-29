# Chapter 09 — Frontend, navigation and UX honesty

**Verdict: the backend breadth is real and the front door is not. The most damaging defect
in the product is a control that looks like it works and silently discards the user's data.**

---

## 9.1 The attach button discards every file — G1 blocker

`client/src/concept2cure/v2/Shell.tsx`, the AnA composer — the product's primary interaction
surface, which `README.md:25` describes as *"the product. Every capability is invoked
through it."*

```tsx
:422  const [files, setFiles] = React.useState<string[]>([]);        // strings, not File objects
:428  const addFiles = (fl: FileList | null) => {
:430    setFiles((f) => [...f, ...Array.from(fl).map((x) => x.name)]); // keeps ONLY the name
      };
…
:453  if (!t && !files.length) return;
:454  onSend(agent ? `[Agent] ${t}` : t || `Attached ${files.length} file(s)`);
```

Two file inputs are wired (`:710` documents, `:718` images), the send button enables on
attachment alone (`:754`), and chips render with individual remove buttons (`:679-685`). The
affordance is complete and convincing.

**What actually happens:** the browser reads the `FileList`, keeps each `File.name` as a
string, throws the bytes away, and posts the literal sentence `"Attached 1 file(s)"` to the
model. No `FormData`, no upload, no reference the backend could resolve.

**Failure scenario.** A regulatory affairs lead drags in a 40-page predicate device summary
and asks *"what does this say about substantial equivalence?"* The model receives
`"Attached 1 file(s)"` and answers from nothing — fluently, because that is what models do.
The user believes the answer is grounded in their document. **In a regulatory product this
is the worst possible failure mode: not an error, but a confident answer about a document
the system never saw.**

**A working path already exists** — `client/src/concept2cure/hooks/useChatUpload.ts` posts to
`POST /api/chat/upload`, which is mounted with multer at `server/routes/chat.ts:85`, and it
is used elsewhere (`ProjectHome.tsx:301`). This is a wiring gap, not a missing capability.
**Effort: ~1 day.**

---

## 9.2 The product has almost no navigable front door

As of HEAD (`576ec5d`, the day of this audit), `client/src/concept2cure/v2/registryModel.ts`:

| | |
|---|---:|
| `RAIL_PRIMARY` destinations (`:116-122`) | **5** — Chats, Projects, Communication Center, Apps, Settings |
| `NAV_HIDDEN` entries (`:125-171`) | **40** (42 literal, `tasks` and `vault` duplicated) |
| Registered UI surfaces | **96** (44 base + 52 ui-v2) |
| Reachable from the global rail | **5 (5.2%)** |
| Reachable from in-app `onNav()` calls | 15 distinct ids |
| Reachable only by typed URL or ⌘K | **~85** |

The demotion is deliberate and documented (`registryModel.ts:91-115` cites a design
constitution), and a five-item rail is a defensible *design* choice. The problem is what got
demoted: `vault`, `submission-center`, `artifacts-center`, `document-authoring`,
`device-510k`, `device-cer`, `ectd-coauthor`, `csr-workflow`, `cmc`, `global-ri`, `quality`,
`safety-narrative` — i.e. **most of what the platform sells**.

**⌘K is a weak backstop.** `Shell.tsx:960,982-984` matches only `label` and `notes`, and
`.slice(0, 8)`. An empty query lists the first 8 surfaces in registry order. So a user must
already know a surface's label to find it.

**One offering has no front door at all.** The translation workspace has 31 backend service
files, a mounted route (`/api/translation`, `register-inline-routes.ts:403`), a 719-line v2
surface and a 6-file module tree — and **zero production importers** for either frontend
tree, and no `translation` id in either registry. A complete, mounted, shipped capability
that no user can reach.

---

## 9.3 Data honesty — genuinely well handled, with residue

This deserves credit before criticism. `v2/dataConnect.tsx` implements an explicit honesty
contract — `liveGet(path, fixture)` returning `{data, sample, error}`, plus a `<SampleTag>`
— under the stated rule *"GAP RULE: never present fabricated data as live."*

| Pattern | Sites |
|---|---:|
| `useLiveRows` — live data or an honest **EmptyState**, no fixture fallback | **97** |
| `useLive(path, FIXTURE)` — falls back to a fixture behind a sample pill | **7** (in `Review.tsx`, `AdminAccess.tsx`, `BiopharmaProject.tsx` ×2, `BiopharmaSpecialty.tsx`, `ClientPortal.tsx`, `Registrations.tsx`) |

The de-mock campaign described in `PRODUCT_READINESS_ASSESSMENT.md:23-27` largely happened —
this is one of the repo's self-claims that **survives** checking. Residual fixture arrays
remain in `fixtures/review-data.ts`, `admin-data.ts`, `commcenter.ts`, `submission.ts` and
`project3-data.ts`.

The codebase also contains **anti-fabrication scanners** — reject-lists matching
`/lorem ipsum/i` and "coming soon" in `governed-ana-execution.ts:43,47`,
`ana/verifiedSeal/helpers.ts:77` and `ai-actions/handlers/run-validation.ts:249` — and
deliberate `501`s where invented numbers used to be (`qc.routes.ts` returns
`notImplemented:true` for Certificate-of-Analysis generation and batch release, replacing
stubs that previously returned `{released:true}` unconditionally). **Choosing a 501 over a
fabricated success is the right call and is rare.**

A further example of the same instinct, found in a code comment at `Shell.tsx:437-445`: a
previous version fetched `GET /api/coauthor?surface=…` under a comment calling it a HARD
RULE — *"There is no such endpoint … that request 404'd on every render of every surface,
forever."* They found it, fixed it, and wrote down what happened. That is the behaviour of a
team that can be trusted to act on this audit.

---

## 9.4 Dead code is the dominant structural problem

Verified by resolving every relative and `@/` import in `client/src` and checking for
external importers:

| Tree | Files | LOC | External importers |
|---|---:|---:|---|
| 11 legacy module mini-apps (`pdev`, `biopharma`, `insights`, `authoring`, `cmc`, `translation`, `submission`, `risk`, `labeling`, `tasking`, `intelligence`, `communication`) | 173 | **~25,000** | **none** |
| Dead `v2/surfaces/` (incl. the entire `Editor*` family) | 22 | **7,174** | none |
| `components/ana/` | 35 | **13,329** | only 3 modules consumed |
| **Total** | **~230** | **~45,000** | |

`concept2cure/quality/` is the sole surviving legacy tree (`QualityModule.tsx:16`).

The `components/ana/` number is the striking one: **697 tools are registered server-side**,
and the shipping rail consumes exactly three modules from the ANA UI —
`useAnaChat`, `useGovernedAction`, `GovernedActionSignoff`. `Ana.tsx` (1,189 lines),
`ChatView`, `Composer`, `ToolPicker`, `ModelEffortPicker` and all 28 result panels
(`WarGameReport`, `SEComparisonTable`, `ReadinessGatePanel`, `CrlPremortemPanel`,
`Part11SignModal`, …) are unreferenced. So there is no tool picker, no model/effort picker,
and no renderer for structured tool output on the surface users actually use.

Dead code is mostly tree-shaken from the bundle, so this is a **review-surface and
security-surface** problem rather than a performance one — and Chapter 04 shows exactly how
it bites: four of the unsanitised `dangerouslySetInnerHTML` sites are in this dead code,
which made the security picture look worse than it is, while the one that mattered sat
elsewhere.

## 9.5 Accessibility and internationalisation

- **Some real effort**: 862 `aria-*` attributes and 365 `role=` usages across `client/src`.
- **i18n is aspirational.** `GLOBAL_LANGUAGE_STRATEGY_2026-06-29.md` exists, `locales/`
  directories exist, and **13 client files** actually call a translation function. For a
  platform whose pitch includes global submissions and a translation workspace, the UI is
  effectively English-only.
- **Not verified.** No headless browser walk was completed (Chapter 01 §1.4), so keyboard
  traps, focus management, ARIA-live behaviour on streaming AI output, and colour-only status
  encoding were **not** tested. The repo's own `HUMAN_FACTORS_AND_USABILITY_SPEC` forbids
  colour-only encoding; whether the shipped UI complies is an open question this audit does
  not answer.

## 9.6 Bundle

`npm run build` succeeds in 20.06s. `V2App` ships **1.56 MB** of JS and **694 KB** of CSS in
single chunks, with `ZenRouter` at 530 KB. Vite emits its large-chunk warning. Heavy for
first paint; a performance item, not a correctness one.

---

## 9.7 Priority actions

| # | Action | Sev | Gate | Effort |
|---|---|---|---|---|
| 1 | **Fix or remove the attach button** — wire it to the existing `useChatUpload` path. A control that lies about accepting data is worse than no control. | **P0** | G1 | 1 day |
| 2 | **Give the pilot a front door** — put the surfaces the pilot uses in `RAIL_PRIMARY`; mark the rest experimental rather than URL-only. | P0 | G1 | 3 days |
| 3 | **Surface the translation workspace or disable its backend** — do not ship a mounted offering with no UI. | P1 | G1 | days |
| 4 | Improve ⌘K: search `apiPrefixes`/`group`/aliases, raise the 8-result cap, show all on empty query. | P1 | G1 | 1 day |
| 5 | **Delete the ~45,000 lines of dead client code.** | P2 | G2 | 1 week |
| 6 | Resolve the ANA UI split-brain: either wire the panels or delete them. 697 tools with no output renderers is a product gap, not just dead code. | P2 | G2 | weeks |
| 7 | Remove the 7 residual `useLive(path, FIXTURE)` fallbacks or confirm `SampleTag` renders in every one. | P2 | G2 | days |
| 8 | Run an accessibility audit against the repo's own HF spec. | P2 | G2 | 1 week |
| 9 | Decide on i18n: complete it or stop claiming it. | P3 | G2 | weeks |
