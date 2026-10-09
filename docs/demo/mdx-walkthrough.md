# MDX demo walkthrough — NeuroPanel-Dx 510(k), ten minutes, six surfaces

**Who this is for:** the founder, showing the launch catalog to a medical-device /
IVD prospect. **What it shows:** one fictional manufacturer (Concept2Cure
Diagnostics) taking one fictional IVD (NeuroPanel-Dx, a multiplex CSF PCR panel)
through a US 510(k) — program, dossier, authored 510(k) content, sequence,
readiness verdict, quality system, audit trail — entirely on records created
through the product's own API by `node scripts/demo/launch-demo/seed.mjs --pack mdx`.

Every record name below starts with `[Demo · MDX]`. Every document says in its
footer that it is seeded demonstration content, not model-drafted (no AI
provider is configured), so nothing on screen can be mistaken for a real
client's data or for AI output. Ids in this walkthrough are from
`docs/evidence/DEMO/mdx/manifest.json`; re-seeding on another database gives new
ids and the same names.

Before you start: sign in with **Demo access** on `/concept2cure/login`, then
open the program **[Demo · MDX] NeuroPanel-Dx 510(k)** from Projects so the
program-scoped surfaces (Vault, Authoring, Submission Center, Dispatch
readiness) read it.

---

## 1. Projects — 1 minute · `/concept2cure/projects` → `/concept2cure/project-home`

**Open:** Projects; click **[Demo · MDX] NeuroPanel-Dx 510(k)** (code `DMN5`).

**Point at:** the program row (workstream Device), and on Project home the
badges: code DMN5, FDA, the indication, ACTIVE, PRIORITY HIGH, PLANNING, and
the journey rail (Plan → Evidence → Author → Review → Submit → Respond →
Lifecycle).

**Say:** "Intake asked the regulatory questions once — Class II, product code
QNX, 21 CFR 866.3985, Microbiology panel, predicate K223456, the three device
flags (software, cyber device, clinical data) and the intended-use statement —
and scaffolded the 510(k) governed document (36 eSTAR sections) in the same
transaction. Product code and regulation number are fictional; the shape is
exactly what a real 510(k) needs." (Product note: the program detail API does
not return that taxonomy, so Project home cannot show it yet — finding F9. Do
not promise it on screen; it is in the intake request in the manifest.)

---

## 2. Vault — 2 minutes · `/concept2cure/vault`

**Open:** Vault with the program open. Expand **Source files · filing cabinet**.

**Point at:** six multi-page PDFs filed into the IVD folder set the product
offers for a device program:

| Folder | Document |
|---|---|
| 510(k) submissions | [Demo · MDX] Device Description and Principles of Operation |
| 510(k) submissions | [Demo · MDX] Analytical Performance Study Report |
| Engineering (DHF + RMF) | [Demo · MDX] Software Description and Level of Concern |
| Engineering (DHF + RMF) | [Demo · MDX] Risk Management File Summary (ISO 14971) |
| Clinical evaluation | [Demo · MDX] Clinical Performance Study Report |
| Labeling and UDI | [Demo · MDX] Labeling and Instructions for Use (Draft) |

Above the cabinet: the governed 510(k) document tree (Administrative, Device,
Performance … sections) that the Authoring surface edits.

**Say:** "Ingest hashed each file (SHA-256 shown on the record), the filing
decision into a folder was a governed action a person confirmed, and both are
on the audit trail. Open the Analytical Performance report — LoD by CLSI EP17,
inclusivity/exclusivity, EP05 precision, interference — it reads like the
study report a reviewer would expect, because it was written that way."

---

## 3. Authoring — 2 minutes · `/concept2cure/document-authoring`

**Open (program open):** **[Demo · MDX] 510(k) Summary** — nine sections, one
per element of 21 CFR 807.92 (submitter, device name and classification,
predicate, device description, intended use, technological comparison,
non-clinical data, clinical data, conclusions).

**Point at:** the lock banner "approved and frozen"; section 4 carries the
reviewer comment that was raised and **resolved before freeze** (freeze is
refused while a comment is open); the signature by the second identity
(`oq-signer@validation.local`, meaning APPROVER, PIN-verified, bound to the
frozen content hash).

**Say:** "Two-person rule: the author could not sign their own record. The
signature is bound to the frozen snapshot's hash — change a character and the
signature no longer covers it."

**Then close the program** (Projects → no program) and reopen Authoring.

**Point at:** **[Demo · MDX] Substantial Equivalence Discussion** — draft, with
the predicate comparison tables (intended use; technological characteristics;
performance) and one **open** reviewer query on section 3 (LoD units for VZV);
and **[Demo · MDX] Cybersecurity and Interoperability Summary** — §524B
determination, threat model, controls, SBOM, HL7 interface — with a review
requested from the second identity.

