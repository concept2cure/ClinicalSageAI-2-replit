# Builds a DP-09 mutant of the CURRENT erasure handler: the pre-dc48d926
# `.catch(() => ({ rows: [] }))` on each redaction and `.catch(() => undefined)`
# on the request INSERT, inside BEGIN...COMMIT. Written beside the real file
# (relative imports resolve), run, then deleted.
import re, sys
src = open('server/services/ana-ri/command-executor.ts').read()
old_body = """  await client.query('SAVEPOINT gdpr_erase_table');
  try {
    const result = await client.query(sql, values);
    await client.query('RELEASE SAVEPOINT gdpr_erase_table');
    return { applicable: true, rows: result.rows };
  } catch (err: unknown) {
    if ((err as { code?: string } | null)?.code !== '42P01') throw err;
    await client.query('ROLLBACK TO SAVEPOINT gdpr_erase_table');
    await client.query('RELEASE SAVEPOINT gdpr_erase_table');
    return { applicable: false, rows: [] };
  }"""
new_body = """  // DP-09 MUTANT: the swallowed error, no savepoint.
  const result = await client.query(sql, values).catch(() => ({ rows: [] as any[] }));
  return { applicable: true, rows: result.rows };"""
assert src.count(old_body) == 1, 'runIfTablePresent body not found'
src = src.replace(old_body, new_body)
old_ins = """    await client.query(
      `INSERT INTO gdpr_data_subject_requests"""
assert src.count(old_ins) == 1, 'request insert not found'
src = src.replace(old_ins, """    await client.query(
      `INSERT INTO gdpr_data_subject_requests""")
# swallow the request insert: find its terminating ');' after the template and add .catch
i = src.index("`INSERT INTO gdpr_data_subject_requests")
j = src.index("    );\n", i)
src = src[:j] + "    ).catch(() => undefined); // DP-09 MUTANT\n" + src[j+len("    );\n"):]
open('server/services/ana-ri/command-executor.dp09-mutant.ts', 'w').write(src)
t = open('server/services/ana-ri/__tests__/ana-governed-command-signature.pglite.integration.test.ts').read()
t = t.replace("'../command-executor'", "'../command-executor.dp09-mutant'")
open('server/services/ana-ri/__tests__/dp09-mutant.pglite.integration.test.ts', 'w').write(t)
print('ok')
