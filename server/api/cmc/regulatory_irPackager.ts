import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { getPool } from '../../db';
import { isPathWithin } from '../../utils/document-file-roots';

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

/**
 * A submission id that is not safe to interpolate into a filename.
 *
 * Thrown rather than silently sanitised: a caller that hands this function a
 * path fragment has a bug, and quietly writing to a different file than it
 * asked for is worse than refusing.
 */
export class InvalidSubmissionIdError extends Error {
  constructor(subId: string) {
    super(`Invalid submission id: ${JSON.stringify(subId)}`);
    this.name = 'InvalidSubmissionIdError';
  }
}

/**
 * Submission ids are uuids or slug-shaped tokens in every lineage that defines
 * one (`sub_id uuid` in db/migrations/047_quality_step6.sql, TEXT elsewhere).
 * No separators, no dots — which is what makes `..` unrepresentable.
 */
const SAFE_SUB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function buildIRPackageZip(subId: string) {
  const outDir = path.join(process.cwd(), 'storage', 'ir-packs');

  // `subId` reaches this function straight from `req.params.id`
  // (server/api/cmc/regulatoryIR.ts, POST /submissions/:id/questions/pack) with
  // no validation, and it is interpolated into the FILENAME, where the leading
  // `ir_` looks like it absorbs a traversal. It does not:
  //
  //   path.join('/app/storage/ir-packs', 'ir_' + '/../../../../tmp/y' + '_...zip')
  //     → /tmp/y_1700000000000.zip
  //
  // A leading slash resets the join, so the prefix defends nothing. Express
  // decodes %2F inside a route param, so the whole traversal arrives in one
  // segment. createWriteStream then opens 'w' — truncating — in any directory
  // that already exists.
  //
  // Validated here rather than at the route because this function is what
  // builds the path; a check at one call site is a check the next call site
  // does not inherit.
  if (!SAFE_SUB_ID.test(subId)) throw new InvalidSubmissionIdError(subId);

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ir_${subId}_${Date.now()}.zip`);

  // Belt and braces: the regex above is the rule, this is the invariant. If the
  // rule is ever loosened, the containment check still holds the root.
  if (!isPathWithin(outDir, outPath)) throw new InvalidSubmissionIdError(subId);

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
