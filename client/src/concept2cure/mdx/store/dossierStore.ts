/**
 * dossierStore — in-memory file system backing every dossier surface.
 *
 * Ported from `design-system/ui_kits/mdx/dossier-store.jsx`. The kit shipped
 * this as an IIFE that published `DossierStore` / `useFileNode` / `useSection`
 * on `window`; here it is a real ES module with the same public surface.
 *
 * Mental model:
 *   A program has a Files tree. The dossier is a structured view over the tree:
 *
 *     Files/Dossier/<program>/§N <label>/
 *       body.md            ← what the DossierDrawer edits
 *       meta.json          ← status, signers, version
 *       attachments/<file>
 *
 *   Edits to body.md push a `section.edit` event onto the audit trail; uploads
 *   push `attach` events. The drawer's Activity tab subscribes to the same
 *   store, so the cross-surface round-trip is automatic.
 *
 * Per the canonical direction (kit is the only UI; no divergence), the seed
 * fixtures are the kit's verbatim — the store is the data model for the
 * pathway Files tab and dossier drawer.
 */

import * as React from 'react';
import { K510_ESTAR } from '../data/k510';
import { PATHWAY_TABS_DATA } from '../data/pathwayTabs';
import type {
  AuditEvent,
  DossierAttachment,
  DossierDirEntry,
  DossierNode,
  DossierSectionMeta,
} from '../types';

type PathwayId = string;

interface RootSpec {
  program: string;
  label: string;
  numFmt: (n: string | number) => string;
}

const ROOTS: Record<string, RootSpec> = {
  k510: { program: 'BX-204', label: '510(k) — K-251401',      numFmt: (n) => `§${String(n).padStart(2, '0')}` },
  pma:  { program: 'CV-330', label: 'PMA — P250048',          numFmt: (n) => String(n) },
  cer:  { program: 'IV-415', label: 'CER — IV-415 Companion', numFmt: (n) => `§${n}` },
};

function rootFor(pathway: PathwayId): string {
  const r = ROOTS[pathway] || ROOTS.k510;
  return `Files/Dossier/${r.label}`;
}

function sectionPath(pathway: PathwayId, sectionId: string | number, label?: string): string {
  const r = ROOTS[pathway] || ROOTS.k510;
  const num = r.numFmt(sectionId);
  let cleanLabel = label || '';
  cleanLabel = cleanLabel.replace(/^eSTAR\s+§?\d+\s*[—-]\s*/i, '');
  cleanLabel = cleanLabel.replace(/^§\d+\s*[—-]\s*/i, '');
  cleanLabel = cleanLabel.replace(/^PMA\s+Module\s+[\d.]+\s*[—-]\s*/i, '');
  return `${rootFor(pathway)}/${num} ${cleanLabel}`;
}

/* ─────────────── Seed bodies ─────────────── */

