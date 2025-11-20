import { transaction } from '../db';
import { setTenantId } from './tenantRls';

/**
 * Execute a transaction with automatic tenant context
 * This ensures all database operations within the transaction
 * are properly isolated to the current tenant
 */
export async function tenantTransaction<T>(
  tenantId: number,
  callback: (client: any) => Promise<T>
): Promise<T> {
  return transaction(async client => {
    // Set the tenant context for this transaction
    await setTenantId(tenantId);

    // Execute the callback
    return callback(client);
  });
}
