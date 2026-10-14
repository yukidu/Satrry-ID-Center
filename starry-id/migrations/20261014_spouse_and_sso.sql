-- Starry ID 中央 D1：夫妻關係、非直銷商編號與跨 App 一次性登入票券
-- 來源：Echo-Starry v233 runtime schema，正式收斂為 migration。

CREATE TABLE IF NOT EXISTS spouse_links (
  id TEXT PRIMARY KEY,
  userA TEXT NOT NULL,
  userB TEXT NOT NULL,
  status TEXT NOT NULL,
  requestedBy TEXT NOT NULL,
  unlinkRequestedBy TEXT,
  keepUserId TEXT,
  replacement TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spouse_links_a ON spouse_links(userA,status);
CREATE INDEX IF NOT EXISTS spouse_links_b ON spouse_links(userB,status);

CREATE TABLE IF NOT EXISTS spouse_slots (
  userId TEXT PRIMARY KEY,
  linkId TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS non_distributor_ids (
  userId TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS non_distributor_history (
  userId TEXT PRIMARY KEY,
  lastNumber TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS starry_app_auth_codes (
  codeHash TEXT PRIMARY KEY,
  appId TEXT NOT NULL,
  userId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_app_auth_codes_expiry
  ON starry_app_auth_codes(expiresAt);
