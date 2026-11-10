/**
 * "Demo access" with a choice of demo people (the founder, 2026-11-10: "the demo access button can have a selection
 * of users that are tied to demo accounts and various scenarios and according to role too … this must work in
 * Codespace"). Split out of Concept2CureLogin.tsx, beside it.
 *
 * The people are configuration, never built in. VITE_DEMO_ACCOUNTS lists them as `email|name|organisation|role`
 * entries separated by ";"; the Codespace writes it from its two rosters (.devcontainer/post-create.sh
 * c2c_demo_accounts). Each choice signs in through the same dev login and the same readiness check as the single
 * button, which only a development server with ALLOW_DEV_AUTH answers. With no list, the button is as it was.
 */
import React from 'react';

export interface DemoAccount { email: string; name: string; organisation: string; role: string }

/** The configured demo people, in order. A malformed entry is skipped, not guessed. */
export function parseDemoAccounts(raw: unknown): DemoAccount[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = new Set<string>();
  const out: DemoAccount[] = [];
  for (const entry of raw.split(';')) {
    const [email, name, organisation, role] = entry.split('|').map((part) => part.trim());
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push({ email, name: name || email, organisation: organisation || '', role: role || '' });
  }
  return out;
}

/** The person "Demo access" signs in as, grouped by their demo organisation. */
export function DemoAccountPicker({ accounts, value, onChange, disabled, classes }: {
  accounts: DemoAccount[];
  value: string;
  onChange: (email: string) => void;
  disabled?: boolean;
  /** The sign-in form's own field, label and input classes, so the choice reads as one of its fields. */
  classes?: { field?: string; label?: string; input?: string };
}) {
  const organisations = [...new Set(accounts.map((a) => a.organisation))];
  const option = (a: DemoAccount) => (
    <option key={a.email} value={a.email}>{a.role ? `${a.name} — ${a.role}` : a.name}</option>
  );
  return (
    <label className={classes?.field}>
      <span className={classes?.label}>Sign in as</span>
      <select className={classes?.input} style={{ width: '100%', minWidth: 0, textOverflow: 'ellipsis' }}
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Demo person">
        {organisations.map((org) => (org
          ? <optgroup key={org} label={org}>{accounts.filter((a) => a.organisation === org).map(option)}</optgroup>
          : accounts.filter((a) => !a.organisation).map(option)))}
      </select>
    </label>
  );
}
