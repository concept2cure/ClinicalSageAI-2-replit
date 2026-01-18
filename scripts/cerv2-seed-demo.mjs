#!/usr/bin/env node
/**
 * Seeds a minimal CERV2 “program” and related records (claim/evidence/link) if tables exist.
 * Prints: CERV2_PROGRAM_ID=<id>
 *
 * Uses DATABASE_URL_ADMIN if set; else DATABASE_URL.
 */
import pg from "pg";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const { Client } = pg;

const DB_URL =
  process.env.NEON_DATABASE_URL_ADMIN ||
  process.env.DATABASE_URL_ADMIN ||
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("FAIL: NEON_DATABASE_URL_ADMIN/DATABASE_URL_ADMIN or NEON_DATABASE_URL/DATABASE_URL must be set.");
  process.exit(2);
}

function uuid() {
  return crypto.randomUUID();
}

async function getTables(client) {
  const q = `
    select table_name
    from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
  `;
  const r = await client.query(q);
  return r.rows.map(x => x.table_name);
}

async function getColumns(client, table) {
  const q = `
    select column_name, is_nullable, data_type, column_default
    from information_schema.columns
    where table_schema='public' and table_name=$1
    order by ordinal_position
  `;
  const r = await client.query(q, [table]);
  return r.rows;
}

function guessValue(colName, dataType) {
  const name = colName.toLowerCase();
  if (dataType.includes("uuid")) return uuid();
  if (dataType.includes("json")) return {};
  if (dataType.includes("timestamp")) return new Date().toISOString();
  if (dataType.includes("date")) return new Date().toISOString().slice(0, 10);
  if (dataType.includes("boolean")) return false;
  if (dataType.includes("int") || dataType.includes("numeric") || dataType.includes("double")) return 0;
  if (name.includes("status")) return "draft";
  if (name.includes("title") || name.includes("name")) return "Demo Program";
  if (name.includes("email")) return "demo@lumen.local";
  if (name.includes("url")) return "https://example.com";
  if (name.includes("type")) return "demo";
  return "demo";
}

async function insertRow(client, table, overrides = {}) {
  const cols = await getColumns(client, table);

  const insertCols = [];
  const insertVals = [];
  const params = [];

  for (const c of cols) {
    const col = c.column_name;
    const nullable = c.is_nullable === "YES";
    const hasDefault = !!c.column_default;

    if (hasDefault && /nextval\(/i.test(c.column_default)) continue;

    if (Object.prototype.hasOwnProperty.call(overrides, col)) {
      insertCols.push(col);
      params.push(overrides[col]);
      insertVals.push(`$${params.length}`);
      continue;
    }

    if (hasDefault || nullable) continue;

    insertCols.push(col);
    params.push(guessValue(col, c.data_type));
    insertVals.push(`$${params.length}`);
  }

  if (insertCols.length === 0) {
    const r = await client.query(`insert into "${table}" default values returning *`);
    return r.rows[0];
  }

  const sql = `insert into "${table}" (${insertCols.map(c => `"${c}"`).join(", ")})
               values (${insertVals.join(", ")})
               returning *`;
  const r = await client.query(sql, params);
  return r.rows[0];
}

function pickTable(tables, patterns) {
  for (const p of patterns) {
    const hit = tables.find(t => p.test(t));
    if (hit) return hit;
  }
  return null;
}

async function insertProgramRow(client, table) {
  const cols = await getColumns(client, table);
  const colNames = new Set(cols.map((c) => c.column_name));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const requestedProgramId = uuid();
    const overrides = {
      id: requestedProgramId,
      program_id: requestedProgramId,
      workspace_id: requestedProgramId,
      title: "CERV2 Demo Program",
      name: "CERV2 Demo Program",
      status: "active",
    };

    if (colNames.has("organization_id")) {
      overrides.organization_id = 1;
    }
    if (colNames.has("slug")) {
      overrides.slug = `cerv2-demo-${suffix}`;
    }

    try {
      const program = await insertRow(client, table, overrides);
      const resolvedProgramId =
        program?.program_id ||
        program?.programId ||
        program?.workspace_id ||
        program?.id ||
        requestedProgramId;

      return { program, resolvedProgramId };
    } catch (error) {
      if (error?.code === "23505") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to insert demo program after retries.");
}

(async () => {
  const client = new Client({ connectionString: DB_URL });

  try {
    await client.connect();
  } catch (e) {
    console.error("FAIL: DB connect failed:", e?.message || e);
    process.exit(3);
  }

  const tables = await getTables(client);

  const programTable = pickTable(tables, [
    /cerv2.*program/i,
    /cerv2.*workspace/i,
    /cerv2.*project/i,
    /^programs$/i,
    /workspaces/i,
  ]);

  if (!programTable) {
    console.error("FAIL: Could not find a program/workspace table. Existing tables:", tables.slice(0, 50));
    await client.end();
    process.exit(4);
  }

  const { program, resolvedProgramId } = await insertProgramRow(client, programTable);

  const claimTable = pickTable(tables, [/cerv2.*claim/i, /^claims$/i]);
  const evidenceTable = pickTable(tables, [/cerv2.*evidence/i, /^evidence$/i]);
  const linkTable = pickTable(tables, [/cerv2.*link/i, /traceability.*link/i, /evidence.*link/i]);

  let claim, evidence, link;
  if (claimTable) {
    claim = await insertRow(client, claimTable, {
      id: uuid(),
      program_id: resolvedProgramId,
      programId: resolvedProgramId,
      title: "Demo Claim",
      name: "Demo Claim",
      status: "needs-review",
    });
  }

  if (evidenceTable) {
    evidence = await insertRow(client, evidenceTable, {
      id: uuid(),
      program_id: resolvedProgramId,
      programId: resolvedProgramId,
      filename: "demo-evidence.pdf",
      title: "Demo Evidence",
      sha256: crypto.createHash("sha256").update("demo").digest("hex"),
      size_bytes: 123,
      sizeBytes: 123,
      status: "active",
    });
  }

  if (linkTable && claim && evidence) {
    link = await insertRow(client, linkTable, {
      id: uuid(),
      program_id: resolvedProgramId,
      programId: resolvedProgramId,
      claim_id: claim.id,
      claimId: claim.id,
      evidence_id: evidence.id,
      evidenceId: evidence.id,
      status: "linked",
    });
  }

  await client.end();

  console.log("PASS: Seeded demo CERV2 program.");
  console.log(`CERV2_PROGRAM_ID=${resolvedProgramId}`);
  console.log("Details:", {
    programTable,
    claimTable,
    evidenceTable,
    linkTable,
    program: program ? (program.id || program.program_id || program.workspace_id) : null,
    claim: claim?.id || null,
    evidence: evidence?.id || null,
    link: link?.id || null,
  });

  process.exit(0);
})();
