import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { getPool } from '../../db';

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

export async function buildIRPackageZip(subId: string) {
  const outDir = path.join(process.cwd(), 'storage', 'ir-packs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ir_${subId}_${Date.now()}.zip`);

  const ws = fs.createWriteStream(outPath);
  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.pipe(ws);

  try {
    const rows = (
      await q(
        `select q_id, sec_code, final_md, ai_draft_md, title, question_text
       from reg_questions 
       where sub_id = $1 and status in ('OPEN','DRAFTED','IN_REVIEW') 
       order by due_date nulls last`,
        [subId]
      )
    ).rows;

    if (rows.length === 0) {
      // Add an empty file if no questions found
      zip.append(Buffer.from('No questions found for this submission.', 'utf-8'), {
        name: 'README.txt',
      });
    } else {
      for (const r of rows) {
        const folder = `Q_${String(r.q_id).slice(0, 8)}`;
        const md = r.final_md || r.ai_draft_md || `# Response\n\n(TBD)`;
        zip.append(Buffer.from(md, 'utf-8'), { name: `${folder}/response.md` });

        // Also add question details
        const questionInfo = `# Question Details

**ID**: ${r.q_id}
**Section**: ${r.sec_code || 'N/A'}
**Title**: ${r.title || 'Untitled'}

## Original Question
${r.question_text || 'No question text provided'}
`;
        zip.append(Buffer.from(questionInfo, 'utf-8'), { name: `${folder}/question.md` });
      }
    }

    await zip.finalize();
    await new Promise(resolve => ws.on('close', resolve));
    return outPath;
  } catch (error) {
    // Clean up on error
    try {
      fs.unlinkSync(outPath);
    } catch {}
    throw error;
  }
}
