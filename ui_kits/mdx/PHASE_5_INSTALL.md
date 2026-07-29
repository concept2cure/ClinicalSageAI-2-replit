# PHASE 5 — install guide for Claude Code

> Companion to `PHASE_4_INSTALL.md`. Phase 5 adds the must-have-for-beta surfaces: Vault, E-signature flow, Audit log viewer, Notifications, Templates (medtech corpus), Quality System, and the ESG transmittal extension. Read this **after** Phase 4 lands.

---

## 0 · Scope

| # | Surface                       | Layout       | Replaces in codebase                                   |
|---|-------------------------------|--------------|--------------------------------------------------------|
| 1 | Document vault (full)         | doc-first    | `mdx/workbench/Workbench.tsx > VaultSurface`           |
| 2 | E-signature flow              | shared modal | (new — used by every governed mutation)                |
| 3 | Audit log                     | hybrid       | (new — surfaces the existing `audit_logs` table)       |
| 4 | Notifications                 | inbox        | (new — wires the existing notifications stream)        |
| 5 | Templates (medtech corpus)    | doc-first    | `mdx/workbench/Workbench.tsx > TemplatesSurface`       |
| 6 | Quality system (QSR/QMSR)     | doc-first    | (new — net-new workstream rail item)                   |
| 7 | ESG transmittal               | extension    | `mdx/workbench/Workbench.tsx > SubmissionsSurface` (extends `transmit` stage) |

---

## 1 · Files

### Surfaces — 6 files
| Kit source                                  | Lands at                                                           |
|---------------------------------------------|--------------------------------------------------------------------|
| `ui_kits/mdx/surfaces/Vault.jsx`            | `client/src/concept2cure/mdx/surfaces/VaultSurface.tsx`            |
| `ui_kits/mdx/surfaces/Audit.jsx`            | `client/src/concept2cure/mdx/surfaces/AuditSurface.tsx`            |
| `ui_kits/mdx/surfaces/Notifications.jsx`    | `client/src/concept2cure/mdx/surfaces/NotificationsSurface.tsx`    |
| `ui_kits/mdx/surfaces/Templates.jsx`        | `client/src/concept2cure/mdx/surfaces/TemplatesSurface.tsx` (replaces existing) |
| `ui_kits/mdx/surfaces/Quality.jsx`          | `client/src/concept2cure/mdx/surfaces/QualitySurface.tsx`          |
| `ui_kits/mdx/esign-modal.jsx`               | `client/src/concept2cure/mdx/components/EsignModal.tsx`            |

### Data — 5 files
| Kit source                       | Lands at                                                  |
|----------------------------------|-----------------------------------------------------------|
| `ui_kits/mdx/data/vault.js`      | `client/src/concept2cure/mdx/data/vault.ts`               |
| `ui_kits/mdx/data/audit.js`      | `client/src/concept2cure/mdx/data/audit.ts`               |
| `ui_kits/mdx/data/notifications.js`| `client/src/concept2cure/mdx/data/notifications.ts`     |
| `ui_kits/mdx/data/templates.js`  | `client/src/concept2cure/mdx/data/templates.ts` (replaces fixture) |
| `ui_kits/mdx/data/quality.js`    | `client/src/concept2cure/mdx/data/quality.ts`             |

### Hooks — 6 new files (use same `useFetchJson` pattern as Phase 4)
- `useVault()` → `GET /api/mdx/vault?folder=&filter=`
- `useVaultDetail(fileId)` → `GET /api/mdx/vault/:fileId` (versions + audit trail)
- `useAudit({from,to,actor,action,resource,query})` → `GET /api/mdx/audit?...`
- `useNotifications({unread,kind})` → `GET /api/mdx/notifications?...`
- `useTemplates()` → `GET /api/mdx/templates` (replaces existing `useWorkbenchTemplates`)
- `useQuality()` → `GET /api/mdx/quality`

### Nav additions (`mdx/data/nav.ts`)
Add three new rail entries to `MDX_NAV_V2`:

