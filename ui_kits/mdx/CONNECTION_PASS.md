# CONNECTION PASS — kit-wide program-context wiring

> Phase 9 retrofit. Threads the program context through every per-program surface and adds program-filtering to cross-program surfaces. Read AFTER Phase 4–8 install guides and BEFORE the codebase port begins.

---

## 0 · Why this exists

Phases 4–8 each landed surfaces as self-contained slices. Many per-program surfaces hard-coded a single device in their copy ("BX-204 firmware 4.1", "DX-102 IVD cartridge"); many cross-program surfaces showed all-tenant data with no current-program filter. This pass unifies them around the codebase's `programForContext` pattern.

## 1 · App.tsx — extended programForContext

The codebase already computes `programForContext` from `selectedProgram` + `activeNav`. Extend it to cover every per-program surface:

```ts
const programForContext = React.useMemo<Program | null>(() => {
  if (selectedProgram) return selectedProgram;
  if (activeNav === 'k510')         return programs.find(p => p.pathway === 'k510') ?? null;
  if (activeNav === 'pma')          return programs.find(p => p.pathway === 'pma')  ?? null;
  if (activeNav === 'cer')          return programs.find(p => p.pathway === 'cer')  ?? null;
  if (activeNav === 'engineering')  return programs[0] ?? null;
  if (activeNav === 'samd')         return programs.find(p => p.metadata?.softwareClass === 'C') ?? programs[0];   // Phase 9
  if (activeNav === 'ivd')          return programs.find(p => p.metadata?.kind === 'ivd') ?? null;                  // Phase 9
  if (activeNav === 'ivdr')         return programs.find(p => p.metadata?.region === 'eu' && p.metadata?.kind === 'ivd') ?? null;
  if (activeNav === 'cdx')          return programs.find(p => p.metadata?.cdxPaired === true) ?? null;
  if (activeNav === 'clinical')     return programs.find(p => p.metadata?.hasPivotal === true) ?? programs[0];
  if (activeNav === 'project-home') return programs[0] ?? null;
  return null;
}, [activeNav, selectedProgram, programs]);
```

Backend: the `programs` payload (`/api/regulatory-programs`) must include a `metadata: { kind, region, softwareClass, cdxPaired, hasPivotal, ... }` object so the resolution above is data-driven, not hard-coded.

## 2 · Per-program surfaces — accept `program` prop

Five surfaces previously hard-coded a single device. The kit patch threads `program: Program | null` through each and derives every label from `program.code` + `program.title`:

| Surface       | Was hard-coded to        | Now derives label from `program` |
|---------------|--------------------------|----------------------------------|
| IVD Pathway   | DX-102 IVD cartridge     | ✓                                |
| EU IVDR       | IV-415 companion diag.   | ✓                                |
| CDx           | IV-415 ↔ KEYTRUDA-9      | ✓                                |
| SaMD          | BX-204 firmware 4.1      | ✓                                |
| Clinical      | CV-330 pivotal trial     | ✓                                |

When `program` is `null`, the surface falls back to the legacy hard-coded label so the kit still demos cleanly. **In production**, every per-program surface must receive a non-null `program`; if `programForContext` returns null for one of these nav ids, route to the program picker instead of the surface.

## 3 · Cross-program surfaces — program-filter chips

Cross-program surfaces accept an optional `program` prop. When set, they apply a sticky filter to their primary list. Patched in this pass:

| Surface              | Filters by             | Field on row            |
|----------------------|------------------------|-------------------------|
| AnA Review Queue     | current program code   | `d.program`             |
| Q-Sub Briefing       | current program code   | `q.program`             |
| Conversations        | current program code   | `c.program`             |
| Global Search        | current program code   | `r.program`             |

Surfaces still to patch (do during port — pattern is identical):

| Surface       | Filter spec |
|---------------|-------------|
| Audit Log     | `e.target` LIKE `'%' || program.code || '%'` OR `e.target` references program-anchored resource id |
| Vault         | `f.prog === program.code.split(' ')[0]` |
| Notifications | `n.surface ≠ 'admin' && n.body LIKE '%' || program.code || '%'` (heuristic) — better: notifications carry an explicit `program_code` field |
| Memory        | atoms whose `scope` array contains `program.pathway` (e.g. `'k510'`) — pinned atoms always show regardless |

Each should render a filter chip near the toolbar:

