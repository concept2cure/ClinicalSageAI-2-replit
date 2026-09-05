/**
 * Deployment contract (C2C-DB-001 / REM-7): a production deploy MIGRATES the
 * database, and cannot roll services if that migration fails.
 *
 * The gap this locks shut was not a bug in a migration — it was the absence of
 * any mechanism at all. Before this contract existed:
 *   • the container CMD was `npm run start`, which applies nothing;
 *   • .github/workflows/deploy-aws.yml contained ZERO migration references
 *     across all of its jobs;
 *   • the runtime image copied `migrations/` but neither `db/migrations/` nor
 *     `scripts/db/`, so nothing inside it could migrate even in principle.
 * Schema therefore reached real databases only when a human remembered to run an
 * applier by hand. That is the machinery behind "merged ≠ applied": code that
 * reads a table ships on a deploy, the table does not.
 *
 * Each assertion below corresponds to one leg of the mechanism. They are checked
 * statically because the failure mode is *silent removal* — a deleted COPY line
 * or a dropped `needs:` breaks the deploy path without breaking any test that
 * exercises application behaviour, and would not be noticed until a production
 * deploy shipped code onto an unmigrated schema.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Only the shape this contract reads. `needs:` is a scalar or a list in YAML. */
type DeployWorkflow = { jobs: Record<string, { needs?: string | string[] }> };

