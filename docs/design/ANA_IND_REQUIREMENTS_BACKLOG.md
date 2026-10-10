# AnA IND requirements backlog

Owner: W3 authoring / D4 governed workflow. Canonical branch: concept2cure-v2.
Captured 2026-10-10 UTC. Status: current open work and bounded advisory-content delivery; no qualification or release clearance.

The existing combined CTD record has **93 structure-only terminal codes**:
60 in Module 2, 2 in Module 3, 17 in Module 4 and 14 in Module 5. Every code,
heading and nearest exact-guidance ancestor is listed below. The machine-readable
[audit](../evidence/D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/structure-only-terminal-backlog.json)
preserves their recorded regulatory bases, source hashes and unresolved initial
IND applicability.

These are gaps in the encoded IND/NDA/BLA lifecycle catalogue, not 93 mandatory
initial IND documents. Every row's initial IND applicability is **undetermined**
until filing, product, phase, population, available evidence and agency context
establish it. A heading, an ancestor's necessity tag or an optional flag cannot
make that decision. Inherited content is not exact leaf guidance.

This backlog follows the existing
[IND coverage and qualification plan](ANA_IND_COVERAGE_PLAN.md) and
[single regulatory record](ANA_REGULATORY_RECORD.md). It adds no implementation,
parallel registry, UI, model, scientific qualification or release clearance.

## Inventory boundary

The two canonical inputs are `CTD_AUTHORING_GUIDANCE` and `ICH_M4_HEADINGS`.
Their union currently contains 249 unique codes: 134 exact content records and
115 structural records. A terminal has no modeled descendant whose code starts
with that terminal's code plus a dot. There are 203 terminals: 110 exact content
and the 93 open rows here. Containers are excluded from this terminal backlog.

For each open row, the nearest exact-guidance ancestor is the longest strict
dot-delimited prefix present in the authoring overlay. The existing pure
`resolveSectionBriefSource` agrees with this derivation: 89 rows receive an
ancestor brief; 4 have no exact-content ancestor and are currently not indexed
by that requirements path. None receives exact leaf content. A structural
heading and its recorded basis remain useful even when the drafting brief is
unavailable.

This denominator excludes regional Module 1 alignment, unindexed deeper CMC
and QOS subdivisions, nonclinical numbered tables, repeating study/product
instances and lifecycle-specific administrative components. Two remaining
Module 3 terminals do not establish complete CMC coverage. Those dimensions
remain open under plan priorities 2, 3 and 6.

The heading basis in the audit is copied from the canonical record without
upgrading its confidence or checked date. Existing recall labels remain recall;
existing regulator-text entries retain their original dates. This inventory
does not freshly verify M4S/M4E text, current publication status or applicability.
Each content batch needs its own primary-source review. The prior bounded CMC
source review is recorded in the
[CMC delivery evidence](../evidence/D4/2026-10-09-ana-ind-cmc-leaf-guidance/README.md).

## Shared critical needs

These needs apply to existing exact records as well as the 93 open rows. Adding
prose alone cannot close them. The plan remains the authority for their scope;
this table makes the next deliverable and acceptance evidence concrete.

| Need | Existing plan item | Next bounded deliverable and required evidence |
|---|---|---|
| Scientific source qualification and seal admission | 1h | Carry actual reviewed source and target versions through existing governed review, lineage and approval records. Reach an authenticated review verdict rather than accepting caller `ok`. Demonstrate refusal of omitted, forged, negative, stale, withdrawn, wrong-tenant and wrong-target proof. Copying fidelity and historical receipt integrity do not supply scientific qualification. |
| Product and development-phase applicability | 3 and 4 | Project owned program facts into the existing requirements/drafting path and record each decision's basis. Separate required, conditional, not applicable and undetermined. Keep missing phase, modality, route, population and disease-stage facts unresolved; demonstrate that early IND evidence limits survive nested drafting. Existing caller-declared area/modality labels remain unverified advisory. |
| Regulatory currency and evidence cutoff | 5 | Bind source identity/version/hash, study and data cutoff, draft/final/withdrawn status, publication/adoption/effective dates, supersession and last verification. Demonstrate a historical as-of answer and rejection or unresolved reporting of stale or post-cutoff material. A static title or checked date does not prove an automatic update feed. |
| Hierarchy, tables and repeatable instances | 2 | Reconcile the existing regional M1 projection, unindexed subdivisions, table numbering and product/study instances with the canonical record. Preserve exact versus inherited versus structural/unindexed classifications. Demonstrate unsupported numbering without invented requirements; current ancestor fallback is not strict hierarchy validation. |
| IND lifecycle and sequence context | 3 and 6 | Prove selected initial application, protocol/information amendment, safety/annual report, hold response and referenced-dossier context through existing lifecycle paths. Bind current versions, sequence and cross-references; preserve absent prior-human/study evidence as gaps. Catalogue-wide marketing content is not automatically initial IND content. |
| Governed end-to-end qualification | 6 | Evaluate representative applicable area/modality/phase combinations with qualified model execution and human regulatory review. Trace sources through actual drafting, review, approval, faithful tables/numbers, export and submission controls. Include conflicts, missing data, source updates, truncation and wrong ownership; keep draft, needs evidence, approved and filed distinct. Prompt wiring, catalogue traversal and one golden journey do not qualify every combination. |

