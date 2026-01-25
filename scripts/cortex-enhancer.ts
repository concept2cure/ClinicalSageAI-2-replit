/**
 * LUMEN CORTEX - Enhancement Runner Script
 *
 * Runs knowledge graph building, quality assessment, and conflict detection
 * across all atoms in the Cortex.
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ═══════════════════════════════════════════════════════════════════════════
//                         KNOWLEDGE GRAPH BUILDER
// ═══════════════════════════════════════════════════════════════════════════

async function buildKnowledgeGraph(limit: number = 200): Promise<number> {
  console.log('\n🔗 Building Knowledge Graph...');

  // Get atoms for graph building
  const atoms = await pool.query(
    `
    SELECT id, title, content, atom_type, source_type, tags, metadata
    FROM lumen_data_atoms
    LIMIT $1
  `,
    [limit]
  );

  let edgesCreated = 0;

  for (const atom of atoms.rows) {
    // Find related atoms by type
    const sameType = await pool.query(
      `
      SELECT id FROM lumen_data_atoms
      WHERE atom_type = $1 AND id != $2
      LIMIT 5
    `,
      [atom.atom_type, atom.id]
    );

    for (const related of sameType.rows) {
      try {
        await pool.query(
          `
          INSERT INTO lumen_knowledge_graph_edges (
            source_atom_id, target_atom_id, relationship_type,
            relationship_strength, bidirectional, extracted_from, confidence
          ) VALUES ($1, $2, 'same_topic', 0.4, true, 'metadata', 0.6)
          ON CONFLICT (source_atom_id, target_atom_id, relationship_type) DO NOTHING
        `,
          [atom.id, related.id]
        );
        edgesCreated++;
      } catch (e) {
        /* skip duplicates */
      }
    }

    // Find atoms with overlapping content using full-text search
    const titleWords = atom.title
      .split(' ')
      .filter((w: string) => w.length > 4)
      .slice(0, 3);
    if (titleWords.length > 0) {
      const searchQuery = titleWords.join(' & ');
      const contentRelated = await pool.query(
        `
        SELECT id FROM lumen_data_atoms
        WHERE id != $1
          AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', $2)
        LIMIT 5
      `,
        [atom.id, searchQuery]
      );

      for (const related of contentRelated.rows) {
        try {
          await pool.query(
            `
            INSERT INTO lumen_knowledge_graph_edges (
              source_atom_id, target_atom_id, relationship_type,
              relationship_strength, bidirectional, extracted_from, confidence
            ) VALUES ($1, $2, 'related_to', 0.6, true, 'content_analysis', 0.7)
            ON CONFLICT (source_atom_id, target_atom_id, relationship_type) DO NOTHING
          `,
            [atom.id, related.id]
          );
          edgesCreated++;
        } catch (e) {
          /* skip duplicates */
        }
      }
    }

    // Connect FDA-related atoms
    if (atom.source_type?.includes('fda') || atom.source_type?.includes('openFDA')) {
      const fdaRelated = await pool.query(
        `
        SELECT id FROM lumen_data_atoms
        WHERE id != $1
          AND (source_type ILIKE '%fda%' OR source_type ILIKE '%openFDA%')
        LIMIT 5
      `,
        [atom.id]
      );

      for (const related of fdaRelated.rows) {
        try {
          await pool.query(
            `
            INSERT INTO lumen_knowledge_graph_edges (
              source_atom_id, target_atom_id, relationship_type,
              relationship_strength, bidirectional, extracted_from, confidence
            ) VALUES ($1, $2, 'same_agency', 0.5, true, 'metadata', 0.8)
            ON CONFLICT (source_atom_id, target_atom_id, relationship_type) DO NOTHING
          `,
            [atom.id, related.id]
          );
          edgesCreated++;
        } catch (e) {
          /* skip duplicates */
        }
      }
    }

    // Connect EMA-related atoms
    if (atom.atom_type?.includes('ema')) {
      const emaRelated = await pool.query(
        `
        SELECT id FROM lumen_data_atoms
        WHERE id != $1 AND atom_type ILIKE '%ema%'
        LIMIT 5
      `,
        [atom.id]
      );

      for (const related of emaRelated.rows) {
        try {
          await pool.query(
            `
            INSERT INTO lumen_knowledge_graph_edges (
              source_atom_id, target_atom_id, relationship_type,
              relationship_strength, bidirectional, extracted_from, confidence
            ) VALUES ($1, $2, 'same_agency', 0.5, true, 'metadata', 0.8)
            ON CONFLICT (source_atom_id, target_atom_id, relationship_type) DO NOTHING
          `,
            [atom.id, related.id]
          );
          edgesCreated++;
        } catch (e) {
          /* skip duplicates */
        }
      }
    }

    // Connect rejection patterns to related content
    if (atom.atom_type === 'rejection_pattern') {
      const relatedToRejection = await pool.query(
        `
        SELECT id FROM lumen_data_atoms
        WHERE id != $1
          AND (atom_type IN ('ich_guideline', 'proactive_guidance')
               OR title ILIKE '%guidance%' OR title ILIKE '%requirement%')
        LIMIT 5
      `,
        [atom.id]
      );

      for (const related of relatedToRejection.rows) {
        try {
          await pool.query(
            `
            INSERT INTO lumen_knowledge_graph_edges (
              source_atom_id, target_atom_id, relationship_type,
              relationship_strength, bidirectional, extracted_from, confidence
            ) VALUES ($1, $2, 'requires', 0.7, false, 'content_analysis', 0.6)
            ON CONFLICT (source_atom_id, target_atom_id, relationship_type) DO NOTHING
          `,
            [atom.id, related.id]
          );
          edgesCreated++;
        } catch (e) {
          /* skip duplicates */
        }
      }
    }
  }

  console.log(`   ✅ Created ${edgesCreated} edges`);
  return edgesCreated;
}

