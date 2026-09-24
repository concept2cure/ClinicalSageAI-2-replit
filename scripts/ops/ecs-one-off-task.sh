#!/usr/bin/env bash
# Run one command as a one-off ECS task derived from the API task definition,
# wait for it against an explicit deadline, print its log, and exit with its
# exit code. The one runner for every one-off database job the pipeline starts:
# the per-deploy migration (deploy-aws.yml, migrate) and the first provision of
# an empty database (provision-database.yml).
#
# Why derived from the API definition: the job then runs with the same
# execution role, secrets and log configuration the app has, and on the API
# service's own subnets and security groups, which are the ones RDS admits
# (the RDS security group allows 5432 from the ECS tasks' group only). Nothing
# outside the VPC can reach the database, so this is the only way in.
#
# Deliberate differences from the API definition:
#   • only the app container is kept (sidecars would keep a batch task alive);
#   • portMappings, healthCheck and inter-container wiring are dropped;
#   • image and command are this job's; EXTRA_SECRETS_JSON may add secrets.
#
# Environment (all required unless marked):
#   ECS_CLUSTER, ECS_API_SERVICE     where the API runs; its network config is reused
#   SOURCE_TD_ARN                    the API revision to derive from (the one the
#                                    preflight CHECKED, never "the family's latest")
#   CONTAINER_NAME                   the API container's name
#   FAMILY                           family to register the one-off definition under
#   IMAGE                            image reference, pinned by digest (…@sha256:…)
#   COMMAND_JSON                     the command, as a JSON array
#   LABEL                            what this is, for messages ("migration", "provision")
#   STARTED_BY                       run-task --started-by (≤36 chars)
#   DEADLINE_SECONDS    (optional)   default 1800. On expiry the task is STOPPED and
#                                    this exits 124: a job that outlives its deadline
#                                    is a failure, not something to wait on silently.
#   EXTRA_SECRETS_JSON  (optional)   JSON array of {name, valueFrom} to add
#   POLL_SECONDS        (optional)   default 15
#   GITHUB_OUTPUT       (optional)   receives task_def_arn= and task_arn=
#
# Exit: the task container's exit code; 124 on deadline; 1 when the task could
# not be registered, started or read (the cause is printed first).
set -euo pipefail

: "${ECS_CLUSTER:?}" "${ECS_API_SERVICE:?}" "${SOURCE_TD_ARN:?}" "${CONTAINER_NAME:?}"
: "${FAMILY:?}" "${IMAGE:?}" "${COMMAND_JSON:?}" "${LABEL:?}" "${STARTED_BY:?}"
DEADLINE_SECONDS="${DEADLINE_SECONDS:-1800}"
POLL_SECONDS="${POLL_SECONDS:-15}"
EXTRA_SECRETS_JSON="${EXTRA_SECRETS_JSON:-[]}"
OUT="${GITHUB_OUTPUT:-/dev/null}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

err() { echo "::error::$*" >&2; }

if [[ "$IMAGE" != *@sha256:* ]]; then
  err "$LABEL image '$IMAGE' is not pinned by digest; refusing to run a mutable tag."
  exit 1
fi
if ! jq -e 'type == "array" and length > 0 and all(type == "string")' <<<"$COMMAND_JSON" >/dev/null; then
  err "COMMAND_JSON must be a non-empty JSON array of strings; got: $COMMAND_JSON"
  exit 1
fi
if ! jq -e 'type == "array" and all(has("name") and has("valueFrom"))' <<<"$EXTRA_SECRETS_JSON" >/dev/null; then
  err "EXTRA_SECRETS_JSON must be a JSON array of {name, valueFrom}; got: $EXTRA_SECRETS_JSON"
  exit 1
fi

# ── 1. Derive and register ───────────────────────────────────────────────────
aws ecs describe-task-definition --task-definition "$SOURCE_TD_ARN" --no-cli-pager \
  --query 'taskDefinition' > "$WORK/source.json"