## Proposed bounded content batches

The open letters B–P below partition all 93 rows without overlap. They are engineering
scopes for review, not study requirements or a commitment to implement every row
in one batch. Product applicability may defer or exclude a section for a given
submission without closing its catalogue gap.

Batch **A: the seven pharmacology written-summary leaves, 2.6.2.1–2.6.2.7**,
is delivered as exact advisory content in the current catalogue. Its bounded
primary-source review and existing gateway drafting-path wiring are recorded in
the [pharmacology delivery evidence](../evidence/D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/README.md).
This closes the exact-content gap for those seven encoded leaves; it does not
qualify sponsor evidence, generated scientific conclusions, product or phase
applicability, a model, an initial IND or the overall release. The prior
[100-row snapshot](../evidence/D4/2026-10-09-ana-ind-cmc-leaf-guidance/structure-only-terminal-backlog.json)
remains unchanged as historical evidence.

The recommended next content batch is **B: the ten pharmacokinetics written-summary
leaves, 2.6.4.1–2.6.4.10**. They currently inherit the broad 2.6.4 brief. Verify
their final primary M4S basis and appropriate product/phase references, then
demonstrate exact leaf content in the existing resolver and actual nested drafting
path with missing-study, methods and modality uncertainty preserved. Keep scientific
source qualification work in plan item 1h visible alongside this content work.

| Batch | Current terminal scope | Rows | Content and fidelity work to prove |
|---|---|---:|---|
| B | 2.6.4.1–2.6.4.10 | 10 | Separate analytical methods and ADME/interaction summaries, retain species/material/method/units and evidence limits, and reconcile supplied tables to underlying studies. |
| C | 2.6.6.1–2.6.6.10 | 10 | Separate toxicology summary subjects; retain exposure, route, duration, findings and study status. Make phase/product-dependent study gaps explicit rather than demanding every lifecycle study. |
| D | 4.2.3.3.1–4.2.3.3.2 | 2 | Distinguish supplied in vitro and in vivo genotoxicity reports, their identity and interpretation limits; preserve absent or pending results. |
| E | 4.2.3.5.1–4.2.3.5.4 | 4 | Distinguish reproductive/developmental study classes and studied populations. Require a recorded applicability basis; do not infer study timing or completeness from the heading. |
| F | 4.2.3.7.1–4.2.3.7.7 | 7 | Distinguish other toxicology report types and product-specific evidence without manufacturing generic reports for inapplicable subjects. |
| G | 4.2.3.4.1–4.2.3.4.3 | 3 | Separate carcinogenicity report classes while leaving product/phase necessity unresolved until qualified review. |
| H | 2.7.1.1–2.7.1.4 | 4 | Separate biopharmaceutic overview, individual studies, cross-study analyses and appendix; reconcile available formulation/method evidence. |
| I | 2.7.2.1–2.7.2.5 | 5 | Separate clinical pharmacology overview, studies, cross-study analyses, special studies and appendix; preserve actual human-data availability and study scope. |
| J | Terminal leaves under 2.7.3 | 8 | Keep efficacy populations, results, subpopulations, dosing and persistence tied to the supplied studies and pre-specified analyses; do not turn early evidence into a marketing claim. |
| K | Terminal leaves under 2.7.4 | 21 | Separate exposure, adverse-event classes, narratives, labs, vital signs, special situations, post-marketing evidence and appendix. Reconcile denominators, cutoffs and study populations, preserving unavailable lifecycle evidence. |
| L | 5.3.1.1–5.3.1.4 | 4 | Distinguish BA/BE, correlation and analytical-method reports; tie each to actual study/formulation/method versions. |
| M | 5.3.2.1–5.3.2.3 | 3 | Distinguish human-biomaterial report classes; retain material, assay, study identity and interpretation limits. |
| N | 5.3.3.1–5.3.3.5 | 5 | Distinguish healthy-subject, patient, intrinsic/extrinsic-factor and population PK reports; preserve population/dose/model provenance. |
| O | 5.3.4.1–5.3.4.2 | 2 | Distinguish healthy-subject and patient PD/PK-PD reports; preserve available endpoints and analytical scope. |
| P | 2.1, 2.5.7, 3.1, 3.3, 4.1 | 5 | Derive contents and reference lists from controlled document/source metadata through existing paths. Missing entries remain gaps; do not invent filenames, literature citations or submission contents. |
| Total | All listed structure-only terminals | 93 | No batch confers initial IND applicability or filing readiness. |

