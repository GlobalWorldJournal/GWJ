#!/usr/bin/env bash
# Run ONE command as a Fargate one-shot from an ECS service's CURRENT task
# definition (same image, secrets, roles), in the service's OWN network
# configuration; wait for it, print its log, and exit with ITS exit code.
#
#   AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster \
#     scripts/ecs-oneshot.sh gwj-backend migrate-pre -- \
#     bun run src/db/migrate.ts --phase=pre --target-database=gwj
#
# Used by .github/workflows/deploy-aws.yml and by docs/POSTGRES-CUTOVER.md.
#
# Why each step is shaped the way it is:
# - The network configuration is READ from the live service, never hardcoded:
#   a one-shot in the wrong subnets cannot pull its image and dies silently.
# - It overrides only `command`. Secrets cannot be overridden by run-task; the
#   task definition the service runs already carries them.
# - `run-task` returning an ARN is not a result. The verdict is the container's
#   exit code; a task that never started reports `None` and fails here.
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
if [ "$#" -lt 4 ] || [ "$3" != "--" ]; then
  echo "usage: $0 <service> <started-by> -- <command> [args...]" >&2
  exit 2
fi
SERVICE="$1"
STARTED_BY="$2"
shift 3

aws_() { aws --region "$AWS_REGION" "$@"; }

TASK_DEF="$(aws_ ecs describe-services --cluster "$ECS_CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)"
NETWORK="$(aws_ ecs describe-services --cluster "$ECS_CLUSTER" --services "$SERVICE" \
  --query 'services[0].networkConfiguration' --output json)"
CONTAINER="$(aws_ ecs describe-task-definition --task-definition "$TASK_DEF" \
  --query 'taskDefinition.containerDefinitions[0].name' --output text)"
LOG_GROUP="$(aws_ ecs describe-task-definition --task-definition "$TASK_DEF" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options."awslogs-group"' --output text)"
LOG_PREFIX="$(aws_ ecs describe-task-definition --task-definition "$TASK_DEF" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options."awslogs-stream-prefix"' --output text)"

# NUL-delimited through stdin: jq would parse an argument like `--phase=pre` as
# one of its OWN options if it were passed with --args.
OVERRIDES="$(printf '%s\0' "$@" | jq -cRs --arg name "$CONTAINER" \
  '{containerOverrides: [{name: $name, command: (split("\u0000") | .[:-1])}]}')"

echo "one-shot: service=$SERVICE taskDefinition=$TASK_DEF container=$CONTAINER"
echo "one-shot: command=$*"
TASK_ARN="$(aws_ ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$TASK_DEF" \
  --launch-type FARGATE --network-configuration "$NETWORK" --overrides "$OVERRIDES" \
  --started-by "$STARTED_BY" --query 'tasks[0].taskArn' --output text)"
if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "None" ]; then
  echo "one-shot: run-task started no task" >&2
  exit 1
fi
echo "one-shot: task=$TASK_ARN"

aws_ ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN"

EXIT_CODE="$(aws_ ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
STOPPED_REASON="$(aws_ ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].stoppedReason' --output text)"

echo "----- log: $LOG_GROUP $LOG_PREFIX/$CONTAINER/${TASK_ARN##*/} -----"
aws_ logs get-log-events --log-group-name "$LOG_GROUP" \
  --log-stream-name "$LOG_PREFIX/$CONTAINER/${TASK_ARN##*/}" --start-from-head \
  --query 'events[].message' --output text | tr '\t' '\n' || echo "(log stream unavailable)"
echo "----- end log -----"

echo "one-shot: exitCode=$EXIT_CODE stoppedReason=$STOPPED_REASON"
[ "$EXIT_CODE" = "0" ]
