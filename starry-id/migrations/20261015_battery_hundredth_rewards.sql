-- v255: Starry.phd click-to-blast rewards need 0.01 battery precision.
-- Existing Starry battery accounting remains at 0.1 precision. Every ten
-- hundredth rewards are promoted into one legacy battery unit by the runtime.

CREATE TABLE IF NOT EXISTS battery_hundredth_transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deltaHundredths INTEGER NOT NULL,
  sourceApp TEXT NOT NULL DEFAULT 'starryphd',
  sourceId TEXT,
  description TEXT NOT NULL,
  uniqueKey TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS battery_hundredth_user_history
  ON battery_hundredth_transactions(userId, createdAt DESC, id DESC);
CREATE INDEX IF NOT EXISTS battery_hundredth_source
  ON battery_hundredth_transactions(sourceApp, sourceId);