For every content batch, record verified primary sources and dates before making
regulatory claims; retain phase/product uncertainty, missing/conflicting data and
source identities; preserve the single-record partition; and prove the exact
requested leaf reaches the existing drafting path. Show the original inherited
or unavailable behavior before the change and the improved behavior after it.
Reachability tests are separate from model performance and scientific review.
Do not change unrelated necessity flags to make a content count appear complete.

## All open terminal rows

All rows are open for exact content and have **undetermined initial IND
applicability**. The ancestor column is a code in the exact authoring overlay;
`None` means no exact-content ancestor is recorded. Full ancestor titles and
the original heading basis are retained in the JSON audit.

### Module 2 — Summaries (60 rows)

| Code | Recorded heading | Nearest exact-guidance ancestor | Batch |
|---|---|---|---|
| 2.1 | Common Technical Document Table of Contents (Modules 2–5) | None | P |
| 2.5.7 | Literature References | 2.5 | P |
| 2.6.4.1 | Brief Summary | 2.6.4 | B |
| 2.6.4.2 | Methods of Analysis | 2.6.4 | B |
| 2.6.4.3 | Absorption | 2.6.4 | B |
| 2.6.4.4 | Distribution | 2.6.4 | B |
| 2.6.4.5 | Metabolism (Interspecies Comparison) | 2.6.4 | B |
| 2.6.4.6 | Excretion | 2.6.4 | B |
| 2.6.4.7 | Pharmacokinetic Drug Interactions | 2.6.4 | B |
| 2.6.4.8 | Other Pharmacokinetic Studies | 2.6.4 | B |
| 2.6.4.9 | Discussion and Conclusions | 2.6.4 | B |
| 2.6.4.10 | Tables and Figures | 2.6.4 | B |
| 2.6.6.1 | Brief Summary | 2.6.6 | C |
| 2.6.6.2 | Single-Dose Toxicity | 2.6.6 | C |
| 2.6.6.3 | Repeat-Dose Toxicity | 2.6.6 | C |
| 2.6.6.4 | Genotoxicity | 2.6.6 | C |
| 2.6.6.5 | Carcinogenicity | 2.6.6 | C |
| 2.6.6.6 | Reproductive and Developmental Toxicity | 2.6.6 | C |
| 2.6.6.7 | Local Tolerance | 2.6.6 | C |
| 2.6.6.8 | Other Toxicity Studies | 2.6.6 | C |
| 2.6.6.9 | Discussion and Conclusions | 2.6.6 | C |
| 2.6.6.10 | Tables and Figures | 2.6.6 | C |
| 2.7.1.1 | Background and Overview | 2.7.1 | H |
| 2.7.1.2 | Summary of Results of Individual Studies | 2.7.1 | H |
| 2.7.1.3 | Comparison and Analyses of Results Across Studies | 2.7.1 | H |
| 2.7.1.4 | Appendix | 2.7.1 | H |
| 2.7.2.1 | Background and Overview | 2.7.2 | I |
| 2.7.2.2 | Summary of Results of Individual Studies | 2.7.2 | I |
| 2.7.2.3 | Comparison and Analyses of Results Across Studies | 2.7.2 | I |
| 2.7.2.4 | Special Studies | 2.7.2 | I |
| 2.7.2.5 | Appendix | 2.7.2 | I |
| 2.7.3.1 | Background and Overview of Clinical Efficacy | 2.7.3 | J |
| 2.7.3.2 | Summary of Results of Individual Studies | 2.7.3 | J |
| 2.7.3.3.1 | Study Populations | 2.7.3 | J |
| 2.7.3.3.2 | Comparison of Efficacy Results of All Studies | 2.7.3 | J |
| 2.7.3.3.3 | Comparison of Results in Sub-populations | 2.7.3 | J |
| 2.7.3.4 | Analysis of Clinical Information Relevant to Dosing Recommendations | 2.7.3 | J |
| 2.7.3.5 | Persistence of Efficacy and/or Tolerance Effects | 2.7.3 | J |
| 2.7.3.6 | Appendix | 2.7.3 | J |
| 2.7.4.1.1 | Overall Safety Evaluation Plan and Narratives of Safety Studies | 2.7.4 | K |
| 2.7.4.1.2 | Overall Extent of Exposure | 2.7.4 | K |
| 2.7.4.1.3 | Demographic and Other Characteristics of Study Population | 2.7.4 | K |
| 2.7.4.2.1.1 | Common Adverse Events | 2.7.4 | K |
| 2.7.4.2.1.2 | Deaths | 2.7.4 | K |
| 2.7.4.2.1.3 | Other Serious Adverse Events | 2.7.4 | K |
| 2.7.4.2.1.4 | Other Significant Adverse Events | 2.7.4 | K |
| 2.7.4.2.1.5 | Analysis of Adverse Events by Organ System or Syndrome | 2.7.4 | K |
| 2.7.4.2.2 | Narratives | 2.7.4 | K |
| 2.7.4.3 | Clinical Laboratory Evaluations | 2.7.4 | K |
| 2.7.4.4 | Vital Signs, Physical Findings, and Other Observations Related to Safety | 2.7.4 | K |
| 2.7.4.5.1 | Intrinsic Factors | 2.7.4 | K |
| 2.7.4.5.2 | Extrinsic Factors | 2.7.4 | K |
| 2.7.4.5.3 | Drug Interactions | 2.7.4 | K |
| 2.7.4.5.4 | Use in Pregnancy and Lactation | 2.7.4 | K |
| 2.7.4.5.5 | Overdose | 2.7.4 | K |
| 2.7.4.5.6 | Drug Abuse | 2.7.4 | K |
| 2.7.4.5.7 | Withdrawal and Rebound | 2.7.4 | K |
| 2.7.4.5.8 | Effects on Ability to Drive or Operate Machinery or Impairment of Mental Ability | 2.7.4 | K |
| 2.7.4.6 | Post-marketing Data | 2.7.4 | K |
| 2.7.4.7 | Appendix | 2.7.4 | K |

