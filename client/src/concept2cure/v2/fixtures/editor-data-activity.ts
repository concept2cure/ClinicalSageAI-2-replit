/* ------------------------------------------------------------------ *
 *  editor-data-activity.ts
 *  Threaded comments, version history, and governance audit trail
 *  for the document editor.
 * ------------------------------------------------------------------ */

import type { AuditEntry, Comment, VersionEntry } from './editor-data-types';

/* -- Threaded comments (sectionId to comments) ---------------------- */

export const REG_COMMENTS: Readonly<Record<string, readonly Comment[]>> = {
  m25: [
    { id: 'c1', anchor: '§2.5.4', author: 'Ana Müller', role: 'Clinical', when: '1 h ago', resolved: false, ai: false,
      body: 'Pop-PK is not locked — soften "establishes" to "is being established" and cross-reference 2.7.2.',
      replies: [{ author: 'AnA', role: 'Maximum', when: '1 h ago', ai: true, body: 'Suggested edit applied as a tracked change. Apply to accept, or open §2.7.2 to verify status.' }] },
    { id: 'c2', anchor: '§2.5.4 table', author: 'Marcus Wei', role: 'Biostat', when: '3 h ago', resolved: false, ai: false,
      body: 'Confirm the ORR table reflects the locked CSR-201 dataset, not the interim cut.', replies: [] },
    { id: 'c3', anchor: '§2.5.1', author: 'Priya Shah', role: 'QA', when: 'yesterday', resolved: true, ai: false,
      body: 'Accelerated-approval citation verified against 21 CFR 314.500.', replies: [] },
  ],
  k7: [
    { id: 'kc1', anchor: '§7.2 table', author: 'Jordan Chen', role: 'Reg Lead', when: '2 h ago', resolved: false, ai: false,
      body: '15-day wear is the key SE delta — make sure §13 accuracy spans day 15 and reference it explicitly here.',
      replies: [{ author: 'AnA', role: 'Maximum', when: '2 h ago', ai: true, body: '§13.4 includes day-15 accuracy (MARD 9.1%). I can insert the cross-reference into §7.2. Apply?' }] },
    { id: 'kc2', anchor: '§7.1', author: 'Priya Shah', role: 'QA', when: 'yesterday', resolved: true, ai: false,
      body: 'Predicate clearance date confirmed: K221847, 14 Mar 2023.', replies: [] },
  ],
  cer4: [
    { id: 'cc1', anchor: '§4.2', author: 'Lee Hartman', role: 'Med Affairs', when: '4 h ago', resolved: false, ai: false,
      body: 'Append the literature search protocol as Annex A and link it from this section per Annex XIV.', replies: [] },
  ],
  e7: [
    { id: 'ec1', anchor: '§7.2', author: 'Marcus Wei', role: 'Biostat', when: '2 h ago', resolved: false, ai: false,
      body: 'OS is immature — keep §7.2 descriptive and move the inferential language to the discussion once the IA2 reads out.',
      replies: [{ author: 'AnA', role: 'Maximum', when: '2 h ago', ai: true, body: 'Flagged inline and softened the OS sentence as a tracked change. Accept to apply.' }] },
    { id: 'ec2', anchor: '§7.1 table', author: 'Sara Okafor', role: 'Clin Ops', when: 'yesterday', resolved: true, ai: false,
      body: 'PFS table values reconciled against the locked CSR-301 §14.2 outputs.', replies: [] },
  ],
  p51: [
    { id: 'pc1', anchor: '§5.1.2', author: 'Linh Tran', role: 'Reg Affairs', when: '1 h ago', resolved: false, ai: false,
      body: 'FDA will push back on calling the subgroup analysis pre-specified — SAP v3.0 lists it as exploratory. Reword.',
      replies: [{ author: 'AnA', role: 'Maximum', when: '1 h ago', ai: true, body: 'Drafted "post-hoc subgroup analysis was consistent with…" as a tracked change. Accept to apply.' }] },
    { id: 'pc2', anchor: '§5.1.3', author: 'Maya Patel', role: 'Clinical Lead', when: 'yesterday', resolved: false, ai: false,
      body: 'Adjudication committee report ADJ-CV330-FINAL is locked — I\'ll attach it to §5.3 today.', replies: [] },
  ],
};

