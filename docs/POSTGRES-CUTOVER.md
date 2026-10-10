# MongoDB → PostgreSQL cutover, then decommissioning `gwj-mongo`

How GWJ moves from its self-managed MongoDB EC2 (`gwj-mongo`) to its own logical
database `gwj` on the shared RDS instance `oxy-postgres`, and how the Mongo host is
then destroyed. Every command is written out. **None of it has been run**: the
port PR only adds code, tests, terraform and this document.

Companion docs: `docs/DATABASE.md` (schema, mapping, conventions),
`scripts/ecs-oneshot.sh` (the one-shot runner every step below uses), and
oxy-infra's runbook 30 (`~/Oxy/oxy-infra/docs/runbooks/30-postgres-database-provisioning.md`),
which owns *how a database is created on `oxy-postgres`*. This file owns GWJ's
copy, verification, window and decommission.

All AWS commands assume:

```bash
export AWS_PROFILE=oxy AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster
```

---

## 0. What is being moved (measured 2026-10-10, read-only)

Measured by a one-off read-only Fargate task (`gwj-backend:2` with a command
override; `listDatabases`, `dbStats`, `$collStats`, `countDocuments`, field/type
histograms — no write).

| | |
|---|---|
| Host | `i-022ae8e0eff51e18d` (`t4g.small`, `10.20.1.92`, public subnet, auto-assigned public IP `54.244.163.206`), MongoDB **8.2.11** in a Docker container `mongo` |
| Volumes | root `vol-0f4c643cb40dafbfa` (20 GiB), data `vol-0198411fd50557bdf` (30 GiB, `gwj-mongo-data`) |
| Host databases | `admin`, `config`, `local`, `gwj` — only `gwj` is application data |
| `gwj` | 5 collections, **154 documents**, dataSize **624,158 B**, storage 1.2 MB + 0.55 MB indexes |
| **Backups** | **None exist.** No EBS snapshot, no DLM/AWS Backup plan, nothing under `s3://gwj-media-usw2-237343248947/mongo-backups/`. §5.1 creates the first and last one. |

| collection | docs | → table | notes |
|---|---|---|---|
| `articles` | 126 (125 published, 1 draft; all `language: en`; 18 authors) | `articles` | ids kept (24-hex ObjectId) |
| `actorkeys` | 20 | `actor_keys` | RSA keypairs, copied **verbatim**; 21 actors exist, `actualites` has never been fetched so has no key yet |
| `users` | 1 (`nate`) | `users` | id kept (it is the JWT `sub`); bcrypt hash verbatim |
| `followers` | 0 | `followers` | |
| `categories` | 7 | — **not ported** | never read by any code; equals the `CATEGORIES` tuple exactly (the copy refuses otherwise) |

Target: `oxy-postgres` (PostgreSQL 17.9, `db.m8g.large`, Multi-AZ, deletion
protection on, 14-day automated backups/PITR), ~36 GiB free. GWJ adds well under
10 MB. Runbook 30 §8 is satisfied: no storage change needed.

