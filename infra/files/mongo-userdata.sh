#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/gwj-userdata.log) 2>&1

# GWJ dedicated MongoDB 8 box. Reads its admin creds from the GWJ SSM namespace
# (/gwj/mongo_*) and runs Mongo on the mounted data volume. Lean by design: no
# S3 backup timer (add later if needed; the gwj-mongo IAM role already permits
# backup writes to the media bucket under mongo-backups/).

REGION="${region}"

# --- base packages ---
dnf update -y
dnf install -y docker unzip
systemctl enable --now docker

# --- ensure aws cli (AL2023 may not ship it) ---
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -q awscliv2.zip && ./aws/install)
fi

# --- mount the dedicated data volume at /data ---
DEV=""
for cand in /dev/nvme1n1 /dev/sdf /dev/xvdf; do
  for i in $(seq 1 30); do [ -b "$cand" ] && { DEV="$cand"; break; }; sleep 2; done
  [ -n "$DEV" ] && break
done
if [ -z "$DEV" ]; then echo "data volume not found" >&2; exit 1; fi
if ! blkid "$DEV" >/dev/null 2>&1; then mkfs.xfs "$DEV"; fi
mkdir -p /data
grep -q "$DEV /data" /etc/fstab || echo "$DEV /data xfs defaults,nofail 0 2" >> /etc/fstab
mount -a
mkdir -p /data/db

# --- fetch admin creds from SSM (GWJ namespace) ---
MONGO_USER="$(aws ssm get-parameter --region "$REGION" --name /gwj/mongo_admin_user --query Parameter.Value --output text)"
MONGO_PW="$(aws ssm get-parameter --region "$REGION" --name /gwj/mongo_admin_password --with-decryption --query Parameter.Value --output text)"

# --- run MongoDB 8 (auth on; data on the mounted volume) ---
# The gwj database (${db}) is created lazily on first write by the app; the root
# admin user above authenticates against the admin database.
docker rm -f mongo 2>/dev/null || true
docker run -d --name mongo --restart always \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
  -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PW" \
  -e MONGO_INITDB_DATABASE="${db}" \
  -v /data/db:/data/db \
  mongo:8 --bind_ip_all

echo "gwj-mongo bootstrap complete"