```ts
{ id: 'quality',       label: 'Quality System',    icon: 'shieldCheck', group: 'workstream' },
{ id: 'notifications', label: 'Notifications',     icon: 'bell',        group: 'system' },
{ id: 'audit',         label: 'Audit Log',         icon: 'shield',      group: 'system' },
```

Append per-surface AnA suggestions to `MDX_SUGGESTIONS` (copy from `ui_kits/mdx/data/nav.js`).

### App.tsx routing (`mdx/App.tsx`)
Add HERE_LABEL entries + case arms (mirror the Phase 4 pattern):

```ts
case 'vault':         surface = <VaultSurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'audit':         surface = <AuditSurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'notifications': surface = <NotificationsSurface onAskAna={askAna} />; break;
case 'templates':     surface = <TemplatesSurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'quality':       surface = <QualitySurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
```

The `vault` and `templates` rail entries already exist; remove their workbench-routing in `App.tsx` so they hit these new surfaces instead.

### Wire the topbar bell icon
`TopBar.tsx` already has `<button className="tb-btn" title="Notifications">{I.bell}</button>`. Wire its `onClick` to `setActiveNav('notifications')`.

### dataMode registry (`mdx/lib/dataMode.ts`)
Append:

```ts
{ id: 'vault',         label: 'Document vault',         defaultMode: 'both', expectedLiveBy: '2026-08-15' },
{ id: 'audit',         label: 'Audit log',              defaultMode: 'both', expectedLiveBy: '2026-07-15' },
{ id: 'notifications', label: 'Notifications',          defaultMode: 'both', expectedLiveBy: '2026-08-01' },
{ id: 'templates',     label: 'Templates (medtech)',    defaultMode: 'both', expectedLiveBy: '2026-08-01' },
{ id: 'quality',       label: 'Quality system',         defaultMode: 'both', expectedLiveBy: '2026-09-15' },
{ id: 'esig',          label: 'E-signature flow',       defaultMode: 'live', expectedLiveBy: '2026-07-01' },
```

E-signature is **live by default** — there's no acceptable fixture-mode for a Part-11 signing. If the backend isn't reachable, the modal must error out, not fake a signature.

---

## 2 · E-signature flow — wiring contract

`<EsignModal>` is triggered by **every governed mutation** across the platform. Add this pattern to every mutation site:

```tsx
const [esigOpen, setEsigOpen] = React.useState(false);
const [pendingMutation, setPendingMutation] = React.useState<() => Promise<void> | null>(null);

function requireSignature(action: string, target: string, mutation: () => Promise<void>) {
  setPendingMutation(() => mutation);
  setEsigOpen({ action, target });
}

// In the JSX:
<EsignModal
  open={!!esigOpen}
  action={esigOpen?.action}
  target={esigOpen?.target}
  defaultMeaning="approved"
  onCancel={() => { setEsigOpen(false); setPendingMutation(null); }}
  onConfirm={async (manifest) => {
    // POST /api/mdx/esig/commit { manifest, mutation_id }
    // Backend validates password + TOTP, writes audit entry, then executes mutation.
    await pendingMutation();
    setEsigOpen(false);
  }}
/>
```

Backend route: `POST /api/mdx/esig/commit`. Body: `{ action, target, reason, meaning, password, totp, mutation_payload }`. Server validates identity, executes mutation in a transaction, writes audit_logs entry with `signing_manifest_id`, returns `{ signed_at, manifest_id, hash }`.

**Sites that MUST require e-signature** (incomplete list — audit during port):
- Accept AnA draft (any surface)
- Approve CAPA
- Sign artifact
- Transmit submission
- Grant access (admin)
- Lock document version
- Close out finding
- Publish PSUR / MDR
- Rotate API key

---

## 3 · Backend — endpoints

