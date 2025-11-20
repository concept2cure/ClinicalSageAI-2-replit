/**
 * Seed a realistic in-memory data layer for demo/dev.
 * In production, replace writes with your DB (Drizzle/Prisma/etc.).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEST = path.join(__dirname, '..', 'services', 'manufacturing', 'seed.json');

const seed = {
  sites: [
    { id: 'site-ds', type: 'DS', name: 'BioPlant A', region: 'US',
      utilities: { wfi: 'OK', hvacClass: 'ISO 7' }, gmpCertificates: ['FDA','EMA'] },
    { id: 'site-dp', type: 'DP', name: 'FillFinish B', region: 'EU',
      utilities: { wfi: 'OK', hvacClass: 'ISO 5/7' }, gmpCertificates: ['EMA'] },
  ],
  equipment: [
    { id:'mix-100', siteId:'site-dp', class:'Mixer', model:'MX-400', critical:true,
      calibrationDue:'2025-05-01', iq:true, oq:true, pq:false, status:'active' },
    { id:'dryer-12', siteId:'site-dp', class:'Dryer', model:'DR-12', critical:true,
      calibrationDue:'2026-01-01', iq:true, oq:true, pq:true, status:'active' },
    { id:'br-3', siteId:'site-ds', class:'Bioreactor', model:'BR-3', critical:true,
      calibrationDue:'2026-02-01', iq:true, oq:false, pq:false, status:'commissioning' },
  ],
  materials: [
    { id:'MAT-API', name:'API-123', grade:'Pharma', pharmacopeia:['USP','EP'], keyImpurities:['Imp-A','Imp-B'] },
    { id:'MAT-EXC-PVP', name:'Povidone K30', grade:'Ph Eur', pharmacopeia:['EP'] },
    { id:'MAT-PACK-ALU', name:'Aluminum Blister', grade:'Food-Grade', pharmacopeia:[] },
  ],
  bom: [
    { id:'BOM-1', materialId:'MAT-API', specVersion:'v1', supplierId:'SUP-API', approved:true, alternates:['SUP-API-ALT'] },
    { id:'BOM-2', materialId:'MAT-EXC-PVP', specVersion:'v2', supplierId:'SUP-EXC', approved:true },
    { id:'BOM-3', materialId:'MAT-PACK-ALU', specVersion:'v1', supplierId:'SUP-PACK', approved:true },
  ],
  process: {
    steps: [
      { id:'mix-1', name:'Mixing', unitOp:'Mix', setpoints:{ rpm:250, tempC:22 }, par:{ rpm:[200,300], tempC:[20,25] } },
      { id:'gran-1', name:'Granulation', unitOp:'Granulate', setpoints:{ timeMin:30 }, par:{ timeMin:[20,40] } },
      { id:'dry-1', name:'Drying', unitOp:'Dry', setpoints:{ tempC:45 }, par:{ tempC:[40,50] } },
    ],
    cppCqaMatrix: [
      { cpp:'rpm', cqa:'Assay', relation:'primary', parLow:200, parHigh:300 },
      { cpp:'timeMin', cqa:'Dissolution', relation:'primary', parLow:20, parHigh:40 },
      // One intentionally missing relation → triggers Q8-210 in AI review
      { cpp:'tempC', cqa:'Friability', relation:'unknown' },
    ]
  },
  mbrs: [
    { id:'MBR-001', version:'v1', status:'approved', steps:['Weigh','Mix','Granulate','Dry','Compress'], signatures:[
      { user:'qa_user', role:'QA', at:'2025-08-01T10:00:00Z' }
    ] }
  ],
  batches: [
    { id:'BATCH-2025-09-01-01', mbrId:'MBR-001', siteId:'site-dp', status:'executed', yieldActual:95.2,
      deviations:['DEV-001'], genealogy:{ parents:[], children:[] }, ebrRef:'EBR#1001' }
  ],
  validation: {
    ppq: { targetRuns:3, completedRuns:2, acceptanceCriteria:['Cp>=1.33','Cpk>=1.33'] },
    runs: [
      { id:'PPQ-1', cp:1.41, cpk:1.35, status:'pass' },
      { id:'PPQ-2', cp:1.29, cpk:1.21, status:'investigate' },
    ],
    cpv: {
      metric: 'Assay %', mean: 99.2, ucl: 101.0, lcl: 97.0,
      series: [
        { t:'2025-07-01', v:98.9 }, { t:'2025-07-15', v:99.3 }, { t:'2025-08-01', v:100.4 },
        { t:'2025-08-15', v:99.0 }, { t:'2025-09-01', v:99.6 }
      ]
    }
  },
  deviations: [
    { id:'DEV-001', severity:'high', title:'Yield below spec', state:'Investigating', related:['batch:BATCH-2025-09-01-01','cpp:rpm'] }
  ],
  capas: [],
  changeControls: [],
  packaging: { id:'PKG-001', format:'Blister', components:['Base Foil','Lidding Foil'], ccSystem:'Alu/Alu', labelTemplateId:'LBL-01' },
  serializationRules: [
    { id:'SER-US', region:'US', schema:'UDI', checks:['UDI-DI','UDI-PI Lot','UDI-PI Exp'] },
    { id:'SER-EU', region:'EU', schema:'GS1', checks:['GTIN (01)','Batch (10)','Expiry (17)'] },
  ],
  aiFindings: []
};

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, JSON.stringify(seed, null, 2));
console.log('[seed] Wrote', DEST);