**Who writes GWJ data** (what the freeze in §3 must stop): the admin CMS
(`/api/admin/*`, from the frontend), the MCP server (AI agents → admin API), the
ActivityPub inbox (Follow/Undo/Delete from the fediverse), and the backend itself
(it lazily generates an actor's key the first time that actor is fetched).

### Downtime

- **Reads: none expected.** The deploy copies and verifies BEFORE the new image
  takes traffic; ECS then rolls tasks (old Mongo-backed task serves until the new
  PostgreSQL-backed one is healthy, and both hold identical data).
- **Writes: frozen ~20–30 min** — from `gwj-mcp` scale-down (§3.1) to scale-up
  (§3.7): image build (~8–12 min, arm64 under QEMU), pre-migration one-shot
  (~1–2 min), copy+verify one-shot (~1–2 min), rollout incl. ALB deregistration
  delay (~5–7 min), post-migration one-shot (~1–2 min), smoke checks (~5 min).

---

## 1. Prerequisites (any day before the window; no user impact)

### 1.1 Let `gwj-tasks-sg` reach `oxy-postgres` — **oxy-infra change**

Verified 2026-10-10: `oxy-postgres-sg` (`sg-0ccaac763ae4de9d5`) admits 5432 from
seven Oxy security groups and **not** from `gwj-tasks-sg` (`sg-03b982809fad51ca8`).
Without this, every GWJ one-shot and task times out connecting.

The rule must live in oxy-infra: `aws_security_group.postgres` declares its
ingress INLINE, so a standalone rule created from GWJ's stack would be deleted by
the next oxy-infra apply. In `~/Oxy/oxy-infra/terraform-uswest2/security.tf`:

```diff
     security_groups = [
       aws_security_group.tasks.id,
       ...
       aws_security_group.alia_computer_host.id,
+      # GWJ backend + its migration one-shots (separate GWJ terraform stack,
+      # gwj-tasks-sg). GWJ owns its own database `gwj`; it shares no data.
+      "sg-03b982809fad51ca8",
     ]
```

```bash
cd ~/Oxy/oxy-infra/terraform-uswest2
terraform plan -out tfplan      # MUST show only: aws_security_group.postgres updated in-place (one ingress source added)
terraform apply tfplan
aws ec2 describe-security-groups --group-ids sg-0ccaac763ae4de9d5 \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`5432`].UserIdGroupPairs[].GroupId'   # contains sg-03b982809fad51ca8
```

If the plan shows anything else (drift), stop and resolve it first — do not
`-target` around unexplained drift on a stack with no CI.

### 1.2 Create the role and the database (runbook 30 §2, single-role model)

GWJ has no Row Level Security, so runbook 30's **single-role** model applies: a
login role `gwj` that OWNS database `gwj`; no object grants anywhere. No
extensions are needed (full-text search uses built-in `tsvector` and the
built-in `english`/`spanish`/`french` configurations).

Generate the password and the connection string into files (never the shell
history), store them, and give the Oxy execution role a TEMPORARY copy of the
password (runbook 30 §1, `_tmp` pattern):

```bash
umask 077; WORK="$(mktemp -d)"
openssl rand -hex 16 | tr -d '\n' > "$WORK/pw"     # 32 chars [0-9a-f]: nothing to percent-encode
printf 'postgresql://gwj:%s@postgres.internal.oxy.so:5432/gwj?sslmode=require' "$(cat "$WORK/pw")" > "$WORK/url"

aws ssm put-parameter --name /gwj/DATABASE_URL --type SecureString --value "file://$WORK/url" \
  --description 'GWJ PostgreSQL connection string (database gwj on oxy-postgres).'
aws ssm put-parameter --name /oxy/_tmp/gwj-provision/GWJ_DB_PASSWORD --type SecureString --value "file://$WORK/pw"
```

`postgres.internal.oxy.so`, never the RDS endpoint; `sslmode=require`, never
`verify-full` (runbook 30 §6). `/gwj/DATABASE_URL` is SSM-only on purpose — there
is no GitHub secret and no sync line that could overwrite it (runbook 30 §6
"When SSM is the only copy").

Register a TEMPORARY one-shot task definition that runs as the master user
(`oxy-ecs-execution` may read `/oxy/*`; nothing is printed):

```bash
cat > "$WORK/provision.sh" <<'SH'
set -eu
echo "provision: start $(date -u +%FT%TZ)"
psql -v ON_ERROR_STOP=1 -At -c "select 'identity', current_database(), current_user, inet_server_addr()"
psql -v ON_ERROR_STOP=1 -At -c "select 'preexisting', (select count(*) from pg_roles where rolname = 'gwj'), (select count(*) from pg_database where datname = 'gwj')"
psql -v ON_ERROR_STOP=1 -v pw="$GWJ_DB_PASSWORD" <<'SQL'
CREATE ROLE gwj LOGIN PASSWORD :'pw';
GRANT gwj TO CURRENT_USER;
CREATE DATABASE gwj OWNER gwj;
REVOKE gwj FROM CURRENT_USER;
SQL
echo "provision: created; verifying AS THE APP ROLE (runbook 30 section 5)"
PGUSER=gwj PGPASSWORD="$GWJ_DB_PASSWORD" PGDATABASE=gwj psql -v ON_ERROR_STOP=1 -At <<'SQL'
select 'owner', datname, pg_get_userbyid(datdba) from pg_database where datname = 'gwj';
select 'whoami', current_database(), current_user;
select 'public_tables', count(*) from information_schema.tables where table_schema = 'public';
select 'ledger_absent', to_regclass('drizzle.__drizzle_migrations') is null;
create table provision_probe (x int); drop table provision_probe;
select 'can_create', true;
SQL
echo "provision: done"
SH

jq -n --rawfile script "$WORK/provision.sh" '{
  family: "oxy-gwj-pg-provision",
  requiresCompatibilities: ["FARGATE"], networkMode: "awsvpc", cpu: "256", memory: "512",
  runtimePlatform: { cpuArchitecture: "ARM64", operatingSystemFamily: "LINUX" },
  executionRoleArn: "arn:aws:iam::237343248947:role/oxy-ecs-execution",
  containerDefinitions: [{
    name: "provision", essential: true,
    image: "public.ecr.aws/docker/library/postgres:17-alpine",
    environment: [
      { name: "PGHOST", value: "postgres.internal.oxy.so" }, { name: "PGPORT", value: "5432" },
      { name: "PGDATABASE", value: "oxy_api" }, { name: "PGSSLMODE", value: "require" } ],
    secrets: [
      { name: "PGUSER",          valueFrom: "arn:aws:ssm:us-west-2:237343248947:parameter/oxy/postgres/master_user" },
      { name: "PGPASSWORD",      valueFrom: "arn:aws:ssm:us-west-2:237343248947:parameter/oxy/postgres/master_password" },
      { name: "GWJ_DB_PASSWORD", valueFrom: "arn:aws:ssm:us-west-2:237343248947:parameter/oxy/_tmp/gwj-provision/GWJ_DB_PASSWORD" } ],
    command: ["sh", "-c", $script],
    logConfiguration: { logDriver: "awslogs", options: {
      "awslogs-group": "/oxy/ecs", "awslogs-region": "us-west-2", "awslogs-stream-prefix": "gwj-pg-provision" } }
  }]
}' > "$WORK/provision-td.json"
aws ecs register-task-definition --cli-input-json "file://$WORK/provision-td.json" --query 'taskDefinition.revision'

# Run it in an OXY service's network config (oxy-tasks-sg is already admitted by the RDS SG).
NET="$(aws ecs describe-services --cluster oxy-cluster --services oxy-api --query 'services[0].networkConfiguration' --output json)"
TASK="$(aws ecs run-task --cluster oxy-cluster --task-definition oxy-gwj-pg-provision --launch-type FARGATE \
  --network-configuration "$NET" --started-by gwj-pg-provision --query 'tasks[0].taskArn' --output text)"
aws ecs wait tasks-stopped --cluster oxy-cluster --tasks "$TASK"
aws ecs describe-tasks --cluster oxy-cluster --tasks "$TASK" --query 'tasks[0].containers[0].exitCode'   # 0
aws logs get-log-events --log-group-name /oxy/ecs --log-stream-name "gwj-pg-provision/provision/${TASK##*/}" \
  --start-from-head --query 'events[].message' --output text | tr '\t' '\n'
```

Expected log (do not proceed on anything else):

```
provision: start …
identity|oxy_api|oxyadmin|…
preexisting|0|0
provision: created; verifying AS THE APP ROLE (runbook 30 section 5)
owner|gwj|gwj                  ← datdba is the APP role, not oxyadmin
whoami|gwj|gwj
public_tables|0
ledger_absent|t
can_create|t
provision: done
```

Clean up the temporary pieces immediately:

```bash
aws ecs deregister-task-definition --task-definition oxy-gwj-pg-provision:1 >/dev/null
aws ssm delete-parameter --name /oxy/_tmp/gwj-provision/GWJ_DB_PASSWORD
shred -u "$WORK/pw" "$WORK/url" && rm -rf "$WORK"
```

### 1.3 Apply GWJ's terraform — additive phase only

From a checkout of the port PR's head (its `infra/` is what main will hold after
the merge). This (a) imports the parameter created in 1.2, (b) adds
`DATABASE_URL` to the backend task definition **next to** `MONGO_URI` (the
running Mongo image ignores `DATABASE_URL`; the new image ignores `MONGO_URI`),
and (c) lets the deploy role run the migration one-shots.

