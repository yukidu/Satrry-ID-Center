-- v230: Starry ID 通知、電子名片瀏覽紀錄與 Web Push

CREATE TABLE IF NOT EXISTS starry_notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  isRead INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_notifications_user_time
  ON starry_notifications(userId,createdAt DESC);

CREATE TABLE IF NOT EXISTS card_visit_events (
  id TEXT PRIMARY KEY,
  ownerUserId TEXT NOT NULL,
  viewerUserId TEXT,
  viewerName TEXT NOT NULL DEFAULT '',
  viewerRank TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  deviceOs TEXT NOT NULL DEFAULT '',
  userAgent TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS card_visit_events_owner_time
  ON card_visit_events(ownerUserId,createdAt DESC);

CREATE TABLE IF NOT EXISTS starry_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_push_subscriptions_user
  ON starry_push_subscriptions(userId);

CREATE TABLE IF NOT EXISTS starry_push_vapid (
  id INTEGER PRIMARY KEY CHECK(id=1),
  publicJwk TEXT NOT NULL,
  privateJwk TEXT NOT NULL,
  publicKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
