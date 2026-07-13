/* ------------------------------------------------------------------ *
 *  editor-data.ts
 *  Main data arrays/objects for the mature document editor (Editor).
 *  Seven regulatory pathways, each a full section tree + seeded
 *  document bodies. Empty sections are intentional -- they invite
 *  AnA generation.
 * ------------------------------------------------------------------ */

import type { Pathway, PathwayId, SurfaceId } from './editor-data-types';

export * from './editor-data-types';
export * from './editor-data-sections';

/* -- Reusable seeded section bodies (internal) ---------------------- */

const _M25 = `
<div class="eb" data-conf="hi" data-prov="Source: Target product profile · TPP v3.2  ·  Maximum engine  ·  confidence 0.94  ·  AUD-7741">
  <h2>2.5.1&nbsp;&nbsp;Product development rationale</h2>
  <p>BX-204 is a humanized IgG1κ monoclonal antibody targeting receptor tyrosine kinase&nbsp;X (RTK-X), developed for advanced or metastatic RTK-X–overexpressing solid tumors. The clinical development program is designed to support accelerated approval under <span class="cite">21 CFR 314.500</span>, with confirmatory evidence to be generated in the post-marketing setting.</p>
  <p>The development rationale rests on three pillars: (i) a validated, IHC-defined biomarker that enriches for responders; (ii) a pivotal single-arm trial benchmarked against a pre-specified, indication-matched historical control; and (iii) a population-pharmacokinetic bridge between the Phase&nbsp;I and pivotal formulations.</p>
</div>
<div class="eb" data-conf="med" data-prov="Source: CSR-201 · pivotal Phase II  ·  Maximum engine  ·  confidence 0.72  ·  AUD-7742">
  <h2>2.5.4&nbsp;&nbsp;Overview of efficacy</h2>
  <p>The confirmed objective response rate (ORR) of <ins>38.6%</ins><del> 41.2%</del> (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from a pooled historical control of 412 patients across five sponsor-independent datasets <span class="cite">CSR-201 §7.1</span>. Median duration of response was 11.4 months (95% CI 9.1–14.8).</p>
  <table class="doctab">
    <thead><tr><th>Endpoint</th><th>Result</th><th>95% CI</th><th>Threshold</th></tr></thead>
    <tbody>
      <tr><td>Confirmed ORR</td><td>38.6%</td><td>31.5–46.0</td><td>&gt; 25%</td></tr>
      <tr><td>Median DoR</td><td>11.4 mo</td><td>9.1–14.8</td><td>—</td></tr>
      <tr><td>Disease control rate</td><td>71.3%</td><td>64.2–77.7</td><td>—</td></tr>
      <tr><td>Median PFS</td><td>6.9 mo</td><td>5.4–8.6</td><td>—</td></tr>
    </tbody>
  </table>
  <div class="claimflag" data-sev="warn">ORR confidence interval cites CSR-201 §7.1 — verify the efficacy table is locked before filing.</div>
</div>
<div class="eb" data-conf="lo" data-prov="Source: Bridging strategy memo  ·  Maximum engine  ·  confidence 0.58  ·  AUD-7743">
  <p>Population-pharmacokinetic analysis <del>establishes</del><ins>is being established to characterize</ins> exposure equivalence between the bridging and pivotal formulations, supporting the efficacy read-across per <span class="cite">FDA 2023 bridging guidance</span>.</p>
  <div class="claimflag" data-sev="err">Bridging claim implies a completed population-PK justification; Module 2.7.2 shows that analysis as "in progress." AnA drafted safer phrasing — see Comments.</div>
</div>
<div class="eb" data-conf="hi" data-prov="Source: Drafted from §2.5.1–2.5.5  ·  Maximum engine  ·  confidence 0.88  ·  AUD-7744">
  <h2>2.5.6&nbsp;&nbsp;Benefit-risk conclusions</h2>
  <p>The magnitude and durability of response, together with a manageable and well-characterized safety profile, support a favorable benefit-risk assessment for BX-204 in the proposed indication in a population with limited therapeutic options. No new safety signals were identified that would alter this assessment; residual risks are addressable through routine pharmacovigilance and labeling.</p>
</div>`;

const _K7 = `
<div class="eb" data-conf="hi" data-prov="Source: Predicate device DEN200051  ·  Maximum engine  ·  confidence 0.91  ·  AUD-5512">
  <h2>7.1&nbsp;&nbsp;Predicate device identification</h2>
  <p>The subject device, the Aurora CGM System, is substantially equivalent to the primary predicate <span class="cite">K221847</span> (Dexsense G6 Continuous Glucose Monitoring System), cleared 14&nbsp;March&nbsp;2023. A reference device <span class="cite">DEN200051</span> is cited for the iCGM special-controls performance criteria.</p>
</div>
<div class="eb" data-conf="med" data-prov="Source: Substantial-equivalence worksheet  ·  Maximum engine  ·  confidence 0.79  ·  AUD-5513">
  <h2>7.2&nbsp;&nbsp;Substantial-equivalence comparison</h2>
  <p>The subject and predicate share the same intended use, fundamental scientific technology, and integrated continuous-glucose-monitoring sensing principle. Differences in sensor wear duration and the calibration algorithm do not raise new questions of safety or effectiveness, as demonstrated by the performance testing in §13.</p>
  <table class="doctab">
    <thead><tr><th>Characteristic</th><th>Subject — Aurora</th><th>Predicate — K221847</th><th>SE</th></tr></thead>
    <tbody>
      <tr><td>Intended use</td><td>CGM, persons ≥ 18 y</td><td>CGM, persons ≥ 18 y</td><td>Same</td></tr>
      <tr><td>Sensor wear</td><td>15 days</td><td>10 days</td><td>Different — see §13</td></tr>
      <tr><td>MARD (overall)</td><td>8.2%</td><td>9.0%</td><td>Equivalent</td></tr>
      <tr><td>Calibration</td><td>Factory</td><td>Factory</td><td>Same</td></tr>
    </tbody>
  </table>
  <div class="claimflag" data-sev="warn">Extended 15-day wear is a technological difference — confirm the §13 accuracy data spans the full wear period, including day 15.</div>
</div>
<div class="eb" data-conf="lo" data-prov="Source: Drafted from SE worksheet  ·  Maximum engine  ·  confidence 0.61  ·  AUD-5514">
  <p>No differences between the subject and predicate devices <del>raise</del><ins>are expected to raise</ins> new questions of safety or effectiveness; substantial equivalence is supported by the combination of design, bench, and clinical performance evidence presented in this submission <span class="cite">21 CFR 807.100(b)</span>.</p>
</div>`;