describe('deploy migration mechanism', () => {
  describe('the runtime image carries a migration payload', () => {
    const dockerfile = read('Dockerfile.optimized');

    it.each([
      ['the root migrations tree', /COPY --from=builder \/app\/migrations \.\/migrations/],
      ['the db/migrations tree', /COPY --from=builder \/app\/db\/migrations \.\/db\/migrations/],
      ['the provisioning scripts', /COPY --from=builder \/app\/scripts\/db \.\/scripts\/db/],
    ])('copies %s into the production stage', (_label, pattern) => {
      expect(dockerfile).toMatch(pattern);
    });

    /*
     * THE SAME OMISSION, ONE DIRECTORY OVER, AND IT KILLED THE PRODUCT'S
     * HEADLINE CAPABILITY.
     *
     * The preamble above says a deleted COPY line "breaks the deploy path
     * without breaking any test that exercises application behaviour". That is
     * exactly what had happened to `assets/`. The production stage copied six
     * paths and none of them was it, so in every containerized deploy —
     * deploy-aws.yml builds this file, and both compose files build it for the
     * self-hosted SKU — the official FDA eSTAR templates were simply not on
     * disk. `listVendoredTemplates()` returned [], every produce answered 422,
     * and the blocker the client read was:
     *
     *   "Cannot produce a submittable eSTAR: the official template
     *    eSTAR-510k-non-ivd.pdf is not vendored. Place it in
     *    assets/estar-templates/ (or set ESTAR_TEMPLATE_DIR)."
     *
     * — an instruction naming a path inside a container the filer does not
     * have. Reproduced by resolving the drop-point against a container-shaped
     * tree: `filled: false`. The whole official-eSTAR path worked only from a
     * repo checkout, and no deployment surface set the ESTAR_TEMPLATE_DIR
     * escape hatch that would have covered for it.
     *
     * This assertion is DERIVED, not a hardcoded list: it finds every
     * cwd-relative runtime drop-point in the server source and requires the
     * image to ship its root. A new drop-point added later is covered the day
     * it is written, without anyone remembering to come back here.
     */
    it('ships every vendored-artifact drop-point the server reads from disk', () => {
      // Derived, not a hardcoded list: every `process.cwd(), 'assets/…'` in the
      // server source must have its root in the image. A drop-point added later
      // is covered the day it is written. Scoped to `assets/` because that is
      // the vendored, read-only, committed tree — runtime WRITE directories
      // (uploads, output, tmp, logs) are created on demand and must not be
      // copied, and conflating the two would make this assertion wrong.
      const dropPoints = new Set<string>();
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
          const rel = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
            walk(rel);
          } else if (/\.(ts|js|mjs)$/.test(entry.name) && !/\.test\.[tj]s$/.test(entry.name)) {
            for (const m of read(rel).matchAll(/process\.cwd\(\),\s*'(assets\/[^']+)'/g)) {
              dropPoints.add(m[1]);
            }
          }
        }
      };
      walk('server');

      // The scan must find something, or this passes by finding nothing to
      // check — the shape of a gate that has only ever been seen to pass.
      expect(
        [...dropPoints].sort(),
        'no assets/ drop-points found in server source — the scan is broken',
      ).toEqual(expect.arrayContaining(['assets/estar-templates', 'assets/ectd-dtd', 'assets/ectd-schema']));

      expect(
        dockerfile,
        'the server reads vendored agency artifacts out of assets/ at runtime, so the production image must COPY it',
      ).toMatch(/COPY --from=builder \/app\/assets \.\/assets/);

      // Shipping the directory is no use if the artifacts are not in it. Only
      // the REQUIRED drop-points are asserted present: `assets/tessdata` is one
      // of three candidates the OCR service probes with existsSync and handles
      // being absent, so requiring it would be wrong.
      for (const dp of ['assets/estar-templates', 'assets/ectd-dtd', 'assets/ectd-schema']) {
        const dir = path.join(REPO_ROOT, dp);
        expect(fs.existsSync(dir), `${dp} is read at runtime but not in the repo`).toBe(true);
        expect(fs.readdirSync(dir).length, `${dp} is shipped but empty`).toBeGreaterThan(0);
      }
    });

    it('the vendored eSTAR templates and their checksums survive .dockerignore', () => {
      // .dockerignore excludes *.md, which is only the README in this tree. If
      // it ever excluded the PDFs or checksums.txt, the COPY above would ship an
      // empty directory and template integrity would fail closed on every
      // produce — the honest failure, but still a dead capability.
      const ignore = read('.dockerignore')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      for (const pattern of ['*.pdf', 'assets', 'assets/', '*.txt', 'checksums.txt']) {
        expect(ignore, `.dockerignore must not exclude ${pattern}`).not.toContain(pattern);
      }
      // And the files are actually committed, not gitignored build output.
      for (const f of ['eSTAR-510k-non-ivd.pdf', 'eSTAR-510k-ivd.pdf', 'checksums.txt']) {
        expect(fs.existsSync(path.join(REPO_ROOT, 'assets/estar-templates', f)), f).toBe(true);
      }
    });

    it('exposes the migration entrypoint as an npm script', () => {
      const pkg = JSON.parse(read('package.json'));
      expect(pkg.scripts['db:migrate:deploy']).toBe('node scripts/db/deploy-migrate.mjs');
    });

    it('needs only production dependencies to run the migration', () => {
      // `npm ci --omit=dev` prunes devDependencies from the production stage, so
      // a migration entrypoint that reached for one (drizzle-kit, tsx, …) would
      // fail at runtime inside the very image the deploy runs it from.
      const pkg = JSON.parse(read('package.json'));
      const sources = ['deploy-migrate.mjs', 'migration-set.mjs', 'connection.mjs', 'authoring-subsystem.mjs'];
      const imported = new Set<string>();
      for (const file of sources) {
        const src = read(path.join('scripts', 'db', file));
        for (const m of src.matchAll(/^import\s+(?:[\s\S]*?)\s+from\s+'([^']+)'/gm)) {
          imported.add(m[1]);
        }
      }
      const external = [...imported].filter((s) => !s.startsWith('.') && !s.startsWith('node:'));
      for (const dep of external) {
        const root = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
        expect(
          pkg.dependencies?.[root],
          `${root} is imported by the deploy migration path but is not a production dependency`,
        ).toBeDefined();
      }
    });
  });

  describe('the deploy workflow runs it, and gates on it', () => {
    const workflow = read('.github/workflows/deploy-aws.yml');

    it('defines a migrate job that runs the migration entrypoint', () => {
      expect(workflow).toMatch(/^ {2}migrate:$/m);
      expect(workflow).toMatch(/"npm",\s*"run",\s*"db:migrate:deploy"/);
    });

    // WHICH jobs must be gated is DERIVED from the workflow, never hard-coded.
    //
    // The previous revision named ['deploy-api', 'deploy-worker'] literally and
    // read each job's `needs:` with `workflow.slice(workflow.indexOf(…))`. When
    // the dead worker pipeline was deleted (it built `-f worker/Dockerfile`, a
    // path that has never existed in this repo, so every tag-triggered deploy
    // failed at build-push), `indexOf` returned -1, `slice(-1)` handed the
    // matcher the final character of the file, and the assertion failed against
    // a job that no longer exists — a red test that named a real removal as a
    // lost migration gate.
    //
    // A hard-coded list is wrong in BOTH directions, and the second one is the
    // expensive one: it goes red when a legitimate job is removed, and it stays
    // silent when a NEW service-rolling job is added without the gate — which is
    // the case that actually ships code onto an unmigrated schema.
    //
    // The invariant, stated once: `build-push` produces the API image, so ANY
    // job that consumes it rolls that image onto the database, and must
    // therefore depend on `migrate`. `deploy-frontend` is correctly excluded —
    // it publishes static assets and consumes no image. A worker deploy, if one
    // is ever re-introduced, is covered the moment it declares `needs:
    // build-push`, with no edit here.
    const jobs = (yaml.load(workflow) as DeployWorkflow).jobs;
    const needsOf = (job: string): string[] => {
      const declared = jobs[job]?.needs;
      if (declared === undefined) return [];
      return Array.isArray(declared) ? declared : [declared];
    };
    const rollsTheBuiltImage = Object.keys(jobs).filter(
      (job) => job !== 'migrate' && needsOf(job).includes('build-push'),
    );

    it('gates every job that rolls the built image on the migration', () => {
      // Non-emptiness first. Without it this assertion passes vacuously the day
      // the last image-consuming job is renamed or removed — a green test
      // proving nothing, which is the failure mode this whole contract exists
      // to prevent.
      expect(
        rollsTheBuiltImage,
        'no job consumes build-push — the deploy path no longer rolls the image it builds',
      ).not.toEqual([]);

      for (const job of rollsTheBuiltImage) {
        // The `needs:` edge is the gate. Without it the job runs in parallel with
        // the migration and ships code onto whatever schema happens to be there.
        expect(needsOf(job), `${job} must depend on the migrate job`).toContain('migrate');
      }
    });

    it('runs the migration itself against the image that was just built', () => {
      // The other half of the same edge: `migrate` is only a meaningful gate if
      // it, too, waits for build-push rather than racing it.
      expect(needsOf('migrate')).toContain('build-push');
    });

    it('pins the migration task to the same image digest being deployed', () => {
      // A migration run from a different image than the one about to serve
      // traffic can apply a schema that the deploying code does not expect.
      expect(workflow).toMatch(/IMAGE_DIGEST: \$\{\{ needs\.build-push\.outputs\.api_digest \}\}/);
      expect(workflow).toMatch(/PINNED_IMAGE="\$ECR_REGISTRY\/\$ECR_API_REPO@\$IMAGE_DIGEST"/);
    });
  });

  describe('the migration set is real', () => {
    it.each(C2C_MIGRATION_FILES.map((f: string) => [f]))('%s exists in the repo', (rel: string) => {
      // A path typo here is invisible until deploy time, where it surfaces as a
      // halted production migration.
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
    });

    it('is the single source both appliers consume', () => {
      // Two hand-maintained copies of this list is how "what a human ran" and
      // "what a deploy runs" drift apart — the failure this whole mechanism
      // exists to prevent.
      for (const applier of ['apply-c2c-migrations.mjs', 'deploy-migrate.mjs']) {
        const src = read(path.join('scripts', 'db', applier));
        expect(src).toMatch(
          /import \{[^}]*C2C_MIGRATION_FILES[^}]*\} from '\.\/migration-set\.mjs'/,
        );
        // And no local copy alongside the import. A second list that is only
        // *mostly* the same is worse than an obviously separate one, because
        // the divergence shows up as a missing table on one path only.
        expect(src, `${applier} must not define its own file list`).not.toMatch(
          /const\s+FILES\s*=\s*\[/,
        );
      }
    });
  });

  describe('it refuses to bootstrap a blank database', () => {
    const src = read('scripts/db/deploy-migrate.mjs');

    it('preflights for a base schema and exits with a distinct code', () => {
      // Applying the incremental set onto an empty database would leave an
      // island of tables with no base schema under them, and the app would boot
      // against a schema nobody owns. Absent is honest; half-provisioned is not.
      expect(src).toMatch(/const EXIT_NOT_PROVISIONED = 3;/);
      expect(src).toMatch(/process\.exit\(EXIT_NOT_PROVISIONED\)/);
      expect(src).toMatch(/BASE_SCHEMA_SENTINELS/);
    });

    it('stops at the first failed file rather than applying further DDL', () => {
      expect(src).toMatch(/stopOnFirstFailure: true/);
    });

    it('verifies the readiness contract before reporting success', () => {
      // Otherwise a deploy reports green and every task then fails its /readyz
      // probe — the failure surfaces as an opaque rollback instead of a
      // diagnosable migration error.
      expect(src).toMatch(/verifyReadinessContract/);
      expect(src).toMatch(/AUTHORING_SUBSYSTEM_FK_CONSTRAINTS/);
      expect(src).toMatch(/tenant_isolation_policy/);
    });
  });
});
