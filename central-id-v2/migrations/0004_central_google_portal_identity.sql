-- Central login baseline: same canonical table names as engineering blueprint 05 v0.2.
-- Additive-only migration, no auth from legacy sessions or imported app privileges.
CREATE TABLE IF NOT EXISTS identity_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  created_at_ms INTEGER NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version>=1),
  membership_status TEXT NOT NULL DEFAULT 'pending' CHECK(membership_status IN ('pending','approved')),
  suspended_at_ms INTEGER,
  deleted_at_ms INTEGER,
  updated_at_ms INTEGER NOT NULL,
  CHECK(deleted_at_ms IS NULL OR deleted_at_ms>=created_at_ms)
);
CREATE TABLE IF NOT EXISTS auth_provider_links (
  link_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES identity_users(user_id) ON DELETE RESTRICT,
  issuer TEXT NOT NULL CHECK(issuer IN ('google','apple')),
  provider_subject TEXT NOT NULL,
  linked_at_ms INTEGER NOT NULL,
  UNIQUE(issuer,provider_subject),
  UNIQUE(user_id,issuer)
);
CREATE INDEX IF NOT EXISTS idx_provider_links_user ON auth_provider_links(user_id);
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES identity_users(user_id) ON DELETE RESTRICT,
  brand_scope TEXT NOT NULL CHECK(brand_scope IN ('central','hglobal','starry')),
  device_scope_key TEXT,
  token_family TEXT,
  issued_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  issued_auth_version INTEGER NOT NULL,
  CHECK(expires_at_ms>issued_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_scope ON auth_sessions(user_id,brand_scope,revoked_at_ms);
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES identity_users(user_id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT,
  mobile_e164 TEXT COLLATE BINARY,
  membership_system TEXT NOT NULL DEFAULT 'none' CHECK(membership_system IN ('hglobal','other','none')),
  center_code TEXT,
  amway_number TEXT,
  location_country TEXT,
  location_region TEXT,
  location_city TEXT,
  birth_date_iso TEXT,
  motto TEXT CHECK(motto IS NULL OR length(motto)<=200),
  avatar_object_key TEXT,
  updated_at_ms INTEGER NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1 CHECK(record_version>=1),
  CHECK(mobile_e164 IS NULL OR (substr(mobile_e164,1,1)='+' AND length(mobile_e164) BETWEEN 8 AND 16)),
  CHECK(amway_number IS NULL OR (length(amway_number)=7 AND amway_number NOT GLOB '*[^0-9]*')),
  CHECK(membership_system='hglobal' OR center_code IS NULL),
  CHECK(membership_system!='none' OR amway_number IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_mobile_nonnull ON member_profiles(mobile_e164) WHERE mobile_e164 IS NOT NULL;
CREATE TABLE IF NOT EXISTS central_login_challenges (
  nonce_hash TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  CHECK(expires_at_ms>created_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_central_login_challenge_expiry ON central_login_challenges(expires_at_ms);