```bash
cd infra
terraform init
terraform import aws_ssm_parameter.database_url /gwj/DATABASE_URL
terraform plan -out tfplan
```

The plan must be exactly (measured on 2026-10-10 before the import, when it also
showed `aws_ssm_parameter.database_url will be created` — after the import that
line must be GONE):

```
# aws_ecs_task_definition.backend must be replaced      (new revision: + DATABASE_URL secret)
# aws_ecs_service.backend will be updated in-place       (points at the new revision)
# aws_iam_role_policy.github_deploy will be updated in-place
Plan: 1 to add, 2 to change, 1 to destroy.
```

```bash
terraform apply tfplan
aws ecs wait services-stable --cluster oxy-cluster --services gwj-backend   # a normal rolling restart, same Mongo image
# Runbook 30 §6 hop 4: read what the service RUNS, not what terraform says
aws ecs describe-task-definition --task-definition "$(aws ecs describe-services --cluster oxy-cluster \
  --services gwj-backend --query 'services[0].taskDefinition' --output text)" \
  --query 'taskDefinition.containerDefinitions[0].secrets[].name'
# → ["DATABASE_URL", "MONGO_URI", "JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD", "TELEGRAM_BOT_TOKEN"]
```

### 1.4 Prove the network path from GWJ's own security group

