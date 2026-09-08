/**
 * @fileoverview M3 narrative composer extensions — 3.2.A.*, 3.2.R.*, cross-references
 * @module server/services/module3-extensions
 *
 * SINGLE SOURCE OF TRUTH for Module 3 Appendices (3.2.A.*) and Regional
 * Information (3.2.R.*). The core composer (module3Composer.ts) owns ONLY the
 * S/P subsections plus the structural 3.1/3.3 sections (17 sections total) and
 * does NOT emit any A/R leaves — defining A/R rules there as well produced
 * duplicate appendix leaves and region leakage in assembled eCTD packages.
 *
 * This file performs the region-specific dispatch (US/EU/JP/CA): the rich
 * appendix and regional generators below were ported here from the core
 * composer so the deterministic A/R narratives live in exactly one place.
 *
 * Why a separate file:
 *  - module3Composer.ts is already large; extending in-place creates a monolith
 *  - Appendices and Regional are submission-type-specific (US vs EU vs JP vs CA),
 *    so they need their own dispatcher
 */

import {
  composeModule3FromCanonicalSources,
  type CanonicalSource,
  type ComposedSection,
  type GeneratedTable,
  type CmcSourceType,
} from './module3Composer.js';
import { HUMAN_OR_ANIMAL_ORIGINS, isHumanOrAnimalOrigin, isReviewRequiredOrigin } from '../../shared/cmc/material-scope';

export type RegionCode = 'US' | 'EU' | 'JP' | 'CA';

// ── Local helpers ───────────────────────────────────────────────────────────

function val(sources: CanonicalSource[], field: string): string {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
}