const _CER4 = `
<div class="eb" data-conf="hi" data-prov="Source: State-of-the-art review · SOTA-7  ·  Maximum engine  ·  confidence 0.90  ·  AUD-3301">
  <h2>4.1&nbsp;&nbsp;State of the art &amp; alternative therapies</h2>
  <p>The current state of the art for transvenous implantable cardiac leads is defined by the applicable harmonised standards and common specifications, including <span class="cite">ISO 5841-2</span> and the relevant sections of <span class="cite">EN 45502-2-1</span>. The clinical benefit and acceptable safety profile of the device category are well established in the peer-reviewed literature.</p>
</div>
<div class="eb" data-conf="med" data-prov="Source: Literature appraisal · 1,284 records  ·  Maximum engine  ·  confidence 0.76  ·  AUD-3302">
  <h2>4.2&nbsp;&nbsp;Clinical background &amp; benchmark devices</h2>
  <p>A systematic literature search identified 1,284 records, of which 47 met the pre-specified appraisal criteria. The adjudicated lead-dislodgement rate across benchmark devices was <ins>1.8%</ins><del> 2.1%</del> at 12&nbsp;months, consistent with the subject device’s post-market surveillance data <span class="cite">PMS-2025-Q1</span>.</p>
  <div class="claimflag" data-sev="warn">EU MDR Annex XIV requires the literature search protocol and appraisal to be appended — confirm Annex A is linked before sign-off.</div>
</div>`;

const _E7 = `
<div class="eb" data-conf="hi" data-prov="Source: SAP v2.1 · primary analysis  ·  Maximum engine  ·  confidence 0.92  ·  AUD-9101">
  <h2>7.1&nbsp;&nbsp;Primary efficacy analysis</h2>
  <p>The primary efficacy endpoint was progression-free survival (PFS) by blinded independent central review in the intention-to-treat population. The analysis was performed per the pre-specified statistical analysis plan <span class="cite">SAP v2.1</span> using a stratified log-rank test.</p>
  <table class="doctab">
    <thead><tr><th>Parameter</th><th>BX-204 (n=214)</th><th>Control (n=212)</th><th>HR (95% CI)</th></tr></thead>
    <tbody>
      <tr><td>Median PFS (mo)</td><td>9.8</td><td>6.1</td><td>0.61 (0.49–0.76)</td></tr>
      <tr><td>12-mo PFS rate</td><td>41.2%</td><td>22.7%</td><td>—</td></tr>
      <tr><td>Stratified log-rank p</td><td colspan="2">&lt; 0.0001</td><td>—</td></tr>
    </tbody>
  </table>
</div>
<div class="eb" data-conf="med" data-prov="Source: CSR-301 tables · §14.2  ·  Maximum engine  ·  confidence 0.78  ·  AUD-9102">
  <h2>7.2&nbsp;&nbsp;Secondary &amp; sensitivity analyses</h2>
  <p>The overall response rate was <ins>48.1%</ins><del> 46.0%</del> in the treatment arm versus 29.7% in the control arm. Sensitivity analyses censoring for subsequent anti-cancer therapy were consistent with the primary result <span class="cite">CSR-301 §14.2</span>.</p>
  <div class="claimflag" data-sev="warn">Overall-survival data are immature (38% events) — present as descriptive only and avoid inferential language until the second interim analysis.</div>
</div>`;

