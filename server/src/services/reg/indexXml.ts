// import { create } from "xmlbuilder2"; // Temporarily disabled for development
import { Pool } from 'pg';
import crypto from 'crypto';
import { findPath } from './ectdMap';

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

export function md5(content: Buffer) {
  return crypto.createHash('md5').update(content).digest('hex');
}

export async function buildIndexXml(seqId: string, region: string) {
  // gather files selected for this sequence
  const seq = (await q<any>(`select * from reg_sequences where seq_id=$1`, [seqId])).rows[0];
  const files = (
    await q<any>(
      `select f.*, l.title as leaf_title from reg_sequence_files f left join reg_m3_leaves l on l.leaf_id=f.leaf_id where f.seq_id=$1`,
      [seqId]
    )
  ).rows;

  const root: any = {
    'ectd:sequence': {
      '@xmlns:ectd': 'urn:hl7-org:ectd',
      '@region': region || seq.region || 'FDA',
      '@number': String(seq.seq_no).padStart(4, '0'),
      'ectd:leaf-list': files.map((f: any) => ({
        'ectd:leaf': {
          '@operation': f.operation || 'new',
          '@title': f.title,
          '@href': f.path,
          'ectd:checksum': { '@type': 'md5', '#': f.checksum_md5 || '' },
        },
      })),
    },
  };

  // Temporarily disabled for development
  throw new Error('XML builder temporarily disabled for development');
  // return create(root).end({ prettyPrint:true, indent:'  ', newline:'\n' });
}

/** Stage sequence files from current leaves; compute path & checksums for authoring content (markdown to HTML/PDF later). */
export async function stageSequenceFiles(subId: string, seqId: string, region: string) {
  const leaves = (
    await q<any>(
      `select l.leaf_id, l.title, l.status, l.source_type, l.tokens_json, s.code
                                 from reg_m3_leaves l join reg_m3_sections s on s.sec_id=l.sec_id
                                 where s.sub_id=$1 and l.status in ('READY','LOCKED')`,
      [subId]
    )
  ).rows;

  // Create rows in reg_sequence_files – content is generated lazily on packaging
  for (const leaf of leaves) {
    const base = findPath(leaf.code, region);
    // Simple filename safe slug
    const fname =
      leaf.title
        .toLowerCase()
        .replace(/[^a-z0-9\-]+/g, '-')
        .replace(/^\-+|\-+$/g, '')
        .slice(0, 80) || 'leaf';
    const path = `${base}/${fname}.txt`; // for now we package markdown/plain; can map to .pdf/.docx later
    await q(
      `insert into reg_sequence_files (seq_id, leaf_id, sec_code, path, title, operation, source_type)
             values ($1,$2,$3,$4,$5,'new',$6)`,
      [seqId, leaf.leaf_id, leaf.code, path, leaf.title, leaf.source_type || 'AUTHORING']
    ).catch(() => {});
  }
}