```bash
scripts/ecs-oneshot.sh gwj-backend pg-reachability -- bun -e "
const s = require('net').connect(5432, 'postgres.internal.oxy.so');
s.setTimeout(10000, () => { console.log('pg tcp TIMEOUT'); process.exit(1) });
s.on('connect', () => { console.log('pg tcp ok'); process.exit(0) });
s.on('error', (e) => { console.log('pg tcp FAIL', e.message); process.exit(1) });"
# → "pg tcp ok", exitCode=0
```

### 1.5 Record the federation identity to compare after the switch

```bash
curl -fsS -H 'Accept: application/activity+json' https://globalworldjournal.com/users/news \
  | jq -r .publicKey.publicKeyPem | sha256sum | tee ~/gwj-news-pubkey.before
curl -fsS 'https://api.globalworldjournal.com/api/articles?limit=1' | jq .pagination.total   # published count (125 on 2026-10-10)
```

---

## 2. What the merge deploys

`deploy-aws.yml` on the merge commit, backend leg:

1. build + push `gwj-backend:<sha>` and `:latest`;
2. **`migrate.ts --phase=pre --target-database=gwj`** as a one-shot → creates the schema (`0000_init`);
3. **only while repo variable `GWJ_PG_CUTOVER` = `copy`:** `mongo-migration copy` as a
   one-shot → copies all four collections in ONE transaction, then verifies by
   count + checksum, prints `MIGRATION_VERDICT=PASS|FAIL`, non-zero exit on FAIL;
4. `update-service --force-new-deployment` → `wait services-stable`;
5. **`migrate.ts --phase=post`** (nothing to do in this release).

A failure in 2 or 3 stops the job **before** step 4: the Mongo-backed service
keeps serving and nothing has switched.

---

## 3. The window

### 3.1 Freeze writes

```bash
aws ecs update-service --cluster oxy-cluster --service gwj-mcp --desired-count 0 >/dev/null
aws ecs wait services-stable --cluster oxy-cluster --services gwj-mcp      # agents can no longer write
```

The owner stops CMS edits until 3.7. ActivityPub follows cannot be stopped; with
0 followers ever recorded they are not expected, and 3.5 detects one.