const _P51 = `
<div class="eb" data-conf="hi" data-prov="Source: Final CSR · CSR-CV330-v4.1 §10  ·  Maximum engine  ·  confidence 0.92  ·  AUD-9112">
  <h2>5.1.1&nbsp;&nbsp;Pivotal investigation design</h2>
  <p>The CV-330 Implantable Cardiac Monitor pivotal investigation (<span class="cite">NCT05821491</span>) was a prospective, multi-center, single-arm trial evaluating detection sensitivity for clinically significant arrhythmias at 12 months post-implant. Enrollment occurred at 38 sites across the United States, Germany, and Japan, with 612 subjects implanted between February 2023 and August 2024.</p>
</div>
<div class="eb" data-conf="hi" data-prov="Source: Locked SAP analysis · BIO-CV330-001  ·  Maximum engine  ·  confidence 0.86  ·  AUD-9113">
  <h2>5.1.2&nbsp;&nbsp;Primary endpoint results</h2>
  <p>The primary endpoint was met. Detection sensitivity for clinically significant arrhythmias at 12 months was <ins>94.7%</ins><del> 93.9%</del> (95% CI 92.3–96.5%), exceeding the pre-specified performance goal of 90% (lower bound &gt; 85%) <span class="cite">BIO-CV330-001 §6.2</span>.</p>
  <table class="doctab">
    <thead><tr><th>Outcome</th><th>CV-330 (n=612)</th><th>95% CI</th><th>Performance goal</th></tr></thead>
    <tbody>
      <tr><td>Detection sensitivity (primary)</td><td>94.7%</td><td>92.3–96.5%</td><td>≥ 90%</td></tr>
      <tr><td>False-positive rate</td><td>2.4%</td><td>1.8–3.2%</td><td>≤ 5%</td></tr>
      <tr><td>Device-related SAE freedom · 12 mo</td><td>97.1%</td><td>95.4–98.3%</td><td>≥ 92%</td></tr>
    </tbody>
  </table>
  <div class="claimflag" data-sev="err">Subgroup claim implies a pre-specified analysis; SAP v3.0 lists this as exploratory only. Reword or withdraw before filing.</div>
</div>`;

const _IVD6 = `
<div class="eb" data-conf="hi" data-prov="Source: Clinical performance study CPR-014  ·  Maximum engine  ·  confidence 0.88  ·  AUD-9106">
  <h2>2.3.1&nbsp;&nbsp;Clinical performance — study design</h2>
  <p>Clinical performance of the DxAssay RT-PCR was established in a multi-site method-comparison study against the reference clinical-trial assay, enrolling 1,042 specimens across three sites. Agreement was evaluated as positive and negative percent agreement with the composite reference standard, per <span class="cite">IVDR Annex XIII Part A</span>.</p>
</div>
<div class="eb" data-conf="med" data-prov="Source: CPR-014 §6 (2×2 agreement)  ·  Maximum engine  ·  confidence 0.79  ·  AUD-9107">
  <h2>2.3.2&nbsp;&nbsp;Clinical agreement (2×2)</h2>
  <p>The assay demonstrated a sensitivity of 96.4% and specificity of 97.1% against the reference standard, supporting the intended companion-diagnostic claim for selvotinib eligibility.</p>
  <table class="doctab">
    <thead><tr><th>Metric</th><th>Result</th><th>95% CI</th></tr></thead>
    <tbody>
      <tr><td>Sensitivity (PPA)</td><td>96.4%</td><td>94.1–97.9</td></tr>
      <tr><td>Specificity (NPA)</td><td>97.1%</td><td>95.2–98.3</td></tr>
      <tr><td>PPV</td><td>94.2%</td><td>91.5–96.1</td></tr>
      <tr><td>NPV</td><td>98.0%</td><td>96.5–98.9</td></tr>
      <tr><td>AUC</td><td>0.96</td><td>0.94–0.98</td></tr>
    </tbody>
  </table>
  <div class="claimflag" data-sev="warn">Cross-reactivity panel still pending — analytical performance (§2.1) must close before clinical performance is locked.</div>
</div>`;

/* -- Pathways ------------------------------------------------------- */

