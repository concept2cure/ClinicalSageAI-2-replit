#!/usr/bin/env node
/**
 * Validates Neon wiring:
 * - DATABASE_URL should be pooled (runtime)
 * - DATABASE_URL_ADMIN should be direct (migrations)
 *
 * Exits nonzero if connections fail or URLs look wrong.
 */
import pg from "pg";
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

function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "<invalid url>";
  }
}

function looksPooled(host) {
  return /pooler/i.test(host || "");
}

async function probe(name, url) {
  const client = new Client({ connectionString: url });
  await client.connect();

  const r1 = await client.query("select current_database() as db, current_user as usr");
  const r2 = await client.query("select inet_server_addr()::text as addr, inet_server_port() as port");
  const r3 = await client.query("select current_setting('server_version') as server_version");

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();

  await client.end();

  return {
    name,
    host,
    pooledGuess: looksPooled(host),
    db: r1.rows[0]?.db,
    usr: r1.rows[0]?.usr,
    addr: r2.rows[0]?.addr,
    port: r2.rows[0]?.port,
    server_version: r3.rows[0]?.server_version,
  };
}

(async () => {
  const pooled = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const direct = process.env.NEON_DATABASE_URL_ADMIN || process.env.DATABASE_URL_ADMIN;

  if (!pooled) {
    console.error("FAIL: NEON_DATABASE_URL/DATABASE_URL is not set (expected pooled runtime URL).");
    process.exit(2);
  }
  if (!direct) {
    console.error("FAIL: NEON_DATABASE_URL_ADMIN/DATABASE_URL_ADMIN is not set (expected direct/admin URL for migrations).");
    process.exit(2);
  }

  console.log("== Neon URL sanity ==");
  console.log("DATABASE_URL       =", redact(pooled));
  console.log("DATABASE_URL_ADMIN =", redact(direct));
  console.log("");

  let pooledInfo, directInfo;
  try {
    pooledInfo = await probe("DATABASE_URL", pooled);
    directInfo = await probe("DATABASE_URL_ADMIN", direct);
  } catch (e) {
    console.error("FAIL: Could not connect to Neon:", e?.message || e);
    process.exit(3);
  }

  console.log("== Probe results ==");
  console.table([pooledInfo, directInfo]);

  const sameHost = pooledInfo.host && pooledInfo.host === directInfo.host;
  if (sameHost) {
    console.error("FAIL: DATABASE_URL and DATABASE_URL_ADMIN point to the SAME host. Use pooled + direct endpoints.");
    process.exit(4);
  }

  if (!pooledInfo.pooledGuess) {
    console.warn("WARN: DATABASE_URL host does not look like a pooler host. If this is intentional, ok. Otherwise use Neon pooler for runtime.");
  }
  if (directInfo.pooledGuess) {
    console.error("FAIL: DATABASE_URL_ADMIN host looks like a pooler host. Migrations should use DIRECT endpoint.");
    process.exit(5);
  }

  console.log("PASS: Neon wiring looks correct (distinct hosts; admin not pooled).");
  process.exit(0);
})();
