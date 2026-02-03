import archiver from 'archiver';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { md5, buildIndexXml } from './indexXml';

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

/** Materialize file buffers for each sequence file (for now: leaf tokens -> text content). Real system could render DOCX/PDF. */
async function materializeContent(file: any): Promise<Buffer> {
  if (file.leaf_id) {
    const leaf = (await q<any>(`select * from reg_m3_leaves where leaf_id=$1`, [file.leaf_id]))
      .rows[0];
    // Convert tokens_json to minimal text, or embed a short header + placeholder link
    const md = `# ${file.title}\n\nGenerated from Authoring/Tokens.\n\n${JSON.stringify(leaf.tokens_json || {}, null, 2)}\n`;
    return Buffer.from(md, 'utf-8');
  }
  return Buffer.from(`# ${file.title}\n\n(No content)`, 'utf-8');
}

export async function packageSequenceZip(seqId: string, region: string) {
  const seq = (await q<any>(`select * from reg_sequences where seq_id=$1`, [seqId])).rows[0];
  const files = (await q<any>(`select * from reg_sequence_files where seq_id=$1`, [seqId])).rows;

  // Stage target path
  const outDir = path.join(process.cwd(), 'storage', 'sequences');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${String(seq.seq_no).padStart(4, '0')}.zip`);
  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  // Add index.xml last (after computing MD5 for each file)
  const updatedFiles: any[] = [];
  for (const f of files) {
    const buf = await materializeContent(f);
    const sum = md5(buf);
    updatedFiles.push({ ...f, checksum_md5: sum, size_bytes: buf.length });
    await q(`update reg_sequence_files set checksum_md5=$2, size_bytes=$3 where file_id=$1`, [
      f.file_id,
      sum,
      buf.length,
    ]);
    archive.append(buf, { name: f.path });
  }

  // index.xml
  const indexXml = await buildIndexXml(seqId, region);
  archive.append(Buffer.from(indexXml, 'utf-8'), { name: 'index.xml' });

  await archive.finalize();
  await new Promise(res => output.on('close', res));

  return outPath;
}
