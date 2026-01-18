import crypto from 'crypto';

export const computeMerkleRoot = (hashes: string[]): string | null => {
  if (!hashes.length) return null;
  let level = hashes.slice().sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || level[i];
      const combined = `${left}${right}`;
      next.push(crypto.createHash('sha256').update(combined).digest('hex'));
    }
    level = next;
  }
  return level[0];
};

export const verifyIntegrity = (hashes: string[], merkleRoot: string | null) => {
  const computed = computeMerkleRoot(hashes);
  return {
    computed,
    expected: merkleRoot,
    match: Boolean(computed && merkleRoot && computed === merkleRoot),
  };
};
