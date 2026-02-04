import { q } from '../db';
/** Supported query kinds:
 *  - 'released_oos_30d': released last 30d with any open alerts (nodes: lot, edges to alerts & stability link)
 */
export async function kgQuery(kind: string) {
  switch (kind) {
    case 'released_oos_30d': {
      const rel = await q(
        `select batch_id, lot_no from qc_batches where status='RELEASED' and released_at >= now() - interval '30 day'`
      );
      const out: any = { nodes: [], edges: [] };
      for (const b of rel.rows) {
        const bid = b.batch_id;
        out.nodes.push({ id: bid, label: `LOT ${b.lot_no}`, type: 'BATCH' });
        const al = await q(
          `select alert_id, kind, message from qc_alerts where batch_id=$1 and status='OPEN'`,
          [bid]
        );
        for (const a of al.rows) {
          out.nodes.push({ id: a.alert_id, label: `${a.kind}: ${a.message}`, type: 'ALERT' });
          out.edges.push({ id: `${a.alert_id}->${bid}`, source: a.alert_id, target: bid });
        }
        const st = await q(`select stability_study_id from qc_linkages where batch_id=$1`, [bid]);
        if (st.rows[0]?.stability_study_id) {
          const sid = st.rows[0].stability_study_id;
          out.nodes.push({ id: sid, label: `STAB ${sid.slice(0, 8)}…`, type: 'STABILITY' });
          out.edges.push({ id: `${sid}->${bid}`, source: sid, target: bid });
        }
      }
      return out;
    }
    default:
      return { nodes: [], edges: [] };
  }
}