// ═══════════════════════════════════════════════════════════════════════════
//                         QUALITY ASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════

async function assessQuality(limit: number = 500): Promise<number> {
  console.log('\n📊 Assessing Atom Quality...');

  // Source reliability scores
  const sourceReliability: Record<string, number> = {
    fda: 0.95,
    openFDA: 0.95,
    ema: 0.95,
    ich: 0.99,
    'clinicaltrials.gov': 0.9,
    pubmed: 0.85,
    derived: 0.7,
    manual: 0.6,
    scrape: 0.5,
  };

  const atoms = await pool.query(
    `
    SELECT a.id, a.title, a.content, a.atom_type, a.source_type,
           a.confidence, a.source_url, a.tags, a.metadata, a.created_at
    FROM lumen_data_atoms a
    LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
    WHERE q.id IS NULL
    LIMIT $1
  `,
    [limit]
  );

  let assessed = 0;

  for (const atom of atoms.rows) {
    // Calculate completeness
    let completeness = 0;
    if (atom.title && atom.title.length > 5) completeness += 0.3;
    if (atom.content && atom.content.length > 50) completeness += 0.3;
    if (atom.source_type) completeness += 0.15;
    if (atom.tags && atom.tags.length > 0) completeness += 0.1;
    if (atom.source_url) completeness += 0.1;
    if (atom.metadata && Object.keys(atom.metadata).length > 0) completeness += 0.05;

    // Calculate accuracy (based on confidence and content)
    let accuracy = atom.confidence || 0.5;
    if (atom.content && atom.content.length > 200) accuracy += 0.1;
    accuracy = Math.min(1.0, accuracy);

    // Calculate timeliness
    const ageInDays = (Date.now() - new Date(atom.created_at).getTime()) / (1000 * 60 * 60 * 24);
    let timeliness = 1.0;
    if (ageInDays > 730) timeliness = 0.2;
    else if (ageInDays > 365) timeliness = 0.5;
    else if (ageInDays > 180) timeliness = 0.7;
    else if (ageInDays > 90) timeliness = 0.85;

    // Calculate source reliability
    let reliability = 0.5;
    const sourceTypeLower = (atom.source_type || '').toLowerCase();
    for (const [key, score] of Object.entries(sourceReliability)) {
      if (sourceTypeLower.includes(key.toLowerCase())) {
        reliability = Math.max(reliability, score);
      }
    }

    // Citation score (placeholder - based on having source_url)
    let citationScore = atom.source_url ? 0.6 : 0.2;

    // Overall score
    const overall =
      completeness * 0.25 +
      accuracy * 0.25 +
      timeliness * 0.2 +
      reliability * 0.2 +
      citationScore * 0.1;

    // Store quality score
    await pool.query(
      `
      INSERT INTO lumen_atom_quality_scores (
        atom_id, completeness_score, accuracy_score, timeliness_score,
        source_reliability, citation_score, overall_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (atom_id) DO UPDATE SET
        completeness_score = $2, accuracy_score = $3, timeliness_score = $4,
        source_reliability = $5, citation_score = $6, overall_score = $7,
        assessed_at = NOW()
    `,
      [atom.id, completeness, accuracy, timeliness, reliability, citationScore, overall]
    );

    assessed++;
  }

  console.log(`   ✅ Assessed ${assessed} atoms`);
  return assessed;
}