```tsx
{program && (
  <span className="chip-filter">
    Limited to {program.code} <button onClick={clearProgramFilter}>{I.close}</button>
  </span>
)}
```

The clear action sets `selectedProgram = null` in App.tsx — same affordance as switching to a different program via CmdK.

## 4 · ProjectHome integration

`ProjectHome.tsx` already exists. Phase 9 adds tiles for the per-program surfaces it doesn't yet link to. Wire conditionally based on `program.metadata`:

```tsx
{program.pathway === 'k510' && <Tile to="k510" />}
{program.pathway === 'pma'  && <Tile to="pma" />}
{program.pathway === 'cer'  && <Tile to="cer" />}
{program.metadata?.softwareClass && <Tile to="samd" />}
{program.metadata?.kind === 'ivd' && <Tile to="ivd" />}
{program.metadata?.region === 'eu' && program.metadata?.kind === 'ivd' && <Tile to="ivdr" />}
{program.metadata?.cdxPaired && <Tile to="cdx" />}
{program.metadata?.hasPivotal && <Tile to="clinical" />}
<Tile to="engineering" />
<Tile to="udi" />
<Tile to="postmarket" />
<Tile to="qsub" />
```

This is the deepest integration the kit adds — ProjectHome becomes a true program landing page that dispatches to every surface that scopes to the active program.

## 5 · Editor deep-links — program context preserved

Every `onOpenEditor(docId)` call in Phase 4–8 surfaces hands off to one of the editor variants documented in `PHASE_4_INSTALL.md §7.1.1`. Each editor variant must:

1. Accept `programIdent` prop (codebase pattern from `EstarEditor`).
2. Read program context from the URL or from a wrapping React Context.
3. On exit, restore `activeNav` + `selectedProgram` to the surface the user came from (CommandCenter back-stack).

Document this contract per editor in a new `EDITOR_ROUTING.md` (next ticket).

## 6 · Audit emission — surface inventory

Every governed mutation across Phase 4–8 surfaces must emit an `audit_logs` row via the existing `auditWrite()` middleware. Phase 9 audit:

| Surface              | Mutation sites that need audit emission                                  |
|----------------------|--------------------------------------------------------------------------|
| Vault                | upload, version-lock, retention-purge, distribution-policy-change        |
| Templates            | template version bump, deprecation                                       |
| Quality              | mgmt-review sign-off, training assignment, supplier qualification change |
| Engineering          | DHF lock, risk-record update, ECR approval                               |
| UDI                  | UDI-DI issuance, label version bump, MRI-statement update                |
| Postmarket           | MDR transmit, CAPA stage advance, FSCA initiate                          |
| Analytics            | report export                                                            |
| Memory               | atom verify, supersede, pin/unpin, ingestion job completion              |
| Admin                | (already wired in Phase 5)                                               |
| IVD / IVDR / CDx     | study completion, classification confirm, NB milestone change            |
| LDT                  | phase advance, enforcement-discretion memo lock                          |
| SaMD                 | requirement sign-off, anomaly disposition, PCCP deployment               |
| Clinical             | protocol amendment, deviation classification, AE adjudication            |
| Q-Sub                | submission to ESG, feedback receipt                                      |
| AnA Review           | accept (already routed via e-sig), reject, refine                        |
| Onboarding           | step-advance, artifact mapping confirm, go-live                          |
| Conversations        | pin, export to PDF                                                       |
| Search               | saved-query create/delete                                                |

The codebase's `auditWrite()` already handles the SHA-256 chain. New code just needs to call it from each mutation handler.

## 7 · Acceptance

- [ ] Every per-program surface renders the active program's code + title in its page eyebrow.
- [ ] Switching programs via CmdK or TopBar pill re-contexts every per-program surface without page reload.
- [ ] Cross-program surfaces show a "Limited to {program}" filter chip when `programForContext` is set; clicking the close icon clears the filter without leaving the surface.
- [ ] ProjectHome tiles dispatch only to surfaces that match the program's `metadata`.
- [ ] No literal device names (`'BX-204'`, `'DX-102'`, etc.) remain in surface JSX — every device label resolves through `program.code` or `program.title`.
- [ ] Every mutation site listed in §6 calls `auditWrite()` before returning.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## 8 · Done condition

When the acceptance checklist passes, the kit is **fully connected**. Every surface either anchors to the active program or applies a program-filter; ProjectHome is the central hub for per-program work; the audit chain captures every mutation across the platform. **This is the gate before paying-client beta.**
