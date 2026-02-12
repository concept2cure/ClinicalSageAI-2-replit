#!/usr/bin/env node
/**
 * Phase 7.1/7.2 Validation – checks all new artifacts exist and are well-formed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}`);
    fail++;
  }
}

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fileContains(rel, needle) {
  if (!fileExists(rel)) return false;
  return fs.readFileSync(path.join(root, rel), 'utf-8').includes(needle);
}

console.log('\n🔍 Phase 7.1/7.2 Validation\n');

// 1 – Renderers
console.log('── Renderers ──');
check('renderers.ts exists', fileExists('server/export/renderers.ts'));
check(
  'renderPdfBuffersFor510k exported',
  fileContains('server/export/renderers.ts', 'renderPdfBuffersFor510k')
);
check(
  'renderPdfBuffersForPma exported',
  fileContains('server/export/renderers.ts', 'renderPdfBuffersForPma')
);
check(
  'renderPdfBuffersForCer exported',
  fileContains('server/export/renderers.ts', 'renderPdfBuffersForCer')
);
check(
  'renderCombinedPdf exported',
  fileContains('server/export/renderers.ts', 'renderCombinedPdf')
);
check(
  'renderCombinedDocx exported',
  fileContains('server/export/renderers.ts', 'renderCombinedDocx')
);

// 2 – Style packs
console.log('\n── Style Packs ──');
check('510k_v1.html exists', fileExists('server/export/stylePacks/510k_v1.html'));
check('pma_v1.html exists', fileExists('server/export/stylePacks/pma_v1.html'));
check('cer_mdr_v1.html exists', fileExists('server/export/stylePacks/cer_mdr_v1.html'));
check('print.css exists', fileExists('server/export/stylePacks/print.css'));
check('config.ts exists', fileExists('server/export/stylePacks/config.ts'));

// 3 – Mock vault
console.log('\n── Mock Vault ──');
check('mockVault.ts exists', fileExists('server/services/mockVault.ts'));
check('510k mock content', fileContains('server/services/mockVault.ts', 'mock510kContent'));
check('PMA mock content', fileContains('server/services/mockVault.ts', 'mockPmaContent'));
check('CER mock content', fileContains('server/services/mockVault.ts', 'mockCerContent'));
check(
  'getMockEditorJson method',
  fileContains('server/services/mockVault.ts', 'getMockEditorJson')
);

// 4 – Export routes
console.log('\n── Export Routes ──');
check('cerv2-export-routes.ts exists', fileExists('server/routes/cerv2-export-routes.ts'));
check('POST /pdf route', fileContains('server/routes/cerv2-export-routes.ts', "'/pdf'"));
check('POST /docx route', fileContains('server/routes/cerv2-export-routes.ts', "'/docx'"));
check('POST /zip route', fileContains('server/routes/cerv2-export-routes.ts', "'/zip'"));
check(
  'GET /mock/:docType route',
  fileContains('server/routes/cerv2-export-routes.ts', "'/mock/:docType'")
);
check(
  'GET /mock/:docType/zip route',
  fileContains('server/routes/cerv2-export-routes.ts', "'/mock/:docType/zip'")
);
check(
  'Export routes mounted in index.ts',
  fileContains('server/index.ts', "app.use('/api/cerv2/export'")
);

// 5 – AI auto-populate stubs
console.log('\n── AI Auto-Populate ──');
check('cerv2-ai-routes.ts exists', fileExists('server/routes/cerv2-ai-routes.ts'));
check('POST /suggest route', fileContains('server/routes/cerv2-ai-routes.ts', "'/suggest'"));
check(
  'POST /equivalence route',
  fileContains('server/routes/cerv2-ai-routes.ts', "'/equivalence'")
);
check(
  'POST /benefit-risk route',
  fileContains('server/routes/cerv2-ai-routes.ts', "'/benefit-risk'")
);
check(
  'GET /templates/:docType route',
  fileContains('server/routes/cerv2-ai-routes.ts', "'/templates/:docType'")
);
check('AI routes mounted in index.ts', fileContains('server/index.ts', "app.use('/api/cerv2/ai'"));

// 6 – Editor conditional fields
console.log('\n── Editor Conditional Fields ──');
check(
  'CER 8 sections defined',
  fileContains(
    'client/src/components/MedicalDeviceDocumentEditor.jsx',
    "title: '8. Conclusions & Recommendations'"
  )
);
check(
  'CER State of Art section',
  fileContains(
    'client/src/components/MedicalDeviceDocumentEditor.jsx',
    "title: '1. State of the Art'"
  )
);
check(
  'CER GSPR Mapping section',
  fileContains('client/src/components/MedicalDeviceDocumentEditor.jsx', "title: '6. GSPR Mapping'")
);
check(
  'CER PMS/PMCF section',
  fileContains(
    'client/src/components/MedicalDeviceDocumentEditor.jsx',
    "title: '7. PMS Plan / PMCF'"
  )
);
check(
  'CER Benefit-Risk section',
  fileContains('client/src/components/MedicalDeviceDocumentEditor.jsx', "title: '5. Benefit")
);
check(
  'PMA sections present',
  fileContains('client/src/components/MedicalDeviceDocumentEditor.jsx', 'pmaSections')
);
check(
  'DocType switch logic',
  fileContains(
    'client/src/components/MedicalDeviceDocumentEditor.jsx',
    "documentType === 'cerv2_pma'"
  )
);

// 7 – DocTypes alignment
console.log('\n── DocTypes Alignment ──');
check('docTypes.js has cerv2_cer', fileContains('server/common/docTypes.js', 'cerv2_cer'));
check('docTypes.js has cerv2_pma', fileContains('server/common/docTypes.js', 'cerv2_pma'));
check('docTypes.js has cerv2_510k', fileContains('server/common/docTypes.js', 'cerv2_510k'));

// 8 – QA Audit Fix Verification
console.log('\n── QA Audit Fixes ──');

// C-1: PMA Clinical/Nonclinical section swap fix
check(
  'C-1: selectSection uses word-boundary matching',
  fileContains('server/export/renderers.ts', 'startsWith(needle)')
);
check(
  'C-1: Clinical Investigations uses specific needle',
  fileContains('server/export/renderers.ts', "selectSection(sections, 'Clinical Investigations')")
);

// H-1: Content validation (not z.any())
check(
  'H-1: content uses structured Zod schema',
  fileContains('server/routes/cerv2-export-routes.ts', "z.literal('doc')")
);
check(
  'H-1: content requires min 1 node',
  fileContains('server/routes/cerv2-export-routes.ts', 'min(1')
);

// H-2: ZIP error handler checks headersSent
{
  const exportSrc = fs.readFileSync(path.join(root, 'server/routes/cerv2-export-routes.ts'), 'utf-8');
  const archiveErrorBlocks = exportSrc.match(/archive\.on\('error'[\s\S]*?\}\);/g) || [];
  const allCheckHeadersSent = archiveErrorBlocks.every(b => b.includes('headersSent'));
  check('H-2: All archive error handlers check headersSent', allCheckHeadersSent);
}

// H-3: Fallback PDF decodes HTML entities
check(
  'H-3: fallbackPdf decodes &amp;',
  fileContains('server/export/renderers.ts', ".replace(/&amp;/g, '&')")
);
check(
  'H-3: fallbackPdf decodes &lt;',
  fileContains('server/export/renderers.ts', ".replace(/&lt;/g, '<')")
);

// M-1: Mock routes gated in production
check(
  'M-1: mock PDF route gated in production',
  fileContains('server/routes/cerv2-export-routes.ts', "NODE_ENV === 'production'")
);

// M-4: AI template keys match docTypes.js section IDs
check(
  'M-4: 510k template has "admin" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    admin:")
);
check(
  'M-4: 510k template has "se" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    se:")
);
check(
  'M-4: PMA template has "nonclin" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    nonclin:")
);
check(
  'M-4: PMA template has "mfgqa" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    mfgqa:")
);
check(
  'M-4: CER template has "sota" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    sota:")
);
check(
  'M-4: CER template has "benefitrisk" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    benefitrisk:")
);
check(
  'M-4: CER template has "concl" key',
  fileContains('server/routes/cerv2-ai-routes.ts', "    concl:")
);

// M-5: useMemo includes pmaSections/cerSections deps
check(
  'M-5: useMemo includes pmaSections dep',
  fileContains('client/src/components/MedicalDeviceDocumentEditor.jsx', 'pmaSections, cerSections]')
);

// M-7: templates route has try/catch
check(
  'M-7: templates route has try/catch',
  fileContains('server/routes/cerv2-ai-routes.ts', 'Templates error')
);

// L-5: Puppeteer failure logs warning
check(
  'L-5: Puppeteer logs warning on failure',
  fileContains('server/export/renderers.ts', 'Puppeteer cluster failed to launch')
);

console.log(`\n═══════════════════════════════════════════`);
console.log(`  Results: ${pass} passed, ${fail} failed out of ${pass + fail} checks`);
console.log(`═══════════════════════════════════════════\n`);

process.exit(fail > 0 ? 1 : 0);