const K510_SEED_BODIES: Record<number, string> = {
  1: `# Submission cover sheet

**Device:** BX-204 Continuous Glucose Monitor
**Submitter:** Concept2Cure Diagnostics, Inc.
**Submission type:** Traditional 510(k)
**Product code:** NBW
**Device class:** II
**Reviewing center:** CDRH / OHT2 / DHT2C

This 510(k) demonstrates that the BX-204 Continuous Glucose Monitor is **substantially equivalent** to predicate device K221847 (Dexcom G7 CGM System). The subject device shares the same intended use, indications for use, and fundamental scientific technology, with differences in form factor and adhesive backing that do not raise new questions of safety or effectiveness.

Cover sheet completed by Jordan Chen, Reg Lead. Filing planned for **June 9, 2026**.`,

  7: `# Indications for Use

The **BX-204 Continuous Glucose Monitor** is indicated for the continuous measurement, recording, analysis, and display of glucose values in persons aged **2 years and older** with diabetes mellitus.

The system is intended to:

- Replace fingerstick blood glucose testing for diabetes treatment decisions, including bolus dosing.
- Aid in the detection of episodes of hyperglycemia and hypoglycemia.
- Support short-term and long-term therapy adjustments.

Interpretation of CGM results should be based on glucose trends and several sequential readings over time. The device should not be used for diagnosis of diabetes or to screen for diabetes.

> **Status:** Locked by Jordan Chen on Apr 28, 2026. E-signed by Dr. Lee Hartman (Med Affairs) per 21 CFR Part 11.`,

  11: `# §11 Performance testing

## §11.1 Bench testing
Bench testing was conducted in accordance with **ISO 15197:2013** for accuracy of self-monitoring blood glucose systems, adapted for continuous monitoring per FDA guidance "Self-Monitoring Blood Glucose Test Systems for Over-the-Counter Use" (Oct 2020).

## §11.2 Analytical performance
Analytical specificity, linearity, and stability were evaluated per CLSI EP-07, EP-09, and EP-25. Results meet acceptance criteria.

## §11.3 Clinical performance
Pivotal accuracy study **BX204-PIVOT-001** enrolled 412 subjects across 14 sites. Comparator: YSI 2300 STAT Plus.

## §11.4 Accuracy
**Adjudicated MARD:** 8.7% (95% CI 8.2–9.3%). Of paired CGM-YSI values, 95.4% fell within ±15 mg/dL or ±15% (Consensus Error Grid Zone A+B). Per-decile analysis attached: \`mard-by-age-band.xlsx\`.

> **Open AI-Hold:** CDRH requested stratified MARD by age decile (18–39, 40–64, 65+) and raw CSV with adjudicated comparator. Response due May 12.

## §11.5 Interferents
Tested 24 endogenous + exogenous interferents per CLSI EP-07. Acetaminophen ≤ 4 g/day showed no clinically significant bias. Full results in \`interferent-summary.pdf\`.`,

  10: `# §10 Software

The BX-204 mobile app is classified as **Class B** per IEC 62304. Cybersecurity documentation is provided per the FDA premarket cybersecurity guidance (Sept 2023).

## Software documentation level
Basic Documentation Level per FDA guidance "Content of Premarket Submissions for Device Software Functions" (June 2023).

## Cybersecurity
- **SBOM:** generated via CycloneDX, attached as \`bx204-mobile-sbom.json\`.
- **Threat model:** STRIDE-based, attached as \`threat-model-v3.pdf\`.
- **Security testing:** SAST, DAST, fuzzing per OWASP MASVS. No critical findings outstanding.

## Verification
Unit, integration, and system test evidence on file. Coverage ≥ 95% on glucose calculation paths.`,
};

const PMA_SEED_BODIES: Record<string, string> = {
  M27: `# Module 2.7 — Clinical Summary

## 2.7.1 Background
The CV-330 Implantable Cardiac Monitor pivotal trial (**CV330-PIVOT**) enrolled 412 of a planned 680 subjects across 14 sites between Q3 2024 and Q1 2026. This module summarizes the clinical evidence supporting safety and effectiveness for PMA approval.

## 2.7.3 Efficacy
**Primary endpoint:** Sensitivity for clinically significant arrhythmia detection ≥ 90% at 12 months.
**Result:** 94.1% sensitivity (95% CI 91.8–96.0%), N = 412. Pre-specified non-inferiority margin met.
**Bayesian borrowing** applied per SAP v2.4 — interim analysis attached.

## 2.7.4 AE summary
- **Total AEs:** 1,847 across 412 subjects (median follow-up 11.4 months).
- **Serious AEs:** 47 (3 device-related under adjudication, 2 serious device-related).
- **Deaths:** 8, none device-related per CEC adjudication.
Adjudicated AE table attached as \`adjudicated-ae-table-v3.xlsx\`.`,

  M535: `# Module 5.3.5 — Pivotal trial

Full clinical study report for **CV330-PIVOT** (NCT-XXXXXXX). Per ICH E3 structure.

## Primary efficacy
Sensitivity 94.1% (95% CI 91.8–96.0%). Pre-specified ≥ 90%. Met.

## Subgroup analyses
By age band, sex, baseline rhythm, and site. Stratified results attached: \`efficacy-by-arm.csv\`, \`efficacy-by-site.xlsx\`.

## Site-level performance
14 sites enrolled; 1 site (Site 11 — Mercy Hospital) excluded from per-protocol due to GCP findings; sensitivity analysis with Site 11 included shows 93.6% (consistent with primary). Site 14 IRB approval pending — 12 subjects screened but not yet enrolled.`,
};

