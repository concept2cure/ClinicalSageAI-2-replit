# Rolling back a deploy

A rollback returns the API service to an earlier **task-definition revision**: the code that revision's image digest
names, under its own configuration. It never reverses the database schema.

## Migrations are forward-only (CLAUDE.md RULE 1)

- Every migration in `C2C_MIGRATION_FILES` re-runs on every deploy, and nearly all of them are additive and
  `IF NOT EXISTS`-guarded.
- A rollback therefore runs the previous code against the **current** schema. That works because the change was
  additive: the old code does not read the new columns.
- **There is no down-migration, and none may be written by hand during an incident.** Removing schema is an
  amendment of the creating migration, under its own review.
- A change that is not additive is refused before it ships (`npm run ci:migration-drop-safety`). If one shipped
  anyway, rolling back the code is not enough. Stop, and take it to the founder.

## Automatic: a failed smoke test

`deploy-aws.yml`'s `rollback` job runs when `smoke-test` fails after `deploy-api` succeeded.
- **What it does:** returns the API service to the revision it ran before the deploy (`previous_td_arn`), waits for the
  service to be stable, and checks that the service runs that revision.
- **What it does not roll back:** the frontend. Its bucket is versioned, and it is published only after the API it pairs
  with has rolled.

## By hand: dispatch the workflow

To return to a named revision, with nothing else deployed:

1. Find the revision to return to.
   ```bash
   aws ecs list-task-definitions --family-prefix c2c-production-api --sort DESC --max-items 5
   aws ecs describe-services --cluster c2c-production --services c2c-production-api \
     --query 'services[0].taskDefinition' --output text
   ```
2. Dispatch **Deploy to AWS** with `rollback_taskdef` set to that ARN, for the environment that failed. Only the
   rollback job runs. It refuses, and changes nothing, in three cases:
   - an ARN that is not a revision of the API family;
   - the revision that just failed;
   - a revision without the API container.
3. Confirm in the run's summary that the service now runs the revision. Confirm that `GET /readyz` answers ready and
   that the alarms that fired clear: each notifies the alarm topic again when it returns to OK.

## By hand: the AWS CLI, when the workflow cannot run

Use this only when GitHub Actions is unavailable. It does what the rollback job does, without its checks, so make
them yourself:

```bash
TARGET=arn:aws:ecs:us-east-1:<account>:task-definition/c2c-production-api:<n>
aws ecs describe-task-definition --task-definition "$TARGET" \
  --query "taskDefinition.containerDefinitions[?name=='api'].image | [0]" --output text   # must be @sha256:
aws ecs update-service --cluster c2c-production --service c2c-production-api --task-definition "$TARGET"
aws ecs wait services-stable --cluster c2c-production --services c2c-production-api
aws ecs describe-services --cluster c2c-production --services c2c-production-api \
  --query 'services[0].taskDefinition' --output text                                      # must equal $TARGET
```

Afterwards:
- Record what was run, by whom, and why, in the incident's notes.
- The next Terraform apply would roll the service forward to Terraform's own task definition. Reconcile before applying.

## What a rollback does not undo

- **Migrations** (above).
- **Data written by the failed revision.** It stays in the database, under audit. Correcting it is a governed change,
  not part of a rollback.
- **Secrets or Terraform changes.** Roll those back with a Terraform plan and apply of the earlier configuration.
