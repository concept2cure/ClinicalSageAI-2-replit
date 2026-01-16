import { db } from '../db';
import { facts } from '@shared/schema';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

async function seedFacts() {
  console.log('Seeding facts...');
  try {
    const existing = await db.select().from(facts).limit(1);
    if (existing.length > 0) {
      console.log('Facts table already has data. Skipping seed.');
      process.exit(0);
    }

    const demoFacts = [
        {
            factId: `fact-${nanoid(8)}`,
            type: 'clinical',
            key: 'primary_endpoint_p_value',
            value: '0.0012',
            source: 'CSR-2023-001 table 14.2',
            metadata: { study: 'MD-2023-001', domain: 'efficacy' }
        },
        {
            factId: `fact-${nanoid(8)}`,
            type: 'clinical',
            key: 'total_subjects_randomized',
            value: '450',
            source: 'Protocol V2.0',
            metadata: { study: 'MD-2023-001' }
        },
        // Toxicology facts
        {
            factId: `fact-${nanoid(8)}`,
            type: 'toxicology',
            key: 'rat_noael',
            value: '150 mg/kg',
            source: 'Tox Report 101',
            metadata: { species: 'rat', duration: '28-day' }
        },
        {
            factId: `fact-${nanoid(8)}`,
            type: 'toxicology',
            key: 'dog_noael',
            value: '75 mg/kg',
            source: 'Tox Report 102',
            metadata: { species: 'dog', duration: '28-day' }
        },
        // Clinical Endpoints
        {
            factId: `fact-${nanoid(8)}`,
            type: 'clinical',
            key: 'primary_endpoint',
            value: 'Reduction in SBP from baseline at Week 12',
            source: 'Protocol V3.0',
            metadata: { type: 'efficacy' }
        },
        {
            factId: `fact-${nanoid(8)}`,
            type: 'clinical',
            key: 'secondary_endpoint',
            value: 'Percentage of responders (SBP < 130 mmHg)',
            source: 'Protocol V3.0',
            metadata: { type: 'efficacy' }
        }
    ];

    for (const fact of demoFacts) {
        await db.insert(facts).values(fact);
        console.log(`Inserted fact: ${fact.key}`);
    }
    console.log('Seeding complete.');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seedFacts();
