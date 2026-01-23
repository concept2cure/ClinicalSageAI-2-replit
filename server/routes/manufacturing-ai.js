import express from 'express';
import { reviewManufacturing, simulateDeficiency } from '../src/services/ai/manufacturingReviewer.js';
import { exportModule3 } from '../src/services/module3/exporters/manufacturingExporter.js';

const router = express.Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

// POST /api/cmc/manufacturing/ai/review
router.post('/ai/review', async (req, res) => {
  try {
    const snapshot = req.body?.snapshot || {};
    const useLLM = !!req.body?.useLLM;
    const findings = await reviewManufacturing(snapshot, { useLLM });
    res.json({ findings, meta: { generatedAt: new Date().toISOString(), count: findings.length } });
  } catch (e) {
    console.error('[AI Review] error:', e);
    res.status(500).json({ error: 'AI review failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/ai/simulate-deficiency
router.post('/ai/simulate-deficiency', async (req, res) => {
  try {
    if (!isDemoMode()) {
      return res.status(501).json({
        error: 'Deficiency simulation is not configured. Set DEMO_MODE=true for simulated output.',
      });
    }

    const snapshot = req.body?.snapshot || {};
    const useLLM = !!req.body?.useLLM;
    const out = await simulateDeficiency(snapshot, { useLLM });
    res.json({ ...out, meta: { generatedAt: new Date().toISOString() } });
  } catch (e) {
    console.error('[Deficiency Simulator] error:', e);
    res.status(500).json({ error: 'Deficiency simulation failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/export/module3
router.post('/export/module3', async (req, res) => {
  try {
    const snapshot = req.body?.snapshot || {};
    const out = exportModule3(snapshot);
    res.json(out);
  } catch (e) {
    console.error('[Module3 Export] error:', e);
    res.status(500).json({ error: 'module3 export failed', detail: String(e.message || e) });
  }
});

// GET /api/cmc/manufacturing/overview  (enhanced KPIs)
router.get('/overview', async (req,res)=>{
  const { getKPIs } = await import('../src/services/manufacturing/kpiService.js');
  res.json({ kpis: getKPIs(), generatedAt: new Date().toISOString() });
});

// GET /api/cmc/manufacturing/sites  (richer)
router.get('/sites', async (req,res)=>{
  const repo = await import('../src/services/manufacturing/repo.js');
  res.json(repo.default.get('sites') || []);
});

// GET /api/cmc/manufacturing/equipment
router.get('/equipment', async (req,res)=>{
  const { siteId } = req.query;
  const repo = await import('../src/services/manufacturing/repo.js');
  const all = repo.default.get('equipment') || [];
  res.json(siteId ? all.filter(e=>e.siteId===siteId) : all);
});

// GET /api/cmc/manufacturing/regulator-view
router.get('/regulator-view', async (req, res) => {
  try {
    const repo = await import('../src/services/manufacturing/repo.js');
    const state = repo.default.load();

    const S = {
      '3.2.S.2.2': { title: 'S.2.2 Description of Manufacturing Process', ok: Boolean(state.process?.steps?.length) },
      '3.2.S.2.3': { title: 'S.2.3 Control of Materials',              ok: (state.materials||[]).length > 0 },
      '3.2.S.2.4': { title: 'S.2.4 Controls of Critical Steps',         ok: (state.process?.cppCqaMatrix||[]).length > 0 },
      '3.2.S.2.5': { title: 'S.2.5 Process Validation',                  ok: (state.validation?.ppq?.completedRuns||0) > 0 },
      '3.2.S.7'  : { title: 'S.7 Stability',                              ok: Boolean(state.validation?.cpv) }
    };

    const P = {
      '3.2.P.3.3': { title: 'P.3.3 Description of Manufacturing Process & Controls', ok: Boolean(state.process?.steps?.length) },
      '3.2.P.3.4': { title: 'P.3.4 Controls of Critical Steps',                      ok: (state.process?.cppCqaMatrix||[]).length > 0 },
      '3.2.P.3.5': { title: 'P.3.5 Process Validation',                               ok: (state.validation?.ppq?.completedRuns||0) > 0 },
      '3.2.P.7'  : { title: 'P.7 Container Closure System',                          ok: Boolean(state.packaging) }
    };

    const cppMissing = (state.process?.cppCqaMatrix||[]).filter(m=>!m.relation || m.relation==='unknown').length;
    const openCC = (state.changeControls||[]).filter(cc => !['Closed'].includes(cc.status));
    const deviations = state.deviations || [];
    const equipment = state.equipment || [];

    // High-risk equipment snapshot (critical + overdue calib or PQ missing)
    const eqRisk = equipment
      .filter(e => e.critical && ((e.calibrationDue && new Date(e.calibrationDue).getTime() < Date.now()) || e.pq !== true))
      .map(e => ({ id:e.id, siteId:e.siteId, calibDue:e.calibrationDue || null, pq:e.pq === true }));

    const ppq = state.validation?.ppq || { targetRuns:0, completedRuns:0 };
    const cpv = state.validation?.cpv || null;

    res.json({
      module3: { S, P },
      risks: {
        cppMissing,
        openChangeControls: openCC.map(({id,status,impacted}) => ({ id, status, impactedSections: impacted?.module3Sections || [] })),
        deviations: deviations.map(d => ({ id:d.id, title:d.title, severity:d.severity, state:d.state })),
        equipmentHighRisk: eqRisk
      },
      validation: { ppq, runs: state.validation?.runs || [], cpv },
      packaging: state.packaging || {},
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('[Regulator View] error:', e);
    res.status(500).json({ error:'regulator view failed', detail:String(e.message||e) });
  }
});

// GET /api/cmc/manufacturing/evidence (list candidate evidence docs/ids)
router.get('/evidence', async (req,res)=>{
  const repo = await import('../src/services/manufacturing/repo.js');
  const s = repo.default.load();
  // Build simple candidates: MBR ids, PPQ runs, CPV summary, CPP↔CQA count, packaging id
  const items = [];
  (s.mbrs||[]).forEach(m => items.push({ id:`mbr:${m.id}`, type:'MBR', label:`MBR ${m.id} (${m.version})` }));
  (s.validation?.runs||[]).forEach(r => items.push({ id:`ppq:${r.id}`, type:'PPQ', label:`PPQ run ${r.id} (Cp ${r.cp}/Cpk ${r.cpk})` }));
  if (s.validation?.cpv) items.push({ id:'cpv', type:'CPV', label:`CPV ${s.validation.cpv.metric}` });
  items.push({ id:'cppcqa', type:'CPP↔CQA', label:`CPP↔CQA matrix (${(s.process?.cppCqaMatrix||[]).length} entries)` });
  if (s.packaging) items.push({ id:`pkg:${s.packaging.id}`, type:'Packaging', label:`Packaging ${s.packaging.id}` });
  res.json({ items });
});

// POST /api/cmc/manufacturing/response (create/update a draft)
router.post('/response', async (req,res)=>{
  const { id, findingId, section, text, evidenceIds=[] } = req.body || {};
  if (!findingId || !section) return res.status(400).json({ error:'findingId and section required' });
  const responses = await import('../src/services/manufacturing/responseRepo.js');
  const now = new Date().toISOString();
  const resp = { id: id || ('RESP-' + Math.random().toString(36).slice(2,7).toUpperCase()), findingId, section, text: text || '', evidenceIds, updatedAt: now };
  const out = responses.upsert(resp);
  res.json(out);
});

// POST /api/cmc/manufacturing/response/push (to Document Authoring)
router.post('/response/push', async (req,res)=>{
  const { responseId } = req.body || {};
  if (!responseId) return res.status(400).json({ error:'responseId required' });
  const responses = await import('../src/services/manufacturing/responseRepo.js');
  const resp = responses.byId(responseId);
  if (!resp) return res.status(404).json({ error:'response not found' });
  
  // Simulate push to Document Authoring system
  const docData = {
    title: `Response to ${resp.section}`,
    content: resp.text,
    evidence: resp.evidenceIds,
    createdAt: new Date().toISOString(),
    section: resp.section,
    findingId: resp.findingId
  };
  
  res.json({ 
    success: true, 
    documentId: 'DOC-' + Math.random().toString(36).slice(2,8).toUpperCase(),
    pushed: docData 
  });
});

// GET /api/cmc/manufacturing/responses (list all draft responses)
router.get('/responses', async (req,res)=>{
  const responses = await import('../src/services/manufacturing/responseRepo.js');
  res.json({ responses: responses.list() });
});

// === STEP 17: TECH TRANSFER & SCALE-UP ===
// GET /api/cmc/manufacturing/tech-transfer
router.get('/tech-transfer', async (req, res) => {
  try {
    const repo = await import('../src/services/manufacturing/repo.js');
    const state = repo.default.load();
    const programs = state.techTransfers || [
      {
        id: 'TT-001',
        product: 'DP-Tablet-10mg',
        sendingSite: 'site-dp',
        receivingSite: 'site-dp-scale',
        status: 'Planning',
        readiness: { documents: 70, equipment: 60, utilities: 80, training: 50 },
        deltas: {
          equipment: [{ cls: 'Mixer', sending: 'MX-400', receiving: 'MX-600', difference: 'Scale up 1.5x; different shear profile' }],
          utilities: [{ type: 'HVAC', sending: 'ISO 7', receiving: 'ISO 7', difference: 'None' }],
          materials: [{ item: 'API-123', sending: 'Spec v1', receiving: 'Spec v1', difference: 'None' }],
        },
        comparability: {
          protocolId: 'CMP-001',
          rationale: 'Scale increase 1.5x; potential impact on blend uniformity & dissolution.',
          tests: ['Assay', 'Content Uniformity', 'Dissolution', 'Friability'],
          ppqAddendum: { extraRuns: 1, justification: 'Demonstrate capability at new scale' }
        },
        regulatoryImpact: { module3Sections: ['3.2.P.3.3', '3.2.P.3.4', '3.2.P.3.5'] }
      }
    ];
    res.json({ programs });
  } catch (e) {
    console.error('[Tech Transfer] error:', e);
    res.status(500).json({ error: 'tech transfer failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/tech-transfer/suggest
router.post('/tech-transfer/suggest', async (req, res) => {
  try {
    const { deltas = {} } = req.body || {};
    let extraRuns = 0;
    const addTests = new Set();
    (deltas.equipment || []).forEach(d => {
      if (/scale/i.test(d.difference)) extraRuns += 1;
      if (/shear/i.test(d.difference)) addTests.add('Dissolution (robustness at shear limits)');
    });
    res.json({ ppqAddendum: { extraRuns: Math.min(2, Math.max(0, extraRuns)) }, addTests: Array.from(addTests) });
  } catch (e) {
    console.error('[Tech Transfer Suggest] error:', e);
    res.status(500).json({ error: 'suggestion failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/tech-transfer/:id/open-change-control
router.post('/tech-transfer/:id/open-change-control', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await import('../src/services/manufacturing/repo.js');
    const prog = (repo.default.get('techTransfers') || []).find(x => x.id === id);
    if (!prog) return res.status(404).json({ error: 'program not found' });

    const cc = {
      id: 'CC-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      reason: `Tech Transfer ${id} — Module 3 impact`,
      requester: 'manufacturing_user',
      impacted: { module3Sections: prog.regulatoryImpact?.module3Sections || [] },
      status: 'Open',
      createdAt: new Date().toISOString(),
      approvals: {},
      diffs: {}
    };
    const list = repo.default.get('changeControls') || [];
    list.push(cc);
    repo.default.set('changeControls', list);
    
    res.json(cc);
  } catch (e) {
    console.error('[Tech Transfer CC] error:', e);
    res.status(500).json({ error: 'failed to open CC', detail: String(e.message || e) });
  }
});

// === STEP 18: MBR/EBR ENHANCEMENTS ===
// GET /api/cmc/manufacturing/mbr/versions
router.get('/mbr/versions', async (req, res) => {
  try {
    const repo = await import('../src/services/manufacturing/repo.js');
    const state = repo.default.load();
    const versions = state.mbrVersions || [
      {
        id: 'MBR-001',
        version: 'v2.1',
        product: 'Lisinopril 10mg',
        effectiveDate: '2024-01-15',
        status: 'Current',
        changes: ['Updated mixing time from 10min to 12min', 'Added in-process check at granulation'],
        signedBy: 'John Smith, Manufacturing Manager',
        approvedBy: 'Sarah Johnson, QA Director'
      },
      {
        id: 'MBR-001',
        version: 'v2.0',
        product: 'Lisinopril 10mg',
        effectiveDate: '2023-11-01',
        status: 'Superseded',
        changes: ['Initial scale-up version'],
        signedBy: 'John Smith, Manufacturing Manager',
        approvedBy: 'Sarah Johnson, QA Director'
      }
    ];
    res.json({ versions });
  } catch (e) {
    console.error('[MBR Versions] error:', e);
    res.status(500).json({ error: 'MBR versions failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/mbr/diff
router.post('/mbr/diff', async (req, res) => {
  try {
    const { versionA, versionB } = req.body || {};
    // Simulate diff calculation
    const diffs = [
      {
        section: 'Step 3: Granulation',
        field: 'mixing_time',
        oldValue: '10 minutes',
        newValue: '12 minutes',
        type: 'modified'
      },
      {
        section: 'Step 4: Drying',
        field: 'in_process_check',
        oldValue: null,
        newValue: 'Moisture content ≤ 2.0%',
        type: 'added'
      }
    ];
    res.json({ diffs, versionA, versionB });
  } catch (e) {
    console.error('[MBR Diff] error:', e);
    res.status(500).json({ error: 'MBR diff failed', detail: String(e.message || e) });
  }
});

// GET /api/cmc/manufacturing/ebr/timeline
router.get('/ebr/timeline', async (req, res) => {
  try {
    const { batchId } = req.query;
    const timeline = [
      {
        step: 'Material Dispensing',
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T09:30:00Z',
        operator: 'Mike Johnson',
        status: 'Complete',
        signatures: ['Mike Johnson', 'QC Inspector']
      },
      {
        step: 'Blending',
        startTime: '2024-01-15T09:30:00Z',
        endTime: '2024-01-15T11:00:00Z',
        operator: 'Sarah Wilson',
        status: 'Complete',
        signatures: ['Sarah Wilson']
      },
      {
        step: 'Compression',
        startTime: '2024-01-15T11:00:00Z',
        endTime: '2024-01-15T14:30:00Z',
        operator: 'David Chen',
        status: 'In Progress',
        signatures: []
      }
    ];
    res.json({ timeline, batchId });
  } catch (e) {
    console.error('[EBR Timeline] error:', e);
    res.status(500).json({ error: 'EBR timeline failed', detail: String(e.message || e) });
  }
});

// === STEP 19: CPP↔CQA AI-ASSISTED AUTHORING ===
// POST /api/cmc/manufacturing/cpp-cqa/suggest
router.post('/cpp-cqa/suggest', async (req, res) => {
  try {
    const { process = {}, validation = {} } = req.body || {};
    const steps = process.steps || [];
    const matrix = process.cppCqaMatrix || [];
    const knownCpp = new Set(steps.flatMap(s => Object.keys(s.setpoints || {})));
    const knownCqa = new Set(['Assay', 'Content Uniformity', 'Dissolution', 'Friability', 'Hardness', 'Appearance']);

    const existingKeys = new Set(matrix.map(m => `${m.cpp}→${m.cqa}`));
    const suggestions = [];
    for (const cpp of knownCpp) {
      for (const cqa of knownCqa) {
        const key = `${cpp}→${cqa}`;
        if (!existingKeys.has(key)) {
          const relation =
            (/time|min/i.test(cpp) && /Dissolution|Friability/i.test(cqa)) ? 'primary' :
            (/rpm|shear|temp|temperature/i.test(cpp) && /Assay|Content Uniformity/i.test(cqa)) ? 'primary' :
            'secondary';
          suggestions.push({ cpp, cqa, relation, rationale: `Heuristic link ${cpp} to ${cqa}` });
        }
      }
    }

    const ppqRuns = validation.runs || [];
    const conflicts = [];
    for (const s of steps) {
      for (const [param, value] of Object.entries(s.setpoints || {})) {
        const par = s.par?.[param];
        if (Array.isArray(par)) {
          const [low, high] = par;
          const nearEdge = (value - low) < 0.05 * (high - low) || (high - value) < 0.05 * (high - low);
          const failingRun = ppqRuns.find(r => r.status !== 'pass');
          if (nearEdge && failingRun) {
            conflicts.push({
              cpp: param,
              issue: 'Setpoint near PAR edge with non-passing PPQ run',
              recommendation: 'Tighten monitoring frequency; consider broadening PAR with additional data or add alarm tighter than PAR.'
            });
          }
        }
      }
    }

    res.json({ suggestions, conflicts });
  } catch (e) {
    console.error('[CPP-CQA Suggest] error:', e);
    res.status(500).json({ error: 'CPP-CQA suggestion failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/cpp-cqa/upsert
router.post('/cpp-cqa/upsert', async (req, res) => {
  try {
    const { matrix = [] } = req.body || {};
    const repo = await import('../src/services/manufacturing/repo.js');
    const state = repo.default.load();
    state.process = state.process || {};
    state.process.cppCqaMatrix = matrix;
    repo.default.save();

    res.json({ ok: true, count: matrix.length });
  } catch (e) {
    console.error('[CPP-CQA Upsert] error:', e);
    res.status(500).json({ error: 'CPP-CQA upsert failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/control-strategy/generate
router.post('/control-strategy/generate', async (req, res) => {
  try {
    const { process = {}, validation = {} } = req.body || {};
    const matrix = process.cppCqaMatrix || [];
    const rows = [];

    const stepByCpp = {};
    (process.steps || []).forEach(s => {
      Object.entries(s.par || {}).forEach(([p, rng]) => stepByCpp[p] = { range: rng });
    });

    for (const m of matrix) {
      const par = stepByCpp[m.cpp]?.range || [m.parLow, m.parHigh].filter(x => x != null);
      const parText = (par && par.length === 2) ? `${par[0]}–${par[1]}` : '—';
      const monitoring = (m.relation === 'primary')
        ? 'Every batch; inline sensor where available'
        : 'Per campaign; at-line test';
      const alarms = (par && par.length === 2)
        ? `Alert at 10% to PAR edge; Alarm at 5% to PAR edge`
        : `Define alert/alarm post-DoE`;
      const action = (m.relation === 'primary')
        ? 'Hold batch; QA review; deviation if outside PAR'
        : 'Document adjustment; escalate if trend persists';
      rows.push({
        cpp: m.cpp,
        cqa: m.cqa,
        relation: m.relation || 'secondary',
        par: parText,
        monitoring,
        alarms,
        actions: action
      });
    }

    const criteria = validation?.ppq?.acceptanceCriteria || [];
    res.json({ table: rows, ppqCriteria: criteria, module3Sections: ['3.2.P.3.3', '3.2.P.3.4'] });
  } catch (e) {
    console.error('[Control Strategy] error:', e);
    res.status(500).json({ error: 'control strategy failed', detail: String(e.message || e) });
  }
});

// === STEP 20: PACKAGING/SERIALIZATION TEMPLATES ===
// GET /api/cmc/manufacturing/packaging/templates
router.get('/packaging/templates', async (req, res) => {
  try {
    const templates = [
      {
        id: 'us-udi',
        name: 'US UDI Template',
        region: 'US',
        format: 'FDA UDI',
        variables: ['GTIN', 'LOT', 'SER', 'EXP'],
        template: '(01){GTIN}(10){LOT}(21){SER}(17){EXP}',
        validationRules: [
          'GTIN must be 14 digits',
          'LOT max 20 alphanumeric',
          'SER max 20 alphanumeric',
          'EXP format YYMMDD'
        ]
      },
      {
        id: 'eu-fmd',
        name: 'EU FMD/GS1 Template',
        region: 'EU',
        format: 'EU FMD Compliant',
        variables: ['GTIN', 'BATCH', 'SER', 'EXP'],
        template: '(01){GTIN}(10){BATCH}(21){SER}(17){EXP}',
        validationRules: [
          'GTIN must be 14 digits',
          'BATCH max 20 characters',
          'SER exactly 20 characters',
          'EXP format YYMMDD'
        ]
      },
      {
        id: 'jp-pmda',
        name: 'Japan PMDA Template',
        region: 'JP',
        format: 'PMDA Compliant',
        variables: ['JAN', 'LOT', 'SER', 'MFD', 'EXP'],
        template: 'JAN:{JAN}|LOT:{LOT}|SER:{SER}|MFD:{MFD}|EXP:{EXP}',
        validationRules: [
          'JAN must be 13 digits',
          'LOT max 16 characters',
          'SER numeric only',
          'MFD/EXP format YYYYMMDD'
        ]
      }
    ];
    res.json({ templates });
  } catch (e) {
    console.error('[Packaging Templates] error:', e);
    res.status(500).json({ error: 'packaging templates failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/packaging/preview
router.post('/packaging/preview', async (req, res) => {
  try {
    const { templateId, variables = {} } = req.body || {};
    
    // Get template
    const templatesResponse = await import('../src/services/manufacturing/repo.js');
    const templates = [
      {
        id: 'us-udi',
        template: '(01){GTIN}(10){LOT}(21){SER}(17){EXP}',
        validationRules: ['GTIN must be 14 digits', 'LOT max 20 alphanumeric']
      },
      {
        id: 'eu-fmd',
        template: '(01){GTIN}(10){BATCH}(21){SER}(17){EXP}',
        validationRules: ['GTIN must be 14 digits', 'BATCH max 20 characters']
      }
    ];
    
    const template = templates.find(t => t.id === templateId);
    if (!template) return res.status(404).json({ error: 'template not found' });

    // Generate preview
    let preview = template.template;
    const validationErrors = [];
    
    for (const [key, value] of Object.entries(variables)) {
      preview = preview.replace(new RegExp(`\\{${key}\\}`, 'g'), value || `{${key}}`);
    }

    // Basic validation
    if (variables.GTIN && variables.GTIN.length !== 14) {
      validationErrors.push('GTIN must be 14 digits');
    }

    res.json({ 
      preview, 
      validationErrors,
      isValid: validationErrors.length === 0,
      templateId 
    });
  } catch (e) {
    console.error('[Packaging Preview] error:', e);
    res.status(500).json({ error: 'packaging preview failed', detail: String(e.message || e) });
  }
});

// POST /api/cmc/manufacturing/packaging/push-to-authoring
router.post('/packaging/push-to-authoring', async (req, res) => {
  try {
    const { templateId, variables, preview } = req.body || {};
    
    const docData = {
      title: `Packaging Specification - ${templateId.toUpperCase()}`,
      content: `# Packaging Specification\n\n**Template:** ${templateId}\n\n**Generated Code:**\n\`\`\`\n${preview}\n\`\`\`\n\n**Variables:**\n${Object.entries(variables).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
      section: 'P.7 Container Closure System',
      createdAt: new Date().toISOString()
    };
    
    res.json({ 
      success: true, 
      documentId: 'DOC-PKG-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      pushed: docData 
    });
  } catch (e) {
    console.error('[Packaging Push] error:', e);
    res.status(500).json({ error: 'packaging push failed', detail: String(e.message || e) });
  }
});

export default router;