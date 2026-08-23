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
