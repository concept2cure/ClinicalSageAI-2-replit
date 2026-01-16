// import archiver from "archiver"; // Temporarily disabled for development
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { md5, buildIndexXml } from './indexXml';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

  // Attempt to generate eCTD ZIP using metadata-driven Python script (fallback to local packager later)
  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [seq.sub_id])).rows[0];
  const productId = sub?.product_id || sub?.title || null;
  if (!productId) throw new Error('No product_id associated with submission; cannot create eCTD package');

  const scriptPath = path.join(process.cwd(), 'scripts', 'create_ectd_xml.py');
  if (!fs.existsSync(scriptPath)) throw new Error('eCTD generator script not found');

  // Prepare temporary metadata override to ensure sequence number matches DB
  const tmpDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpMetaPath = path.join(tmpDir, `ectd_meta_${seq.seq_id}.yml`);

  try {
    // Load existing metadata if present
    let meta = {};
    const origMetaPath = path.join(process.cwd(), 'regulatory', 'CER', String(productId), 'ectd_metadata.yml');
    if (fs.existsSync(origMetaPath)) {
      const txt = fs.readFileSync(origMetaPath, 'utf-8');
      meta = require('js-yaml').safeLoad(txt) || {};
    }
    // Override sequence number and basic submission fields
    meta.seq = seq.seq_no;
    meta.title = meta.title || sub.title || String(productId);
    meta.applicant = meta.applicant || sub.product_id || 'Unknown';
    meta.country = meta.country || sub.region || 'US';
    meta.agency = meta.agency || sub.region || 'FDA';

    fs.writeFileSync(tmpMetaPath, require('js-yaml').safeDump(meta), 'utf-8');

    // Run the Python eCTD generator
    const { execFileSync } = require('child_process');
    const out = execFileSync('python3', [scriptPath, '--study', String(productId), '--meta', tmpMetaPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    // stdout may contain the created path
    // Determine expected zip path
    const zipPath = path.join(process.cwd(), 'regulatory', 'CER', String(productId), 'ectd_xml', `seq${String(seq.seq_no).padStart(4, '0')}.zip`);
    if (!fs.existsSync(zipPath)) throw new Error(`eCTD ZIP was not created at expected location: ${zipPath}`);
    return zipPath;
  } catch (err: any) {
    throw new Error(`Failed to create eCTD package: ${err.message}`);
  } finally {
    // cleanup temp meta
    try {
      if (fs.existsSync(tmpMetaPath)) fs.unlinkSync(tmpMetaPath);
    } catch (e) {}
  }

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
