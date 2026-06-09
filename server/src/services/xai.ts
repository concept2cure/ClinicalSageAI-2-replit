import { query as q } from '../../db';

/** Log explainable AI decisions for audit trail */
export async function logDecision(
  batchId: string,
  kind: string,
  inputJson: any,
  outputJson: any,
  explain: string
) {
  try {
    await q(
      `
      INSERT INTO qc_decision_logs (batch_id, kind, input_json, output_json, explain, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
      [batchId, kind, JSON.stringify(inputJson), JSON.stringify(outputJson), explain]
    );
  } catch (error) {
    console.error('Failed to log decision:', error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}
