// Document Section Scaffolding for Medical Device Submissions

import { DOC_TYPES } from '@shared/docTypes';

// Create or update a section in the editor
export function upsertSection(editor, heading, level = 1, body = 'Section content not provided.') {
  if (!editor) return;

  const json = editor.getJSON ? editor.getJSON() : null;
  if (!json) {
    // Fallback for text-based editors
    const content = `${'#'.repeat(level)} ${heading}\n\n${body}\n\n`;
    editor.commands?.insertContent?.(content);
    return;
  }

  const idx = (json.content || []).findIndex(
    n => n.type === 'heading' && n.content?.[0]?.text === heading
  );

  const nodes = [
    { type: 'heading', attrs: { level }, content: [{ type: 'text', text: heading }] },
    { type: 'paragraph', content: [{ type: 'text', text: body }] },
  ];

  if (idx >= 0) {
    // Update existing section
    let end = json.content.length;
    for (let i = idx + 1; i < json.content.length; i++) {
      if (json.content[i].type === 'heading') {
        end = i;
        break;
      }
    }
    json.content.splice(idx, end - idx, ...nodes);
    editor.commands.setContent(json, false);
  } else {
    // Add new section
    editor.chain().focus().insertContent(nodes).run();
  }
}

// Apply document scaffold based on type
export function applyScaffold(editor, docType, deviceProfile = {}) {
  if (!editor || !docType) return;

  // Clear existing content or add to it based on preference
  const clearFirst = false; // Set to true if you want to replace content

  if (clearFirst && editor.commands?.clearContent) {
    editor.commands.clearContent();
  }

  // Apply sections based on document type
  if (docType.key === 'cerv2_510k') {
    apply510kScaffold(editor, docType, deviceProfile);
  } else if (docType.key === 'cerv2_pma') {
    applyPMAScaffold(editor, docType, deviceProfile);
  } else if (docType.key === 'cerv2_cer') {
    applyCERScaffold(editor, docType, deviceProfile);
  } else {
    // Generic scaffold
    for (const section of docType.sections) {
      const placeholder = section.required
        ? `${section.title} is required. Add content here.`
        : `${section.title} is optional. Add content if applicable.`;
      upsertSection(editor, section.title, 1, placeholder);
    }
  }
}

