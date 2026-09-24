/**
 * Does the vault store answer? Read by /readyz (server/startup/inline-endpoints.ts).
 *
 * Every upload writes its bytes before a row is recorded, and refuses when it
 * cannot. A store this process cannot reach (a task role without the bucket,
 * an unwritable storage/ volume) therefore means a process that refuses every
 * document while reporting ready. Down on false, on a throw, on a provider
 * that cannot be selected, and on no answer within the timeout. The detail
 * names the provider only: /readyz answers before authentication, so it
 * never carries a bucket name.
 *
 * @module server/services/storage/store-readiness
 */
import { getStorageProvider } from './index';

export const STORAGE_PROBE_TIMEOUT_MS = 3_000;

export async function probeVaultStore(
  timeoutMs: number = STORAGE_PROBE_TIMEOUT_MS,
): Promise<{ status: 'ok' | 'down'; detail?: string }> {
  let store: ReturnType<typeof getStorageProvider>;
  try {
    store = getStorageProvider();
  } catch {
    return { status: 'down', detail: 'no vault store could be selected (see STORAGE_PROVIDER)' };
  }
  let timer: NodeJS.Timeout | undefined;
  const answered = await Promise.race([
    store.isAvailable().catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  return answered ? { status: 'ok' } : { status: 'down', detail: `the vault store (${store.name}) did not answer` };
}
