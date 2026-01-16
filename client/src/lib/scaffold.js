import { List, Map } from 'lucide-react'
// Document Section Scaffolding for Medical Device Submissions

import { DOC_TYPES } from '@shared/docTypes';

// Create or update a section in the editor
export function upsertSection(editor, heading, level = 1, body = '<Populate section>') {
  if (!editor) return;
  
  const json = editor.getJSON ? editor.getJSON() : null;
  if (!json) {
    // Fallback for text-based editors
    const content = `${'#'.repeat(level)} ${heading}\n\n${body}\n\n`;
    editor.commands?.insertContent?.(content);
    return;
  }

  const idx = (json.content || []).findIndex(
    (n) => n.type === 'heading' && n.content?.[0]?.text === heading
  );
  
  const nodes = [
    { type: 'heading', attrs: { level }, content: [{ type: 'text', text: heading }] },
    { type: 'paragraph', content: [{ type: 'text', text: body }] }
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
        ? `<Required: ${section.title}>` 
        : `<Optional: ${section.title}>`;
      upsertSection(editor, section.title, 1, placeholder);
    }
  }
}

// FDA 510(k) specific scaffold
function apply510kScaffold(editor, docType, deviceProfile) {
  const f = deviceProfile || {};
  
  upsertSection(
    editor,
    '1. Administrative Information',
    1,
    `Manufacturer: ${f.manufacturer || '<Manufacturer Name>'}\n` +
    `Device Name: ${f.deviceName || '<Device Trade Name>'}\n` +
    `Product Code: ${f.productCode || '<FDA Product Code>'}\n` +
    `Regulation Number: ${f.regulationNumber || '<21 CFR XXX.XXXX>'}\n` +
    `510(k) Number: ${f.submissionNumber || '<To be assigned by FDA>'}`
  );

  upsertSection(
    editor,
    '2. Indications for Use',
    1,
    `The ${f.deviceName || '<device name>'} is indicated for ${f.intendedUse || '<describe intended use, patient population, and clinical setting>'}.\n\n` +
    `This device is ${f.prescriptionUse ? 'prescription use (Rx)' : 'over-the-counter (OTC)'}.`
  );

  upsertSection(
    editor,
    '3. Device Description',
    1,
    `Product Overview:\n${f.deviceDescription || '<Provide detailed device description including components, materials, and specifications>'}\n\n` +
    `Key Features:\n• <Feature 1>\n• <Feature 2>\n• <Feature 3>\n\n` +
    `Principles of Operation:\n<Describe how the device works>`
  );

  upsertSection(
    editor,
    '4. Predicate Devices',
    1,
    `Primary Predicate: ${f.predicateDevice || '<K number and device name>'}\n` +
    `Manufacturer: ${f.predicateManufacturer || '<Predicate manufacturer>'}\n\n` +
    `Comparison Table:\n` +
    `| Feature | Subject Device | Predicate Device |\n` +
    `|---------|---------------|------------------|\n` +
    `| Intended Use | Same | Same |\n` +
    `| Technology | <Describe> | <Describe> |\n` +
    `| Materials | <List> | <List> |`
  );

  upsertSection(
    editor,
    '5. Substantial Equivalence Discussion',
    1,
    `The ${f.deviceName || '<device>'} is substantially equivalent to the predicate device based on:\n\n` +
    `• Same intended use\n` +
    `• Similar technological characteristics\n` +
    `• Performance data demonstrating safety and effectiveness\n\n` +
    `<Provide detailed SE rationale>`
  );

  upsertSection(
    editor,
    '6. Performance Testing (Bench/Clinical)',
    1,
    `Bench Testing:\n• <Test 1 and results>\n• <Test 2 and results>\n\n` +
    `Biocompatibility:\n• <ISO 10993 testing if applicable>\n\n` +
    `Software Validation:\n• <If applicable, describe validation per FDA software guidance>\n\n` +
    `Clinical Data:\n• <If applicable, summarize clinical studies>`
  );

  upsertSection(
    editor,
    '7. Proposed Labeling',
    1,
    `The following labeling is proposed:\n\n` +
    `• Instructions for Use (IFU)\n` +
    `• Package Insert\n` +
    `• Device Label\n\n` +
    `<Attach draft labeling as appendices>`
  );

  upsertSection(
    editor,
    '8. Conclusion',
    1,
    `Based on the information provided in this submission, the ${f.deviceName || '<device>'} is substantially equivalent to the legally marketed predicate device.`
  );
}