const fallbackText = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${label} not provided.`;
  }
  return String(value);
};

// FDA 510(k) specific scaffold
function apply510kScaffold(editor, docType, deviceProfile) {
  const f = deviceProfile || {};

  upsertSection(
    editor,
    '1. Administrative Information',
    1,
    `Manufacturer: ${fallbackText(f.manufacturer, 'Manufacturer')}\n` +
      `Device Name: ${fallbackText(f.deviceName, 'Device name')}\n` +
      `Product Code: ${fallbackText(f.productCode, 'FDA product code')}\n` +
      `Regulation Number: ${fallbackText(f.regulationNumber, 'Regulation number')}\n` +
      `510(k) Number: ${f.submissionNumber ? String(f.submissionNumber) : 'Not assigned by FDA'}\n` +
      `Submission Type: ${fallbackText(f.submissionType, 'Submission type')}`
  );

  upsertSection(
    editor,
    '2. Indications for Use',
    1,
    `The ${f.deviceName || 'device'} is indicated for ${f.intendedUse || 'the intended use described in the device profile'}.\n\n` +
      `Use type: ${f.prescriptionUse === true ? 'Prescription (Rx)' : f.prescriptionUse === false ? 'Over-the-counter (OTC)' : 'Use type not specified'}.`
  );

  upsertSection(
    editor,
    '3. Device Description',
    1,
    `Product Overview:\n${f.deviceDescription || 'Device description not provided in the profile.'}\n\n` +
      `Key Features:\n• Key feature details not provided.\n• Add performance characteristics where applicable.\n• Reference design inputs and specifications.\n\n` +
      `Principles of Operation:\n${f.principlesOfOperation || 'Principles of operation not provided.'}`
  );

  upsertSection(
    editor,
    '4. Predicate Devices',
    1,
    `Primary Predicate: ${fallbackText(f.predicateDevice, 'Predicate device')}\n` +
      `Manufacturer: ${fallbackText(f.predicateManufacturer, 'Predicate manufacturer')}\n\n` +
      `Comparison Table:\n` +
      `| Feature | Subject Device | Predicate Device |\n` +
      `|---------|---------------|------------------|\n` +
      `| Intended Use | ${f.intendedUse ? 'Same' : 'Not documented'} | ${f.predicateIntendedUse ? 'Same' : 'Not documented'} |\n` +
      `| Technology | ${f.technology || 'Not documented'} | ${f.predicateTechnology || 'Not documented'} |\n` +
      `| Materials | ${f.materials || 'Not documented'} | ${f.predicateMaterials || 'Not documented'} |`
  );

  upsertSection(
    editor,
    '5. Substantial Equivalence Discussion',
    1,
    `The ${f.deviceName || 'device'} is substantially equivalent to the predicate device based on:\n\n` +
      `• Same intended use\n` +
      `• Similar technological characteristics\n` +
      `• Performance data demonstrating safety and effectiveness\n\n` +
      `Provide a detailed substantial equivalence rationale with supporting evidence.`
  );

  upsertSection(
    editor,
    '6. Performance Testing (Bench/Clinical)',
    1,
    `Bench Testing:\n• Bench test protocols and results not provided.\n• Add summary tables or performance metrics.\n\n` +
      `Biocompatibility:\n• Biocompatibility evidence not provided.\n\n` +
      `Software Validation:\n• Software validation evidence not provided.\n\n` +
      `Clinical Data:\n• Clinical evidence not provided.`
  );

  upsertSection(
    editor,
    '7. Proposed Labeling',
    1,
    `The following labeling is proposed:\n\n` +
      `• Instructions for Use (IFU)\n` +
      `• Package Insert\n` +
      `• Device Label\n\n` +
      `Attach final labeling artifacts in the document vault for review.`
  );

  upsertSection(
    editor,
    '8. Conclusion',
    1,
    `Based on the information provided in this submission, the ${f.deviceName || 'device'} is substantially equivalent to the legally marketed predicate device.`
  );
}

// FDA PMA specific scaffold
function applyPMAScaffold(editor, docType, deviceProfile) {
  const f = deviceProfile || {};

  upsertSection(
    editor,
    '1. Summary and General Information',
    1,
    `Device Name: ${fallbackText(f.deviceName, 'Device name')}\n` +
      `PMA Number: ${f.pmaNumber ? String(f.pmaNumber) : 'Not assigned'}\n` +
      `Classification: Class III\n\n` +
      `Executive Summary:\nProvide an overview of the device, indications, and clinical evidence.`
  );

  upsertSection(
    editor,
    '2. Nonclinical Laboratory Studies',
    1,
    `Biocompatibility Testing (ISO 10993):\n• Results not provided.\n\n` +
      `Mechanical Testing:\n• Results not provided.\n\n` +
      `Animal Studies:\n• Preclinical study summaries not provided.`
  );

  upsertSection(
    editor,
    '3. Clinical Investigations',
    1,
    `Pivotal Study:\n` +
      `• Study Design: ${fallbackText(f.pmaStudyDesign, 'Study design')}\n` +
      `• Primary Endpoint: ${fallbackText(f.primaryEndpoint, 'Primary endpoint')}\n` +
      `• Sample Size: ${fallbackText(f.sampleSize, 'Sample size')}\n` +
      `• Results: ${fallbackText(f.clinicalResults, 'Clinical results summary')}\n\n` +
      `Supporting Studies:\nAdditional clinical evidence not provided.`
  );

  upsertSection(
    editor,
    '4. Manufacturing and Quality Systems',
    1,
    `Manufacturing Process:\nManufacturing process details not provided.\n\n` +
      `Quality System Regulation (QSR) Compliance:\n` +
      `• Design Controls\n` +
      `• Production Controls\n` +
      `• CAPA System`
  );

  upsertSection(
    editor,
    '5. Labeling',
    1,
    `Physician Labeling:\n• Instructions for Use\n• Contraindications\n• Warnings and Precautions\n\n` +
      `Patient Labeling:\n• Patient Information Booklet\n• Implant Card (if applicable)`
  );

  upsertSection(
    editor,
    '6. Risk/Benefit Determination',
    1,
    `Benefits:\n• Clinical benefits not provided.\n\n` +
      `Risks:\n• Identified risks not provided.\n\n` +
      `Risk Mitigation:\n• Risk controls not provided.\n\n` +
      `Conclusion: The benefits outweigh the risks when used as indicated.`
  );
}

// EU MDR CER specific scaffold
function applyCERScaffold(editor, docType, deviceProfile) {
  const f = deviceProfile || {};

  upsertSection(
    editor,
    '1. State of the Art',
    1,
    `Current Clinical Practice:\nCurrent treatment standards not provided.\n\n` +
      `Alternative Treatments:\n• Alternative treatment details not provided.\n\n` +
      `Device Position:\nDevice positioning in current practice not provided.`
  );

  upsertSection(
    editor,
    '2. Device/Intended Purpose',
    1,
    `Device Name: ${fallbackText(f.deviceName, 'Device name')}\n` +
      `UDI: ${fallbackText(f.udi, 'UDI')}\n` +
      `Classification: ${fallbackText(f.mdClass, 'Device classification')}\n\n` +
      `Intended Purpose:\n${f.intendedPurpose || 'Intended purpose not provided.'}`
  );

  upsertSection(
    editor,
    '3. Clinical Data Set (Literature + Studies)',
    1,
    `Literature Review:\n` +
      `• Search Strategy: Not provided.\n` +
      `• Inclusion/Exclusion Criteria: Not provided.\n` +
      `• Results: Not provided.\n\n` +
      `Clinical Studies:\n• Clinical study list not provided.`
  );

  upsertSection(
    editor,
    '4. Critical Appraisal & Weighting',
    1,
    `Data Quality Assessment:\n` +
      `• Level of Evidence: Not provided.\n` +
      `• Study Limitations: Not provided.\n` +
      `• Data Relevance: Not provided.\n\n` +
      `Weighting Factors:\n• Data weighting methodology not provided.`
  );

  upsertSection(
    editor,
    '5. Benefit–Risk Determination',
    1,
    `Clinical Benefits:\n• Benefits not provided.\n\n` +
      `Risks and Harms:\n• Risks not provided.\n\n` +
      `Benefit-Risk Profile:\nDemonstrate positive benefit-risk per MDR Annex XIV.`
  );

  upsertSection(
    editor,
    '6. GSPR Mapping',
    1,
    `General Safety and Performance Requirements:\n\n` +
      `GSPR 1: Not provided.\n` +
      `GSPR 2: Not provided.\n\n` +
      `Map all applicable GSPRs from Annex I.`
  );

  upsertSection(
    editor,
    '7. PMS Plan / PMCF',
    1,
    `Post-Market Surveillance Plan:\n• Data sources not provided.\n• Monitoring frequency not provided.\n\n` +
      `PMCF Activities:\n• Registry participation not provided.\n• Follow-up studies not provided.\n• Literature monitoring not provided.`
  );

  upsertSection(
    editor,
    '8. Conclusions & Recommendations',
    1,
    `The clinical evaluation demonstrates that the ${f.deviceName || 'device'} meets the relevant GSPRs and has an acceptable benefit-risk profile when used as intended.\n\n` +
      `Recommendations:\n• CER update timeline not provided.\n• PMCF priorities not provided.`
  );
}

export default {
  upsertSection,
  applyScaffold,
  apply510kScaffold,
  applyPMAScaffold,
  applyCERScaffold,
};
