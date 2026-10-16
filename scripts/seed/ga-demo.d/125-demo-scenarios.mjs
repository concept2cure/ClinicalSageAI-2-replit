/** Local-only fictional walkthroughs. No clinical results or approvals are fabricated. */
export const scenarios = [
  ['DEMO-BIO','Biotech','Rare disease IND readiness','IND','biologic','Identify missing toxicology evidence before an IND review','Open the program and review its planning status; ask AnA to list required evidence; assign the missing GLP report to the nonclinical lead; review the gap before drafting.','GLP toxicology report is intentionally absent.'],
  ['DEMO-PHA','Pharma','Global submission change assessment','MAA','drug','Coordinate a manufacturing change across regional submissions','Compare the proposed change with the evidence inventory; identify affected Module 3 sections; request regional regulatory review; retain unresolved questions.','Updated stability package has not been supplied.'],
  ['DEMO-MDX','Device maker','Connected device evidence planning','DE_NOVO','device','Plan evidence for a connected home monitoring device','Review the intended-use scenario; identify software and human-factors evidence needs; route a review to quality; show why readiness remains unmeasured.','Cybersecurity verification and usability reports are missing.'],
  ['DEMO-CRO','CRO','Sponsor portfolio review','IND','drug','Prepare a cross-functional sponsor status meeting','Open the CRO portfolio and compare its sample studies; use this program as a new sponsor intake; summarize open evidence requests; prepare a sponsor handoff without claiming completion.','The sponsor has not provided its final protocol.'],
  ['DEMO-ACA','Academic research','Investigator-led study planning','IND','biologic','Turn a research concept into an evidence collection plan','Review the study concept; identify protocol and consent document needs; capture investigator questions; hand the plan to the institutional review team.','Protocol and ethics review are pending; no study authorization is implied.'],
  ['DEMO-CDM','CDMO','Technology transfer package review','BLA','biologic','Coordinate a transfer package and Module 3 evidence','Review the manufacturing transfer scope; list batch and analytical evidence requests; identify missing comparability information; route the package for sponsor quality review.','Comparability assessment and validation summaries are absent.'],
  ['DEMO-CON','Consultancy','Client regulatory gap assessment','NDA','drug','Organize a client intake and prioritize evidence requests','Review the client intake; classify available versus missing evidence; create a review agenda; hand unresolved questions to the client regulatory owner.','The source dossier has not been uploaded.'],
  ['DEMO-HSP','Health system','Diagnostic pilot evidence review','DE_NOVO','device','Plan a diagnostic pilot with clinical and technical reviewers','Review the proposed pilot scope; identify performance and implementation evidence needs; assign clinical and IT review; explain the remaining approval gates.','No patient data, performance results, or pilot approval are included.'],
];
export default async function seed(client, {org, admin}) {
  // Same unambiguous workspace rule as the canonical program anchor.
  const workspaces = (await client.query(
    'SELECT id, metadata FROM client_workspaces WHERE organization_id=$1', [org.id])).rows;
  const defaults = workspaces.filter(w => w.metadata?.defaultForOrganization === true);
  const workspace = defaults.length === 1 ? defaults[0] : workspaces.length === 1 ? workspaces[0] : null;
  if (!workspace) throw new Error('Demo scenarios require one unambiguous organization workspace');
  let added = 0;
  for (const [code, clientType, title, pathway, productType, goal, steps, gap] of scenarios) {
    const metadata = {demo:true, synthetic:true, clientType, goal, walkthrough:steps, intentionalGap:gap, expectedOutcome:'A reviewable plan with explicit missing evidence; no approval or measured readiness.'};
    const result = await client.query(
      `INSERT INTO regulatory_programs
       (organization_id,name,code,program_type,product_type,primary_agency,target_agencies,
        product_name,indication,status,phase,priority,progress_percent,lead_user_id,metadata,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::json,$8,$9,'active','planning','medium',0,$10,$11::json,$12)
       ON CONFLICT (organization_id,code) DO NOTHING`,
      [org.id, '[DEMO] '+clientType+' · '+title,code,pathway,productType,pathway==='MAA'?'EMA':'FDA',
       JSON.stringify([pathway==='MAA'?'EMA':'FDA']), 'Fictional '+code,goal,admin.id,JSON.stringify(metadata),'jm.smith@concept2cure.pro']);
    added += result.rowCount;
    await client.query(
      `INSERT INTO projects
       (organization_id,client_workspace_id,name,code,description,status,type,depth,priority,
        created_by_id,owner_id,regulatory_program_id,metadata)
       SELECT $1,$2,p.name,p.code,$3,'active','regulatory',0,'medium',$4,$4,p.id,$5::json
       FROM regulatory_programs p WHERE p.organization_id=$1 AND p.code=$6
       AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.organization_id=$1 AND x.regulatory_program_id=p.id)`,
      [org.id,workspace.id,goal,admin.id,JSON.stringify(metadata),code]);
    const docTitle = '[DEMO] '+code+' — '+title+' walkthrough';
    const content = '<h1>'+docTitle+'</h1><p>Fictional demonstration only. No real patients, clinical findings, regulatory decisions, or approvals.</p><h2>Client and objective</h2><p>'+clientType+': '+goal+'</p><h2>Show-and-tell steps</h2><p>'+steps+'</p><h2>Intentional evidence gap</h2><p>'+gap+'</p><h2>Suggested AnA prompt</h2><p>Help me prepare an evidence-request checklist for '+code+'. Use only available sources, identify missing evidence, and do not change records or assert readiness.</p><h2>Expected result</h2><p>'+metadata.expectedOutcome+'</p>';
    // Project-linked walkthrough, visible under the existing Authoring ACL.
    const program = (await client.query(
      'SELECT id FROM regulatory_programs WHERE organization_id=$1 AND code=$2', [org.id,code])).rows[0];
    await client.query(
      `INSERT INTO authoring_documents
       (id,tenant_id,client_program_id,title,status,created_by,provenance)
       SELECT gen_random_uuid(),$1,$2,$3,'draft',$4,$5::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM authoring_documents WHERE tenant_id=$1 AND client_program_id=$2 AND title=$3)`,
      [org.id,program.id,docTitle,String(admin.id),JSON.stringify({demo:true,synthetic:true,source:'125-demo-scenarios.mjs'})]);
    const document = (await client.query(
      'SELECT id FROM authoring_documents WHERE tenant_id=$1 AND client_program_id=$2 AND title=$3',
      [org.id,program.id,docTitle])).rows[0];
    await client.query(
      `INSERT INTO authoring_sections (id,tenant_id,doc_id,code,title,content,order_index)
       SELECT gen_random_uuid(),$1,$2,'demo-walkthrough','Fictional demo walkthrough',$3,0
       WHERE NOT EXISTS (SELECT 1 FROM authoring_sections WHERE tenant_id=$1 AND doc_id=$2 AND code='demo-walkthrough')`,
      [org.id,document.id,content]);
    await client.query(
      `INSERT INTO coauthor_documents (organization_id,title,content,status,created_by,module_number)
       SELECT $1,$2,$3,'draft',$4,'1'
       WHERE NOT EXISTS (SELECT 1 FROM coauthor_documents WHERE organization_id=$1 AND title=$2)`,
      [org.id,docTitle,content,admin.id]);
  }
  console.log('Demo walkthroughs: '+added+' new programs; '+scenarios.length+' scenarios available.');
}