export const REG_PATHWAYS: Record<PathwayId, Pathway> = {
  ctd: {
    id: 'ctd', kind: 'CTD · eCTD', program: 'NDA 212345 — oncology biologic', code: 'eCTD', ta: 'onc',
    owner: 'A. Müller', dueline: 'FDA filing · Q3 2026', readiness: 71, active: 'm25',
    tree: [
      { vol: 'Module 1 — Administrative & prescribing', items: [
        { id: 'm111', num: '1.1', label: 'Forms (FDA 356h / 1571 / 3674)', status: 'complete', conf: 0.99, words: 120 },
        { id: 'm12', num: '1.2', label: 'Cover letter', status: 'complete', conf: 0.97, words: 340 },
        { id: 'm132', num: '1.3.1', label: 'Administrative information', status: 'review', conf: 0.84, words: 610 },
        { id: 'm134', num: '1.3.4', label: 'Financial certification (3454/3455)', status: 'review', conf: 0.80, words: 240 },
        { id: 'm1141', num: '1.14.1', label: 'Draft labeling / package insert', status: 'draft', conf: 0.62, words: 0 },
        { id: 'm1143', num: '1.14.3', label: 'Prescribing information (USPI)', status: 'draft', conf: 0.55, words: 0 },
      ] },
      { vol: 'Module 2 — CTD summaries', items: [
        { id: 'm21', num: '2.1', label: 'CTD table of contents', status: 'complete', conf: 0.99, words: 90 },
        { id: 'm22', num: '2.2', label: 'Introduction', status: 'review', conf: 0.81, words: 420 },
        { id: 'm23', num: '2.3', label: 'Quality overall summary', status: 'review', conf: 0.78, words: 2400 },
        { id: 'm24', num: '2.4', label: 'Nonclinical overview', status: 'complete', conf: 0.93, words: 3100 },
        { id: 'm25', num: '2.5', label: 'Clinical overview', status: 'draft', conf: 0.74, words: 1860, blocker: true },
        { id: 'm26', num: '2.6', label: 'Nonclinical written & tabulated summaries', status: 'draft', conf: 0.55, words: 0 },
        { id: 'm271', num: '2.7.1', label: 'Summary of biopharmaceutic studies', status: 'draft', conf: 0.58, words: 0 },
        { id: 'm272', num: '2.7.2', label: 'Summary of clinical pharmacology', status: 'draft', conf: 0.60, words: 0 },
        { id: 'm273', num: '2.7.3', label: 'Summary of clinical efficacy', status: 'draft', conf: 0.57, words: 0 },
        { id: 'm274', num: '2.7.4', label: 'Summary of clinical safety', status: 'draft', conf: 0.54, words: 0 },
      ] },
      { vol: 'Module 3 — Quality (CMC)', items: [
        { id: 'm32s1', num: '3.2.S.1', label: 'Drug substance — general information', status: 'complete', conf: 0.94, words: 680 },
        { id: 'm32s2', num: '3.2.S.2', label: 'Drug substance — manufacture', status: 'review', conf: 0.86, words: 5200 },
        { id: 'm32s3', num: '3.2.S.3', label: 'Characterisation', status: 'review', conf: 0.83, words: 2100 },
        { id: 'm32s4', num: '3.2.S.4', label: 'Control of drug substance', status: 'review', conf: 0.85, words: 1900 },
        { id: 'm32s7', num: '3.2.S.7', label: 'Stability — drug substance', status: 'draft', conf: 0.66, words: 0 },
        { id: 'm32p1', num: '3.2.P.1', label: 'Drug product — description & composition', status: 'review', conf: 0.80, words: 540 },
        { id: 'm32p3', num: '3.2.P.3', label: 'Drug product — manufacture', status: 'draft', conf: 0.64, words: 3100 },
        { id: 'm32p5', num: '3.2.P.5', label: 'Control of drug product', status: 'draft', conf: 0.60, words: 0 },
        { id: 'm32p8', num: '3.2.P.8', label: 'Stability — drug product', status: 'draft', conf: 0.58, words: 0 },
        { id: 'm32a', num: '3.2.A', label: 'Appendices (facilities, adventitious agents)', status: 'draft', conf: 0.50, words: 0 },
        { id: 'm32r', num: '3.2.R', label: 'Regional information', status: 'draft', conf: 0.40, words: 0 },
      ] },
      { vol: 'Module 4 — Nonclinical study reports', items: [
        { id: 'm421', num: '4.2.1', label: 'Pharmacology reports', status: 'complete', conf: 0.95, words: 7400 },
        { id: 'm422', num: '4.2.2', label: 'Pharmacokinetics reports', status: 'complete', conf: 0.92, words: 3600 },
        { id: 'm423', num: '4.2.3', label: 'Toxicology reports', status: 'complete', conf: 0.94, words: 8800 },
      ] },
      { vol: 'Module 5 — Clinical study reports', items: [
        { id: 'm52', num: '5.2', label: 'Tabular listing of all clinical studies', status: 'complete', conf: 0.97, words: 320 },
        { id: 'm531', num: '5.3.1', label: 'Biopharmaceutic study reports', status: 'complete', conf: 0.92, words: 4100 },
        { id: 'm533', num: '5.3.3', label: 'Human PK study reports', status: 'review', conf: 0.81, words: 5200 },
        { id: 'm535', num: '5.3.5', label: 'Efficacy & safety study reports', status: 'review', conf: 0.83, words: 12600 },
        { id: 'm54', num: '5.4', label: 'Literature references', status: 'draft', conf: 0.60, words: 0 },
      ] },
    ],
  },
  estar: {
    id: 'estar', kind: '510(k) · eSTAR', program: 'Aurora CGM System — Traditional 510(k)', code: 'K-pending', ta: 'dx',
    owner: 'J. Chen', dueline: 'CDRH submission · Aug 2026', readiness: 64, active: 'k7',
    tree: [
      { vol: 'Administrative (§01–06)', items: [
        { id: 'k1', num: '§01', label: 'Medical Device User Fee cover sheet', status: 'complete', conf: 0.99, words: 180 },
        { id: 'k2', num: '§02', label: 'CDRH premarket review cover sheet', status: 'complete', conf: 0.98, words: 140 },
        { id: 'k3', num: '§03', label: 'Truthful & accuracy statement', status: 'complete', conf: 0.99, words: 60 },
        { id: 'k4', num: '§04', label: 'Class & device information / classification', status: 'complete', conf: 0.97, words: 180 },
        { id: 'k5', num: '§05', label: 'Indications for use (FDA 3881)', status: 'complete', conf: 0.94, words: 210 },
        { id: 'k6', num: '§06', label: '510(k) summary or statement', status: 'review', conf: 0.82, words: 760 },
      ] },
      { vol: 'Device description (§07–09)', items: [
        { id: 'k7', num: '§07', label: 'Predicate & substantial equivalence', status: 'draft', conf: 0.74, words: 1420, blocker: true },
        { id: 'k8', num: '§08', label: 'Device description', status: 'review', conf: 0.85, words: 1240 },
        { id: 'k9', num: '§09', label: 'Proposed labeling & IFU', status: 'draft', conf: 0.60, words: 0 },
      ] },
      { vol: 'Performance data (§10–16)', items: [
        { id: 'k10', num: '§10', label: 'Sterilization & shelf life', status: 'draft', conf: 0.52, words: 0 },
        { id: 'k11', num: '§11', label: 'Biocompatibility', status: 'review', conf: 0.82, words: 980 },
        { id: 'k12', num: '§12', label: 'Software / firmware documentation', status: 'draft', conf: 0.58, words: 0 },
        { id: 'k13', num: '§13', label: 'EMC, wireless & electrical safety', status: 'draft', conf: 0.55, words: 0 },
        { id: 'k14', num: '§14', label: 'Performance testing — bench', status: 'review', conf: 0.80, words: 3200 },
        { id: 'k15', num: '§15', label: 'Performance testing — animal', status: 'draft', conf: 0.50, words: 0 },
        { id: 'k16', num: '§16', label: 'Performance testing — clinical', status: 'draft', conf: 0.61, words: 0 },
      ] },
      { vol: 'Cybersecurity & closing (§17–20)', items: [
        { id: 'k17', num: '§17', label: 'Cybersecurity / interoperability', status: 'draft', conf: 0.49, words: 0 },
        { id: 'k18', num: '§18', label: 'Administrative documentation', status: 'review', conf: 0.86, words: 420 },
        { id: 'k19', num: '§19', label: 'Financial disclosure', status: 'complete', conf: 0.95, words: 160 },
        { id: 'k20', num: '§20', label: 'References', status: 'complete', conf: 0.93, words: 720 },
      ] },
    ],
  },
  pma: {
    id: 'pma', kind: 'PMA · 21 CFR 814', program: 'CV-330 Implantable Cardiac Monitor — PMA', code: 'P-pending', ta: 'cv',
    owner: 'J. Adeyemi', dueline: 'PMA filing · Q2 2026', readiness: 61, active: 'p51',
    tree: [
      { vol: 'Module 1 — Administrative', items: [
        { id: 'p11', num: '1.1', label: 'Cover letter', status: 'complete', conf: 0.98, words: 280 },
        { id: 'p12', num: '1.2', label: 'Table of contents', status: 'complete', conf: 0.99, words: 120 },
        { id: 'p13', num: '1.3', label: 'Indications for use', status: 'complete', conf: 0.96, words: 210 },
        { id: 'p14', num: '1.4', label: 'Device description', status: 'review', conf: 0.84, words: 1640 },
        { id: 'p15', num: '1.5', label: 'Alternative practices & procedures', status: 'draft', conf: 0.58, words: 0 },
      ] },
      { vol: 'Module 2 — Summary of safety & effectiveness', items: [
        { id: 'p21', num: '2.1', label: 'Summary of safety & effectiveness (SSED)', status: 'draft', conf: 0.66, words: 4810 },
        { id: 'p22', num: '2.2', label: 'Risk analysis (ISO 14971)', status: 'review', conf: 0.81, words: 1900 },
        { id: 'p23', num: '2.3', label: 'Benefit-risk determination', status: 'draft', conf: 0.60, words: 0 },
      ] },
      { vol: 'Module 3 — Manufacturing', items: [
        { id: 'p31', num: '3.1', label: 'Manufacturing site information', status: 'complete', conf: 0.93, words: 520 },
        { id: 'p32', num: '3.2', label: 'Quality system (QSR) summary', status: 'review', conf: 0.78, words: 1400, blocker: true },
        { id: 'p33', num: '3.3', label: 'Sterilization validation', status: 'complete', conf: 0.94, words: 880 },
        { id: 'p34', num: '3.4', label: 'Packaging & labeling', status: 'draft', conf: 0.56, words: 0 },
      ] },
      { vol: 'Module 4 — Non-clinical', items: [
        { id: 'p41', num: '4.1', label: 'Bench performance testing', status: 'complete', conf: 0.95, words: 3200 },
        { id: 'p42', num: '4.2', label: 'Animal studies', status: 'complete', conf: 0.92, words: 2100 },
        { id: 'p43', num: '4.3', label: 'Biocompatibility', status: 'complete', conf: 0.93, words: 1600 },
        { id: 'p44', num: '4.4', label: 'Software verification & validation', status: 'review', conf: 0.80, words: 1200 },
        { id: 'p45', num: '4.5', label: 'Electromagnetic compatibility', status: 'complete', conf: 0.94, words: 760 },
      ] },
      { vol: 'Module 5 — Clinical', items: [
        { id: 'p51', num: '5.1', label: 'Clinical investigation summary', status: 'draft', conf: 0.72, words: 6230, blocker: true },
        { id: 'p52', num: '5.2', label: 'Clinical data — primary endpoint', status: 'draft', conf: 0.64, words: 0 },
        { id: 'p53', num: '5.3', label: 'Adverse events & SAEs', status: 'review', conf: 0.79, words: 1800 },
        { id: 'p54', num: '5.4', label: 'Statistical analysis plan', status: 'complete', conf: 0.93, words: 2400 },
        { id: 'p55', num: '5.5', label: 'Conclusions', status: 'draft', conf: 0.50, words: 0 },
      ] },
      { vol: 'Module 6 — Post-approval', items: [
        { id: 'p61', num: '6.1', label: 'Post-approval study plan', status: 'draft', conf: 0.52, words: 0 },
        { id: 'p62', num: '6.2', label: 'Post-market surveillance', status: 'draft', conf: 0.48, words: 0 },
        { id: 'p63', num: '6.3', label: 'Tracking & reporting', status: 'draft', conf: 0.44, words: 0 },
      ] },
    ],
  },
  cer: {
    id: 'cer', kind: 'CER · EU MDR Annex XIV', program: 'Meridian Pacing Lead — Clinical Evaluation Report', code: 'CER-2026', ta: 'cv',
    owner: 'L. Hartman', dueline: 'NB submission · Jul 2026', readiness: 58, active: 'cer4',
    tree: [
      { vol: 'Front matter', items: [
        { id: 'cerA', num: 'A', label: 'Scope of the clinical evaluation', status: 'complete', conf: 0.95, words: 520 },
        { id: 'cer1', num: '1', label: 'General details & device identification', status: 'complete', conf: 0.97, words: 340 },
      ] },
      { vol: 'Device & claims', items: [
        { id: 'cer2', num: '2', label: 'Device description & specification', status: 'review', conf: 0.86, words: 1180 },
        { id: 'cer3', num: '3', label: 'Intended purpose & claims', status: 'review', conf: 0.83, words: 740 },
        { id: 'cer4', num: '4', label: 'State of the art', status: 'draft', conf: 0.78, words: 1320, blocker: true },
      ] },
      { vol: 'Clinical evidence', items: [
        { id: 'cer5', num: '5', label: 'Clinical evaluation plan', status: 'draft', conf: 0.60, words: 0 },
        { id: 'cer6', num: '6', label: 'Literature search & appraisal', status: 'draft', conf: 0.57, words: 0 },
        { id: 'cer7', num: '7', label: 'Clinical investigation data', status: 'draft', conf: 0.54, words: 0 },
        { id: 'cer8', num: '8', label: 'PMS & PMCF data', status: 'draft', conf: 0.50, words: 0 },
      ] },
      { vol: 'Conclusion', items: [
        { id: 'cer9', num: '9', label: 'Benefit-risk & GSPR conformity', status: 'draft', conf: 0.46, words: 0 },
        { id: 'cer10', num: '10', label: 'Conclusions', status: 'draft', conf: 0.42, words: 0 },
      ] },
    ],
  },
  csr: {
    id: 'csr', kind: 'CSR · ICH E3', program: 'Study BX-204-301 — Phase III Clinical Study Report', code: 'CSR-301', ta: 'onc',
    owner: 'S. Okafor', dueline: 'Module 5.3.5 lock · Sep 2026', readiness: 62, active: 'e7',
    tree: [
      { vol: 'Front matter', items: [
        { id: 'e0', num: '—', label: 'Synopsis', status: 'review', conf: 0.84, words: 1100 },
        { id: 'e1', num: '1', label: 'Ethics', status: 'complete', conf: 0.96, words: 240 },
        { id: 'e2', num: '2', label: 'Investigators & study administration', status: 'complete', conf: 0.95, words: 380 },
      ] },
      { vol: 'Introduction & design', items: [
        { id: 'e3', num: '3', label: 'Introduction', status: 'complete', conf: 0.93, words: 520 },
        { id: 'e4', num: '4', label: 'Study objectives', status: 'complete', conf: 0.97, words: 210 },
        { id: 'e5', num: '5', label: 'Investigational plan', status: 'review', conf: 0.85, words: 2400 },
      ] },
      { vol: 'Results', items: [
        { id: 'e6', num: '6', label: 'Study patients & disposition', status: 'review', conf: 0.82, words: 1340 },
        { id: 'e7', num: '7', label: 'Efficacy evaluation', status: 'draft', conf: 0.76, words: 1860, blocker: true },
        { id: 'e8', num: '8', label: 'Safety evaluation', status: 'draft', conf: 0.58, words: 0 },
      ] },
      { vol: 'Conclusions', items: [
        { id: 'e9', num: '9', label: 'Discussion & overall conclusions', status: 'draft', conf: 0.50, words: 0 },
        { id: 'e16', num: '16', label: 'Appendices (tables, listings)', status: 'draft', conf: 0.44, words: 0 },
      ] },
    ],
  },
  ivdr: {
    id: 'ivdr', kind: 'IVDR · EU 2017/746', program: 'DxAssay RT-PCR — IVDR Technical Documentation', code: 'IVDR-2026', ta: 'dx',
    owner: 'R. Okonkwo', dueline: 'NB + EU reference lab · Q4 2026', readiness: 54, active: 'iv6',
    tree: [
      { vol: 'Device & classification (Annex II.1)', items: [
        { id: 'iv1', num: '1.1', label: 'Device description & intended purpose', status: 'complete', conf: 0.95, words: 840 },
        { id: 'iv2', num: '1.2', label: 'Classification (Annex VIII)', status: 'complete', conf: 0.96, words: 420 },
        { id: 'iv3', num: '1.3', label: 'Information supplied by manufacturer (IFU/label)', status: 'review', conf: 0.82, words: 610 },
      ] },
      { vol: 'Performance evidence (Annex XIII)', items: [
        { id: 'iv4', num: '2.1', label: 'Analytical performance', status: 'review', conf: 0.80, words: 1480, blocker: true },
        { id: 'iv5', num: '2.2', label: 'Scientific validity', status: 'draft', conf: 0.62, words: 0 },
        { id: 'iv6', num: '2.3', label: 'Clinical performance', status: 'draft', conf: 0.66, words: 1120, blocker: true },
        { id: 'iv7', num: '2.4', label: 'Performance evaluation report (PER)', status: 'draft', conf: 0.50, words: 0 },
      ] },
      { vol: 'Conformity & companion Dx', items: [
        { id: 'iv8', num: '3.1', label: 'GSPR conformity (Annex I)', status: 'draft', conf: 0.58, words: 0 },
        { id: 'iv9', num: '3.2', label: 'Companion-diagnostic linkage', status: 'draft', conf: 0.55, words: 0 },
        { id: 'iv10', num: '3.3', label: 'Risk management (ISO 14971)', status: 'review', conf: 0.78, words: 900 },
      ] },
      { vol: 'Post-market (Annex III)', items: [
        { id: 'iv11', num: '4.1', label: 'PMS plan', status: 'draft', conf: 0.50, words: 0 },
        { id: 'iv12', num: '4.2', label: 'PMPF plan', status: 'draft', conf: 0.44, words: 0 },
      ] },
    ],
  },
  protocol: {
    id: 'protocol', kind: 'Clinical Protocol · ICH E6(R3)', program: 'Study BX-204-301 — Phase III Oncology', code: 'PROT-301', ta: 'onc',
    owner: 'S. Okafor', dueline: 'IRB submission · Jul 2026', readiness: 54, active: 'pr3',
    tree: [
      { vol: 'Front Matter', items: [
        { id: 'pr1', num: '1', label: 'Title page & protocol identifier', status: 'complete', conf: 0.98, words: 280 },
        { id: 'pr2', num: '2', label: 'Synopsis', status: 'review', conf: 0.82, words: 960 },
        { id: 'pr3', num: '3', label: 'Table of contents', status: 'complete', conf: 0.99, words: 120 },
      ] },
      { vol: 'Background & Rationale', items: [
        { id: 'pr4', num: '4', label: 'Background & scientific rationale', status: 'review', conf: 0.79, words: 1840 },
        { id: 'pr5', num: '5', label: 'Unmet medical need', status: 'draft', conf: 0.71, words: 640 },
      ] },
      { vol: 'Objectives & Endpoints', items: [
        { id: 'pr6', num: '6', label: 'Primary objective & endpoint', status: 'complete', conf: 0.94, words: 380 },
        { id: 'pr7', num: '7', label: 'Secondary objectives & endpoints', status: 'review', conf: 0.81, words: 520 },
        { id: 'pr8', num: '8', label: 'Exploratory endpoints', status: 'draft', conf: 0.68, words: 260 },
      ] },
      { vol: 'Study Design', items: [
        { id: 'pr9', num: '9', label: 'Overall study design', status: 'review', conf: 0.84, words: 720 },
        { id: 'pr10', num: '10', label: 'Randomisation & blinding', status: 'draft', conf: 0.72, words: 480 },
        { id: 'pr11', num: '11', label: 'Study duration & visits', status: 'draft', conf: 0.65, words: 340 },
      ] },
      { vol: 'Eligibility', items: [
        { id: 'pr12', num: '12', label: 'Inclusion criteria', status: 'complete', conf: 0.95, words: 560 },
        { id: 'pr13', num: '13', label: 'Exclusion criteria', status: 'complete', conf: 0.93, words: 490 },
        { id: 'pr14', num: '14', label: 'Withdrawal criteria', status: 'review', conf: 0.78, words: 310 },
      ] },
      { vol: 'Investigational Product', items: [
        { id: 'pr15', num: '15', label: 'Description & formulation', status: 'complete', conf: 0.97, words: 420 },
        { id: 'pr16', num: '16', label: 'Dosing, administration & dose modifications', status: 'review', conf: 0.83, words: 680 },
        { id: 'pr17', num: '17', label: 'Concomitant medications', status: 'draft', conf: 0.69, words: 290 },
      ] },
      { vol: 'Assessments', items: [
        { id: 'pr18', num: '18', label: 'Schedule of assessments', status: 'review', conf: 0.77, words: 820 },
        { id: 'pr19', num: '19', label: 'Efficacy assessments', status: 'draft', conf: 0.66, words: 540 },
        { id: 'pr20', num: '20', label: 'Safety assessments & AE reporting', status: 'review', conf: 0.80, words: 760 },
        { id: 'pr21', num: '21', label: 'Pharmacokinetics & biomarkers', status: 'draft', conf: 0.62, words: 380 },
      ] },
      { vol: 'Statistical Considerations', items: [
        { id: 'pr22', num: '22', label: 'Statistical analysis plan summary', status: 'draft', conf: 0.70, words: 920 },
        { id: 'pr23', num: '23', label: 'Sample size justification', status: 'review', conf: 0.85, words: 340 },
        { id: 'pr24', num: '24', label: 'Interim analyses & stopping rules', status: 'draft', conf: 0.64, words: 280 },
      ] },
      { vol: 'Ethics & Regulatory', items: [
        { id: 'pr25', num: '25', label: 'Ethics committee / IRB review', status: 'complete', conf: 0.96, words: 260 },
        { id: 'pr26', num: '26', label: 'Informed consent process', status: 'complete', conf: 0.94, words: 440 },
        { id: 'pr27', num: '27', label: 'Regulatory compliance (ICH E6, 21 CFR 312)', status: 'review', conf: 0.86, words: 320 },
        { id: 'pr28', num: '28', label: 'Data privacy & GDPR', status: 'draft', conf: 0.68, words: 210 },
      ] },
      { vol: 'References & Appendices', items: [
        { id: 'pr29', num: '29', label: 'References', status: 'draft', conf: 0.75, words: 1200 },
        { id: 'pr30', num: '30', label: 'Appendix A — Protocol amendments log', status: 'draft', conf: 0.60, words: 180 },
        { id: 'pr31', num: '31', label: 'Appendix B — Schedule of assessments (detailed)', status: 'draft', conf: 0.58, words: 420 },
      ] },
    ],
    content: {
      pr3: '<div class="eb" data-conf="hi">This protocol (PROT-301) for Study BX-204-301 follows the ICH E6(R3) guideline for Good Clinical Practice. All sections are cross-referenced to the current approved IND (IND 125847) and the Statistical Analysis Plan (SAP-301 v2.0).</div>',
      pr6: '<div class="eb" data-conf="hi"><b>Primary objective:</b> To evaluate the efficacy of BX-204 plus standard-of-care (SOC) versus placebo plus SOC in patients with relapsed/refractory AML as measured by complete remission (CR) rate at Week 24.</div><div class="eb" data-conf="hi"><b>Primary endpoint:</b> Complete remission (CR) rate defined per 2022 ELN response criteria at Week 24, assessed by independent central review.</div>',
      pr12: '<div class="eb" data-conf="hi">1. Age ≥18 years at the time of informed consent.<br>2. Confirmed diagnosis of AML per WHO 2022 classification.<br>3. Relapsed or refractory after ≥1 prior line of therapy.<br>4. ECOG performance status 0–2.<br>5. Adequate hepatic function: total bilirubin ≤1.5× ULN; AST/ALT ≤3× ULN.<br>6. Adequate renal function: eGFR ≥45 mL/min/1.73m².<br>7. Able to provide written informed consent.</div>',
      pr25: '<div class="eb" data-conf="hi">This protocol and all amendments will be submitted to the institutional review board (IRB) or independent ethics committee (IEC) for review and approval prior to initiation of any study procedures. All applicable local regulatory requirements will be followed. Study conduct will be in accordance with the Declaration of Helsinki, ICH E6(R3), and 21 CFR Parts 50, 56, and 312.</div>',
    },
  },
};