### Module 3 — Quality (2 rows)

| Code | Recorded heading | Nearest exact-guidance ancestor | Batch |
|---|---|---|---|
| 3.1 | Table of Contents of Module 3 | None | P |
| 3.3 | Literature References | None | P |

### Module 4 — Nonclinical Study Reports (17 rows)

| Code | Recorded heading | Nearest exact-guidance ancestor | Batch |
|---|---|---|---|
| 4.1 | Table of Contents of Module 4 | None | P |
| 4.2.3.3.1 | In Vitro | 4.2.3.3 | D |
| 4.2.3.3.2 | In Vivo | 4.2.3.3 | D |
| 4.2.3.4.1 | Long-term Studies | 4.2.3.4 | G |
| 4.2.3.4.2 | Short- or Medium-term Studies | 4.2.3.4 | G |
| 4.2.3.4.3 | Other Studies | 4.2.3.4 | G |
| 4.2.3.5.1 | Fertility and Early Embryonic Development | 4.2.3.5 | E |
| 4.2.3.5.2 | Embryo-fetal Development | 4.2.3.5 | E |
| 4.2.3.5.3 | Prenatal and Postnatal Development, Including Maternal Function | 4.2.3.5 | E |
| 4.2.3.5.4 | Studies in Which the Offspring (Juvenile Animals) Are Dosed and/or Further Evaluated | 4.2.3.5 | E |
| 4.2.3.7.1 | Antigenicity | 4.2.3.7 | F |
| 4.2.3.7.2 | Immunotoxicity | 4.2.3.7 | F |
| 4.2.3.7.3 | Mechanistic Studies | 4.2.3.7 | F |
| 4.2.3.7.4 | Dependence | 4.2.3.7 | F |
| 4.2.3.7.5 | Metabolites | 4.2.3.7 | F |
| 4.2.3.7.6 | Impurities | 4.2.3.7 | F |
| 4.2.3.7.7 | Other | 4.2.3.7 | F |

