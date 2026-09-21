/**
 * packs/mdx-content.mjs — the SME-authored demonstration content for the MDX
 * pack: the fictional manufacturer and device, the six dossier documents, the
 * three authoring documents and the four SOPs. Data only; the pack (mdx.mjs)
 * decides how each record is created. Kept apart from the pack so the content
 * can be reviewed as regulatory prose without reading seed code.
 *
 * Every body is seeded demonstration content written for the launch demo. It
 * is NOT model-drafted (no AI provider is configured) and each document says so
 * in its provenance line. Manufacturer, device, product code, regulation
 * number, K numbers, addresses and study figures are fictional.
 */

export const PROVENANCE =
  'Provenance: seeded demonstration content authored for the Concept2Cure launch demo (fictional manufacturer, fictional device). Not model-drafted — no AI provider is configured.';

export const MANUFACTURER = 'Concept2Cure Diagnostics';
export const DEVICE = 'NeuroPanel-Dx Multiplex CNS Pathogen Panel';
export const PROGRAM_NAME = 'NeuroPanel-Dx 510(k)';
export const INTENDED_USE =
  `${DEVICE} is a qualitative multiplexed in vitro diagnostic test intended for the simultaneous detection and identification of nucleic acids from herpes simplex virus 1 (HSV-1), herpes simplex virus 2 (HSV-2), varicella-zoster virus (VZV), enterovirus, human parechovirus and cytomegalovirus (CMV) in cerebrospinal fluid (CSF) obtained by lumbar puncture from individuals with signs and/or symptoms of meningitis or encephalitis. The test is performed on the NP-100 Analyzer. Results are intended to be used in conjunction with other clinical, epidemiological and laboratory data as an aid in the differential diagnosis of viral CNS infection. Negative results do not preclude CNS infection and should not be used as the sole basis for treatment or other patient-management decisions. For prescription use only. For in vitro diagnostic use.`;

export const today = () => new Date().toISOString().slice(0, 10);
export const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ─── The six vault documents (device / IVD dossier content) ──────────────────
//
// leaf.estar is the eSTAR slot id the document answers; leaf.ctd is the closest
// CTD section code, which is what the sequence/leaf route accepts (it refuses
// any non-CTD-shaped code — recorded as a finding by the pack). leaf.documentType
// carries the eSTAR mapper's token so the estar_510k engine still recognises it.

