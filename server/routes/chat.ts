/**
 * Chat API Routes - Lumen Cortex AI Chat Interface
 *
 * Provides Claude-like conversational AI for regulatory guidance.
 * Connects to OpenAI GPT-4 with context-aware regulatory knowledge.
 * Includes intelligent fallback for demo/development environments.
 *
 * @module server/routes/chat
 */

import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { pool } from '../db.js';

const router = Router();

// Initialize OpenAI client (may fail if key is invalid)
let openai: OpenAI | null = null;
try {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (e) {
  console.warn('[Lumen Cortex] OpenAI initialization failed, using demo mode');
}

const isDev = process.env.NODE_ENV !== 'production';

// DB-backed thread helpers
async function getOrCreateThread(threadId: string | null, userId?: number): Promise<string> {
  if (threadId) {
    const existing = await pool.query('SELECT id FROM chat_threads WHERE id = $1', [threadId]);
    if (existing.rows.length > 0) return threadId;
  }
  const newId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await pool.query(
    'INSERT INTO chat_threads (id, user_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    [newId, userId || null]
  );
  return newId;
}

async function getThreadMessages(
  threadId: string
): Promise<Array<{ role: string; content: string }>> {
  const result = await pool.query(
    'SELECT role, content FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
    [threadId]
  );
  return result.rows;
}

async function saveMessage(
  threadId: string,
  role: string,
  content: string,
  model?: string,
  tokens?: number
) {
  await pool.query(
    'INSERT INTO chat_messages (thread_id, role, content, model, tokens_used, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [threadId, role, content, model || null, tokens || 0]
  );
  await pool.query('UPDATE chat_threads SET updated_at = NOW() WHERE id = $1', [threadId]);
}

// System prompt for regulatory AI assistant
const REGULATORY_SYSTEM_PROMPT = `You are Lumen Cortex, an expert AI assistant for regulatory affairs in the life sciences industry. You specialize in:

- FDA 510(k) medical device submissions
- IND (Investigational New Drug) applications
- Clinical trial design and protocol optimization
- 21 CFR Part 11 compliance
- EU MDR (Medical Device Regulation)
- Clinical Evaluation Reports (CER)
- eCTD submissions
- CMC (Chemistry, Manufacturing, Controls)

You provide:
1. Clear, actionable regulatory guidance
2. Risk assessments and gap analyses
3. Document review and improvement suggestions
4. Submission strategy recommendations
5. Timeline and milestone planning

Always cite relevant FDA guidance documents, ISO standards, or regulations when applicable. Be precise, professional, and thorough in your responses. If you're unsure about something, say so and suggest where the user might find authoritative information.

Format your responses with clear structure using:
- Headers for main sections
- Bullet points for lists
- **Bold** for key terms
- Code blocks for regulatory references`;

/**
 * Intelligent demo response generator for when OpenAI is unavailable
 */
function generateDemoResponse(message: string): string {
  const lowerMessage = message.toLowerCase();

  // 510(k) related queries
  if (lowerMessage.includes('510(k)') || lowerMessage.includes('510k')) {
    return `## FDA 510(k) Premarket Notification Requirements

A 510(k) submission requires demonstrating **substantial equivalence** to a legally marketed predicate device. Here are the key requirements:

### Essential Components

1. **Device Description**
   - Intended use and indications for use
   - Technological characteristics
   - Operating principles and specifications

2. **Predicate Device Comparison**
   - Identify predicate device(s) with 510(k) number
   - Side-by-side comparison table
   - Technological and performance equivalence

3. **Performance Testing**
   - Bench testing data
   - Biocompatibility (if applicable per ISO 10993)
   - Electrical safety (IEC 60601-1 for powered devices)
   - Software documentation (IEC 62304 for devices with software)

4. **Labeling**
   - Package labeling
   - Instructions for Use (IFU)
   - User manual

### Regulatory References
- **21 CFR Part 807 Subpart E** - Premarket Notification Procedures
- **FDA Guidance**: "The 510(k) Program: Evaluating Substantial Equivalence"
- **FDA Guidance**: "Refuse to Accept Policy for 510(k)s"

### Timeline
Typical FDA review: **90-180 days** (Traditional 510(k))

Would you like me to elaborate on any specific aspect of the 510(k) process?`;
  }

  // IND related queries
  if (lowerMessage.includes('ind') || lowerMessage.includes('investigational new drug')) {
    return `## IND (Investigational New Drug) Application Overview

An IND application enables a sponsor to begin clinical trials in humans for a new drug. Here's the essential structure:

### IND Components (21 CFR 312.23)

1. **Form FDA 1571** - Cover sheet
2. **Table of Contents**
3. **Introductory Statement**
4. **General Investigational Plan**
5. **Investigator's Brochure (IB)**
6. **Protocols**
   - Phase 1, 2, or 3 protocol(s)
   - Informed consent forms
7. **Chemistry, Manufacturing, and Controls (CMC)**
   - Drug substance
   - Drug product
   - Placebo (if applicable)
8. **Pharmacology and Toxicology**
   - Nonclinical studies
   - ADME studies
9. **Previous Human Experience**
10. **Additional Information**

### Key Regulatory References
- **21 CFR Part 312** - Investigational New Drug Application
- **ICH M4** - Common Technical Document (CTD) format
- **ICH E6(R2)** - Good Clinical Practice

### Timeline
- FDA has **30 days** to review and place on hold if concerns exist
- No response = "safe to proceed"

Would you like details on any specific IND section?`;
  }

  // CER related queries
  if (lowerMessage.includes('cer') || lowerMessage.includes('clinical evaluation')) {
    return `## Clinical Evaluation Report (CER) Requirements

A CER demonstrates clinical safety and performance of medical devices under **EU MDR 2017/745** and **IVDR 2017/746**.

### CER Structure (MEDDEV 2.7/1 Rev 4)

1. **Scope**
   - Device description and specifications
   - Intended purpose and target population

2. **Clinical Background**
   - Current knowledge and standards
   - State of the art for indication

3. **Literature Search Protocol**
   - Databases searched (PubMed, Embase, Cochrane)
   - Search strings and date ranges
   - Selection criteria

4. **Clinical Data Analysis**
   - Appraisal methodology
   - Data extraction tables
   - Equivalence demonstration (if applicable)

5. **Clinical Evidence Summary**
   - Benefit-risk analysis
   - Gap analysis
   - Residual risks

6. **Conclusions**
   - Conformity with GSPRs
   - Post-market surveillance needs

### Key Standards
- **MEDDEV 2.7/1 Rev 4** - Clinical Evaluation Guidelines
- **EU MDR Annex XIV** - Clinical Evaluation Requirements
- **ISO 14155** - Clinical Investigation of Medical Devices

Would you like me to explain any section in more detail?`;
  }

  // Compliance queries
  if (
    lowerMessage.includes('compliance') ||
    lowerMessage.includes('21 cfr') ||
    lowerMessage.includes('part 11')
  ) {
    return `## 21 CFR Part 11 Compliance Requirements

Part 11 establishes requirements for electronic records and electronic signatures in FDA-regulated industries.

### Core Requirements

**1. Electronic Records**
- System validation
- Audit trails (date, time, operator ID)
- Record retention and retrieval
- Limited system access
- Operational checks

**2. Electronic Signatures**
- Unique user identification
- Signature manifestation (name, date/time, meaning)
- Signature linking to records
- Non-repudiation controls

**3. Closed vs Open Systems**
- **Closed**: Additional controls for access
- **Open**: Encryption and digital signatures required

### Key Controls
| Control | Requirement |
|---------|-------------|
| Access | Role-based permissions |
| Audit Trail | Immutable, timestamped |
| Passwords | Unique, periodically updated |
| Training | Documented training records |

### FDA Guidance
- **Scope and Application** (2003 Guidance)
- **Data Integrity and Compliance** (2018)

Would you like specific guidance on implementing any of these controls?`;
  }

  // Default comprehensive response
  return `## Lumen Cortex Regulatory Intelligence

Thank you for your query. I'm Lumen Cortex, your AI-powered regulatory affairs assistant. I can help with:

### My Capabilities

**🏥 Medical Devices**
- FDA 510(k) submissions
- De Novo classification requests
- PMA applications
- EU MDR compliance & CER preparation

**💊 Pharmaceuticals**
- IND applications
- NDA/ANDA submissions
- CMC documentation
- Clinical trial design

**📋 Compliance**
- 21 CFR Part 11 (electronic records)
- GxP requirements (GMP, GLP, GCP)
- ISO 13485 quality management
- Risk management (ISO 14971)

**📄 Documentation**
- eCTD structure and formatting
- Regulatory strategy development
- Gap analysis and remediation
- Submission timeline planning

### How I Can Help

1. **Ask specific questions** about regulatory requirements
2. **Request document reviews** for compliance gaps
3. **Get submission checklists** for your product type
4. **Explore predicate devices** for 510(k) submissions
5. **Understand timelines** for different submission pathways

What regulatory challenge can I help you with today?`;
}

/**
 * POST /api/chat/send-message
 * Main chat endpoint - handles user messages and returns AI responses
 */
router.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { message, thread_id, file_id, system_prompt } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required',
        code: 'INVALID_MESSAGE',
      });
    }

    // Get or create thread in DB
    const threadId = await getOrCreateThread(thread_id, (req as any).user?.id);
    const previousMessages = await getThreadMessages(threadId);

    let assistantMessage: string;
    let model = 'lumen-cortex-demo';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Try OpenAI first, fall back to intelligent demo responses
    if (openai) {
      try {
        const systemPrompt = system_prompt || REGULATORY_SYSTEM_PROMPT;

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...previousMessages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: message },
        ];

        console.log('[Lumen Cortex] Sending message to OpenAI...');

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          temperature: 0.7,
          max_tokens: 2000,
          presence_penalty: 0.1,
          frequency_penalty: 0.1,
        });

        assistantMessage =
          completion.choices[0]?.message?.content ||
          'I apologize, but I was unable to generate a response. Please try again.';
        model = completion.model;
        usage = completion.usage || usage;

        console.log('[Lumen Cortex] OpenAI response generated successfully');
      } catch (openAIError: any) {
        console.warn('[Lumen Cortex] OpenAI call failed, using demo mode:', openAIError.message);
        assistantMessage = generateDemoResponse(message);
        model = 'lumen-cortex-demo';
      }
    } else {
      console.log('[Lumen Cortex] Using demo mode (no OpenAI API key)');
      assistantMessage = generateDemoResponse(message);
    }

    // Save messages to database
    await saveMessage(threadId, 'user', message, model);
    await saveMessage(threadId, 'assistant', assistantMessage, model, usage.total_tokens);

    res.json({
      answer: assistantMessage,
      thread_id: threadId,
      usage,
      model,
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Chat error:', error);

    res.status(500).json({
      error: 'Failed to process message',
      code: 'CHAT_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/chat/upload
 * Handle file uploads — stores metadata in file_uploads table
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fileName = (req as any).file?.originalname || req.body?.fileName || 'uploaded_file';
    const mimeType =
      (req as any).file?.mimetype || req.body?.mimeType || 'application/octet-stream';
    const fileSize = (req as any).file?.size || req.body?.fileSize || 0;

    // Store in uploads directory
    const storagePath = `uploads/${fileId}`;

    // Save metadata to DB
    await pool.query(
      `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NOW())`,
      [fileId, (req as any).user?.id || null, fileName, mimeType, fileSize, storagePath]
    );

    res.json({
      fileId,
      message: 'File uploaded successfully',
      status: 'ready',
      fileName,
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      message: error.message,
    });
  }
});

/**
 * GET /api/chat/thread/:threadId
 * Retrieve conversation history from database
 */
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const threadResult = await pool.query('SELECT id, created_at FROM chat_threads WHERE id = $1', [
      threadId,
    ]);

    if (threadResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        code: 'THREAD_NOT_FOUND',
      });
    }

    const messages = await getThreadMessages(threadId);

    res.json({
      thread_id: threadId,
      messages,
      created_at: threadResult.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Thread retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve thread',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/chat/thread/:threadId
 * Delete a conversation thread from database
 */
router.delete('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const result = await pool.query('DELETE FROM chat_threads WHERE id = $1', [threadId]);
    const deleted = (result.rowCount || 0) > 0;

    res.json({
      success: deleted,
      message: deleted ? 'Thread deleted' : 'Thread not found',
    });
  } catch (error: any) {
    console.error('[Lumen Cortex] Thread deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete thread',
      message: error.message,
    });
  }
});

/**
 * GET /api/chat/health
 * Health check for chat service
 */
router.get('/health', async (req: Request, res: Response) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  let threadCount = 0;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM chat_threads');
    threadCount = result.rows[0]?.count || 0;
  } catch (e) {
    /* ignore */
  }

  res.json({
    status: hasApiKey ? 'healthy' : 'degraded',
    service: 'Lumen Cortex Chat',
    openai_configured: hasApiKey,
    active_threads: threadCount,
    persistence: 'postgresql',
    timestamp: new Date().toISOString(),
  });
});

export default router;
