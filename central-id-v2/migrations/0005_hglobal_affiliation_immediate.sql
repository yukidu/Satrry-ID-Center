-- 0005: H-Global immediate system/center affiliation, 2026-10-24.
-- Run in an isolated clone, verify current production schema, then apply only after acceptance.
-- Center edits need no review; formal rank grant remains a separate review process.
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-003','飛登',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-004','南京',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-005','自強',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-006','明星',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-007','民權',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-008','中山',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-009','桃園',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-010','新竹',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-011','台中',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-012','彰化',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-013','員林',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-014','嘉義',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-015','台南',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-016','高雄',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-017','屏東',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-018','中國',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-019','香港',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-020','澳門',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-021','日本',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-022','韓國',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-023','馬來西亞',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-024','泰國',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-025','越南',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-026','印尼',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-027','美國',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-028','澳洲',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-029','加拿大',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-030','英國',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-031','義大利',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;
INSERT INTO education_centers(center_code,display_name,is_active) VALUES('EC-032','其他',1)
ON CONFLICT(center_code) DO UPDATE SET display_name=excluded.display_name,is_active=1;

-- In existing production snapshot there are no admin_role_grants rows/table.
-- This grant store is introduced before automatic removal of CENTER-SCOPED roles;
-- protected global highest-admin grants have NULL scope_key and are not revoked.
CREATE TABLE IF NOT EXISTS admin_role_grants (
 grant_id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES identity_users(user_id) ON DELETE RESTRICT,
 role_code TEXT NOT NULL,
 scope_key TEXT,
 granted_at_ms INTEGER NOT NULL,
 revoked_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_grants_user_active ON admin_role_grants(user_id,revoked_at_ms);
CREATE TABLE IF NOT EXISTS member_center_change_events (
 event_id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES identity_users(user_id),
 former_system TEXT NOT NULL,
 new_system TEXT NOT NULL,
 former_center_code TEXT,
 new_center_code TEXT,
 occurred_at_ms INTEGER NOT NULL
);
-- SQLite trigger runs in the SAME transaction as profile UPDATE: old session cannot retain prior center roles.
CREATE TRIGGER IF NOT EXISTS trg_hglobal_affiliation_change
AFTER UPDATE OF membership_system,center_code ON member_profiles
WHEN OLD.membership_system IS NOT NEW.membership_system OR OLD.center_code IS NOT NEW.center_code
BEGIN
  INSERT INTO member_center_change_events(user_id,former_system,new_system,former_center_code,new_center_code,occurred_at_ms)
  VALUES (NEW.user_id,OLD.membership_system,NEW.membership_system,OLD.center_code,NEW.center_code,CAST(strftime('%s','now') AS INTEGER)*1000);
  UPDATE admin_role_grants SET revoked_at_ms=CAST(strftime('%s','now') AS INTEGER)*1000
    WHERE user_id=NEW.user_id AND scope_key IS NOT NULL AND revoked_at_ms IS NULL;
  UPDATE identity_users SET auth_version=auth_version+1,updated_at_ms=CAST(strftime('%s','now') AS INTEGER)*1000
    WHERE user_id=NEW.user_id;
  UPDATE auth_sessions SET revoked_at_ms=CAST(strftime('%s','now') AS INTEGER)*1000
    WHERE user_id=NEW.user_id AND revoked_at_ms IS NULL;
END;
