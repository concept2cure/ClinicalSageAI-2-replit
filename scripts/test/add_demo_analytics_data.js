/**
 * DEMO ANALYTICS DATA GENERATOR
 *
 * This script adds comprehensive demo data to showcase the predictive analytics
 * capabilities with realistic regulatory commitments across different risk levels,
 * priorities, and timeline scenarios.
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DEMO_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const DEMO_USER_ID = 'demo-user';

// Realistic regulatory commitment examples
const demoCommitments = [
  // HIGH RISK SCENARIOS (overdue, critical priority)
  {
    description: 'Submit FDA 510(k) presubmission meeting request for cardiovascular device',
    due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days overdue
    authority: 'FDA',
    priority: 'Critical',
    commitment_type: 'Pre-market Submission',
    regulatory_section: '21 CFR 807',
    risk_level: 'High',
    status: 'Overdue',
    assigned_to_role: 'Regulatory Affairs',
    complexity_score: 0.9,
    notes: 'Critical path item for Q2 launch timeline',
  },
  {
    description: 'Complete clinical data package for EMA scientific advice',
    due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    authority: 'EMA',
    priority: 'Critical',
    commitment_type: 'Clinical Data',
    regulatory_section: 'EMA Guidelines',
    risk_level: 'High',
    status: 'At Risk',
    assigned_to_role: 'Clinical Operations',
    complexity_score: 0.85,
    notes: 'Waiting on final study report from CRO',
  },

  // MEDIUM RISK SCENARIOS
  {
    description: 'Prepare quality management system documentation for ISO 13485 audit',
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
    authority: 'ISO',
    priority: 'High',
    commitment_type: 'Quality System',
    regulatory_section: 'ISO 13485',
    risk_level: 'Medium',
    status: 'In Progress',
    assigned_to_role: 'Quality Assurance',
    complexity_score: 0.7,
    notes: 'Documentation review in progress',
  },
  {
    description: 'Submit post-market surveillance report to Health Canada',
    due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 3 weeks
    authority: 'Health Canada',
    priority: 'High',
    commitment_type: 'Post-Market',
    regulatory_section: 'MDR',
    risk_level: 'Medium',
    status: 'Active',
    assigned_to_role: 'Post-Market Surveillance',
    complexity_score: 0.6,
    notes: 'Data collection 70% complete',
  },
  {
    description: 'Update device labeling per FDA guidance on cybersecurity',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 1 month
    authority: 'FDA',
    priority: 'Medium',
    commitment_type: 'Labeling',
    regulatory_section: '21 CFR 801',
    risk_level: 'Medium',
    status: 'Under Review',
    assigned_to_role: 'Regulatory Affairs',
    complexity_score: 0.5,
    notes: 'Legal review pending',
  },

  // LOW RISK SCENARIOS (well-managed, on track)
  {
    description: 'Prepare annual medical device report (MDR) for Class II device',
    due_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 2 months
    authority: 'FDA',
    priority: 'Medium',
    commitment_type: 'Annual Report',
    regulatory_section: '21 CFR 814',
    risk_level: 'Low',
    status: 'Active',
    assigned_to_role: 'Regulatory Affairs',
    complexity_score: 0.4,
    notes: 'Template prepared, data collection started',
  },
  {
    description: 'Complete design controls documentation for new software module',
    due_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 6 weeks
    authority: 'FDA',
    priority: 'Medium',
    commitment_type: 'Design Controls',
    regulatory_section: '21 CFR 820',
    risk_level: 'Low',
    status: 'Active',
    assigned_to_role: 'R&D',
    complexity_score: 0.3,
    notes: 'Design inputs finalized, outputs in progress',
  },
  {
    description: 'Submit routine correspondence for device modification notification',
    due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
    authority: 'FDA',
    priority: 'Low',
    commitment_type: 'Correspondence',
    regulatory_section: '21 CFR 807',
    risk_level: 'Low',
    status: 'Active',
    assigned_to_role: 'Regulatory Affairs',
    complexity_score: 0.2,
    notes: 'Minor modification, low regulatory impact',
  },

  // COMPLETED EXAMPLES (for historical context)
  {
    description: 'Submit Q1 adverse event reports to FDA MedWatch',
    due_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 1 month ago
    authority: 'FDA',
    priority: 'High',
    commitment_type: 'Safety Reporting',
    regulatory_section: '21 CFR 803',
    risk_level: 'Medium',
    status: 'Completed',
    assigned_to_role: 'Post-Market Surveillance',
    complexity_score: 0.6,
    notes: 'Submitted on time, FDA acknowledged receipt',
    actual_completion_date: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
  },
  {
    description: 'Update technical documentation for CE marking renewal',
    due_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago
    authority: 'Notified Body',
    priority: 'Critical',
    commitment_type: 'CE Marking',
    regulatory_section: 'MDR 2017/745',
    risk_level: 'High',
    status: 'Completed',
    assigned_to_role: 'Regulatory Affairs',
    complexity_score: 0.8,
    notes: 'Completed ahead of schedule, certification received',
    actual_completion_date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
  },

  // UNASSIGNED COMMITMENTS (to trigger assignment recommendations)
  {
    description: 'Prepare clinical evaluation plan for new indication',
    due_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 4 weeks
    authority: 'EMA',
    priority: 'High',
    commitment_type: 'Clinical Evaluation',
    regulatory_section: 'MDR Annex XIV',
    risk_level: 'Medium',
    status: 'Active',
    assigned_to_role: null, // Unassigned
    complexity_score: 0.7,
    notes: 'Awaiting resource allocation',
  },
  {
    description: 'Review biocompatibility testing requirements for new material',
    due_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // 5 weeks
    authority: 'FDA',
    priority: 'Medium',
    commitment_type: 'Testing',
    regulatory_section: 'ISO 10993',
    risk_level: 'Low',
    status: 'Active',
    assigned_to_role: null, // Unassigned
    complexity_score: 0.4,
    notes: 'Material supplier to provide initial data',
  },
];

async function addDemoAnalyticsData() {
  console.log('🎯 ADDING COMPREHENSIVE DEMO ANALYTICS DATA\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('📋 Clearing existing demo data...');
    await client.query('DELETE FROM regulatory_commitments WHERE tenant_id = $1', [DEMO_TENANT_ID]);

    console.log('📊 Adding demo commitments with varied risk profiles...\n');

    for (let i = 0; i < demoCommitments.length; i++) {
      const commitment = demoCommitments[i];

      const insertQuery = `
        INSERT INTO regulatory_commitments (
          description, due_date, authority, priority, commitment_type,
          regulatory_section, risk_level, status, assigned_to_role,
          complexity_score, notes, actual_completion_date,
          tenant_id, created_by, updated_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
        ) RETURNING id, description, status, priority
      `;

      const result = await client.query(insertQuery, [
        commitment.description,
        commitment.due_date,
        commitment.authority,
        commitment.priority,
        commitment.commitment_type,
        commitment.regulatory_section,
        commitment.risk_level,
        commitment.status,
        commitment.assigned_to_role,
        commitment.complexity_score,
        commitment.notes,
        commitment.actual_completion_date || null,
        DEMO_TENANT_ID,
        DEMO_USER_ID,
        DEMO_USER_ID,
      ]);

      const created = result.rows[0];
      console.log(
        `✅ Added: [${created.status}] ${created.priority} - ${created.description.substring(0, 60)}...`
      );
    }

    await client.query('COMMIT');

    console.log('\n📈 DEMO DATA SUMMARY:');

    // Generate summary statistics
    const statusCounts = await client.query(
      `
      SELECT status, COUNT(*) as count 
      FROM regulatory_commitments 
      WHERE tenant_id = $1 
      GROUP BY status 
      ORDER BY count DESC
    `,
      [DEMO_TENANT_ID]
    );

    const priorityCounts = await client.query(
      `
      SELECT priority, COUNT(*) as count 
      FROM regulatory_commitments 
      WHERE tenant_id = $1 
      GROUP BY priority 
      ORDER BY 
        CASE priority 
          WHEN 'Critical' THEN 1 
          WHEN 'High' THEN 2 
          WHEN 'Medium' THEN 3 
          WHEN 'Low' THEN 4 
        END
    `,
      [DEMO_TENANT_ID]
    );

    const riskCounts = await client.query(
      `
      SELECT risk_level, COUNT(*) as count 
      FROM regulatory_commitments 
      WHERE tenant_id = $1 
      GROUP BY risk_level 
      ORDER BY 
        CASE risk_level 
          WHEN 'High' THEN 1 
          WHEN 'Medium' THEN 2 
          WHEN 'Low' THEN 3 
        END
    `,
      [DEMO_TENANT_ID]
    );

    console.log('\n📊 Status Distribution:');
    statusCounts.rows.forEach(row => {
      console.log(`   • ${row.status}: ${row.count} commitments`);
    });

    console.log('\n🎯 Priority Distribution:');
    priorityCounts.rows.forEach(row => {
      console.log(`   • ${row.priority}: ${row.count} commitments`);
    });

    console.log('\n⚠️ Risk Distribution:');
    riskCounts.rows.forEach(row => {
      console.log(`   • ${row.risk_level} Risk: ${row.count} commitments`);
    });

    // Get upcoming deadlines
    const upcomingDeadlines = await client.query(
      `
      SELECT description, due_date, priority, status 
      FROM regulatory_commitments 
      WHERE tenant_id = $1 
        AND due_date >= NOW() 
        AND status NOT IN ('Completed', 'Cancelled')
      ORDER BY due_date ASC 
      LIMIT 5
    `,
      [DEMO_TENANT_ID]
    );

    console.log('\n📅 Upcoming Deadlines (Next 5):');
    upcomingDeadlines.rows.forEach(row => {
      const daysUntil = Math.ceil((new Date(row.due_date) - new Date()) / (1000 * 60 * 60 * 24));
      console.log(
        `   • ${daysUntil} days: [${row.priority}] ${row.description.substring(0, 50)}...`
      );
    });

    console.log('\n🎉 DEMO ANALYTICS DATA SUCCESSFULLY ADDED!');
    console.log('   ✅ Comprehensive risk scenarios included');
    console.log('   ✅ Varied timeline examples provided');
    console.log('   ✅ Multiple priority levels represented');
    console.log('   ✅ Realistic regulatory authority mix');
    console.log('   ✅ Historical completion data included');
    console.log('   ✅ Unassigned commitments for recommendation testing');

    console.log('\n🔮 Ready for Predictive Analytics Testing:');
    console.log('   • High-risk scenarios will trigger alerts');
    console.log('   • Medium-risk items will show in insights');
    console.log('   • Low-risk commitments demonstrate good performance');
    console.log('   • Overdue items will generate critical recommendations');
    console.log('   • Unassigned commitments will prompt assignment alerts');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding demo data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the demo data generation
addDemoAnalyticsData()
  .then(() => {
    console.log('\n🎯 DEMO DATA GENERATION COMPLETE - Test the predictive analytics now!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Demo data generation failed:', error);
    process.exit(1);
  });