export const DOSSIER = [
  {
    key: 'deviceDescription',
    name: 'Device Description and Principles of Operation',
    ingestType: 'OTHER',
    folderId: 'k510',
    leaf: { estar: 'estar.device-description', ctd: '3.2.P.1', documentType: 'device_description' },
    pages: [
      { heading: '1. Device identification', body: `Trade name: ${DEVICE}. Common name: multiplex nucleic acid-based CNS pathogen panel. Manufacturer: ${MANUFACTURER}. Regulatory classification: Class II, 21 CFR 866.3985 (fictional regulation number for demonstration), product code QNX (fictional), review panel Microbiology. Premarket pathway: Traditional 510(k). Predicate: K223456 (fictional).\n\nThe system comprises (a) the NeuroPanel-Dx single-use test cartridge containing lyophilised reverse-transcription and real-time PCR reagents, internal control and target-specific primer/probe sets; (b) the NP-100 Analyzer, a benchtop instrument that performs cartridge fluidics, thermal cycling and six-channel fluorescence detection; and (c) NP-100 software v2.3, which controls the run, calls results and reports them to the laboratory information system.` },
      { heading: '2. Principles of operation', body: `A 200 uL aliquot of unprocessed CSF is pipetted into the cartridge sample port. On insertion the analyzer seals the cartridge and initiates a 68-minute run. Nucleic acid is extracted by chaotropic lysis and silica-membrane capture within the cartridge; the eluate is rehydrated into a single multiplex reaction. Reverse transcription converts enterovirus and parechovirus RNA to cDNA; the DNA targets (HSV-1, HSV-2, VZV, CMV) are amplified directly. Six hydrolysis probes, one per analyte, are detected across six optical channels; the internal process control (armored RNA) is co-amplified in a seventh channel.\n\nResult calling is deterministic: an analyte is reported Detected when its fluorescence curve crosses the channel-specific threshold before cycle 38 and passes the curve-shape criteria in the software design specification (SDS-NP100-004). A run is valid only when the internal control is detected or at least one analyte is Detected. No result is inferred; a run failing validity is reported Invalid and must be repeated.` },
      { heading: '3. Specimen, reagents and controls', body: `Specimen: CSF collected by lumbar puncture in a sterile, preservative-free tube; 200 uL minimum volume; tested within 24 hours at 2-8 C or after storage at -70 C. External positive and negative control materials (NP-Ctrl-P, NP-Ctrl-N) are provided separately and are recommended on each new lot, shipment and every 30 days of use, in accordance with laboratory policy and CLIA requirements.\n\nCartridge stability is claimed at 12 months at 2-25 C on the basis of real-time stability at three lots; the in-use stability after opening the pouch is 30 minutes.` },
      { heading: '4. Differences from the predicate at a glance', body: `The predicate is a cartridge-based multiplex CNS panel with a broader menu (bacterial, viral and fungal targets). NeuroPanel-Dx restricts the menu to six viral targets, adds a human-parechovirus assay redesigned against the current reference sequence set, and replaces the predicate's four-channel detector with a six-channel detector so that no two analytes share a channel. These technological differences do not raise different questions of safety or effectiveness; the analytical and clinical performance data summarised in the accompanying study reports support substantial equivalence.` },
    ],
  },
  {
    key: 'software',
    name: 'Software Description and Level of Concern',
    ingestType: 'OTHER',
    folderId: 'eng',
    leaf: { estar: 'estar.software', ctd: '3.2.R', documentType: 'software' },
    pages: [
      { heading: '1. Scope and documentation level', body: `This document describes NP-100 software v2.3.0 (analyzer control, result calling, LIS interface) and NP-Cartridge firmware v1.4 in accordance with FDA's guidance "Content of Premarket Submissions for Device Software Functions" (June 2023). Documentation level: Enhanced. Rationale: a failure or latent flaw in result calling could directly result in a false negative for HSV encephalitis, a serious injury; the device software function is therefore not Basic.\n\nSoftware lifecycle: IEC 62304:2006+A1:2015, software safety class C for the result-calling and internal-control-validity items, class B for the LIS export and user interface items. Segregation between class C and class B items is enforced at the process boundary and verified by the architecture review.` },
      { heading: '2. Architecture and requirements', body: `The software is organised into five SOUP-isolated modules: Instrument Control (thermal cycler, optics, fluidics), Signal Processing (baseline subtraction, threshold crossing, curve-shape criteria), Result Engine (analyte and run validity rules), Data Management (encrypted run store, audit log) and Connectivity (HL7 v2.5.1 ORU^R01 to the LIS over TLS 1.2+). The Software Requirements Specification SRS-NP100-003 contains 214 requirements; the Software Design Specification SDS-NP100-004 traces every requirement to a design element and a verification test.\n\nOff-the-shelf software: a real-time operating system, a TLS library and a JSON parser are used and listed in the SBOM with version, supplier and known-vulnerability status at release.` },
      { heading: '3. Verification and validation summary', body: `Unit tests: 1,912 tests, 100% pass, statement coverage 96.8% for class C items (target >= 95%). Integration tests: 118 procedures covering thermal profile fidelity, optical calibration, result-calling edge cases (late crossings, biphasic curves, internal-control failure) and LIS message conformance. System validation: 3 analyzers, 3 operators, 3 lots, 240 runs with contrived samples; all result calls agreed with the reference caller. Anomalies: 4 open at release, all minor (cosmetic UI), documented in the unresolved anomaly list with risk assessment and no effect on result integrity.\n\nRevision history: v2.3.0 introduces the parechovirus assay channel mapping and the updated thermal profile; the change is controlled under MDX-CC-2026-001.` },
    ],
  },
  {
    key: 'analytical',
    name: 'Analytical Performance Study Report',
    ingestType: 'REPORT',
    folderId: 'k510',
    leaf: { estar: 'estar.ivd-analytical-performance', ctd: '5.3.1.4', documentType: 'analytical_performance' },
    pages: [
      { heading: '1. Limit of detection', body: `Objective: establish the LoD for each of the six analytes in CSF matrix. Method: CLSI EP17-A2. Quantified reference material (viral culture or armored RNA, value-assigned by digital PCR) was diluted in pooled negative CSF to six concentrations bracketing the expected LoD; 20 replicates per level, 2 lots, 2 analyzers. LoD was defined as the lowest concentration detected in >= 95% of replicates and was confirmed with an additional 20 replicates at the claimed level.\n\nResults (copies/mL, claimed LoD, confirmation hit rate): HSV-1 50 (20/20); HSV-2 50 (20/20); VZV 100 (20/20); enterovirus 200 (19/20); human parechovirus 250 (20/20); CMV 100 (20/20). Conclusion: the claimed LoD is supported for every analyte.` },
      { heading: '2. Inclusivity and exclusivity', body: `Inclusivity: in-silico analysis of primer/probe sets against all complete sequences in the reference database as of the freeze date (HSV-1 n=312, HSV-2 n=184, VZV n=211, enterovirus n=1,486 across species A-D, parechovirus n=205, CMV n=302) predicted detection of 99.6% of sequences with no more than one mismatch outside the 3' end. Wet testing of 42 characterised strains, including 12 enterovirus types and parechovirus types 1-6, confirmed detection at 3x LoD.\n\nExclusivity (analytical specificity): 61 organisms (bacterial, fungal, viral, including EBV, HHV-6, HHV-7, JC/BK virus, adenovirus, mumps, measles, West Nile virus) were tested at >= 1e6 copies or CFU/mL in CSF matrix. No cross-reactivity was observed. In-silico analysis flagged HHV-6B as the only potential partial homology (probe region, 4 mismatches); wet testing at 1e7 copies/mL was negative.` },
      { heading: '3. Precision (repeatability and reproducibility)', body: `Method: CLSI EP05-A3, 3 sites x 5 days x 2 runs x 2 replicates, a panel of moderate positive (3x LoD) and low positive (1x LoD) samples for each analyte plus a negative. Result: qualitative agreement with expected result 100% for moderate positives (n=360 per analyte), 96.4-99.2% for low positives, 100% for negatives. Ct standard deviation (total) ranged 0.61-0.94 cycles across analytes. Site-to-site, lot-to-lot and operator-to-operator components were each < 0.5 cycles.\n\nConclusion: the assay is reproducible across sites, operators, instruments and lots at and above the claimed LoD.` },
      { heading: '4. Interference, carry-over and competitive inhibition', body: `Interferents tested at CLSI EP07 recommended concentrations in CSF: haemoglobin (blood-contaminated CSF, 2% v/v), bilirubin, protein (up to 5 g/L), glucose, xanthochromic CSF, common CSF-administered drugs (acyclovir, vancomycin, ceftriaxone, dexamethasone, methotrexate). No interference with analyte detection or internal control at 3x LoD.\n\nCarry-over: 50 alternating high-positive (1e7 copies/mL HSV-1) and negative runs on 3 analyzers; 0 of 150 negative runs reported Detected. Competitive inhibition: each analyte at 3x LoD in the presence of another analyte at 1e7 copies/mL; all low-level analytes remained Detected in >= 95% of replicates except enterovirus in the presence of high-titre HSV-1 (18/20), which is disclosed in the labeling as a limitation.` },
    ],
  },
  {
    key: 'clinical',
    name: 'Clinical Performance Study Report',
    ingestType: 'REPORT',
    folderId: 'cer',
    leaf: { estar: 'estar.ivd-clinical-performance', ctd: '5.3.5.2', documentType: 'clinical_performance' },
    pages: [
      { heading: '1. Study design', body: `A prospective, multi-centre, observational study (protocol CP-NP-001) enrolled consecutive residual CSF specimens from patients with suspected meningitis or encephalitis at 5 US sites between March and November of the study year. Specimens were tested on NeuroPanel-Dx in parallel with a composite comparator: FDA-cleared molecular assays for each analyte (and bidirectional sequencing on discordance). Operators were blinded to comparator results. The primary endpoints were positive percent agreement (PPA) and negative percent agreement (NPA) per analyte with two-sided 95% Wilson score confidence intervals.\n\nFinancial disclosure: no investigator held a disclosable financial interest (FDA 3454 filed). IRB approval was obtained at each site with a waiver of consent for residual, de-identified specimens.` },
      { heading: '2. Population and specimens', body: `1,612 specimens were enrolled; 1,548 (96.0%) were evaluable (64 excluded for insufficient volume or invalid comparator). Age: 0-91 years, median 34; 19.2% under 2 years; 51.6% female. Setting: 71% emergency department, 29% inpatient. Composite comparator prevalence: HSV-1 1.4%, HSV-2 2.9%, VZV 1.9%, enterovirus 9.8%, parechovirus 2.1% (children under 2: 11.2%), CMV 0.6%. Because natural prevalence was low for HSV-1 and CMV, the prospective set was supplemented with 40 archived, characterised positive specimens per analyte, analysed separately and not pooled into the prospective estimates.` },
      { heading: '3. Results', body: `Prospective PPA / NPA (95% CI):\nHSV-1: PPA 95.5% (78.2-99.2), n=22; NPA 99.9% (99.5-100).\nHSV-2: PPA 97.8% (88.4-99.6), n=45; NPA 99.8% (99.4-99.9).\nVZV: PPA 96.7% (83.3-99.4), n=30; NPA 99.9% (99.6-100).\nEnterovirus: PPA 97.4% (93.4-99.0), n=152; NPA 99.6% (99.1-99.8).\nHuman parechovirus: PPA 93.9% (80.4-98.3), n=33; NPA 99.9% (99.6-100).\nCMV: PPA 88.9% (56.5-98.0), n=9; NPA 99.9% (99.6-100).\n\nArchived positives: PPA 97.5-100% per analyte (n=40 each). Invalid rate on first attempt: 1.1% (17/1,548), all resolved on repeat. Discordant analysis: of 21 discordants, sequencing supported NeuroPanel-Dx in 13 and the comparator in 8.` },
      { heading: '4. Conclusions and limitations', body: `The clinical performance supports the intended use: agreement with cleared comparator methods exceeded 93% PPA and 99.5% NPA for every analyte in a representative intended-use population. Limitations: the CMV prospective positive count is small and the lower confidence bound is reported in labeling; performance in immunocompromised patients with very low viral loads was not separately established; the archived-specimen supplement is presented separately and not pooled.` },
    ],
  },
  {
    key: 'risk',
    name: 'Risk Management File Summary (ISO 14971)',
    ingestType: 'REPORT',
    folderId: 'eng',
    leaf: { estar: 'estar.risk-management', ctd: '1.16', documentType: 'risk_management' },
    pages: [
      { heading: '1. Risk management plan and scope', body: `Risk management for ${DEVICE} follows ISO 14971:2019 under RMP-NP-001, covering the cartridge, the NP-100 Analyzer, the software and the labeling across the product life cycle. Risk acceptability criteria are defined on a 5x5 severity-probability matrix; any hazardous situation whose harm is a serious injury (severity 4-5) requires probability reduced to remote or below and at least two independent risk-control measures. Residual-risk evaluation and the benefit-risk conclusion are approved by the management representative.` },
      { heading: '2. Hazard analysis summary', body: `147 hazardous situations were identified across use-related (IEC 62366-1), design FMEA, software hazard analysis (IEC 62304 / TIR32) and process FMEA. The top-ranked harms before mitigation were: false-negative HSV-1/HSV-2 result leading to delayed antiviral therapy; false-positive result leading to unnecessary treatment and missed alternative diagnosis; cross-contamination between cartridges; delayed result due to analyzer failure; and unauthorised access to patient results via the LIS interface.\n\nPrincipal risk controls: internal process control on every run with fail-closed validity rules; sealed single-use cartridge with no open amplicon handling; six-channel optics with per-channel calibration verification at each start-up; labeling limitations for high-titre competitive inhibition; role-based access, signed firmware and TLS on the interface (see the Cybersecurity summary).` },
      { heading: '3. Residual risk and benefit-risk conclusion', body: `After risk control, 0 hazardous situations remain in the unacceptable region, 6 remain in the as-low-as-reasonably-practicable region (each with a documented justification and a post-market surveillance trigger) and 141 are acceptable. Verification of every risk-control measure is traced in the design verification matrix DVM-NP-002. Production and post-production information (complaints, vigilance, literature) feeds the risk file through SOP-103 and is reviewed at each management review. The overall residual risk is judged acceptable in relation to the clinical benefit of a same-day, panel-based differential diagnosis of viral CNS infection.` },
    ],
  },
  {
    key: 'labeling',
    name: 'Labeling and Instructions for Use (Draft)',
    ingestType: 'OTHER',
    folderId: 'udi',
    leaf: { estar: 'estar.proposed-labeling', ctd: '1.14', documentType: 'labeling' },
    pages: [
      { heading: '1. Intended use and summary', body: `${INTENDED_USE}\n\nSummary and explanation: viral meningitis and encephalitis present with overlapping clinical features; rapid, multiplexed detection of the most frequent viral causes in CSF supports earlier, targeted management. Principle of the procedure: see the Device Description. Rx only.` },
      { heading: '2. Warnings, precautions and limitations', body: `For in vitro diagnostic use. For prescription use only. Test performance has been established only with CSF; other specimen types have not been evaluated. A negative result does not exclude infection; specimens collected early in the course of illness or after antiviral therapy may contain viral loads below the LoD. Detection of viral nucleic acid does not indicate that the organism is viable or is the cause of clinical symptoms. Enterovirus detection at low levels may be reduced in the presence of very high HSV-1 loads (see Analytical Performance). Results should be interpreted by a trained professional in conjunction with clinical presentation and other laboratory findings. Follow universal precautions; treat all specimens as potentially infectious.` },
      { heading: '3. Procedure, quality control and results', body: `Bring the cartridge to room temperature (15 min). Vortex the CSF specimen 5 s. Transfer 200 uL to the sample port using the supplied transfer pipette; close the lid until it clicks. Scan the cartridge barcode and the specimen barcode, insert the cartridge into an available bay and press Start. Run time 68 minutes. Results are displayed as Detected / Not Detected per analyte, or Invalid for the run. External controls: NP-Ctrl-P and NP-Ctrl-N with each new lot or shipment and at least every 30 days. Expected values and performance characteristics are summarised from the analytical and clinical study reports; detailed tables appear in sections 4-6 of the full IFU.` },
      { heading: '4. Labels and UDI', body: `Cartridge pouch label: trade name, REF NP-DX-006, LOT, expiry, storage 2-25 C, IVD symbol, Rx only, manufacturer name and address, UDI-DI in GS1 format (fictional GTIN for demonstration) with LOT and expiry as production identifiers. Outer carton: 12 cartridges, same content plus the contents list. Analyzer rating plate: model NP-100, serial number, electrical rating, UDI-DI. Symbols conform to ISO 15223-1.` },
    ],
  },
];

