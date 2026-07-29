/* ------------------------------------------------------------------ *
 *  editor-data-sections.ts
 *  Threaded comments, version history, governance audit trails,
 *  target markets, localized content, and template library for
 *  the document editor.
 * ------------------------------------------------------------------ */

import type {
  AuditEntry,
  Comment,
  LangCode,
  Market,
  TemplateGroup,
  VersionEntry,
} from './editor-data-types';

/* -- Threaded comments (sectionId -> comments) ---------------------- */

export const REG_COMMENTS: Record<string, Comment[]> = {
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
      replies: [{ author: 'AnA', role: 'Maximum', when: '1 h ago', ai: true, body: 'Drafted "post-hoc subgroup analysis was consistent with..." as a tracked change. Accept to apply.' }] },
    { id: 'pc2', anchor: '§5.1.3', author: 'Maya Patel', role: 'Clinical Lead', when: 'yesterday', resolved: false, ai: false,
      body: 'Adjudication committee report ADJ-CV330-FINAL is locked — I\'ll attach it to §5.3 today.', replies: [] },
  ],
};

/* -- Version history per pathway ------------------------------------ */

export const REG_VERSIONS: Record<string, VersionEntry[]> = {
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

export const REG_AUDIT: Record<string, AuditEntry[]> = {
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

/* -- Target markets per pathway ------------------------------------- */

export const REG_MARKETS: Record<string, Market[]> = {
  ctd: [
    { id: 'fda', agency: 'FDA', region: 'United States', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
    { id: 'ema', agency: 'EMA', region: 'European Union', lang: 'en' },
    { id: 'nmpa', agency: 'NMPA', region: 'China', lang: 'zh' },
  ],
  estar: [
    { id: 'fda', agency: 'FDA', region: 'United States', lang: 'en' },
    { id: 'hc', agency: 'Health Canada', region: 'Canada', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
  ],
  cer: [
    { id: 'ema', agency: 'EMA / Notified Body', region: 'European Union', lang: 'en' },
    { id: 'bfarm', agency: 'BfArM', region: 'Germany', lang: 'de' },
    { id: 'ansm', agency: 'ANSM', region: 'France', lang: 'fr' },
  ],
  csr: [
    { id: 'ich', agency: 'ICH (global)', region: 'Multi-region', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
    { id: 'nmpa', agency: 'NMPA', region: 'China', lang: 'zh' },
  ],
  pma: [
    { id: 'fda', agency: 'FDA / CDRH', region: 'United States', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
  ],
};

/* -- Localized document bodies (sectionId -> { lang -> html }) ------ */

export const REG_DOC_I18N: Record<string, Partial<Record<LangCode, string>>> = {
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

/* -- Localized AnA generation drafts -------------------------------- */

export const REG_GEN_I18N: Record<string, Partial<Record<LangCode, string>>> = {
  m25: { ja: '2.5.5　安全性の概観。BX-204の安全性プロファイルは、統合臨床データセットの318例において評価された。最も頻度の高い治療関連有害事象は、疲労（32%）、発疹（24%）及びインフュージョンリアクション（11%）であり、その多くはGrade 1〜2で標準的な対症療法により管理可能であった。Grade 3以上の治療関連事象は14%に認められ、治療関連死は報告されなかった。これらの事象は当該抗体クラスの既知の薬理作用と一致しており、通常の医薬品安全性監視及び添付文書により対応可能である。' },
  e7: { ja: '7.3　主要評価項目の部分集団解析。無増悪生存期間に対する治療効果は、年齢（65歳未満 vs 65歳以上）、ECOG PS（0 vs 1）及びベースラインのバイオマーカー発現（高 vs 低）を含むあらかじめ規定された部分集団間で一貫していた。いずれの部分集団でもハザード比が1.0を超えることはなく、治療と部分集団の交互作用検定は有意ではなかった。' },
};

/* -- Template library ----------------------------------------------- */

export const REG_TEMPLATES: Record<string, TemplateGroup[]> = {
  ctd: [
    { group: 'Module 1 — Administrative', items: [
      { id: 't-356h', num: '1.1', label: 'FDA 356h application form' },
      { id: 't-1571', num: '1.1', label: 'FDA 1571 (IND) form' },
      { id: 't-cover', num: '1.2', label: 'Cover letter' },
      { id: 't-pi', num: '1.14.1', label: 'Prescribing information (PLR/PLLR)' },
      { id: 't-meet', num: '1.6', label: 'Meeting request / briefing package' },
    ] },
    { group: 'Module 2 — CTD summaries', items: [
      { id: 't-qos', num: '2.3', label: 'Quality overall summary' },
      { id: 't-nco', num: '2.4', label: 'Nonclinical overview' },
      { id: 't-clo', num: '2.5', label: 'Clinical overview' },
      { id: 't-273', num: '2.7.3', label: 'Summary of clinical efficacy' },
      { id: 't-274', num: '2.7.4', label: 'Summary of clinical safety' },
    ] },
    { group: 'Module 3 — Quality (CMC)', items: [
      { id: 't-32s2', num: '3.2.S.2', label: 'Drug substance — manufacture' },
      { id: 't-32s4', num: '3.2.S.4', label: 'Control of drug substance' },
      { id: 't-32p3', num: '3.2.P.3', label: 'Drug product — manufacture' },
      { id: 't-32p5', num: '3.2.P.5', label: 'Control of drug product' },
      { id: 't-32p8', num: '3.2.P.8', label: 'Stability — drug product' },
    ] },
    { group: 'Module 4 — Nonclinical', items: [
      { id: 't-421', num: '4.2.1', label: 'Pharmacology study report' },
      { id: 't-423', num: '4.2.3', label: 'Toxicology study report' },
    ] },
    { group: 'Module 5 — Clinical', items: [
      { id: 't-535', num: '5.3.5', label: 'Efficacy & safety CSR (ICH E3)' },
      { id: 't-533', num: '5.3.3', label: 'Human PK study report' },
    ] },
  ],
  estar: [
    { group: 'Administrative', items: [
      { id: 't-3881', num: '§05', label: 'Indications for use (FDA 3881)' },
      { id: 't-k510sum', num: '§06', label: '510(k) summary' },
    ] },
    { group: 'Device & performance', items: [
      { id: 't-se', num: '§07', label: 'Substantial equivalence discussion' },
      { id: 't-devdesc', num: '§08', label: 'Device description' },
      { id: 't-bench', num: '§14', label: 'Bench performance test report' },
      { id: 't-biocomp', num: '§11', label: 'Biocompatibility evaluation (ISO 10993)' },
      { id: 't-soft', num: '§12', label: 'Software documentation (IEC 62304)' },
      { id: 't-cyber', num: '§17', label: 'Cybersecurity documentation' },
    ] },
  ],
  pma: [
    { group: 'Clinical & summary', items: [
      { id: 't-ssed', num: '2.1', label: 'Summary of safety & effectiveness (SSED)' },
      { id: 't-clin', num: '5.1', label: 'Clinical investigation summary' },
      { id: 't-sap', num: '5.4', label: 'Statistical analysis plan' },
    ] },
    { group: 'Manufacturing & non-clinical', items: [
      { id: 't-qsr', num: '3.2', label: 'Quality system (QSR) summary' },
      { id: 't-risk', num: '2.2', label: 'Risk analysis (ISO 14971)' },
      { id: 't-pas', num: '6.1', label: 'Post-approval study plan' },
    ] },
  ],
  cer: [
    { group: 'Clinical evaluation', items: [
      { id: 't-sota', num: '4', label: 'State-of-the-art analysis' },
      { id: 't-litprot', num: 'A', label: 'Literature search protocol' },
      { id: 't-gspr', num: '7', label: 'GSPR conformity checklist' },
      { id: 't-pmcf', num: '10', label: 'PMCF plan (MDCG 2020-7)' },
    ] },
  ],
  csr: [
    { group: 'ICH E3 sections', items: [
      { id: 't-syn', num: '—', label: 'Synopsis' },
      { id: 't-eff', num: '7', label: 'Efficacy evaluation' },
      { id: 't-saf', num: '8', label: 'Safety evaluation' },
      { id: 't-disc', num: '9', label: 'Discussion & overall conclusions' },
    ] },
  ],
};
