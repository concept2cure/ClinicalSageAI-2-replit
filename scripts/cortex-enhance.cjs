const pg = require('pg');
const crypto = require('crypto');

// Hardcode connection for script execution
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_bMoSyf2sDq6r@ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('🧠 CORTEX ENHANCEMENT');
  console.log('═══════════════════════════════════════');

  // Build edges
  console.log('\n🔗 Building Knowledge Graph Edges...');
  const atoms = await pool.query('SELECT id, atom_type FROM lumen_data_atoms LIMIT 200');
  let edges = 0;

  for (const atom of atoms.rows) {
    const related = await pool.query(
      'SELECT id FROM lumen_data_atoms WHERE atom_type = $1 AND id != $2 LIMIT 3',
      [atom.atom_type, atom.id]
    );
    for (const r of related.rows) {
      try {
        await pool.query(
          `INSERT INTO lumen_knowledge_graph_edges
           (source_atom_id, target_atom_id, relationship_type, relationship_strength, bidirectional, extracted_from, confidence)
           VALUES ($1, $2, 'same_topic', 0.4, true, 'metadata', 0.6)
           ON CONFLICT DO NOTHING`,
          [atom.id, r.id]
        );
        edges++;
      } catch (e) {}
    }
  }
  console.log('   ✅ Created', edges, 'edges');

  // Quality scores
  console.log('\n📊 Assessing Atom Quality...');
  const allAtoms = await pool.query(
    'SELECT id, title, content, source_type, confidence, structured_data FROM lumen_data_atoms LIMIT 500'
  );
  let assessed = 0;

  for (const a of allAtoms.rows) {
    const completeness =
      (a.title ? 0.4 : 0) +
      (a.content && a.content.length > 50 ? 0.4 : 0) +
      (a.structured_data ? 0.2 : 0);
    const accuracy = Math.min(1.0, a.confidence || 0.5);
    const reliability = (a.source_type || '').toLowerCase().includes('fda') ? 0.95 : 0.7;
    const overall = completeness * 0.3 + accuracy * 0.3 + reliability * 0.4;

    try {
      await pool.query(
        `INSERT INTO lumen_atom_quality_scores
         (atom_id, completeness_score, accuracy_score, timeliness_score, source_reliability, citation_score, overall_score)
         VALUES ($1, $2, $3, 0.8, $4, 0.5, $5)
         ON CONFLICT (atom_id) DO UPDATE SET overall_score = $5`,
        [a.id, completeness, accuracy, reliability, overall]
      );
      assessed++;
    } catch (e) {}
  }
  console.log('   ✅ Assessed', assessed, 'atoms');

  // Versions
  console.log('\n📝 Creating Version Records...');
  const novs = await pool.query(
    `SELECT a.id, a.title, a.content, a.atom_type
     FROM lumen_data_atoms a
     LEFT JOIN lumen_atom_versions v ON a.id = v.atom_id
     WHERE v.id IS NULL LIMIT 500`
  );
  let vers = 0;

  for (const a of novs.rows) {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ title: a.title, content: a.content }))
      .digest('hex');
    try {
      await pool.query(
        `INSERT INTO lumen_atom_versions
         (atom_id, version_number, change_type, title, content, atom_type, metadata, tags, changed_fields, change_summary, changed_by, content_hash)
         VALUES ($1, 1, 'create', $2, $3, $4, '{}', '{}', '{all}', 'Initial', 'system', $5)
         ON CONFLICT DO NOTHING`,
        [a.id, a.title, a.content, a.atom_type, hash]
      );
      vers++;
    } catch (e) {}
  }
  console.log('   ✅ Created', vers, 'versions');

  // Final stats
  console.log('\n═══════════════════════════════════════');
  console.log('📊 FINAL STATISTICS');
  console.log('═══════════════════════════════════════');

  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM lumen_data_atoms) as atoms,
      (SELECT COUNT(*) FROM lumen_knowledge_graph_edges) as edges,
      (SELECT COUNT(*) FROM lumen_atom_quality_scores) as quality,
      (SELECT ROUND(AVG(overall_score)::numeric, 3) FROM lumen_atom_quality_scores) as avg_quality,
      (SELECT COUNT(*) FROM lumen_atom_versions) as versions
  `);

  console.log('\n📦 Total Atoms:', stats.rows[0].atoms);
  console.log('🔗 Knowledge Graph Edges:', stats.rows[0].edges);
  console.log('✅ Quality Assessments:', stats.rows[0].quality);
  console.log(
    '📈 Average Quality Score:',
    (parseFloat(stats.rows[0].avg_quality) * 100).toFixed(1) + '%'
  );
  console.log('📝 Version Records:', stats.rows[0].versions);

  // Quality distribution
  const dist = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE overall_score >= 0.8) as excellent,
      COUNT(*) FILTER (WHERE overall_score >= 0.6 AND overall_score < 0.8) as good,
      COUNT(*) FILTER (WHERE overall_score >= 0.4 AND overall_score < 0.6) as fair,
      COUNT(*) FILTER (WHERE overall_score < 0.4) as poor
    FROM lumen_atom_quality_scores
  `);

  console.log('\n📊 Quality Distribution:');
  console.log('   🟢 Excellent (≥80%):', dist.rows[0].excellent);
  console.log('   🔵 Good (60-80%):', dist.rows[0].good);
  console.log('   🟡 Fair (40-60%):', dist.rows[0].fair);
  console.log('   🔴 Poor (<40%):', dist.rows[0].poor);

  console.log('\n✅ Enhancement complete!');

  await pool.end();
}

run().catch(e => {
  console.error('Error:', e.message);
  pool.end();
});