function valArr(sources: CanonicalSource[], field: string): any[] {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function kvTable(title: string, data: Record<string, any>): GeneratedTable {
  return {
    title,
    headers: ['Property', 'Value'],
    rows: Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
  };
}

// ── 3.2.A.* — Appendices ────────────────────────────────────────────────────

interface AppendixRule {
  sectionKey: string;
  title: string;
  requiredSourceTypes: CmcSourceType[];
  optional: boolean;
  generator: (matched: CanonicalSource[]) => { narrative: string; tables: GeneratedTable[] };
}

const APPENDIX_RULES: AppendixRule[] = [
  {
    sectionKey: '3.2.A.1',
    title: 'Facilities and Equipment',
    requiredSourceTypes: ['manufacturing_process', 'drug_substance', 'drug_product', 'container_closure'],
    optional: false,
    generator: (m) => {
      const mfgSite = val(m, 'manufacturingSite');
      const route = val(m, 'manufacturingRoute');
      const processDesc = val(m, 'processDescription');
      const container = val(m, 'containerDescription');
      const closure = val(m, 'closureDescription');
      const justification = val(m, 'suitabilityJustification');
      const processSteps = valArr(m, 'processSteps');
      const tables: GeneratedTable[] = [];
      tables.push(kvTable('Facilities Summary', {
        'Manufacturing Site': mfgSite,
        'Synthetic/Manufacturing Route': route,
        // One recorded process text must not fill two rows.
        'Process Description': processDesc !== route ? processDesc : '',
      }));
      tables.push(kvTable('Primary Equipment / Container Closure', {
        'Primary Container': container,
        'Closure': closure,
        'Suitability Justification': justification,
      }));
      if (processSteps.length > 0) {
        tables.push({
          title: 'Unit Operations and Associated Equipment',
          headers: ['Step', 'Unit Operation', 'Equipment / Facility'],
          rows: processSteps.map((step: any, idx: number) => {
            if (typeof step === 'object' && step !== null) {
              return [
                String(idx + 1),
                step.operation || step.name || 'Unspecified',
                step.equipment || step.facility || mfgSite || '—',
              ];
            }
            return [String(idx + 1), String(step), mfgSite || '—'];
          }),
        });
      }
      return {
        narrative: `Per ICH M4Q, Section 3.2.A.1 (Facilities and Equipment) describes the facilities, equipment, and ` +
          `related controls used in the manufacture of the drug substance and drug product. ` +
          (mfgSite ? `Manufacturing operations are performed at ${mfgSite}. ` : 'Manufacturing site not yet recorded. ') +
          (route ? `The manufacturing route is: ${route}. ` : '') +
          // The register records ONE process text, so route and description
          // are often the same sentence — never printed twice.
          (processDesc && processDesc !== route ? `Process overview: ${processDesc}. ` : '') +
          `\n\nPrimary container closure equipment and packaging components used during manufacture and storage are ` +
          (container ? `${container}` + (closure ? ` with ${closure}` : '') + `. ` : `not yet specified. `) +
          (justification ? `Suitability of the equipment and packaging is supported by: ${justification}. ` : '') +
          /* This paragraph used to ASSERT, unconditionally and over nothing:
             that cleaning, equipment qualification and changeover procedures
             follow site SOPs and current GMP, and that cross-contamination
             controls, environmental monitoring and utilities meet the
             applicable standards. None of it is read from any field — the
             registers hold no cleaning record, no qualification protocol and
             no EM data — and the section carried no completeness marker, so a
             REQUIRED appendix scored 100% while its own summary said the
             manufacturing site was not yet recorded. A filed §3.2.A.1 is a
             representation to an agency about a facility. It now states what is
             recorded, and says plainly that the rest is not established here. */
          `\n\nFacility cleaning, equipment qualification, changeover, cross-contamination controls, environmental ` +
          `monitoring and utilities (HVAC, water, compressed gases) are governed by the site's own quality system ` +
          `and are evidenced by its GMP documentation, which this register does not hold; this section therefore ` +
          `makes no statement about their content or their compliance status. ` +
          (mfgSite || container || processDesc || route
            ? ''
            : `\n\nNo manufacturing site, process or container closure is recorded for this product, so the ` +
              `facilities and equipment used in its manufacture are NOT ESTABLISHED by this section. This is not a ` +
              `statement that none is used: it is a statement that the question has not been answered.`),
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.A.2',
    title: 'Adventitious Agents Safety Evaluation',
    requiredSourceTypes: ['drug_substance', 'characterization', 'manufacturing_process'],
    optional: true,
    generator: (m) => {
      const name = val(m, 'name');
      const route = val(m, 'manufacturingRoute');
      const processDesc = val(m, 'processDescription');
      const biologicalOrigin = val(m, 'biologicalOrigin');
      const cellLine = val(m, 'cellLine');
      const sourceOrganism = val(m, 'sourceOrganism');
      const viralSafety = val(m, 'viralSafetyEvaluation');
      const tseStatus = val(m, 'tseStatus');
      const modality = val(m, 'modality'); // 'small_molecule' | 'biologic' (preferred explicit signal)
      const molecularType = val(m, 'molecularType');

      // Detect biological origin. Prefer an explicit 'modality'/'molecularType'
      // field on the drug substance source; fall back to a heuristic regex only
      // when no structured signal is present. Regex uses word boundaries and
      // concrete biologic tokens to avoid false positives on chemical drug
      // substances whose name or processDescription incidentally mentions
      // 'tissue' or 'plasma' (e.g. 'tissue paper packaging', 'plasma etching').
      const explicitSmallMolecule = /^(small[-_ ]?molecule|synthetic|chemical)$/i.test(modality);
      const explicitBiologic =
        /^biologic(al)?$/i.test(modality) || /^biologic(al)?$/i.test(molecularType);
      /* Widened 2026-09-08 in the FAIL-CLOSED direction. The list missed the
         way an expression system is usually written down: a substance whose
         recorded route is "CHO cell culture" matched nothing (the pattern asks
         for cell LINE, not cell culture) and fell through to the branch below,
         which declared the section not applicable. A false positive here costs
         a section that asks for viral-safety data it may not need; a false
         negative files an adventitious-agents all-clear for a cell-culture
         product. The INN stems are added for the same reason — a substance
         named "belantezumab" is a monoclonal antibody by its name alone. */
      const biologicHeuristic =
        /\b(biologic|recombinant|monoclonal|vaccine|fermentation|mammalian|hybridoma|bioreactor|transgenic|plasmid|viral\s*vector)\b/i.test(`${route} ${processDesc} ${name}`) ||
        /\bmAb\b|\bcell[\s-]*(line|culture|bank)\b|\b(human|animal)\s*tissue\b|\bplasma[-\s]derived\b/i.test(`${route} ${processDesc} ${name}`) ||
        /\b(cho|hek\s*293|sf9|vero|per\.?c6|e\.?\s?coli|pichia|saccharomyces|baculovirus)\b/i.test(`${route} ${processDesc}`) ||
        /(mab|cept|kinra|ase|tide|parin)\b/i.test(String(name).trim().split(/\s+/).pop() || '');
      const isBiologic =
        explicitBiologic ||
        (!explicitSmallMolecule &&
          !!(biologicalOrigin || cellLine || sourceOrganism || viralSafety || tseStatus || biologicHeuristic));

      if (!isBiologic) {
        /* "Not applicable — no animal- or human-derived raw materials, no
           cell-line propagation, no fermentation step" is a POSITIVE SAFETY
           CLAIM, and `isBiologic` is false whenever NOTHING was recorded: every
           field it consults is absent and the name/route heuristic finds no
           word to fire on. So a drug substance row carrying only a name
           produced a full adventitious-agents all-clear. 3.2.A.3 was given a
           fail-closed branch for exactly this hazard; this section needs the
           same one, and the distinction is between "recorded as a chemical
           synthesis" and "nothing recorded either way". */
        const statedChemical = explicitSmallMolecule || Boolean(String(route || processDesc || '').trim());
        if (!statedChemical) {
          return {
            narrative: `Per ICH M4Q, Section 3.2.A.2 (Adventitious Agents Safety Evaluation) addresses viral, ` +
              `bacterial, fungal, mycoplasma, and TSE/BSE safety for biologically-derived materials. ` +
              `\n\nThe record states neither a manufacturing route nor a biological origin for ` +
              (name ? `${name}` : 'the drug substance') + `, so whether this section applies is NOT ESTABLISHED. ` +
              `This is not a statement that the substance is chemically synthesised: it is a statement that the ` +
              `question has not been answered. Record the manufacturing route, and the source organism or cell ` +
              `line where one is used, before this section is relied upon.`,
            tables: [kvTable('Adventitious Agents Safety Evaluation', {
              'Applicability': 'Not established — no manufacturing route or biological origin is recorded',
              'Drug Substance': name || '—',
              'Manufacturing Route': route || 'not recorded',
              'Biological Origin': 'not recorded',
            })],
          };
        }
        return {
          /* This paragraph used to assert that the substance is "synthesized
             via ${route} with no animal- or human-derived raw materials, no
             cell-line propagation, and no fermentation step recorded against
             it" — three claims, none of them read from any field. The register
             holds no raw-material origin here at all, so "no animal- or
             human-derived raw materials" was a positive safety claim over data
             this section never examined, in the one appendix whose subject is
             adventitious agents; and with the route printed verbatim it could
             read "synthesized via CHO cell culture with no cell-line
             propagation". What the record actually supports is narrower: no
             biological origin is RECORDED, and the origin of the raw materials
             is stated where it is captured, not here. */
          narrative: `Per ICH M4Q, Section 3.2.A.2 (Adventitious Agents Safety Evaluation) addresses viral, ` +
            `bacterial, fungal, mycoplasma, and TSE/BSE safety for biologically-derived materials. ` +
            `\n\nNo biological origin, source organism, cell line or fermentation step is recorded against ` +
            (name ? `${name}` : 'the drug substance') + `, whose recorded manufacturing route is: ${route || processDesc}. ` +
            `On that record this section does not apply to the drug substance itself. ` +
            `\n\nThis is a statement about the SUBSTANCE, not about every material used to make it: the origin of ` +
            `the raw and starting materials is recorded in §3.2.S.2.3 and that of the excipients in §3.2.P.4 and ` +
            `§3.2.A.3, and this section neither reads nor certifies them. ` +
            `Any future change to a biologically-derived starting material would trigger re-assessment of this section.`,
          tables: [kvTable('Adventitious Agents Safety Evaluation', {
            'Applicability': 'Does not apply to the drug substance — no biological origin is recorded',
            'Drug Substance': name || '—',
            'Manufacturing Route': route || '—',
            'Biological Origin': 'None recorded',
            'Raw Material Origin': 'Recorded in §3.2.S.2.3 — not assessed by this section',
            'Excipient Origin': 'Recorded in §3.2.A.3 — not assessed by this section',
          })],
        };
      }

      const tables: GeneratedTable[] = [];
      tables.push(kvTable('Adventitious Agents Safety — Source Materials', {
        'Drug Substance': name,
        'Biological Origin': biologicalOrigin,
        'Source Organism / Cell Line': sourceOrganism || cellLine,
        'Manufacturing Route': route,
        'TSE/BSE Status': tseStatus,
      }));
      if (viralSafety) {
        tables.push(kvTable('Viral Safety Evaluation Summary', {
          'Evaluation': viralSafety,
          'Reference': 'ICH Q5A(R2) — Viral Safety Evaluation of Biotechnology Products',
        }));
      }
      /* THE BIOLOGIC BRANCH, FAIL-CLOSED (2026-09-08).
         Its two sibling branches were each given a "NOT ESTABLISHED" marker,
         with long comments explaining why; this one was not, and
         composeAppendices scores a section 100 unless that marker appears. So a
         drug substance row holding nothing but the name "Trastuzumab" — which
         fires the INN-stem heuristic — produced a 100%-complete section
         asserting a three-part control strategy, in-process adventitious-agent
         testing, viral clearance steps, cell-bank characterisation and
         EMEA/410/01 control of animal-origin raw materials. None of it read
         from any field, in the appendix whose entire subject is adventitious
         agents, approvable and exportable as a filed leaf.
         What the section may state is what the register holds. The control
         strategy is now conditioned on a recorded viral safety evaluation, the
         TSE risk on a recorded status, and whatever is absent is named as not
         established rather than asserted. */
      const establishedFacts = [
        biologicalOrigin ? null : 'the biological origin',
        sourceOrganism || cellLine ? null : 'the source organism or cell line',
        viralSafety ? null : 'the viral safety evaluation (ICH Q5A(R2))',
        tseStatus ? null : 'the TSE/BSE risk assessment',
      ].filter(Boolean) as string[];

      return {
        narrative: `Per ICH M4Q and ICH Q5A(R2), Section 3.2.A.2 (Adventitious Agents Safety Evaluation) summarizes ` +
          `the controls implemented to assure freedom from adventitious viral, bacterial, fungal, mycoplasma, and ` +
          `TSE/BSE agents in the drug substance and drug product. ` +
          (name ? `The drug substance ${name} ` : 'The drug substance ') +
          (biologicalOrigin ? `is derived from ${biologicalOrigin}. ` : 'is recorded, or read by its name, as biologically derived. ') +
          (sourceOrganism || cellLine ? `Source material: ${sourceOrganism || cellLine}. ` : '') +
          (viralSafety
            ? `\n\nThe recorded control strategy is: ${viralSafety}. ` +
              `Cell bank characterization, end-of-production cell testing and downstream clearance data are ` +
              `referenced in 3.2.S.2.3.`
            : '') +
          (tseStatus ? `\n\nTSE/BSE risk assessment: ${tseStatus}. ` : '') +
          (establishedFacts.length > 0
            ? `\n\nThis register records ${establishedFacts.length === 4 ? 'none of' : 'neither'} ` +
              `${establishedFacts.join(', ')}${establishedFacts.length === 4 ? '' : ''}, so the adventitious-agents ` +
              `safety of this substance is NOT ESTABLISHED by this section. This is not a statement that the ` +
              `substance is unsafe or that no controls exist: it is a statement that this section has not been ` +
              `given them. Record them, per ICH Q5A(R2) and EMA EMEA/410/01, before this section is relied upon.`
            : `\n\nRaw materials of animal or human origin, where used, are controlled per EMA EMEA/410/01 and 9 CFR; ` +
              `their origin is recorded in §3.2.S.2.3 and §3.2.A.3 and is not assessed here.`),
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.A.3',
    title: 'Excipients',
    requiredSourceTypes: ['excipient', 'drug_product', 'formulation_record'],
    optional: true,
    generator: (m) => {
      const comp = val(m, 'composition');
      const formulationName = val(m, 'formulationName');
      /* Every recorded formulation's components, plus the excipient register
         itself — which records `origin` as a field rather than leaving it to be
         inferred from a name. `valArr` took the first matching array, so a
         project with several formulation versions was scanned for animal origin
         through one of them. */
      const componentRows = (sourceType: 'formulation_record' | 'drug_product') =>
        m
          .filter((s) => s.sourceType === sourceType)
          .flatMap((s) => {
            const rows = (s.sourcePayload as Record<string, any> | undefined)?.components;
            return Array.isArray(rows) ? rows.filter((c) => c && typeof c === 'object') : [];
          });
      const nameKey = (c: any) => String(c?.component || c?.name || c?.materialName || '').trim().toLowerCase();
      const textOfField = (...vals: unknown[]) => vals.map((v) => String(v ?? '').trim()).find(Boolean) || '';
      const excipientRegisterRows = m
        .filter((s) => s.sourceType === 'excipient')
        .map((s) => (s.sourcePayload || {}) as Record<string, any>)
        .filter((p) => String(p.materialName || '').trim() && String(p.status || '').toLowerCase() !== 'retired')
        .map((p) => ({
          component: p.materialName,
          role: p.functionInFormulation,
          origin: p.origin,
          tseCertification: p.tseCertificate,
        }));
      /* EVERY register row for a material name, not the first: two supplier
         rows for one excipient are two certificates to hold, and keeping only
         the first let the certified one speak for the uncertified one. */
      const registerRowsByName = new Map<string, typeof excipientRegisterRows>();
      for (const row of excipientRegisterRows) {
        const key = nameKey(row);
        if (!key) continue;
        const list = registerRowsByName.get(key) ?? [];
        list.push(row);
        registerRowsByName.set(key, list);
      }

      /**
       * 2026-09-07: ONE ROW PER MATERIAL, and every fact about it read the
       * fail-closed way.
       *
       * The formulation (or drug product) records a component's quantity and
       * function; the excipient register records its origin and its supplier's
       * TSE/BSE certificate. Read separately, a bovine gelatin capsule shell
       * whose CEP was on file was reported "NOT RECORDED" and the section
       * compiled at 0% with a certificate in hand. Joining them by material
       * name fixes that, but only if each fact is taken the safe way round:
       *
       *  - ORIGIN. The register's origin does NOT merely fill a blank. A
       *    formulation row typed "plant" over a material the register records
       *    as bovine used to mask it completely — the classification read the
       *    component's own field and nothing else — and the section issued the
       *    animal-free all-clear with "bovine" sitting unread two rows away.
       *    Both origins travel; ANY recorded human/animal origin puts the
       *    material in this section, and a disagreement is printed, not
       *    resolved.
       *  - CERTIFICATE. Inherited only when EVERY register row for the name
       *    carries one. One uncertified supplier row is one uncertified
       *    material.
       *  - IDENTITY. A material named by several formulation versions, or by
         both the formulation and the drug product's own composition array, is
       *    ONE excipient. It was counted once per row, so "a certificate is
       *    recorded for 2 of 2" could be one material counted twice.
       */
      const byMaterial = new Map<string, Record<string, any>>();
      const addComponent = (c: any) => {
        const key = nameKey(c);
        if (!key) return;
        const existing = byMaterial.get(key);
        if (!existing) {
          byMaterial.set(key, { ...c });
          return;
        }
        /* A second row for the same material adds what it knows and never
           overwrites what is already recorded — except that a human/animal
           origin always wins over one that is not. */
        for (const [field, aliases] of [['component', ['component', 'name', 'materialName']], ['role', ['role', 'function']], ['tseCertification', ['tseCertification', 'certification']]] as const) {
          if (!textOfField(...aliases.map((a) => existing[a])) ) {
            const v = textOfField(...aliases.map((a) => c[a]));
            if (v) existing[field] = v;
          }
        }
        const existingOrigin = textOfField(existing.origin, existing.source);
        const incomingOrigin = textOfField(c.origin, c.source);
        if (incomingOrigin && (!existingOrigin || (isHumanOrAnimalOrigin(incomingOrigin) && !isHumanOrAnimalOrigin(existingOrigin)))) {
          existing.origin = incomingOrigin;
        }
      };
      /* Read the drug product's composition array from the DRUG PRODUCT source
         only, not through a first-match `valArr` over every matched source:
         that re-read the formulation record's own array — formulation_record is
         one of this section's source types — and every excipient count the
         section printed was doubled. */
      for (const c of [...componentRows('formulation_record'), ...componentRows('drug_product')]) addComponent(c);

      for (const [key, entry] of byMaterial) {
        const rows = registerRowsByName.get(key);
        if (!rows || rows.length === 0) continue;
        if (!textOfField(entry.role, entry.function)) {
          const role = textOfField(...rows.map((r) => r.role));
          if (role) entry.role = role;
        }
        /* The register's own origin, kept BESIDE the component's rather than
           behind it — see the note above. */
        const registerOrigin = rows.map((r) => textOfField(r.origin)).find((o) => o && isHumanOrAnimalOrigin(o))
          || textOfField(...rows.map((r) => r.origin));
        if (registerOrigin) entry.registerOrigin = registerOrigin;
        const certificates = rows.map((r) => textOfField(r.tseCertification));
        entry.uncertifiedRegisterRows = certificates.filter((c) => !c).length;
        if (!textOfField(entry.tseCertification, entry.certification) && entry.uncertifiedRegisterRows === 0) {
          entry.tseCertification = certificates[0];
        }
      }
      /* A register excipient no formulation names is still an excipient of this
         product's record, and is reported on its own — under the same rules. */
      for (const [key, rows] of registerRowsByName) {
        if (byMaterial.has(key)) continue;
        const certificates = rows.map((r) => textOfField(r.tseCertification));
        byMaterial.set(key, {
          component: textOfField(...rows.map((r) => r.component)),
          role: textOfField(...rows.map((r) => r.role)),
          origin: rows.map((r) => textOfField(r.origin)).find((o) => o && isHumanOrAnimalOrigin(o))
            || textOfField(...rows.map((r) => r.origin)),
          uncertifiedRegisterRows: certificates.filter((c) => !c).length,
          tseCertification: certificates.filter((c) => !c).length === 0 ? certificates[0] : '',
        });
      }
      const components = [...byMaterial.values()];
      /* Whether anything at all was recorded. "No excipients of human or animal
         origin are used" is a POSITIVE SAFETY CLAIM, and it was made whenever
         the scan found nothing — including when there was nothing to scan. A
         project with no formulation and no excipient register got a TSE/BSE
         all-clear over zero data. */
      const excipientRecordCount = m.filter(
        (s) => s.sourceType === 'excipient' || s.sourceType === 'formulation_record',
      ).length;
      /* The guard above counts SOURCES, and the claim rests on COMPONENTS. A
         project whose only excipient row is retired, or whose formulation
         version was saved with an empty components array, has a source count
         above zero and nothing to scan — so the fail-closed branch missed it and
         the section, testing `originRecorded === components.length` with both
         sides zero, issued the animal-free all-clear over no data at all. What
         the claim needs is at least one component to have been examined. */
      const hasComponentsToScan = components.length > 0;
      const originRecorded = components.filter((c: any) => String(c?.origin || c?.source || c?.registerOrigin || '').trim()).length;
      const excipientSources = m.filter((s) => s.sourceType === 'excipient');
      const novelExcipients = excipientSources.filter((e) => e.sourcePayload?.novel === true);

      // ── Novel excipients (ICH Q3C / FDA novel-excipient qualification) ──
      // Detected via dedicated `excipient` sources flagged novel:true.
      if (novelExcipients.length > 0) {
        return {
          narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients) addresses excipients requiring additional safety ` +
            `qualification. ${novelExcipients.length} novel excipient(s) are used in the drug product formulation` +
            (formulationName ? ` (${formulationName})` : '') + `. ` +
            `Safety qualification data per ICH Q3C / FDA Guidance for Industry — Nonclinical Studies for the Safety ` +
            `Evaluation of Pharmaceutical Excipients is provided below.`,
          tables: [{
            title: 'Novel Excipients — Safety Qualification',
            headers: ['Excipient', 'Function', 'Concentration', 'Safety Studies'],
            rows: novelExcipients.map((e) => [
              String(e.sourcePayload?.materialName || 'Unknown'),
              String(e.sourcePayload?.function || '—'),
              String(e.sourcePayload?.concentration || '—'),
              String(e.sourcePayload?.safetyStudies || 'See M4'),
            ]),
          }],
        };
      }

      // ── Excipients of human or animal origin (TSE/BSE) ──
      // Detect human/animal-origin excipients from structured formulation
      // components.
      //
      // Strategy:
      //  (1) Trust an explicit per-component `origin` field when present
      //      ('animal', 'human', 'bovine', 'porcine', ovine, equine, murine,
      //      hamster). Plant/mineral/synthetic origins do NOT trigger this
      //      section.
      //  (2) Fall back to a name-based regex restricted to unambiguously
      //      human/animal tokens. Excluded intentionally:
      //        - 'stearate' — magnesium stearate is overwhelmingly vegetable
      //          grade in modern pharma and CANNOT be inferred animal-origin
      //          from the name alone.
      //        - 'lactose' — should be declared via the structured origin field.
      //        - 'cholesterol' — can be synthetic or phytosterol-derived.
      //  (3) When the only signal is the regex fallback (not an explicit
      //      origin field), the section is rendered as POTENTIAL / review-required
      //      rather than asserting human/animal origin.
      /* The same list the mapper and the register surface use — three copies of
         a twelve-token regex is three places for it to drift. */
      const explicitAnimalOriginRe = new RegExp(`^(${HUMAN_OR_ANIMAL_ORIGINS.join('|')})$`, 'i');
      const animalNameRe = /\b(gelatin|tallow|albumin|serum|collagen|chondroitin|heparin|insulin|bovine|porcine|ovine|equine|murine|hamster|lanolin|shellac)\b/i;
      const humanNameRe = /\bhuman[\s-]*(serum|albumin|plasma|tissue|cell|derived)\b/i;

      /* The material register offers `fermentation` as an origin, and it is
         neither an animal origin nor an exclusion: a fermentation-derived
         excipient is precisely the EMEA/410/01 and ICH Q5A question, because the
         culture media can carry animal-derived components. Classifying it as
         'none' let the section state that every recorded origin was plant,
         mineral or synthetic — a category the register never recorded. */


      /* Both recorded origins are read — the component's own and the excipient
         register's. Reading only the component's let a formulation row typed
         "plant" over a material the register records as bovine produce the
         animal-free all-clear. Whichever field carries an animal origin, the
         material is in this section. */
      function classifyComponent(c: any): 'explicit' | 'name-fallback' | 'review' | 'none' {
        if (typeof c !== 'object' || c === null) return 'none';
        const originFields = [String(c.origin || c.source || '').trim(), String(c.registerOrigin || '').trim()].filter(Boolean);
        if (originFields.some((o) => explicitAnimalOriginRe.test(o))) return 'explicit';
        if (originFields.some((o) => isReviewRequiredOrigin(o))) return 'review';
        const text = `${c.component || ''} ${c.name || ''}`;
        if (animalNameRe.test(text) || humanNameRe.test(text)) return 'name-fallback';
        return 'none';
      }

      /** What the Origin cell says — both origins when the records disagree. */
      function originCell(c: any): string {
        const own = String(c?.origin || c?.source || '').trim();
        const reg = String(c?.registerOrigin || '').trim();
        if (own && reg && own.toLowerCase() !== reg.toLowerCase()) {
          return `${reg} (excipient register) — the formulation records "${own}": CONFLICT, resolved to the animal-origin record pending correction`;
        }
        return own || reg;
      }

      const explicitOriginComponents = components.filter((c) => classifyComponent(c) === 'explicit');
      const nameFallbackComponents = components.filter((c) => classifyComponent(c) === 'name-fallback');
      const reviewOriginComponents = components.filter((c) => classifyComponent(c) === 'review');
      const humanAnimalComponents = [...explicitOriginComponents, ...nameFallbackComponents];

      const compPotentiallyAnimal = !!comp && (animalNameRe.test(comp) || humanNameRe.test(comp));

      const confidence: 'explicit' | 'potential' | 'none' =
        explicitOriginComponents.length > 0
          ? 'explicit'
          : nameFallbackComponents.length > 0 || compPotentiallyAnimal
            ? 'potential'
            : 'none';

      const tables: GeneratedTable[] = [];

      /* Nothing recorded is not the same as nothing found. Fail closed: the
         section reports that the question is unanswered rather than clearing
         the product of animal-origin excipients over an empty register. */
      /* Gated on having a COMPONENT to scan, not on having a source row. A
         retired excipient, or a formulation version saved with an empty
         components array, is a source that contributes nothing — and the
         source-count test let that case through to a narrative whose
         `originRecorded === components.length` was 0 === 0, i.e. an animal-free
         all-clear over nothing at all. */
      if (!hasComponentsToScan && !comp) {
        const rowsButNothingToScan = excipientRecordCount > 0;
        tables.push(kvTable('Excipients of Human or Animal Origin', {
          Applicability: rowsButNothingToScan
            ? 'Not established — the records on file name no components'
            : 'Not established — no excipient or formulation record is on file',
          'Drug Product Formulation': formulationName || '—',
        }));
        return {
          narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients of Human or Animal Origin) addresses TSE/BSE, ` +
            `viral, and other adventitious-agent risks associated with excipients of human or animal origin. ` +
            (rowsButNothingToScan
              ? `\n\n${excipientRecordCount} excipient or formulation record(s) are on file and none of them names a ` +
                `component this section can examine — every one is retired, or records no composition. Whether any ` +
                `excipient is of human or animal origin is therefore NOT ESTABLISHED by this section. `
              : `\n\nNo excipient or formulation record is on file for this product, so whether any excipient is of ` +
                `human or animal origin is NOT ESTABLISHED by this section. `) +
            `This is not a statement that none is used: ` +
            `it is a statement that the question has not been answered. Record the formulation and the excipient ` +
            `specifications, each with its origin, before this section is relied upon.`,
          tables,
        };
      }

      if (confidence === 'none') {
        tables.push(kvTable('Excipients of Human or Animal Origin', {
          'Applicability':
            reviewOriginComponents.length > 0
              ? `Review required — ${reviewOriginComponents.length} excipient(s) of fermentation or cell-culture origin`
              : originRecorded === components.length && components.length > 0
                ? 'Not applicable — no excipients of human or animal origin'
                : 'No human or animal origin found among the recorded excipients; origin is not recorded for all of them',
          'Excipients Recorded': String(components.length),
          'Origin Recorded For': `${originRecorded} of ${components.length}`,
          'Drug Product Formulation': formulationName || '—',
          'Composition': comp || '—',
        }));
        return {
          narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients of Human or Animal Origin) addresses TSE/BSE, ` +
            `viral, and other adventitious-agent risks associated with excipients of human or animal origin. ` +
            (reviewOriginComponents.length > 0
              ? `\n\n${reviewOriginComponents.length} excipient(s) are recorded with a fermentation or cell-culture origin. ` +
                `That is not an exclusion: EMA EMEA/410/01 rev. 3 and ICH Q5A(R2) reach a fermentation-derived ` +
                `excipient through the animal-derived components its culture media may carry, so whether these are ` +
                `free of human or animal material is NOT ESTABLISHED by this section. ` +
                `Record the media components, or a supplier statement that none is of animal origin. `
              : '') +
            (originRecorded === components.length && components.length > 0 && reviewOriginComponents.length === 0
              ? `\n\nNo excipients of human or animal origin are used in the drug product formulation` +
                (formulationName ? ` (${formulationName})` : '') + `. ` +
                `All ${components.length} recorded excipients declare an origin that is plant, mineral or synthetic, and comply with the relevant compendial ` +
                `monographs (USP/NF, Ph. Eur., JP) as detailed in 3.2.P.4. `
              : /* Origin is recorded for only some of them. The claim is scoped
                   to what was actually declared, and the gap is named. */
                `\n\nNo excipient of human or animal origin is identified among the ${components.length} recorded for the drug product formulation` +
                (formulationName ? ` (${formulationName})` : '') + `. ` +
                `Origin is recorded for ${originRecorded} of them; for the remaining ${components.length - originRecorded} it is not recorded, and their origin is NOT established by this section. `) +
            /* The safety CONCLUSION may only be drawn where the origins it rests
               on were actually recorded. It sat outside this conditional and was
               emitted by both arms, so the section stated that no TSE/BSE
               documentation was required in the same paragraph as it stated that
               the origin of some excipients was not established — a positive
               safety claim over the absence of a signal in unscanned data. A
               gelatin capsule shell recorded without its origin field produced a
               written all-clear. */
            (originRecorded === components.length && components.length > 0 && reviewOriginComponents.length === 0
              ? `\n\nAccordingly, no additional TSE/BSE or viral safety documentation is required for this section. ` +
                `Any future formulation change introducing a human- or animal-derived excipient would trigger ` +
                `re-evaluation and supplementary safety documentation per EMA EMEA/410/01 rev. 3.`
              : `\n\nWhether additional TSE/BSE or viral safety documentation is required is therefore NOT established ` +
                `by this section: that conclusion rests on the origin of every excipient, and ${components.length - originRecorded} ` +
                `of ${components.length} have none recorded. Record the origin of each, per EMA EMEA/410/01 rev. 3, ` +
                `before this section is relied on.`),
          tables,
        };
      }

      tables.push({
        title: confidence === 'potential'
          ? 'Excipients of Human or Animal Origin — POTENTIAL (Review Required)'
          : 'Excipients of Human or Animal Origin',
        headers: ['Excipient', 'Function / Role', 'Origin', 'TSE/BSE Certification'],
        rows: humanAnimalComponents.length > 0
          ? humanAnimalComponents.map((c: any) => [
              c.component || c.name || 'Unknown',
              c.role || c.function || '—',
              originCell(c) || (confidence === 'potential'
                ? 'Potential animal/human origin (name-based fallback — review required)'
                : 'Animal/human origin (per composition)'),
              /* The recorded certificate, or the fact that none is recorded.
                 This fell back to the literal 'Certificate on file
                 (CEP/TSE-compliant)' whenever the field was empty — and the
                 excipient register emits '' for a blank one — so a gelatin
                 capsule shell whose CEP has not been obtained was declared
                 certified, in the one CTD section whose purpose is to declare
                 animal-origin risk. */
              String(c.tseCertification || c.certification || '').trim() ||
                (Number(c.uncertifiedRegisterRows || 0) > 0
                  ? `NOT RECORDED — ${c.uncertifiedRegisterRows} register row(s) for this material carry no TSE/BSE certificate`
                  : 'NOT RECORDED — no TSE/BSE certificate is on file for this excipient'),
            ])
          : [['(Per composition statement)', '—',
              confidence === 'potential'
                ? 'Potential human/animal-origin material — review required'
                : 'Human/animal-origin material detected',
              confidence === 'potential' ? 'Confirm CEP/TSE certification with supplier' : 'CEP/TSE certification required']],
      });

      /* How many of the identified excipients actually carry a certificate.
         The paragraph below used to assert that EACH was qualified through a
         country-of-origin statement, a CEP and a viral safety evaluation —
         none of which was read from any field. */
      const certified = humanAnimalComponents.filter(
        (c: any) => String(c.tseCertification || c.certification || '').trim(),
      );
      const uncertified = humanAnimalComponents.length - certified.length;

      const leadParagraph = confidence === 'explicit'
        ? `${explicitOriginComponents.length > 0 ? explicitOriginComponents.length : 'One or more'} excipient(s) ` +
          `of human or animal origin have been identified. ` +
          (humanAnimalComponents.length === 0
            ? `Their qualification is not established by this section. `
            : uncertified === 0
              ? `A TSE/BSE certificate is recorded for each, reported above; the country-of-origin statement and the ` +
                `viral safety evaluation required by EMA EMEA/410/01 rev. 3 are not held by this register and are ` +
                `not established by this section. `
              : certified.length === 0
                ? `NO TSE/BSE certificate is recorded for any of them, so their qualification under EMA EMEA/410/01 ` +
                  `rev. 3 is NOT established by this section. `
                : `A TSE/BSE certificate is recorded for ${certified.length} of ${humanAnimalComponents.length}; for the ` +
                  `remaining ${uncertified} no certificate is on file and their qualification under EMA EMEA/410/01 ` +
                  `rev. 3 is NOT established by this section. `)
        : `Potential human- or animal-origin excipient(s) have been flagged by a name-based heuristic and require ` +
          `confirmation. Where confirmed, each component must be qualified through (i) a documented origin / ` +
          `country-of-origin statement, (ii) TSE/BSE compliance per EMA EMEA/410/01 rev. 3 (Certificate of ` +
          `Suitability — CEP), and (iii) viral safety evaluation where applicable. ` +
          /* A NAME is not an origin determination, and this branch is reached
             precisely because no origin was recorded for the flagged material.
             It carried no marker, so a section that had identified a possible
             gelatin and qualified nothing scored 100% complete with no missing
             inputs — the reviewer's dashboard called the TSE/BSE appendix
             finished on the strength of a regex. */
          `Whether these components are of human or animal origin is NOT established by this section: the flag ` +
          `rests on their names, and no origin is recorded for them. ` +
          `Components identified as plant, mineral, or synthetic in origin should be re-tagged via the structured ` +
          `origin field to suppress this flag.`;

      return {
        narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients of Human or Animal Origin) summarizes the controls ` +
          `applied to excipients derived from human or animal sources used in the drug product formulation. ` +
          (formulationName ? `Formulation: ${formulationName}. ` : '') +
          `\n\n${leadParagraph} ` +
          `\n\nSpecifications, analytical procedures, and supplier qualification details are provided in 3.2.P.4 ` +
          `(Control of Excipients). Audit trails for vendor changes are maintained per the site quality system.`,
        tables,
      };
    },
  },
];

// ── 3.2.R.* — Regional ──────────────────────────────────────────────────────

interface RegionalSubsection {
  sectionKey: string;
  title: string;
  region: RegionCode;
  /**
   * The source-payload fields this subsection's generator reads. Completeness is
   * the fraction of these actually present, so a pointer section with nothing
   * recorded cannot present itself as finished. Keep in step with the generator:
   * a field read but not declared would be invisible to the score.
   */
  requiredFields: string[];
  generator: (matched: CanonicalSource[]) => { narrative: string; tables: GeneratedTable[] };
}

const REGIONAL_SUBSECTIONS: RegionalSubsection[] = [
  {
    sectionKey: '3.2.R.1.US',
    title: 'Regional Information — United States (FDA)',
    region: 'US',
    requiredFields: ['dosageFormDescription', 'strength', 'composition', 'manufacturingSite', 'batchNumber', 'batchSize'],
    generator: (m) => {
      const form = val(m, 'dosageFormDescription');
      const strength = val(m, 'strength');
      const comp = val(m, 'composition');
      const mfgSite = val(m, 'manufacturingSite');
      const batchNum = val(m, 'batchNumber');
      const batchSize = val(m, 'batchSize');
      const tables: GeneratedTable[] = [];
      tables.push(kvTable('US Regional Information — Submission Summary', {
        'Region': 'United States — FDA',
        'Submission Type': 'NDA / ANDA / BLA (as applicable)',
        'Dosage Form': form,
        'Strength': strength,
        'Manufacturing Site': mfgSite,
        'Representative Batch': batchNum,
        'Batch Size': batchSize,
      }));
      tables.push({
        title: 'US-Specific Documentation Pointers',
        headers: ['Item', 'Reference / Location'],
        rows: [
          // NDA / ANDA — governed by 21 CFR Part 314
          ['Executed Batch Records (NDA / ANDA)', 'Provided per 21 CFR 314.50(d)(1)(ii) — see 3.2.P.3.4'],
          ['Comparability Protocols (NDA / ANDA)', 'Per 21 CFR 314.70 — referenced in 3.2.P.2 / 3.2.P.3'],
          // BLA — governed by 21 CFR Parts 600–680
          ['Executed Batch Records (BLA)', 'Provided per 21 CFR 601.2 (content & format of BLA) — see 3.2.P.3.4'],
          ['Post-Approval Changes (BLA)', 'Per 21 CFR 601.12 — referenced in 3.2.P.2 / 3.2.P.3'],
          // Cross-application items
          ['Method Validation Package', 'Per FDA Guidance for Industry (Analytical Procedures and Methods Validation)'],
          ['Container Closure (Type III DMF)', 'Letter of Authorization on file — see 3.2.P.7'],
          ['Establishment Information', `FEI / DUNS for ${mfgSite || '[site]'} — see Form FDA 356h`],
        ],
      });
      return {
        narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — United States contains FDA-specific ` +
          `information required to support a US marketing application (NDA, ANDA, or BLA, as applicable). ` +
          (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
          (mfgSite ? `Primary US-listed manufacturing site: ${mfgSite}. ` : '') +
          `\n\nThis section provides pointers to the regulations applicable by submission type. For NDA / ANDA: ` +
          `(i) executed batch records per 21 CFR 314.50(d)(1)(ii), (ii) the method validation package per ` +
          `FDA Guidance for Industry, (iii) comparability protocols per 21 CFR 314.70, and (iv) Type III Drug ` +
          `Master File (DMF) letters of authorization for container closure components. For BLA: equivalent ` +
          `content per 21 CFR 601.2 (BLA content & format) and 21 CFR 601.12 (post-approval changes), with ` +
          `additional product- and establishment-specific requirements under 21 CFR Parts 600–680. ` +
          `\n\nEstablishment information (FEI / DUNS / registration status) for all manufacturing, packaging, ` +
          `testing, and labeling sites listed in Form FDA 356h is cross-referenced. Field copies, certifications, ` +
          `and patent/exclusivity information are provided in Module 1 (administrative). ` +
          (comp ? `\n\nComposition statement: ${comp}.` : ''),
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.R.1.EU',
    requiredFields: ['dosageFormDescription', 'strength', 'composition'],
    title: 'Regional Information — European Union (EMA)',
    region: 'EU',
    generator: (m) => {
      const form = val(m, 'dosageFormDescription');
      const strength = val(m, 'strength');
      const comp = val(m, 'composition');
      const tables: GeneratedTable[] = [];
      tables.push(kvTable('EU Regional Information — Submission Summary', {
        'Region': 'European Union — EMA',
        'Submission Type': 'MAA (Centralised / Decentralised / National)',
        'Dosage Form': form,
        'Strength': strength,
      }));
      tables.push({
        title: 'EU-Specific Documentation Pointers',
        headers: ['Item', 'Reference / Location'],
        rows: [
          ['QP Declaration on GMP Compliance', 'Per Annex 16 of EU GMP Guide — included in Module 1.5.2'],
          ['Manufacturing Authorisation', 'Copy of MIA for each EU-based site — Module 1.2'],
          ['Process Validation Scheme', 'Per Annex 15 (Qualification & Validation) — cross-ref 3.2.P.3.5'],
          ['Certificate of Suitability (CEP)', 'Where applicable, for drug substance and excipients — Module 1'],
          ['Environmental Risk Assessment', 'Per EMA/CHMP/SWP/4447/00 Rev. 1 — Module 1.6'],
          ['TSE/BSE Compliance', 'Per EMA EMEA/410/01 rev. 3 — cross-ref 3.2.A.2 and 3.2.A.3'],
        ],
      });
      return {
        narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — European Union contains EMA-specific ` +
          `information required to support a Marketing Authorisation Application (MAA) under the centralised, ` +
          `decentralised, mutual recognition, or national procedure. ` +
          (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
          `\n\nThis section provides pointers to the Qualified Person (QP) declaration on GMP compliance ` +
          `(per Annex 16 of the EU GMP Guide), Manufacturing Authorisations (MIA) for each EU-based ` +
          `manufacturing site, the process validation scheme aligned with Annex 15 (Qualification & ` +
          `Validation), and Certificates of Suitability (CEP) for the drug substance and applicable excipients. ` +
          `\n\nEnvironmental Risk Assessment (ERA) per EMA/CHMP/SWP/4447/00 Rev. 1 and TSE/BSE compliance ` +
          `documentation per EMA EMEA/410/01 rev. 3 are provided in Module 1.6 and cross-referenced from ` +
          `3.2.A.2 / 3.2.A.3 of this dossier. ` +
          (comp ? `\n\nComposition statement: ${comp}.` : ''),
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.R.1.JP',
    requiredFields: ['dosageFormDescription', 'strength', 'composition'],
    title: 'Regional Information — Japan (PMDA / MHLW)',
    region: 'JP',
    generator: (m) => {
      const form = val(m, 'dosageFormDescription');
      const strength = val(m, 'strength');
      const comp = val(m, 'composition');
      const tables: GeneratedTable[] = [];
      tables.push(kvTable('Japan Regional Information — Submission Summary', {
        'Region': 'Japan — PMDA / MHLW',
        'Submission Type': 'J-NDA (Shinyaku Shinsei)',
        'Dosage Form': form,
        'Strength': strength,
      }));
      tables.push({
        title: 'Japan-Specific Documentation Pointers',
        headers: ['Item', 'Reference / Location'],
        rows: [
          ['Foreign Manufacturer Accreditation', 'Per Article 13-3, PMD Act — Module 1 (J-administrative)'],
          ['Marketing Authorization Holder (MAH)', 'Designated MAH details — Module 1'],
          ['JP Compendial Compliance', 'JP 18th Edition — referenced in 3.2.P.4 and 3.2.P.5'],
          ['GMP Compliance Certificate', 'Per MHLW Ordinance No. 179 — Module 1'],
          ['Japanese-Specific Specifications', 'Where JP monograph differs from USP/Ph. Eur. — see 3.2.P.5'],
          ['Stability Data — Japanese Climate Zone', 'Zone II data per ICH Q1A(R2) (long-term 25 °C / 60% RH; intermediate 30 °C / 65% RH) per PMDA expectations — cross-ref 3.2.P.8'],
        ],
      });
      return {
        narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — Japan contains PMDA / MHLW-specific ` +
          `information required to support a Japanese New Drug Application (J-NDA, Shinyaku Shinsei) ` +
          `under the Pharmaceuticals and Medical Devices (PMD) Act. ` +
          (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
          `\n\nThis section provides pointers to Foreign Manufacturer Accreditation under Article 13-3 of ` +
          `the PMD Act, designation of the Japanese Marketing Authorization Holder (MAH), and GMP ` +
          `compliance certification per MHLW Ordinance No. 179. ` +
          `\n\nCompendial compliance with the Japanese Pharmacopoeia (JP 18th Edition) is documented in ` +
          `3.2.P.4 (Control of Excipients) and 3.2.P.5 (Control of Drug Product). Where JP monograph ` +
          `requirements differ from USP or Ph. Eur., the Japan-specific specifications are presented. ` +
          `Stability data covering Japanese climate Zone II per ICH Q1A(R2) (long-term 25 °C / 60% RH; ` +
          `intermediate 30 °C / 65% RH), as expected by PMDA, are cross-referenced to 3.2.P.8. ` +
          (comp ? `\n\nComposition statement: ${comp}.` : ''),
        tables,
      };
    },
  },
  {
    sectionKey: '3.2.R.1.CA',
    requiredFields: ['dosageFormDescription', 'strength'],
    title: 'Regional Information — Canada (Health Canada)',
    region: 'CA',
    generator: (m) => {
      const form = val(m, 'dosageFormDescription');
      const strength = val(m, 'strength');
      const tables: GeneratedTable[] = [];
      tables.push(kvTable('Canada Regional Information — Submission Summary', {
        'Region': 'Canada — Health Canada',
        'Submission Type': 'NDS / ANDS',
        'Dosage Form': form,
        'Strength': strength,
      }));
      tables.push({
        title: 'Canada-Specific Documentation Pointers',
        headers: ['Item', 'Reference / Location'],
        rows: [
          ['Yearly Biologic Product Report (YBPR)', 'Per Health Canada Guidance — Submission of Biologic Drug Substance and Product Information'],
          ['Certified Product Information Document (CPID)', 'Module 1 (Canadian administrative)'],
          ['Drug Master File (Type I — Drug Substance)', 'Letter of Access on file — cross-ref 3.2.S'],
        ],
      });
      return {
        narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — Canada contains Health Canada-specific ` +
          `information required to support a New Drug Submission (NDS / ANDS). ` +
          (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
          `\n\nThis section provides pointers to the Certified Product Information Document (CPID), the Yearly ` +
          `Biologic Product Report (YBPR) commitment where applicable, and Drug Master File letters of access for ` +
          `the drug substance and packaging components.`,
        tables,
      };
    },
  },
];

// ── Cross-reference injection ───────────────────────────────────────────────

/**
 * Map of sections that should reference other sections inline. The composer
 * doesn't know "stability data is in 3.2.S.7" without being told.
 */
const CROSS_REFERENCE_MAP: Record<string, Array<{ target: string; phrase: string }>> = {
  '3.2.S.4': [{ target: '3.2.S.7', phrase: 'see Stability' }],
  '3.2.P.5': [
    { target: '3.2.P.8', phrase: 'see Stability' },
    { target: '3.2.S.4', phrase: 'see Drug Substance Specification' },
  ],
  '3.2.P.8': [{ target: '3.2.S.7', phrase: 'see Drug Substance Stability' }],
  '3.2.P.2': [
    { target: '3.2.P.1', phrase: 'see Description and Composition' },
    { target: '3.2.P.5', phrase: 'see Drug Product Specification' },
  ],
  '3.2.P.3': [{ target: '3.2.P.5', phrase: 'see Specification' }],
  '2.3.S': [{ target: '3.2.S', phrase: 'see Module 3.2.S' }],
  '2.3.P': [{ target: '3.2.P', phrase: 'see Module 3.2.P' }],
  '2.4': [{ target: '4.2', phrase: 'see Module 4.2 study reports' }],
  '2.7.1': [{ target: '5.3.1', phrase: 'see Module 5.3.1' }],
  '2.7.3': [{ target: '5.3.5', phrase: 'see Module 5.3.5' }],
  '2.7.4': [{ target: '5.3.5', phrase: 'see Module 5.3.5' }],
};

/**
 * Inject cross-reference pointers into a composed section's narrative.
 * Returns a new ComposedSection — does not mutate the input.
 */
export function injectCrossReferences(
  section: ComposedSection,
  presentSectionKeys: Set<string>
): ComposedSection {
  const refs = CROSS_REFERENCE_MAP[section.sectionKey] || [];
  if (refs.length === 0) return section;

  const validRefs = refs.filter(r =>
    Array.from(presentSectionKeys).some(k => k.startsWith(r.target))
  );
  if (validRefs.length === 0) return section;

  const refPhrases = validRefs.map(r => `${r.phrase} (${r.target})`).join('; ');
  const augmented = `${section.narrativeDraft}\n\nCross-references: ${refPhrases}.`;

  return { ...section, narrativeDraft: augmented };
}

/**
 * Inject cross-references across an entire composition pass.
 */
export function injectAllCrossReferences(sections: ComposedSection[]): ComposedSection[] {
  const presentKeys = new Set(sections.map(s => s.sectionKey));
  return sections.map(s => injectCrossReferences(s, presentKeys));
}

// ── Top-level composer ──────────────────────────────────────────────────────

/**
 * Compose appendix (3.2.A.*) sections from canonical sources.
 */
/**
 * Which composed appendices actually enter a dossier.
 *
 * An OPTIONAL appendix with no matched source is not emitted at all: an
 * unmatched optional rule scores 100% complete, so emitting it would put a
 * fully-complete section into the dossier asserting things about data nobody
 * recorded. A REQUIRED appendix is emitted with its honest incompleteness.
 *
 * This lived in the compile route's own `.filter()`, so composeFullModule3 —
 * which the submission-package orchestrator calls twice — emitted appendices
 * the compile route suppressed. Two paths producing the same three CTD sections
 * under different rules is the duplication the working agreement forbids,
 * at the point where the two copies decide what enters a package.
 */
export function emittableAppendices(sections: ComposedSection[]): ComposedSection[] {
  return sections.filter(
    (section) =>
      section.lineage.length > 0 ||
      (section.structuredPayload as { optional?: boolean } | undefined)?.optional === false,
  );
}

/**
 * The sentences of an appendix narrative that say what is NOT ESTABLISHED —
 * the section's own statement of its missing inputs, one entry per sentence.
 */
function notEstablishedStatements(narrative: string): string[] {
  /* A sentence ends at a period followed by whitespace AND something that
     starts a sentence. Splitting on the period alone cut "EMA EMEA/410/01
     rev. 3 is NOT established by this section." in two, and the staffer's list
     of what to record read, in full: "3 is NOT established by this section."
     A fragment is not an instruction. */
  const sentences = narrative
    .split(/(?<=\.)\s+(?=[A-Z(\u2022])/)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => NOT_ESTABLISHED_RE.test(x) && x.split(' ').length > 3);
  return sentences.length > 0 ? sentences : ['not established by the recorded sources'];
}

/**
 * The generators' fail-closed marker: a capitalised NOT. The same generators
 * scope what they establish in lower case — "the country-of-origin statement
 * … [is] not established by this section" beside a certificate recorded for
 * every animal-origin excipient — and a case-insensitive test read that
 * scoping as establishing nothing, so §3.2.A.3 compiled at 0% with every
 * certificate on file. Case-sensitive on the marker, either case on the word.
 */
const NOT_ESTABLISHED_RE = /\bNOT (?:ESTABLISHED|established)\b/;

export function composeAppendices(sourceObjects: CanonicalSource[]): ComposedSection[] {
  return APPENDIX_RULES.map(rule => {
    /* A RETIRED source feeds nothing here either. The core composer was given
       this rule and the note said retirement is honoured "for every source
       type"; composeAppendices filtered on sourceType alone, so a retired
       excipient still populated appendix lineage, still scored the section 100%,
       and still fed the val()/valArr() reads in the 3.2.A.1 and 3.2.A.2
       generators. One rule, both composers. */
    const inScope = sourceObjects.filter(s => rule.requiredSourceTypes.includes(s.sourceType));
    const matched = inScope.filter(
      (s) => String((s.sourcePayload as Record<string, unknown> | undefined)?.status ?? '').trim().toLowerCase() !== 'retired',
    );
    const generated = rule.generator(matched);
    /* Completeness is what the generator could actually SAY, not whether a row
       of the right type exists. `matched.length > 0 ? 100 : ...` scored a
       section 100% with no missing inputs on the strength of one matched source
       regardless of what it established — including the fail-closed branches
       that exist precisely to report that nothing is established. A section
       whose own narrative says NOT ESTABLISHED is not a complete section. */
    const establishesNothing = NOT_ESTABLISHED_RE.test(generated.narrative);
    const completeness = matched.length === 0
      ? (rule.optional ? 100 : 0)
      : establishesNothing
        ? 0
        : 100;
    return {
      sectionKey: rule.sectionKey,
      sectionPath: rule.sectionKey,
      structuredPayload: {
        sectionKey: rule.sectionKey,
        title: rule.title,
        sourceTypes: rule.requiredSourceTypes,
        optional: rule.optional,
        sourceObjects: matched.map(m => ({ type: m.sourceType, payload: m.sourcePayload })),
      },
      narrativeDraft: generated.narrative,
      tables: generated.tables,
      completeness,
      /* What is missing is what the narrative says is NOT ESTABLISHED — the
         certificate, the origin declaration — not the source types, which
         matched. Listing the source types here sent a staffer to re-record a
         formulation that was already on file. */
      missingInputs:
        matched.length === 0
          ? (rule.optional ? [] : rule.requiredSourceTypes)
          : establishesNothing
            ? notEstablishedStatements(generated.narrative)
            : [],
      lineage: matched.map(m => ({
        sourceObjectId: m.id,
        sourceHashAtCompile: m.sourceHash || '',
      })),
    };
  });
}

/**
 * The appendix keys whose rule REQUIRES `sourceType` — the 3.2.A.* half of the
 * staleness sweep. The core composer's `impactedSectionsForSourceType` walked
 * MODULE3_SECTION_RULES only, so an approved 3.2.A.1 never went stale when the
 * container closure it was composed from changed. Exposed as a function rather
 * than the table: the two files import each other, and a module-scope read of
 * APPENDIX_RULES from the composer would run before this file has evaluated.
 */
export function appendixSectionsRequiringSourceType(sourceType: CmcSourceType): string[] {
  return APPENDIX_RULES
    .filter((rule) => rule.requiredSourceTypes.includes(sourceType))
    .map((rule) => rule.sectionKey);
}

/**
 * Compose regional (3.2.R.*) subsections for a target region.
 */
export function composeRegional(sourceObjects: CanonicalSource[], region: RegionCode): ComposedSection[] {
  const applicable = REGIONAL_SUBSECTIONS.filter(rs => rs.region === region);
  return applicable.map(rs => {
    const generated = rs.generator(sourceObjects);
    const present = rs.requiredFields.filter(f => val(sourceObjects, f));
    return {
      sectionKey: rs.sectionKey,
      sectionPath: rs.sectionKey,
      structuredPayload: {
        sectionKey: rs.sectionKey,
        title: rs.title,
        region: rs.region,
      },
      narrativeDraft: generated.narrative,
      tables: generated.tables,
      // Scored from the inputs actually present, not asserted. This was a flat
      // `100` with no missing inputs, so a regional pointer section rendering
      // "[site]" still read as complete — and a section that reads complete is
      // the one that gets signed and placed without a second look.
      completeness: present.length === 0 && rs.requiredFields.length > 0
        ? 0
        : Math.round((present.length / Math.max(rs.requiredFields.length, 1)) * 100),
      missingInputs: rs.requiredFields.filter(f => !val(sourceObjects, f)),
      // Only the sources that supplied one of those fields. Citing every object
      // in the project claimed a provenance the compile did not have.
      lineage: sourceObjects
        .filter(s => rs.requiredFields.some(f => {
          const v = s.sourcePayload?.[f];
          return v !== undefined && v !== null && v !== '';
        }))
        .map(s => ({
          sourceObjectId: s.id,
          sourceHashAtCompile: s.sourceHash || '',
        })),
    };
  });
}

/**
 * Compose the complete Module 3 (S, P, A, R + cross-refs) for a target region.
 */
export function composeFullModule3(
  sourceObjects: CanonicalSource[],
  region: RegionCode
): ComposedSection[] {
  const core = composeModule3FromCanonicalSources(sourceObjects);
  /* The same emission rule the compile route applies — one policy, both paths. */
  const appendices = emittableAppendices(composeAppendices(sourceObjects));
  const regional = composeRegional(sourceObjects, region);
  return injectAllCrossReferences([...core, ...appendices, ...regional]);
}