// ─── Authoring documents (structured sections) ───────────────────────────────

export const AUTHORING = {
  summary: {
    name: '510(k) Summary',
    module: '510k',
    sections: [
      { code: '1', title: 'Submitter (21 CFR 807.92(a)(1))', content: `<p><strong>Submitter:</strong> ${MANUFACTURER}, 1 Demonstration Way, Anytown (fictional address).<br/><strong>Contact:</strong> Regulatory Affairs, ${MANUFACTURER}.<br/><strong>Date prepared:</strong> ${today()}.</p><p><em>${PROVENANCE}</em></p>` },
      { code: '2', title: 'Device name and classification (807.92(a)(2))', content: `<p><strong>Trade name:</strong> ${DEVICE}. <strong>Common name:</strong> multiplex nucleic acid-based CNS pathogen panel. <strong>Classification:</strong> Class II, 21 CFR 866.3985 (fictional), product code QNX (fictional), Microbiology panel.</p>` },
      { code: '3', title: 'Predicate device (807.92(a)(3))', content: `<p>The predicate is a legally marketed cartridge-based multiplex CNS pathogen panel, K223456 (fictional), cleared under the same regulation and product code. No reference devices are relied upon.</p>` },
      { code: '4', title: 'Device description (807.92(a)(4))', content: `<p>NeuroPanel-Dx is a sample-to-answer, single-use cartridge run on the NP-100 Analyzer. 200 uL of unprocessed CSF is loaded; nucleic acid extraction, reverse transcription, multiplex real-time PCR and six-channel detection are performed inside the sealed cartridge in 68 minutes. Result calling is deterministic and run validity is governed by an internal process control. See the Device Description and Principles of Operation in the Vault for the full account.</p>` },
      { code: '5', title: 'Intended use (807.92(a)(5))', content: `<p>${INTENDED_USE}</p>` },
      { code: '6', title: 'Technological characteristics compared with the predicate (807.92(a)(6))', content: `<p>Both devices are cartridge-based multiplex real-time PCR systems for CSF with an internal control, sealed amplification and automated result calling. Differences: NeuroPanel-Dx has a six-analyte viral menu (the predicate includes bacterial and fungal targets), a redesigned human-parechovirus assay, six optical channels (four on the predicate) and an HL7 LIS interface over TLS. None of the differences raises new questions of safety or effectiveness; see the Substantial Equivalence Discussion.</p>` },
      { code: '7', title: 'Non-clinical performance data (807.92(b)(1))', content: `<p>Analytical performance was established per CLSI EP17-A2 (LoD 50-250 copies/mL by analyte), EP05-A3 (multi-site precision, total Ct SD &lt; 1 cycle), EP07 (no interference from blood, protein, bilirubin or CSF-administered drugs), inclusivity/exclusivity (42 strains detected; 61 organisms without cross-reactivity), carry-over and competitive inhibition. Software verification and validation followed IEC 62304 (class C) with an Enhanced documentation level. Electrical safety and EMC: IEC 61010-1, IEC 61326-2-6. Cybersecurity documentation is provided per FD&amp;C Act section 524B.</p>` },
      { code: '8', title: 'Clinical performance data (807.92(b)(2))', content: `<p>A prospective study of 1,548 evaluable CSF specimens at 5 US sites compared NeuroPanel-Dx with cleared comparator assays. PPA ranged 88.9-97.8% and NPA 99.6-99.9% across the six analytes; archived characterised positives (n=40 per analyte) gave PPA 97.5-100%. The first-attempt invalid rate was 1.1%.</p>` },
      { code: '9', title: 'Conclusions (807.92(b)(3))', content: `<p>The analytical and clinical data demonstrate that ${DEVICE} is as safe and effective as the predicate and is substantially equivalent for its intended use.</p>` },
    ],
  },
  se: {
    name: 'Substantial Equivalence Discussion',
    module: '510k',
    sections: [
      { code: '1', title: 'Predicate identification and SE framework', content: `<p>This discussion follows FDA's guidance "The 510(k) Program: Evaluating Substantial Equivalence in Premarket Notifications" and the section 513(i) decision flowchart. Predicate: K223456 (fictional), same regulation and product code. Step 1: same intended use - yes. Step 2: same technological characteristics - no (differences identified below). Step 3: do the differences raise different questions of safety or effectiveness - no. Step 4: do the performance data demonstrate equivalence - yes.</p><p><em>${PROVENANCE}</em></p>` },
      { code: '2', title: 'Intended use comparison', content: `<table><thead><tr><th>Element</th><th>NeuroPanel-Dx (subject)</th><th>Predicate K223456</th><th>Assessment</th></tr></thead><tbody><tr><td>Specimen</td><td>CSF by lumbar puncture</td><td>CSF by lumbar puncture</td><td>Same</td></tr><tr><td>Population</td><td>Signs/symptoms of meningitis or encephalitis</td><td>Signs/symptoms of meningitis or encephalitis</td><td>Same</td></tr><tr><td>Analytes</td><td>HSV-1, HSV-2, VZV, enterovirus, parechovirus, CMV</td><td>Same six viral targets plus bacterial and fungal targets</td><td>Subset of the predicate menu; no new analyte</td></tr><tr><td>Use setting</td><td>Clinical laboratory, moderate complexity</td><td>Clinical laboratory, moderate complexity</td><td>Same</td></tr><tr><td>Result type</td><td>Qualitative, Detected / Not Detected</td><td>Qualitative</td><td>Same</td></tr></tbody></table>` },
      { code: '3', title: 'Technological characteristics comparison', content: `<table><thead><tr><th>Characteristic</th><th>Subject</th><th>Predicate</th><th>Different questions?</th></tr></thead><tbody><tr><td>Chemistry</td><td>RT-PCR and PCR, hydrolysis probes</td><td>Nested multiplex PCR, melt-curve detection</td><td>No - established chemistry; performance verified</td></tr><tr><td>Extraction</td><td>In-cartridge silica capture</td><td>In-cartridge bead beating and silica capture</td><td>No</td></tr><tr><td>Detection</td><td>Six optical channels, one per analyte</td><td>Four channels with melt discrimination</td><td>No - reduces multiplex ambiguity; verified by exclusivity testing</td></tr><tr><td>Internal control</td><td>Armored RNA process control</td><td>DNA and RNA process controls</td><td>No</td></tr><tr><td>Run time</td><td>68 min</td><td>About 60 min</td><td>No</td></tr><tr><td>Connectivity</td><td>HL7 v2.5.1 over TLS 1.2+</td><td>Proprietary middleware</td><td>No - addressed by cybersecurity documentation</td></tr></tbody></table>` },
      { code: '4', title: 'Performance comparison', content: `<p>LoD (copies/mL) subject vs predicate labeling: HSV-1 50 vs 100; HSV-2 50 vs 100; VZV 100 vs 200; enterovirus 200 vs 250; parechovirus 250 vs 500; CMV 100 vs 150. Clinical PPA/NPA for the subject device (prospective, n=1,548) is within or above the range reported for the predicate's viral targets. Precision, interference and cross-reactivity studies were designed to the same CLSI standards cited in the predicate's decision summary.</p>` },
      { code: '5', title: 'Conclusion', content: `<p>The subject device has the same intended use as the predicate, its technological differences do not raise different questions of safety or effectiveness, and the analytical and clinical data demonstrate that it is at least as safe and effective. ${DEVICE} is substantially equivalent to K223456 (fictional).</p>` },
    ],
  },
  cyber: {
    name: 'Cybersecurity and Interoperability Summary',
    module: '510k',
    sections: [
      { code: '1', title: 'Cyber device determination (FD&C Act section 524B)', content: `<p>The NP-100 Analyzer includes software, connects to the laboratory network (Ethernet, HL7 over TLS) and could be vulnerable to cybersecurity threats; it is therefore a cyber device under section 524B, and this summary provides the information required by section 524B(b) and FDA's premarket cybersecurity guidance (September 2023).</p><p><em>${PROVENANCE}</em></p>` },
      { code: '2', title: 'Threat model summary', content: `<p>A STRIDE-based threat model (TM-NP-001) covers the analyzer, the cartridge barcode input, the LIS interface, the service port and the software-update path. 38 threats were identified; the highest-rated were tampering with result messages in transit, unauthorised firmware, credential theft on the service port and denial of service on the network interface. Each threat is traced to a security control and a verification test; residual security risk is carried into the ISO 14971 risk file.</p>` },
      { code: '3', title: 'Security architecture and controls', content: `<p>Secure boot with signed firmware (ECDSA P-256); role-based access (operator, supervisor, service) with per-user credentials and automatic lock; encrypted run store (AES-256) with an append-only audit log; TLS 1.2+ with mutual authentication for HL7; no inbound listening services other than the LIS acknowledgement port; service port disabled by default and physically keyed; software updates delivered as signed packages verified before installation. A security architecture view (global system, multi-patient harm, updatability and security use case views) is provided in the full documentation.</p>` },
      { code: '4', title: 'SBOM and vulnerability management', content: `<p>A machine-readable SBOM (CycloneDX 1.5) lists every third-party component with version, supplier, support status and known-vulnerability status at release. Coordinated vulnerability disclosure is published on the manufacturer's website; the post-market plan commits to monitoring the components against public vulnerability databases, patching critical vulnerabilities within 60 days of confirmation and communicating to customers through the field-notice process in SOP-103.</p>` },
      { code: '5', title: 'Interoperability', content: `<p>The only electronic interface is a unidirectional HL7 v2.5.1 ORU^R01 result export with ACK, over TLS, to a configured LIS endpoint. The interface specification (IS-NP-002) defines the message structure, the result vocabulary (LOINC-coded per analyte), error handling and the behaviour when the LIS is unreachable (results are queued locally and never altered). Interoperability testing covered message conformance, replay rejection and loss-of-connection recovery.</p>` },
      { code: '6', title: 'Labeling for security', content: `<p>The IFU and the network-administrator guide describe the recommended network configuration, the credentials policy, how to obtain and verify software updates, the SBOM location, the end-of-support date and how to report a suspected vulnerability.</p>` },
    ],
  },
};

