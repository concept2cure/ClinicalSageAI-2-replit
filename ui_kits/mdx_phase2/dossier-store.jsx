/* dossier-store.jsx
   ─────────────────────────────────────────────────────────────────
   In-memory file system backing every dossier surface.

   Mental model:
     A program has a Files tree. The dossier is a *structured view*
     over the tree:

       Files/
         Dossier/
           510(k) — K-251401/
             §11 Performance testing/
               body.md            ← what DossierEditor edits
               meta.json          ← status, signers, version, hash
               attachments/
                 mard-by-age-band.xlsx
                 BENCH-A1B2.csv
                 …
         Correspondence/
         Approvals/
         Audit/
           audit-trail.ndjson
         Sources/

     "Open in dossier" routes to a section folder. The drawer shows
     body.md (Document tab), attachments/ (Attachments tab), and the
     audit slice scoped to that section (Activity tab).

     Edits to body.md push a `section.edit` event onto the audit
     trail; uploads push `attach` events. The audit pane subscribes
     to the same store, so cross-surface round-trip is automatic.
   ─────────────────────────────────────────────────────────────────
*/

(function () {
  'use strict';


  // Pathway → program → root path under Files/Dossier/
  const ROOTS = {
    k510:    { program: 'BX-204', label: '510(k) — K-251401',          numFmt: (n) => `§${String(n).padStart(2, '0')}` },
    pma:     { program: 'CV-330', label: 'PMA — P250048',              numFmt: (n) => n },
    cer:     { program: 'IV-415', label: 'CER — IV-415 Companion',     numFmt: (n) => `§${n}` },
  };

  function rootFor(pathway) {
    const r = ROOTS[pathway] || ROOTS.k510;
    return `Files/Dossier/${r.label}`;
  }

  function sectionPath(pathway, sectionId, label) {
    const r = ROOTS[pathway] || ROOTS.k510;
    const num = r.numFmt(sectionId);
    // Strip "eSTAR §11 — Performance testing" → "Performance testing"
    let cleanLabel = label || '';
    cleanLabel = cleanLabel.replace(/^eSTAR\s+§?\d+\s*[—-]\s*/i, '');
    cleanLabel = cleanLabel.replace(/^§\d+\s*[—-]\s*/i, '');
    cleanLabel = cleanLabel.replace(/^PMA\s+Module\s+[\d.]+\s*[—-]\s*/i, '');
    return `${rootFor(pathway)}/${num} ${cleanLabel}`;
  }

  /* ─────────────── Seed bodies ─────────────── */

  const K510_SEED_BODIES = {
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

  const PMA_SEED_BODIES = {
    'M27': `# Module 2.7 — Clinical Summary

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

    'M535': `# Module 5.3.5 — Pivotal trial

Full clinical study report for **CV330-PIVOT** (NCT-XXXXXXX). Per ICH E3 structure.

## Primary efficacy
Sensitivity 94.1% (95% CI 91.8–96.0%). Pre-specified ≥ 90%. Met.

## Subgroup analyses
By age band, sex, baseline rhythm, and site. Stratified results attached: \`efficacy-by-arm.csv\`, \`efficacy-by-site.xlsx\`.

## Site-level performance
14 sites enrolled; 1 site (Site 11 — Mercy Hospital) excluded from per-protocol due to GCP findings; sensitivity analysis with Site 11 included shows 93.6% (consistent with primary). Site 14 IRB approval pending — 12 subjects screened but not yet enrolled.`,
  };

  const CER_SEED_BODIES = {
    'S1': `# §1 Scope and device description

The IV-415 Companion Diagnostic is a CE-marked in vitro device intended for the qualitative detection of **biomarker X** in plasma to guide treatment selection for **indication Y**. This Clinical Evaluation Report (CER) is prepared per **MDR Article 61** and MDCG 2020-13.

The CER covers all clinical data sources: clinical investigations, post-market surveillance, scientific literature, and equivalence to predecessor device IV-410.`,

    'S3': `# §3 Clinical data summary

Clinical data sources:

1. **Pivotal investigation IV415-EU-001** (n=312, EU sites) — published Eur J Cancer 2024.
2. **Real-world cohort** — Eudamed registry, n=2,140 patients across 4 EU member states.
3. **Literature** — 23 peer-reviewed publications identified per protocol; 14 included after critical appraisal (CASP).
4. **PMS data** — 2,025 reports through Q1 2026; signal evaluation ongoing for late-stage pacing threshold rise (FR-2241, under review).`,

    'S4': `# §4 Safety and risk-benefit

The risk-benefit profile of the IV-415 remains favorable for the intended indication. Identified risks (false positive, false negative, sample handling) are addressed in labeling and in the GSPR conformity matrix.

PMS signals under review:
- Late-stage pacing threshold rise (LIT-2241, n=6, severity serious).
- Skin irritation at adhesive site (FR-8802, n=28, expected, labeling covers).`,
  };

  /* ─────────────── Seed attachments ─────────────── */

  const K510_SEED_ATTACHMENTS = {
    1: [
      { name: 'form-3601.pdf',                   size: 184320,   kind: 'pdf', who: 'Jordan Chen', when: '2026-04-15T10:14:00Z', source: 'Sources/forms/' },
      { name: 'cover-letter-v3.docx',            size: 24576,    kind: 'doc', who: 'Jordan Chen', when: '2026-04-22T16:42:00Z', source: 'Sources/' },
    ],
    7: [
      { name: 'IFU-final-locked.pdf',            size: 92160,    kind: 'pdf', who: 'Dr. Lee Hartman', when: '2026-04-28T15:44:00Z', source: 'Sources/labeling/' },
    ],
    11: [
      { name: 'BX204-PIVOT-CSR-final.pdf',       size: 14680064, kind: 'pdf', who: 'Marcus Wei',  when: '2026-04-12T11:08:00Z', source: 'Sources/clinical/' },
      { name: 'mard-by-age-band.xlsx',           size: 184320,   kind: 'xls', who: 'Jordan Chen', when: '2026-04-29T10:42:00Z', source: 'Sources/clinical/' },
      { name: 'BENCH-A1B2-raw.csv',              size: 2097152,  kind: 'csv', who: 'Marcus Wei',  when: '2026-04-08T09:18:00Z', source: 'Sources/bench/' },
      { name: 'interferent-summary.pdf',         size: 524288,   kind: 'pdf', who: 'Marcus Wei',  when: '2026-04-09T14:30:00Z', source: 'Sources/bench/' },
      { name: 'consensus-error-grid.png',        size: 314572,   kind: 'img', who: 'Marcus Wei',  when: '2026-04-12T11:14:00Z', source: 'Sources/clinical/' },
    ],
    10: [
      { name: 'bx204-mobile-sbom.json',          size: 81920,    kind: 'code', who: 'Marcus Wei', when: '2026-04-27T16:12:00Z', source: 'Sources/software/' },
      { name: 'threat-model-v3.pdf',             size: 1048576,  kind: 'pdf', who: 'Marcus Wei',  when: '2026-04-25T11:40:00Z', source: 'Sources/software/' },
      { name: 'cybersecurity-test-summary.pdf',  size: 720896,   kind: 'pdf', who: 'Marcus Wei',  when: '2026-04-26T15:22:00Z', source: 'Sources/software/' },
    ],
  };

  const PMA_SEED_ATTACHMENTS = {
    'M27':  [
      { name: 'clinical-summary-v4.docx',        size: 524288,   kind: 'doc', who: 'Sara Okafor', when: '2026-04-29T15:11:00Z', source: 'Sources/clinical/' },
      { name: 'adjudicated-ae-table-v3.xlsx',    size: 245760,   kind: 'xls', who: 'Sara Okafor', when: '2026-04-29T11:02:00Z', source: 'Sources/clinical/' },
    ],
    'M535': [
      { name: 'CV330-PIVOT-CSR-v2.pdf',          size: 24117248, kind: 'pdf', who: 'Sara Okafor', when: '2026-04-22T09:30:00Z', source: 'Sources/clinical/' },
      { name: 'efficacy-by-arm.csv',             size: 86016,    kind: 'csv', who: 'Marcus Wei',  when: '2026-04-29T09:33:00Z', source: 'Sources/clinical/' },
      { name: 'efficacy-by-site.xlsx',           size: 174080,   kind: 'xls', who: 'Marcus Wei',  when: '2026-04-28T13:14:00Z', source: 'Sources/clinical/' },
      { name: 'sap-v2.4.pdf',                    size: 614400,   kind: 'pdf', who: 'Marcus Wei',  when: '2026-03-18T10:00:00Z', source: 'Sources/clinical/' },
    ],
  };

  const CER_SEED_ATTACHMENTS = {
    'S1': [
      { name: 'IV-415-IFU-EU-final.pdf',         size: 102400,   kind: 'pdf', who: 'Sara Okafor', when: '2026-04-19T10:00:00Z', source: 'Sources/labeling/' },
    ],
    'S3': [
      { name: 'literature-search-protocol.pdf',  size: 245760,   kind: 'pdf', who: 'Sara Okafor', when: '2026-03-22T14:18:00Z', source: 'Sources/literature/' },
      { name: 'eudamed-registry-export.csv',     size: 1572864,  kind: 'csv', who: 'Sara Okafor', when: '2026-04-15T09:42:00Z', source: 'Sources/pms/' },
      { name: 'CASP-appraisal-grid.xlsx',        size: 122880,   kind: 'xls', who: 'Sara Okafor', when: '2026-04-12T11:30:00Z', source: 'Sources/literature/' },
    ],
  };

  /* ─────────────── Store ─────────────── */

  // path → { kind: 'file' | 'dir', body?, attachments?, meta?, size?, etc. }
  const fs = new Map();

  // path → set of subscriber callbacks
  const subscribers = new Map();
  // global subs notified on every write
  const globalSubs = new Set();

  // Synthetic audit events created from in-store edits — these get
  // merged with the seed audit trail by the audit pane.
  const liveAuditEvents = [];

  function notify(path) {
    (subscribers.get(path) || []).forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
    globalSubs.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
  }

  function read(path)        { return fs.get(path); }

  function subscribe(path, cb) {
    if (!subscribers.has(path)) subscribers.set(path, new Set());
    subscribers.get(path).add(cb);
    return () => subscribers.get(path)?.delete(cb);
  }
  function subscribeAll(cb) {
    globalSubs.add(cb);
    return () => globalSubs.delete(cb);
  }

  /* ─────────────── Section file API ─────────────── */

  function sectionFolder(pathway, sectionId, label) {
    return sectionPath(pathway, sectionId, label);
  }

  function readSectionBody(pathway, sectionId, label) {
    const folder = sectionFolder(pathway, sectionId, label);
    return fs.get(`${folder}/body.md`)?.body || '';
  }

  function readSectionMeta(pathway, sectionId, label) {
    const folder = sectionFolder(pathway, sectionId, label);
    return fs.get(`${folder}/meta.json`)?.meta || {};
  }

  function readSectionAttachments(pathway, sectionId, label) {
    const folder = sectionFolder(pathway, sectionId, label);
    return fs.get(`${folder}/attachments`)?.files || [];
  }

  function writeSectionBody(pathway, sectionId, label, body, opts = {}) {
    const folder = sectionFolder(pathway, sectionId, label);
    const path = `${folder}/body.md`;
    const prev = fs.get(path);
    fs.set(path, { kind: 'file', body, size: body.length, when: opts.when || new Date().toISOString(), who: opts.who || 'You' });

    // Bump version in meta
    const metaPath = `${folder}/meta.json`;
    const meta = fs.get(metaPath)?.meta || {};
    fs.set(metaPath, {
      kind: 'file',
      meta: { ...meta, version: (meta.version || 0) + 1, lastEdited: opts.when || new Date().toISOString(), lastEditor: opts.who || 'You' },
    });

    // Push synthetic audit event (skipped for seed)
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

  function attachFile(pathway, sectionId, label, file, opts = {}) {
    const folder = sectionFolder(pathway, sectionId, label);
    const path = `${folder}/attachments`;
    const cur = fs.get(path)?.files || [];
    const newFile = {
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

  function liveEventsForPathway(_pathway) {
    // Naive filter — fixtures are pathway-scoped at top level.
    // For now we return all live events; callers know which pathway
    // they subscribed to.
    return [...liveAuditEvents];
  }

  function activityForSection(pathway, sectionId) {
    // Combine seed + live, scoped to this section by target_id
    const seed = (window.PATHWAY_TABS_DATA?.[pathway]?.audit) || [];
    const all = [...liveAuditEvents, ...seed];
    return all.filter((e) => e.target_id === sectionId);
  }

  /* ─────────────── Helpers ─────────────── */

  function approxDiff(prev, next) {
    // crude line-based diff
    const a = prev.split('\n'), b = next.split('\n');
    const setA = new Set(a), setB = new Set(b);
    let add = 0, rem = 0;
    b.forEach((l) => { if (!setA.has(l)) add += l.length; });
    a.forEach((l) => { if (!setB.has(l)) rem += l.length; });
    return `+${Math.max(1, Math.round(add / 8))} / −${Math.max(0, Math.round(rem / 8))}`;
  }

  function fmtSize(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  function guessKind(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return ext === 'csv' ? 'csv' : 'xls';
    if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) return 'img';
    if (['json', 'xml', 'js', 'ts', 'py'].includes(ext)) return 'code';
    return 'file';
  }

  /* ─────────────── Seed ─────────────── */

  function seed() {
    // 510(k) — use K510_ESTAR for the section list, body for hot ones,
    // empty placeholders for the rest so every section has a folder.
    const k510Sections = window.K510_ESTAR || [];
    k510Sections.forEach((s) => {
      const body = K510_SEED_BODIES[s.id] || `# ${s.label}\n\nSection draft pending. Use the editor to start, or open in the full editor for the complete authoring surface.`;
      const meta = {
        sectionId:  s.id,
        label:      s.label,
        status:     s.status || 'draft',
        version:    s.id === 11 ? 14 : s.id === 7 ? 9 : s.id === 1 ? 6 : 1,
        lastEdited: '2026-04-29T10:55:00Z',
        lastEditor: s.id === 11 ? 'Jordan Chen' : 'Jordan Chen',
        signers:    s.id === 7 ? ['Dr. Lee Hartman'] : [],
        blocker:    s.blocker || null,
      };
      writeSectionBody('k510', s.id, s.label, body, { silent: true, who: meta.lastEditor, when: meta.lastEdited });
      const folder = sectionFolder('k510', s.id, s.label);
      fs.set(`${folder}/meta.json`, { kind: 'file', meta });
      fs.set(`${folder}/attachments`, { kind: 'dir', files: K510_SEED_ATTACHMENTS[s.id] || [] });
    });

    // PMA — minimal seed for the modules we care about
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
      }});
      fs.set(`${folder}/attachments`, { kind: 'dir', files: PMA_SEED_ATTACHMENTS[s.id] || [] });
    });

    // CER
    const cerSections = [
      { id: 'S1', label: 'Scope and device description', status: 'complete' },
      { id: 'S2', label: 'State-of-the-art analysis',    status: 'complete' },
      { id: 'S3', label: 'Clinical data summary',        status: 'draft' },
      { id: 'S4', label: 'Safety and risk-benefit',      status: 'review' },
      { id: 'S5', label: 'Post-market surveillance plan', status: 'draft' },
      { id: 'S6', label: 'Conclusion and recommendation', status: 'draft' },
    ];
    cerSections.forEach((s) => {
      const body = CER_SEED_BODIES[s.id] || `# §${s.id} ${s.label}\n\nDraft pending.`;
      writeSectionBody('cer', s.id, s.label, body, { silent: true, who: 'Sara Okafor', when: '2026-04-28T11:40:00Z' });
      const folder = sectionFolder('cer', s.id, s.label);
      fs.set(`${folder}/meta.json`, { kind: 'file', meta: {
        sectionId: s.id, label: s.label, status: s.status,
        version: s.id === 'S1' ? 8 : 4,
        lastEdited: '2026-04-28T11:40:00Z', lastEditor: 'Sara Okafor',
      }});
      fs.set(`${folder}/attachments`, { kind: 'dir', files: CER_SEED_ATTACHMENTS[s.id] || [] });
    });
  }

  /* ─────────────── Public API ─────────────── */

  const DossierStore = {
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
    // raw FS for the Files-tree view
    fs,
    listDir(prefix) {
      const entries = [];
      const seen = new Set();
      fs.forEach((node, path) => {
        if (!path.startsWith(prefix + '/')) return;
        const rest = path.slice(prefix.length + 1);
        const head = rest.split('/')[0];
        if (!seen.has(head)) {
          seen.add(head);
          const fullPath = `${prefix}/${head}`;
          entries.push({ name: head, path: fullPath, isDir: rest.includes('/'), node: fs.get(fullPath) });
        }
      });
      return entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
    },
  };

  // React hook helpers
  function useFileNode(path) {
    const [, force] = (window.React?.useReducer || (() => [0, () => {}]))((x) => x + 1, 0);
    (window.React?.useEffect || (() => {}))(() => subscribe(path, force), [path]);
    return read(path);
  }

  function useSection(pathway, sectionId, label) {
    const [, force] = window.React.useReducer((x) => x + 1, 0);
    window.React.useEffect(() => {
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

  Object.assign(window, { DossierStore, useFileNode, useSection });

  // Seed once data fixtures exist. Try now; if K510_ESTAR isn't ready,
  // wait for next microtask.
  if (window.K510_ESTAR) seed();
  else queueMicrotask(seed);
})();
