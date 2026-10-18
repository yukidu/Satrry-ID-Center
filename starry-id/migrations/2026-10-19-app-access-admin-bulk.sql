-- 2026-10-19 Starry ID centralized per-member and batch App access administration.
-- Idempotent additive-only schema. Safe alongside the already provisioned
-- runtime-managed tables. Does NOT grant, revoke, update or remove any member.
-- Keep this migration in the central schema repository for future provisioning.
-- Production execution must follow the normal backed-up migration process.

CREATE TABLE IF NOT EXISTS starry_app_access_decisions (
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('allow','deny')),
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT NOT NULL,
  PRIMARY KEY(userId,appId)
);

CREATE TABLE IF NOT EXISTS starry_app_access_operations (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  kind TEXT NOT NULL,
  sourceOperationId TEXT,
  createdAt INTEGER NOT NULL,
  revertedBy TEXT
);

CREATE TABLE IF NOT EXISTS starry_app_access_changes (
  operationId TEXT NOT NULL,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  beforeDecision TEXT,
  afterDecision TEXT,
  PRIMARY KEY(operationId,userId,appId)
);

CREATE TABLE IF NOT EXISTS starry_app_access_previews (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  kind TEXT NOT NULL,
  sourceOperationId TEXT,
  changesJson TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  consumedAt INTEGER
);

CREATE TABLE IF NOT EXISTS starry_app_access_bulk_jobs (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  mode TEXT NOT NULL,
  selectionJson TEXT NOT NULL,
  appIdsJson TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'preview','running','completed','conflict','reverting','reverted','undo_conflict'
  )),
  memberCount INTEGER NOT NULL DEFAULT 0,
  totalChanges INTEGER NOT NULL DEFAULT 0,
  doneChanges INTEGER NOT NULL DEFAULT 0,
  revertedChanges INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  confirmedAt INTEGER,
  undoPreviewAt INTEGER,
  lockUntil INTEGER,
  lastError TEXT,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS starry_app_access_bulk_items (
  jobId TEXT NOT NULL,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  beforeDecision TEXT,
  afterDecision TEXT NOT NULL CHECK(afterDecision IN ('allow','deny')),
  applied INTEGER NOT NULL DEFAULT 0,
  reverted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(jobId,userId,appId)
);

CREATE INDEX IF NOT EXISTS starry_app_access_bulk_jobs_actor
  ON starry_app_access_bulk_jobs(actorUserId,createdAt DESC);
CREATE INDEX IF NOT EXISTS starry_app_access_bulk_items_pending
  ON starry_app_access_bulk_items(jobId,applied,reverted);