// ─── QMS controlled documents ────────────────────────────────────────────────

export const SOPS = [
  {
    key: 'sop101', docNumber: 'MDX-SOP-101', name: 'SOP-101 Design Controls (21 CFR 820.30)', category: 'design-controls',
    sections: [
      { key: 'purpose', label: 'Purpose', hint: 'Define the design and development process for NeuroPanel-Dx products so that design input, output, review, verification, validation, transfer and changes are controlled and recorded in the design history file (21 CFR 820.30 / ISO 13485 7.3).' },
      { key: 'scope', label: 'Scope', hint: 'All Class II and Class III devices and IVDs designed by Concept2Cure Diagnostics, including software (IEC 62304) and labeling.' },
      { key: 'responsibilities', label: 'Responsibilities', hint: 'Program lead owns the design plan; Quality approves each phase gate; Regulatory Affairs confirms the regulatory strategy at design input and design transfer.' },
      { key: 'procedure', label: 'Procedure', hint: 'Design planning; design input including intended use, user needs and risk-derived requirements; design output with acceptance criteria; phase-gated design reviews with an independent reviewer; verification against outputs; validation on initial production units under actual or simulated use conditions; design transfer; design changes under SOP-104 where software is affected.' },
      { key: 'records', label: 'Records', hint: 'Design plan, input and output documents, review minutes, V&V protocols and reports, transfer checklist and the DHF index, retained for the life of the device plus two years.' },
    ],
  },
  {
    key: 'sop102', docNumber: 'MDX-SOP-102', name: 'SOP-102 Corrective and Preventive Action', category: 'capa',
    sections: [
      { key: 'purpose', label: 'Purpose', hint: 'Establish the CAPA process for investigating and eliminating the causes of existing and potential nonconformities (21 CFR 820.100 / ISO 13485 8.5.2, 8.5.3).' },
      { key: 'scope', label: 'Scope', hint: 'Quality data from complaints, nonconforming product, internal and external audits, servicing, post-market surveillance and management review.' },
      { key: 'procedure', label: 'Procedure', hint: 'Initiation with a risk-based priority; containment; root-cause investigation (5-Why or fishbone, statistically valid where appropriate); action plan with owner and due date; implementation; verification that the action is effective and does not adversely affect the finished device; effectiveness review at 90 days; closure by Quality.' },
      { key: 'records', label: 'Records', hint: 'CAPA form, investigation report, effectiveness check and the CAPA register; trended at management review.' },
    ],
  },
  {
    key: 'sop103', docNumber: 'MDX-SOP-103', name: 'SOP-103 Complaint Handling and MDR Reporting', category: 'postmarket',
    sections: [
      { key: 'purpose', label: 'Purpose', hint: 'Define receipt, review, evaluation, investigation and reporting of complaints and the determination of Medical Device Reporting obligations (21 CFR 820.198 and 21 CFR Part 803).' },
      { key: 'scope', label: 'Scope', hint: 'All communications alleging deficiencies in identity, quality, durability, reliability, safety, effectiveness or performance of a marketed device, from any source.' },
      { key: 'procedure', label: 'Procedure', hint: 'Log within 1 business day; MDR decision tree within 5 business days using the 803.3 definitions of death, serious injury and malfunction; 30-day and 5-day reports through the eMDR gateway; investigation for every complaint involving a possible failure to meet specifications; link to CAPA under SOP-102; trending monthly and feedback into the risk management file.' },
      { key: 'records', label: 'Records', hint: 'Complaint file per 820.198(e), MDR event files per 803.18, retained two years or the expected life of the device, whichever is longer.' },
    ],
  },
  {
    key: 'sop104', docNumber: 'MDX-SOP-104', name: 'SOP-104 Software Change Control', category: 'software',
    sections: [
      { key: 'purpose', label: 'Purpose', hint: 'Control changes to device software and firmware after design freeze so that every change is assessed for safety, regulatory impact (FDA deciding-when-to-submit guidance for software changes) and cybersecurity impact before release (IEC 62304 clause 6, 8).' },
      { key: 'scope', label: 'Scope', hint: 'NP-100 Analyzer software, cartridge firmware, SOUP updates and the software-update delivery mechanism.' },
      { key: 'procedure', label: 'Procedure', hint: 'Change request in the change-control register; impact analysis covering risk file, threat model, SBOM, verification scope and 510(k) decision; classification (letter-to-file or new 510(k)); regression and cybersecurity testing proportionate to the impact; release approval by Quality and Regulatory Affairs; controlled deployment with rollback.' },
      { key: 'records', label: 'Records', hint: 'Change request, impact analysis, test evidence, release note, updated SBOM and the regulatory decision memorandum.' },
    ],
  },
];

