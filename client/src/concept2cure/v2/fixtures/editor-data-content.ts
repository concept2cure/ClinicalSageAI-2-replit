/* ------------------------------------------------------------------ *
 *  editor-data-content.ts
 *  Seeded document bodies (HTML markup), AnA generation drafts,
 *  and their localized variants for the document editor.
 *
 *  Document body markup convention (rendered into the contentEditable page):
 *    <div class="eb" data-conf="hi|med|lo" data-prov="...">  confidence gutter + hover provenance
 *    <span class="cite">REF</span>                           citation chip
 *    <ins>...</ins> / <del>...</del>                          tracked changes
 *    <div class="claimflag" data-sev="warn|err">              claim-evidence flag
 *    <table class="doctab">                                   data table
 * ------------------------------------------------------------------ */

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
  <p>A systematic literature search identified 1,284 records, of which 47 met the pre-specified appraisal criteria. The adjudicated lead-dislodgement rate across benchmark devices was <ins>1.8%</ins><del> 2.1%</del> at 12&nbsp;months, consistent with the subject device's post-market surveillance data <span class="cite">PMS-2025-Q1</span>.</p>
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

/* IVD clinical-performance seeded body (IVDR Annex XIII) */
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

/* -- Seeded document bodies (sectionId to html) --------------------- */

export const REG_DOC: Readonly<Record<string, string>> = {
  m25: _M25,
  k7: _K7,
  cer4: _CER4,
  e7: _E7,
  p51: _P51,
  iv6: _IVD6,
};

/* -- Per-section AnA generation drafts (streamed into the canvas) --- */

export const REG_GEN: Readonly<Record<string, string>> = {
  m25: '2.5.5 — Overview of safety. The safety profile of BX-204 was characterized across 318 patients in the pooled clinical dataset. The most frequent treatment-related adverse events were fatigue (32%), rash (24%), and infusion-related reactions (11%), the majority Grade 1–2 and managed with standard supportive care. Grade ≥3 treatment-related events occurred in 14% of patients; no treatment-related deaths were reported. The observed events are consistent with the known pharmacology of the antibody class and are addressable through routine pharmacovigilance and labeling.',
  k7: '7.3 — Conclusion on substantial equivalence. Taken together, the identical intended use, shared sensing technology, and equivalent analytical and clinical accuracy demonstrate that the Aurora CGM System is as safe and effective as the predicate K221847. The extended 15-day wear duration is supported by accuracy data spanning the full wear period (§13.4), and does not raise new questions of safety or effectiveness. Substantial equivalence is therefore established.',
  cer4: '4.3 — Acceptability of the benefit-risk profile in light of the state of the art. The benefit-risk profile of the subject device is consistent with, and not inferior to, the established state of the art for transvenous pacing leads. The adjudicated complication rates fall within the ranges reported for benchmark devices in the appraised literature, and the residual risks are acceptable when weighed against the demonstrated clinical benefit, in accordance with GSPR 1 and 8 of EU MDR Annex I.',
  e7: '7.3 — Subgroup analyses of the primary endpoint. Treatment effect on progression-free survival was consistent across pre-specified subgroups, including age (< 65 vs ≥ 65 years), ECOG performance status (0 vs 1), and baseline biomarker expression (high vs low). No subgroup showed a hazard ratio crossing 1.0, and tests for treatment-by-subgroup interaction were non-significant. The consistency of effect across clinically relevant subgroups supports the generalizability of the primary efficacy finding to the intended-use population.',
  p51: '5.1.3 — Adverse events. A total of 47 device- or procedure-related adverse events were reported across 612 subjects (7.7%). Of these, 18 were serious (2.9%), most commonly implant-site infection (n=9) and lead dislodgement (n=5). Independent adjudication determined one death was possibly device-related and 17 were unrelated. The adverse-event spectrum is consistent with the implantable cardiac monitor device class and is manageable through standard implant practice; all adjudication results are tabulated in §5.3.',
  iv6: '2.3.3 — Conclusion on clinical performance. The clinical performance data demonstrate that the DxAssay RT-PCR reliably identifies patients with the RTK-X activating mutation, with sensitivity and specificity exceeding the pre-specified ≥95% acceptance thresholds. The agreement with the reference standard supports the scientific validity of the analyte–condition association and the intended companion-diagnostic claim, in accordance with IVDR Annex XIII.',
  iv4: '2.1 — Analytical performance summary. The DxAssay RT-PCR achieved a limit of detection of 120 copies/mL with linearity across six logs (R²=0.997) and total precision of 3.8% CV across three sites, three lots and three operators. Interference and cross-reactivity testing against the common-organism panel is in progress; results will be incorporated before the performance evaluation report is finalized per IVDR Annex I §9.1.',
  _default: 'Drafted section. AnA has assembled this content from the linked section evidence and the program’s controlled vocabulary. Review the claims against the cited sources before promoting this draft to a governed version.',
};

/* -- Localized document bodies (sectionId to { lang to html }) ------- */

