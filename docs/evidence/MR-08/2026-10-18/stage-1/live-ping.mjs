import { pingClamd } from '../../../../../server/utils/virusScan.ts';
process.env.CLAMAV_HOST = '127.0.0.1'; process.env.CLAMAV_PORT = '3310';
console.info('pingClamd() against c2c-clamav 127.0.0.1:3310 →', await pingClamd());
process.env.CLAMAV_PORT = '3399';
console.info('pingClamd() against 127.0.0.1:3399 (nothing listening) →', await pingClamd());
delete process.env.CLAMAV_HOST;
console.info('pingClamd() with CLAMAV_HOST unset →', await pingClamd());
