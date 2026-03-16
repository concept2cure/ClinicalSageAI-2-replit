const {Pool} = require("pg");
const p = new Pool({connectionString:"postgresql://postgres:postgres@127.0.0.1:5432/trialsage"});

async function run() {
  const r = await p.query(`
    SELECT id, artifact_id, title, version, status, ctd_section, length(content) as clen, project_id
    FROM concept2cure_artifacts 
    WHERE organization_id = 2 
    ORDER BY id
  `);
  console.log("ALL ARTIFACTS (org=2):");
  r.rows.forEach(a => {
    console.log(`  [${a.id}] proj=${a.project_id} v${a.version} ${a.status} ctd=${a.ctd_section || 'NULL'} (${a.clen}ch) "${a.title}"`);
  });
  
  // Check projects
  const p2 = await p.query("SELECT id, project_id, name, type FROM concept2cure_projects WHERE organization_id = 2 ORDER BY id");
  console.log("\nPROJECTS:");
  p2.rows.forEach(pr => console.log(`  [${pr.id}] pid=${pr.project_id} "${pr.name}" type=${pr.type}`));
  
  // Check version counts
  const vc = await p.query(`
    SELECT a.id, a.title, count(v.id) as version_count 
    FROM concept2cure_artifacts a 
    LEFT JOIN concept2cure_artifact_versions v ON v.artifact_id = a.id 
    WHERE a.organization_id = 2 
    GROUP BY a.id, a.title 
    ORDER BY a.id
  `);
  console.log("\nVERSION COUNTS:");
  vc.rows.forEach(r => console.log(`  [${r.id}] ${r.version_count} versions: "${r.title}"`));
  
  await p.end();
}
run();