// ═══════════════════════════════════════════════════════════════════════════
//                         VERSION INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function initializeVersions(limit: number = 500): Promise<number> {
  console.log('\n📝 Creating Initial Version Records...');

  const atoms = await pool.query(
    `
    SELECT a.id, a.title, a.content, a.atom_type, a.metadata, a.tags
    FROM lumen_data_atoms a
    LEFT JOIN lumen_atom_versions v ON a.id = v.atom_id
    WHERE v.id IS NULL
    LIMIT $1
  `,
    [limit]
  );

  let versioned = 0;

  for (const atom of atoms.rows) {
    // Generate content hash
    const crypto = await import('crypto');
    const contentHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          title: atom.title,
          content: atom.content,
          atomType: atom.atom_type,
          metadata: atom.metadata,
          tags: atom.tags,
        })
      )
      .digest('hex');

    await pool.query(
      `
      INSERT INTO lumen_atom_versions (
        atom_id, version_number, change_type,
        title, content, atom_type, metadata, tags,
        changed_fields, change_summary, changed_by, content_hash
      ) VALUES ($1, 1, 'create', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT DO NOTHING
    `,
      [
        atom.id,
        atom.title,
        atom.content,
        atom.atom_type,
        JSON.stringify(atom.metadata || {}),
        atom.tags || [],
        ['all'],
        'Initial version created',
        'system',
        contentHash,
      ]
    );

    versioned++;
  }

  console.log(`   ✅ Created ${versioned} initial versions`);
  return versioned;
}

// ═══════════════════════════════════════════════════════════════════════════
//                              MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🧠 LUMEN CORTEX ENHANCEMENT RUNNER');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Starting comprehensive knowledge base enhancement...\n');

  try {
    // Build knowledge graph
    const edges = await buildKnowledgeGraph(300);

    // Assess quality
    const assessed = await assessQuality(2200);

    // Initialize versions
    const versioned = await initializeVersions(2200);

    // Final statistics
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 FINAL STATISTICS');
    console.log('═══════════════════════════════════════════════════════════');

    const finalEdges = await pool.query('SELECT COUNT(*) FROM lumen_knowledge_graph_edges');
    const finalQuality = await pool.query(
      'SELECT AVG(overall_score) as avg, COUNT(*) as count FROM lumen_atom_quality_scores'
    );
    const finalVersions = await pool.query('SELECT COUNT(*) FROM lumen_atom_versions');

    console.log(`\n📈 Knowledge Graph: ${finalEdges.rows[0].count} edges`);
    console.log(`✅ Quality Scores: ${finalQuality.rows[0].count} atoms assessed`);
    console.log(`   Average Quality: ${(parseFloat(finalQuality.rows[0].avg) * 100).toFixed(1)}%`);
    console.log(`📝 Version Records: ${finalVersions.rows[0].count}`);

    // Quality distribution
    const distribution = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE overall_score >= 0.8) as excellent,
        COUNT(*) FILTER (WHERE overall_score >= 0.6 AND overall_score < 0.8) as good,
        COUNT(*) FILTER (WHERE overall_score >= 0.4 AND overall_score < 0.6) as fair,
        COUNT(*) FILTER (WHERE overall_score < 0.4) as poor
      FROM lumen_atom_quality_scores
    `);

    console.log('\n📊 Quality Distribution:');
    console.log(`   🟢 Excellent (≥80%): ${distribution.rows[0].excellent}`);
    console.log(`   🔵 Good (60-80%): ${distribution.rows[0].good}`);
    console.log(`   🟡 Fair (40-60%): ${distribution.rows[0].fair}`);
    console.log(`   🔴 Poor (<40%): ${distribution.rows[0].poor}`);

    // Edge type distribution
    const edgeTypes = await pool.query(`
      SELECT relationship_type, COUNT(*) as count
      FROM lumen_knowledge_graph_edges
      GROUP BY relationship_type
      ORDER BY count DESC
    `);

    console.log('\n🔗 Knowledge Graph Relationships:');
    for (const row of edgeTypes.rows) {
      console.log(`   - ${row.relationship_type}: ${row.count}`);
    }

    console.log('\n✅ Enhancement complete!');
  } catch (error) {
    console.error('❌ Error during enhancement:', error);
  } finally {
    await pool.end();
  }
}

main();