const CER_SEED_BODIES: Record<string, string> = {
  S1: `# §1 Scope and device description

The IV-415 Companion Diagnostic is a CE-marked in vitro device intended for the qualitative detection of **biomarker X** in plasma to guide treatment selection for **indication Y**. This Clinical Evaluation Report (CER) is prepared per **MDR Article 61** and MDCG 2020-13.

The CER covers all clinical data sources: clinical investigations, post-market surveillance, scientific literature, and equivalence to predecessor device IV-410.`,

  S3: `# §3 Clinical data summary

Clinical data sources:

1. **Pivotal investigation IV415-EU-001** (n=312, EU sites) — published Eur J Cancer 2024.
2. **Real-world cohort** — Eudamed registry, n=2,140 patients across 4 EU member states.
3. **Literature** — 23 peer-reviewed publications identified per protocol; 14 included after critical appraisal (CASP).
4. **PMS data** — 2,025 reports through Q1 2026; signal evaluation ongoing for late-stage pacing threshold rise (FR-2241, under review).`,

  S4: `# §4 Safety and risk-benefit

The risk-benefit profile of the IV-415 remains favorable for the intended indication. Identified risks (false positive, false negative, sample handling) are addressed in labeling and in the GSPR conformity matrix.

PMS signals under review:
- Late-stage pacing threshold rise (LIT-2241, n=6, severity serious).
- Skin irritation at adhesive site (FR-8802, n=28, expected, labeling covers).`,
};

/* ─────────────── Seed attachments ─────────────── */

const K510_SEED_ATTACHMENTS: Record<number, DossierAttachment[]> = {
  1: [
    { name: 'form-3601.pdf',                  size: 184320,   kind: 'pdf', who: 'Jordan Chen',     when: '2026-04-15T10:14:00Z', source: 'Sources/forms/' },
    { name: 'cover-letter-v3.docx',           size: 24576,    kind: 'doc', who: 'Jordan Chen',     when: '2026-04-22T16:42:00Z', source: 'Sources/' },
  ],
  7: [
    { name: 'IFU-final-locked.pdf',           size: 92160,    kind: 'pdf', who: 'Dr. Lee Hartman', when: '2026-04-28T15:44:00Z', source: 'Sources/labeling/' },
  ],
  11: [
    { name: 'BX204-PIVOT-CSR-final.pdf',      size: 14680064, kind: 'pdf', who: 'Marcus Wei',      when: '2026-04-12T11:08:00Z', source: 'Sources/clinical/' },
    { name: 'mard-by-age-band.xlsx',          size: 184320,   kind: 'xls', who: 'Jordan Chen',     when: '2026-04-29T10:42:00Z', source: 'Sources/clinical/' },
    { name: 'BENCH-A1B2-raw.csv',             size: 2097152,  kind: 'csv', who: 'Marcus Wei',      when: '2026-04-08T09:18:00Z', source: 'Sources/bench/' },
    { name: 'interferent-summary.pdf',        size: 524288,   kind: 'pdf', who: 'Marcus Wei',      when: '2026-04-09T14:30:00Z', source: 'Sources/bench/' },
    { name: 'consensus-error-grid.png',       size: 314572,   kind: 'img', who: 'Marcus Wei',      when: '2026-04-12T11:14:00Z', source: 'Sources/clinical/' },
  ],
  10: [
    { name: 'bx204-mobile-sbom.json',         size: 81920,    kind: 'code', who: 'Marcus Wei',     when: '2026-04-27T16:12:00Z', source: 'Sources/software/' },
    { name: 'threat-model-v3.pdf',            size: 1048576,  kind: 'pdf', who: 'Marcus Wei',      when: '2026-04-25T11:40:00Z', source: 'Sources/software/' },
    { name: 'cybersecurity-test-summary.pdf', size: 720896,   kind: 'pdf', who: 'Marcus Wei',      when: '2026-04-26T15:22:00Z', source: 'Sources/software/' },
  ],
};

const PMA_SEED_ATTACHMENTS: Record<string, DossierAttachment[]> = {
  M27: [
    { name: 'clinical-summary-v4.docx',       size: 524288,   kind: 'doc', who: 'Sara Okafor', when: '2026-04-29T15:11:00Z', source: 'Sources/clinical/' },
    { name: 'adjudicated-ae-table-v3.xlsx',   size: 245760,   kind: 'xls', who: 'Sara Okafor', when: '2026-04-29T11:02:00Z', source: 'Sources/clinical/' },
  ],
  M535: [
    { name: 'CV330-PIVOT-CSR-v2.pdf',         size: 24117248, kind: 'pdf', who: 'Sara Okafor', when: '2026-04-22T09:30:00Z', source: 'Sources/clinical/' },
    { name: 'efficacy-by-arm.csv',            size: 86016,    kind: 'csv', who: 'Marcus Wei',  when: '2026-04-29T09:33:00Z', source: 'Sources/clinical/' },
    { name: 'efficacy-by-site.xlsx',          size: 174080,   kind: 'xls', who: 'Marcus Wei',  when: '2026-04-28T13:14:00Z', source: 'Sources/clinical/' },
    { name: 'sap-v2.4.pdf',                   size: 614400,   kind: 'pdf', who: 'Marcus Wei',  when: '2026-03-18T10:00:00Z', source: 'Sources/clinical/' },
  ],
};

