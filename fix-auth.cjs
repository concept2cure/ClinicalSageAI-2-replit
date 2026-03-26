const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const p = new Pool({
  connectionString: "postgresql://neondb_owner:npg_9SIEbtA2hKsw@ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

(async () => {
  try {
    const hash = await bcrypt.hash("admin123", 10);
    await p.query("UPDATE users SET password_hash=$1 WHERE id=1", [hash]);
    console.log("ADMIN_FIXED");
    const r = await p.query("SELECT password_hash FROM users WHERE id=1");
    const match = await bcrypt.compare("admin123", r.rows[0].password_hash);
    console.log("VERIFY:", match);
  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
