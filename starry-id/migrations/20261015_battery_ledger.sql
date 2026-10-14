-- Starry ID 中央 D1：跨 App 電池總帳
-- 正式 D1 已由 Echo-Starry 建立並使用；本 migration 將既有正式結構收斂進中央資料庫 Repo。
-- 全部使用 IF NOT EXISTS，可安全重跑，不修改既有餘額或交易。

CREATE TABLE IF NOT EXISTS battery_transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deltaUnits INTEGER NOT NULL,
  balanceAfterUnits INTEGER NOT NULL,
  type TEXT NOT NULL,
  sourceApp TEXT NOT NULL DEFAULT 'echostars',
  sourceId TEXT,
  description TEXT NOT NULL,
  actorUserId TEXT,
  uniqueKey TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  trackId TEXT,
  commentId TEXT,
  relatedUserId TEXT,
  sourceLabel TEXT
);
CREATE INDEX IF NOT EXISTS battery_transactions_user_history
  ON battery_transactions(userId,createdAt DESC,id DESC);
CREATE INDEX IF NOT EXISTS battery_transactions_user_cursor
  ON battery_transactions(userId);
CREATE INDEX IF NOT EXISTS battery_transactions_source
  ON battery_transactions(sourceApp,sourceId,type);
CREATE INDEX IF NOT EXISTS battery_transactions_actor_history
  ON battery_transactions(actorUserId,createdAt DESC,id DESC);

CREATE TABLE IF NOT EXISTS battery_accounts (
  userId TEXT PRIMARY KEY,
  balanceUnits INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS battery_migration_state (
  sourceApp TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  sourceCount INTEGER NOT NULL DEFAULT 0,
  migratedCount INTEGER NOT NULL DEFAULT 0,
  sourceBalanceUnits INTEGER NOT NULL DEFAULT 0,
  centralBalanceUnits INTEGER NOT NULL DEFAULT 0,
  sourceMaxRowId INTEGER NOT NULL DEFAULT 0,
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  updatedAt INTEGER NOT NULL
);
