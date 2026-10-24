#!/usr/bin/env python3
"""Central-only opaque service-token schema / constraints; no Cloudflare connection."""
import hashlib
import sqlite3
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript((BASE/"migrations/0004_central_google_portal_identity.sql").read_text())
db.executescript((BASE/"migrations/0006_private_cross_app_tokens.sql").read_text())
user="central-test-identity"
db.execute("INSERT INTO identity_users(user_id,created_at_ms,updated_at_ms,membership_status) VALUES(?,1,1,'approved')",(user,))
db.execute("INSERT INTO central_brand_authorizations(user_id,brand_scope,granted_at_ms,authorization_reference) VALUES(?,'starry',1000,'audited-test-event')",(user,))
session_hash="d"*64
db.execute("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES(?, ?,'central',100,999999,1)",(session_hash,user))
token="A"*43
digest=hashlib.sha256(token.encode()).hexdigest()
db.execute("""INSERT INTO central_service_access_tokens(
 token_sha256,user_id,brand_scope,audience,issued_auth_version,
 issued_at_ms,expires_at_ms,issuer_reference,source_session_hash)
 VALUES(?,?,'starry','starry-battery',1,1000,901000,'central-test-issuer',?)""",(digest,user,session_hash))
read=db.execute("""SELECT t.user_id FROM central_service_access_tokens t
 JOIN identity_users u ON u.user_id=t.user_id
 JOIN central_brand_authorizations g ON g.user_id=t.user_id
 JOIN auth_sessions s ON s.session_id_hash=t.source_session_hash
 WHERE t.token_sha256=? AND t.expires_at_ms>899999
 AND s.revoked_at_ms IS NULL AND g.revoked_at_ms IS NULL""",(digest,)).fetchone()
assert read==(user,),read
def forbidden(sql,values):
 try:
  db.execute(sql,values)
 except sqlite3.IntegrityError:
  return
 raise AssertionError("unsafe central token data accepted")
forbidden("""INSERT INTO central_service_access_tokens
 (token_sha256,user_id,brand_scope,audience,issued_auth_version,issued_at_ms,expires_at_ms,issuer_reference)
 VALUES(?,?,'starry','starry-battery',1,1000,901001,'unsafe-too-long')""",("a"*64,user))
forbidden("""INSERT INTO central_service_access_tokens
 (token_sha256,user_id,brand_scope,audience,issued_auth_version,issued_at_ms,expires_at_ms,issuer_reference)
 VALUES(?,?,'hglobal','starry-battery',1,1000,1100,'unsafe-brand')""",("b"*64,user))
forbidden("""INSERT INTO central_service_access_tokens
 (token_sha256,user_id,brand_scope,audience,issued_auth_version,issued_at_ms,expires_at_ms,issuer_reference)
 VALUES(?,?,'starry','other-app',1,1000,1100,'unsafe-audience')""",("c"*64,user))
forbidden("""INSERT INTO central_service_access_tokens
 (token_sha256,user_id,brand_scope,audience,issued_auth_version,issued_at_ms,expires_at_ms,issuer_reference)
 VALUES(?,?,'starry','starry-battery',1,1000,1100,'unsafe-hash')""",("NOT_HEX_HASH",user))
forbidden("""INSERT INTO central_brand_authorizations
 (user_id,brand_scope,granted_at_ms,authorization_reference)
 VALUES(?,'hglobal',1000,'unsafe-grant')""",(user,))
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
print("Central-only introspection schema: valid token, 15-minute bound, brand/audience/hash constraints PASS")

# A revoked authenticated session immediately denies all its service tokens.
db.execute("UPDATE auth_sessions SET revoked_at_ms=2000 WHERE session_id_hash=?",(session_hash,))
assert db.execute("""SELECT t.user_id FROM central_service_access_tokens t JOIN auth_sessions s ON s.session_id_hash=t.source_session_hash WHERE t.token_sha256=? AND s.revoked_at_ms IS NULL""",(digest,)).fetchone() is None
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
print("Session-revoked opaque token rejected by D1 join: PASS")