| Method | Path                                  | Auth       | Notes                                                          |
|--------|---------------------------------------|------------|----------------------------------------------------------------|
| GET    | `/api/mdx/vault`                      | tenant     | Returns `{ folders, files, kpis }`                             |
| GET    | `/api/mdx/vault/:fileId`              | tenant     | Returns `{ file, versions, audit }`                            |
| POST   | `/api/mdx/vault/upload`               | tenant     | Multipart. Server computes SHA-256, writes audit entry.        |
| GET    | `/api/mdx/audit`                      | tenant     | Filters: from / to / actor / action / resource / query. Paged. |
| POST   | `/api/mdx/audit/verify`               | tenant     | Re-verifies SHA-256 chain over selected range. Returns breaks. |
| POST   | `/api/mdx/audit/export`               | tenant     | Generates signed-PDF export; returns `{ docId }`.              |
| GET    | `/api/mdx/notifications`              | tenant     | Filters: unread / kind / surface.                              |
| POST   | `/api/mdx/notifications/:id/read`     | tenant     | Marks read. No audit entry — not a regulated mutation.         |
| GET    | `/api/mdx/templates`                  | tenant     | Returns the medtech corpus. **Replaces** existing endpoint.    |
| GET    | `/api/mdx/quality`                    | tenant     | Returns `{ kpis, documents, findings, training, suppliers }`.  |
| POST   | `/api/mdx/esig/commit`                | tenant     | The e-signature commit. Body documented in §2 above.           |

### ESG transmittal extension (§ extends existing SubmissionsSurface)
The codebase's `SubmissionsSurface` already shows the 7-stage pipeline. Phase 5 adds the **transmit step UI**:

- Pre-transmit validation summary card (re-runs gate + ESG credential check)
- ESG credential check chip (✓ valid / ✗ expired)
- Transmittal manifest viewer (lists every file in the package + SHA-256)
- Submit-to-ESG button → opens `<EsignModal>` for the transmit signing
- Post-transmit ack receipt card (FDA ack ID + timestamp + chain hash)
- FDA correspondence inbox (right rail — acks, deficiency letters, RTA notices)

New endpoints:
- `POST /api/mdx/submissions/:id/transmit` → triggers ESG bridge call. Requires `<EsignModal>` first.
- `GET /api/mdx/submissions/:id/correspondence` → ack receipts, RTA letters, deficiency letters.

No new surface file — these blocks land **inside the existing `sub-detail` panel** in Workbench.tsx > SubmissionsSurface. Same component, three new sub-sections.

---

## 4 · Database deltas

```sql
-- Vault file metadata (separate from blob storage)
CREATE TABLE c2c_vault_files (
  id            text PRIMARY KEY,
  org_id        uuid NOT NULL,
  name          text NOT NULL,
  folder_id     text NOT NULL,
  program_code  text,
  type          text NOT NULL,       -- pdf | docx | xlsx | xml | zip
  kind          text NOT NULL,       -- submission | risk | clinical | labeling | capa | qms | agency | template
  size_bytes    bigint NOT NULL,
  version       text NOT NULL,
  status        text NOT NULL,       -- draft | review | ready | locked
  hash_sha256   text NOT NULL,
  author_id     uuid,
  esig_state    text NOT NULL DEFAULT 'na',
  retention     text NOT NULL,        -- '15 years' | '25 years' | 'product life + 10y' | '7 years'
  distribution  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_vault_files_org_folder_idx ON c2c_vault_files (org_id, folder_id, status);

-- File versions
CREATE TABLE c2c_vault_versions (
  id            bigserial PRIMARY KEY,
  file_id       text NOT NULL REFERENCES c2c_vault_files(id),
  version       text NOT NULL,
  status        text NOT NULL,
  hash_sha256   text NOT NULL,
  author_id     uuid,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Notifications stream
CREATE TABLE c2c_notifications (
  id            text PRIMARY KEY,
  org_id        uuid NOT NULL,
  user_id       uuid NOT NULL,    -- recipient
  kind          text NOT NULL,    -- overdue | gate | ana | vigil | qsub | capa | access | agency
  surface       text NOT NULL,    -- which surface generated it
  resource_id   text,
  title         text NOT NULL,
  body          text NOT NULL,
  cta_label     text,
  cta_target    text,
  unread        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);
CREATE INDEX c2c_notifications_user_unread_idx ON c2c_notifications (user_id, unread, created_at DESC);

-- Quality system tables
CREATE TABLE c2c_qms_findings (...);
CREATE TABLE c2c_qms_training_records (...);
CREATE TABLE c2c_qms_suppliers (...);
CREATE TABLE c2c_qms_supplier_agreements (...);

-- Signing manifest (used by e-sig flow)
CREATE TABLE c2c_signing_manifests (
  id            text PRIMARY KEY,
  org_id        uuid NOT NULL,
  signer_id     uuid NOT NULL,
  action        text NOT NULL,
  target        text NOT NULL,
  reason        text NOT NULL,
  meaning       text NOT NULL,     -- reviewed | approved | responsibility | authorship
  hash_sha256   text NOT NULL,
  prev_hash     text,
  audit_id      bigint REFERENCES audit_logs(id),
  signed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_signing_manifests_target_idx ON c2c_signing_manifests (org_id, target, signed_at DESC);
```