### 3.2 Arm the one-time copy

```bash
gh variable set GWJ_PG_CUTOVER --body copy -R GlobalWorldJournal/GWJ
```

### 3.3 Merge and watch

```bash
gh pr merge <PR> -R GlobalWorldJournal/GWJ --merge
RUN="$(gh run list -R GlobalWorldJournal/GWJ --workflow deploy-aws.yml -L 1 --json databaseId -q '.[0].databaseId')"
gh run watch "$RUN" -R GlobalWorldJournal/GWJ --exit-status
gh run view "$RUN" -R GlobalWorldJournal/GWJ --log | grep -E 'applied migrations|MIGRATION |MIGRATION_VERDICT|exitCode='
```

The backend leg must show, in order:

- `applied migrations … ["0000_init"]`
- `MIGRATION {"event":"source-count","collection":"articles","documents":126}` (and users 1, actorkeys 20–21, followers ≥0)
- `MIGRATION {"event":"copied","table":"articles","inserted":126,…}` …
- four `MIGRATION {"event":"verify",…,"match":true}` lines whose source and target `checksum`s are equal
- `MIGRATION_VERDICT=PASS`, `exitCode=0`
- `no migrations to apply` (post phase)

If the copy step fails, the deploy stops there and Mongo keeps serving: read the
`fail-reason` / `error` lines, fix, and re-run the workflow
(`gh workflow run deploy-aws.yml -R GlobalWorldJournal/GWJ --ref main`). The copy
is idempotent and converges; it refuses — never overwrites — if PostgreSQL holds
something Mongo does not.

### 3.4 Disarm

```bash
gh variable delete GWJ_PG_CUTOVER -R GlobalWorldJournal/GWJ
```

### 3.5 Verify the switch

```bash
# a) Mongo (still frozen) and PostgreSQL (now serving) are identical, by content.
scripts/ecs-oneshot.sh gwj-backend pg-verify -- \
  bun run /app/packages/mongo-migration/src/cli.ts verify --source-database=gwj --target-database=gwj
#   → MIGRATION_VERDICT=PASS. An `onlyInTarget` row means PostgreSQL received a write
#     after the switch (e.g. a Follow, or the first fetch of `actualites` minting its
#     key) — expected and fine. An `onlyInSource`/`changed` row means a write reached
#     MONGO between copy and switch: re-run `copy` (source-newer rows converge).

# b) The service runs the new image, on the new schema.
aws ecs describe-services --cluster oxy-cluster --services gwj-backend \
  --query 'services[0].{td:taskDefinition,running:runningCount,deployments:length(deployments)}'
aws logs tail /gwj/ecs --since 20m --log-stream-name-prefix gwj-backend --filter-pattern '"postgres connected"'

# c) Reader + API smoke.
curl -fsS https://api.globalworldjournal.com/healthz
curl -fsS 'https://api.globalworldjournal.com/api/articles?limit=1' | jq .pagination.total      # = the 1.5 value
curl -fsS 'https://api.globalworldjournal.com/api/search?q=market' | jq '.pagination.total, .data[0].slug'
SLUG="$(curl -fsS 'https://api.globalworldjournal.com/api/articles?limit=1' | jq -r '.data[0].slug')"
curl -fsS "https://api.globalworldjournal.com/api/articles/$SLUG" | jq '.id, .publishedAt'
curl -fsS https://api.globalworldjournal.com/api/categories | jq length                         # 7

# d) Federation identity unchanged (keys were copied, not regenerated).
curl -fsS -H 'Accept: application/activity+json' https://globalworldjournal.com/users/news \
  | jq -r .publicKey.publicKeyPem | sha256sum | diff - ~/gwj-news-pubkey.before && echo "news key unchanged"
curl -fsS -H 'Accept: application/activity+json' https://globalworldjournal.com/users/news/outbox | jq .totalItems

# e) Admin auth (what the MCP server does) against the copied user row.
curl -fsS -X POST https://api.globalworldjournal.com/api/auth/login -H 'content-type: application/json' \
  -d "$(jq -n --arg u nate --arg p "$(aws ssm get-parameter --name /gwj/ADMIN_PASSWORD --with-decryption \
        --query Parameter.Value --output text)" '{username:$u,password:$p}')" | jq -r '.user.username'   # nate

# f) No errors since the switch.
aws logs tail /gwj/ecs --since 20m --filter-pattern '"level":"error"'
```

