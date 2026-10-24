#!/usr/bin/env python3
"""Synthetic SQLite acceptance for additive Central first-party identity API."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript((ROOT / "migrations/0004_central_google_portal_identity.sql").read_text())
db.executescript((ROOT / "migrations/0008_first_party_identity_api.sql").read_text())
now = 1_800_000_000_000
db.execute("INSERT INTO identity_users(user_id,created_at_ms,updated_at_ms) VALUES(?,?,?)",
           ("api-test-user", now, now))
db.execute("INSERT INTO central_app_login_challenges(nonce_sha256,app_id,request_origin,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)",
           ("a" * 64, "hglobal-web", "https://id.hglobal1985.com", now, now + 600000))
db.execute("INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)",
           ("b" * 64, "api-test-user", "hglobal-web", "a" * 64, 1, now, now + 300000))
assert db.execute("SELECT count(*) FROM central_app_access_tokens").fetchone()[0] == 1
assert not db.execute("PRAGMA foreign_key_check").fetchall()
cases = [
 ("INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)",
  ("c" * 64, "missing-user", "hglobal-web", "a" * 64, 1, now, now + 1000)),
 ("INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)",
  ("d" * 64, "api-test-user", "unregistered", "a" * 64, 1, now, now + 1000)),
 ("INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)",
  ("e" * 64, "api-test-user", "hglobal-web", "f" * 64, 1, now, now + 1000)),
 ("INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?)",
  ("f" * 64, "api-test-user", "hglobal-web", "a" * 64, 1, now, now + 300001)),
 ("INSERT INTO central_app_login_challenges(nonce_sha256,app_id,request_origin,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)",
  ("c" * 64, "hglobal-web", "https://attacker.example", now, now + 3000)),
 ("INSERT INTO central_app_login_challenges(nonce_sha256,app_id,request_origin,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)",
  ("d" * 64, "hglobal-web", "https://id.hglobal1985.com", now, now + 600001)),
]
for sql, values in cases:
    try:
        with db:
            db.execute(sql, values)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f"unsafe identity API row was accepted: {values}")
assert not db.execute("PRAGMA foreign_key_check").fetchall()
print("PASS: 0004 + 0008 synthetic D1 schema, foreign keys and first-party TTL/app allowlist constraints")