export const REG_DOC_I18N: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  m25: { ja: `
<div class="eb" data-conf="hi" data-prov="出典：目標製品プロファイル TPP v3.2 ・ Maximum エンジン ・ 信頼度 0.94 ・ AUD-7741">
  <h2>2.5.1　開発の根拠</h2>
  <p>BX-204は、受容体型チロシンキナーゼX（RTK-X）を標的とするヒト化IgG1κモノクローナル抗体であり、RTK-Xを過剰発現する進行又は転移性の固形癌を対象として開発された。本剤の臨床開発計画は、<span class="cite">21 CFR 314.500</span>に基づく迅速承認を支持することを目的として設計されている。</p>
</div>
<div class="eb" data-conf="med" data-prov="出典：CSR-201 第II相主要試験 ・ Maximum エンジン ・ 信頼度 0.72 ・ AUD-7742">
  <h2>2.5.4　有効性の概観</h2>
  <p>確定客観的奏効率（ORR）は<ins>38.6%</ins><del> 41.2%</del>（95%信頼区間：31.5〜46.0）であり、あらかじめ規定された閾値である25%を上回った <span class="cite">CSR-201 §7.1</span>。奏効期間の中央値は11.4か月（95%信頼区間：9.1〜14.8）であった。</p>
  <table class="doctab">
    <thead><tr><th>評価項目</th><th>結果</th><th>95%信頼区間</th><th>閾値</th></tr></thead>
    <tbody>
      <tr><td>確定ORR</td><td>38.6%</td><td>31.5〜46.0</td><td>&gt; 25%</td></tr>
      <tr><td>奏効期間（中央値）</td><td>11.4か月</td><td>9.1〜14.8</td><td>—</td></tr>
      <tr><td>無増悪生存期間（中央値）</td><td>6.9か月</td><td>5.4〜8.6</td><td>—</td></tr>
    </tbody>
  </table>
  <div class="claimflag" data-sev="warn">ORRの信頼区間はCSR-201 §7.1を引用しています。提出前に有効性表が確定（ロック）されていることを確認してください。</div>
</div>
<div class="eb" data-conf="hi" data-prov="出典：§2.5.1〜2.5.5より作成 ・ Maximum エンジン ・ 信頼度 0.88 ・ AUD-7744">
  <h2>2.5.6　ベネフィット・リスクの結論</h2>
  <p>奏効の大きさ及び持続性は、管理可能で十分に特性が明らかにされた安全性プロファイルと相まって、限られた治療選択肢しか有しない対象集団における本適応症に対して良好なベネフィット・リスク評価を支持する。本評価を変更するような新たな安全性シグナルは認められなかった。</p>
</div>` },
  e7: { ja: `
<div class="eb" data-conf="hi" data-prov="出典：SAP v2.1 主要解析 ・ Maximum エンジン ・ 信頼度 0.92 ・ AUD-9101">
  <h2>7.1　主要有効性解析</h2>
  <p>主要評価項目は、盲検下独立中央判定による無増悪生存期間（PFS）（ITT集団）とした。解析はあらかじめ規定された統計解析計画書 <span class="cite">SAP v2.1</span> に従い、層別ログランク検定を用いて実施した。</p>
  <table class="doctab">
    <thead><tr><th>パラメータ</th><th>BX-204（n=214）</th><th>対照（n=212）</th><th>HR（95%CI）</th></tr></thead>
    <tbody>
      <tr><td>PFS中央値（月）</td><td>9.8</td><td>6.1</td><td>0.61（0.49〜0.76）</td></tr>
      <tr><td>12か月PFS率</td><td>41.2%</td><td>22.7%</td><td>—</td></tr>
    </tbody>
  </table>
</div>
<div class="eb" data-conf="med" data-prov="出典：CSR-301 表 §14.2 ・ Maximum エンジン ・ 信頼度 0.78 ・ AUD-9102">
  <h2>7.2　副次的及び感度解析</h2>
  <p>全奏効率は治療群で<ins>48.1%</ins><del> 46.0%</del>、対照群で29.7%であった <span class="cite">CSR-301 §14.2</span>。</p>
  <div class="claimflag" data-sev="warn">全生存期間（OS）データは未成熟（イベント38%）です。記述的にのみ提示し、第2回中間解析まで推論的な表現は避けてください。</div>
</div>` },
};

/* -- Localized AnA generation drafts (sectionId to { lang to text }) - */

export const REG_GEN_I18N: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  m25: { ja: '2.5.5　安全性の概観。BX-204の安全性プロファイルは、統合臨床データセットの318例において評価された。最も頻度の高い治療関連有害事象は、疲労（32%）、発疹（24%）及びインフュージョンリアクション（11%）であり、その多くはGrade 1〜2で標準的な対症療法により管理可能であった。Grade 3以上の治療関連事象は14%に認められ、治療関連死は報告されなかった。これらの事象は当該抗体クラスの既知の薬理作用と一致しており、通常の医薬品安全性監視及び添付文書により対応可能である。' },
  e7: { ja: '7.3　主要評価項目の部分集団解析。無増悪生存期間に対する治療効果は、年齢（65歳未満 vs 65歳以上）、ECOG PS（0 vs 1）及びベースラインのバイオマーカー発現（高 vs 低）を含むあらかじめ規定された部分集団間で一貫していた。いずれの部分集団でもハザード比が1.0を超えることはなく、治療と部分集団の交互作用検定は有意ではなかった。' },
};
