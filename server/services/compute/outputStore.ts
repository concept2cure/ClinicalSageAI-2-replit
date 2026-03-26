import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'storage/artifact-compute');

export interface StoredOutput {
  storageUri: string;
  sha256: string;
  byteSize: number;
}

export async function persistOutput(orgId: number, jobId: string, fileName: string, data: Buffer): Promise<StoredOutput> {
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dir = path.join(OUTPUT_ROOT, `org-${orgId}`, jobId);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, safeFile);
  await fs.writeFile(fullPath, data);

  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  return {
    storageUri: `file://${fullPath}`,
    sha256,
    byteSize: data.byteLength,
  };
}
