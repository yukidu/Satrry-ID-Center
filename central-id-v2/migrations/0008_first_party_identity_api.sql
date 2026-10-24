-- 0008: Central-only first-party identity API. Additive to 0004, not Battery D1.
-- This protocol exposes ONLY the caller's own minimum central identity after
-- a nonce-bound Google identity proof. No cross-user lookup or grants.
CREATE TABLE IF NOT EXISTS central_app_login_challenges (
 nonce_sha256 TEXT PRIMARY KEY NOT NULL
  CHECK(length(nonce_sha256)=64 AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 app_id TEXT NOT NULL CHECK(app_id IN ('hglobal-web','starry-web')),
 request_origin TEXT NOT NULL CHECK(request_origin IN
  ('https://id.hglobal1985.com','https://hglobal1985.com',
   'https://starry.phd','https://echo.starry.phd')),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL,
 consumed_at_ms INTEGER,
 CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=600000),
 CHECK(consumed_at_ms IS NULL OR consumed_at_ms>=issued_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_central_app_challenge_expiry
 ON central_app_login_challenges(expires_at_ms);

CREATE TABLE IF NOT EXISTS central_app_access_tokens (
 token_sha256 TEXT PRIMARY KEY NOT NULL
  CHECK(length(token_sha256)=64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
 user_id TEXT NOT NULL REFERENCES identity_users(user_id) ON DELETE RESTRICT,
 app_id TEXT NOT NULL CHECK(app_id IN ('hglobal-web','starry-web')),
 source_nonce_sha256 TEXT NOT NULL
  REFERENCES central_app_login_challenges(nonce_sha256) ON DELETE RESTRICT,
 issued_auth_version INTEGER NOT NULL CHECK(issued_auth_version>=1),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL,
 revoked_at_ms INTEGER,
 CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 CHECK(revoked_at_ms IS NULL OR revoked_at_ms>=issued_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_central_app_tokens_member
 ON central_app_access_tokens(user_id,revoked_at_ms);
CREATE INDEX IF NOT EXISTS idx_central_app_tokens_expiry
 ON central_app_access_tokens(expires_at_ms);
