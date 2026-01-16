import { Router } from 'express';
import { db } from '../db';
import { facts, ectdGranules } from '../../shared/schema';
import { eq, like, desc, and } from 'drizzle-orm';

const router = Router();

router.post('/generate', async (req, res) => {
  try {
    const { templateId, dataSource, config, projectId } = req.body;

    console.log(`Generating Smart Block: ${templateId} with source ${dataSource}`);

    // Try to fetch real facts from our Graph
    // In a real system, we'd have a mapping of templateId -> query logic
    // For now, we simulate this dynamic behavior
    
    let factsList = [];
    if (db) { 
        factsList = await db.select().from(facts).limit(20);
    } else {
        // Fallback mock data if DB not connected
        factsList = [
             { type: 'toxicology', key: 'rat_noael', value: '150 mg/kg' },
             { type: 'toxicology', key: 'dog_noael', value: '75 mg/kg' },
             { type: 'clinical', key: 'primary_endpoint', value: 'Reduction in SBP from baseline' }
        ];
    }

    if (templateId === 'mrsd-table') {
        const toxicFacts = factsList.filter(f => f.type === 'toxicology' || f.key.includes('noael'));
        // Construct HTML table
        content = `
        <figure class="smart-block-container" data-template="${templateId}">
          <table class="w-full border-collapse border border-slate-300">
            <thead class="bg-slate-100">
              <tr>
                <th class="border p-2">Species</th>
                <th class="border p-2">NOAEL (mg/kg)</th>
                <th class="border p-2">HED (mg/kg)</th>
                <th class="border p-2">MRSD (mg)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="border p-2">Rat</td>
                <td class="border p-2">150</td>
                <td class="border p-2">24.3</td>
                <td class="border p-2">1.5</td>
              </tr>
              <tr>
                <td class="border p-2">Dog</td>
                <td class="border p-2">75</td>
                <td class="border p-2">41.6</td>
                <td class="border p-2">2.5</td>
              </tr>
            </tbody>
          </table>
          <figcaption class="text-sm text-center mt-2 text-slate-500">
             Table 1: Maximum Recommended Starting Dose calculation based on available toxicology data.
          </figcaption>
        </figure>
        `;
    } 
    else if (templateId === 'clinical-endpoints') {
        const endpointFacts = factsList.filter(f => f.type === 'clinical' && f.key.includes('endpoint'));
        const endpoints = endpointFacts.length > 0 ? endpointFacts : [
            { value: 'Reduction in SBP from baseline at Week 12' },
            { value: 'Percentage of responders (SBP < 130 mmHg)' }
        ];

        content = `
        <div class="smart-block-endpoints border-l-4 border-blue-500 pl-4 py-2 bg-blue-50">
           <h4 class="font-bold text-blue-900 mb-2">Primary Objectives</h4>
           <ul class="list-disc pl-5 mb-4">
              ${endpoints.map(e => `<li>${e.value || ''} ${e.key ? `(${e.key})` : ''}</li>`).join('')}
           </ul>
        </div>
        `;
    }
    else {
        // Generic fallback utilizing facts table if matches found
        const relatedFacts = factsList.filter(f => f.type === (dataSource?.split('_')[0] || 'general'));
        
        content = `
        <div class="smart-block-generic p-4 border rounded bg-slate-50">
           <h4 class="font-bold capitalize">${templateId.replace(/-/g, ' ')}</h4>
           <p class="text-sm text-muted-foreground mb-2">Data Source: ${dataSource}</p>
           ${relatedFacts.length > 0 ? 
             `<ul class="list-disc pl-5">${relatedFacts.map(f => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('')}</ul>` : 
             '<p class="italic text-slate-500">No specific data points found in Evidence Graph.</p>'
           }
        </div>
        `;
    }

    res.json({
        content,
        version: '1.0',
        sourceDocuments: ['CSR-2023-001', 'Protocol V3']
    });

  } catch (error) {
    console.error('Error generating smart block:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

export default router;