### Module 5 — Clinical Study Reports (14 rows)

| Code | Recorded heading | Nearest exact-guidance ancestor | Batch |
|---|---|---|---|
| 5.3.1.1 | Bioavailability (BA) Study Reports | 5.3.1 | L |
| 5.3.1.2 | Comparative BA and Bioequivalence (BE) Study Reports | 5.3.1 | L |
| 5.3.1.3 | In Vitro–In Vivo Correlation Study Reports | 5.3.1 | L |
| 5.3.1.4 | Reports of Bioanalytical and Analytical Methods for Human Studies | 5.3.1 | L |
| 5.3.2.1 | Plasma Protein Binding Study Reports | 5.3.2 | M |
| 5.3.2.2 | Reports of Hepatic Metabolism and Drug Interaction Studies | 5.3.2 | M |
| 5.3.2.3 | Reports of Studies Using Other Human Biomaterials | 5.3.2 | M |
| 5.3.3.1 | Healthy Subject PK and Initial Tolerability Study Reports | 5.3.3 | N |
| 5.3.3.2 | Patient PK and Initial Tolerability Study Reports | 5.3.3 | N |
| 5.3.3.3 | Intrinsic Factor PK Study Reports | 5.3.3 | N |
| 5.3.3.4 | Extrinsic Factor PK Study Reports | 5.3.3 | N |
| 5.3.3.5 | Population PK Study Reports | 5.3.3 | N |
| 5.3.4.1 | Healthy Subject PD and PK/PD Study Reports | 5.3.4 | O |
| 5.3.4.2 | Patient PD and PK/PD Study Reports | 5.3.4 | O |

## Source pins and verification

The audit records the local canonical HEAD at capture as context. Its SHA-256
file pins, rather than an eventual documentation commit id, identify the actual
catalogue and resolver inputs. The local capture is not a remote verification
receipt.

| Canonical input | SHA-256 |
|---|---|
| `server/services/ind/ctd/authoring-guidance.ts` | `a0971eba73e9a1b388d088c02d746b8533df1290a223e6590c1c2b8b0f89542a` |
| `server/services/ind/ctd/ich-m4-headings.ts` | `179f242eecac9b542258dbe05c946dd45ab17bc6ed54a2009e8b0dbbeee94116` |
| `server/services/ind/ctd/section-brief.ts` | `ad91f99559c77ed40a972cab1292e3729f07011f8cf13bf8a84e9c2255395082` |
| `server/services/ind/ctd/regulatory-basis.ts` | `c295e55494948c99384c871ff0201e93ae7642b7a73e735f172cde054506e826` |
| `shared/regulatory/section-code.ts` | `e4847c9c4258140212be071e0eadac75acd3cd8fe68557c9534225148bbff3ad` |

The mechanically generated rows agree with the existing CMC coverage inventory:
60/2/17/14 by module, exactly 93 distinct codes, no exact-content entries, no
nonterminal codes and no additional codes. Eighty-nine nearest-ancestor matches
and four unavailable briefs were checked through the actual pure resolver.
The open proposed batches sum to 93, and each row belongs to exactly one batch.
All 93 remaining row payloads equal the historical audit after removing only its
seven A rows; their original heading bases and applicability remain unchanged.
Those seven former structure-only codes now resolve as exact advisory content.
No live model, database or governance action was invoked by this audit.

### Reproduce and verify

Run this read-only command from the repository root with its installed Node/tsx
dependencies. It regenerates the deterministic JSON payload on stdout and checks
the stored rows, batch partition, resolver answers, counts and file hashes.
Capture date, local HEAD and runtime metadata are not recreated. If the canonical
record changes, an assertion fails so the backlog must be reviewed and refreshed.

