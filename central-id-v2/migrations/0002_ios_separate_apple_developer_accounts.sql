-- 2026-10-23 | iOS storefront account split (supersedes Apple single-account phase-one plan)
-- D1 central_id_v2 + isolated Preview. Metadata only; no member or Apple API secrets.
-- Apple Team IDs / App Store Connect URLs / live listing URLs remain NULL until independently verified.
CREATE TABLE IF NOT EXISTS ios_starry_release_links (
  app_key TEXT PRIMARY KEY,
  app_name TEXT NOT NULL,
  developer_account_slug TEXT NOT NULL DEFAULT 'starry.phd'
    CHECK(developer_account_slug='starry.phd'),
  bundle_id TEXT UNIQUE,
  apple_team_id TEXT,
  app_store_app_id TEXT UNIQUE,
  app_store_connect_url TEXT
    CHECK(app_store_connect_url IS NULL OR app_store_connect_url LIKE 'https://appstoreconnect.apple.com/%'),
  app_store_public_url TEXT
    CHECK(app_store_public_url IS NULL OR app_store_public_url LIKE 'https://apps.apple.com/%'),
  listing_status TEXT NOT NULL DEFAULT 'planned'
    CHECK(listing_status IN ('planned','preparing','submitted','approved','published','removed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK(app_key <> '')
);

CREATE TABLE IF NOT EXISTS ios_hglobal_release_links (
  app_key TEXT PRIMARY KEY,
  app_name TEXT NOT NULL,
  developer_account_slug TEXT NOT NULL DEFAULT 'hglobal1985'
    CHECK(developer_account_slug='hglobal1985'),
  bundle_id TEXT UNIQUE,
  apple_team_id TEXT,
  app_store_app_id TEXT UNIQUE,
  app_store_connect_url TEXT
    CHECK(app_store_connect_url IS NULL OR app_store_connect_url LIKE 'https://appstoreconnect.apple.com/%'),
  app_store_public_url TEXT
    CHECK(app_store_public_url IS NULL OR app_store_public_url LIKE 'https://apps.apple.com/%'),
  listing_status TEXT NOT NULL DEFAULT 'planned'
    CHECK(listing_status IN ('planned','preparing','submitted','approved','published','removed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK(app_key <> '')
);

-- Public store listings cannot be marked published with no verified App Store URL.
CREATE TRIGGER IF NOT EXISTS ios_starry_public_url_required_insert
BEFORE INSERT ON ios_starry_release_links
WHEN NEW.listing_status='published' AND NEW.app_store_public_url IS NULL
BEGIN SELECT RAISE(ABORT,'published iOS listing requires an App Store URL'); END;
CREATE TRIGGER IF NOT EXISTS ios_starry_public_url_required_update
BEFORE UPDATE ON ios_starry_release_links
WHEN NEW.listing_status='published' AND NEW.app_store_public_url IS NULL
BEGIN SELECT RAISE(ABORT,'published iOS listing requires an App Store URL'); END;
CREATE TRIGGER IF NOT EXISTS ios_hglobal_public_url_required_insert
BEFORE INSERT ON ios_hglobal_release_links
WHEN NEW.listing_status='published' AND NEW.app_store_public_url IS NULL
BEGIN SELECT RAISE(ABORT,'published iOS listing requires an App Store URL'); END;
CREATE TRIGGER IF NOT EXISTS ios_hglobal_public_url_required_update
BEFORE UPDATE ON ios_hglobal_release_links
WHEN NEW.listing_status='published' AND NEW.app_store_public_url IS NULL
BEGIN SELECT RAISE(ABORT,'published iOS listing requires an App Store URL'); END;

CREATE INDEX IF NOT EXISTS idx_ios_starry_listing_status ON ios_starry_release_links(listing_status);
CREATE INDEX IF NOT EXISTS idx_ios_hglobal_listing_status ON ios_hglobal_release_links(listing_status);
