import fs from 'fs-extra';
import path from 'path';
import xml from 'xmlbuilder2';
import * as ds from '../server/services/docushare.js';
import minimist from 'minimist';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function assembleIND(sequence = '0000') {
  const tmpDir = path.join('/tmp', `ind_${sequence}`);
  await fs.copy(process.env.IND_TEMPLATE_PATH || 'templates/ectd', tmpDir);
  const seqDir = path.join(tmpDir, sequence);

  // Map required docs → CTD module paths
  const map = {
    'Protocol.pdf': 'm5/53-stud-rep/535-clin/Protocol.pdf',
    'IB.pdf': 'm1/us/ib/IB.pdf',
    'DSUR.pdf': 'm2/24-clin-summ/DSUR.pdf',
    'CMC.pdf': 'm3/32-qual/CMC.pdf',
  };

  const docs = await ds.list();
  for (const [name, dest] of Object.entries(map)) {
    const doc = docs.find(d => d.displayName === name);
    if (!doc) throw new Error(`Missing required doc ${name}`);
    const fileBuf = await ds.download(doc.objectId);
    const outPath = path.join(seqDir, dest);
    await fs.ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, fileBuf);
  }

  // Build index.xml (simple backbone)
  const idx = xml
    .create()
    .ele('ectd')
    .ele('application', { id: process.env.FDA_APP_NUMBER || 'IND000123' })
    .ele('sequence', { number: sequence, date: new Date().toISOString().slice(0, 10) })
    .up()
    .up();
  await fs.writeFile(path.join(seqDir, 'index.xml'), idx.end({ prettyPrint: true }));

  const zipPath = `/tmp/ind_${sequence}.zip`;
  await fs.remove(zipPath);
  await execPromise(`cd ${tmpDir} && zip -r ${zipPath} ${sequence}`);

  // Upload zip back to DocuShare
  const zipBuf = await fs.readFile(zipPath);
  const uploadsFolder = process.env.DS_SUBMISSIONS_FOLDER || '/Shared/TrialSage/Submissions';
  const result = await ds.upload(zipBuf, `IND_${sequence}.zip`, uploadsFolder);
  return { zipObjectId: result.objectId, zipPath };
}

if (require.main === module) {
  const { sequence = '0000' } = minimist(process.argv.slice(2));
  assembleIND(sequence).then(r => logger.info('Done', r));
}