/* -- Version history per pathway (first entry = current working draft) */

export const REG_VERSIONS: Readonly<Record<string, readonly VersionEntry[]>> = {
  ctd: [
    { v: 'v0.9 (working)', when: 'now', author: 'You', sig: null, note: 'Unsaved working draft', diff: '+312 / −44', current: true },
    { v: 'v0.8', when: '2026-04-29 14:31', author: 'A. Müller', sig: null, note: 'Incorporated biostat comments on the ORR table', diff: '+128 / −86' },
    { v: 'v0.7', when: '2026-04-28 17:05', author: 'AnA · Maximum', sig: null, note: 'Generated §2.5.6 benefit-risk conclusions', diff: '+204 / −0' },
    { v: 'v0.6 — signed', when: '2026-04-26 09:12', author: 'A. Müller', sig: 'A.Müller · APPROVER', note: 'Baseline draft frozen for internal review', diff: '+1,840 / −0' },
  ],
  estar: [
    { v: 'v1.2 (working)', when: 'now', author: 'You', sig: null, note: 'Unsaved working draft', diff: '+196 / −22', current: true },
    { v: 'v1.1', when: '2026-04-29 10:55', author: 'J. Chen', sig: null, note: 'Tightened §7.2 substantial-equivalence comparison table', diff: '+88 / −31' },
    { v: 'v1.0 — signed', when: '2026-04-28 15:44', author: 'L. Hartman', sig: 'L.Hartman · APPROVER', note: '§7 frozen for predicate review', diff: '+1,420 / −0' },
  ],
  cer: [
    { v: 'v0.5 (working)', when: 'now', author: 'You', sig: null, note: 'Unsaved working draft', diff: '+248 / −60', current: true },
    { v: 'v0.4', when: '2026-04-29 11:30', author: 'L. Hartman', sig: null, note: 'Expanded §4.2 literature appraisal benchmark devices', diff: '+312 / −44' },
    { v: 'v0.3', when: '2026-04-28 10:22', author: 'AnA · Maximum', sig: null, note: 'Generated §4.1 state-of-the-art standards summary', diff: '+180 / −0' },
  ],
  csr: [
    { v: 'v0.7 (working)', when: 'now', author: 'You', sig: null, note: 'Unsaved working draft', diff: '+186 / −40', current: true },
    { v: 'v0.6', when: '2026-04-29 13:12', author: 'S. Okafor', sig: null, note: 'Reconciled §7.1 PFS table with locked CSR-301 outputs', diff: '+92 / −18' },
    { v: 'v0.5', when: '2026-04-28 16:40', author: 'AnA · Maximum', sig: null, note: 'Generated §7 efficacy narrative from the SAP', diff: '+460 / −0' },
    { v: 'v0.4 — signed', when: '2026-04-26 11:05', author: 'M. Wei', sig: 'M.Wei · AUTHOR', note: 'Statistical methods (§5) frozen post database lock', diff: '+2,140 / −0' },
  ],
  pma: [
    { v: 'v2.0 (working)', when: 'now', author: 'You', sig: null, note: 'Unsaved working draft', diff: '+208 / −52', current: true },
    { v: 'v1.9', when: '2026-04-29 09:40', author: 'J. Adeyemi', sig: null, note: 'Updated §5.1 primary-endpoint CI from locked SAP', diff: '+74 / −22' },
    { v: 'v1.8 — signed', when: '2026-04-27 14:10', author: 'L. Tran', sig: 'L.Tran · APPROVER', note: '§3 manufacturing frozen for QSR pre-audit', diff: '+1,960 / −0' },
  ],
};

/* -- Governance audit trail per pathway ----------------------------- */

