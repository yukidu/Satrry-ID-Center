#!/usr/bin/env python3
"""Test official 30 centers and atomic role/session invalidation against real SQLite."""
import sqlite3
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript((BASE/"migrations/0004_central_google_portal_identity.sql").read_text())
db.executescript((BASE/"migrations/0005_hglobal_affiliation_immediate.sql").read_text())
rows=db.execute("SELECT center_code,display_name FROM education_centers ORDER BY center_code").fetchall()
assert len(rows)==30, rows
assert rows[0]==("EC-003","飛登")
assert rows[-1]==("EC-032","其他")
assert "EC-001" not in [r[0] for r in rows]
db.execute("INSERT INTO identity_users (user_id,created_at_ms,updated_at_ms) VALUES ('test-id',1,1)")
db.execute("INSERT INTO member_profiles (user_id,display_name,updated_at_ms) VALUES ('test-id','Test',1)")
db.execute("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES('token','test-id','central',1,9999999999999,1)")
db.execute("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('center','test-id','center_reviewer','EC-004',1)")
db.execute("INSERT INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('super_admin','test-id',1,'test-approval-only')")
db.execute("UPDATE member_profiles SET membership_system='hglobal',center_code='EC-003',record_version=record_version+1 WHERE user_id='test-id'")
assert db.execute("SELECT auth_version FROM identity_users WHERE user_id='test-id'").fetchone()[0]==2
assert db.execute("SELECT revoked_at_ms FROM auth_sessions WHERE session_id_hash='token'").fetchone()[0] is not None
assert db.execute("SELECT revoked_at_ms FROM admin_role_grants WHERE grant_id='center'").fetchone()[0] is not None
assert db.execute("SELECT user_id FROM protected_admin_principals WHERE role_code='super_admin'").fetchone()[0]=='test-id'
events=db.execute("SELECT former_system,new_system,new_center_code FROM member_center_change_events").fetchall()
assert events==[("none","hglobal","EC-003")],events
db.execute("UPDATE member_profiles SET motto='Test' WHERE user_id='test-id'")
assert db.execute("SELECT COUNT(*) FROM member_center_change_events").fetchone()[0]==1

# A second real center switch must revoke NEW scoped grants and newly issued sessions,
# without touching protected global grants or previously revoked records.
db.execute("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES('fresh','test-id','central',2,9999999999999,2)")
db.execute("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('new-center','test-id','center_reviewer','EC-003',2)")
db.execute("UPDATE member_profiles SET center_code='EC-004',record_version=record_version+1 WHERE user_id='test-id'")
assert db.execute("SELECT auth_version FROM identity_users WHERE user_id='test-id'").fetchone()[0]==3
assert db.execute("SELECT revoked_at_ms FROM auth_sessions WHERE session_id_hash='fresh'").fetchone()[0] is not None
assert db.execute("SELECT revoked_at_ms FROM admin_role_grants WHERE grant_id='new-center'").fetchone()[0] is not None
assert db.execute("SELECT user_id FROM protected_admin_principals WHERE role_code='super_admin'").fetchone()[0]=='test-id'
assert db.execute("SELECT COUNT(*) FROM member_center_change_events WHERE user_id='test-id'").fetchone()[0]==2

# Idempotent unchanged value and unrelated profile updates must not revoke sessions again.
db.execute("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES('still-active','test-id','central',3,9999999999999,3)")
db.execute("UPDATE member_profiles SET center_code='EC-004',record_version=record_version+1 WHERE user_id='test-id'")
db.execute("UPDATE member_profiles SET motto='Unrelated setting' WHERE user_id='test-id'")
assert db.execute("SELECT COUNT(*) FROM member_center_change_events WHERE user_id='test-id'").fetchone()[0]==2
assert db.execute("SELECT revoked_at_ms FROM auth_sessions WHERE session_id_hash='still-active'").fetchone()[0] is None

# SQL CHECK guards invalid system/center combinations independently of browser code.
import sqlite3 as _sqlite3
try:
    db.execute("UPDATE member_profiles SET membership_system='none' WHERE user_id='test-id'")
    raise AssertionError("invalid center/system update unexpectedly succeeded")
except _sqlite3.IntegrityError:
    pass
assert db.execute("SELECT membership_system,center_code FROM member_profiles WHERE user_id='test-id'").fetchone()==("hglobal","EC-004")
assert db.execute("SELECT COUNT(*) FROM member_center_change_events WHERE user_id='test-id'").fetchone()[0]==2


# A center role row can NEVER grant an owner-only privilege or unscoped role.
def rejected(statement):
    try:
        db.execute(statement)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("unsafe privilege mutation unexpectedly accepted: "+statement)

rejected("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('forged','test-id','super_admin','EC-003',4)")
rejected("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('forged-secretary','test-id','hglobal_secretary','EC-003',4)")
rejected("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('unscoped','test-id','center_reviewer',NULL,4)")
assert db.execute("SELECT COUNT(*) FROM admin_role_grants WHERE grant_id LIKE 'forged%' OR grant_id='unscoped'").fetchone()[0]==0

# Exactly the two named principal roles may exist, each bound to a distinct user.
db.execute("INSERT INTO identity_users(user_id,created_at_ms,updated_at_ms) VALUES('test-other',1,1)")
db.execute("INSERT INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('hglobal_secretary','test-other',2,'test-approval-two')")
rejected("INSERT INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('third_admin','test-other',3,'test-approval-third')")
rejected("INSERT INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('hglobal_secretary','test-id',3,'test-approval-third')")
rejected("INSERT OR REPLACE INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('super_admin','test-other',4,'test-override-attempt')")
rejected("INSERT OR REPLACE INTO protected_admin_principals(role_code,user_id,bound_at_ms,authorization_reference) VALUES('hglobal_secretary','test-id',4,'test-override-attempt')")
rejected("INSERT INTO admin_role_grants(grant_id,user_id,role_code,scope_key,granted_at_ms) VALUES('forged-case','test-id',' SUPER_ADMIN ','EC-003',4)")
rejected("UPDATE protected_admin_principals SET user_id='test-other' WHERE role_code='super_admin'")
rejected("DELETE FROM protected_admin_principals WHERE role_code='super_admin'")
assert db.execute("SELECT role_code,user_id FROM protected_admin_principals ORDER BY role_code").fetchall()==[
 ('hglobal_secretary','test-other'),('super_admin','test-id')]
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]

print("H-Global center catalog and atomic session/role revocation checks passed.")
