import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function upsertSST() {
  const file = path.join(__dirname, '..', 'data', 'qc_sst_templates.json');
  const arr = JSON.parse(fs.readFileSync(file, 'utf-8'));
  for (const t of arr) {
    await pool.query(
      `insert into qc_sst_templates (name, method_family, rules_json, valid_hours, notes, created_by)
       values ($1,$2,$3,$4,$5,$6)
       on conflict do nothing`,
      [t.name, t.method_family, t.rules_json, t.valid_hours || 8, t.notes || null, 'seed']
    );
  }
}
async function upsertMicro() {
  const file = path.join(__dirname, '..', 'data', 'qc_micro_limits.json');
  const arr = JSON.parse(fs.readFileSync(file, 'utf-8'));
  for (const t of arr) {
    await pool.query(
      `insert into qc_micro_templates (dosage_form, region, limits_json, notes)
       values ($1,$2,$3,$4)
       on conflict do nothing`,
      [t.dosage_form, t.region, t.limits_json, t.notes || null]
    );
  }
}
await upsertSST();
await upsertMicro();
await pool.end();
console.log('Seeded SST + Micro templates.');
