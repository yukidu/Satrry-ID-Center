"""Automated iOS storefront partitioning validation; uses only an in-memory SQLite DB."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1] / "migrations"
conn = sqlite3.connect(":memory:")
conn.executescript((ROOT / "0002_ios_separate_apple_developer_accounts.sql").read_text())
seed = (ROOT / "0003_ios_release_catalog_seed.sql").read_text()
conn.executescript(seed)
conn.executescript(seed)
assert conn.execute("SELECT COUNT(*) FROM ios_starry_release_links").fetchone()[0] == 6
assert conn.execute("SELECT COUNT(*) FROM ios_hglobal_release_links").fetchone()[0] == 2
assert conn.execute("SELECT app_name FROM ios_hglobal_release_links WHERE app_key='central-id'").fetchone()[0] == "中央會員 ID 入口"
assert conn.execute("SELECT app_name FROM ios_starry_release_links WHERE app_key='echostars'").fetchone()[0] == "繁星回聲"

def must_fail(sql):
    try:
        conn.execute(sql)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("Should have rejected: " + sql)

must_fail("INSERT INTO ios_starry_release_links(app_key,app_name,developer_account_slug,created_at_ms,updated_at_ms) VALUES('wrong','wrong','hglobal1985',1,1)")
must_fail("INSERT INTO ios_hglobal_release_links(app_key,app_name,developer_account_slug,created_at_ms,updated_at_ms) VALUES('wrong','wrong','starry.phd',1,1)")
must_fail("UPDATE ios_hglobal_release_links SET listing_status='published' WHERE app_key='central-id'")
must_fail("UPDATE ios_starry_release_links SET app_store_public_url='http://apps.apple.com/invalid' WHERE app_key='echostars'")
assert conn.execute("SELECT COUNT(*) FROM ios_starry_release_links WHERE apple_team_id IS NOT NULL OR bundle_id IS NOT NULL OR app_store_public_url IS NOT NULL OR app_store_connect_url IS NOT NULL").fetchone()[0] == 0
assert conn.execute("SELECT COUNT(*) FROM ios_hglobal_release_links WHERE apple_team_id IS NOT NULL OR bundle_id IS NOT NULL OR app_store_public_url IS NOT NULL OR app_store_connect_url IS NOT NULL").fetchone()[0] == 0
assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
print("PASS: separate Starry/HGlobal iOS app listing catalogs, 6+2 planned apps, no fabricated links, ownership constraints, safe publication gate")
