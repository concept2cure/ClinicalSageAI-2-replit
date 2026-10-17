/** Interpret SQL rows without pretending a query-only executor is a pg.Pool. */
import type { RequestSqlClient } from './requestDb';

export function queryRowsClient(client: RequestSqlClient) {
  return {
    async query<Row = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: Row[] }> {
      const result = await client.query(text, params);
      return { rows: result.rows as Row[] };
    },
  };
}
