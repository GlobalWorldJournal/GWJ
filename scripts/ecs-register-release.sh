#!/usr/bin/env bash
# Register a new revision of an ECS service's task-definition family that runs
# ONE exact image — pinned by digest, never a mutable tag — and stamps the
# release (git SHA) into GWJ_RELEASE. Prints the new task-definition ARN.
#
#   AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster \
#     scripts/ecs-register-release.sh gwj-backend <repo>@sha256:<digest> <git-sha>
#
# Why each step is shaped the way it is:
# - The base is the family's LATEST revision, not the one the service runs: it
#   carries any configuration terraform registered since the last deploy
#   (terraform owns env/secrets/roles; this script owns only image + release).
# - Only the fields register-task-definition accepts are carried over, so
#   read-only fields (ARN, revision, status, …) never leak into the request.
# - Each revision names one immutable image, so the ECS circuit breaker's
#   rollback really returns to the previous release.
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
if [ "$#" -ne 3 ]; then
  echo "usage: $0 <service> <image@digest> <release>" >&2
  exit 2
fi
SERVICE="$1"
IMAGE="$2"
RELEASE="$3"
case "$IMAGE" in
  *@sha256:*) ;;
  *) echo "register-release: image must be pinned by digest (got $IMAGE)" >&2; exit 2 ;;
esac

aws_() { aws --region "$AWS_REGION" "$@"; }

CURRENT="$(aws_ ecs describe-services --cluster "$ECS_CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)"
FAMILY="$(aws_ ecs describe-task-definition --task-definition "$CURRENT" \
  --query 'taskDefinition.family' --output text)"

REQUEST="$(aws_ ecs describe-task-definition --task-definition "$FAMILY" --query 'taskDefinition' --output json |
  jq -c --arg image "$IMAGE" --arg release "$RELEASE" '
    if (.containerDefinitions | length) != 1 then error("expected exactly one container") else . end
    | .containerDefinitions[0].image = $image
    | .containerDefinitions[0].environment =
        ([.containerDefinitions[0].environment[]? | select(.name != "GWJ_RELEASE")]
         + [{name: "GWJ_RELEASE", value: $release}])
    | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions, volumes,
       placementConstraints, requiresCompatibilities, cpu, memory, pidMode, ipcMode,
       proxyConfiguration, inferenceAccelerators, ephemeralStorage, runtimePlatform}
    | with_entries(select(.value != null))')"

aws_ ecs register-task-definition --cli-input-json "$REQUEST" \
  --query 'taskDefinition.taskDefinitionArn' --output text
