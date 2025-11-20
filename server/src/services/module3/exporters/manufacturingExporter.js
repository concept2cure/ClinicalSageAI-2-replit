import path from 'path';

/**
 * Assemble 3.2 sections from manufacturing snapshot.
 * Inputs are simplified; replace with DB pulls in production.
 */
function buildS_Substance(snapshot = {}) {
  const site = snapshot.sites?.find(s => s.type === 'DS') || {};
  const proc = snapshot.process || {};
  const validation = snapshot.validation || {};

  return {
    section: '3.2.S',
    S_2_2: {
      title: 'S.2.2 Description of Manufacturing Process',
      text: [
        `Primary site: ${site.name || '—'} (${site.region || '—'})`,
        `Unit operations: ${(proc.steps || []).map(s=>s.name).join(' → ') || '—'}`
      ].join('\n'),
      trace: { siteId: site.id || null, stepIds: (proc.steps || []).map(s=>s.id) }
    },
    S_2_3: {
      title: 'S.2.3 Control of Materials',
      text: `Materials count: ${(snapshot.materials || []).length}`,
      trace: { materialIds: (snapshot.materials || []).map(m=>m.id) }
    },
    S_2_4: {
      title: 'S.2.4 Controls of Critical Steps and Intermediates',
      text: `CPP↔CQA links: ${((proc.cppCqaMatrix||[]).length)}`,
      trace: { matrixCount: (proc.cppCqaMatrix||[]).length }
    },
    S_2_5: {
      title: 'S.2.5 Process Validation and/or Evaluation',
      text: `PPQ: ${(validation.ppq?.completedRuns||0)}/${(validation.ppq?.targetRuns||0)}; Runs: ${(validation.runs||[]).length}`,
      trace: { ppq: validation.ppq || null, runIds: (validation.runs||[]).map(r=>r.id) }
    }
  };
}

function buildP_Product(snapshot = {}) {
  const site = snapshot.sites?.find(s => s.type === 'DP') || {};
  const proc = snapshot.process || {};
  const packaging = snapshot.packaging || {};
  const validation = snapshot.validation || {};

  return {
    section: '3.2.P',
    P_3_3: {
      title: 'P.3.3 Description of Manufacturing Process and Process Controls',
      text: [
        `Drug product site: ${site.name || '—'}`,
        `Process: ${(proc.steps || []).map(s=>`${s.name} (${s.unitOp})`).join(' → ') || '—'}`
      ].join('\n'),
      trace: { siteId: site.id || null, stepIds: (proc.steps || []).map(s=>s.id) }
    },
    P_3_4: {
      title: 'P.3.4 Controls of Critical Steps and Intermediates',
      text: `CPP↔CQA matrix entries: ${(proc.cppCqaMatrix || []).length}`,
      trace: { matrixCount: (proc.cppCqaMatrix || []).length }
    },
    P_3_5: {
      title: 'P.3.5 Process Validation and/or Evaluation',
      text: `PPQ completion: ${(validation.ppq?.completedRuns||0)}/${(validation.ppq?.targetRuns||0)} with criteria ${(validation.ppq?.acceptanceCriteria||[]).join(', ')}`,
      trace: { ppq: validation.ppq || null, runIds: (validation.runs||[]).map(r=>r.id) }
    },
    P_7: {
      title: 'P.7 Container Closure System',
      text: `Packaging config: ${packaging.format || '—'}; Components: ${(packaging.components||[]).join(', ') || '—'}`,
      trace: { packagingId: packaging.id || null }
    }
  };
}

/**
 * Return JSON "fragments" + a simple .docx placeholder path for UI (actual doc build can be plugged later).
 */
function exportModule3(snapshot = {}) {
  const S = buildS_Substance(snapshot);
  const P = buildP_Product(snapshot);
  const fragments = { S, P, generatedAt: new Date().toISOString() };

  // Doc placeholder (in prod, build a real .docx and save to object storage)
  const docxPath = path.join('/tmp', `module3_${Date.now()}.docx`);
  return { fragments, docxPath };
}

export { exportModule3, buildS_Substance, buildP_Product };