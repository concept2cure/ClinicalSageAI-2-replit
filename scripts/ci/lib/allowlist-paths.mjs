/**
 * An allowlist may not name a file that does not exist.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Several gates carry a hardcoded set of approved or quarantined file paths —
 * the canonical DOCX/PDF/embedding runtimes, the legacy-dependency quarantine,
 * the tenant-isolation and shared-pool exemptions. Membership is by exact
 * relative path, so an entry naming an absent file suppresses nothing today and
 * looks harmless. It is not harmless. It is a PRE-APPROVAL: whoever next
 * creates a file at that path inherits an exemption nobody reviewed, and the
 * gate stays green while they do.
 *
 * A sweep found 24 such entries across five gates, most of them left behind by
 * b79f020e1 (the 670-file dead-code purge). Two — `server/routes/admin.ts` and
 * `server/services/diagnostics.ts`, both in tenant-isolation allowlists — had
 * never existed in the repository's history at all; they were written against
 * files someone intended. `ban-new-pool.sh`'s own header already records this
 * shape happening once before, with an allowlisted `server/repositories` that
 * did not exist.
 *
 * Hand-removing the 24 leaves the mechanism intact, so this closes the class:
 * a gate calls this with its allowlist and gets a hard failure the moment an
 * entry stops matching a real file. That makes the lists self-cleaning — the
 * deletion that orphans an entry fails the build that contains it, which is the
 * only moment anyone still remembers why the entry was there.
 *
 * Deliberately a hard failure, not a warning. The sweep also found 16 gates
 * that print stale-entry notices and exit 0; every one of them had stale
 * entries sitting in it, because a notice in CI scrollback is not a task
 * anybody owns.
 *
 * Entries may be marked intentionally-absent by passing them in `allowAbsent` —
 * for a path a gate must keep naming even though the repo does not carry it
 * (a file the build produces, a path in another repository). Those need a
 * reason in the caller, same as any other suppression.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {object} opts
 * @param {string} opts.tag        gate tag for the message, e.g. '[ci:check-docx-runtime]'
 * @param {string} opts.repoRoot   absolute repo root
 * @param {string} opts.name       what the list is, e.g. 'APPROVED_PYTHON'
 * @param {Iterable<string>} opts.paths  repo-relative paths the gate allowlists
 * @param {Iterable<string>} [opts.allowAbsent]  paths permitted to be absent
 * @returns {string[]} the absent paths (empty when the list is clean)
 */
export function assertAllowlistPathsExist({ tag, repoRoot, name, paths, allowAbsent = [] }) {
  const exempt = new Set(allowAbsent);
  const absent = [...paths].filter(
    (p) => !exempt.has(p) && !fs.existsSync(path.join(repoRoot, p)),
  );
  if (absent.length === 0) return absent;

  console.error(`\n${tag} FAILED — ${name} names ${absent.length} file(s) that do not exist:\n`);
  for (const p of absent) console.error(`    ${p}`);
  console.error(
    '\n  An allowlist entry for an absent file is a pre-approval: a file created\n' +
      '  at that path would inherit this exemption without review. If the file was\n' +
      '  deleted, delete the entry with it. If the gate must keep naming it, pass it\n' +
      '  in allowAbsent WITH A REASON.\n',
  );
  return absent;
}
