-- Starry Battery gateway schema. Isolated from central identity D1 and H-Global D1.
-- DO NOT populate app secrets from GitHub. Admin enrollment must provision SHA-256 digests only.
CREATE TABLE IF NOT EXISTS battery_app_clients (
 app_id TEXT PRIMARY KEY NOT NULL,
 token_sha256 TEXT NOT NULL CHECK(length(token_sha256)=64),
 scopes TEXT NOT NULL DEFAULT 'balance:read',
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 rate_limit_per_minute INTEGER NOT NULL DEFAULT 120 CHECK(rate_limit_per_minute BETWEEN 1 AND 10000),
 created_at_ms INTEGER NOT NULL
);
-- Limit is scoped to each trusted Starry App, not a member account. Periodic retention pruning is required.
CREATE TABLE IF NOT EXISTS battery_app_rate_limits (
 app_id TEXT NOT NULL REFERENCES battery_app_clients(app_id),
 window_start_ms INTEGER NOT NULL,
 request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count>=0),
 PRIMARY KEY (app_id,window_start_ms)
);
CREATE INDEX IF NOT EXISTS idx_battery_app_rate_limits_cleanup ON battery_app_rate_limits(window_start_ms);
CREATE TABLE IF NOT EXISTS battery_wallets (
 user_id TEXT PRIMARY KEY NOT NULL,
 available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
);
CREATE TABLE IF NOT EXISTS battery_lots (
 lot_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 source TEXT NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0)
);
CREATE INDEX IF NOT EXISTS idx_battery_lots_fefo ON battery_lots(user_id,expires_at_ms,lot_id);
CREATE INDEX IF NOT EXISTS idx_battery_lots_expiry ON battery_lots(expires_at_ms,lot_id);
CREATE TABLE IF NOT EXISTS battery_reservations (
 reservation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 app_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('reserved','committed','released','expired')),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 deadline_at_ms INTEGER NOT NULL,
 UNIQUE(app_id,operation_id)
);
CREATE INDEX IF NOT EXISTS idx_battery_reservations_timeout ON battery_reservations(state,deadline_at_ms);
CREATE TABLE IF NOT EXISTS battery_reservation_allocations (
 reservation_id TEXT NOT NULL REFERENCES battery_reservations(reservation_id),
 lot_id TEXT NOT NULL REFERENCES battery_lots(lot_id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 PRIMARY KEY(reservation_id,lot_id)
);
CREATE TABLE IF NOT EXISTS battery_ledger (
 entry_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 app_id TEXT,
 operation_id TEXT,
 quantity_delta INTEGER NOT NULL,
 created_at_ms INTEGER NOT NULL,
 UNIQUE(app_id,operation_id)
);