jq --arg img "$IMAGE" --arg c "$CONTAINER_NAME" --arg family "$FAMILY" \
   --argjson cmd "$COMMAND_JSON" --argjson extra "$EXTRA_SECRETS_JSON" '
  {taskRoleArn, executionRoleArn, networkMode, containerDefinitions, volumes, placementConstraints,
   requiresCompatibilities, cpu, memory, runtimePlatform, ipcMode, pidMode, proxyConfiguration, ephemeralStorage}
  | with_entries(select(.value != null))
  | .family = $family
  | .containerDefinitions = (
      .containerDefinitions
      | map(select(.name == $c))
      | map(
          .image = $img
          | .command = $cmd
          | .essential = true
          | del(.portMappings, .healthCheck)
          # Wiring that can only name the sidecars dropped above; left in,
          # register-task-definition rejects the whole revision.
          | del(.dependsOn, .links, .volumesFrom)
          # An extra secret REPLACES one of the same name rather than
          # duplicating it (ECS rejects duplicate names).
          | .secrets = (((.secrets // []) | map(select(.name as $n | ($extra | map(.name) | index($n)) | not))) + $extra)
        )
    )
' "$WORK/source.json" > "$WORK/td.json"

if [[ "$(jq '.containerDefinitions | length' "$WORK/td.json")" != "1" ]]; then
  err "Container '$CONTAINER_NAME' is not in $SOURCE_TD_ARN; nothing to derive the $LABEL task from."
  exit 1
fi

TD_ARN=$(aws ecs register-task-definition --cli-input-json "file://$WORK/td.json" --no-cli-pager \
  --query 'taskDefinition.taskDefinitionArn' --output text)
# `--output text` prints the literal "None" when the query misses.
if [[ -z "$TD_ARN" || "$TD_ARN" == "None" ]]; then
  err "register-task-definition returned no ARN for family '$FAMILY'."
  exit 1
fi
echo "Registered $LABEL task definition: $TD_ARN (derived from $SOURCE_TD_ARN)"
echo "task_def_arn=$TD_ARN" >> "$OUT"

LOG_GROUP=$(jq -r '.containerDefinitions[0].logConfiguration.options["awslogs-group"] // ""' "$WORK/td.json")
LOG_PREFIX=$(jq -r '.containerDefinitions[0].logConfiguration.options["awslogs-stream-prefix"] // ""' "$WORK/td.json")

# ── 2. Run it where the database is reachable ────────────────────────────────
NETWORK_CONFIG=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_API_SERVICE" \
  --no-cli-pager --query 'services[0].networkConfiguration' --output json)
if [[ -z "$NETWORK_CONFIG" || "$NETWORK_CONFIG" == "null" ]]; then
  err "Could not read networkConfiguration from service '$ECS_API_SERVICE'."
  err "Without it the $LABEL task would launch outside the network that can reach the database."
  exit 1
fi
jq '{awsvpcConfiguration: .awsvpcConfiguration}' <<<"$NETWORK_CONFIG" > "$WORK/netcfg.json"

# One call, and its failures read from the same response: a second run-task to
# "see why" can start the job twice.
aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$TD_ARN" --launch-type FARGATE \
  --network-configuration "file://$WORK/netcfg.json" --started-by "$STARTED_BY" \
  --no-cli-pager --output json > "$WORK/run.json"
TASK_ARN=$(jq -r '.tasks[0].taskArn // ""' "$WORK/run.json")
if [[ -z "$TASK_ARN" ]]; then
  err "run-task started no $LABEL task. Failures reported by ECS:"
  jq '.failures' "$WORK/run.json" >&2
  exit 1
fi
echo "$LABEL task: $TASK_ARN"
echo "task_arn=$TASK_ARN" >> "$OUT"

# ── 3. Wait, against a deadline ──────────────────────────────────────────────
# Not `aws ecs wait tasks-stopped`: it gives up silently after 10 minutes, and
# a first provision (install-fresh over ~800 tables) or a large replay can
# legitimately take longer. A deadline that is ours to set, and that stops the
# task when it passes, so nothing keeps writing after the pipeline has moved on.
START=$(date +%s)
STATUS=""
while :; do
  STATUS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --no-cli-pager \
    --query 'tasks[0].lastStatus' --output text)
  [[ "$STATUS" == "STOPPED" ]] && break
  if (( $(date +%s) - START >= DEADLINE_SECONDS )); then
    err "$LABEL task still $STATUS after ${DEADLINE_SECONDS}s; stopping it and failing."
    aws ecs stop-task --cluster "$ECS_CLUSTER" --task "$TASK_ARN" \
      --reason "deadline ${DEADLINE_SECONDS}s exceeded ($STARTED_BY)" --no-cli-pager >/dev/null || true
    STATUS="DEADLINE"
    break
  fi
  sleep "$POLL_SECONDS"
done

aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --no-cli-pager --output json > "$WORK/task.json"
EXIT_CODE=$(jq -r --arg c "$CONTAINER_NAME" '[.tasks[0].containers[] | select(.name == $c) | .exitCode][0] // "none"' "$WORK/task.json")
STOPPED_REASON=$(jq -r '.tasks[0].stoppedReason // ""' "$WORK/task.json")
echo "$LABEL task exit code: $EXIT_CODE (stoppedReason: $STOPPED_REASON)"

# ── 4. Its own output, on every path ─────────────────────────────────────────
if [[ -n "$LOG_GROUP" && -n "$LOG_PREFIX" ]]; then
  echo "── $LABEL log ─────────────────────────────────────────────────"
  aws logs get-log-events --log-group-name "$LOG_GROUP" \
    --log-stream-name "${LOG_PREFIX}/${CONTAINER_NAME}/${TASK_ARN##*/}" \
    --start-from-head --no-cli-pager --query 'events[].message' --output text || echo "(log stream not available)"
  echo "───────────────────────────────────────────────────────────────"
fi

if [[ "$STATUS" == "DEADLINE" ]]; then exit 124; fi
if [[ ! "$EXIT_CODE" =~ ^[0-9]+$ ]]; then
  # No exit code means the container never ran: image pull, secret fetch or
  # capacity failure. stoppedReason above names which.
  err "The $LABEL container reported no exit code: it never ran. See stoppedReason above."
  exit 1
fi
exit "$EXIT_CODE"
