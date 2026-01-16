import OpenAI from 'openai';
import { getPool } from '../../db/pool';

const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

const ON = !!process.env.OPENAI_API_KEY;

async function buildContext(subId: string, sec_code: string | null) {
  const ctx: any = { section: null, specs: [], stability: null, methods: [] };
  try {
    // Try to get section information from M3 sections
    const secQuery = await q(
      `select s.*, sub.product_id
       from reg_m3_sections s 
       join reg_submissions sub on sub.sub_id = s.sub_id
       where s.sub_id = $1 and ($2 is null or s.code like $2 || '%') 
       limit 1`,
      [subId, sec_code || null]
    );
    ctx.section = secQuery.rows[0] || null;

    // Try to get product specifications
    if (ctx.section?.product_id) {
      const specsQuery = await q(
        `select attribute, unit, limit_low, limit_high, method_id, method_status
         from dp_specs 
         where product_id = $1 
         limit 50`,
        [ctx.section.product_id]
      );
      ctx.specs = specsQuery.rows || [];

      // Try to get stability data
      const stabilityQuery = await q(
        `select up_stability 
         from reg_m3_sections 
         where sub_id = $1 and code like '3.2.P.8%' 
         limit 1`,
        [subId]
      );
      ctx.stability = stabilityQuery.rows[0]?.up_stability || null;

      // Try to get analytical methods
      const methodsQuery = await q(
        `select method_id, name, status 
         from qa_methods 
         where product_id = $1 
         limit 50`,
        [ctx.section.product_id]
      );
      ctx.methods = methodsQuery.rows || [];
    }
  } catch (error) {
    console.warn('Error building context for AI draft:', error);
  }
  return ctx;
}

export async function aiDraftIR(subId: string, qrow: any) {
  const ctx = await buildContext(subId, qrow.sec_code || null);

  if (!ON) {
    return `**Draft Response (skeleton)**

**Question**: ${qrow.question_text || qrow.title || '(n/a)'}
**Response**: Provide rationale, method references, and stability coverage here.
**Evidence**: Link to 3.2.P.5 methods and 3.2.P.8 stability where relevant.`;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const out = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior CMC regulatory writer. Draft concise, technical IR responses. Use markdown. Reference sections plainly (e.g., 3.2.P.5). Avoid promises.',
        },
        {
          role: 'user',
          content: `Submission: ${subId}\nSection: ${qrow.sec_code || 'n/s'}\nQuestion:\n${(qrow.question_text || '').slice(0, 6000)}\n\nContext:\n${JSON.stringify(ctx).slice(0, 12000)}`,
        },
      ],
    });
    return out.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error generating AI draft:', error);
    return `**Draft Response (AI Error)**

**Question**: ${qrow.question_text || qrow.title || '(n/a)'}
**Response**: AI drafting encountered an error. Please provide manual response.
**Evidence**: Review relevant sections and provide supporting documentation.`;
  }
}
