#!/usr/bin/env bash
# Post-deploy check: poll a service's /healthz until it reports the expected
# release. `aws ecs wait services-stable` also succeeds after the circuit breaker
# ROLLED BACK a failed release; this is what tells the two apart.
#
#   scripts/check-release.sh https://api.globalworldjournal.com/healthz <git-sha>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <healthz-url> <expected-release>" >&2
  exit 2
fi
URL="$1"
EXPECTED="$2"
ATTEMPTS=20
DELAY_SECONDS=6

RELEASE="(no response)"
for attempt in $(seq 1 "$ATTEMPTS"); do
  if BODY="$(curl -fsS --max-time 5 "$URL")"; then
    RELEASE="$(jq -r '.release // "(none)"' <<<"$BODY")"
    if [ "$RELEASE" = "$EXPECTED" ]; then
      echo "check-release: $URL serves $EXPECTED"
      exit 0
    fi
  fi
  echo "check-release: attempt $attempt/$ATTEMPTS: $URL serves $RELEASE, want $EXPECTED"
  sleep "$DELAY_SECONDS"
done
echo "check-release: $URL never served $EXPECTED (last: $RELEASE) — the deploy did not take, or was rolled back" >&2
exit 1
