import logger from '../utils/logger';
import { generateId } from '../utils/generateId';

export class AssemblyLine {
  private db: any;

  constructor(db: any) {
    if (!db || typeof db.query !== 'function') {
      throw new Error('AssemblyLine requires a db object with a query() method');
    }
    this.db = db;
  }

  // STEP 1: AI creates document
  async start(userRequest: string) {
    logger.info('start() called');
    if (!userRequest || typeof userRequest !== 'string') {
      throw new Error('userRequest required');
    }

    const docId = generateId();

    // Save to database
    await this.db.query(
      'INSERT INTO assembly_docs (id, status, content) VALUES ($1, $2, $3)',
      [docId, 'draft', userRequest]
    );

    logger.info('document created', { docId });
    return { docId, message: 'Document started. Check database.' };
  }

  // STEP 2: Human saves edits
  async humanEdit(docId: string, newContent: string) {
    logger.info('humanEdit() called', { docId });
    if (!docId || !newContent) throw new Error('docId and newContent are required');

    await this.db.query(
      "UPDATE assembly_docs SET content = $1, status = 'human_edited' WHERE id = $2",
      [newContent, docId]
    );

    return { status: 'saved', next: 'Ask AI to polish by calling polish()' };
  }

  // STEP 3: AI polishes (atomic + AI provider)
  async polish(docId: string, humanInstruction: string) {
    logger.info('polish() called', { docId });
    if (!docId || !humanInstruction) throw new Error('docId and humanInstruction are required');

    const docRes = await this.db.query('SELECT * FROM assembly_docs WHERE id = $1', [docId]);
    if (!docRes || !docRes.rows || docRes.rows.length === 0) throw new Error('document not found');
    const currentContent = docRes.rows[0].content || '';

    let improvedContent: string | null = null;

    // Use AI gateway for text analysis (Claude primary, OpenAI fallback)
    try {
      const { getGateway } = await import('../services/ai-gateway/index.js');
      const gateway = getGateway();
      const result = await gateway.chat(
        'You are a regulatory document editor. Apply the instruction to improve the document text. Return only the improved text, nothing else.',
        `Document:\n${currentContent}\n\nInstruction: ${humanInstruction}`,
        { maxTokens: 4000 }
      );
      if (result && typeof result.content === 'string' && result.content) {
        improvedContent = result.content;
        logger.info('AI polish succeeded', { docId });
      }
    } catch (err: any) {
      logger.error('AI polish failed, falling back to append', { docId, err: err?.message || err });
    }

    // Fallback behavior: append instruction note
    if (!improvedContent) {
      improvedContent = currentContent + '\n\n[AI added: ' + humanInstruction + ']';
    }

    // Persist atomically
    const updateSql = `UPDATE assembly_docs SET content = $1, status = 'ai_polished' WHERE id = $2 RETURNING id`;
    await this.db.query(updateSql, [improvedContent, docId]);

    // Record audit log
    try {
      const auditId = generateId();
      const provider = process.env.OPENAI_API_KEY ? 'openai' : 'fallback';
      const model = process.env.OPENAI_API_KEY ? 'gpt-4o' : null;
      await this.db.query(
        `INSERT INTO assembly_audit_logs (id, doc_id, provider, model, request_text, response_text) VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditId, docId, provider, model, currentContent, improvedContent]
      );
      logger.info('audit log recorded', { auditId, docId, provider });
    } catch (e: any) {
      logger.error('failed to write audit log', { error: e?.message || e });
    }

    return { status: 'polished', content: improvedContent };
  }
}