**Say:** "This is the working state — an open query blocks freeze, a review is
pending. (Product note: the platform binds one authoring document to the
program's governed 510(k); the other two live org-wide, which is why they show
with no program open. It is recorded as finding F2.)"

---

## 4. Submission Center — 2 minutes · `/concept2cure/submission-center`

**Open:** the submission **[Demo · MDX] NeuroPanel-Dx 510(k)** (type 510(k),
client IVD, FDA) → **Sequences**: **0000**, original, status *assembling* →
**Builder**.

**Point at:** the six vault documents placed as leaves, each pinned to its
content hash: 3.2.P.1 device description, 3.2.R software, 5.3.1.4 analytical
performance, 5.3.5.2 clinical performance, 1.16 risk management, 1.14 labeling.

**Say:** "The sequence model is eCTD — the builder is organised by CTD module
and the leaf route only accepts CTD-shaped section codes; an eSTAR section id
is refused (finding F3, the refusal is in the manifest). So for a device the
documents sit at the closest CTD codes, and the eSTAR mapping is carried on the
leaf's document type. That is the honest state of device support in the
Submission Center today; the eSTAR/pathway engines exist server-side and are
not yet what this surface files into."

Do **not** freeze or dispatch.

---

## 5. Submission Readiness — 1 minute · `/concept2cure/dispatch-readiness`

**Open:** Dispatch readiness with the program open.

**Point at:** "Cleared to dispatch? — **Dispatch blocked**", sequence 0000
(id from the manifest), 6 leaves, status assembling. Two blockers: six
error-severity structural findings and no Shadow Review. The verdict source is
the deterministic assessment; the dispatch-QC narrative says
`PROVIDER_UNAVAILABLE` because no model is configured — the verdict did not
need one.

**Say:** "Numbers and verdicts come from engines, the model only narrates.
Here the six errors are all `UNRESOLVED_DOCUMENT` on the vault-backed leaves —
that is a product finding (F5): the validator checks the integer document id
and the vault documents are uuid-keyed, so a sequence built from uploaded
files cannot clear the gate on this build. The gate failing closed is the
right behaviour; the check it fails on is the defect."

Optional: `/concept2cure/orchestration` shows the *submission_readiness_review*
execution the pack started for the program.

---

## 6. QMS controlled documents — 1.5 minutes · `/concept2cure/quality`

**Open:** Quality & Assurance → SOP register.

**Point at:**

| Number | Title | State |
|---|---|---|
| MDX-SOP-101 | [Demo · MDX] SOP-101 Design Controls (21 CFR 820.30) | **Effective** — approved by the second identity, e-signature APPROVED, effective today; training acknowledged by the founder |
| MDX-SOP-102 | [Demo · MDX] SOP-102 Corrective and Preventive Action | **Effective** — approved by the second identity |
| MDX-SOP-103 | [Demo · MDX] SOP-103 Complaint Handling and MDR Reporting | In review |
| MDX-SOP-104 | [Demo · MDX] SOP-104 Software Change Control | Draft |

Then the **Change control** tab: **MDX-CC-2026-001** "NP-100 software v2.3.0 —
parechovirus channel mapping and thermal profile", computer-system change,
major, under assessment, linked to SOP-104, the risk file and the software
description (expand the row to see the links — the log column shows 0 until
then, finding F7).

**Say:** "Approval is an electronic signature: password re-authentication,
meaning, reason, effective date, a content digest bound to the document
version, and the author cannot approve their own SOP. The change record is the
same lifecycle a device QMS runs under 820.30 / ISO 13485."

---

## 7. Audit trail — 30 seconds · `/concept2cure/audit-trail`

**Open:** Audit trail.

**Point at:** the newest entries — QMS approvals with meaning APPROVED, the
leaf placements, vault filings, the program creation — each with actor, time,
record hash and previous hash. The manifest counts the entries that reference
the pack's records.

**Say:** "Everything you just saw wrote here first. The chain verdict at the top
is the server's, over every row of this tenant, not something the page
computes." (On this evidence database the verdict is `ok=false` at a legacy
row that predates the pack — finding F8; the per-write chain verifier
`/api/c2c/actions/verify-chain` answers ok. On a fresh database both are true.)

---

## If asked

- **"Is any of this AI-generated?"** No. No provider is configured; every
  document carries a provenance line saying it was authored for the demo. The
  one place a model would speak — the dispatch-QC narrative — reports
  `PROVIDER_UNAVAILABLE` and the verdict is unaffected.
- **"Can I re-run it?"** Yes; the pack is idempotent by title (run 4 in the
  evidence folder created nothing). `--purge` retires the SOPs and deletes the
  change record; the program, vault, authoring and submission records have no
  delete endpoint and stay under the `[Demo · MDX]` prefix.
- **"Where are the findings?"** `docs/evidence/DEMO/mdx/README.md`, F1–F8, each
  with the endpoint, request and response.
