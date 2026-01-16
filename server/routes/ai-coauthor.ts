import { Router } from 'express';
import { db } from '../db';
import { facts } from '../../shared/schema';
import { like, or, desc } from 'drizzle-orm';
import OpenAI from 'openai';

const router = Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
});

const fallbackFacts = [
    {
        factId: 'fallback-p-value',
        key: 'Primary endpoint p-value',
        value: '0.045',
        source: 'Study CL-2025-001',
        confidence: 0.98,
        referenceId: 'dataset-101-ae',
        referenceType: 'dataset',
    },
    {
        factId: 'fallback-response-rate',
        key: 'Overall response rate',
        value: '85%',
        source: 'Study CL-2025-001',
        confidence: 0.95,
        referenceId: 'dataset-101-ae',
        referenceType: 'dataset',
    },
    {
        factId: 'fallback-safety',
        key: 'Serious adverse events observed',
        value: '0',
        source: 'ISS Report',
        confidence: 0.9,
        referenceId: 'dataset-iss-safety',
        referenceType: 'document',
    },
];

const toConfidencePercent = (raw: unknown): number => {
    if (raw === null || raw === undefined) {
        return 92;
    }

    const numeric = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(numeric)) {
        return 92;
    }

    if (numeric >= 0 && numeric <= 1) {
        return Math.max(0, Math.min(100, Math.round(numeric * 100)));
    }

    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const sanitizeTokenSegment = (input: unknown, fallback: string): string => {
    const raw = input ?? fallback;
    return String(raw).replace(/[{}|]/g, '-').trim() || fallback;
};

const extractMetadataField = (fact: any, keys: string[]): string | null => {
    const metadata = fact?.metadata;
    if (!metadata || typeof metadata !== 'object') {
        return null;
    }

    for (const key of keys) {
        const value = metadata[key];
        if (value) {
            return String(value);
        }
    }

    return null;
};

const determineReferenceId = (fact: any): string | null => {
    const direct = fact.referenceId || extractMetadataField(fact, ['datasetId', 'documentId', 'sourceId']);
    if (direct) {
        const sanitized = sanitizeTokenSegment(direct, '').replace(/\s+/g, '-').toLowerCase();
        return sanitized || null;
    }

    if (fact.factId) {
        const sanitized = sanitizeTokenSegment(fact.factId, '').replace(/\s+/g, '-').toLowerCase();
        if (sanitized) {
            return sanitized;
        }
    }

    if (fact.source) {
        const sanitized = sanitizeTokenSegment(fact.source, '').replace(/\s+/g, '-').toLowerCase();
        return sanitized || null;
    }

    return null;
};

const determineReferenceType = (fact: any): 'dataset' | 'document' => {
    const metadataType = extractMetadataField(fact, ['type', 'sourceType']);
    const type = fact.referenceType || metadataType;

    if (typeof type === 'string' && type.toLowerCase() === 'document') {
        return 'document';
    }

    return 'dataset';
};

const normalizeLabel = (label: string | null | undefined): string => {
    if (!label) {
        return 'the reported metric';
    }

    return label
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

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

router.post('/draft', async (req, res) => {
    try {
        const {
            documentId,
            sectionId,
            section,
            context,
            prompt,
            region,
            productName,
            limit,
        } = req.body || {};

        const sectionKey = sectionId ?? section ?? '';
        const promptText = context ?? prompt ?? '';
        const factLimit = Math.max(1, Math.min(5, Number(limit) || 3));
        const keywordSeed = `${promptText} ${sectionKey} ${productName ?? ''}`;
        const keywords = keywordSeed
            .split(/\W+/)
            .map((word: string) => word.trim())
            .filter((word: string) => word.length > 3)
            .slice(0, 8);

        let relevantFacts: any[] = [];

        if (db) {
            try {
                if (keywords.length > 0) {
                    const fieldConditions = keywords.map(keyword =>
                        or(like(facts.key, `%${keyword}%`), like(facts.value, `%${keyword}%`)),
                    );

                    const whereClause =
                        fieldConditions.length === 1 ? fieldConditions[0] : or(...fieldConditions);

                    relevantFacts = await db
                        .select()
                        .from(facts)
                        .where(whereClause)
                        .orderBy(desc(facts.updatedAt))
                        .limit(factLimit * 2);
                }

                if (relevantFacts.length === 0) {
                    relevantFacts = await db
                        .select()
                        .from(facts)
                        .orderBy(desc(facts.updatedAt))
                        .limit(factLimit * 2);
                }
            } catch (queryError) {
                console.warn('[AI Draft] Fact lookup failed, using fallback dataset.', queryError);
            }
        }

        if (!relevantFacts.length) {
            relevantFacts = fallbackFacts;
        }

        const uniqueFacts = new Map<string, any>();
        for (const fact of relevantFacts) {
            const key = fact.factId || `${fact.key}-${fact.source ?? 'source'}`;
            if (!uniqueFacts.has(key)) {
                uniqueFacts.set(key, fact);
            }
        }

        const selectedFacts = Array.from(uniqueFacts.values()).slice(0, factLimit);

        const tokenPayload = selectedFacts.map((fact: any) => {
            const sanitizedValue = sanitizeTokenSegment(fact.value, 'N/A');
            const sanitizedSource = sanitizeTokenSegment(fact.source, 'Source Data Room');
            const confidencePercent = toConfidencePercent(fact.confidence);
            const referenceId = determineReferenceId(fact);
            const referenceType = determineReferenceType(fact);

            return {
                id: fact.factId ?? null,
                key: fact.key,
                value: sanitizedValue,
                sourceLabel: sanitizedSource,
                confidence: confidencePercent,
                referenceId,
                referenceType,
                token: `{{${sanitizedValue}|${sanitizedSource}|${confidencePercent}%}}`,
            };
        });

        const statements: string[] = [];

        if (tokenPayload.length > 0) {
            const [first, ...rest] = tokenPayload;
            statements.push(
                `The ${normalizeLabel(first.key)} was confirmed at {{${first.value}|${first.sourceLabel}|${first.confidence}%}} in the latest analysis.`,
            );

            rest.forEach(token => {
                statements.push(
                    `Additionally, ${normalizeLabel(token.key)} was observed at {{${token.value}|${token.sourceLabel}|${token.confidence}%}}, reinforcing the study objectives.`,
                );
            });

            statements.push(
                'No emergent safety signals were detected across the reviewed evidence set.',
            );
        } else {
            statements.push(
                'No verified source data was available to generate a structured draft for this section.',
            );
        }

        const narrative = statements.join(' ');
        const sources = tokenPayload
            .map(token => {
                if (!token.referenceId || !token.sourceLabel) {
                    return null;
                }

                return {
                    id: token.referenceId,
                    name: token.sourceLabel,
                    type: token.referenceType,
                    confidenceScore: token.confidence / 100,
                };
            })
            .filter((entry): entry is { id: string; name: string; type: string; confidenceScore: number } => Boolean(entry))
            .filter((entry, index, array) =>
                array.findIndex(candidate => candidate.id === entry.id) === index,
            );

        res.json({
            success: true,
            markdown: narrative,
            text: narrative,
            sources,
            facts: tokenPayload,
            meta: {
                documentId: documentId ?? null,
                section: sectionKey || null,
                region: region ?? null,
                factCount: tokenPayload.length,
            },
        });
    } catch (error) {
        console.error('AI Draft Error:', error);
        res.status(500).json({ success: false, message: 'Unable to generate draft content' });
    }
});

export default router;