```sh
node --import tsx --input-type=module - <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { CTD_AUTHORING_GUIDANCE as guidance } from './server/services/ind/ctd/authoring-guidance.ts';
import { ICH_M4_HEADINGS as headings } from './server/services/ind/ctd/ich-m4-headings.ts';
import { compareSectionCode } from './shared/regulatory/section-code.ts';
import { resolveSectionBriefSource } from './server/services/ind/ctd/section-brief.ts';
const audit = JSON.parse(fs.readFileSync(
  'docs/evidence/D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/structure-only-terminal-backlog.json', 'utf8'));
const codes = [...Object.keys(guidance), ...headings.map(row => row.code)];
assert.equal(new Set(codes).size, codes.length, 'canonical halves must not overlap');
const batches = [
  ['2.6.4.', 'B'], ['2.6.6.', 'C'], ['4.2.3.3.', 'D'],
  ['4.2.3.5.', 'E'], ['4.2.3.7.', 'F'], ['4.2.3.4.', 'G'], ['2.7.1.', 'H'],
  ['2.7.2.', 'I'], ['2.7.3.', 'J'], ['2.7.4.', 'K'], ['5.3.1.', 'L'],
  ['5.3.2.', 'M'], ['5.3.3.', 'N'], ['5.3.4.', 'O'],
];
function batchFor(code) {
  const batch = batches.find(([prefix]) => code.startsWith(prefix))?.[1];
  if (batch) return batch;
  assert.ok(['2.1', '2.5.7', '3.1', '3.3', '4.1'].includes(code), 'unassigned code');
  return 'P';
}
const rows = headings.filter(row => !codes.some(code => code.startsWith(`${row.code}.`)))
  .sort((a, b) => compareSectionCode(a.code, b.code)).map(row => {
    assert.equal(guidance[row.code], undefined, 'terminal must not have exact content');
    const ancestor = Object.keys(guidance).filter(code => row.code.startsWith(`${code}.`))
      .sort((a, b) => b.length - a.length)[0] || null;
    const brief = resolveSectionBriefSource(row.code);
    assert.ok(!brief || brief.kind === 'ancestor', 'not an inherited/unavailable terminal');
    assert.equal(brief?.entry?.code ?? null, ancestor, 'resolver and catalogue disagree');
    return {
      code: row.code, heading: row.title, module: row.module, record_parent: row.parent,
      coverage: 'structure-only terminal', has_exact_guidance: false,
      nearest_exact_guidance_ancestor: ancestor ? { code: ancestor, title: guidance[ancestor].title } : null,
      current_requirements_match: brief?.kind ?? 'not_indexed',
      initial_ind_applicability: 'undetermined', recorded_heading_basis: row.basis,
      proposed_content_batch: batchFor(row.code),
    };
  });
assert.equal(rows.length, 93);
assert.equal(new Set(rows.map(row => row.code)).size, 93);
const byModule = Object.fromEntries([2, 3, 4, 5].map(module =>
  [module, rows.filter(row => row.module === module).length]));
assert.deepEqual(byModule, { 2: 60, 3: 2, 4: 17, 5: 14 });
const counts = {
  canonical_guidance_entries: Object.keys(guidance).length,
  canonical_structural_entries: headings.length, combined_entries: codes.length,
  canonical_terminal_entries: codes.filter(code => !codes.some(other => other.startsWith(`${code}.`))).length,
  exact_guidance_terminals: Object.keys(guidance).filter(code => !codes.some(other => other.startsWith(`${code}.`))).length,
  structure_only_terminals: rows.length, by_module: byModule,
  inherited_exact_ancestor: rows.filter(row => row.nearest_exact_guidance_ancestor).length,
  without_exact_ancestor: rows.filter(row => !row.nearest_exact_guidance_ancestor).length,
  by_proposed_content_batch: Object.fromEntries([...new Set(rows.map(row => row.proposed_content_batch))]
    .sort().map(batch => [batch, rows.filter(row => row.proposed_content_batch === batch).length])),
};
assert.deepEqual(
  [counts.canonical_guidance_entries, counts.canonical_structural_entries, counts.combined_entries,
   counts.canonical_terminal_entries, counts.exact_guidance_terminals,
   counts.inherited_exact_ancestor, counts.without_exact_ancestor],
  [134, 115, 249, 203, 110, 89, 4],
);
assert.equal(Object.values(counts.by_proposed_content_batch).reduce((sum, count) => sum + count, 0), 93);
assert.ok(!Object.hasOwn(counts.by_proposed_content_batch, 'A'));
const sourcePins = audit.source_pins.map(({ path }) => {
  const bytes = fs.readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const payload = { counts, source_pins: sourcePins, rows };
assert.deepEqual(payload, { counts: audit.counts, source_pins: audit.source_pins, rows: audit.rows });
console.log(JSON.stringify(payload, null, 2));
NODE
```
