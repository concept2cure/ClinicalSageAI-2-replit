# Quality & Assurance module — GA test guide

The Quality & Assurance module is a two-surface QMS module in the ui-v2 shell:
**SOP register** (controlled-document control, periodic review, read-and-understood
training) and **Change control** (the change-control log, lifecycle flowchart, and
the links tying every change to its deviations, CAPAs and validation records).
Aligned to ICH Q10 §3.2.3 (change management), EU GMP Annex 15 (change control),
21 CFR 820.30/820.70 and ISO 13485 §7. AnA-first: every governed action is
executed by AnA (create / advance / link), which captures the reason-for-change
for the 21 CFR Part 11 audit trail.

---

## 1. Where a human finds it

1. Log in as the GA demo admin: **`jonmichaelpsmith@gmail.com` / `demo123`**.
2. Open the ui-v2 workspace. On the home landing, under **"Everything in your
   workspace" → Review & govern**, click **Quality & Assurance**.
   (It also resolves via ⌘K → "Quality & Assurance", and by deep link to the
   `quality` surface.)
3. The module opens on the **SOP register** tab; the **Change control** tab is in
   the tab bar next to it.

The module is grouped with CMC under `quality-cmc` and is reachable from every
client segment (medtech, diagnostics, biotech, pharma).

---

## 2. Provisioning real data (so it isn't just fixtures)

The surfaces render `live ?? fixture`: with no backend they show typed fixtures;
provisioned, they show real org-scoped rows. To test against real data:

```bash
export DATABASE_URL=postgres://…            # a non-production database
bash scripts/db_migrate.sh                  # applies db/migrations/*, incl.
                                            #   20260724_qms_change_control_store.sql
npm run db:seed                             # ga-demo seed, incl.
                                            #   scripts/seed/ga-demo.d/123-qms-quality.mjs
npm run dev                                 # start the app
```

The seed creates, for the demo org: 9 controlled documents (SOPs, policies,
validation protocols, the change-control SOP + change-request form), a partial
read-and-understood training roster, 6 change-control records spread across the
lifecycle, and 9 cross-reference links to deviations / CAPAs / validation / SOPs.
The seed is idempotent (it skips an org that already has change-control rows).

If the tables aren't provisioned, the change-control reads fail **closed** to an
honest empty list (`meta.pendingStore`) and the surface shows its fixtures — never
a 500, never a fabricated verdict.

---

## 3. What to test — the four capabilities

### ① AnA trains employees to raise change requests

Change control tab → **How to raise a change** panel.

- Read the 5-step process.
- Click **Train me** → AnA explains the change-control procedure, quizzes you, and
  records read-and-understood training against the change-control SOP.
- Click **Record team training** → AnA records acknowledgments for named team
  members with an acknowledgment method + refresh date.

### ② Draft change-control documents & forms

Change control tab → **Change-control documents & forms**.

- Click **Change-request form** (or the change-control SOP / impact-assessment
  form). AnA opens the controlled template — with the standard change-control
  sections (identification → description → justification → classification & risk →
  impact → affected records → implementation → approval → verification → closure) —
  in the editor / Canvas to draft.

### ③ SOP engine — build, monitor, update SOPs

SOP register tab.

- **New controlled document** → AnA assigns the next number and opens the standard
  Purpose→Approval structure.
- On an effective document: **Revise** (opens a controlled revision, bumps the
  version, captures the reason) or **Retire**.
- On a draft / under-review document: **Approve** (independent reviewer + effective
  date + next periodic-review date).
- **Periodic review** and **Read-and-understood training** panels track what's
  overdue and where training is short.

### ④ Change-control log + lifecycle flowchart + linkage

Change control tab.

- **Lifecycle flowchart**: each node (proposed → under assessment → approved →
  in implementation → verification → closed) shows how many changes sit there.
  Click a node to filter the log to that stage; click again to clear. Off-ramps
  (rejected / cancelled) are shown beneath.
- **Change control log**: every change with type, classification, status, target
  date and link count. **Advance** hands the next controlled step to AnA. Click a
  change number (or its link count) to expand its **Linked records** — the
  deviations, CAPAs, validation protocols and SOPs it touches, each with the
  relationship (triggered-by / addresses / requires / impacts). **Link a record**
  attaches a new cross-reference.

---

## 4. The AnA-first path actually executes (not just chat)

AnA has typed, governed tools that run these actions against the real backend:

| Tool                                                          | What it does                                           | Governance                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `qms_change_create`                                           | Raise a change (starts `proposed`)                     | audit-logged                                                                                                                          |
| `qms_change_transition`                                       | Advance through the controlled lifecycle               | **requires a reason-for-change**; enforces **segregation of duties** (approver ≠ proposer); rejects illegal transitions; audit-logged |
| `qms_change_link`                                             | Link a change to a deviation / CAPA / validation / doc | audit-logged                                                                                                                          |
| `create_qms_document`, `approve_qms_document`, `ack_training` | SOP-register document + training actions               | audit-stamped                                                                                                                         |

So "Raise change request", "Advance", "Link a record" and "Train me" result in real,
persisted, org-scoped changes — not a dead-ended chat.

---

## 5. What's proven (automated coverage)

- **Route contract** (`server/routes/__tests__/qms-changes.test.ts`): 403 without
  org, create/list, lifecycle transition (legal / illegal / segregation of duties),
  links, fail-closed on a missing store.
- **Service + seed against real Postgres** (PGlite integration,
  `server/services/qms/__tests__/changeControl.pglite.integration.test.ts`): the
  migration DDL applies, the GA seed runs and produces service-readable rows, the
  summary/links read correctly, and the full lifecycle + guards work against real
  SQL. (This test caught and fixed a real seed SQL bug before it shipped.)
- **AnA tools end-to-end** (`server/services/ana/__tests__/qms-change-tools.test.ts`):
  tool input → registered handler → service → real SQL, with the Part 11 reason,
  segregation of duties and illegal-transition guards enforced through the AnA path;
  plus the registry-consistency gate.
- **Surface** (`client/src/concept2cure/quality/__tests__/ChangeControl.test.tsx`):
  register, flowchart filter, link expansion, AnA hand-off. The ui-v2 render gate
  (`surfaceRender.test.tsx`) mounts the `quality` surface with no crash.
- **Build**: `npm run build` — client + server bundle clean. **Typecheck**: green.

---

## 6. Honest limits

- Linked deviations / CAPAs / validation protocols are recorded as governed
  cross-references (`link_type` + `linked_ref`) rather than hard foreign keys —
  those records live in separate subsystems (`protocol_deviations`, `capa_records`,
  `process_validation`) with different key spaces. The register records and displays
  the reference; opening a linked record hands off to AnA.
- Change-control records are org-scoped and soft-deleted; every lifecycle
  transition is written to the audit trail from both the REST route and the AnA
  tool path.
