#!/usr/bin/env python3
"""Central-only short-lived token D1 constraints; no production resources."""
import hashlib
import sqlite3
from pathlib import Path
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for migration in ("0004_central_google_portal_identity.sql","0006_private_cross_app_tokens.sql"):
    db.executescript((root / "migrations" / migration).read_text())
user = "central-test-identity"
session_hash = "d" * 64
db.execute("INSERT INTO identity_users(user_id,created_at_ms,updated_at_ms,membership_status) VALUES(?,1,1,'approved')", (user,))
db.execute("INSERT INTO central_brand_authorizations(user_id,brand_scope,granted_at_ms,authorization_reference) VALUES(?,'starry',1000,'audited-test-event')", (user,))
db.execute("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES(?,?,'central',100,999999,1)", (session_hash,user))
columns = "token_sha256,user_id,source_session_hash,brand_scope,audience,issued_auth_version,issued_at_ms,expires_at_ms,issuer_reference"
def add(hash_value, brand, audience, expiry, parent=session_hash):
    db.execute(f"INSERT INTO central_service_access_tokens({columns}) VALUES(?,?,?,?,?,1,1000,?,'audited-issuer')",
               (hash_value,user,parent,brand,audience,expiry))
digest = hashlib.sha256(("A"*43).encode()).hexdigest()
add(digest,"starry","starry-battery",901000)
active_sql = """SELECT t.user_id FROM central_service_access_tokens t
JOIN auth_sessions s ON s.session_id_hash=t.source_session_hash AND s.user_id=t.user_id
JOIN central_brand_authorizations g ON g.user_id=t.user_id
WHERE t.token_sha256=? AND t.expires_at_ms>899999
AND s.revoked_at_ms IS NULL AND s.brand_scope='central'
AND g.revoked_at_ms IS NULL"""
assert db.execute(active_sql,(digest,)).fetchone()==(user,)
def rejected(label, callback):
    try:
        callback()
    except sqlite3.IntegrityError:
        return
    raise AssertionError("unsafe schema accepted "+label)
rejected("expiry longer than 15 minutes", lambda: add("a"*64,"starry","starry-battery",901001))
rejected("HGlobal token brand", lambda: add("b"*64,"hglobal","starry-battery",1100))
rejected("foreign audience", lambda: add("c"*64,"starry","somewhere-else",1100))
rejected("non hex hash",lambda: add("NOT_HEX_HASH","starry","starry-battery",1100))
rejected("missing bound session", lambda: add("e"*64,"starry","starry-battery",1100,None))
rejected("unknown bound session", lambda: add("f"*64,"starry","starry-battery",1100,"q"*64))
rejected("HGlobal brand grant",lambda:db.execute("INSERT INTO central_brand_authorizations(user_id,brand_scope,granted_at_ms,authorization_reference) VALUES(?,'hglobal',1000,'invalid-brand-grant')",(user,)))
db.execute("UPDATE auth_sessions SET revoked_at_ms=2000 WHERE session_id_hash=?",(session_hash,))
assert db.execute(active_sql,(digest,)).fetchone() is None
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
print("PASS: Central D1 session-bound tokens, per-session logout, brand/audience/TTL/hash/FK constraints")
