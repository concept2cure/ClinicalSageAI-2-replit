import { Router, Request, Response } from 'express';
import { pool } from '../../db.js';
const r = Router();

/* SST templates */
r.get('/sst', async (req: Request, res: Response) => {
  if (!pool) return res.status(500).json({ error: 'Database connection not available' });
  const fam = req.query.family ? String(req.query.family) : null;
  const { rows } = fam
    ? await pool.query(`select * from qc_sst_templates where method_family=$1 order by name`, [fam])
    : await pool.query(`select * from qc_sst_templates order by method_family, name`);
  res.json(rows);
});
r.post('/sst', async (req: Request, res: Response) => {
  if (!pool) return res.status(500).json({ error: 'Database connection not available' });
  const b = req.body || {};
  const { rows } = await pool.query(
    `insert into qc_sst_templates (name, method_family, rules_json, valid_hours, notes, created_by)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      b.name,
      b.method_family,
      b.rules_json || {},
      b.valid_hours || 8,
      b.notes || null,
      (req.headers['x-user-name'] || 'user').toString(),
    ]
  );
  res.json(rows[0]);
});

/* Micro templates */
r.get('/micro', async (_req: Request, res: Response) => {
  if (!pool) return res.status(500).json({ error: 'Database connection not available' });
  const { rows } = await pool.query(
    `select * from qc_micro_templates order by dosage_form, region`
  );
  res.json(rows);
});

export default r;
