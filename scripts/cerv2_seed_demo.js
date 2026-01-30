import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';

const programId = process.env.CERV2_PROGRAM_ID || randomUUID();
const outputPath = path.resolve(process.cwd(), '.cerv2_program_id');

const run = async () => {
  await writeFile(outputPath, `${programId}\n`, 'utf8');
  logger.info('CERV2 demo program ID created:');
  logger.info(programId);
  logger.info(`Saved to ${outputPath}`);
  logger.info('Use it by setting CERV2_PROGRAM_ID or passing --programId.');
};

run().catch(error => {
  logger.error('Failed to create CERV2 demo program ID:', error);
  process.exit(1);
});
