-- Starry ID 中央會員中心 / Cloudflare D1
-- Phase 1: 從 EchoStars 抽離共用會員身份與固定基本資料。
-- 原則：中央會員資料只有一份；App 專屬權限與行為資料放 app_memberships 或原 App DB。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  primaryEmail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users(LOWER(TRIM(primaryEmail)));
CREATE INDEX IF NOT EXISTS users_status ON users(status);

CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  providerSubject TEXT NOT NULL,
  userId TEXT NOT NULL,
  providerEmail TEXT,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  lastSeenAt INTEGER,
  PRIMARY KEY(provider, providerSubject),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(userId);
CREATE INDEX IF NOT EXISTS identities_provider_email ON identities(provider, LOWER(TRIM(providerEmail)));

CREATE TABLE IF NOT EXISTS profiles (
  userId TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  googleAvatar TEXT,
  amwayId TEXT,
  phone TEXT,
  residence TEXT,
  center TEXT,
  rank TEXT,
  approvedRank TEXT,
  rankApproved INTEGER NOT NULL DEFAULT 0,
  rankAuditStatus TEXT,
  rankAuditType TEXT,
  rankUpdatedAt TEXT,
  joinReason TEXT,
  stayReason TEXT,
  birthday TEXT,
  motto TEXT,
  zodiac TEXT,
  talentNumber INTEGER,
  lifeNumber INTEGER,
  registerDate TEXT,
  auditedBy TEXT,
  auditedAt TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profiles_amway_id ON profiles(amwayId);
CREATE INDEX IF NOT EXISTS profiles_rank ON profiles(rank);

-- 推薦人 / 白金上線 / 鑽石上線等跨 App 共用關係。
-- 初次搬移時若舊資料只有姓名字串，先保留 legacyLabel，不猜測同名會員。
CREATE TABLE IF NOT EXISTS member_relationships (
  userId TEXT NOT NULL,
  relationType TEXT NOT NULL CHECK(relationType IN ('sponsor','platinum_upline','diamond_upline')),
  relatedUserId TEXT,
  legacyLabel TEXT,
  resolutionStatus TEXT NOT NULL DEFAULT 'unresolved',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, relationType),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(relatedUserId) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS member_relationships_related ON member_relationships(relatedUserId);

-- App 專屬身份與權限不污染中央 profile。
CREATE TABLE IF NOT EXISTS app_memberships (
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  role TEXT,
  isAdminUser INTEGER NOT NULL DEFAULT 0,
  isContributor INTEGER NOT NULL DEFAULT 0,
  canUpload INTEGER NOT NULL DEFAULT 0,
  joinedAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, appId),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS app_memberships_app ON app_memberships(appId, status);

-- Starry ID server session。瀏覽器只拿到 raw token，D1 僅保存 SHA-256 hash。
CREATE TABLE IF NOT EXISTS auth_sessions (
  tokenHash TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(userId);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expiresAt);

-- v211：每位會員一組電子名片編號與目前公開網址後綴。
-- 非安麗會員預設使用 n1、n2...；若有 Amway ID，應用層會讓 slug 跟著 Amway ID 更新。
CREATE TABLE IF NOT EXISTS public_cards (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  cardNumber TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS public_cards_slug ON public_cards(slug);
CREATE UNIQUE INDEX IF NOT EXISTS public_cards_number ON public_cards(cardNumber);

-- 若會員手動把電子名片編號改成較大的 n 編號，立即把 AUTOINCREMENT 水位推到該編號。
-- 這樣未來新會員自動配號會從更大的號碼開始，不會撞到已被手動占用的編號。
UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE((
    SELECT MAX(CAST(SUBSTR(cardNumber, 2) AS INTEGER))
    FROM public_cards
    WHERE cardNumber GLOB 'n[0-9]*'
      AND SUBSTR(cardNumber, 2) NOT GLOB '*[^0-9]*'
      AND LENGTH(SUBSTR(cardNumber, 2)) > 0
  ), 0)
)
WHERE name = 'public_cards';

CREATE TRIGGER IF NOT EXISTS public_cards_bump_sequence
AFTER UPDATE OF cardNumber ON public_cards
WHEN NEW.cardNumber GLOB 'n[0-9]*'
  AND SUBSTR(NEW.cardNumber, 2) NOT GLOB '*[^0-9]*'
  AND LENGTH(SUBSTR(NEW.cardNumber, 2)) > 0
BEGIN
  UPDATE sqlite_sequence
  SET seq = MAX(seq, CAST(SUBSTR(NEW.cardNumber, 2) AS INTEGER))
  WHERE name = 'public_cards';
END;

-- v211：電子名片每個欄位獨立公開／隱藏；未建立資料列時由應用層套預設值。
-- 預設全部公開，只有手機與生日預設隱藏。
CREATE TABLE IF NOT EXISTS profile_field_visibility (
  userId TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  isVisible INTEGER NOT NULL DEFAULT 1,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, fieldName),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profile_field_visibility_user ON profile_field_visibility(userId);

-- 保留舊系統 ID，讓既有播放、收藏、學習紀錄不需要重寫 owner id。
CREATE TABLE IF NOT EXISTS legacy_links (
  sourceApp TEXT NOT NULL,
  sourceUserId TEXT NOT NULL,
  userId TEXT NOT NULL,
  sourceEmail TEXT,
  importedAt INTEGER NOT NULL,
  PRIMARY KEY(sourceApp, sourceUserId),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS legacy_links_user ON legacy_links(userId);

-- 所有中央基本資料修改都留下異動紀錄。
CREATE TABLE IF NOT EXISTS profile_audit_logs (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  actorUserId TEXT,
  fieldName TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profile_audit_logs_user_created ON profile_audit_logs(userId, createdAt DESC);
CREATE INDEX IF NOT EXISTS profile_audit_logs_app_created ON profile_audit_logs(appId, createdAt DESC);

-- Migration 可重跑、可追蹤、可查錯，不直接刪除來源資料。
CREATE TABLE IF NOT EXISTS migration_batches (
  id TEXT PRIMARY KEY,
  sourceApp TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  scannedCount INTEGER NOT NULL DEFAULT 0,
  migratedCount INTEGER NOT NULL DEFAULT 0,
  skippedCount INTEGER NOT NULL DEFAULT 0,
  issueCount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS migration_issues (
  id TEXT PRIMARY KEY,
  batchId TEXT NOT NULL,
  sourceApp TEXT NOT NULL,
  sourceUserId TEXT,
  issueType TEXT NOT NULL,
  details TEXT,
  createdAt INTEGER NOT NULL,
  resolvedAt INTEGER,
  FOREIGN KEY(batchId) REFERENCES migration_batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS migration_issues_batch ON migration_issues(batchId, issueType);
