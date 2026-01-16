const postgres = require('postgres');
(async () => {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    const sql = postgres(connectionString, { ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false });
    const tables = ['ai_token_budget','coauthor_validation_rules','permissions','roles'];
    for (const t of tables) {
      try {
        const cols = await sql`select column_name,data_type,is_nullable,column_default from information_schema.columns where table_name=${t};`;
        console.log('\nTABLE', t);
        console.table(cols);
      } catch (e) {
        console.error('ERR', t, e.message);
      }
    }
    await sql.end();
  } catch (err) {
    console.error('Fatal', err);
    process.exit(1);
  }
})();