// FDA PMA specific scaffold
function applyPMAScaffold(editor, docType, deviceProfile) {
  const f = deviceProfile || {};

  upsertSection(
    editor,
    '1. Summary and General Information',
    1,
    `Device Name: ${f.deviceName || '<Device Name>'}\n` +
    `PMA Number: ${f.pmaNumber || '<To be assigned>'}\n` +
    `Classification: Class III\n\n` +
    `Executive Summary:\n<Provide overview of device, indications, and clinical evidence>`
  );

  upsertSection(
    editor,
    '2. Nonclinical Laboratory Studies',
    1,
    `Biocompatibility Testing (ISO 10993):\n• <List all tests and results>\n\n` +
    `Mechanical Testing:\n• <Fatigue, tensile, compression results>\n\n` +
    `Animal Studies:\n• <Summarize preclinical studies>`
  );

  upsertSection(
    editor,
    '3. Clinical Investigations',
    1,
    `Pivotal Study:\n` +
    `• Study Design: <RCT, single-arm, etc.>\n` +
    `• Primary Endpoint: <Define>\n` +
    `• Sample Size: <N=>\n` +
    `• Results: <Summarize key findings>\n\n` +
    `Supporting Studies:\n<List and summarize additional clinical evidence>`
  );

  upsertSection(
    editor,
    '4. Manufacturing and Quality Systems',
    1,
    `Manufacturing Process:\n<Describe key manufacturing steps>\n\n` +
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
    `Benefits:\n• <List clinical benefits>\n\n` +
    `Risks:\n• <List identified risks>\n\n` +
    `Risk Mitigation:\n• <Describe risk controls>\n\n` +
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
    `Current Clinical Practice:\n<Describe current treatment standards>\n\n` +
    `Alternative Treatments:\n• <Option 1>\n• <Option 2>\n\n` +
    `Device Position:\n<How this device fits in current practice>`
  );

  upsertSection(
    editor,
    '2. Device/Intended Purpose',
    1,
    `Device Name: ${f.deviceName || '<Device Name>'}\n` +
    `UDI: ${f.udi || '<Unique Device Identifier>'}\n` +
    `Classification: ${f.mdClass || '<Class IIa/IIb/III>'}\n\n` +
    `Intended Purpose:\n${f.intendedPurpose || '<Detailed intended purpose per MDR>'}`
  );

  upsertSection(
    editor,
    '3. Clinical Data Set (Literature + Studies)',
    1,
    `Literature Review:\n` +
    `• Search Strategy: <Databases, keywords, date range>\n` +
    `• Inclusion/Exclusion Criteria: <Define>\n` +
    `• Results: <N studies identified>\n\n` +
    `Clinical Studies:\n• <List relevant studies with outcomes>`
  );

  upsertSection(
    editor,
    '4. Critical Appraisal & Weighting',
    1,
    `Data Quality Assessment:\n` +
    `• Level of Evidence: <Grade per MEDDEV 2.7/1>\n` +
    `• Study Limitations: <Identify>\n` +
    `• Data Relevance: <Assess applicability>\n\n` +
    `Weighting Factors:\n• <Explain data weighting methodology>`
  );

  upsertSection(
    editor,
    '5. Benefit–Risk Determination',
    1,
    `Clinical Benefits:\n• <Quantify benefits with evidence>\n\n` +
    `Risks and Harms:\n• <List with frequencies>\n\n` +
    `Benefit-Risk Profile:\n<Demonstrate positive benefit-risk per MDR Annex XIV>`
  );

  upsertSection(
    editor,
    '6. GSPR Mapping',
    1,
    `General Safety and Performance Requirements:\n\n` +
    `GSPR 1: <How addressed>\n` +
    `GSPR 2: <How addressed>\n` +
    `...\n` +
    `<Map all applicable GSPRs from Annex I>`
  );

  upsertSection(
    editor,
    '7. PMS Plan / PMCF',
    1,
    `Post-Market Surveillance Plan:\n• <Data sources>\n• <Monitoring frequency>\n\n` +
    `PMCF Activities:\n• <Registry participation>\n• <Follow-up studies>\n• <Literature monitoring>`
  );

  upsertSection(
    editor,
    '8. Conclusions & Recommendations',
    1,
    `The clinical evaluation demonstrates that the ${f.deviceName || '<device>'} meets the relevant GSPRs and has an acceptable benefit-risk profile when used as intended.\n\n` +
    `Recommendations:\n• <Next CER update timeline>\n• <PMCF priorities>`
  );
}

export default {
  upsertSection,
  applyScaffold,
  apply510kScaffold,
  applyPMAScaffold,  
  applyCERScaffold
};