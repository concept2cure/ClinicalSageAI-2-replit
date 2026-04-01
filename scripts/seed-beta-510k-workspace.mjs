import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const seededProjects = [
  {
    key: 'green-path-complete',
    state: {
      deviceName: 'CardioSense Monitor',
      manufacturer: 'Concept2Cure Demo Labs',
      submissionType: 'Traditional 510(k)',
      predicateDevices: [{ k_number: 'K223456', applicant: 'Acme Med' }],
      equivalenceCompleted: true,
      complianceScore: 94,
      editorContent: 'Finalized substantial equivalence narrative.',
      vaultDocuments: ['510k-summary.docx', 'risk-analysis.pdf'],
      exportReady: true,
    },
  },
  {
    key: 'mid-path-partial',
    state: {
      deviceName: 'NeuroPatch Lite',
      manufacturer: 'Concept2Cure Demo Labs',
      submissionType: 'Traditional 510(k)',
      predicateDevices: [{ k_number: 'K201111', applicant: 'Neuro Med' }],
      equivalenceCompleted: false,
      complianceScore: 61,
      editorContent: 'Draft comparison table pending verification.',
      vaultDocuments: ['draft-intake-notes.md'],
      exportReady: false,
    },
  },
  {
    key: 'broken-path-validation-failure',
    state: {
      deviceName: 'AeroLab Proto',
      manufacturer: '',
      submissionType: 'Traditional 510(k)',
      predicateDevices: [],
      equivalenceCompleted: false,
      complianceScore: 0,
      editorContent: 'Validation intentionally broken for beta fail-path testing.',
      vaultDocuments: [],
      exportReady: false,
      validationErrors: ['manufacturer_required', 'predicate_required'],
    },
  },
];

const outputDir = path.resolve(process.cwd(), 'test-results', 'beta-seed');
await mkdir(outputDir, { recursive: true });
const outFile = path.join(outputDir, 'seeded-510k-workspace.json');
await writeFile(outFile, JSON.stringify({ seededAt: new Date().toISOString(), seededProjects }, null, 2));

console.log(`✅ Seed pack generated at ${outFile}`);
console.log('Use this pack to preload API fixtures or localStorage in beta demos.');