### 3.6 Rollback (only BEFORE 3.7)

Mongo has received no writes since 3.1 and is untouched by the copy, so going back
is lossless until writes resume:

```bash
git revert -m 1 <merge-sha> && git push origin main   # redeploys the Mongo image; MONGO_URI is still in the task definition
```

After 3.7, PostgreSQL is the only store being written; there is no reverse copy.
Fix forward.

### 3.7 Unfreeze

```bash
aws ecs update-service --cluster oxy-cluster --service gwj-mcp --desired-count 1 >/dev/null
aws ecs wait services-stable --cluster oxy-cluster --services gwj-mcp
```

---

## 4. Soak (recommended: 7 days)

Leave `gwj-mongo` running and untouched. Nothing reads or writes it any more
(the new image has no Mongo code; only the cutover tool could, and its variable
is deleted). Watch `/gwj/ecs` for errors and the site for anomalies.

---

## 5. Decommission `gwj-mongo`

### 5.1 Final archive (the first and only backup that will exist)

Dump on the instance itself via SSM Run Command (no SSH; the instance role
`gwj-mongo` may read `/gwj/mongo_*` and write `s3://…/mongo-backups/*`). Nothing
is echoed; credentials stay in variables.

```bash
DATE="$(date -u +%F)"
cat > /tmp/gwj-final-dump.sh <<SH
set -euo pipefail
df -h / /data
W=/data/final-archive-$DATE; mkdir -p "\$W"
U="\$(aws ssm get-parameter --region us-west-2 --name /gwj/mongo_admin_user --query Parameter.Value --output text)"
P="\$(aws ssm get-parameter --region us-west-2 --name /gwj/mongo_admin_password --with-decryption --query Parameter.Value --output text)"
docker exec mongo mongodump --quiet -u "\$U" -p "\$P" --authenticationDatabase admin --db gwj --archive --gzip > "\$W/gwj.archive.gz"
docker exec mongo mongosh --quiet -u "\$U" -p "\$P" --authenticationDatabase admin gwj --eval \
  'JSON.stringify(Object.fromEntries(db.getCollectionNames().sort().map(c => [c, db.getCollection(c).countDocuments()])))' > "\$W/counts-at-dump.json"
# Restore into a THROWAWAY container and count independently (an exit code is not a verification).
docker run -d --rm --name gwj-restore-test mongo:8 >/dev/null; sleep 15
docker exec -i gwj-restore-test mongorestore --quiet --archive --gzip < "\$W/gwj.archive.gz"
docker exec gwj-restore-test mongosh --quiet gwj --eval \
  'JSON.stringify(Object.fromEntries(db.getCollectionNames().sort().map(c => [c, db.getCollection(c).countDocuments()])))' > "\$W/counts-after-restore.json"
docker stop gwj-restore-test >/dev/null
diff "\$W/counts-at-dump.json" "\$W/counts-after-restore.json" && echo "restore-count-match"
cat "\$W/counts-at-dump.json"
(cd "\$W" && sha256sum gwj.archive.gz counts-at-dump.json counts-after-restore.json > SHA256SUMS)
aws s3 cp --recursive "\$W" "s3://gwj-media-usw2-237343248947/mongo-backups/final-$DATE/"
# Round trip: what is in S3 is what was hashed.
mkdir -p "\$W/rt" && aws s3 cp --recursive "s3://gwj-media-usw2-237343248947/mongo-backups/final-$DATE/" "\$W/rt/" \
  && (cd "\$W/rt" && sha256sum -c SHA256SUMS)
SH
CMD="$(aws ssm send-command --instance-ids i-022ae8e0eff51e18d --document-name AWS-RunShellScript \
  --parameters "$(jq -n --rawfile s /tmp/gwj-final-dump.sh '{commands: [$s]}')" \
  --comment "gwj final mongo archive" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --command-id "$CMD" --instance-id i-022ae8e0eff51e18d
aws ssm get-command-invocation --command-id "$CMD" --instance-id i-022ae8e0eff51e18d \
  --query '{status:Status,out:StandardOutputContent,err:StandardErrorContent}'
```

