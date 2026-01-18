import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ROOT = path.join(process.cwd(), 'uploads', 'cerv2');

export type StoredEvidence = {
  filePath: string;
  sizeBytes: number;
};

export type EvidencePutArgs = {
  orgId: number;
  programId: string;
  evidenceId: string;
  fileName: string;
  buffer: Buffer;
};

export function getEvidenceRoot() {
  return process.env.CERV2_EVIDENCE_ROOT || DEFAULT_ROOT;
}

export async function ensureEvidenceDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export async function putEvidenceFile(args: EvidencePutArgs): Promise<StoredEvidence> {
  const root = getEvidenceRoot();
  const safeName = sanitizeFileName(args.fileName);
  const relativePath = path.join(String(args.orgId), String(args.programId), `${args.evidenceId}_${safeName}`);
  const absolutePath = path.join(root, relativePath);

  await ensureEvidenceDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, args.buffer);

  return {
    filePath: relativePath,
    sizeBytes: args.buffer.byteLength,
  };
}

export async function getEvidenceFilePath(filePath: string): Promise<string> {
  const root = getEvidenceRoot();
  return path.join(root, filePath);
}

export async function deleteEvidenceFile(filePath: string) {
  const absolutePath = await getEvidenceFilePath(filePath);
  await fs.rm(absolutePath, { force: true });
}