The full audit log (`audit_logs`) table already exists in the codebase — Phase 5 just wires `c2c_signing_manifests` to it via the `audit_id` FK.

---

## 5 · Sequence

1. **Database migrations** — new tables (§4).
2. **E-signature flow first.** `<EsignModal>` + `POST /api/mdx/esig/commit` + audit-log writes. Nothing else can move without this. Verify with a unit test: signing the same payload twice produces two different manifest hashes (the chain depends on prev_hash).
3. **Audit log surface + endpoint.** Once e-sig is writing, the audit table is hot — surface it.
4. **Vault.** Replace the dead Workbench tab body. Wire upload + retention policy.
5. **Notifications.** Backend stream + frontend surface + topbar bell wire-up.
6. **Templates (medtech corpus).** Replaces existing TemplatesSurface. Server replaces the existing aggregator endpoint with the medtech-tagged corpus.
7. **Quality.** New rail item. New endpoint.
8. **ESG transmittal extension.** Modify SubmissionsSurface in-place. ESG bridge + transmit-signing flow.

Each step ends with `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 6 · Acceptance checklist

- [ ] Vault rail entry renders the new full-surface design (not the workbench tab body).
- [ ] Templates rail entry renders the medtech corpus.
- [ ] New rail items: `quality`, `audit`, `notifications` resolve to their surfaces.
- [ ] Topbar bell icon opens Notifications.
- [ ] `<EsignModal>` is reachable from every governed mutation. Hardcode a smoke-test list (§2) and click each one in dev.
- [ ] `POST /api/mdx/esig/commit` writes an `audit_logs` entry + a `c2c_signing_manifests` row + executes the mutation atomically.
- [ ] Audit chain verifier (`POST /api/mdx/audit/verify`) returns no breaks across the full retention window.
- [ ] Notifications: marking read does NOT emit an audit entry.
- [ ] Notifications: vigilance escalations DO emit notifications and DO emit audit entries.
- [ ] ESG transmit button is disabled until the gate is green AND the cover letter is signed AND the e-sig modal is committed.
- [ ] FDA correspondence inbox renders in the SubmissionsSurface detail panel.
- [ ] All 6 Phase 5 surfaces follow the doc-first/hybrid choice in §0.
- [ ] No emoji, no exclamation marks, AnA naming consistent.
- [ ] All hex literals in `surfaces.css` come from tokens (or are the documented palette exceptions).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 7 · What this does NOT cover (Phase 6+)

From the original gap inventory — still outstanding:
- AnA review queue (Workbench tab — separate from Notifications)
- Q-Sub briefing-document editor (extends PreSubManager)
- Software lifecycle (IEC 62304) **dedicated workspace** — partial coverage already in Engineering surface
- Clinical study management workspace
- Global search
- Onboarding / migration importer
- AnA conversation history
- IVD pathway surface (diagnostic-specific)
- EU IVDR surface (diagnostic-specific)
- Companion diagnostic (CDx) co-development surface
- LDT compliance surface

Open a Phase 6 design ticket when ready.