/* -- Surface-to-pathway routing ------------------------------------- */

export const REG_SURFACE_PATHWAY: Record<SurfaceId, PathwayId> = {
  'document-authoring': 'ctd',
  'protocol-dev': 'protocol',
  'device-submission': 'estar',
  'device-workstream': 'estar',
  'device-510k': 'estar',
  'device-cer': 'cer',
  'device-diagnostics': 'ivdr',
  'ectd-coauthor': 'ctd',
  'csr-workflow': 'csr',
};

/* -- Seeded document bodies (sectionId -> html) --------------------- */

export const REG_DOC: Record<string, string> = {
  m25: _M25,
  k7: _K7,
  cer4: _CER4,
  e7: _E7,
  p51: _P51,
  iv6: _IVD6,
};

/* -- Per-section AnA generation drafts ------------------------------ */

export const REG_GEN: Record<string, string> = {
  m25: '2.5.5 — Overview of safety. The safety profile of BX-204 was characterized across 318 patients in the pooled clinical dataset. The most frequent treatment-related adverse events were fatigue (32%), rash (24%), and infusion-related reactions (11%), the majority Grade 1–2 and managed with standard supportive care. Grade ≥3 treatment-related events occurred in 14% of patients; no treatment-related deaths were reported. The observed events are consistent with the known pharmacology of the antibody class and are addressable through routine pharmacovigilance and labeling.',
  k7: '7.3 — Conclusion on substantial equivalence. Taken together, the identical intended use, shared sensing technology, and equivalent analytical and clinical accuracy demonstrate that the Aurora CGM System is as safe and effective as the predicate K221847. The extended 15-day wear duration is supported by accuracy data spanning the full wear period (§13.4), and does not raise new questions of safety or effectiveness. Substantial equivalence is therefore established.',
  cer4: '4.3 — Acceptability of the benefit-risk profile in light of the state of the art. The benefit-risk profile of the subject device is consistent with, and not inferior to, the established state of the art for transvenous pacing leads. The adjudicated complication rates fall within the ranges reported for benchmark devices in the appraised literature, and the residual risks are acceptable when weighed against the demonstrated clinical benefit, in accordance with GSPR 1 and 8 of EU MDR Annex I.',
  e7: '7.3 — Subgroup analyses of the primary endpoint. Treatment effect on progression-free survival was consistent across pre-specified subgroups, including age (< 65 vs ≥ 65 years), ECOG performance status (0 vs 1), and baseline biomarker expression (high vs low). No subgroup showed a hazard ratio crossing 1.0, and tests for treatment-by-subgroup interaction were non-significant. The consistency of effect across clinically relevant subgroups supports the generalizability of the primary efficacy finding to the intended-use population.',
  p51: '5.1.3 — Adverse events. A total of 47 device- or procedure-related adverse events were reported across 612 subjects (7.7%). Of these, 18 were serious (2.9%), most commonly implant-site infection (n=9) and lead dislodgement (n=5). Independent adjudication determined one death was possibly device-related and 17 were unrelated. The adverse-event spectrum is consistent with the implantable cardiac monitor device class and is manageable through standard implant practice; all adjudication results are tabulated in §5.3.',
  iv6: '2.3.3 — Conclusion on clinical performance. The clinical performance data demonstrate that the DxAssay RT-PCR reliably identifies patients with the RTK-X activating mutation, with sensitivity and specificity exceeding the pre-specified ≥95% acceptance thresholds. The agreement with the reference standard supports the scientific validity of the analyte–condition association and the intended companion-diagnostic claim, in accordance with IVDR Annex XIII.',
  iv4: '2.1 — Analytical performance summary. The DxAssay RT-PCR achieved a limit of detection of 120 copies/mL with linearity across six logs (R²=0.997) and total precision of 3.8% CV across three sites, three lots and three operators. Interference and cross-reactivity testing against the common-organism panel is in progress; results will be incorporated before the performance evaluation report is finalized per IVDR Annex I §9.1.',
  _default: 'Drafted section. AnA has assembled this content from the linked section evidence and the program\'s controlled vocabulary. Review the claims against the cited sources before promoting this draft to a governed version.',
};