const CER_SEED_ATTACHMENTS: Record<string, DossierAttachment[]> = {
  S1: [
    { name: 'IV-415-IFU-EU-final.pdf',        size: 102400,   kind: 'pdf', who: 'Sara Okafor', when: '2026-04-19T10:00:00Z', source: 'Sources/labeling/' },
  ],
  S3: [
    { name: 'literature-search-protocol.pdf', size: 245760,   kind: 'pdf', who: 'Sara Okafor', when: '2026-03-22T14:18:00Z', source: 'Sources/literature/' },
    { name: 'eudamed-registry-export.csv',    size: 1572864,  kind: 'csv', who: 'Sara Okafor', when: '2026-04-15T09:42:00Z', source: 'Sources/pms/' },
    { name: 'CASP-appraisal-grid.xlsx',       size: 122880,   kind: 'xls', who: 'Sara Okafor', when: '2026-04-12T11:30:00Z', source: 'Sources/literature/' },
  ],
};

/* ─────────────── Store ─────────────── */

const fs = new Map<string, DossierNode>();
const subscribers = new Map<string, Set<() => void>>();
const globalSubs = new Set<() => void>();

/* Synthetic audit events created from in-store edits — merged with the seed
   audit slice by the drawer's Activity tab. */
const liveAuditEvents: AuditEvent[] = [];

function notify(path: string): void {
  (subscribers.get(path) || new Set<() => void>()).forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
  globalSubs.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}

function read(path: string): DossierNode | undefined { return fs.get(path); }

function subscribe(path: string, cb: () => void): () => void {
  if (!subscribers.has(path)) subscribers.set(path, new Set());
  subscribers.get(path)!.add(cb);
  return () => { subscribers.get(path)?.delete(cb); };
}
function subscribeAll(cb: () => void): () => void {
  globalSubs.add(cb);
  return () => { globalSubs.delete(cb); };
}

/* ─────────────── Section file API ─────────────── */

function sectionFolder(pathway: PathwayId, sectionId: string | number, label?: string): string {
  return sectionPath(pathway, sectionId, label);
}

function readSectionBody(pathway: PathwayId, sectionId: string | number, label?: string): string {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/body.md`)?.body || '';
}

function readSectionMeta(pathway: PathwayId, sectionId: string | number, label?: string): DossierSectionMeta {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/meta.json`)?.meta || {};
}

function readSectionAttachments(pathway: PathwayId, sectionId: string | number, label?: string): DossierAttachment[] {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/attachments`)?.files || [];
}

interface WriteOpts { when?: string; who?: string; role?: string; silent?: boolean }

function writeSectionBody(
  pathway: PathwayId,
  sectionId: string | number,
  label: string | undefined,
  body: string,
  opts: WriteOpts = {},
): void {
  const folder = sectionFolder(pathway, sectionId, label);
  const path = `${folder}/body.md`;
  const prev = fs.get(path);
  fs.set(path, { kind: 'file', body, size: body.length, when: opts.when || new Date().toISOString(), who: opts.who || 'You' });

  const metaPath = `${folder}/meta.json`;
  const meta = fs.get(metaPath)?.meta || {};
  fs.set(metaPath, {
    kind: 'file',
    meta: { ...meta, version: (meta.version || 0) + 1, lastEdited: opts.when || new Date().toISOString(), lastEditor: opts.who || 'You' },
  });

  if (!opts.silent && prev) {
    const diffApprox = approxDiff(prev.body || '', body);
    liveAuditEvents.push({
      id:        `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      when:      opts.when || new Date().toISOString(),
      kind:      'section.edit',
      actor:     opts.who || 'You',
      role:      opts.role || 'Reg Lead',
      target:    label || `§${sectionId}`,
      target_id: sectionId,
      diff:      diffApprox,
      ip:        '10.0.4.21',
      live:      true,
    });
  }

  notify(path);
  notify(metaPath);
  notify(`audit:${pathway}`);
}

interface AttachInput { name: string; size?: number; kind?: string; source?: string }