Required in the output: `restore-count-match`, the counts JSON (articles/users/
actorkeys/followers/categories matching §0 or the 3.3 log), and `OK` for all three
files from `sha256sum -c`. Optionally also copy the S3 prefix to the offline vault.

### 5.2 Final EBS snapshot of the data volume

```bash
SNAP="$(aws ec2 create-snapshot --volume-id vol-0198411fd50557bdf \
  --description "gwj-mongo data, final before decommission $(date -u +%F)" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=gwj-mongo-final},{Key=Project,Value=gwj},{Key=Repo,Value=GWJ}]' \
  --query SnapshotId --output text)"
aws ec2 wait snapshot-completed --snapshot-ids "$SNAP"
aws ec2 describe-snapshots --snapshot-ids "$SNAP" --query 'Snapshots[0].{id:SnapshotId,state:State,size:VolumeSize}'
```

Re-describe it AFTER 5.4 to prove it survived (Oxy's own Mongo retirement
recorded a "kept" snapshot that turned out not to exist — runbook 31).

### 5.3 The decommission PR

One PR, merged and applied together — an `infra/` removal committed but not
applied is a loaded gun for the next unrelated `terraform apply`.

| file | change |
|---|---|
| `packages/mongo-migration/` | delete the package |
| `packages/backend/Dockerfile` | drop the two `mongo-migration` COPY lines |
| `.github/workflows/deploy-aws.yml` | drop the "Cutover — copy MongoDB…" step |
| `bun.lock` | `bun install` |
| `infra/ecs.tf` | drop the `MONGO_URI` secret |
| `infra/ssm.tf` | drop `aws_ssm_parameter.mongo_uri`, `.mongo_admin_user`, `.mongo_admin_password`, `random_password.mongo` |
| `infra/mongo.tf`, `infra/files/mongo-userdata.sh` | delete |
| `infra/iam.tf` | drop `aws_iam_role.mongo`, `aws_iam_role_policy_attachment.mongo_ssm_core`, `aws_iam_role_policy.mongo_ec2`, `aws_iam_instance_profile.mongo`, both `mongo_*` policy documents |
| `infra/network.tf` | drop `aws_security_group.mongo` |
| `infra/outputs.tf` | drop `mongo_private_ip`, `mongo_instance_id` |
| `infra/data.tf` | drop `data.aws_subnet.oxy_public_a` and `data.aws_ssm_parameter.al2023_arm` (grep first: only `mongo.tf` uses them) |
| `AGENTS.md`, `docs/INFRA.md`, `infra/README.md`, this file | remove the transitional notes |

```bash
grep -rn -i 'mongo' --exclude-dir=node_modules --exclude-dir=.git . | grep -v 'docs/superpowers/'   # residual: this runbook's history only
cd infra && terraform plan -out tfplan
```

The plan must be exactly these destroys plus the task-definition roll:

```
# aws_instance.mongo will be destroyed
# aws_volume_attachment.mongo_data will be destroyed
# aws_ebs_volume.mongo_data will be destroyed            ← the data volume; 5.2 must be completed first
# aws_security_group.mongo will be destroyed
# aws_iam_instance_profile.mongo will be destroyed
# aws_iam_role.mongo will be destroyed
# aws_iam_role_policy.mongo_ec2 will be destroyed
# aws_iam_role_policy_attachment.mongo_ssm_core will be destroyed
# aws_ssm_parameter.mongo_uri will be destroyed           (/gwj/MONGO_URI)
# aws_ssm_parameter.mongo_admin_user will be destroyed     (/gwj/mongo_admin_user)
# aws_ssm_parameter.mongo_admin_password will be destroyed (/gwj/mongo_admin_password)
# random_password.mongo will be destroyed
# aws_ecs_task_definition.backend must be replaced         (− MONGO_URI)
# aws_ecs_service.backend will be updated in-place
```

