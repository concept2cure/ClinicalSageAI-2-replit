/**
 * The .env.local that `npm run up` writes: the values the runtime needs, which
 * the server reads before .env (server/config/load-env-files.ts; the first file
 * to define a key wins). So it also decides the development isolation posture,
 * whatever an older .env says.
 */
export function envLocalContents({ appUrl, ownerUrl, port }) {
  return [
    '# Written by `npm run up`. Git-ignored. Delete and re-run to regenerate.',
    `APP_DATABASE_URL=${appUrl}`,
    `DATABASE_URL=${ownerUrl}`,
    `PORT=${port}`,
    'NODE_ENV=development',
    // The isolation posture production runs, and refuses to boot without. Shadow
    // mode (off) is a posture no customer runs, and in it the vault.* policies
    // admit no write (VSR-001 F-15, decision (a)).
    'RLS_ENFORCE=on',
    ...ownOrigin(port),
    '',
  ].join('\n');
}

/**
 * The server allows localhost:5000 and :3000 as development origins
 * (server/middleware/enterprise-security.ts). On any other port it refused its
 * own page's requests and the app rendered blank, so the port's own origin is
 * written here (2026-11-12, F1).
 */
function ownOrigin(port) {
  const p = String(port);
  if (p === '5000' || p === '3000') return [];
  return [`ALLOWED_ORIGINS=http://localhost:${p},http://127.0.0.1:${p}`];
}
