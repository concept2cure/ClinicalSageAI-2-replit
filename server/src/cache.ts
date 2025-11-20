// Temporary cache bypass to fix Process tab loading
const cache = new Map();

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // Bypass cache for now to ensure Process tab loads
  return await fetcher();
}

export function invalidate(prefix: string) {
  // No-op for now
}