Order: merge the PR (the deploy rebuilds an image without the copy tool), then
`terraform apply tfplan`. The backend no longer reads `MONGO_URI`, so removing it
is safe; the root volume is deleted with the instance (`DeleteOnTermination`).

### 5.4 Prove it is gone

```bash
aws ec2 describe-instances --instance-ids i-022ae8e0eff51e18d --query 'Reservations[0].Instances[0].State.Name'   # terminated
aws ec2 describe-volumes --volume-ids vol-0198411fd50557bdf vol-0f4c643cb40dafbfa 2>&1 | grep -c InvalidVolume.NotFound
for p in /gwj/MONGO_URI /gwj/mongo_admin_user /gwj/mongo_admin_password; do
  aws ssm get-parameter --name "$p" 2>&1 | grep -q ParameterNotFound && echo "$p gone"; done
aws ec2 describe-security-groups --filters Name=group-name,Values=gwj-mongo-sg --query 'length(SecurityGroups)'   # 0
aws iam get-role --role-name gwj-mongo 2>&1 | grep -q NoSuchEntity && echo "role gone"
aws ecs describe-task-definition --task-definition "$(aws ecs describe-services --cluster oxy-cluster \
  --services gwj-backend --query 'services[0].taskDefinition' --output text)" \
  --query 'taskDefinition.containerDefinitions[0].secrets[].name'          # no MONGO_URI
aws ec2 describe-snapshots --snapshot-ids "$SNAP" --query 'Snapshots[0].State'   # completed — still there
aws s3 ls "s3://gwj-media-usw2-237343248947/mongo-backups/final-$DATE/"          # 4 objects
gh secret list -R GlobalWorldJournal/GWJ    # no MONGO_URI (none existed on 2026-10-10)
gh variable list -R GlobalWorldJournal/GWJ  # no GWJ_PG_CUTOVER
```

### 5.5 Backups from here on

`gwj` is covered by `oxy-postgres`'s automated backups (14-day retention, PITR,
Multi-AZ, deletion protection — measured 2026-10-10). The final Mongo archive
(S3, a few hundred KB, no lifecycle rule on that prefix) and the EBS snapshot
(5.2) are the only copies of the Mongo era; the snapshot's retention (e.g. delete
after 90 days: `aws ec2 delete-snapshot --snapshot-id "$SNAP"`) is the owner's call.

---

## 6. Risks and how each is covered

| risk | covered by |
|---|---|
| A field dropped in translation | the copy refuses any document field with no target column, and verification hashes EVERY stored field of every document against the PostgreSQL row |
| Copy runs against the wrong database | `--source-database`/`--target-database` are required and asserted (`listDatabases`; `current_database()`) |
| Copy overwrites post-switch writes | refuses if PostgreSQL has a row Mongo lacks or a row newer than Mongo's; everything happens in one locked transaction |
| New image serves an empty database | the copy runs BEFORE the rollout in the same job; the backend refuses to boot on an unmigrated schema |
| A write reaches Mongo between copy and switch | the freeze; 3.5(a) detects it; re-running `copy` converges |
| Federation identity changes | actor keys copied verbatim (PEM shape asserted); article ids preserved, so every Note id is unchanged; 3.5(d) checks |
| `actualites` key minted on both sides during the rollout | it has no key yet; only a fetch of exactly that actor in the ~5 min rollout could do it; 3.5(a) shows it; resolve by keeping the PostgreSQL row |
| A missing index | asserted by name in `schema.realdb.test.ts` |
| Search behaves differently | Mongo `$text` semantics ported (OR terms, phrases, negation, title+deck only, per-row language stemming, English query parsing) and pinned by tests; see `docs/DATABASE.md` |
| Archive that does not restore | 5.1 restores it into a throwaway container and compares counts; SHA-256 round trip through S3 |
