import { Router } from 'express';
import { db } from '../db';
import { facts, insertFactSchema } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const router = Router();

// Get all facts, optionally filtered by type
router.get('/', async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    
    let results = [];
    if (db) {
        let query = db.select().from(facts);
        if (type) {
          // @ts-ignore
          query = query.where(eq(facts.type, type));
        }
        // Sort by most recently updated
        results = await query.orderBy(desc(facts.updatedAt));
    } else {
        results = [
            { factId: 'mock-1', type: 'clinical', key: 'mock_endpoint', value: 'Mock Value (No DB)', source: 'N/A' }
        ];
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching facts:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new fact
router.post('/', async (req, res) => {
  try {
    const factId = `fact-${nanoid(8)}`;
    const result = insertFactSchema.parse({
      ...req.body,
      factId
    });

    const newFact = await db.insert(facts).values(result).returning();
    res.json(newFact[0]);
  } catch (error) {
    console.error('Error creating fact:', error);
    res.status(400).json({ error: 'Invalid input' });
  }
});

// Seed demo facts if empty
router.post('/seed-demo', async (req, res) => {
    try {
        const count = await db.select({ count: facts.id }).from(facts);
        if (count.length > 0 && count.length > 5) {
            return res.json({ message: 'Facts already seeded' });
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
            {
                factId: `fact-${nanoid(8)}`,
                type: 'drug_substance',
                key: 'molecular_weight',
                value: '452.3 g/mol',
                source: 'Manufacture Report',
                metadata: { compound: 'C2H4O2' }
            },
            {
                factId: `fact-${nanoid(8)}`,
                type: 'safety',
                key: 'sae_incidence_rate',
                value: '2.4%',
                source: 'Safety Database Export',
                metadata: { study: 'MD-2023-001', arm: 'active' }
            }
        ];

        for (const fact of demoFacts) {
            await db.insert(facts).values(fact).onConflictDoNothing();
        }

        res.json({ message: 'Demo facts seeded', count: demoFacts.length });

    } catch (error) {
        console.error('Error seeding facts:', error);
        res.status(500).json({ error: 'Seeding failed' });
    }
});

export default router;