export const REG_AUDIT: Readonly<Record<string, readonly AuditEntry[]>> = {
  ctd: [
    { kind: 'edit', actor: 'A. Müller', when: '14:31', target: '§2.5.4 — Overview of efficacy', detail: '+128 / −86', ip: '10.0.4.21' },
    { kind: 'ai', actor: 'AnA · Maximum', when: '13:58', target: '§2.5.5 — Overview of safety', detail: 'Generated draft (1 source)', ip: 'gateway' },
    { kind: 'comment', actor: 'M. Wei', when: '11:18', target: '§2.5.4 table', detail: 'Adjudicated dataset question', ip: '10.0.4.88' },
    { kind: 'sign', actor: 'A. Müller', when: 'Apr 26 09:12', target: 'Document baseline v0.6', detail: 'Signed · APPROVER · 21 CFR §11.50', ip: '10.0.4.21' },
    { kind: 'lock', actor: 'A. Müller', when: 'Apr 26 09:12', target: '§2.1 TOC', detail: 'Section frozen', ip: '10.0.4.21' },
  ],
  estar: [
    { kind: 'edit', actor: 'J. Chen', when: '10:55', target: '§7.2 — SE comparison', detail: '+88 / −31', ip: '10.0.4.21' },
    { kind: 'comment', actor: 'P. Shah', when: '09:40', target: '§7.1 — Predicate identification', detail: 'Clearance date verified', ip: '10.0.4.88' },
    { kind: 'sign', actor: 'L. Hartman', when: 'Apr 28 15:44', target: '§7 baseline v1.0', detail: 'Signed · APPROVER · 21 CFR §11.50', ip: '10.0.4.62' },
    { kind: 'lock', actor: 'J. Chen', when: 'Apr 28 16:08', target: '§5 — Indications for use', detail: 'Section frozen', ip: '10.0.4.21' },
  ],
  cer: [
    { kind: 'ai', actor: 'AnA · Maximum', when: '11:30', target: '§4.2 — Clinical background', detail: 'Drafted appraisal summary', ip: 'gateway' },
    { kind: 'edit', actor: 'L. Hartman', when: '11:30', target: '§4.2 — Benchmark devices', detail: '+312 / −44', ip: '10.0.4.62' },
    { kind: 'comment', actor: 'L. Hartman', when: '09:15', target: '§4.2 — Literature search', detail: 'Append Annex A protocol', ip: '10.0.4.62' },
    { kind: 'sign', actor: 'P. Shah', when: 'Apr 28 14:02', target: '§3 baseline', detail: 'Signed · APPROVER · 21 CFR §11.50', ip: '10.0.4.88' },
  ],
  csr: [
    { kind: 'edit', actor: 'S. Okafor', when: '13:12', target: '§7.1 — Primary efficacy analysis', detail: '+92 / −18', ip: '10.0.4.41' },
    { kind: 'ai', actor: 'AnA · Maximum', when: '16:40', target: '§7 — Efficacy evaluation', detail: 'Generated narrative from SAP', ip: 'gateway' },
    { kind: 'comment', actor: 'M. Wei', when: '09:55', target: '§7.2 — Secondary analyses', detail: 'OS immature — keep descriptive', ip: '10.0.4.88' },
    { kind: 'sign', actor: 'M. Wei', when: 'Apr 26 11:05', target: '§5 — Statistical methods', detail: 'Signed · AUTHOR · post database lock', ip: '10.0.4.88' },
  ],
  pma: [
    { kind: 'edit', actor: 'J. Adeyemi', when: '09:40', target: '§5.1 — Clinical investigation summary', detail: '+74 / −22', ip: '10.0.4.51' },
    { kind: 'comment', actor: 'L. Tran', when: '08:55', target: '§5.1.2 — Subgroup analysis', detail: 'Reword pre-specified claim', ip: '10.0.4.33' },
    { kind: 'sign', actor: 'L. Tran', when: 'Apr 27 14:10', target: '§3 — Manufacturing baseline', detail: 'Signed · APPROVER · 21 CFR §11.50', ip: '10.0.4.33' },
    { kind: 'lock', actor: 'J. Adeyemi', when: 'Apr 27 14:10', target: '§3.3 — Sterilization validation', detail: 'Section frozen', ip: '10.0.4.51' },
  ],
};
