import { Router } from 'express';
import { db } from '../db';
import { facts } from '../../shared/schema';
import { eq, like, or, desc } from 'drizzle-orm';
import OpenAI from 'openai';

const router = Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
});

router.post('/chat', async (req, res) => {
  try {
    const { messages, context } = req.body;
    const lastMessage = messages[messages.length - 1].content;

    console.log(`[AI CoAuthor] Processing: "${lastMessage}"`);

    // 1. RAG-lite: Fetch relevant facts from Data Lineage
    // distinct keywords to search
    const keywords = lastMessage.split(' ').filter((w: string) => w.length > 4);
    
    let relevantFacts: any[] = [];
    
    if (db) {
        // Build a dynamic query for facts
        // This is a simple implementation. A real one would use vector search.
        const conditions = keywords.map((k: string) => like(facts.key, `%${k}%`));
        if (conditions.length > 0) {
            relevantFacts = await db.select()
                .from(facts)
                .where(or(...conditions))
                .limit(10);
        }
        
        // Always grab some general facts if specific ones aren't found
        if (relevantFacts.length === 0) {
             relevantFacts = await db.select().from(facts).limit(5);
        }
    } else {
        // Fallback for demo if DB is offline
        relevantFacts = [
            { key: 'NOAEL (Rat)', value: '150 mg/kg', source: 'Study 101' },
            { key: 'Primary Endpoint', value: 'Reduction in SBP', source: 'Protocol V2' }
        ];
    }
    
    // 2. Construct System Prompt with Data Lineage
    const factsContext = relevantFacts.map(f => `- ${f.key}: ${f.value} (Source: ${f.source})`).join('\n');
    
    const systemPrompt = `
You are an expert Regulatory Affairs writer and "Co-Author" for eCTD submissions.
Your goal is to assist the user in drafting, reviewing, and refining regulatory content.
We strive to be equivalent to or better than tools like Weave.bio by strictly adhering to Data Lineage.

CRITICAL INSTRUCTION:
You have access to the following VERIFIED FACTS from the Source Data (Data Room). 
You must prioritize these facts over general knowledge. If you use a fact, cite the source in brackets, e.g. [Source: Protocol V2].

VERIFIED FACTS DATABASE:
${factsContext}

CURRENT DOCUMENT CONTEXT:
${context ? context.substring(0, 2000) : 'No context provided.'}

If the user asks to draft a section, use the facts above to populate it.
If the facts are missing, state clearly that you need the source data.
    `;

    // 3. Call OpenAI (or mock if no key)
    let aiResponseContent = "";
    
    if (process.env.OPENAI_API_KEY) {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            temperature: 0.3, // Low validation for regulatory
        });
        aiResponseContent = completion.choices[0].message.content || "No response generated.";
    } else {
        // Quality Mock Response for Demo/Test Environment
        aiResponseContent = `**[AI Co-Author Mode]**\n\nI can help you with that. Based on the **Data Lineage** available in the system, here is a draft incorporating the verified values:\n\n> The primary endpoint (${relevantFacts[0]?.key || 'Endpoint'}) was determined to be **${relevantFacts[0]?.value || 'N/A'}** consistent with the requirements set forth in ${relevantFacts[0]?.source || 'Source Document'}.\n\nIs this consistent with your understanding of the source data?`;
    }

    res.json({
        success: true,
        message: aiResponseContent,
        usedFacts: relevantFacts
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ success: false, message: "Internal Co-Author Error" });
  }
});

export default router;