function attachFile(
  pathway: PathwayId,
  sectionId: string | number,
  label: string | undefined,
  file: AttachInput,
  opts: WriteOpts = {},
): void {
  const folder = sectionFolder(pathway, sectionId, label);
  const path = `${folder}/attachments`;
  const cur = fs.get(path)?.files || [];
  const newFile: DossierAttachment = {
    name:   file.name,
    size:   file.size || 0,
    kind:   file.kind || guessKind(file.name),
    who:    opts.who || 'You',
    when:   opts.when || new Date().toISOString(),
    source: file.source || 'Sources/uploads/',
    live:   !opts.silent,
  };
  fs.set(path, { kind: 'dir', files: [newFile, ...cur] });

  if (!opts.silent) {
    liveAuditEvents.push({
      id:        `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      when:      opts.when || new Date().toISOString(),
      kind:      'attach',
      actor:     opts.who || 'You',
      role:      opts.role || 'Reg Lead',
      target:    label || `§${sectionId}`,
      target_id: sectionId,
      file:      `${file.name} · ${fmtSize(file.size || 0)}`,
      ip:        '10.0.4.21',
      live:      true,
    });
  }

  notify(path);
  notify(`audit:${pathway}`);
}

function liveEventsForPathway(_pathway: PathwayId): AuditEvent[] {
  return [...liveAuditEvents];
}

function activityForSection(pathway: PathwayId, sectionId: string | number): AuditEvent[] {
  const seed = PATHWAY_TABS_DATA[pathway as keyof typeof PATHWAY_TABS_DATA]?.audit || [];
  const all = [...liveAuditEvents, ...seed];
  return all.filter((e) => e.target_id === sectionId);
}

/* ─────────────── Helpers ─────────────── */

function approxDiff(prev: string, next: string): string {
  const a = prev.split('\n');
  const b = next.split('\n');
  const setA = new Set(a);
  const setB = new Set(b);
  let add = 0;
  let rem = 0;
  b.forEach((l) => { if (!setA.has(l)) add += l.length; });
  a.forEach((l) => { if (!setB.has(l)) rem += l.length; });
  return `+${Math.max(1, Math.round(add / 8))} / −${Math.max(0, Math.round(rem / 8))}`;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function guessKind(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return ext === 'csv' ? 'csv' : 'xls';
  if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) return 'img';
  if (['json', 'xml', 'js', 'ts', 'py'].includes(ext)) return 'code';
  return 'file';
}

function listDir(prefix: string): DossierDirEntry[] {
  const entries: DossierDirEntry[] = [];
  const seen = new Set<string>();
  fs.forEach((_node, path) => {
    if (!path.startsWith(prefix + '/')) return;
    const rest = path.slice(prefix.length + 1);
    const head = rest.split('/')[0];
    if (!seen.has(head)) {
      seen.add(head);
      const fullPath = `${prefix}/${head}`;
      entries.push({ name: head, path: fullPath, isDir: rest.includes('/'), node: fs.get(fullPath) });
    }
  });
  return entries.sort((a, b) => (Number(b.isDir) - Number(a.isDir)) || a.name.localeCompare(b.name));
}

/* ─────────────── Seed ─────────────── */

function seed(): void {
  // 510(k)
  K510_ESTAR.forEach((s) => {
    const body = K510_SEED_BODIES[s.id] || `# ${s.label}\n\nSection draft pending. Use the editor to start, or open in the full editor for the complete authoring surface.`;
    const meta: DossierSectionMeta = {
      sectionId:  s.id,
      label:      s.label,
      status:     s.status || 'draft',
      version:    s.id === 11 ? 14 : s.id === 7 ? 9 : s.id === 1 ? 6 : 1,
      lastEdited: '2026-04-29T10:55:00Z',
      lastEditor: 'Jordan Chen',
      signers:    s.id === 7 ? ['Dr. Lee Hartman'] : [],
      blocker:    s.blocker || null,
    };
    writeSectionBody('k510', s.id, s.label, body, { silent: true, who: meta.lastEditor, when: meta.lastEdited });
    const folder = sectionFolder('k510', s.id, s.label);
    fs.set(`${folder}/meta.json`, { kind: 'file', meta });
    fs.set(`${folder}/attachments`, { kind: 'dir', files: K510_SEED_ATTACHMENTS[s.id] || [] });
  });

  // PMA
  const pmaSections = [
    { id: 'M27',  label: 'PMA Module 2.7 — Clinical Summary', status: 'review' },
    { id: 'M535', label: 'PMA Module 5.3.5 — Pivotal trial',   status: 'in_progress' },
    { id: 'M274', label: 'PMA Module 2.7.4 — AE summary',      status: 'draft' },
    { id: 'M25',  label: 'PMA Module 2.5 — Clinical Overview', status: 'draft' },
    { id: 'M11',  label: 'PMA Module 1.1 — Forms',             status: 'complete' },
    { id: 'M273', label: 'PMA Module 2.7.3 — Efficacy',        status: 'in_progress' },
  ];
  pmaSections.forEach((s) => {
    const body = PMA_SEED_BODIES[s.id] || `# ${s.label}\n\nDraft pending.`;
    writeSectionBody('pma', s.id, s.label, body, { silent: true, who: 'Sara Okafor', when: '2026-04-29T11:02:00Z' });
    const folder = sectionFolder('pma', s.id, s.label);
    fs.set(`${folder}/meta.json`, { kind: 'file', meta: {
      sectionId: s.id, label: s.label, status: s.status,
      version: s.id === 'M27' ? 11 : s.id === 'M535' ? 8 : 3,
      lastEdited: '2026-04-29T11:02:00Z', lastEditor: 'Sara Okafor',
    } });
    fs.set(`${folder}/attachments`, { kind: 'dir', files: PMA_SEED_ATTACHMENTS[s.id] || [] });
  });

  // CER
  const cerSections = [
    { id: 'S1', label: 'Scope and device description',    status: 'complete' },
    { id: 'S2', label: 'State-of-the-art analysis',       status: 'complete' },
    { id: 'S3', label: 'Clinical data summary',           status: 'draft' },
    { id: 'S4', label: 'Safety and risk-benefit',         status: 'review' },
    { id: 'S5', label: 'Post-market surveillance plan',   status: 'draft' },
    { id: 'S6', label: 'Conclusion and recommendation',   status: 'draft' },
  ];
  cerSections.forEach((s) => {
    const body = CER_SEED_BODIES[s.id] || `# §${s.id} ${s.label}\n\nDraft pending.`;
    writeSectionBody('cer', s.id, s.label, body, { silent: true, who: 'Sara Okafor', when: '2026-04-28T11:40:00Z' });
    const folder = sectionFolder('cer', s.id, s.label);
    fs.set(`${folder}/meta.json`, { kind: 'file', meta: {
      sectionId: s.id, label: s.label, status: s.status,
      version: s.id === 'S1' ? 8 : 4,
      lastEdited: '2026-04-28T11:40:00Z', lastEditor: 'Sara Okafor',
    } });
    fs.set(`${folder}/attachments`, { kind: 'dir', files: CER_SEED_ATTACHMENTS[s.id] || [] });
  });
}

/* ─────────────── Public API ─────────────── */

export const DossierStore = {
  rootFor,
  sectionFolder,
  readSectionBody,
  readSectionMeta,
  readSectionAttachments,
  writeSectionBody,
  attachFile,
  activityForSection,
  liveEventsForPathway,
  subscribe,
  subscribeAll,
  fmtSize,
  guessKind,
  fs,
  listDir,
};

/** Subscribe a component to a single node path; re-renders on write. */
export function useFileNode(path: string): DossierNode | undefined {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => subscribe(path, force), [path]);
  return read(path);
}

export interface SectionView {
  body: string;
  meta: DossierSectionMeta;
  attachments: DossierAttachment[];
  folder: string;
}

/** Subscribe a component to a section's body / meta / attachments. */
export function useSection(pathway: PathwayId, sectionId: string | number, label?: string): SectionView {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const folder = sectionFolder(pathway, sectionId, label);
    const u1 = subscribe(`${folder}/body.md`, force);
    const u2 = subscribe(`${folder}/meta.json`, force);
    const u3 = subscribe(`${folder}/attachments`, force);
    return () => { u1(); u2(); u3(); };
  }, [pathway, sectionId, label]);
  return {
    body:        readSectionBody(pathway, sectionId, label),
    meta:        readSectionMeta(pathway, sectionId, label),
    attachments: readSectionAttachments(pathway, sectionId, label),
    folder:      sectionFolder(pathway, sectionId, label),
  };
}

// Seed once at module load — fixtures (K510_ESTAR, PATHWAY_TABS_DATA) are
// statically imported, so they are available synchronously.
seed();
