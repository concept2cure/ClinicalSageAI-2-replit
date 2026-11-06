import fs from 'node:fs';
import { pool } from '/workspace/Concept2cure-V2/server/db.ts';
import { getOrCreateThread, saveChatMessage } from '/workspace/Concept2cure-V2/server/services/chat-thread-helpers.ts';
async function main() {
  const {rows} = await pool.query('SELECT id, default_organization_id FROM users WHERE email=$1', ['ana.author@concept2cure.pro']);
  if (rows.length !== 1) throw new Error('Expected one fictional author');
  const user = rows[0];
  const fixtures=[];
  for (const letter of ['A','B']) {
    const id=await getOrCreateThread(null, user.id, 'f1_recent', user.default_organization_id);
    const content=`F1 Recent conversation ${letter}`;
    await saveChatMessage(id,'user',content);
    fixtures.push({letter,id,content});
  }
  fs.writeFileSync('/workspace/scratch/c2c-handoff-runtime/threads.json',JSON.stringify(fixtures,null,2),{mode:0o600});
  console.log('Created local saved chat histories:', fixtures.map(x=>x.content).join(', '));
  await pool.end();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
