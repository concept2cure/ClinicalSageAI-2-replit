/**
 * The account the e2e specs sign in as: the one the dev database seeds, named by
 * DEMO_USER_EMAIL (and its DEMO_USER_PASSWORD) — see .env.example.
 *
 * Until 2026-10-15 fourteen specs hard-coded one person's personal gmail
 * address (and the password "demo123"). The seed creates an account only for
 * the address DEMO_USER_EMAIL names, so there is no default: a spec that needs
 * the identity refuses, naming the variable, when it is unset.
 */
function required(name: 'DEMO_USER_EMAIL' | 'DEMO_USER_PASSWORD'): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) throw new Error(`Set ${name} to the seeded dev account (see .env.example); there is no default.`);
  return value;
}

export const devLoginEmail = (): string => required('DEMO_USER_EMAIL');
export const devLoginPassword = (): string => required('DEMO_USER_PASSWORD');
